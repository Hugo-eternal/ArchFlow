// The start screen (V2.10.1 .af2-start): a top bar (brand, language, tools, open), the new-project
// form in three numbered steps on the left, and on the right a preview of the chosen start and
// the tools card. V2's five design kinds are kept: "function blocks" and "power architecture" are
// both V3 block diagrams, the second one starting in the power view.
import { useMemo, useState } from 'react';
import { t, type MessageKey } from '../core/i18n';
import type { DesignType } from '../io/schema-types';
import type { BlockDiagram } from '../model/types';
import { exportDrawing, exportSvg } from '../export/svg';
import { routeAll } from '../router/full-path';
import { APP_VERSION } from '../version';
import type { Shell, DesignChoice } from './controller';
import { CommandButton, LangSwitch, Logo } from './AppBar';
import { Icon, type IconName } from './icons';

/** A card of step 2: a design type, or a variant of one (V2's power architecture). */
interface StartKind { id: string; type: DesignType; icon: IconName; templates: readonly string[]; variant?: string }

const KINDS: readonly StartKind[] = [
  { id: 'function', type: 'function', icon: 'blocks', templates: ['starter', 'platform', 'sensor'] },
  { id: 'power', type: 'function', icon: 'zap', templates: ['power-starter', 'power-car', 'power-zones'], variant: 'power' },
  { id: 'schedule', type: 'schedule', icon: 'schedule', templates: ['starter', 'product', 'eco'] },
  { id: 'sequence', type: 'sequence', icon: 'activity', templates: ['display', 'lcd', 'fpga', 'mcu'] },
  { id: 'flowchart', type: 'flowchart', icon: 'flow', templates: ['lcd'] },
];

const TOOL_ICON: Record<string, IconName> = { bom: 'fileSheet', edid: 'monitor', hex: 'binary', pattern: 'palette' };

/** The kinds whose design type is registered, each with the templates its module has. */
function kindsOf(shell: Shell): StartKind[] {
  return KINDS.flatMap(k => {
    const m = shell.designs.list().find(x => x.type === k.type);
    if (!m) return [];
    return [{ ...k, templates: k.templates.filter(id => m.templates.some(tpl => tpl.id === id)) }];
  });
}

const tplKey = (k: StartKind, id: string, part: 'name' | 'desc') => `start.tpl.${k.id}.${id}.${part}` as MessageKey;
/** V2 .af2-choice-num: "Start" for the first template of the three drawn kinds, else 01, 02 … */
const tagOf = (k: StartKind, i: number) => (k.id === 'sequence' || k.id === 'flowchart' ? String(i + 1).padStart(2, '0') : i === 0 ? t('start.tag.starter') : String(i).padStart(2, '0'));

/** The chosen start drawn by the design's own renderer, as an SVG document (null: not drawable here). */
function previewOf(shell: Shell, kind: StartKind, template: string | undefined): string | null {
  const m = shell.designs.list().find(x => x.type === kind.type);
  if (!m || m.editor === 'embedded' || !template) return null;
  try {
    const made = m.create({ template, variant: kind.variant });
    if (m.canvas) {
      const out = m.canvas.render(made.data, { selected: new Set(), measure: shell.measure, forExport: true });
      return out.node ? exportDrawing(out.node, m.canvas.bounds(made.data), { transparent: true }).source : null;
    }
    const d = made.data as BlockDiagram;
    return exportSvg(d, { view: d.view, transparent: true, measure: shell.measure, routes: routeAll(d), decorate: m.decorate, footer: m.blockFooter, wireTone: m.wireTone, blockFaded: m.blockFaded, extras: m.exportExtras }).source;
  } catch { return null; }
}

