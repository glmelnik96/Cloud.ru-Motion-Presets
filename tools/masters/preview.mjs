#!/usr/bin/env node
// Previews of a packaged master (spec 4.4 step 5, spec 7 «Играет только карточка под курсором, 480 px MP4»):
// AE renders frames of a variant with chosen values (tools/masters/jsx/render-case.jsx, as the golden
// comparison does), ffmpeg lays them over a backdrop and writes, in <work>/build/<id>/,
//   preview_<variant>[_<field>-<value>…].mp4  one per proportion and per value of the switches that change
//   poster_<variant>[_<field>-<value>…].jpg   the look (the form shows the one that matches, user 2026-10-05:
//                                             «Превью должно отображать все варианты»)
//   preview.mp4, poster.jpg                   the card in the catalog: a copy of the default one
// Axes are the switches whose picture cannot be derived from another: format, and for each item the ones
// in ref.preview.axes. «Сторона», «Размер текста» and «Скорость» stay at the defaults in ctrl — crossing
// them with the rest is a separate file per combination, and the hold frame does not show speed.
// ref.preview.same copies a combination that the template draws identically (a dark theme on the dark
// background is the light plate) instead of rendering it again.
// within a 480 px box, H.264, no sound, the whole template once; tools/library/build-catalog.mjs picks them up.
//   node tools/masters/preview.mjs --item TTL_LowerThird [--no-render] [--only-default]
// What each item shows comes from "preview" in masters/<id>/ref.json:
//   { "variant": "16x9", "ctrl": { "Style": 1 }, "text": { "TXT_NAME": "..." }, "backdrop": "#5A5A5A", "fps": 12.5,
//     "axes": { "style": "Style" } }      field key of library.src.json -> CTRL control of the master
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../host-run.mjs';
import { composeProbe, REPO } from '../spike/runner.mjs';
import { waitForStableFiles } from '../golden/png.mjs';
import { loadMaster, printChecks } from './build-master.mjs';
import { packagePaths, variantPlan } from './package.mjs';
import { parsePreviewName, previewName } from '../library/preview-names.mjs';

export { parsePreviewName, previewName };

export const PREVIEW_WIDTH = 480;
export const DEFAULTS = { variant: '16x9', ctrl: {}, text: {}, backdrop: '#222222', fps: 12.5, axes: {} };

// One preview per proportion (the smallest variant of each aspect: a 4K twin looks the same) and per
// combination of the values of the axes; ctrl gets the value of each axis (a checkbox as 1 or 0).
export function previewCombos(item, spec, variants) {
  const byAspect = new Map();
  for (const v of variants) {
    const aspect = item.variants.find((x) => x.key === v.key)?.aspect ?? v.key;
    const cur = byAspect.get(aspect);
    if (!cur || v.w < cur.w) byAspect.set(aspect, v);
  }
  const axes = Object.entries(spec.axes || {}).map(([key, ctrl]) => {
    const f = (item.fields || []).find((x) => x.key === key);
    if (!f || (f.type !== 'dropdown' && f.type !== 'checkbox')) throw new Error(`${item.id}: preview axis ${key} is not a dropdown or checkbox field`);
    return { key, ctrl, values: f.type === 'checkbox' ? [true, false] : f.options.map((o) => o.index) };
  });
  let whens = [{}];
  for (const a of axes) whens = whens.flatMap((w) => a.values.map((val) => ({ ...w, [a.key]: val })));
  const out = [];
  for (const v of byAspect.values()) {
    for (const when of whens) {
      const ctrl = { ...spec.ctrl };
      for (const a of axes) ctrl[a.ctrl] = when[a.key] === true ? 1 : when[a.key] === false ? 0 : when[a.key];
      out.push({ variant: v, when, ctrl, name: previewName(v.key, when) });
    }
  }
  return out;
}

