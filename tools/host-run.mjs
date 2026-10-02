#!/usr/bin/env node
// Run JSX in a live AE or Premiere through the BrandKit dev panel (CDP 8094 / 8096).
//   node tools/host-run.mjs --host ae "@spikes/x.jsx"
//   node tools/host-run.mjs --host pr --timeout 300000 "JSON.stringify({ v: app.version })"
// The JSX must end with an expression that returns a JSON string (JSON.stringify(...) or finish(...)).
// No retries: a mutating call that timed out is never re-sent (spec §6).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPayload, parseResponse, hostPort } from './lib/payload.mjs';
import { getPageTarget, cdpEval } from './lib/cdp.mjs';

const require = createRequire(import.meta.url);
const { lint } = require('./jsx/lint-jsx.cjs');
const here = path.dirname(fileURLToPath(import.meta.url));

export const PRELUDE = readFileSync(path.join(here, 'jsx', 'prelude-json.jsx'), 'utf8');

export function lintOrThrow(jsx) {
  const r = lint(jsx, {});
  if (r.errors.length) throw new Error('LINT: ' + r.errors.join('; '));
  return r.warnings.filter((w) => !/last statement does not call JSON\.stringify/.test(w));
}

export async function run(host, jsx, { timeoutMs = 120000, lint: doLint = true, prelude = true } = {}) {
  if (doLint) lintOrThrow(jsx);
  const page = await getPageTarget(hostPort(host));
  const raw = await cdpEval(page.webSocketDebuggerUrl, buildPayload(jsx, prelude ? PRELUDE : ''), { timeoutMs });
  return parseResponse(raw);
}

export function parseCli(argv) {
  const o = { host: null, timeoutMs: 120000, lint: true, arg: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--host') { o.host = argv[i + 1]; i += 1; }
    else if (a === '--timeout') { o.timeoutMs = Number(argv[i + 1]); i += 1; }
    else if (a === '--no-lint') o.lint = false;
    else if (o.arg === null) o.arg = a;
  }
  return o;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const o = parseCli(process.argv.slice(2));
  if (!o.host || !o.arg) {
    console.error('usage: node tools/host-run.mjs --host ae|pr [--timeout ms] [--no-lint] "@file.jsx" | "<inline jsx>"');
    process.exit(2);
  }
  try {
    const jsx = o.arg.startsWith('@') ? readFileSync(o.arg.slice(1), 'utf8') : o.arg;
    if (o.lint) lintOrThrow(jsx).forEach((w) => console.error('LINT WARN: ' + w));
    const v = await run(o.host, jsx, { timeoutMs: o.timeoutMs, lint: false });
    console.log(JSON.stringify(v, null, 2));
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
}