/** V2's drawn illustrations for the kinds edited in a vendor editor. */
function Illustration({ kind }: { kind: string }) {
  if (kind === 'sequence') {
    const rails = [['VIN', '12 V', 60], ['5V0', '5 V', 180], ['3V3', '3.3 V', 300], ['RESET', '', 420]] as const;
    return (
      <svg className="af-board-art" viewBox="0 0 680 400" aria-hidden="true">
        {rails.map(([n, v, x], i) => (
          <g key={n}>
            <text x="0" y={40 + i * 88} className="af-art-title">{n}</text>
            {v && <text x="0" y={64 + i * 88} className="af-art-sub">{v}</text>}
            <path d={`M140 ${52 + i * 88} H${x + 100} V${30 + i * 88} H660`} className="af-art-line" />
          </g>
        ))}
        <path d="M140 372 H660" className="af-art-axis" />
        {[0, 5, 10, 15, 20].map((ms, i) => <text key={ms} x={140 + i * 120} y="396" className="af-art-sub" textAnchor="middle">{ms} ms</text>)}
      </svg>
    );
  }
  return (
    <svg className="af-board-art" viewBox="0 0 680 400" aria-hidden="true">
      <rect x="250" y="10" width="180" height="56" rx="28" className="af-art-box" />
      <path d="M340 66 V100 M340 176 V210 M340 266 V300 M430 138 H560 V328 H430" className="af-art-line" />
      <path d="M340 100 L430 138 L340 176 L250 138 Z" className="af-art-box" />
      <rect x="250" y="210" width="180" height="56" rx="6" className="af-art-box" />
      <rect x="250" y="300" width="180" height="56" rx="28" className="af-art-box" />
    </svg>
  );
}

