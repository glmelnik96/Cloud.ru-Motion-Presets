#!/usr/bin/env node
// Release package of Cloud.ru BrandKit (spec 8.1): one folder and one zip with both installers.
//   node tools/installer/build.mjs --zxp <signed.zxp> [--library <root>] [--out <dir>]
//   node tools/installer/build.mjs --unsigned [--library <root>] [--out <dir>]     (panel/dist, for checks)
// Layout:
//   CloudRuBrandKit-<plugin>-<library>/
//     install.cmd, install.ps1 (Windows), install.command (macOS), README.txt, guide.md (docs/guide/panel.md)
//     payload/VERSION            plugin=, library=, signed=
//     payload/extension/         the panel: the signed ZXP unpacked (its signature stays valid unpacked)
//     payload/library/           the library root with library.json, checked against its sha256
//     payload/mogrt.txt          MOGRTs the installers copy flat into Local Templates
//     payload/ame.txt            brand .epr presets: <path in the library><TAB><preset file name>, for --with-ame
//     payload/aom.txt            the AE Output Module templates (.aom) in the library: the installers say how to load it
//   CloudRuBrandKit-<plugin>-<library>-<option>.zip   an installer option (D24), when the catalog has variants of
//   its pack — «4k» the 4K loops and clips, «music» the stock music:
//     <the same folder>/payload/library-<option>/   their files under the library's paths, out of payload/library
//     <the same folder>/payload/VERSION-<option>    library=, bytes=, files=
//   unpacked over the base folder; install-<option>.cmd or install.command --with-<option> installs them.
// The installers need no Node: they read only these text files.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import { checkDist } from '../panel/dist-check.mjs';
import { zxpInfo } from '../panel/zxp-info.mjs';
import { sha256File } from '../library/build-catalog.mjs';
import { validateLibrary } from '../library/validate.mjs';
import { workPath } from '../lib/work.mjs';
import { copyTree } from '../lib/copy-tree.mjs';

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
  if (!existsSync(file)) return { ok: false, problems: [`no ${file}`], catalog: null, mogrts: [], ame: [], aom: null };
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
  return { ok: problems.length === 0, problems, catalog, mogrts, ...exportFiles(catalog, problems) };
}

// The export presets of the catalog (decisions P18, P21): every .epr under the name of its AE template, which
// Media Encoder shows as the preset name («CR FullHD.epr»), and the one .aom.
export function exportFiles(catalog, problems = []) {
  const ame = [];
  let aom = null;
  for (const it of catalog.items ?? []) {
    if (it.category !== 'export') continue;
    for (const v of it.variants ?? []) {
      if (v.key === 'epr' && v.file) {
        const name = `${it.omTemplate || it.id}.epr`;
        if (!/^[A-Za-z0-9 _-]+\.epr$/.test(name)) problems.push(`preset name not ASCII: ${name}`);
        else ame.push({ file: v.file, name });
      }
      if (v.key === 'aom' && v.file) aom = v.file;
    }
  }
  return { ame, aom };
}

// The installer options (D24): the pack key, its launcher for a double click, its section of README.txt.
export const OPTIONS = [
  { key: '4k', launcher: 'install-4k.cmd', section: '4K' },
  { key: 'music', launcher: 'install-music.cmd', section: 'MUSIC' },
];

// The files of an installer option (D24): every file of the variants of the pack, with its size.
export function packFiles(catalog, pack = '4k') {
  const files = [];
  for (const it of catalog.items ?? []) {
    for (const v of it.variants ?? []) {
      if (v.pack !== pack) continue;
      if (v.file) files.push({ file: v.file, bytes: v.bytes });
      for (const p of Object.values(v.parts ?? {})) files.push({ file: p.file, bytes: p.bytes });
    }
  }
  return files;
}

