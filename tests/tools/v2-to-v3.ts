// TEST-ONLY converter: V2.10.1 project file → V3 ProjectFile (docs/v3-plan.md §3.1 R1).
// Used to turn the committed golden fixtures (tests/golden/<type>/project.json, V2 format)
// into V3 input once V3 can load projects. It is never bundled: V3 itself does not read
// V1 / V2 files ("不支援舊版格式").
//
// Mapping follows docs/v3-audit.md §2: fields are renamed, merged or dropped; layout caches
// and legacy-only fields are not carried over.
import type {
  Block, BlockDiagram, BlockStyle, BlockView, Connector, Design, FlowchartDoc, Frame, Junction, LineFormat,
  Link, Locale, Metric, MetricKey, Part, Point, Port, PortLabelMode, ProjectFile, ScheduleData,
  SequenceDoc, Task, TaskTime, TextBox, Theme, TitleAlign, Wire, WireEnd,
} from '../../src/io/schema-types';
import { SCHEMA_VERSION } from '../../src/io/schema-types';

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const bool = (v: unknown, d = false): boolean => (typeof v === 'boolean' ? v : d);
const arr = <T = Raw>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

const LEGACY_LAYOUT: Record<string, TitleAlign> = { top: 'top-left', center: 'center-left', middle: 'center-center' };
const LAYOUTS: TitleAlign[] = ['top-left', 'top-center', 'top-right', 'center-left', 'center-center', 'center-right'];
const UNITS = ['A', 'mA', 'uA'] as const;
const unit = (v: unknown) => (UNITS as readonly string[]).includes(v as string) ? (v as Metric['unit']) : undefined;

export function convertProject(v2: Raw, app = 'ArchFlow 3.0.0'): ProjectFile {
  if (v2?.version !== 5 || !Array.isArray(v2.designs)) throw new Error('expected a V2.10.1 project (version 5)');
  const locale: Locale = v2.archflowLocalization?.locale === 'en' ? 'en' : 'zh-Hant';
  return {
    schemaVersion: SCHEMA_VERSION,
    app,
    locale,
    project: { name: str(v2.project?.name, 'Project') },
    activeDesignId: str(v2.activeDesignId),
    customStyles: arr(v2.customStyles).filter(Boolean).map(convertStyle),
    designs: v2.designs.map(convertDesign),
  };
}

function convertDesign(d: Raw): Design {
  const base = { id: str(d.id), name: str(d.name), camera: { x: num(d.camera?.x), y: num(d.camera?.y), z: num(d.camera?.z, 1) } };
  const g = d.diagram ?? {};
  switch (d.type) {
    // V2 had two block-diagram types; V3 has one with two views (3.26c)
    case 'function': return { ...base, type: 'function', data: convertBlockDiagram(g, 'function') };
    case 'power': return { ...base, type: 'function', data: convertBlockDiagram(g, 'power') };
    case 'schedule': return { ...base, type: 'schedule', data: convertSchedule(g) };
    case 'sequence': return { ...base, type: 'sequence', data: (g.sequence ?? { name: '', rails: [] }) as SequenceDoc };
    case 'flowchart': return { ...base, type: 'flowchart', data: (g.flowchart ?? { title: '', lanes: [], nodes: [], edges: [] }) as FlowchartDoc };
    default: throw new Error(`unknown design type ${String(d.type)}`);
  }
}

// ---------------------------------------------------------------- block diagrams

function convertStyle(s: Raw): BlockStyle {
  const out: BlockStyle = {};
  for (const k of ['fill', 'border', 'accent', 'text', 'subtitle', 'name'] as const) if (typeof s?.[k] === 'string') out[k] = s[k];
  if (typeof s?.titleSize === 'number') out.titleSize = s.titleSize;
  return out;
}

function convertTheme(t: Raw | undefined): Theme | undefined {
  if (!t) return undefined;
  return { latinFont: str(t.english), cjkFont: str(t.chinese), title: num(t.title), subtitle: num(t.subtitle), label: num(t.label), metric: num(t.metric) };
}

function convertLine(f: Raw | undefined, e: Raw = {}): LineFormat {
  const line: LineFormat = {
    color: str(f?.color, str(e.color, '#536b8c')),
    width: num(f?.width, 2),
    dash: str(f?.dash, 'solid'),
    arrow: bool(f?.arrow, bool(e.arrow)),
  };
  const size = f?.arrowSize ?? e.arrowSize;
  if (typeof size === 'number') line.arrowSize = size;
  if (e.afBoth === true) line.bothEnds = true;
  return line;
}

