#!/usr/bin/env node
// Golden frames of a pack comp that is not a ROOT (spec 3.2). A T2 item made of a nested comp (TRN_StepWipe: the
// courses pack's «Переход») has no frames of its own in <work>/golden, its roots show it over other layers. The
// frames are rendered from the relinked copy as tools/golden/render.mjs renders the roots (tools/golden/render.jsx),
// into <work>/golden/<slug>/<compSlug>/t<ms>.png; the manifest is docs/research/golden/<slug>-nested.json.
// --no-motion-blur: the comp's motion blur off for the render (contract C35: the master renders without it, so the
// golden differs from the master only where the design changed). The relinked copy is closed without saving.
//   node tools/golden/comp-frames.mjs --slug courses --comp perekhod [--frames all|0-50|0,25,50] [--no-motion-blur]
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDir, workPath } from '../lib/work.mjs';
import { packDir } from '../packs/paths.mjs';
import { sha256File } from '../packs/fsutil.mjs';
import { callJsx, REPO } from '../packs/jsx-call.mjs';
import { openProject, closeDiscard } from '../packs/ae-project.mjs';
import { relinkedPath } from '../packs/relink.mjs';
import { readJson } from '../dump/model.mjs';
import { compDir, gateReason } from './render.mjs';
import { pngSize, waitForStableFiles } from './png.mjs';

export const nestedManifestFile = (slug) => path.join(REPO, 'docs', 'research', 'golden', slug + '-nested.json');

// The frames to render: "all" (every frame of [0, duration)), a range "a-b" or a list "a,b,c"; each named by its
// time in ms as the root goldens are (t<ms>.png).
export function parseFrames(spec, comp) {
  const last = Math.round(comp.duration * comp.frameRate) - 1;
  let list;
  if (!spec || spec === 'all') list = Array.from({ length: last + 1 }, (_, i) => i);
  else if (/^\d+-\d+$/.test(spec)) {
    const [a, b] = spec.split('-').map(Number);
    list = Array.from({ length: b - a + 1 }, (_, i) => a + i);
  } else list = spec.split(',').map(Number);
  if (!list.length || list.some((f) => !Number.isInteger(f) || f < 0 || f > last)) {
    throw new Error(`frames "${spec}": the comp has frames 0..${last}`);
  }
  return [...new Set(list)].sort((x, y) => x - y).map((f) => ({ f, ms: Math.round((f / comp.frameRate) * 1000) }));
}

export async function compFrames(slug, compSlug, { frames = 'all', motionBlur = true, waitMs = 600000 } = {}) {
  const report = path.posix.join(packDir(slug), 'relink-report.json');
  if (!existsSync(report)) throw new Error('NO_RELINK_REPORT: ' + report);
  const reason = gateReason(readJson(report).acceptance);
  if (reason) throw new Error(`${slug}: the relinked copy is not clean (${reason})`);
  const comp = readJson(workPath('dumps', slug, compSlug + '.json')).comp;
  const dir = ensureDir(compDir(slug, compSlug));
  const plan = parseFrames(frames, comp).map((p) => ({ ...p, file: dir + '/t' + p.ms + '.png' }));
  for (const n of readdirSync(dir)) if (/^t\d+\.png$/.test(n)) rmSync(path.posix.join(dir, n)); // no leftovers
  const project = relinkedPath(slug);
  await openProject(project);
  let r;
  try {
    r = await callJsx('tools/golden/render.jsx', {
      expect: project, compId: comp.id, compName: comp.name, outDir: dir, frames: plan.map(({ f, ms }) => ({ f, ms })),
      motionBlur: motionBlur ? undefined : false,
    }, { timeoutMs: 900000 });
    await waitForStableFiles(plan.map((p) => p.file), { timeoutMs: waitMs });
  } finally {
    await closeDiscard(project);
  }
  const out = [];
  for (const p of plan) {
    const s = pngSize(p.file);
    if (s.width !== comp.width || s.height !== comp.height) throw new Error(`PNG_SIZE: ${p.file} is ${s.width}x${s.height}`);
    out.push({ f: p.f, ms: p.ms, bytes: statSync(p.file).size, sha256: await sha256File(p.file) });
  }
  const file = nestedManifestFile(slug);
  const man = existsSync(file) ? readJson(file) : { slug, comps: [] };
  const entry = {
    id: comp.id, name: comp.name, compSlug, width: comp.width, height: comp.height, fps: comp.frameRate, duration: comp.duration,
    motionBlur: motionBlur ? 'as in the pack' : 'off (C35)', aeVersion: r.version, date: new Date().toISOString().slice(0, 10), frames: out,
  };
  man.comps = [...(man.comps || []).filter((c) => c.compSlug !== compSlug), entry].sort((a, b) => (a.compSlug < b.compSlug ? -1 : 1));
  writeFileSync(file, JSON.stringify(man, null, 2) + '\n', 'utf8');
  return entry;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const val = (flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined);
  try {
    const e = await compFrames(val('--slug'), val('--comp'), { frames: val('--frames'), motionBlur: !argv.includes('--no-motion-blur') });
    console.log(`${e.compSlug}: ${e.frames.length} frames, motion blur ${e.motionBlur}; ${compDir(val('--slug'), e.compSlug)}`);
  } catch (e) {
    console.error('ERROR: ' + e.message);
    process.exitCode = 1;
  }
}