// A combination the template draws the same as another (ref.preview.same). Null when this one is rendered.
// { "ctrl": { "Background": 2, "Theme": 2 }, "as": { "Theme": 1 } } — same variant, those controls rewritten.
export function sameAs(combo, combos, spec) {
  for (const rule of spec.same || []) {
    if (!Object.entries(rule.ctrl || {}).every(([k, v]) => combo.ctrl[k] === v)) continue;
    const want = { ...combo.ctrl, ...(rule.as || {}) };
    const src = combos.find((c) => c.variant.key === combo.variant.key && c.name !== combo.name
      && Object.keys(want).every((k) => c.ctrl[k] === want[k])
      && Object.keys(c.ctrl).every((k) => want[k] === c.ctrl[k]));
    if (src) return src;
  }
  return null;
}

// The combination the card shows: the default variant with the default values of ref.preview.ctrl.
export function defaultCombo(combos, spec) {
  const axisOf = Object.entries(spec.axes || {});
  return combos.find((c) => c.variant.key === spec.variant && axisOf.every(([key, ctrl]) => {
    const want = spec.ctrl[ctrl];
    return want === undefined || (c.when[key] === true ? 1 : c.when[key] === false ? 0 : c.when[key]) === want;
  })) ?? null;
}

// Template length and the poster moment (the middle of the hold) from the item's duration in library.src.json.
export function previewSpec(item, ref = {}) {
  const spec = { ...DEFAULTS, ...(ref.preview || {}) };
  const d = item.duration;
  const D = Math.round((d.introSec + d.holdSec + d.outroSec) * 1e6) / 1e6;
  return { ...spec, durationSec: D, posterSec: spec.posterSec ?? Math.round((d.introSec + d.holdSec / 2) * 1e6) / 1e6 };
}

// Frame times on the preview grid, the last one inside the template.
export function previewFrames(spec, dir) {
  const n = Math.max(1, Math.floor(spec.durationSec * spec.fps + 1e-6));
  return Array.from({ length: n }, (_, i) => ({ t: Math.round((i / spec.fps) * 1e6) / 1e6, file: path.posix.join(dir, `f${String(i).padStart(4, '0')}.png`) }));
}

const hex = (c) => '0x' + c.replace('#', '').toUpperCase();

// Scale into a 480 px box: 16:9 and 1:1 are 480 wide, 9:16 is 480 high (even sizes).
export const scaleFilter = (w, h) => (w >= h ? `scale=${PREVIEW_WIDTH}:-2:flags=lanczos` : `scale=-2:${PREVIEW_WIDTH}:flags=lanczos`);

// ffmpeg arguments: the frames over the backdrop, scaled into the box, H.264 yuv420p.
export function videoArgs({ dir, spec, w, h, out }) {
  return [
    '-f', 'lavfi', '-i', `color=c=${hex(spec.backdrop)}:s=${w}x${h}:r=${spec.fps}`,
    '-framerate', String(spec.fps), '-i', path.posix.join(dir, 'f%04d.png'),
    '-filter_complex', `[0:v][1:v]overlay=shortest=1:format=auto,${scaleFilter(w, h)},format=yuv420p[v]`,
    '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-movflags', '+faststart', out,
  ];
}

export function posterArgs({ frame, spec, w, h, out }) {
  return [
    '-f', 'lavfi', '-i', `color=c=${hex(spec.backdrop)}:s=${w}x${h}`,
    '-i', frame,
    '-filter_complex', `[0:v][1:v]overlay=format=auto,${scaleFilter(w, h)}[v]`,
    '-map', '[v]', '-frames:v', '1', '-q:v', '3', out,
  ];
}

export function ffmpeg(args, label) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    cwd: process.platform === 'win32' ? 'C:/' : os.tmpdir(), encoding: 'utf8', windowsHide: true, maxBuffer: 1 << 26,
  });
  if (r.status !== 0) throw new Error(`${label}: ffmpeg ${r.status}: ${(r.stderr || '').slice(0, 1500)}`);
}

