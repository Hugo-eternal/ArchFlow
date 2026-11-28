// v2-fix: list the top-level statements on given lines of legacy/app.zh-Hant.html (each line parsed alone with
// the TypeScript parser), to check that a line holds only the override layer being removed.
// Usage: node scripts/audit/statements.mjs 597 629 668
import fs from 'node:fs';
import ts from 'typescript';
const L = fs.readFileSync(new URL('../../legacy/app.zh-Hant.html', import.meta.url), 'utf8').split('\n');
for (const n of process.argv.slice(2).map(Number)) {
  const src = ts.createSourceFile('l.js', L[n - 1], ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const diags = src.parseDiagnostics?.length || 0;
  console.log(n, `${src.statements.length} statement(s)${diags ? `, ${diags} parse error(s)` : ''}:`,
    src.statements.map(s => L[n - 1].slice(s.getStart(src), Math.min(s.end, s.getStart(src) + 70))).join(' || '));
}
