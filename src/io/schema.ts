// Runtime validation of V3 project files (schemaVersion 3) — the one schema for every design
// type (plan §2). It accepts exactly the shapes in ./schema-types and nothing else: unknown
// keys are errors, so a typo in a hand-edited file is reported instead of silently dropped.
// Vendor editor documents (sequence / flowchart) are checked on their outer shape only.
//
// No dependencies: a few small combinators below. Each error carries a JSON path
// ("designs[0].data.blocks[3].ports[1].t") and a code the shell maps to a message.
import type { Block, BlockDiagram, Design, DesignType, FlowchartDoc, ProjectFile, ScheduleData, SequenceDoc } from './schema-types';
import { SCHEMA_VERSION } from './schema-types';
import { isValidId } from '../core/ids';
import { LIMITS } from '../model/types';

export const FILE_LIMITS = Object.freeze({
  bytes: 8_000_000,           // V2 L563
  designs: 100,
  customStyles: 50,
  name: 100,                  // project and design names
  short: 200,                 // ref, part number, port name, colours, fonts …
  junctions: 400,
  texts: 200,
  frames: 100,
  wirePresets: 50,
  route: 200,                 // points per manual route
  tasks: 100,
  links: 400,
  coordinate: 1_000_000,      // |x| / |y| (V2 validateDiagram)
  vendorBytes: 4_000_000,     // a sequence / flowchart document as JSON
});

export type ErrorCode =
  | 'type' | 'required' | 'unknown-key' | 'enum' | 'range' | 'too-long' | 'too-many' | 'too-few'
  | 'id' | 'duplicate-id' | 'missing-ref' | 'version' | 'too-large';
export interface SchemaError { path: string; code: ErrorCode; detail?: string }
export type Result<T> = { ok: true; value: T } | { ok: false; errors: SchemaError[] };

/** A validator: reports errors for `v` at `path`. */
export type Schema<T = unknown> = ((v: unknown, path: string, out: SchemaError[]) => void) & { readonly __type?: T };

const MAX_ERRORS = 50;
const push = (out: SchemaError[], path: string, code: ErrorCode, detail?: string) => {
  if (out.length < MAX_ERRORS) out.push(detail === undefined ? { path, code } : { path, code, detail });
};
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const join = (path: string, key: string | number) => (typeof key === 'number' ? `${path}[${key}]` : path ? `${path}.${key}` : key);

// ------------------------------------------------------------------ combinators

export const str = (max: number = FILE_LIMITS.short): Schema<string> => (v, p, out) => {
  if (typeof v !== 'string') return push(out, p, 'type', 'string');
  if (v.length > max) push(out, p, 'too-long', String(max));
};
export const num = (o: { min?: number; max?: number; int?: boolean } = {}): Schema<number> => (v, p, out) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return push(out, p, 'type', 'number');
  if (o.int && !Number.isInteger(v)) return push(out, p, 'type', 'integer');
  if ((o.min !== undefined && v < o.min) || (o.max !== undefined && v > o.max)) push(out, p, 'range', `${o.min ?? '-∞'}..${o.max ?? '∞'}`);
};
export const bool: Schema<boolean> = (v, p, out) => { if (typeof v !== 'boolean') push(out, p, 'type', 'boolean'); };
export const oneOf = <T extends string | number>(...values: T[]): Schema<T> => (v, p, out) => {
  if (!values.includes(v as T)) push(out, p, 'enum', values.join('|'));
};
export const id: Schema<string> = (v, p, out) => { if (!isValidId(v)) push(out, p, 'id'); };
export const arr = <T>(item: Schema<T>, max: number, min = 0): Schema<T[]> => (v, p, out) => {
  if (!Array.isArray(v)) return push(out, p, 'type', 'array');
  if (v.length > max) return push(out, p, 'too-many', String(max));
  if (v.length < min) return push(out, p, 'too-few', String(min));
  v.forEach((x, i) => item(x, join(p, i), out));
};
/** Optional key marker for obj(). */
export const opt = <T>(s: Schema<T>) => Object.assign(((v, p, out) => s(v, p, out)) as Schema<T | undefined>, { optional: true as const });
type Shape = Record<string, Schema & { optional?: true }>;
export const obj = <T>(shape: Shape, o: { extra?: boolean } = {}): Schema<T> => (v, p, out) => {
  if (!isObj(v)) return push(out, p, 'type', 'object');
  for (const [k, s] of Object.entries(shape)) {
    if (!(k in v) || v[k] === undefined) { if (!s.optional) push(out, join(p, k), 'required'); continue; }
    s(v[k], join(p, k), out);
  }
  if (!o.extra) for (const k of Object.keys(v)) if (!(k in shape)) push(out, join(p, k), 'unknown-key');
};
/** Pick the schema by a discriminating key. */
export const tagged = (key: string, cases: Record<string, Schema>): Schema => (v, p, out) => {
  if (!isObj(v)) return push(out, p, 'type', 'object');
  const s = cases[String(v[key])];
  if (!s) return push(out, join(p, key), 'enum', Object.keys(cases).join('|'));
  s(v, p, out);
};
export const union = (...alts: Schema[]): Schema => (v, p, out) => {
  let best: SchemaError[] | null = null;
  for (const s of alts) { const e: SchemaError[] = []; s(v, p, e); if (!e.length) return; if (!best || e.length < best.length) best = e; }
  for (const e of best ?? []) push(out, e.path, e.code, e.detail);
};
/** Any JSON object of at most `bytes` when serialised. */
export const jsonObject = (bytes: number): Schema<Record<string, unknown>> => (v, p, out) => {
  if (!isObj(v)) return push(out, p, 'type', 'object');
  let size = 0;
  try { size = JSON.stringify(v).length; } catch { return push(out, p, 'type', 'json'); }
  if (size > bytes) push(out, p, 'too-large', String(bytes));
};