const labelMode = (p: Raw): PortLabelMode =>
  p.afLabelPos === 'inside' || p.afLabelPos === 'outside' || p.afLabelPos === 'hidden' ? p.afLabelPos : p.showLabel === false ? 'hidden' : 'inside';

function convertPort(p: Raw): Port {
  const port: Port = { id: str(p.id), name: str(p.name), side: p.side, t: num(p.t, 0.5), type: str(p.type, 'io'), label: labelMode(p), locked: p.afLocked === true };
  if (typeof p.afPin === 'number') port.pin = p.afPin;
  if (p.afEnd === 'l' || p.afEnd === 'r') port.end = p.afEnd;
  return port;
}

function convertBlock(n: Raw): Block {
  const metrics: Block['metrics'] = {};
  for (const k of ['voltage', 'current', 'power', 'efficiency'] as MetricKey[]) {
    const value = n[k];
    if (value === undefined || value === null || value === '') continue;
    const m: Metric = { value: String(value), show: n.showMetrics?.[k] === true };
    if (k === 'current' && unit(n.afCurrentUnit)) m.unit = unit(n.afCurrentUnit);
    metrics[k] = m;
  }
  const block: Block = {
    id: str(n.id), x: num(n.x), y: num(n.y), w: num(n.w), h: num(n.h),
    title: str(n.title), subtitle: str(n.text), partNumber: str(n.partNumber), ref: str(n.ref),
    ports: arr(n.ports).map(convertPort),
    style: convertStyle(n.appearance ?? {}),
    sizing: n.afFree === true ? 'free' : 'auto',
    showTitle: n.afNoName !== true,
    locked: n.afLocked === true,
    metrics,
  };
  const align = LEGACY_LAYOUT[n.afLayout] ?? (LAYOUTS.includes(n.afLayout) ? n.afLayout : undefined);
  if (align) block.titleAlign = align;
  if (n.afFont && typeof n.afFont === 'object') block.font = { ...n.afFont };
  if (typeof n.role === 'string') block.role = n.role;
  if (typeof n.afSym === 'string' && n.afSym) {
    const part: Part = { kind: n.afSym, rot: ([0, 90, 180, 270].includes(n.afRot) ? n.afRot : 0) as Part['rot'], size: (['S', 'M', 'L'].includes(n.afSize) ? n.afSize : 'M') as Part['size'] };
    block.part = part;
  }
  // voltage badges: plain blocks only (V2 hides them on symbols), cleaned as V2 cleanRails
  if (!block.part && Array.isArray(n.afRails)) {
    const rails = [...new Set(n.afRails.map((r: unknown) => String(r ?? '').trim()).filter(Boolean))].slice(0, 4) as string[];
    if (rails.length) block.rails = rails;
  }
  if (n.afConn && typeof n.afConn === 'object') {
    const c: Connector = {
      kind: str(n.afConn.kind), side: (['l', 'r', 'both'].includes(n.afConn.side) ? n.afConn.side : 'both') as Connector['side'],
      pins: arr<string>(n.afConn.pins).map(String), only: bool(n.afConn.only),
      mpn: str(n.afMpn), visibleRows: arr<number>(n.afRows?.vis), hiddenRows: num(n.afRows?.hidden),
    };
    block.connector = c;
  }
  return block;
}

const end = (r: Raw): WireEnd => (r?.junction ? { junction: str(r.junction) } : { block: str(r?.node), port: str(r?.port) });
const points = (ps: unknown): Point[] => arr(ps).map(p => ({ x: num(p.x), y: num(p.y) }));

function convertWire(e: Raw): Wire {
  const wire: Wire = {
    id: str(e.id), a: end(e.a), b: end(e.b), name: str(e.name), kind: str(e.kind, 'signal'),
    line: convertLine(e.afLineFormat, e),
    locked: e.afGridLocked === true || e.afLocked === true || e.locked === true,
  };
  const route = Array.isArray(e.manual) && e.manual.length ? points(e.manual) : e.afRouteOnly?.points ? points(e.afRouteOnly.points) : undefined;
  if (route) wire.route = route;
  if ((e.voltage ?? '') !== '' || (e.current ?? '') !== '') {
    wire.electrical = { voltage: str(e.voltage), current: str(e.current), show: e.afShowElectrical !== false };
    if (unit(e.currentUnit)) wire.electrical.unit = unit(e.currentUnit);
  }
  const label: NonNullable<Wire['label']> = {};
  if (typeof e.afLabelSize === 'number') label.size = e.afLabelSize;
  if (typeof e.afLabelPreset === 'string') label.preset = e.afLabelPreset;
  if (e.afLabelMark && Number.isFinite(e.afLabelMark.x)) label.mark = { x: e.afLabelMark.x, y: e.afLabelMark.y, angle: num(e.afLabelMark.angle) };
  if (Object.keys(label).length) wire.label = label;
  return wire;
}

