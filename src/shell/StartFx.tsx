// The start screen's background (V2.10.1 Q4 / .af2-start-fx): engineering glyphs (waveforms,
// components, boards, flow pieces) drifting slowly left to right in three depth layers. A canvas
// behind the form; nothing to read or click. With reduced motion it draws one still frame; it
// stops while the page is hidden. The glyph paths, layers and timing are V2's.
import { useEffect, useRef } from 'react';

/** Signal / component glyphs (V2 $d), drawn in --fx-line. */
const GLYPHS = [
  'M2 12h4l2-5 3 10 3-10 3 10 2-5h3', 'M2 12h8M10 5v14M14 5v14M14 12h8', 'M12 3v9M5 12h14M8 16h8M11 20h2', 'M2 12h6M8 6l8 6-8 6zM16 6v12M16 12h6',
  'M7 5h10v14H7zM3 8h4M3 12h4M3 16h4M17 8h4M17 12h4M17 16h4', 'M2 12h3a2 2 0 0 1 4 0a2 2 0 0 1 4 0a2 2 0 0 1 4 0h5', 'M2 17h4V7h5v10h5V7h4',
  'M12 2v4M12 18v4M6 6h12v12H6zM9 10h6M9 14h6',
];
/** Architecture / flow glyphs (V2 bg), drawn in --fx-accent; 60 % of the glyphs come from here. */
const ACCENT_GLYPHS = [
  'M2 7h8v10H2zM14 7h8v10h-8zM10 12h4', 'M2 12h20M6 12V7M12 12v5M18 12V7', 'M9 2h6v5H9zM12 7v4M4 11h16M4 11v4M12 11v4M20 11v4M2 15h4v5H2zM10 15h4v5h-4zM18 15h4v5h-4z',
  'M3 5h10M7 10h12M5 15h8M11 20h9', 'M2 18h3l3-10h14M2 21h8l3-6h9', 'M8 2h8a3 3 0 0 1 0 6H8a3 3 0 0 1 0-6zM12 8v4M12 12l5 4-5 4-5-4z',
  'M3 8h18v8H3zM6 8v8M9 8v8M12 8v8M15 8v8M18 8v8', 'M3 4h18v13H3zM6 7h12v7H6zM10 17v3M7 20h10',
  'M3 3h4M10 3h4M17 3h4M21 3v4M21 10v4M21 17v4M3 21h4M10 21h4M17 21h4M3 3v4M3 10v4M3 17v4', 'M5 5h4v4H5zM15 5h4v4h-4zM10 15h4v4h-4zM9 7h6M7 9l5 6M17 9l-5 6',
  'M3 12h15M14 7l5 5-5 5',
];
/** Depth layers (V2 ku): share of the glyphs, scale, speed range px/s, opacity. */
const LAYERS = [
  { n: 0.45, s: 0.85, v: [5, 8], a: 0.5 },
  { n: 0.35, s: 1.25, v: [9, 13], a: 0.78 },
  { n: 0.2, s: 1.75, v: [14, 19], a: 1 },
] as const;
const FADE = 80;           // px over which a glyph fades in at the left edge and out at the right
const FRAME_MS = 32;       // about 30 frames a second, as V2
const DENSITY = 30000;     // one glyph per this many px² of the board

interface Glyph { l: number; k: number; x: number; y: number; v: number; ph: number; amp: number }

/** Each glyph pre-drawn once per layer (V2 X4), at the device pixel ratio. */
function sprites(dpr: number, line: string, accent: string): HTMLCanvasElement[][] {
  const all = [...GLYPHS.map(p => [p, line]), ...ACCENT_GLYPHS.map(p => [p, accent])];
  return LAYERS.map(layer => all.map(([path, colour]) => {
    const size = Math.ceil((24 * layer.s + 4) * dpr), c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    if (g) {
      g.scale(dpr * layer.s, dpr * layer.s);
      g.translate(2 / layer.s, 2 / layer.s);
      g.lineWidth = 1.35 / layer.s;
      g.lineCap = g.lineJoin = 'round';
      g.strokeStyle = colour;
      g.stroke(new Path2D(path));
    }
    return c;
  }));
}

export function StartFx() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current, ctx = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !ctx) return undefined;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const css = getComputedStyle(canvas);
    const line = css.getPropertyValue('--fx-line').trim() || 'gray', accent = css.getPropertyValue('--fx-accent').trim() || 'gray';
    let w = 0, h = 0, dpr = 1, art: HTMLCanvasElement[][] | null = null, glyphs: Glyph[] = [], raf = 0, last = 0;
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const kind = () => (Math.random() < 0.6 ? GLYPHS.length + Math.floor(Math.random() * ACCENT_GLYPHS.length) : Math.floor(Math.random() * GLYPHS.length));
    const make = (l: number, x?: number): Glyph => ({ l, k: kind(), x: x ?? rnd(0, w), y: rnd(0, h), v: rnd(LAYERS[l].v[0], LAYERS[l].v[1]), ph: rnd(0, 6.28), amp: rnd(4, 12) });
    const resize = () => {
      const r = canvas.getBoundingClientRect(), k = Math.min(2, devicePixelRatio || 1);
      w = r.width; h = r.height;
      canvas.width = Math.round(w * k); canvas.height = Math.round(h * k);
      if (k !== dpr || !art) { dpr = k; art = sprites(dpr, line, accent); }
      const total = Math.round((w * h) / DENSITY);
      LAYERS.forEach((layer, l) => {
        const want = Math.round(total * layer.n), mine = glyphs.filter(g => g.l === l);
        for (let i = mine.length; i < want; i++) glyphs.push(make(l));
        if (mine.length > want) { const drop = new Set(mine.slice(want)); glyphs = glyphs.filter(g => !drop.has(g)); }
      });
      glyphs.sort((a, b) => a.l - b.l);
    };
    const draw = (now: number) => {
      if (!still) raf = requestAnimationFrame(draw);
      if (last && now - last < FRAME_MS) return;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!art) return;
      for (const g of glyphs) {
        const layer = LAYERS[g.l], img = art[g.l][g.k], half = img.width / 2;
        g.x += g.v * dt; g.ph += dt * 0.45;
        if (g.x > w + 40) Object.assign(g, make(g.l, -40));
        const fade = Math.min(1, (g.x + 40) / FADE, (w + 40 - g.x) / FADE);
        if (fade <= 0) continue;
        ctx.globalAlpha = 0.6 * layer.a * fade;
        ctx.drawImage(img, g.x * dpr - half, (g.y + Math.sin(g.ph) * g.amp) * dpr - half);
      }
    };
    const restart = () => { cancelAnimationFrame(raf); last = 0; if (!document.hidden) raf = requestAnimationFrame(draw); };
    const ro = new ResizeObserver(() => { resize(); if (still) draw(0); });
    ro.observe(canvas);
    resize();
    restart();
    document.addEventListener('visibilitychange', restart);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', restart); };
  }, []);
  return <canvas ref={ref} className="af-start-fx" aria-hidden="true" />;
}