export function StartScreen({ shell }: { shell: Shell }) {
  const kinds = kindsOf(shell);
  const [name, setName] = useState('');
  const [kindId, setKindId] = useState(kinds[0]?.id ?? 'function');
  const [blank, setBlank] = useState(false);
  const kind = kinds.find(k => k.id === kindId) ?? kinds[0];
  const [templates, setTemplates] = useState<Record<string, string>>({});
  const template = kind ? templates[kind.id] ?? kind.templates[0] : undefined;
  const choice: DesignChoice = { type: kind.type, template: blank ? undefined : template, variant: kind.variant };
  const preview = useMemo(() => previewOf(shell, kind, template), [shell, kind, template]);
  const tools = shell.tools.list();
  const m = shell.message;

  const pickKind = (id: string) => setKindId(id);
  const onKindKey = (e: React.KeyboardEvent, i: number) => {
    const n = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!n) return;
    e.preventDefault();
    const next = kinds[(i + n + kinds.length) % kinds.length];
    setKindId(next.id);
    (e.currentTarget.parentElement?.children[(i + n + kinds.length) % kinds.length] as HTMLElement | undefined)?.focus();
  };

  return (
    <main className="af-start">
      <header className="af-start-top">
        <span className="af-brand"><Logo /><span className="af-wordmark">ArchFlow</span><span className="af-ver">V{APP_VERSION}</span></span>
        <span className="af-start-tag">{t('app.tagline')}</span>
        <span className="af-spacer" />
        <LangSwitch long />
        {tools.map(tl => (
          <button key={tl.id} type="button" className={`af-btn ghost af-tool-entry is-${tl.id}`} onClick={() => void shell.run(`tool.open.${tl.id}`)}>
            <Icon name={TOOL_ICON[tl.id] ?? 'box'} /><span>{t(tl.label)}</span>
          </button>
        ))}
        <button type="button" className="af-btn ghost" onClick={() => shell.pickFile()}><Icon name="folderOpen" /><span>{t('start.open')}</span></button>
      </header>
      <div className="af-start-body">
        <form className="af-start-form" onSubmit={e => { e.preventDefault(); void shell.run('project.create', { name, choice }); }}>
          <h1>{t('start.title')}</h1>
          <p className="af-start-intro">{t('start.intro')}</p>
          <section className="af-step">
            <h2><span className="af-step-n" aria-hidden="true">1</span>{t('start.step.name')}</h2>
            <input className="af-start-field" value={name} maxLength={100} placeholder={t('project.untitled')} aria-label={t('start.projectName')} onChange={e => setName(e.target.value)} />
          </section>
          <section className="af-step">
            <h2 id="af-step-type"><span className="af-step-n" aria-hidden="true">2</span>{t('start.step.type')}</h2>
            <div className="af-types" role="radiogroup" aria-labelledby="af-step-type">
              {kinds.map((k, i) => (
                <button key={k.id} type="button" role="radio" aria-checked={k.id === kind.id} tabIndex={k.id === kind.id ? 0 : -1}
                  className="af-type" onClick={() => pickKind(k.id)} onKeyDown={e => onKindKey(e, i)}>
                  <span className="af-type-icon" aria-hidden="true"><Icon name={k.icon} /></span>
                  <span className="af-type-text"><strong>{t(`start.kind.${k.id}.name` as MessageKey)}</strong><small>{t(`start.kind.${k.id}.desc` as MessageKey)}</small></span>
                  <span className="af-radio" aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>
          <section className="af-step">
            <h2 id="af-step-content"><span className="af-step-n" aria-hidden="true">3</span>{t('start.step.content')}</h2>
            <div className="af-seg" role="radiogroup" aria-labelledby="af-step-content">
              <button type="button" role="radio" aria-checked={!blank} onClick={() => setBlank(false)}>{t('start.mode.template')}</button>
              <button type="button" role="radio" aria-checked={blank} onClick={() => setBlank(true)}>{t('start.mode.blank')}</button>
            </div>
            {!blank && (
              <div className="af-tpls" role="radiogroup" aria-label={t('start.templates')}>
                {kind.templates.map((id, i) => (
                  <button key={id} type="button" role="radio" aria-checked={id === template} className="af-tpl"
                    onClick={() => setTemplates({ ...templates, [kind.id]: id })}>
                    <span className="af-tpl-num" aria-hidden="true">{tagOf(kind, i)}</span>
                    <span className="af-tpl-text"><strong>{t(tplKey(kind, id, 'name'))}</strong><small>{t(tplKey(kind, id, 'desc'))}</small></span>
                    {id === template && <Icon name="check" className="af-icon af-tpl-check" />}
                  </button>
                ))}
              </div>
            )}
          </section>
          <p className="af-start-foot">{t('start.foot')}</p>
          {m && <p className={`af-start-message${m.tone === 'error' ? ' is-error' : ''}`} role={m.tone === 'error' ? 'alert' : 'status'}>{t(m.key, m.vars)}</p>}
          <div className="af-start-actions">
            <button type="submit" className="af-btn primary large">{t('start.create')}<kbd className="af-kbd" aria-hidden="true"><Icon name="enter" /></kbd></button>
            {shell.enabled('project.cancelNew') && <CommandButton shell={shell} id="project.cancelNew" className="af-btn ghost" />}
          </div>
        </form>
        <figure className="af-board" aria-label={t('start.preview')}>
          <div className="af-board-stage">
            {preview ? <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(preview)}`} alt="" /> : <Illustration kind={kind.id} />}
          </div>
          <figcaption>
            <strong>{t(`start.kind.${kind.id}.name` as MessageKey)}</strong>
            <span>{blank || !template ? t('start.blankCaption') : `${t(tplKey(kind, template, 'name'))} · ${t(tplKey(kind, template, 'desc'))}`}</span>
          </figcaption>
          {tools.length > 0 && (
            <section className="af-tools-home" aria-labelledby="af-tools-title">
              <h2 id="af-tools-title">{t('tools.title')} <small>{t('tools.subtitle')}</small></h2>
              <div className="af-tool-tiles">
                {tools.map(tl => (
                  <button key={tl.id} type="button" className={`af-tool-tile is-${tl.id}`} title={t(tl.long)} onClick={() => void shell.run(`tool.open.${tl.id}`)}>
                    <span className="af-tool-tile-icon" aria-hidden="true"><Icon name={TOOL_ICON[tl.id] ?? 'box'} /></span>
                    <span className="af-tool-tile-text"><strong>{t(tl.label)}</strong><small>{t(tl.description)}</small></span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </figure>
      </div>
    </main>
  );
}
