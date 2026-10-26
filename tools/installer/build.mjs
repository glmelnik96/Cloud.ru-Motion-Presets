#!/usr/bin/env node
// Release package of Cloud.ru BrandKit (spec 8.1): one folder and ONE zip with everything (user 2026-10-26: one
// archive for the team, a window with boxes, the AME presets ticked).
//   node tools/installer/build.mjs --zxp <signed.zxp> [--library <root>] [--out <dir>]
//   node tools/installer/build.mjs --unsigned [--library <root>] [--out <dir>]     (panel/dist, for checks)
// Layout:
//   CloudRuBrandKit-<plugin>-<library>/
//     Установить (Windows).cmd     opens files\setup.ps1, the window of the installer (tools/installer/setup.cmd)
//     Установить (Mac).command     dialogs of macOS, then files/install.command (tools/installer/setup.command)
//     Как установить.pdf           for the editors (tools/installer/docs.mjs); .html where the build has no Chrome
//     Руководство монтажёра.pdf    docs/guide/panel.md
//     files/
//       setup.ps1                  the window (Windows); install.cmd and install.ps1 — the work, also without the window
//       install.command            the work on macOS
//       README.txt                 for IT: the silent install, its keys and exit codes
//       payload/VERSION            plugin=, library=, signed=
//       payload/extension/         the panel: the signed ZXP unpacked (its signature stays valid unpacked)
//       payload/library/           the library root with library.json, checked against its sha256
//       payload/library-<option>/  the files of an installer option (D24) under the library's paths: «4k» the 4K loops and
//       payload/VERSION-<option>   clips, «music» the stock music; library=, bytes=, files=
//       payload/mogrt.txt          MOGRTs the installers copy flat into Local Templates
//       payload/ame.txt            brand .epr presets: <path in the library><TAB><preset file name>, for --with-ame
//       payload/aom.txt            the AE Output Module templates (.aom) in the library: the installers say how to load it
// The installers need no Node: they read only these text files.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, chmodSync } from 'node:fs';
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
import { findChrome, guideHtml, howToInstallHtml, writeDocument } from './docs.mjs';
import { setUnixMode } from './zip-mode.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');
const JUNK = /(^|\/)(\.DS_Store|__MACOSX|\._[^/]*|Thumbs\.db|\.debug)$/;

// The names the editors see in the package
export const LAUNCH_WIN = 'Установить (Windows).cmd';
export const LAUNCH_MAC = 'Установить (Mac).command';
export const HOW_TO = 'Как установить';
export const GUIDE = 'Руководство монтажёра';

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

// The installer options (D24): the pack key and its section of files/README.txt.
export const OPTIONS = [
  { key: '4k', section: '4K' },
  { key: 'music', section: 'MUSIC' },
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

// A zip of <parent>/<name>, deflated (the sounds and the music are WAV: the package of 2026-10-26 shrank from 5.18 to
// 3.97 GB), with the names in UTF-8 and its flag: the launchers and documents have Russian names. bsdtar (Windows 10+,
// macOS) streams it — the package runs to gigabytes, zip64 past 4 GB; adm-zip builds a zip in memory, for the rest.
export function zipFolder(parent, name, zipFile, platform = process.platform) {
  const tar = platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : platform === 'darwin' ? '/usr/bin/tar' : null;
  if (tar && existsSync(tar)) {
    const r = spawnSync(tar, ['-a', '-c', '-f', zipFile, '--options', 'zip:compression=deflate,zip:hdrcharset=UTF-8', '-C', parent, name], { encoding: 'utf8', windowsHide: true });
    if (r.status !== 0) throw new Error(`tar: ${r.status} ${(r.stderr || '').slice(0, 400)}`);
    return 'tar';
  }
  const zip = new AdmZip();
  zip.addLocalFolder(path.join(parent, name), name);
  for (const e of zip.getEntries()) e.header.flags |= 0x800;
  zip.writeZip(zipFile);
  return 'adm-zip';
}

const crlf = (s) => s.replace(/\r?\n/g, '\r\n');
const bytesOf = (dir) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).reduce((a, e) => a + (e.isDirectory() ? bytesOf(path.join(dir, e.name)) : statSync(path.join(dir, e.name)).size), 0) : 0);