// ------------------------------------------------------------------ shapes

const coord = num({ min: -FILE_LIMITS.coordinate, max: FILE_LIMITS.coordinate });
const extent = num({ min: 0, max: FILE_LIMITS.coordinate });
const point = obj({ x: coord, y: coord });
const text = str(LIMITS.text);
const unit = oneOf('A', 'mA', 'uA');
const portLabel = oneOf('inside', 'outside', 'hidden');

const theme = obj({
  latinFont: str(), cjkFont: str(),
  title: num({ min: 0, max: 400 }), subtitle: num({ min: 0, max: 400 }), label: num({ min: 0, max: 400 }), metric: num({ min: 0, max: 400 }),
});
const blockStyle = obj({
  fill: opt(str()), border: opt(str()), accent: opt(str()), text: opt(str()), subtitle: opt(str()),
  titleSize: opt(num({ min: 0, max: 400 })), color: opt(str()), name: opt(str(FILE_LIMITS.name)),
});
const lineFormat = obj({ color: str(), width: num({ min: 0, max: 100 }), dash: str(), arrow: bool, arrowSize: opt(num({ min: 0, max: 100 })), bothEnds: opt(bool) });
const metric = obj({ value: str(), show: bool, unit: opt(unit) });

const port = obj({
  id, name: str(), side: oneOf('l', 'r', 't', 'b'), t: num({ min: 0, max: 1 }), type: str(), label: portLabel, locked: bool,
  pin: opt(num({ min: 0, max: 10_000, int: true })), end: opt(oneOf('l', 'r')),
});
const block = obj<Block>({
  id, x: coord, y: coord, w: extent, h: extent,
  title: text, subtitle: text, partNumber: str(), ref: str(),
  ports: arr(port, LIMITS.portsPerBlock),
  style: blockStyle,
  titleAlign: opt(oneOf('top-left', 'top-center', 'top-right', 'center-left', 'center-center', 'center-right')),
  font: opt(obj({ subtitle: opt(num({ min: 0, max: 400 })), label: opt(num({ min: 0, max: 400 })), metric: opt(num({ min: 0, max: 400 })) })),
  sizing: oneOf('auto', 'free'), size: opt(oneOf('S', 'M', 'L')), showTitle: bool, locked: bool, role: opt(str()),
  metrics: obj({ voltage: opt(metric), current: opt(metric), power: opt(metric), efficiency: opt(metric) }),
  rails: opt(arr(str(10), 4)),
  part: opt(obj({ kind: str(), rot: oneOf(0, 90, 180, 270), size: oneOf('S', 'M', 'L') })),
  connector: opt(obj({
    kind: str(), side: oneOf('l', 'r', 'both'), pins: arr(str(), 1000), only: bool, mpn: str(),
    visibleRows: arr(num({ min: 0, max: 10_000, int: true }), 1000), hiddenRows: num({ min: 0, max: 10_000, int: true }),
  })),
});
const wireEnd = union(obj({ block: id, port: id }), obj({ junction: id }));
const wire = obj({
  id, a: wireEnd, b: wireEnd, name: str(), kind: str(), line: lineFormat,
  route: opt(arr(point, FILE_LIMITS.route)), locked: bool,
  routing: opt(oneOf('auto', 'manual')), waypoints: opt(arr(point, FILE_LIMITS.route)), labelOffset: opt(point),
  electrical: opt(obj({ voltage: str(), current: str(), unit: opt(unit), show: bool })),
  label: opt(obj({ size: opt(num({ min: 0, max: 400 })), preset: opt(str()), mark: opt(obj({ x: coord, y: coord, angle: num({ min: -360, max: 360 }) })) })),
});
const junction = obj({ id, x: coord, y: coord, name: str() });
const textBox = obj({
  id, text, x: coord, y: coord, w: extent, size: num({ min: 1, max: 400 }), color: str(), bold: bool, italic: bool,
  align: oneOf('left', 'center', 'right'), background: str(),
});
const frame = obj({ id, title: str(), x: coord, y: coord, w: extent, h: extent, style: str(), color: str() });
const group = obj({ id, name: str(FILE_LIMITS.name), members: arr(id, LIMITS.blocks), bounds: obj({ x: coord, y: coord, w: extent, h: extent }) });

