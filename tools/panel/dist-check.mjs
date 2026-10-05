// What a release folder of the panel must and must not hold (spec 8.1 «Сборка релиза»): the manifest for
// AEFT and PPRO, the page, the host bundle with the plugin version; no symlinks, .DS_Store, __MACOSX, ._*,
// .debug. Shared by the dev install, the ZXP packaging and the build test.
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { coversHosts, readManifest } from './manifest-info.mjs';

const JUNK = /^(\.DS_Store|__MACOSX|\._.*|\.debug|Thumbs\.db)$/;

function walk(dir, rel = '', out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const r = rel ? `${rel}/${name}` : name;
    const st = lstatSync(p);
    out.push({ rel: r, link: st.isSymbolicLink(), dir: st.isDirectory() });
    if (st.isDirectory() && !st.isSymbolicLink()) walk(p, r, out);
  }
  return out;
}

export function checkDist(dir, { version, allowDebug = false } = {}) {
  const problems = [];
  if (!existsSync(dir)) return { ok: false, problems: [`no folder ${dir}`], manifest: null };
  const entries = walk(dir);
  for (const e of entries) {
    if (e.link) problems.push(`symlink ${e.rel}`);
    const leaf = e.rel.split('/').pop();
    if (JUNK.test(leaf) && !(allowDebug && e.rel === '.debug')) problems.push(`junk ${e.rel}`);
  }
  const mf = path.join(dir, 'CSXS', 'manifest.xml');
  const manifest = existsSync(mf) ? readManifest(mf) : null;
  if (!manifest) problems.push('no CSXS/manifest.xml');
  else {
    const c = coversHosts(manifest, ['AEFT', 'PPRO']);
    if (!c.ok) problems.push('manifest does not cover AEFT and PPRO: ' + c.missing.join('; '));
    if (manifest.bundleId !== 'ru.cloud.brandkit') problems.push('bundle id ' + manifest.bundleId);
    if (version && manifest.bundleVersion !== version) problems.push(`manifest version ${manifest.bundleVersion}, plugin ${version}`);
  }
  if (!existsSync(path.join(dir, 'index.html'))) problems.push('no index.html');
  else if (/type="module"/.test(readFileSync(path.join(dir, 'index.html'), 'utf8'))) problems.push('index.html loads a module script (CEP opens file://)');
  const host = path.join(dir, 'host', 'brandkit.jsx');
  if (!existsSync(host)) problems.push('no host/brandkit.jsx');
  else {
    const src = readFileSync(host, 'utf8');
    if (/[^\x00-\x7f]/.test(src)) problems.push('host bundle is not ASCII');
    if (version && !src.includes(`BK.version = '${version}';`)) problems.push('host bundle has another version');
  }
  return { ok: problems.length === 0, problems, manifest, files: entries.filter((e) => !e.dir).length };
}
