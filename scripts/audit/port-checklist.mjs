#!/usr/bin/env node
// Generate docs/v3-port-checklist.md (V3 step 3.8, plan §3.1 R3): one row per override layer
// found by find-overrides.mjs, with its purpose, the V3 module it belongs to, and a status.
//
// Purposes come from the per-layer tables in docs/v3-audit.md §1.4 when available, otherwise
// from the nearest source comment. Dispositions come from audit §1.5 / §4 (superseded,
// retired). The "狀態" column is updated by hand as modules are ported:
//   ☐ 待移植   ☑ 已移植   ✂ 刻意刪除   ⤳ 已被後層取代（不移植）
//
// Re-running keeps any status / note already edited in the existing checklist.
// Usage: node scripts/audit/port-checklist.mjs
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const OUT = 'docs/v3-port-checklist.md';
const data = JSON.parse(execFileSync('node', ['scripts/audit/find-overrides.mjs', '--json'], { encoding: 'utf8', maxBuffer: 1 << 26 }));
const audit = fs.readFileSync('docs/v3-audit.md', 'utf8');

// purposes from audit §1.4: "#### `name`" followed by "| 行 | 目的 |" rows
const purposes = new Map(); // `${target}:${line}` → text
for (const sec of audit.split(/\n#### /).slice(1)) {
  const name = sec.match(/^`([^`]+)`/)?.[1];
  if (!name) continue;
  for (const row of sec.matchAll(/^\| ([\d、, ]+)(?:\\\*|\*)? \| (.+?) \|$/gm)) {
    for (const line of row[1].split(/[、,]\s*/).map(s => s.trim()).filter(Boolean)) purposes.set(`${name}:${line}`, row[2].replace(/\s*\|\s*/g, ' / '));
  }
}

// V3 module per target (plan §1.4)
const MODULE = [
  [/^(inspector|ioSettings|field|options|action|sectionTitle|junctionInspector|currentNodeFields|currentEdgeFields|blockMetricFields|edgeColorFields|blockAppearanceFields|blockSizeFields|textInspector|afPortUpdate|afArrangeIO|uxSync|rfApply)$/, 'inspector'],
  [/^(render|renderFreeTexts|applyBlockAppearance|applyCamera|appendMetrics|ensureBlockWidth|edgeLabel|drawJunctions|drawBranchCorners|renderHeading|afAlignTemplatePorts|afSpreadPorts|syncPortVisibility)$/, 'render'],
  [/^(drawEdges|fullPath|anchor|stub|findPath|repairJunctionGeometry|afNormalizeSharedBranches|ggRoute|beginCornerBranch)$/, 'router'],
  [/^(validateDiagram|projectData|acceptLoadedProject|createWorkspaceProject|storeWorkspace|activateDesign|syncProjectChrome|allowedWorkspace|window\.ArchFlowSession|\$\('#file'\)\.onchange|emptyDiagram|downloadBlob)$/, 'io'],
  [/^(exportSvgDocument|appendFreeTextExport|appendHeadingExport|headingBounds|\$\('#exportBtn'\)\.onclick|\$\('#doExport'\)\.onclick)$/, 'export'],
  [/^(autoArrange|uiArrangeLabels|uiRoutes|uiMetricScore|afRefreshTemplates|ui[A-Z]\w*|uiOpen|ro[A-Z]\w*)$/, 'layout'],
  [/^(updateWorkspaceUI|notify|window\.alert)$/, 'shell'],
  [/^(readabilityReport|updateReadability)$/, 'export'],
  [/^(splitAtCorner)$/, 'router'],
  [/^(placePorts|normalizeSlots|project)$/, 'render'],
  [/^(preview|newFreeText)$/, 'core / interaction'],
  [/^(openInlineTime)$/, 'designs/schedule'],
  [/^(commit|undo|redo|select|refreshSelection|removeSelection|status|fit|finish|start|addPin|updateExplorer|openHeading|\$\('#add'\)\.onclick)$/, 'core / interaction'],
  [/^(schedule\w*|axisLayout|graph\w*|taskHeight|openScheduleTemplates)$/, 'designs/schedule'],
  [/^(workspaceExample|loadWorkspaceExample|\$\('#examplesBtn'\)\.onclick)$/, 'designs/* (templates)'],
];
const moduleOf = t => MODULE.find(([re]) => re.test(t))?.[1] ?? '（待定）';

// dispositions from audit §1.5 / §4.4 / §4.2
const SUPERSEDED = { render: [596, 626], drawEdges: [597, 629, 668], inspector: [599, 631, 673, 797], exportSvgDocument: [606, 634, 698], scheduleExample: [620, 677], axisLayout: [657], autoArrange: [1214, 1647, 1736, 1771], projectData: [520], workspaceExample: [602] };
const RETIRED = new Set(['renderHeading', 'headingBounds', 'appendHeadingExport', 'openHeading', 'allowedWorkspace']);
const status = (target, o) => {
  if (RETIRED.has(target)) return '✂';
  if (SUPERSEDED[target]?.includes(o.line)) return '⤳';
  return '☐';
};

// keep hand edits (status / note) from an existing file
const kept = new Map();
if (fs.existsSync(OUT)) for (const m of fs.readFileSync(OUT, 'utf8').matchAll(/^\| `([^`]+)` \| (\d+) \|[^|]*\|[^|]*\|[^|]*\| ([☐☑✂⤳]) \| (.*?) \|$/gm)) kept.set(`${m[1]}:${m[2]}`, { status: m[3], note: m[4] });

const lines = [
  '# V3 逐層移植清單',
  '',
  '由 `node scripts/audit/port-checklist.mjs` 產生（來源：`scripts/audit/find-overrides.mjs`、`docs/v3-audit.md` §1、§4）。重新產生時會保留已手動修改的「狀態」與「備註」。',
  '',
  '每個 V3 模組完成時，把它涵蓋的列改為 ☑（已移植）或 ✂（刻意刪除，備註寫原因）。3.43 要求本表沒有 ☐。',
  '',
  '狀態：☐ 待移植　☑ 已移植　✂ 刻意刪除　⤳ 已被後層取代（不移植）',
  '',
];
let total = 0;
const tally = { '☐': 0, '☑': 0, '✂': 0, '⤳': 0 };
const byModule = new Map();
for (const t of data.targets) {
  const mod = moduleOf(t.target);
  if (!byModule.has(mod)) byModule.set(mod, []);
  byModule.get(mod).push(t);
}
for (const [mod, targets] of [...byModule].sort((a, b) => a[0].localeCompare(b[0]))) {
  lines.push(`## ${mod}`, '', '| 目標 | 行 | 標記 | 位置 | 目的 | 狀態 | 備註 |', '|---|---|---|---|---|---|---|');
  for (const t of targets) for (const o of t.overrides) {
    const key = `${t.target}:${o.line}`;
    const purpose = (purposes.get(key) ?? o.comment ?? '').replace(/\|/g, '/').slice(0, 160);
    const prev = kept.get(key);
    const st = prev?.status ?? status(t.target, o);
    tally[st]++; total++;
    const mark = o.replaces ? '`*` 取代' : o.rollback ? '`↶` 回退' : '';
    lines.push(`| \`${t.target}\` | ${o.line} | ${mark} | ${o.script ?? ''} | ${purpose} | ${st} | ${prev?.note ?? ''} |`);
  }
  lines.push('');
}
lines.splice(8, 0, `合計 ${total} 層：☐ ${tally['☐']}　☑ ${tally['☑']}　✂ ${tally['✂']}　⤳ ${tally['⤳']}`, '');
fs.writeFileSync(OUT, lines.join('\n'));
console.log(`wrote ${OUT}: ${total} layers (☐ ${tally['☐']}, ☑ ${tally['☑']}, ✂ ${tally['✂']}, ⤳ ${tally['⤳']})`);
