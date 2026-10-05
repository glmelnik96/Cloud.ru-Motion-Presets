#!/usr/bin/env node
// A synthetic T2/T3 pack for the live checks of the panel (tests/live/media.live.mjs): the real loops, sounds
// and transitions are not rendered yet, so ffmpeg makes stand-ins with the shapes of the example source
// (docs/library/example.src.json) — a background loop with intro, loop and outro on alpha, a transition with
// its marker of full cover, a still, a sound — and the built lower third gets a video and a sound companion.
// The codec is PNG in MOV (alpha, light); the choice for the real pack is S11's, not this one's.
//   node tools/panel/media-fixtures.mjs [--build <work>/build] [--out <work>/panel-live/media]
// Writes <out>/build/<id>/..., <out>/library.src.json and the catalog in <out>/library.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyTree } from '../lib/copy-tree.mjs';
import { workPath } from '../lib/work.mjs';
import { buildCatalog, calver } from '../library/build-catalog.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));

export const MEDIA_IDS = ['TRN_StepWipe', 'BG_Arrows', 'BG_DotGrid', 'SFX_WhooshIn'];
export const T1_ID = 'TTL_LowerThird';
const GREEN = '0x26D07C';

// The live source: the lower third of the real library with two companions, and the example media items.
export function mediaSource(real, example) {
  const ttl = structuredClone(real.items.find((i) => i.id === T1_ID));
  ttl.companions = [
    { ref: 'BG_Arrows', kind: 'video', placement: 'under', default: true },
    { ref: 'SFX_WhooshIn', kind: 'sfx', placement: 'out', default: true },
  ];
  const media = MEDIA_IDS.map((id) => structuredClone(example.items.find((i) => i.id === id)));
  return { $schema: real.$schema, schemaVersion: 1, items: [ttl, ...media] };
}

const transparent = (w, h, sec) => `color=c=black@0.0:s=${w}x${h}:r=25:d=${sec},format=rgba`;
const solid = (w, h, sec) => `color=c=${GREEN}:s=${w}x${h}:r=25:d=${sec},format=rgba`;
const movOut = ['-c:v', 'png', '-pix_fmt', 'rgba'];
// A green box moved over a transparent frame. overlay, not drawbox: drawbox of ffmpeg 6.1 drops a box whose
// x depends on t, and it paints no alpha without replace=1 (checked 2026-10-05).
const moving = (w, h, sec, bw, bh, x, y) => ['-f', 'lavfi', '-i', transparent(w, h, sec), '-f', 'lavfi', '-i', solid(bw, bh, sec),
  '-filter_complex', `[0][1]overlay=x='${x}':y='${y}':format=auto:shortest=1`, ...movOut];

// ffmpeg jobs for one item: { file (relative to the build dir), args }.
export function mediaJobs(item) {
  const jobs = [];
  const v = item.version;
  for (const variant of item.variants) {
    const base = `${item.id}/${item.id}_${variant.key}`;
    const { w, h } = variant;
    if (item.id === 'BG_Arrows') {
      // A box slides in to the centre, runs once across the frame per period (x at 10 s equals x at 0, so the
      // loop is seamless and continues the intro), and slides out to the right.
      const s = Math.round(Math.min(w, h) / 6);
      const sec = (r) => (r[1] - r[0]) / 25;
      const x = {
        intro: `-w+(W/2+w/2)*t`,
        loop: `mod(W/2-w/2+W*t/10\,W)`,
        outro: `W/2-w/2+(W/2+w/2)*t`,
      };
      for (const [part, range] of Object.entries(variant.parts)) {
        jobs.push({ file: `${base}_${part}_v${v}.mov`, args: moving(w, h, sec(range), s, s, x[part], '(H-h)/2') });
      }
    } else if (item.id === 'TRN_StepWipe') {
      // 25 frames: a bar runs in from the left and covers the frame from cutFrame for 5 frames, then leaves
      // to the right (spec 5: full cover of at least 4 frames).
      const cut = item.cutFrame / 25;
      const x = `if(lt(t\,${cut + 0.16})\,-W+W*min(1\,(t+0.04)/${cut + 0.04})\,W*(t-${cut + 0.16})/${1 - cut - 0.16})`;
      jobs.push({ file: `${base}_v${v}.mov`, args: moving(w, h, 1, w, h, x, '0') });
    } else if (item.id === 'BG_DotGrid' && variant.key !== 'svg') {
      jobs.push({ file: `${base}_v${v}.png`, args: ['-f', 'lavfi', '-i', `color=c=black@0.0:s=${w}x${h},format=rgba,drawgrid=w=60:h=60:t=4:c=${GREEN}@1:replace=1`, '-frames:v', '1'] });
    } else if (item.id === 'BG_DotGrid') {
      jobs.push({ file: `${base}_v${v}.svg`, svg: '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><circle cx="30" cy="30" r="4" fill="#26D07C"/></svg>\n' });
    } else if (item.id === 'SFX_WhooshIn') {
      jobs.push({ file: `${base}_v${v}.wav`, args: ['-f', 'lavfi', '-i', 'sine=frequency=700:duration=0.8:sample_rate=48000', '-c:a', 'pcm_s16le'] });
    }
  }
  return jobs;
}

export function makeMedia(buildDir, items, { ffmpeg = 'ffmpeg', force = false } = {}) {
  const made = [];
  for (const item of items) {
    for (const job of mediaJobs(item)) {
      const out = path.join(buildDir, job.file);
      if (existsSync(out) && !force) continue;
      mkdirSync(path.dirname(out), { recursive: true });
      if (job.svg) writeFileSync(out, job.svg, 'utf8');
      else {
        const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', ...job.args, out], { encoding: 'utf8' });
        if (r.status !== 0) throw new Error(`ffmpeg failed on ${job.file}: ${r.stderr || r.error}`);
      }
      made.push(job.file);
    }
  }
  return made;
}

export async function buildMediaFixtures({ realBuild = workPath('build'), out = workPath('panel-live', 'media'), ffmpeg = 'ffmpeg', force = false } = {}) {
  const src = mediaSource(readJson(path.join(REPO, 'library', 'library.src.json')), readJson(path.join(REPO, 'docs', 'library', 'example.src.json')));
  const buildDir = path.join(out, 'build');
  const t1 = path.join(realBuild, T1_ID);
  if (!existsSync(path.join(t1, `${T1_ID}_v1.aep`))) throw new Error(`no built ${T1_ID} in ${realBuild}: build the masters first`);
  copyTree(t1, path.join(buildDir, T1_ID));
  const made = makeMedia(buildDir, src.items.filter((i) => i.tier !== 'T1'), { ffmpeg, force });
  writeFileSync(path.join(out, 'library.src.json'), JSON.stringify(src, null, 2) + '\n', 'utf8');
  const tokens = readJson(path.join(REPO, 'brand', 'tokens.json'));
  const built = await buildCatalog({ src, buildDir, outDir: path.join(out, 'library'), tokens, libraryVersion: calver() });
  return { ...built, made, buildDir, libraryRoot: path.join(out, 'library') };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
  const r = await buildMediaFixtures({ realBuild: opt('--build'), out: opt('--out'), force: argv.includes('--force') }).catch((e) => ({ ok: false, problems: [String(e.message ?? e)] }));
  if (!r.ok) {
    console.error('FAIL', JSON.stringify(r.problems, null, 2));
    process.exit(1);
  }
  console.log(`OK ${r.libraryRoot}: ${r.catalog.items.length} items; made ${r.made.length} files`);
}
