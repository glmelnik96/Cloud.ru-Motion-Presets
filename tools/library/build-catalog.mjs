#!/usr/bin/env node
// Builds a library root from library.src.json and the pipeline outputs (spec 4.4 "Источник и каталог"):
//   <out>/library.json                       the catalog: files, sha256, bytes, versions; never edited by hand
//   <out>/items/<id>/<id>_v<N>.aep           T1 for AE: every format of the item in one project
//   <out>/items/<id>/<id>_<key>_v<N>.mogrt   T1 for Premiere: one MOGRT per variant
//   <out>/items/<id>/<id>_<key>_v<N>.<ext>   T2/T3: the variant file (.mov, .wav, .png, .svg, .ffx, .epr, .aom, .prtextstyle)
//   <out>/items/<id>/<id>_<key>_<part>_v<N>.mov   T2 with parts (intro, loop, outro)
//   <out>/items/<id>/preview.mp4, poster.jpg  the card, when the build has them
//   <out>/items/<id>/preview_<variant>[_<field>-<value>…].mp4, poster_<the same>.jpg   previews per format and
//                                             look (tools/masters/preview.mjs); in the catalog as previews[]
// Inputs come from <build>/<id>/ under the same names; MOGRTs from <build>/<id>/mogrt/ (tools/masters/package.mjs).
//   node tools/library/build-catalog.mjs [--src library/library.src.json] [--build <work>/build] [--out <work>/library]
//        [--version 2026.10.05] [--min-plugin 0.1.0] [--only LOGO_Shot,TTL_LowerThird]
// Nothing is written unless every selected item has its files and the catalog passes validate.mjs.
import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateLibrary } from './validate.mjs';
import { readMogrt } from '../spike/mogrt.mjs';
import { checkMogrt } from '../masters/package.mjs';
import { workPath } from '../lib/work.mjs';
import { parsePreviewName } from './preview-names.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const stripBom = (t) => (t.charCodeAt(0) === 0xfeff ? t.slice(1) : t);
const readJson = (p) => JSON.parse(stripBom(readFileSync(p, 'utf8')));
const MEDIA_EXT = ['mov', 'wav', 'png', 'svg', 'ffx', 'epr', 'aom', 'prtextstyle'];

export function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(file).on('data', (d) => h.update(d)).on('error', reject).on('end', () => resolve(h.digest('hex')));
  });
}

