#!/usr/bin/env node
// Debug a probe that dies with "EvalScript error": compose it like the spike runners do, wrap it in
// try/catch and print the ExtendScript error with its line, so the failing statement can be found.
//   node tools/debug-probe.mjs --host ae|pr --params '<json>' <file.jsx> [<file.jsx> ...]
import { composeProbe } from './spike/runner.mjs';
import { run, PRELUDE } from './host-run.mjs';

const argv = process.argv.slice(2);
const val = (f) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : null);
const host = val('--host');
const params = JSON.parse(val('--params') || '{}');
const files = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--host' && argv[i - 1] !== '--params');
if (!host || !files.length) {
  console.error("usage: node tools/debug-probe.mjs --host ae|pr --params '<json>' <file.jsx> [...]");
  process.exitCode = 2;
} else {
  // eval of the code as a string: a runtime error AND a syntax error (which a plain try/catch around
  // the code cannot catch, the host only says "EvalScript error") come back with their line.
  const body = composeProbe(files, params);
  const wrapped = 'try { eval(' + JSON.stringify(body) + '); } catch (__e) { '
    + 'JSON.stringify({ debugError: String(__e), line: __e.line }); }';
  const r = await run(host, wrapped, { timeoutMs: 120000, lint: false, prelude: true });
  console.log(JSON.stringify(r, null, 2).slice(0, 4000));
  if (r && r.line) {
    const lines = body.split('\n');
    const at = r.line - 1;
    for (let i = Math.max(0, at - 3); i <= Math.min(lines.length - 1, at + 2); i++) console.log((i === at ? '>> ' : '   ') + (i + 1) + ': ' + lines[i]);
  }
}