// A zip of <parent>/<name> with the files stored as they are (the loops are compressed already). bsdtar (Windows 10+,
// macOS) streams it: the 4K files run to gigabytes, adm-zip builds a zip in memory and stays for the rest.
export function zipStored(parent, name, zipFile, platform = process.platform) {
  const tar = platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : platform === 'darwin' ? '/usr/bin/tar' : null;
  if (tar && existsSync(tar)) {
    const r = spawnSync(tar, ['-a', '-c', '-f', zipFile, '--options', 'zip:compression=store', '-C', parent, name], { encoding: 'utf8', windowsHide: true });
    if (r.status !== 0) throw new Error(`tar: ${r.status} ${(r.stderr || '').slice(0, 400)}`);
    return 'tar';
  }
  const zip = new AdmZip();
  zip.addLocalFolder(path.join(parent, name), name);
  zip.writeZip(zipFile);
  return 'adm-zip';
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
  else copyTree(dist, ext);
  const extCheck = checkDist(ext, { version });
  if (!extCheck.ok) return { ok: false, problems: extCheck.problems.map((p) => 'extension: ' + p) };
  // the files of the options stay out of the base payload: each goes to an archive of its own
  const options = OPTIONS.map((o) => ({ ...o, files: packFiles(lib.catalog, o.key) })).map((o) => ({ ...o, bytes: o.files.reduce((s, f) => s + f.bytes, 0) }));
  const inPack = new Set(options.flatMap((o) => o.files.map((f) => f.file)));
  const rel = (src) => path.relative(library, src).replace(/\\/g, '/');
  copyTree(library, path.join(payload, 'library'), { filter: (src) => !JUNK.test(src.replace(/\\/g, '/')) && !inPack.has(rel(src)) });
  writeFileSync(path.join(payload, 'VERSION'), `plugin=${version}\nlibrary=${lib.catalog.libraryVersion}\nsigned=${zxp ? 1 : 0}\n`, 'utf8');
  writeFileSync(path.join(payload, 'mogrt.txt'), lib.mogrts.map((m) => m + '\n').join(''), 'utf8');
  writeFileSync(path.join(payload, 'ame.txt'), lib.ame.map((a) => `${a.file}\t${a.name}\n`).join(''), 'utf8');
  writeFileSync(path.join(payload, 'aom.txt'), lib.aom ? lib.aom + '\n' : '', 'utf8');

  const read = (f) => readFileSync(path.join(here, f), 'utf8');
  writeFileSync(path.join(dir, 'install.command'), read('install.command'), 'utf8');
  chmodSync(path.join(dir, 'install.command'), 0o755);
  // Windows PowerShell 5.1 reads a script without a BOM in the ANSI code page: the Russian messages need it.
  writeFileSync(path.join(dir, 'install.ps1'), '﻿' + crlf(read('install.ps1')), 'utf8');
  writeFileSync(path.join(dir, 'install.cmd'), crlf(read('install.cmd')), 'utf8');
  for (const o of options) if (o.files.length) writeFileSync(path.join(dir, o.launcher), crlf(read(o.launcher)), 'utf8');
  const gb = (b) => `${(b / 1073741824).toFixed(1).replace('.', ',')} ГБ`;
  // the section of an option in the README only when the package has it, its markers gone
  let readme = read('README.txt');
  for (const o of options) {
    const re = new RegExp(`\\r?\\n?\\[${o.section}\\]\\r?\\n([\\s\\S]*?)\\[\\/${o.section}\\]\\r?\\n`);
    readme = readme.replace(re, (m, body) => (o.files.length ? '\n' + body : '\n')).replace(new RegExp(`\\{size${o.key}\\}`, 'g'), gb(o.bytes));
  }
  writeFileSync(path.join(dir, 'README.txt'), '﻿' + crlf(readme
    .replace(/\{plugin\}/g, version).replace(/\{library\}/g, lib.catalog.libraryVersion).replace(/\{name\}/g, name)), 'utf8');
  // The guide of the editors for the pilot (docs/guide/panel.md), with a BOM for Windows editors.
  writeFileSync(path.join(dir, 'guide.md'), '\uFEFF' + crlf(readFileSync(path.join(REPO, 'docs', 'guide', 'panel.md'), 'utf8')), 'utf8');

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

  // Each option: its files under the same folder name, so that its archive unpacks over the base one.
  const packs = {};
  for (const o of options) {
    if (!o.files.length) continue;
    const stage = path.join(out, `${name}-${o.key}`);
    rmSync(stage, { recursive: true, force: true });
    const pp = path.join(stage, name, 'payload');
    for (const f of o.files) {
      const to = path.join(pp, `library-${o.key}`, f.file);
      mkdirSync(path.dirname(to), { recursive: true });
      copyFileSync(path.join(library, f.file), to);
    }
    writeFileSync(path.join(pp, `VERSION-${o.key}`), `library=${lib.catalog.libraryVersion}\nbytes=${o.bytes}\nfiles=${o.files.length}\n`, 'utf8');
    const zipOpt = path.join(out, `${name}-${o.key}.zip`);
    rmSync(zipOpt, { force: true });
    zipStored(stage, name, zipOpt);
    packs[o.key] = { zip: zipOpt, files: o.files.length, bytes: o.bytes };
  }
  return { ok: true, problems: [], dir, zip: zipFile, packs, name, mogrts: lib.mogrts.length, signed: Boolean(zxp) };
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
  for (const [key, p] of Object.entries(r.packs)) console.log(`OK ${p.zip}: the option «${key}», ${p.files} files, ${(statSync(p.zip).size / 1048576).toFixed(1)} MB`);
}
