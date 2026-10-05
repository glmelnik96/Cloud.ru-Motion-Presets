// Joins the host bundle the panel loads into AE and Premiere (spec 6 «Адаптеры»):
//   panel/host/common.jsx       BK.call, replies, its own JSON (BK.json), shared helpers
//   panel/host/ae.jsx, pr.jsx   adapters, picked by BridgeTalk.appName at call time
// Non-ASCII characters become \uXXXX: ExtendScript may read a file without a BOM in the system code page,
// and the lint allows non-ASCII only inside strings and comments, where the escape means the same.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');
const require = createRequire(import.meta.url);
const { lint } = require('../../tools/jsx/lint-jsx.cjs');

export const HOST_FILES = ['panel/host/common.jsx', 'panel/host/ae.jsx', 'panel/host/pr.jsx'];

export function asciiEscape(src) {
  return String(src).replace(/[\u0080-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

export function composeHost({ version = null } = {}) {
  const parts = HOST_FILES.map((f) => `// ---- ${f} ----\n` + readFileSync(path.join(REPO, f), 'utf8'));
  let src = parts.join('\n');
  if (version) src = src.replace(/BK\.version = '[^']*';/, `BK.version = '${version}';`);
  return asciiEscape(src);
}

// ES3 errors in any part of the bundle; warnings about the missing JSON.stringify tail do not apply to a library.
export function lintHost() {
  const out = [];
  for (const f of HOST_FILES) {
    const r = lint(readFileSync(path.join(REPO, f), 'utf8'), { lib: true });
    for (const e of r.errors) out.push(`${f}: ${e}`);
  }
  return out;
}
