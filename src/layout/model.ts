// layout — the shape the organize engine works on (ported from V2 RC2–RC4, docs/v3-layout-callgraph.md)
// and the adapter from a V3 block diagram. The engine keeps V2's vocabulary — nodes / edges, ends
// `{ node, port }` or `{ junction }`, anchors keyed by the end's JSON — so that its functions port
// line by line and compare with the V2 golden (tests/golden/layout).
//
// V2: roGeometry L1580 / L1679 (boxes, anchors, grid), roCurrentPaths L1589, roLocked L1572,
// roDir L1583, roRect / roPairs L1579, roSame L1572.
import type { Block, BlockDiagram, Junction, Port, Wire } from '../io/schema-types';
import { dir, simplify, type Point, type Side } from '../core/geometry';
import { gridSize, portPoint } from '../core/grid';
import type { Route } from '../router/full-path';

export type EngineEnd = { node: string; port: string } | { junction: string };

export interface EngineNode { id: string; x: number; y: number; w: number; h: number; locked: boolean; ports: Port[] }
export interface EngineEdge { id: string; a: EngineEnd; b: EngineEnd; locked: boolean; wire: Wire }
export interface EngineModel { nodes: EngineNode[]; edges: EngineEdge[]; junctions: Junction[]; grid: number; snap: boolean }

export interface EngineBox { id: string; x: number; y: number; w: number; h: number; ports: Port[] }
export interface Geometry { boxes: EngineBox[]; anchors: Record<string, Point>; grid: number }
export type Paths = Record<string, Point[]>;

export const EPS = 1e-6;
export const sameAt = (a: Point, b: Point) => Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;
export const pairs = (ps: readonly Point[]): [Point, Point][] => ps.slice(1).map((p, i) => [ps[i], p]);
export interface EngineRect { id: string; l: number; r: number; t: number; b: number }
export const rect = (n: { id: string; x: number; y: number; w: number; h: number }): EngineRect => ({ id: n.id, l: n.x, r: n.x + n.w, t: n.y, b: n.y + n.h });
export const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Anchor key of an end, as V2 wrote it (JSON of `{ node, port }` or `{ junction }`). */
export const endKey = (e: EngineEnd) => ('junction' in e ? JSON.stringify({ junction: e.junction }) : JSON.stringify({ node: e.node, port: e.port }));

const toEnd = (e: Wire['a']): EngineEnd => ('junction' in e ? { junction: e.junction } : { node: e.block, port: e.port });

/** The engine model of a V3 block diagram (a copy: the engine never touches the diagram). */
export function fromDiagram(d: BlockDiagram): EngineModel {
  return {
    nodes: d.blocks.map(b => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h, locked: b.locked, ports: copy(b.ports) })),
    edges: d.wires.map(w => ({ id: w.id, a: toEnd(w.a), b: toEnd(w.b), locked: w.locked, wire: copy(w) })),
    junctions: copy(d.junctions), grid: gridSize(d.grid), snap: d.grid.snap,
  };
}

/** Block boxes, end anchors and grid (V2 roGeometry; V3 block sizes are the model's w / h). */
export function geometry(m: EngineModel): Geometry {
  const boxes = m.nodes.map(n => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h, ports: copy(n.ports) }));
  const anchors: Record<string, Point> = {};
  for (const e of m.edges) for (const end of [e.a, e.b]) {
    const key = endKey(end);
    if (anchors[key]) continue;
    if ('junction' in end) { const j = m.junctions.find(x => x.id === end.junction); if (j) anchors[key] = { x: j.x, y: j.y }; continue; }
    const n = boxes.find(x => x.id === end.node), p = n?.ports.find(x => x.id === end.port);
    if (n && p) anchors[key] = portPoint(n as unknown as Block, p, m.snap ? m.grid : undefined);
  }
  return { boxes, anchors, grid: m.grid };
}

/** Current path of every edge, simplified (V2 roCurrentPaths; routes from router/full-path). */
export function currentPaths(m: EngineModel, routes: ReadonlyMap<string, Route>): Paths {
  const out: Paths = {};
  for (const e of m.edges) out[e.id] = simplify(copy(routes.get(e.id)?.ps ?? []));
  return out;
}

/** Outward direction of a port end; null for junctions (V2 roDir). */
export function endDir(end: EngineEnd, m: EngineModel): Point | null {
  if ('junction' in end) return null;
  const p = m.nodes.find(n => n.id === end.node)?.ports.find(x => x.id === end.port);
  return p ? dir(p.side as Side) : null;
}