const convertJunction = (j: Raw): Junction => ({ id: str(j.id), x: num(j.x), y: num(j.y), name: str(j.name) });

const convertText = (t: Raw): TextBox => ({
  id: str(t.id), text: str(t.text), x: num(t.x), y: num(t.y), w: num(t.w, 180), size: num(t.size, 16),
  color: str(t.color, '#243e5d'), bold: bool(t.bold), italic: bool(t.italic),
  align: t.align === 'center' || t.align === 'right' ? t.align : 'left',
  background: str(t.background, 'transparent'),
});

const convertFrame = (f: Raw): Frame => ({ id: str(f.id), title: str(f.title), x: num(f.x), y: num(f.y), w: num(f.w), h: num(f.h), style: str(f.style, 'solid'), color: str(f.color) });

function convertBlockDiagram(g: Raw, view: BlockView): BlockDiagram {
  const d: BlockDiagram = {
    view,
    blocks: arr(g.nodes).map(convertBlock),
    wires: arr(g.edges).map(convertWire),
    junctions: arr(g.junctions).map(convertJunction),
    texts: arr(g.texts).map(convertText),
    frames: arr(g.afFrames).map(convertFrame),
    grid: { size: num(g.afGrid?.size, 10), show: g.afGrid?.show !== false, snap: g.afGrid?.enabled !== false },
    wirePresets: arr(g.afLinePresets).map(p => convertLine(p)),
    presentationClean: g.afPresentation === 'clean',
  };
  const theme = convertTheme(g.theme);
  if (theme) d.theme = theme;
  if (['inside', 'outside', 'hidden'].includes(g.afPinLabels)) d.portLabels = g.afPinLabels;
  if (g.afLineDefaults) d.wireDefaults = convertLine(g.afLineDefaults);
  return d;
}

// ---------------------------------------------------------------- schedule

function convertTime(n: Raw): TaskTime {
  if (n.timeType === 'range') return { type: 'range', start: str(n.startDate), end: str(n.endDate) };
  if (n.timeType === 'deadline') return { type: 'deadline', date: str(n.deadline) };
  return { type: 'none' };
}

function convertTask(n: Raw): Task {
  const task: Task = {
    id: str(n.id), title: str(n.title), ref: str(n.ref), note: str(n.note),
    side: n.side === 'bottom' ? 'bottom' : 'top',
    time: convertTime(n),
    status: n.afStatus === 'doing' || n.afStatus === 'done' ? n.afStatus : 'todo',
    milestone: n.afMilestone === true,
    offset: { card: { x: num(n.cardDx), y: num(n.cardDy) }, axis: { x: num(n.axisDx), y: num(n.axisDy) } },
  };
  if (typeof n.branchColor === 'string') task.branchColor = n.branchColor;
  return task;
}

function convertLink(e: Raw): Link {
  const manual = e.timeMode === 'manual' && /^\d+$/.test(String(e.manualDays ?? ''));
  const link: Link = { id: str(e.id), from: str(e.a?.node), to: str(e.b?.node), days: manual ? { mode: 'manual', value: Number(e.manualDays) } : { mode: 'auto' } };
  if (e.fromDate === 'start' || e.fromDate === 'end') link.fromDate = e.fromDate;
  if (e.toDate === 'start' || e.toDate === 'end') link.toDate = e.toDate;
  return link;
}

function convertSchedule(g: Raw): ScheduleData {
  const appearance: Record<string, unknown> = { ...(g.scheduleAppearance ?? {}) };
  if (g.engineeringStyle) appearance.engineering = { ...g.engineeringStyle };
  if (g.savedEngineeringStyle) appearance.savedCustom = { ...g.savedEngineeringStyle };
  if (g.customStyleActive === true) appearance.customActive = true;
  const data: ScheduleData = {
    tasks: arr(g.nodes).map(convertTask),
    links: arr(g.edges).map(convertLink),
    texts: arr(g.texts).map(convertText),
    rules: { endpoint: g.scheduleRules?.endpoint === 'end' ? 'end' : 'start', count: g.scheduleRules?.count === 'inclusive' ? 'inclusive' : 'difference' },
    appearance,
    snap: { enabled: g.scheduleSnapEnabled !== false, range: num(g.scheduleSnapRange, 12) },
  };
  const theme = convertTheme(g.theme);
  if (theme) data.theme = theme;
  return data;
}
