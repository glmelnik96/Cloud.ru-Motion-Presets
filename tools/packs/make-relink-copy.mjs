#!/usr/bin/env node
// Relink-only working copy of a pack (spec §3.2): <packs>/<slug>/<slug>.aep next to its (Footage)
// tree. Names become NFC, the two AI clips get short names, renders and macOS metadata are not
// copied. relink-map.json maps every old relative path (NFC) to the new absolute path.
//   node tools/packs/make-relink-copy.mjs --all | --slug webinars [--src DIR]
// The default source is the frozen archive (Task 1); its manifest checks every copied byte.
import {
  chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, utimesSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { walkFiles, sha256File, isMacJunk, isRenderPath } from './fsutil.mjs';
import { PACKS, SLUGS, RENAMES } from './packs.mjs';
import { nfc } from './slug.mjs';
import { archiveDir, packDir } from './paths.mjs';

export const MAX_PATH = 240; // Windows MAX_PATH is 260; keep room for AE's own suffixes
export const MAP_FILE = 'relink-map.json';

// files: package-relative paths of the footage files (as on disk). Returns what to copy where.
export function planCopy({ slug, aepRel, files, renames = [] }) {
  const base = path.posix.dirname(aepRel);
  const entries = [{ src: aepRel, old: path.posix.basename(aepRel), new: slug + '.aep', kind: 'aep' }];
  const skipped = [];
  for (const rel of files) {
    const old = path.posix.relative(base, rel);
    if (isMacJunk(old)) { skipped.push({ old, reason: 'macos-metadata' }); continue; }
    if (isRenderPath(old)) { skipped.push({ old, reason: 'render' }); continue; }
    const parts = nfc(old).split('/');
    const name = parts.pop();
    const rule = renames.find((r) => r.match.test(name));
    entries.push({
      src: rel, old, new: parts.concat([rule ? rule.to : name]).join('/'), kind: 'footage',
      renamed: Boolean(rule), nfcChanged: nfc(old) !== old,
    });
  }
  const seen = new Map();
  for (const e of entries) {
    const k = e.new.toLowerCase(); // NTFS and APFS are case-insensitive
    if (seen.has(k)) throw new Error('NAME_CLASH: "' + seen.get(k) + '" and "' + e.old + '" -> ' + e.new);
    seen.set(k, e.old);
  }
  for (const r of renames) {
    if (!entries.some((e) => e.renamed && path.posix.basename(e.new) === r.to)) throw new Error('RENAME_NOT_FOUND: ' + r.to);
  }
  return { entries, skipped };
}

export async function makeRelinkCopy({ slug, srcRoot, outDir, manifest = null }) {
  const pack = PACKS[slug];
  if (!pack) throw new Error('UNKNOWN_SLUG: ' + slug);
  if (existsSync(outDir) && readdirSync(outDir).length) {
    throw new Error('PACK_EXISTS: ' + outDir + ' is not empty; delete it by hand to make a fresh copy');
  }
  const files = pack.footage ? walkFiles(path.join(srcRoot, pack.footage)).map((r) => pack.footage + '/' + r) : [];
  const { entries, skipped } = planCopy({ slug, aepRel: pack.aep, files, renames: RENAMES[slug] || [] });
  for (const e of entries) {
    e.abs = path.posix.join(outDir, e.new);
    if (e.abs.length > MAX_PATH) throw new Error('PATH_TOO_LONG (' + e.abs.length + '): ' + e.abs);
  }
  const hashes = manifest ? new Map(manifest.files.map((f) => [f.path, f.sha256])) : null;
  for (const e of entries) {
    const from = path.join(srcRoot, e.src);
    const st = statSync(from);
    mkdirSync(path.dirname(e.abs), { recursive: true });
    copyFileSync(from, e.abs);
    chmodSync(e.abs, 0o644); // archive files are read-only; the copy must stay writable for AE
    utimesSync(e.abs, st.atime, st.mtime);
    e.size = st.size;
    if (hashes) {
      if (!hashes.has(e.src)) throw new Error('NOT_IN_MANIFEST: ' + e.src);
      e.sha256 = await sha256File(e.abs);
      if (e.sha256 !== hashes.get(e.src)) throw new Error('HASH_MISMATCH: ' + e.src);
    }
  }
  const map = {};
  for (const e of entries) if (e.kind === 'footage') map[nfc(e.old)] = e.abs;
  const doc = {
    slug,
    source: { root: String(srcRoot).replace(/\\/g, '/'), aep: pack.aep, verified: Boolean(hashes) },
    aep: path.posix.join(outDir, slug + '.aep'),
    createdAt: new Date().toISOString(),
    entries, skipped, map,
  };
  writeFileSync(path.posix.join(outDir, MAP_FILE), JSON.stringify(doc, null, 2) + '\n', 'utf8');
  return doc;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const val = (flag) => { const i = argv.indexOf(flag); return i === -1 ? undefined : argv[i + 1]; };
  const slugs = argv.includes('--all') ? SLUGS : [val('--slug')];
  if (!slugs[0]) {
    console.error('usage: node tools/packs/make-relink-copy.mjs --all | --slug <' + SLUGS.join('|') + '> [--src DIR]');
    process.exit(2);
  }
  const srcRoot = String(val('--src') || archiveDir()).replace(/\\/g, '/');
  const mf = path.join(srcRoot, 'manifest.json');
  const manifest = existsSync(mf) ? JSON.parse(readFileSync(mf, 'utf8')) : null;
  if (!manifest) console.log('note: ' + srcRoot + ' has no manifest.json, copies are not hash-checked');
  try {
    for (const slug of slugs) {
      const d = await makeRelinkCopy({ slug, srcRoot, outDir: packDir(slug), manifest });
      const n = (pred) => d.entries.filter(pred).length;
      console.log(`${slug}: ${d.entries.length} files (${n((e) => e.renamed)} renamed, ${n((e) => e.nfcChanged)} NFC), ` +
        `${d.skipped.length} skipped -> ${d.aep}`);
    }
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
}
