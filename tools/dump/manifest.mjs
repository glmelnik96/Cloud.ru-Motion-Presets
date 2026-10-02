#!/usr/bin/env node
// sha256 manifests of the work outputs that stay out of git: golden frames and JSX dumps.
//   node tools/dump/manifest.mjs [--work C:/CRBK/work] [--out docs/research/manifests]
// Writes golden.json (*.png under <work>/golden) and dumps.json (*.json under <work>/dumps).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workDir } from '../lib/work.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');

// Relative POSIX paths of matching files, sorted; unfinished *.tmp folders are skipped.
export function listFiles(root, filter = () => true) {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!e.name.endsWith('.tmp')) walk(p);
      } else if (filter(e.name)) {
        out.push(path.relative(root, p).split(path.sep).join('/'));
      }
    }
  };
  if (existsSync(root)) walk(root);
  return out.sort();
}

export function buildManifest(root, { filter, now = () => new Date() } = {}) {
  const files = listFiles(root, filter).map((rel) => {
    const buf = readFileSync(path.join(root, rel));
    return { path: rel, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') };
  });
  const bySlug = {};
  for (const f of files) {
    const slug = f.path.split('/')[0];
    if (!bySlug[slug]) bySlug[slug] = { files: 0, bytes: 0 };
    bySlug[slug].files += 1;
    bySlug[slug].bytes += f.bytes;
  }
  return {
    root: String(root).replace(/\\/g, '/'), generated: now().toISOString(), count: files.length,
    bytes: files.reduce((s, f) => s + f.bytes, 0), bySlug, files,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const val = (flag, d) => { const i = argv.indexOf(flag); return i === -1 ? d : argv[i + 1]; };
  const work = val('--work', workDir());
  const out = val('--out', path.join(REPO, 'docs', 'research', 'manifests'));
  mkdirSync(out, { recursive: true });
  const jobs = [
    ['golden.json', path.join(work, 'golden'), (n) => n.toLowerCase().endsWith('.png')],
    ['dumps.json', path.join(work, 'dumps'), (n) => n.toLowerCase().endsWith('.json')],
  ];
  let empty = 0;
  for (const [name, root, filter] of jobs) {
    const m = buildManifest(root, { filter });
    writeFileSync(path.join(out, name), JSON.stringify(m, null, 1) + '\n', 'utf8');
    console.log(`${name}: ${m.count} files, ${(m.bytes / 1048576).toFixed(1)} MB, ` +
      Object.entries(m.bySlug).map(([s, v]) => `${s} ${v.files}`).join(', '));
    if (!m.count) empty += 1;
  }
  process.exit(empty ? 1 : 0);
}
