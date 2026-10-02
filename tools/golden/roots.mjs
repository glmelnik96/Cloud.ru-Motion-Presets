#!/usr/bin/env node
// ROOT comps of every relinked pack (Plan 2, Task 4): comps no other comp uses as a layer source.
//   node tools/golden/roots.mjs --all | --slug podcast [--force]
// Writes <work>/golden/<slug>/roots.json and a copy in docs/research/golden/roots/<slug>.json.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workPath, ensureDir } from '../lib/work.mjs';
import { compSlugs } from '../packs/slug.mjs';
import { SLUGS } from '../packs/packs.mjs';
import { callJsx, REPO } from '../packs/jsx-call.mjs';
import { openProject } from '../packs/ae-project.mjs';
import { relinkedPath } from '../packs/relink.mjs';
import { keyFrames } from './keytimes.mjs';

export const rootsFile = (slug) => workPath('golden', slug, 'roots.json');
export const repoRootsFile = (slug) => path.join(REPO, 'docs', 'research', 'golden', 'roots', slug + '.json');

// comps: rows from roots.jsx. Slugs are unique over ALL comps (ascending id), roots sorted by slug.
export function pickRoots(comps) {
  const slugs = compSlugs(comps);
  const slugMap = [...comps].sort((a, b) => a.id - b.id).map((c) => ({
    id: c.id, name: c.name, compSlug: slugs.get(c.id), root: c.usedIn.length === 0, usedIn: c.usedIn,
  }));
  const roots = comps.filter((c) => c.usedIn.length === 0)
    .map((c) => ({ ...c, compSlug: slugs.get(c.id), keyFrames: keyFrames(c).length }))
    .sort((a, b) => (a.compSlug < b.compSlug ? -1 : 1));
  return { roots, slugMap };
}

async function rootsOne(slug) {
  const project = relinkedPath(slug);
  if (!existsSync(project)) throw new Error('NO_RELINKED: ' + project + ' (run tools/packs/relink.mjs first)');
  const opened = await openProject(project);
  const r = await callJsx('tools/golden/roots.jsx', { expect: project }, { timeoutMs: 300000 });
  const { roots, slugMap } = pickRoots(r.comps);
  const doc = { slug, project, aeVersion: r.version || opened.version, date: new Date().toISOString().slice(0, 10), roots, slugMap };
  const body = JSON.stringify(doc, null, 2) + '\n';
  ensureDir(path.posix.dirname(rootsFile(slug)));
  writeFileSync(rootsFile(slug), body, 'utf8');
  mkdirSync(path.dirname(repoRootsFile(slug)), { recursive: true });
  writeFileSync(repoRootsFile(slug), body, 'utf8');
  return doc;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const val = (flag) => { const i = argv.indexOf(flag); return i === -1 ? undefined : argv[i + 1]; };
  const slugs = argv.includes('--all') ? SLUGS : [val('--slug')];
  if (!slugs[0]) {
    console.error('usage: node tools/golden/roots.mjs --all | --slug <' + SLUGS.join('|') + '> [--force]');
    process.exit(2);
  }
  for (const slug of slugs) {
    if (existsSync(rootsFile(slug)) && !argv.includes('--force')) {
      console.log(`${slug}: roots.json exists, skipped (--force to redo)`);
      continue;
    }
    if (argv.includes('--all') && !existsSync(relinkedPath(slug))) {
      console.log(`${slug}: no relinked copy yet, skipped`);
      continue;
    }
    try {
      const d = await rootsOne(slug);
      const frames = d.roots.reduce((s, c) => s + c.keyFrames, 0);
      console.log(`${slug}: ${d.slugMap.length} comps, ${d.roots.length} ROOT, ${frames} key frames -> ${rootsFile(slug)}`);
    } catch (e) {
      console.error(`${slug}: ERROR ${e.message}`);
      process.exitCode = 1; // not process.exit(): see tools/packs/relink.mjs
      break;
    }
  }
}
