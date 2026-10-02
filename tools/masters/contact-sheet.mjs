#!/usr/bin/env node
// A contact sheet of a packaged master for review: frames of one variant at given times, rendered in AE with
// the given fields, laid out on a grid over a grey checker-free backdrop.
//   node tools/masters/contact-sheet.mjs --item LOGO_Shot --variant 16x9 --times 0.4,0.8,1.2 \
//     [--ctrl '{"Caption":1}'] [--text '{"TXT_NAME":"..."}'] [--cols 4] [--width 480] [--bg 128,128,128]
//     [--crop x,y,w,h] [--out file.png]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { run } from '../host-run.mjs';
import { composeProbe } from '../spike/runner.mjs';
import { waitForStableFiles } from '../golden/png.mjs';
import { readPng } from '../png/read-png.mjs';
import { loadMaster, printChecks } from './build-master.mjs';
import { packagePaths, variantPlan } from './package.mjs';

// Box-filtered downscale of straight RGBA (optionally a crop of it) composited over bg, into the sheet at (ox, oy).
export function blit(sheet, img, ox, oy, w, h, bg, crop = null) {
  const c0 = crop || { x: 0, y: 0, w: img.width, h: img.height };
  const sx = c0.w / w;
  const sy = c0.h / h;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const acc = [0, 0, 0];
      let n = 0;
      for (let yy = c0.y + Math.floor(y * sy); yy < Math.min(c0.y + c0.h, c0.y + Math.floor((y + 1) * sy)); yy += 1) {
        for (let xx = c0.x + Math.floor(x * sx); xx < Math.min(c0.x + c0.w, c0.x + Math.floor((x + 1) * sx)); xx += 1) {
          const i = (yy * img.width + xx) * 4;
          const a = img.data[i + 3] / 255;
          for (let c = 0; c < 3; c += 1) acc[c] += img.data[i + c] * a + bg[c] * (1 - a);
          n += 1;
        }
      }
      const o = ((oy + y) * sheet.width + (ox + x)) * 4;
      for (let c = 0; c < 3; c += 1) sheet.data[o + c] = n ? Math.round(acc[c] / n) : bg[c];
      sheet.data[o + 3] = 255;
    }
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const opt = (f, d) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : d);
  const id = opt('--item');
  const { params } = await loadMaster(id);
  const variant = opt('--variant', params.variants[0].key);
  const times = opt('--times').split(',').map(Number);
  const ctrl = JSON.parse(opt('--ctrl', '{}'));
  const text = JSON.parse(opt('--text', '{}'));
  const cols = Number(opt('--cols', 4));
  const tw = Number(opt('--width', 480));
  const bg = opt('--bg', '128,128,128').split(',').map(Number);
  const v = variantPlan(params).find((x) => x.key === variant);
  const dir = path.posix.join(params.out.dir, 'sheet', variant);
  mkdirSync(dir, { recursive: true });
  const frames = times.map((t) => ({ t, file: path.posix.join(dir, `f${Math.round(t * 1000)}.png`) }));
  for (const f of frames) rmSync(f.file, { force: true });
  const body = composeProbe(['spikes/lib/ae-project.jsx', 'tools/masters/jsx/render-case.jsx'], {
    workDir: params.workDir, aep: packagePaths(params).aep, comp: v.comp, ctrl, text, frames,
  });
  const r = await run('ae', body, { timeoutMs: 300000 });
  if (printChecks(r.checks, () => {})) throw new Error('render failed: ' + JSON.stringify(r.checks).slice(0, 300));
  await waitForStableFiles(frames.map((f) => f.file), { timeoutMs: 300000 });
  await run('ae', composeProbe(['spikes/lib/ae-project.jsx'], { workDir: params.workDir }) +
    '\nJSON.stringify({ checks: [], released: bkReleaseProject() });', { timeoutMs: 120000 });
  const cropArg = opt('--crop', null);
  const crop = cropArg ? (([x, y, w, h]) => ({ x, y, w, h }))(cropArg.split(',').map(Number)) : null;
  const th = Math.round(tw * (crop ? crop.h / crop.w : v.h / v.w));
  const gap = 6;
  const rows = Math.ceil(frames.length / cols);
  const sheet = new PNG({ width: cols * tw + (cols + 1) * gap, height: rows * th + (rows + 1) * gap });
  sheet.data.fill(255);
  frames.forEach((f, i) => blit(sheet, readPng(f.file), gap + (i % cols) * (tw + gap), gap + Math.floor(i / cols) * (th + gap), tw, th, bg, crop));
  const out = opt('--out', path.posix.join(params.out.dir, `sheet_${variant}.png`));
  writeFileSync(out, PNG.sync.write(sheet));
  console.log(`${id} ${variant}: ${frames.length} frames at ${times.join(', ')} s -> ${out}`);
}