export const blockDiagramSchema: Schema<BlockDiagram> = obj<BlockDiagram>({
  view: oneOf('function', 'power'),
  blocks: arr(block, LIMITS.blocks), wires: arr(wire, LIMITS.wires), junctions: arr(junction, FILE_LIMITS.junctions),
  texts: arr(textBox, FILE_LIMITS.texts), frames: arr(frame, FILE_LIMITS.frames),
  theme: opt(theme),
  grid: obj({ size: num({ min: 5, max: 40, int: true }), show: bool, snap: bool }),
  portLabels: opt(portLabel), wireDefaults: opt(lineFormat), wirePresets: arr(lineFormat, FILE_LIMITS.wirePresets),
  presentationClean: bool,
  groups: opt(arr(group, FILE_LIMITS.frames)),
});

const date = (v: unknown, p: string, out: SchemaError[]) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v + 'T00:00:00Z'))) push(out, p, 'type', 'date');
};
const task = obj({
  id, title: text, ref: str(), note: text, side: oneOf('top', 'bottom'),
  time: tagged('type', { none: obj({ type: oneOf('none') }), range: obj({ type: oneOf('range'), start: date, end: date }), deadline: obj({ type: oneOf('deadline'), date }) }),
  status: oneOf('todo', 'doing', 'done'), milestone: bool,
  offset: obj({ card: point, axis: point }), branchColor: opt(str()),
});
const link = obj({
  id, from: id, to: id,
  days: tagged('mode', { auto: obj({ mode: oneOf('auto') }), manual: obj({ mode: oneOf('manual'), value: num({ min: 0, max: 100_000, int: true }) }) }),
  fromDate: opt(oneOf('start', 'end')), toDate: opt(oneOf('start', 'end')),
});
export const scheduleSchema: Schema<ScheduleData> = obj<ScheduleData>({
  tasks: arr(task, FILE_LIMITS.tasks), links: arr(link, FILE_LIMITS.links), texts: arr(textBox, FILE_LIMITS.texts),
  rules: obj({ endpoint: oneOf('start', 'end'), count: oneOf('difference', 'inclusive') }),
  appearance: jsonObject(200_000), theme: opt(theme),
  snap: obj({ enabled: bool, range: num({ min: 0, max: 1000 }) }),
});

const vendorDoc = <T>(shape: Shape): Schema<T> => (v, p, out) => {
  obj<T>(shape, { extra: true })(v, p, out);
  jsonObject(FILE_LIMITS.vendorBytes)(v, p, out);
};
export const sequenceSchema: Schema<SequenceDoc> = vendorDoc({ name: str(FILE_LIMITS.name), tk: opt(str()), rails: arr((() => {}) as Schema, 10_000) });
export const flowchartSchema: Schema<FlowchartDoc> = vendorDoc({
  title: str(FILE_LIMITS.name), lanes: arr((() => {}) as Schema, 10_000), nodes: arr((() => {}) as Schema, 10_000), edges: arr((() => {}) as Schema, 10_000),
});

/** Data schema of each design type (design modules expose the same object as `schema`). */
export const DATA_SCHEMAS: Record<DesignType, Schema> = {
  function: blockDiagramSchema, schedule: scheduleSchema, sequence: sequenceSchema, flowchart: flowchartSchema,
};

const camera = obj({ x: coord, y: coord, z: num({ min: 0.01, max: 10 }) });
const design: Schema<Design> = (v, p, out) => {
  if (!isObj(v)) return push(out, p, 'type', 'object');
  const data = DATA_SCHEMAS[v.type as DesignType];
  if (!data) return push(out, join(p, 'type'), 'enum', Object.keys(DATA_SCHEMAS).join('|'));
  obj({ id, name: str(FILE_LIMITS.name), type: str(), camera, data })(v, p, out);
};

const projectShape = obj<ProjectFile>({
  schemaVersion: oneOf(SCHEMA_VERSION), app: str(), locale: oneOf('zh-Hant', 'en'),
  project: obj({ name: str(FILE_LIMITS.name) }), activeDesignId: id,
  customStyles: arr(blockStyle, FILE_LIMITS.customStyles),
  designs: arr(design, FILE_LIMITS.designs, 1),
});

// ------------------------------------------------------------------ references

