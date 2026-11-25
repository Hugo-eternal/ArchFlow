// Fit an exported drawing onto a fixed page (slide / screen sizes), V2 pageExportDocument
// (L442 area): margin 3 % of the shorter side, scale up to 3×, centred.
import { h, toMarkup, SVG_NS } from '../render/vnode';
import type { SvgExport } from './svg';

export const PAGE_SIZES = ['2560x1440', '1600x900', '1920x1080', '1366x768', 'native'] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
/** V2 default: PowerPoint slide, 16:9 high resolution. */
export const DEFAULT_PAGE: PageSize = '2560x1440';
export const MAX_PAGE_SCALE = 3;

export interface PageExport { source: string; width: number; height: number; /** drawing scale on the page */ scale: number }

const fmt = (v: number) => String(Math.round(v * 1000) / 1000);

export function fitPage(exp: SvgExport, page: PageSize = DEFAULT_PAGE): PageExport {
  if (page === 'native') return { source: exp.source, width: exp.width, height: exp.height, scale: 1 };
  const [width, height] = page.split('x').map(Number);
  const [x, y, w, hh] = exp.viewBox;
  const margin = Math.round(Math.min(width, height) * 0.03);
  const scale = Math.min((width - margin * 2) / w, (height - margin * 2) / hh, MAX_PAGE_SCALE);
  const root = h('svg', { xmlns: SVG_NS, version: '1.1', width, height, viewBox: `0 0 ${width} ${height}` }, [
    exp.defs.length ? h('defs', {}, exp.defs) : null,
    exp.background ? h('rect', { x: 0, y: 0, width, height, fill: exp.background }) : null,
    h('g', { transform: `translate(${fmt((width - w * scale) / 2)},${fmt((height - hh * scale) / 2)}) scale(${fmt(scale)}) translate(${-x},${-y})` }, exp.content),
  ]);
  return { source: toMarkup(root), width, height, scale };
}