export async function buildPackage({ zxp = null, unsigned = false, dist = path.join(REPO, 'panel', 'dist'), library, out, chrome = findChrome() }) {
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
  const files = path.join(dir, 'files');
  const payload = path.join(files, 'payload');
  mkdirSync(payload, { recursive: true });
  const ext = path.join(payload, 'extension');
  if (zxp) new AdmZip(zxp).extractAllTo(ext, true);
  else copyTree(dist, ext);
  const extCheck = checkDist(ext, { version });
  if (!extCheck.ok) return { ok: false, problems: extCheck.problems.map((p) => 'extension: ' + p) };
  // the files of the options go to folders of their own: the installer puts them only when they are asked for
  const options = OPTIONS.map((o) => ({ ...o, files: packFiles(lib.catalog, o.key) })).map((o) => ({ ...o, bytes: o.files.reduce((s, f) => s + f.bytes, 0) }));
  const inPack = new Set(options.flatMap((o) => o.files.map((f) => f.file)));
  const rel = (src) => path.relative(library, src).replace(/\\/g, '/');
  copyTree(library, path.join(payload, 'library'), { filter: (src) => !JUNK.test(src.replace(/\\/g, '/')) && !inPack.has(rel(src)) });
  const packs = {};
  for (const o of options) {
    if (!o.files.length) continue;
    for (const f of o.files) {
      const to = path.join(payload, `library-${o.key}`, f.file);
      mkdirSync(path.dirname(to), { recursive: true });
      copyFileSync(path.join(library, f.file), to);
    }
    writeFileSync(path.join(payload, `VERSION-${o.key}`), `library=${lib.catalog.libraryVersion}\nbytes=${o.bytes}\nfiles=${o.files.length}\n`, 'utf8');
    packs[o.key] = { files: o.files.length, bytes: o.bytes };
  }
  writeFileSync(path.join(payload, 'VERSION'), `plugin=${version}\nlibrary=${lib.catalog.libraryVersion}\nsigned=${zxp ? 1 : 0}\n`, 'utf8');
  writeFileSync(path.join(payload, 'mogrt.txt'), lib.mogrts.map((m) => m + '\n').join(''), 'utf8');
  writeFileSync(path.join(payload, 'ame.txt'), lib.ame.map((a) => `${a.file}\t${a.name}\n`).join(''), 'utf8');
  writeFileSync(path.join(payload, 'aom.txt'), lib.aom ? lib.aom + '\n' : '', 'utf8');

  const read = (f) => readFileSync(path.join(here, f), 'utf8');
  // Windows PowerShell 5.1 reads a script without a BOM in the ANSI code page: the Russian words need it.
  writeFileSync(path.join(files, 'install.ps1'), '﻿' + crlf(read('install.ps1')), 'utf8');
  writeFileSync(path.join(files, 'setup.ps1'), '﻿' + crlf(read('setup.ps1')), 'utf8');
  writeFileSync(path.join(files, 'install.cmd'), crlf(read('install.cmd')), 'utf8');
  writeFileSync(path.join(files, 'install.command'), read('install.command'), 'utf8');
  chmodSync(path.join(files, 'install.command'), 0o755);
  writeFileSync(path.join(dir, LAUNCH_WIN), crlf(read('setup.cmd')), 'utf8');
  writeFileSync(path.join(dir, LAUNCH_MAC), read('setup.command'), 'utf8');
  chmodSync(path.join(dir, LAUNCH_MAC), 0o755);
  const gb = (b) => `${(b / 1073741824).toFixed(1).replace('.', ',')} ГБ`;
  // the section of an option in the README only when the package has it, its markers gone
  let readme = read('README.txt');
  for (const o of options) {
    const re = new RegExp(`\\[${o.section}\\]\\r?\\n([\\s\\S]*?)\\[\\/${o.section}\\]\\r?\\n`);
    readme = readme.replace(re, (m, body) => (o.files.length ? body : '')).replace(new RegExp(`\\{size${o.key}\\}`, 'g'), gb(o.bytes));
  }
  writeFileSync(path.join(files, 'README.txt'), '﻿' + crlf(readme.replace(/\{plugin\}/g, version).replace(/\{library\}/g, lib.catalog.libraryVersion).replace(/\{name\}/g, name)), 'utf8');

  // The documents of the editors: «Как установить» with the window of the installer, and their guide.
  const shotFile = path.join(here, 'img', 'setup-windows.png');
  const shot = existsSync(shotFile) ? `data:image/png;base64,${readFileSync(shotFile).toString('base64')}` : null;
  const base = bytesOf(path.join(payload, 'library')) + bytesOf(ext);
  const docs = [
    writeDocument(howToInstallHtml({ plugin: version, library: lib.catalog.libraryVersion, base, k4: packs['4k']?.bytes ?? 0, music: packs.music?.bytes ?? 0, shot }), path.join(dir, HOW_TO), { chrome }),
    writeDocument(guideHtml(readFileSync(path.join(REPO, 'docs', 'guide', 'panel.md'), 'utf8'), { plugin: version }), path.join(dir, GUIDE), { chrome }),
  ];

  // One zip; the launchers of macOS keep their executable bit (made on Windows, the zip has none: patched in).
  const zipFile = path.join(out, `${name}.zip`);
  rmSync(zipFile, { force: true });
  const how = zipFolder(out, name, zipFile);
  if (how === 'tar') setUnixMode(zipFile, (n) => n.endsWith('.command'), 0o100755);
  else {
    const z = new AdmZip(zipFile);
    for (const e of z.getEntries()) e.attr = (((e.entryName.endsWith('.command') ? 0o100755 : e.isDirectory ? 0o040755 : 0o100644) << 16) >>> 0);
    z.writeZip(zipFile);
  }
  return { ok: true, problems: [], dir, zip: zipFile, packs, docs, name, mogrts: lib.mogrts.length, signed: Boolean(zxp) };
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
  const opts = Object.entries(r.packs).map(([k, p]) => `${k} ${p.files} files`).join(', ') || 'no options';
  console.log(`OK ${r.zip}: ${r.mogrts} MOGRT, ${r.signed ? 'signed' : 'UNSIGNED (PlayerDebugMode needed)'}, ${opts}, ${r.docs.join(', ')}, ${(statSync(r.zip).size / 1073741824).toFixed(2)} GB`);
}