// Encodes the rendered frames; the poster is the frame nearest to spec.posterSec.
export function encodePreview({ dir, spec, w, h, outDir, name = null }) {
  const frames = previewFrames(spec, dir);
  const posterIndex = Math.min(frames.length - 1, Math.round(spec.posterSec * spec.fps));
  const video = path.posix.join(outDir, name ? `preview_${name}.mp4` : 'preview.mp4');
  const poster = path.posix.join(outDir, name ? `poster_${name}.jpg` : 'poster.jpg');
  ffmpeg(videoArgs({ dir, spec, w, h, out: video }), 'preview.mp4');
  ffmpeg(posterArgs({ frame: frames[posterIndex].file, spec, w, h, out: poster }), 'poster.jpg');
  return { video, poster, frames: frames.length, posterSec: frames[posterIndex].t };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const id = argv.includes('--item') ? argv[argv.indexOf('--item') + 1] : null;
  const { params } = await loadMaster(id);
  const src = JSON.parse(readFileSync(path.join(REPO, 'library', 'library.src.json'), 'utf8'));
  const item = src.items.find((i) => i.id === id);
  const refFile = path.join(REPO, 'masters', id, 'ref.json');
  const spec = previewSpec(item, existsSync(refFile) ? JSON.parse(readFileSync(refFile, 'utf8')) : {});
  const variants = variantPlan(params);
  if (!variants.find((x) => x.key === spec.variant)) throw new Error(`${id}: no variant ${spec.variant}`);
  const combos = argv.includes('--only-default')
    ? [{ variant: variants.find((x) => x.key === spec.variant), when: {}, ctrl: spec.ctrl, name: null }]
    : previewCombos(item, spec, variants);
  const outDir = params.out.dir;
  const dir = path.posix.join(outDir, 'preview-frames');
  const frames = previewFrames(spec, dir);
  try {
    const copies = [];
    for (const c of combos) {
      const src = sameAs(c, combos, spec);
      if (src) { copies.push([c, src]); continue; }
      if (!argv.includes('--no-render')) {
        rmSync(dir, { recursive: true, force: true });
        mkdirSync(dir, { recursive: true });
        const body = composeProbe(['spikes/lib/ae-project.jsx', 'tools/masters/jsx/render-case.jsx'], {
          workDir: params.workDir, aep: packagePaths(params).aep, comp: c.variant.comp, ctrl: c.ctrl, text: spec.text, frames: frames.map((f) => ({ t: f.t, file: f.file })),
        });
        const r = await run('ae', body, { timeoutMs: 600000 });
        if (printChecks(r.checks)) throw new Error(`render call failed (${c.name ?? 'default'})`);
        await waitForStableFiles(frames.map((f) => f.file), { timeoutMs: 600000 });
      }
      const r = encodePreview({ dir, spec, w: c.variant.w, h: c.variant.h, outDir, name: c.name });
      console.log(`OK ${r.video} (${r.frames} frames at ${spec.fps} fps), ${r.poster} at ${r.posterSec} s`);
    }
    for (const [c, src] of copies) {
      const video = path.posix.join(outDir, `preview_${c.name}.mp4`);
      const poster = path.posix.join(outDir, `poster_${c.name}.jpg`);
      copyFileSync(path.posix.join(outDir, `preview_${src.name}.mp4`), video);
      copyFileSync(path.posix.join(outDir, `poster_${src.name}.jpg`), poster);
      console.log(`OK ${video} = copy of ${src.name}`);
    }
    // The card: a copy of the default combination.
    const def = combos[0].name === null ? null : defaultCombo(combos, spec);
    if (def) {
      copyFileSync(path.posix.join(outDir, `preview_${def.name}.mp4`), path.posix.join(outDir, 'preview.mp4'));
      copyFileSync(path.posix.join(outDir, `poster_${def.name}.jpg`), path.posix.join(outDir, 'poster.jpg'));
      console.log(`OK card preview = ${def.name}`);
    }
    if (!argv.includes('--no-render')) {
      const close = composeProbe(['spikes/lib/ae-project.jsx'], { workDir: params.workDir }) + '\nJSON.stringify({ checks: [], released: bkReleaseProject() });';
      await run('ae', close, { timeoutMs: 120000 });
    }
  } catch (e) {
    console.error('ERROR: ' + e.message);
    process.exitCode = 1;
  }
}