function unique(items: { id?: unknown }[], path: string, out: SchemaError[], seen = new Set<unknown>()) {
  items.forEach((it, i) => { if (seen.has(it.id)) push(out, join(join(path, i), 'id'), 'duplicate-id', String(it.id)); seen.add(it.id); });
  return seen;
}

function blockRefs(d: BlockDiagram, p: string, out: SchemaError[]) {
  // ids share one namespace per diagram (they become DOM / SVG ids)
  const seen = unique(d.blocks, join(p, 'blocks'), out);
  unique(d.wires, join(p, 'wires'), out, seen);
  unique(d.junctions, join(p, 'junctions'), out, seen);
  unique(d.texts, join(p, 'texts'), out, seen);
  unique(d.frames, join(p, 'frames'), out, seen);
  unique(d.groups ?? [], join(p, 'groups'), out, seen);
  const ports = new Map(d.blocks.map(b => [b.id, new Set(b.ports.map(x => x.id))]));
  d.blocks.forEach((b, i) => unique(b.ports, join(join(join(p, 'blocks'), i), 'ports'), out));
  const junctions = new Set(d.junctions.map(j => j.id));
  d.wires.forEach((w, i) => {
    for (const k of ['a', 'b'] as const) {
      const e = w[k], at = join(join(join(p, 'wires'), i), k);
      const ok = 'junction' in e ? junctions.has(e.junction) : ports.get(e.block)?.has(e.port);
      if (!ok) push(out, at, 'missing-ref', 'junction' in e ? e.junction : `${e.block}/${e.port}`);
    }
  });
  (d.groups ?? []).forEach((g, i) => g.members.forEach((m, j) => {
    if (!ports.has(m)) push(out, join(join(join(join(p, 'groups'), i), 'members'), j), 'missing-ref', m);
  }));
}

function scheduleRefs(d: ScheduleData, p: string, out: SchemaError[]) {
  const seen = unique(d.tasks, join(p, 'tasks'), out);
  unique(d.links, join(p, 'links'), out, seen);
  unique(d.texts, join(p, 'texts'), out, seen);
  const tasks = new Set(d.tasks.map(t => t.id));
  d.links.forEach((l, i) => { for (const k of ['from', 'to'] as const) if (!tasks.has(l[k])) push(out, join(join(join(p, 'links'), i), k), 'missing-ref', l[k]); });
}

// ------------------------------------------------------------------ entry points

/** Validate one design type's data (used by design modules and tests). */
export function validateData(type: DesignType, data: unknown, path = 'data'): SchemaError[] {
  const out: SchemaError[] = [];
  const s = DATA_SCHEMAS[type];
  if (!s) return [{ path: 'type', code: 'enum' }];
  s(data, path, out);
  if (!out.length && type === 'function') blockRefs(data as BlockDiagram, path, out);
  if (!out.length && type === 'schedule') scheduleRefs(data as ScheduleData, path, out);
  return out;
}

/** Is this a V3 file at all? (false for V1 / V2 files and anything else) */
export const isV3 = (raw: unknown): boolean => isObj(raw) && raw.schemaVersion === SCHEMA_VERSION;

/** Validate a parsed project file. */
export function validateProject(raw: unknown): Result<ProjectFile> {
  const out: SchemaError[] = [];
  if (!isObj(raw)) return { ok: false, errors: [{ path: '', code: 'type', detail: 'object' }] };
  if (raw.schemaVersion !== SCHEMA_VERSION) return { ok: false, errors: [{ path: 'schemaVersion', code: 'version', detail: String(raw.schemaVersion ?? raw.version ?? '') }] };
  projectShape(raw, '', out);
  if (!out.length) {
    const file = raw as unknown as ProjectFile;
    unique(file.designs, 'designs', out);
    if (!file.designs.some(d => d.id === file.activeDesignId)) push(out, 'activeDesignId', 'missing-ref', file.activeDesignId);
    file.designs.forEach((d, i) => {
      const p = join(join('designs', i), 'data');
      if (d.type === 'function') blockRefs(d.data, p, out);
      else if (d.type === 'schedule') scheduleRefs(d.data, p, out);
    });
  }
  return out.length ? { ok: false, errors: out } : { ok: true, value: raw as unknown as ProjectFile };
}

/** Parse and validate file text; checks the 8 MB limit first. */
export function parseProject(textContent: string): Result<ProjectFile> {
  if (new TextEncoder().encode(textContent).length > FILE_LIMITS.bytes) return { ok: false, errors: [{ path: '', code: 'too-large', detail: String(FILE_LIMITS.bytes) }] };
  let raw: unknown;
  try { raw = JSON.parse(textContent); } catch { return { ok: false, errors: [{ path: '', code: 'type', detail: 'json' }] }; }
  return validateProject(raw);
}
