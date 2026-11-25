// Upgrades between V3 file versions. V3 does not read V1 / V2 files (plan §1); this only
// exists so that a later V3.x that changes a stored field can raise SCHEMA_VERSION and add one
// step here. Rule (CLAUDE.md): changing an existing field = new schemaVersion + a migration +
// a test that upgrades a file of the previous version.
import { SCHEMA_VERSION } from './schema-types';

/** Raw parsed JSON of some version. */
export type RawFile = Record<string, unknown> & { schemaVersion: number };

/** MIGRATIONS[n] turns a version-n file into a version-(n + 1) file. Empty until V3.x needs one. */
export const MIGRATIONS: Readonly<Record<number, (f: RawFile) => RawFile>> = Object.freeze({});

/** The oldest version that can still be upgraded. */
export const OLDEST_SUPPORTED = 3;

export type MigrateResult =
  | { ok: true; file: RawFile; from: number }
  | { ok: false; reason: 'legacy' | 'newer'; version: unknown };

/**
 * Bring a parsed file to SCHEMA_VERSION. Files older than V3 are 'legacy' (not supported);
 * files from a newer ArchFlow are 'newer'. The input is not changed.
 */
export function migrate(raw: Record<string, unknown>, migrations = MIGRATIONS, current: number = SCHEMA_VERSION): MigrateResult {
  const v = raw.schemaVersion;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < OLDEST_SUPPORTED) return { ok: false, reason: 'legacy', version: v ?? raw.version };
  if (v > current) return { ok: false, reason: 'newer', version: v };
  let file = structuredClone(raw) as RawFile;
  for (let n = v; n < current; n++) {
    const step = migrations[n];
    if (!step) throw new Error(`no migration from schemaVersion ${n}`);
    file = step(file);
    if (file.schemaVersion !== n + 1) throw new Error(`migration ${n} must produce schemaVersion ${n + 1}`);
  }
  return { ok: true, file, from: v };
}
