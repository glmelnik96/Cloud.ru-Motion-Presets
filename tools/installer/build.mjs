#!/usr/bin/env node
// Release package of Cloud.ru BrandKit (spec 8.1): one folder and one zip with both installers.
//   node tools/installer/build.mjs --zxp <signed.zxp> [--library <root>] [--out <dir>]
//   node tools/installer/build.mjs --unsigned [--library <root>] [--out <dir>]     (panel/dist, for checks)
// Layout:
//   CloudRuBrandKit-<plugin>-<library>/
//     install.cmd, install.ps1 (Windows), install.command (macOS), README.txt
//     payload/VERSION            plugin=, library=, signed=
//     payload/extension/         the panel: the signed ZXP unpacked (its signature stays valid unpacked)
//     payload/library/           the library root with library.json, checked against its sha256
//     payload/mogrt.txt          MOGRTs the installers copy flat into Local Templates
// The installers need no Node: they read only VERSION and mogrt.txt.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import { checkDist } from '../panel/dist-check.mjs';
import { zxpInfo } from '../panel/zxp-info.mjs';
import { sha256File } from '../library/build-catalog.mjs';
import { validateLibrary } from '../library/validate.mjs';
import { workPath } from '../lib/work.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');
const JUNK = /(^|\/)(\.DS_Store|__MACOSX|\._[^/]*|Thumbs\.db|\.debug)$/;

export function pluginVersion() {
  return JSON.parse(readFileSync(path.join(REPO, 'panel', 'package.json'), 'utf8')).version;
}

// Every file the catalog names, with its sha256 and size checked; the MOGRTs to flatten, without name clashes.
export async function checkLibrary(root) {
  const problems = [];
  const file = path.join(root, 'library.json');
  if (!existsSync(file)) return { ok: false, problems: [`no ${file}`], catalog: null, mogrts: [] };
  const catalog = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''));
  const v = validateLibrary(catalog, 'catalog');
  problems.push(...v.errors);
  const stored = [];
  for (const it of catalog.items ?? []) {
    for (const k of ['aep', 'preview', 'poster']) if (it[k]) stored.push(it[k]);
    for (const variant of it.variants ?? []) {
      if (variant.file) stored.push({ file: variant.file, sha256: variant.sha256, bytes: variant.bytes });
      for (const p of Object.values(variant.parts ?? {})) stored.push(p);
    }
  }
  for (const s of stored) {
    const p = path.join(root, s.file);
    if (!existsSync(p)) problems.push(`missing ${s.file}`);
    else if (statSync(p).size !== s.bytes || (await sha256File(p)) !== s.sha256) problems.push(`${s.file} differs from library.json`);
  }
  const mogrts = [...new Set(stored.map((s) => s.file).filter((f) => f.endsWith('.mogrt')))].sort();
  const names = new Map();
  for (const m of mogrts) {
    const leaf = m.split('/').pop();
    if (!/^[A-Za-z0-9_-]+\.mogrt$/.test(leaf)) problems.push(`MOGRT name not ASCII: ${leaf}`);
    if (names.has(leaf)) problems.push(`two MOGRTs named ${leaf}: ${names.get(leaf)}, ${m}`);
    names.set(leaf, m);
  }
  return { ok: problems.length === 0, problems, catalog, mogrts };
}

const crlf = (s) => s.replace(/\r?\n/g, '\r\n');

export async function buildPackage({ zxp = null, unsigned = false, dist = path.join(REPO, 'panel', 'dist'), library, out }) {
  const version = pluginVersion();
  const problems = [];
  if (!zxp && !unsigned) problems.push('give --zxp <signed.zxp>, or --unsigned for a check build');
  if (zxp) {
    const z = zxpInfo(zxp);
    if (!z.signed) problems.push(`${zxp} is not signed`);
    if (z.hasDebugFile) problems.push(`${zxp} carries a .debug file`);
    if (z.manifest?.bundleVersion !== version) problems.push(`${zxp} is panel ${z.manifest?.bundleVersion}, panel/package.json says ${version}`);
  } else if (unsigned) {
    const d = checkDist(dist, { version });
    problems.push(...d.problems.map((p) => 'panel/dist: ' + p));
  }
  const lib = await checkLibrary(library);
  problems.push(...lib.problems.map((p) => 'library: ' + p));
  if (problems.length) return { ok: false, problems };

  const name = `CloudRuBrandKit-${version}-${lib.catalog.libraryVersion}`;
  const dir = path.join(out, name);
  rmSync(dir, { recursive: true, force: true });
  const payload = path.join(dir, 'payload');
  mkdirSync(payload, { recursive: true });
  const ext = path.join(payload, 'extension');
  if (zxp) new AdmZip(zxp).extractAllTo(ext, true);
  else cpSync(dist, ext, { recursive: true });
  const extCheck = checkDist(ext, { version });
  if (!extCheck.ok) return { ok: false, problems: extCheck.problems.map((p) => 'extension: ' + p) };
  cpSync(library, path.join(payload, 'library'), { recursive: true, filter: (src) => !JUNK.test(src.replace(/\\/g, '/')) });
  writeFileSync(path.join(payload, 'VERSION'), `plugin=${version}\nlibrary=${lib.catalog.libraryVersion}\nsigned=${zxp ? 1 : 0}\n`, 'utf8');
  writeFileSync(path.join(payload, 'mogrt.txt'), lib.mogrts.map((m) => m + '\n').join(''), 'utf8');

  const read = (f) => readFileSync(path.join(here, f), 'utf8');
  writeFileSync(path.join(dir, 'install.command'), read('install.command'), 'utf8');
  chmodSync(path.join(dir, 'install.command'), 0o755);
  // Windows PowerShell 5.1 reads a script without a BOM in the ANSI code page: the Russian messages need it.
  writeFileSync(path.join(dir, 'install.ps1'), '﻿' + crlf(read('install.ps1')), 'utf8');
  writeFileSync(path.join(dir, 'install.cmd'), crlf(read('install.cmd')), 'utf8');
  writeFileSync(path.join(dir, 'README.txt'), '﻿' + crlf(read('README.txt')
    .replace(/\{plugin\}/g, version).replace(/\{library\}/g, lib.catalog.libraryVersion)), 'utf8');

  // The zip keeps the folder and the executable bit of install.command (unix mode in the external attributes).
  const zip = new AdmZip();
  zip.addLocalFolder(dir, name);
  for (const e of zip.getEntries()) {
    const mode = e.entryName.endsWith('install.command') ? 0o100755 : e.isDirectory ? 0o040755 : 0o100644;
    e.attr = (mode << 16) >>> 0;
  }
  const zipFile = path.join(out, `${name}.zip`);
  rmSync(zipFile, { force: true });
  zip.writeZip(zipFile);
  return { ok: true, problems: [], dir, zip: zipFile, name, mogrts: lib.mogrts.length, signed: Boolean(zxp) };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const get = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
  const r = await buildPackage({
    zxp: get('--zxp') ?? null,
    unsigned: argv.includes('--unsigned'),
    library: get('--library') ?? workPath('library'),
    out: get('--out') ?? workPath('release'),
  });
  if (!r.ok) {
    for (const p of r.problems) console.error(p);
    console.error('FAIL: nothing packaged');
    process.exit(1);
  }
  console.log(`OK ${r.zip}: ${r.mogrts} MOGRT, ${r.signed ? 'signed' : 'UNSIGNED (PlayerDebugMode needed)'}, ${(statSync(r.zip).size / 1048576).toFixed(1)} MB`);
}
