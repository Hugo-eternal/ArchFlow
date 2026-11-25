// Opening and saving project files. Opening never changes the open project unless the whole
// file is valid (V2 did the same, L558); anything that is not a V3 file is answered with
// "legacy format not supported" instead of a crash (plan §1, step 3.14).
import type { ProjectFile } from './schema-types';
import { validateProject, FILE_LIMITS, type SchemaError } from './schema';
import { migrate } from './migrate';
import type { Store } from '../core/store';
import type { MessageKey } from '../core/i18n';

export type OpenResult =
  | { ok: true; file: ProjectFile; migratedFrom?: number }
  | { ok: false; reason: 'too-large' | 'not-json' | 'legacy-format' | 'newer-format' | 'invalid'; errors: SchemaError[] };

const fail = (reason: Exclude<OpenResult, { ok: true }>['reason'], errors: SchemaError[] = []): OpenResult => ({ ok: false, reason, errors });

/** Parse, upgrade and validate file text. */
export function readProjectText(text: string): OpenResult {
  if (text.length > FILE_LIMITS.bytes || new TextEncoder().encode(text).length > FILE_LIMITS.bytes) return fail('too-large');
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return fail('not-json'); }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return fail('invalid', [{ path: '', code: 'type', detail: 'object' }]);
  const m = migrate(raw as Record<string, unknown>);
  if (!m.ok) return fail(m.reason === 'newer' ? 'newer-format' : 'legacy-format', [{ path: 'schemaVersion', code: 'version', detail: String(m.version ?? '') }]);
  const r = validateProject(m.file);
  if (!r.ok) return fail('invalid', r.errors);
  return m.from === r.value.schemaVersion ? { ok: true, file: r.value } : { ok: true, file: r.value, migratedFrom: m.from };
}

/** Read a File / Blob chosen by the user; the size is checked before reading it. */
export async function readProjectBlob(blob: Blob): Promise<OpenResult> {
  if (blob.size > FILE_LIMITS.bytes) return fail('too-large');
  return readProjectText(await blob.text());
}

/** Open text into the store. On failure the store is left exactly as it was. */
export function openProjectText(store: Store, text: string): OpenResult {
  const r = readProjectText(text);
  if (r.ok) store.load(r.file);
  return r;
}

/** Message key for an open result (the shell shows it as a toast / dialog). */
export function openMessage(r: OpenResult): MessageKey {
  if (r.ok) return 'file.opened';
  return ({ 'too-large': 'file.tooLarge', 'not-json': 'file.notJson', 'legacy-format': 'file.legacyFormat', 'newer-format': 'file.newerFormat', invalid: 'file.invalid' } as const)[r.reason];
}

export const FILE_EXTENSION = '.archflow.json';

/** A safe download name from the project name ("My: board?" → "My board.archflow.json"). */
export function fileNameFor(projectName: string): string {
  return safeFileName(projectName) + FILE_EXTENSION;
}

/** A name usable as a file name on Windows / macOS / Linux ('ArchFlow' when nothing is left). */
export function safeFileName(name: string): string {
  // characters Windows / macOS do not allow, control characters, and leading / trailing dots
  const clean = name.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+|\.+$/g, '').slice(0, 100).trim();
  return clean || 'ArchFlow';
}

/** The project as file text (pretty-printed so files diff well). */
export const projectText = (file: ProjectFile): string => JSON.stringify(file, null, 2) + '\n';

/** File name and text for saving; marks the store saved when `markSaved` is true. */
export function saveProject(store: Store, { markSaved = true } = {}): { name: string; text: string } {
  const file = store.toFile();
  const r = validateProject(file);
  // the store only holds data that passed model functions; a failure here is a bug, not user error
  if (!r.ok) throw new Error('project does not match the V3 schema: ' + r.errors.map(e => `${e.path} ${e.code}`).join('; '));
  const out = { name: fileNameFor(store.projectName), text: projectText(file) };
  if (markSaved) store.markSaved();
  return out;
}

/** Offer text as a file download (browser only). */
export function downloadText(name: string, text: string, type = 'application/json'): void {
  downloadBlob(name, new Blob([text], { type }));
}

/** Browser download of a blob (export: SVG / PNG). */
export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
