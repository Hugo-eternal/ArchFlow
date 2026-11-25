// V3 project file — types only (docs/v3-plan.md §2). Runtime validation comes in step 3.13
// (src/io/schema.ts) and must accept exactly these shapes.
//
// Field origins in V2.10.1 are noted as "V2: …" (see docs/v3-audit.md §2 for the merge /
// drop decisions). Everything V2 kept only for old files or as layout caches is gone.

export const SCHEMA_VERSION = 3;

export type Locale = 'zh-Hant' | 'en';
export type DesignType = 'function' | 'power' | 'schedule' | 'sequence' | 'flowchart';

export interface Point { x: number; y: number }
export interface Camera { x: number; y: number; z: number }

export interface ProjectFile {
  schemaVersion: typeof SCHEMA_VERSION;
  app: string;                       // e.g. "ArchFlow 3.0.0" (V2: applicationVersion, written wrongly as 1.8-rc4)
  locale: Locale;                    // V2: archflowLocalization.locale
  project: { name: string };
  activeDesignId: string;
  customStyles: BlockStyle[];        // V2: customStyles (null slots removed)
  designs: Design[];
}

export type Design =
  | DesignOf<'function', BlockDiagram>
  | DesignOf<'power', BlockDiagram>
  | DesignOf<'schedule', ScheduleData>
  | DesignOf<'sequence', SequenceDoc>
  | DesignOf<'flowchart', FlowchartDoc>;

export interface DesignOf<T extends DesignType, D> {
  id: string;
  name: string;
  type: T;
  camera: Camera;
  data: D;                           // V2: diagram
}

// ---------------------------------------------------------------- block diagrams (function / power)

export interface BlockDiagram {
  blocks: Block[];                   // V2: nodes
  wires: Wire[];                     // V2: edges
  junctions: Junction[];
  texts: TextBox[];
  frames: Frame[];                   // V2: afFrames (function designs)
  theme?: Theme;
  grid: Grid;                        // V2: afGrid (version dropped)
  portLabels?: PortLabelMode;        // V2: afPinLabels
  wireDefaults?: LineFormat;         // V2: afLineDefaults
  wirePresets: LineFormat[];         // V2: afLinePresets
  presentationClean: boolean;        // V2: afPresentation === 'clean'
}

export interface Grid { size: number; show: boolean; snap: boolean }  // V2: enabled → snap
export type PortLabelMode = 'inside' | 'outside' | 'hidden';

export interface Theme {
  latinFont: string;                 // V2: english
  cjkFont: string;                   // V2: chinese
  title: number; subtitle: number; label: number; metric: number;
}

export interface BlockStyle {
  fill?: string; border?: string; accent?: string; text?: string; subtitle?: string;
  titleSize?: number;
  name?: string;                     // custom styles only
}

export type TitleAlign =
  | 'top-left' | 'top-center' | 'top-right'
  | 'center-left' | 'center-center' | 'center-right';

export type MetricKey = 'voltage' | 'current' | 'power' | 'efficiency';
export interface Metric { value: string; show: boolean; unit?: 'A' | 'mA' | 'uA' }

export interface Block {
  id: string;
  x: number; y: number; w: number; h: number;
  title: string;
  subtitle: string;                  // V2: text
  partNumber: string;
  ref: string;
  ports: Port[];
  style: BlockStyle;                 // V2: appearance (old single `color` dropped)
  titleAlign?: TitleAlign;           // V2: afLayout
  font?: { subtitle?: number; label?: number; metric?: number };  // V2: afFont
  sizing: 'auto' | 'free';           // V2: afFree
  showTitle: boolean;                // V2: !afNoName
  locked: boolean;                   // V2: afLocked
  role?: string;                     // power: source / converter / distribution / load
  metrics: Partial<Record<MetricKey, Metric>>;  // V2: voltage/current/power/efficiency + showMetrics + afCurrentUnit
  rails?: string[];                  // voltage badges on the top-right edge, up to 4 (V2: afRails)
  part?: Part;
  connector?: Connector;
}

