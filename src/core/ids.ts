// Identifiers. Same format as V2 (legacy L255: 'x' + 9 base-36 characters) so ids in files
// look familiar; the random source can be injected for deterministic tests.

export type Random = () => number;

let random: Random = Math.random;

/** Replace the random source (tests); returns the previous one. */
export function setRandom(next: Random): Random {
  const prev = random;
  random = next;
  return prev;
}

/** A new id: 'x' followed by 9 base-36 characters. */
export function uid(): string {
  let s = '';
  // random() may return 0 (or a value with few base-36 digits): always make progress
  while (s.length < 9) s += random().toString(36).slice(2) || '0';
  return 'x' + s.slice(0, 9).padEnd(9, '0');
}

/** Ids accepted in project files: letters, digits, '_' and '-', 1–64 characters. */
export const isValidId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);

/** Deep copy of plain JSON data (V2: clone). */
export const clone = <T>(value: T): T => structuredClone(value);
