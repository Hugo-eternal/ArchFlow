// Model types used by every module. The saved shapes live in io/schema-types (one definition
// for file and memory); this module adds the in-memory vocabulary on top of them.
export type {
  Block, BlockDiagram, BlockStyle, Connector, Frame, Grid, Junction, LineFormat, Metric, MetricKey,
  Part, Point, Port, PortLabelMode, TextBox, Theme, TitleAlign, Wire, WireEnd,
} from '../io/schema-types';
import type { Block, Port, WireEnd } from '../io/schema-types';

export type Side = Port['side'];
export type PortType = 'in' | 'out' | 'io' | 'power' | 'gnd' | string;
export type { BlockView } from '../io/schema-types';

/** Limits of one block diagram (V2 validateDiagram L358 and afAddFunctionPort L1239). */
export const LIMITS = Object.freeze({ blocks: 100, wires: 400, portsPerBlock: 100, text: 20000 });

/** A reference to something on a block diagram (selection, deletion, inspector). */
export type ItemRef =
  | { kind: 'block'; id: string }
  | { kind: 'port'; block: string; id: string }
  | { kind: 'wire'; id: string }
  | { kind: 'junction'; id: string }
  | { kind: 'text'; id: string }
  | { kind: 'frame'; id: string };

export const isJunctionEnd = (e: WireEnd): e is { junction: string } => 'junction' in e;
export const isPortEnd = (e: WireEnd): e is { block: string; port: string } => 'block' in e;

/** Thrown by model functions for a refused edit; `code` maps to an i18n message in the shell. */
export class ModelError extends Error {
  constructor(readonly code: 'limit-blocks' | 'limit-wires' | 'limit-ports' | 'missing' | 'same-end', readonly id = '') {
    super(`${code}${id ? ': ' + id : ''}`);
    this.name = 'ModelError';
  }
}

export type BlockPatch = Partial<Omit<Block, 'id' | 'ports'>>;