export interface Part {
  kind: string;                      // V2: afSym (res, cap, led, gnd, conn, …)
  rot: 0 | 90 | 180 | 270;           // V2: afRot
  size: 'S' | 'M' | 'L';             // V2: afSize
}

export interface Connector {
  kind: string;                      // V2: afConn.kind (fpc, b2b, harness)
  side: 'l' | 'r' | 'both';
  pins: string[];
  only: boolean;
  mpn: string;                       // V2: afMpn
  visibleRows: number[];             // V2: afRows.vis
  hiddenRows: number;                // V2: afRows.hidden
}

export interface Port {
  id: string;
  name: string;
  side: 'l' | 'r' | 't' | 'b';
  t: number;                         // position along the side, 0..1
  type: string;
  label: PortLabelMode;              // V2: showLabel + afLabelPos
  locked: boolean;                   // V2: afLocked
  pin?: number;                      // connector pin row (V2: afPin)
  end?: 'l' | 'r';                   // connector side of the pin (V2: afEnd)
}

export type WireEnd = { block: string; port: string } | { junction: string };

export interface LineFormat {
  color: string;
  width: number;
  dash: string;                      // solid / dash / dot …
  arrow: boolean;
  arrowSize?: number;
  bothEnds?: boolean;                // arrow at both ends (V2: edge.afBoth)
}

export interface Wire {
  id: string;
  a: WireEnd; b: WireEnd;
  name: string;
  kind: string;                      // signal / power / clock / bus
  line: LineFormat;                  // V2: afLineFormat, merged with color / arrow / arrowSize
  route?: Point[];                   // V2: manual, or afRouteOnly.points
  locked: boolean;                   // V2: afGridLocked | afLocked | locked
  electrical?: { voltage: string; current: string; unit?: 'A' | 'mA' | 'uA'; show: boolean };
  label?: { size?: number; preset?: string; mark?: { x: number; y: number; angle: number } };
}

export interface Junction { id: string; x: number; y: number; name: string }

export interface TextBox {
  id: string; text: string;
  x: number; y: number; w: number;
  size: number; color: string; bold: boolean; italic: boolean;
  align: 'left' | 'center' | 'right';
  background: string;                // 'transparent' or a colour
}

export interface Frame {
  id: string; title: string;
  x: number; y: number; w: number; h: number;
  style: string;                     // solid / dash
  color: string;                     // palette name (teal, …) or colour
}

// ---------------------------------------------------------------- schedule

export interface ScheduleData {
  tasks: Task[];                     // V2: nodes (layout caches dropped)
  links: Link[];                     // V2: edges
  texts: TextBox[];
  rules: { endpoint: 'start' | 'end'; count: 'difference' | 'inclusive' };   // V2: scheduleRules
  appearance: Record<string, unknown>;   // V2: scheduleAppearance (+ engineering styles), shape fixed in designs/schedule
  theme?: Theme;
  snap: { enabled: boolean; range: number };
}

export type TaskTime =
  | { type: 'none' }
  | { type: 'range'; start: string; end: string }
  | { type: 'deadline'; date: string };

export interface Task {
  id: string; title: string; ref: string; note: string;
  side: 'top' | 'bottom';
  time: TaskTime;
  status: 'todo' | 'doing' | 'done';
  milestone: boolean;
  offset: { card: Point; axis: Point };  // V2: cardDx/cardDy, axisDx/axisDy
  branchColor?: string;
}

export interface Link {
  id: string; from: string; to: string;
  days: { mode: 'auto' } | { mode: 'manual'; value: number };
  fromDate?: 'start' | 'end';
  toDate?: 'start' | 'end';
}

// ---------------------------------------------------------------- vendor editors (stored as-is)

export interface SequenceDoc { name: string; tk?: string; rails: unknown[]; [k: string]: unknown }
export interface FlowchartDoc { title: string; lanes: unknown[]; nodes: unknown[]; edges: unknown[]; lineDefault?: unknown; [k: string]: unknown }