// calver of the day the build runs (YYYY.MM.DD), as library.schema.json wants it.
export function calver(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}.${p(date.getMonth() + 1)}.${p(date.getDate())}`;
}

// Reference builds of the brand fonts by PostScript name (brand/tokens.json, type.fonts).
export function fontBuilds(tokens) {
  const out = {};
  for (const f of Object.values((tokens.type && tokens.type.fonts) || {})) {
    if (f && f.postScriptName && f.build) out[f.postScriptName] = f.build;
  }
  return out;
}

// Where each file of an item comes from and where it goes, relative to the build and library roots.
export function itemFiles(item) {
  const v = item.version;
  const dir = `items/${item.id}`;
  const files = [];
  if (item.tier === 'T1' && item.hosts.includes('ae')) {
    files.push({ role: 'aep', from: `${item.id}/${item.id}_v${v}.aep`, to: `${dir}/${item.id}_v${v}.aep` });
  }
  for (const variant of item.variants) {
    const base = `${item.id}_${variant.key}_v${v}`;
    if (item.tier === 'T1') {
      if (item.hosts.includes('pr')) {
        files.push({ role: 'variant', key: variant.key, from: `${item.id}/mogrt/${base}.mogrt`, to: `${dir}/${base}.mogrt` });
      }
    } else if (variant.parts) {
      for (const [part, range] of Object.entries(variant.parts)) {
        const name = `${item.id}_${variant.key}_${part}_v${v}.mov`;
        files.push({ role: 'part', key: variant.key, part, frames: range[1] - range[0], from: `${item.id}/${name}`, to: `${dir}/${name}` });
      }
    } else {
      files.push({ role: 'variant', key: variant.key, from: `${item.id}/${base}`, to: `${dir}/${base}`, anyExt: MEDIA_EXT });
    }
  }
  files.push({ role: 'preview', from: `${item.id}/preview.mp4`, to: `${dir}/preview.mp4`, optional: true });
  files.push({ role: 'poster', from: `${item.id}/poster.jpg`, to: `${dir}/poster.jpg`, optional: true });
  return files;
}

// Previews per format and look found in <build>/<id>/: a video and its poster each; a name that fits no
// variant or field, or a video without a poster, is a problem.
export function previewSetFiles(item, buildDir, problems) {
  const dir = path.join(buildDir, item.id);
  if (!existsSync(dir)) return [];
  const names = readdirSync(dir);
  const out = [];
  for (const n of names.filter((x) => /^preview_.+\.mp4$/.test(x)).sort()) {
    const stem = n.slice('preview_'.length, -'.mp4'.length);
    if (!parsePreviewName(stem, item)) {
      problems.push(`${item.id}: ${n} names no variant or field of the item`);
      continue;
    }
    if (!names.includes(`poster_${stem}.jpg`)) {
      problems.push(`${item.id}: ${n} has no poster_${stem}.jpg`);
      continue;
    }
    for (const [role, file] of [['previewVideo', n], ['previewPoster', `poster_${stem}.jpg`]]) {
      out.push({ role, key: stem, from: `${item.id}/${file}`, to: `items/${item.id}/${file}` });
    }
  }
  return out;
}

// The file a build entry points at: its own name, or for anyExt the first extension that exists.
export function resolveSource(buildDir, f) {
  if (!f.anyExt) {
    const p = path.join(buildDir, f.from);
    return existsSync(p) ? { src: p, from: f.from, to: f.to } : null;
  }
  for (const ext of f.anyExt) {
    const p = path.join(buildDir, `${f.from}.${ext}`);
    if (existsSync(p)) return { src: p, from: `${f.from}.${ext}`, to: `${f.to}.${ext}` };
  }
  return null;
}

// A source item turned into a catalog item. `stored` maps a build entry to { file, sha256, bytes }.
export function catalogItem(item, stored, builds) {
  const out = structuredClone(item);
  if (out.requiredFonts) {
    out.requiredFonts = out.requiredFonts.map((f) => ({ postScriptName: f.postScriptName, build: f.build || builds[f.postScriptName] }));
  }
  const pick = (role, key, part) => stored.find((s) => s.role === role && s.key === key && s.part === part);
  out.variants = item.variants.map((src) => {
    const v = structuredClone(src);
    if (v.aeComp) v.aeComp = `${v.aeComp}_v${item.version}`;
    const file = pick('variant', src.key);
    if (file) Object.assign(v, { file: file.file, sha256: file.sha256, bytes: file.bytes });
    if (src.parts) {
      v.parts = {};
      for (const part of Object.keys(src.parts)) {
        const p = pick('part', src.key, part);
        v.parts[part] = { file: p.file, sha256: p.sha256, bytes: p.bytes, frames: p.frames };
      }
    }
    // minHostVersion is required in the catalog; a source without one gets the base of the test bed (spec 6).
    if (!v.minHostVersion) v.minHostVersion = Object.fromEntries(item.hosts.map((h) => [h, '26.0']));
    return v;
  });
  for (const role of ['aep', 'preview', 'poster']) {
    const s = pick(role);
    if (s) out[role] = { file: s.file, sha256: s.sha256, bytes: s.bytes };
  }
  const set = stored.filter((x) => x.role === 'previewVideo');
  if (set.length) {
    out.previews = set.map((v) => {
      const p = stored.find((x) => x.role === 'previewPoster' && x.key === v.key);
      const { variant, when } = parsePreviewName(v.key, item);
      const entry = { variant };
      if (Object.keys(when).length) entry.when = when;
      entry.video = { file: v.file, sha256: v.sha256, bytes: v.bytes };
      entry.poster = { file: p.file, sha256: p.sha256, bytes: p.bytes };
      return entry;
    });
  }
  return out;
}

// Essential Graphics labels and dropdown items a MOGRT must carry, from the source item.
export function mogrtExpectations(item) {
  const fields = (item.fields || []).filter((f) => f.egpName);
  return {
    labels: fields.map((f) => f.egpName),
    dropdowns: Object.fromEntries(fields.filter((f) => f.type === 'dropdown').map((f) => [f.egpName, f.options.map((o) => o.label_ru)])),
  };
}

export async function buildCatalog({ src, buildDir, outDir, libraryVersion = calver(), minPluginVersion = '0.1.0', only = null, tokens, write = true, now = new Date() }) {
  const builds = fontBuilds(tokens);
  const problems = [];
  const items = [];
  const copies = [];
  for (const item of src.items) {
    if (only && !only.includes(item.id)) continue;
    const stored = [];
    for (const f of [...itemFiles(item), ...previewSetFiles(item, buildDir, problems)]) {
      const found = resolveSource(buildDir, f);
      if (!found) {
        if (!f.optional) problems.push(`${item.id}: missing ${f.from}${f.anyExt ? '.{' + f.anyExt.join(',') + '}' : ''}`);
        continue;
      }
      const bytes = statSync(found.src).size;
      stored.push({ role: f.role, key: f.key, part: f.part, frames: f.frames, file: found.to, sha256: await sha256File(found.src), bytes });
      copies.push({ src: found.src, dst: path.join(outDir, found.to), sha256: stored[stored.length - 1].sha256, bytes });
      if (found.to.endsWith('.mogrt')) {
        const c = checkMogrt(readMogrt(found.src), mogrtExpectations(item));
        if (!c.ok) problems.push(`${item.id}: ${path.basename(found.to)}: ${c.problems.join('; ')}`);
      }
    }
    for (const f of item.requiredFonts || []) {
      if (!f.build && !builds[f.postScriptName]) problems.push(`${item.id}: no reference build for ${f.postScriptName} in brand/tokens.json`);
    }
    items.push(catalogItem(item, stored, builds));
  }
  const catalog = {
    schemaVersion: 1,
    libraryVersion,
    minPluginVersion,
    generatedAt: now.toISOString().replace(/\.\d+Z$/, 'Z'),
    items,
  };
  if (!problems.length) {
    const v = validateLibrary(catalog, 'catalog');
    if (!v.ok) problems.push(...v.errors);
  }
  if (problems.length || !write) return { ok: !problems.length, problems, catalog, copies };
  for (const c of copies) {
    // A file already there with the same content stays: a host may hold it open (Premiere kept a library
    // PNG it had imported, and the next build failed with EBUSY, 2026-10-05).
    if (existsSync(c.dst) && statSync(c.dst).size === c.bytes && (await sha256File(c.dst)) === c.sha256) continue;
    mkdirSync(path.dirname(c.dst), { recursive: true });
    copyFileSync(c.src, c.dst);
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'library.json'), JSON.stringify(catalog, null, 2) + '\n', 'utf8');
  return { ok: true, problems, catalog, copies };
}

export function parseArgs(argv) {
  const get = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
  return {
    src: get('--src') || path.join(REPO, 'library', 'library.src.json'),
    buildDir: get('--build') || workPath('build'),
    outDir: get('--out') || workPath('library'),
    libraryVersion: get('--version'),
    minPluginVersion: get('--min-plugin'),
    only: get('--only') ? get('--only').split(',') : null,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const a = parseArgs(process.argv.slice(2));
  const r = await buildCatalog({
    src: readJson(a.src),
    buildDir: a.buildDir,
    outDir: a.outDir,
    libraryVersion: a.libraryVersion || calver(),
    minPluginVersion: a.minPluginVersion || '0.1.0',
    only: a.only,
    tokens: readJson(path.join(REPO, 'brand', 'tokens.json')),
  });
  if (!r.ok) {
    for (const p of r.problems) console.error(p);
    console.error(`FAIL: ${r.problems.length} problem(s); nothing written to ${a.outDir}`);
    process.exit(1);
  }
  const bytes = r.copies.reduce((n, c) => n + statSync(c.src).size, 0);
  console.log(`OK ${path.join(a.outDir, 'library.json')}: ${r.catalog.libraryVersion}, ${r.catalog.items.length} items, ${r.copies.length} files, ${(bytes / 1048576).toFixed(1)} MB`);
}
