// Golden-test helpers (V3 step 2.8). A golden case is:
//   tests/golden/<type>/project.json   – a fixed V2.10.1 project (stable ids, committed)
//   tests/golden/<type>/__snapshots__/  – behaviour summary + structural SVG export
//
// The project file is created once from the built-in example (bootstrap) and never
// regenerated automatically; delete it on purpose to re-bootstrap.
// Snapshots use Vitest file snapshots: `npx vitest run tests/golden -u` updates them
// (only for deliberate behaviour changes — record them in CHANGELOG.md).
import fs from 'node:fs';
import path from 'node:path';

export const goldenDir = type => path.resolve('tests/golden', type);

/** Load tests/golden/<type>/project.json into the app through the real file input. */
export async function loadGolden(app, type, { bootstrap } = {}) {
  const file = path.join(goldenDir(type), 'project.json');
  if (!fs.existsSync(file)) {
    await app.createProject(type);
    if (bootstrap) await app.eval(bootstrap);
    const data = await app.eval(() => projectData());
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  }
  await app.createProject(type); // start from a project so the loader replaces it
  const onDialog = d => d.accept().catch(() => {});
  app.page.on('dialog', onDialog);
  await app.page.setInputFiles('#file', { name: 'golden.json', mimeType: 'application/json', buffer: fs.readFileSync(file) });
  await app.page.waitForTimeout(800);
  app.page.off('dialog', onDialog);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Structural form of an SVG export (plan §3.1 R2): one entry per element with its tag,
 * text and geometry/paint attributes; numbers rounded to 0.5 px so sub-pixel noise does
 * not matter. Runs in the browser (DOMParser).
 */
export function svgStructure(app, source) {
  return app.eval(src => {
    const doc = new DOMParser().parseFromString(src, 'image/svg+xml');
    const KEEP = ['x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'width', 'height', 'd', 'points', 'transform',
      'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'font-size', 'font-weight', 'text-anchor', 'marker-end', 'marker-start', 'viewBox', 'opacity'];
    const round = v => v.replace(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi, n => String(Math.round(Number(n) * 2) / 2));
    const out = [];
    const walk = (el, depth) => {
      const attrs = {};
      for (const k of KEEP) if (el.hasAttribute(k)) attrs[k] = round(el.getAttribute(k));
      const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue.trim()).join('');
      out.push({ depth, tag: el.tagName, ...(own ? { text: own } : {}), ...attrs });
      for (const c of el.children) walk(c, depth + 1);
    };
    walk(doc.documentElement, 0);
    return out;
  }, source);
}

/** Behaviour summary of the active block / schedule design: geometry and routed wires. */
export function diagramSummary(app) {
  return app.eval(() => {
    drawEdges();
    const r = v => Math.round(v * 2) / 2;
    return {
      blocks: model.nodes.map(n => { const s = size(n); return { id: n.id, title: n.title, x: r(n.x), y: r(n.y), w: r(s.w), h: r(s.h), ports: (n.ports || []).map(p => `${p.side}:${r(p.t * 1000) / 1000}:${p.name}`) }; }),
      wires: model.edges.map(e => ({ id: e.id, route: (routes.get(e.id)?.ps || []).map(p => `${r(p.x)},${r(p.y)}`).join(' ') })),
      junctions: model.junctions.map(j => ({ id: j.id, x: r(j.x), y: r(j.y) })),
      texts: (model.texts || []).map(t => ({ id: t.id, text: t.text, x: r(t.x), y: r(t.y) })),
    };
  });
}

export const json = v => JSON.stringify(v, null, 2) + '\n';

/** Paths whose value in `a` is missing or different in `b` (`b` may add fields). */
export function missingFrom(a, b, path = '') {
  if (a === null || typeof a !== 'object') return Object.is(a, b) ? [] : [path || '(root)'];
  if (b === null || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return [path || '(root)'];
  if (Array.isArray(a) && a.length !== b.length) return [path + '.length'];
  return Object.keys(a).flatMap(k => missingFrom(a[k], b[k], path + '.' + k));
}
