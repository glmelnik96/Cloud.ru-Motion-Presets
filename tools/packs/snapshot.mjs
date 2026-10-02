#!/usr/bin/env node
// Frozen read-only archive of the source package with a sha256 manifest (spec §3.3, phase 1, item 1).
//   node tools/packs/snapshot.mjs [--exclude-renders] [--src DIR] [--dest DIR]
//   node tools/packs/snapshot.mjs --verify [--dest DIR]
// The source is only read. Each archived file is hashed on both sides and made read-only.
// An archive that already has manifest.json is never overwritten: delete it by hand to redo it.
import {
  chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, statSync, statfsSync, utimesSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { walkFiles, sha256File, isRenderPath } from './fsutil.mjs';
import { sourceRoot, archiveDir, ARCHIVE_DATE } from './paths.mjs';

export const MANIFEST = 'manifest.json';
// A copy of the manifest lives in git: the evidence of what was frozen.
export const REPO_COPY = fileURLToPath(new URL('../../docs/research/packs/archive-' + ARCHIVE_DATE + '.manifest.json', import.meta.url));
const GB = 1024 ** 3;

function copyToRepo(dest) {
  mkdirSync(path.dirname(REPO_COPY), { recursive: true });
  writeFileSync(REPO_COPY, readFileSync(path.join(dest, MANIFEST)));
}

export async function snapshot({ src, dest, excludeRenders = false, log = () => {} }) {
  if (existsSync(path.join(dest, MANIFEST))) {
    throw new Error('ARCHIVE_EXISTS: ' + dest + ' already has ' + MANIFEST + '; check it with --verify or delete the folder by hand');
  }
  const all = walkFiles(src);
  const skip = (rel) => excludeRenders && isRenderPath(rel);
  const take = all.filter((rel) => !skip(rel));
  const need = take.reduce((sum, rel) => sum + statSync(path.join(src, rel)).size, 0);
  mkdirSync(dest, { recursive: true });
  const disk = statfsSync(dest);
  const free = disk.bavail * disk.bsize;
  if (free < need + GB) throw new Error(`NO_SPACE: need ${need} bytes + 1 GiB, free ${free}`);

  const files = [];
  for (const rel of take) {
    const from = path.join(src, rel);
    const to = path.join(dest, rel);
    const st = statSync(from);
    mkdirSync(path.dirname(to), { recursive: true });
    if (existsSync(to)) chmodSync(to, 0o644); // left over from an interrupted run
    copyFileSync(from, to);
    utimesSync(to, st.atime, st.mtime);
    const [a, b] = await Promise.all([sha256File(from), sha256File(to)]);
    if (a !== b) throw new Error('HASH_MISMATCH after copy: ' + rel);
    chmodSync(to, 0o444);
    files.push({ path: rel, size: st.size, mtime: st.mtime.toISOString(), sha256: a });
    log(`${files.length}/${take.length} ${rel}`);
  }
  const manifest = {
    source: String(src).replace(/\\/g, '/'),
    createdAt: new Date().toISOString(),
    excludeRenders,
    totals: { files: files.length, bytes: files.reduce((sum, f) => sum + f.size, 0) },
    files,
    excluded: all.filter(skip).map((rel) => ({ path: rel, size: statSync(path.join(src, rel)).size })),
  };
  const mf = path.join(dest, MANIFEST);
  writeFileSync(mf, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  chmodSync(mf, 0o444);
  return manifest;
}

export async function verifySnapshot({ dest, log = () => {} }) {
  const manifest = JSON.parse(readFileSync(path.join(dest, MANIFEST), 'utf8'));
  const problems = [];
  for (const f of manifest.files) {
    const abs = path.join(dest, f.path);
    if (!existsSync(abs)) { problems.push({ path: f.path, problem: 'missing' }); continue; }
    const size = statSync(abs).size;
    if (size !== f.size) { problems.push({ path: f.path, problem: `size ${size} != ${f.size}` }); continue; }
    if ((await sha256File(abs)) !== f.sha256) problems.push({ path: f.path, problem: 'sha256 mismatch' });
    log(f.path);
  }
  const known = new Set(manifest.files.map((f) => f.path).concat([MANIFEST]));
  for (const rel of walkFiles(dest)) {
    if (!known.has(rel)) problems.push({ path: rel, problem: 'not in manifest' });
  }
  return { ok: problems.length === 0, checked: manifest.files.length, problems };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const val = (flag) => { const i = argv.indexOf(flag); return i === -1 ? undefined : argv[i + 1]; };
  const dest = val('--dest') || archiveDir();
  let last = 0;
  const log = (line) => { if (Date.now() - last > 3000) { last = Date.now(); console.log(line); } };
  try {
    if (argv.includes('--verify')) {
      const r = await verifySnapshot({ dest, log });
      for (const p of r.problems) console.error('PROBLEM ' + p.path + ': ' + p.problem);
      console.log(`verify: ${r.checked} files, ${r.problems.length} problem(s)`);
      if (r.ok) copyToRepo(dest);
      process.exit(r.ok ? 0 : 1);
    }
    const src = val('--src') || sourceRoot();
    const m = await snapshot({ src, dest, excludeRenders: argv.includes('--exclude-renders'), log });
    copyToRepo(dest);
    console.log(`snapshot: ${m.totals.files} files, ${m.totals.bytes} bytes, ${m.excluded.length} excluded -> ${dest}`);
    console.log('manifest copy: ' + REPO_COPY);
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
}
