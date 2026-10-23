#!/usr/bin/env node
// Golden comparison of a packaged master (spec §4.4 step 6): for every case of masters/<id>/ref.json the
// variant is rendered in AE with the case's control values at the golden moments (shifted where the
// master's timing differs), then compared with the pack's golden PNGs: SSIM over black and white plus
// alpha (tools/qa/ssim.mjs), and a golden | master | diff picture for the eye. A case with parts (lines the
// pack placed by hand) is gated part by part after registering each one, its placement by maxShift.
// Each case's last gate frame is rendered once more, alone on a freshly opened project, as Premiere or a scrub
// evaluates a frame of the hold first; it must match the frame rendered in sequence (C45: order-dependent
// expressions hid the last line of CRS_Cover and SMM_ShortsIntro there, while the sequence looked right).
//   node tools/masters/compare.mjs --item LOGO_Shot [--case egr] [--no-render] [--no-order]
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../host-run.mjs';
import { composeProbe, REPO } from '../spike/runner.mjs';
import { waitForStableFiles } from '../golden/png.mjs';
import { workPath } from '../lib/work.mjs';
import { compareFrames, remapColours } from '../qa/ssim.mjs';
import { sideBySide } from '../qa/side-by-side.mjs';
import { registerWindow, sampleWindow, scaleImage } from '../qa/register.mjs';
import { readPng } from '../png/read-png.mjs';
import { loadMaster, printChecks } from './build-master.mjs';
import { packagePaths, variantPlan, withDefaults } from './package.mjs';

// Golden time -> master time, piecewise: in a segment, master = from + by + (t - from) * scale (scale 1 when
// absent: a plain shift; 0: a pause of the pack that the master does not have).
export function masterTime(ms, shift) {
  const t = ms / 1000;
  const seg = shift.find((s) => t >= s.from - 1e-9 && t <= s.to + 1e-9);
  const m = seg ? seg.from + seg.by + (t - seg.from) * (seg.scale === undefined ? 1 : seg.scale) : t;
  return Math.round(m * 1e6) / 1e6;
}

export function caseFrames(c, dir) {
  const list = [...new Set([...(c.gate || []), ...(c.view || [])])].sort((x, y) => x - y);
  return list.map((ms) => ({ ms, t: masterTime(ms, c.shift || []), file: path.posix.join(dir, `m${ms}.png`), gate: (c.gate || []).includes(ms) }));
}

// The texts of a case; "pack" (or "pack:<key>" for one of several scenes): the pack's own, which the master
// resolves from the dump at build time (a real guest's name, bio or handle stays out of the repository).
export function caseText(params, c) {
  if (typeof c.text === 'string' && c.text.startsWith('pack:')) {
    const key = c.text.slice(5);
    if (!params.packs || !params.packs[key]) throw new Error(`${c.name}: the master has no pack texts ${key} (params.packs)`);
    return params.packs[key];
  }
  if (c.text !== 'pack') return c.text;
  if (!params.pack) throw new Error(`${c.name}: the master has no pack texts (params.pack)`);
  return params.pack;
}

async function renderCase(params, c, frames) {
  const v = variantPlan(params).find((x) => x.key === c.variant);
  if (!v) throw new Error(`${c.name}: no variant ${c.variant}`);
  const { aep } = packagePaths(params);
  for (const f of frames) rmSync(f.file, { force: true });
  const since = Date.now();
  const set = withDefaults(params, c.ctrl, caseText(params, c));
  const body = composeProbe(['spikes/lib/ae-project.jsx', 'tools/masters/jsx/render-case.jsx'], {
    workDir: params.workDir, aep, comp: v.comp, ctrl: set.ctrl, text: set.text, frames: frames.map((f) => ({ t: f.t, file: f.file })),
  });
  const r = await run('ae', body, { timeoutMs: 300000 });
  if (printChecks(r.checks, () => {})) throw new Error(`${c.name}: render call failed: ${JSON.stringify(r.checks).slice(0, 400)}`);
  const sizes = await waitForStableFiles(frames.map((f) => f.file), { timeoutMs: 300000 });
  return { since, wait: { ok: true, sizes } };
}

// A frame rendered alone and the same frame rendered in sequence come from one project: they match to the bit
// unless an expression depends on the order frames are evaluated in.
const ORDER_MIN = 0.999;

async function closeProject(params) {
  const body = composeProbe(['spikes/lib/ae-project.jsx'], { workDir: params.workDir }) +
    '\nJSON.stringify({ checks: [], released: bkReleaseProject() });';
  return run('ae', body, { timeoutMs: 120000 });
}

export function judge(result, min) {
  return result.ssim >= min;
}

const r1 = (v) => Math.round(v * 10) / 10;

// Parts of a case that the pack placed by hand (lines of text): each part of the golden is registered in
// the master frame once, on the first gate frame (whole pixels within search, then tenths), and compared at
// that place in every frame of the case. The look is gated there, the placement by maxShift (frame px).
export function registerParts(golden, master, parts, { search = 6 } = {}) {
  return parts.map((p) => {
    // fixed: compared where it is (a flat patch of ground registers anywhere and drags an edge in: BG_WebinarPortal)
    if (p.fixed) return { ...p, origin: [p.x, p.y], shift: [0, 0] };
    const reg = registerWindow(sampleWindow(golden, p.x, p.y, p.w, p.h), master, { offset: [p.x, p.y], search: p.search || search });
    return { ...p, origin: reg.origin, shift: [r1(reg.origin[0] - p.x), r1(reg.origin[1] - p.y)] };
  });
}

export function compareParts(golden, master, placed, { min, maxShift }) {
  return placed.map((p) => {
    const res = compareFrames(sampleWindow(golden, p.x, p.y, p.w, p.h), sampleWindow(master, p.origin[0], p.origin[1], p.w, p.h));
    const placedOk = Math.hypot(p.shift[0], p.shift[1]) <= (p.maxShift === undefined ? maxShift : p.maxShift);
    return { name: p.name, shift: p.shift, ssim: res.ssim, pass: res.ssim >= min && placedOk };
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const id = argv.includes('--item') ? argv[argv.indexOf('--item') + 1] : null;
  const only = argv.includes('--case') ? argv[argv.indexOf('--case') + 1] : null;
  const { params } = await loadMaster(id);
  const ref = JSON.parse(readFileSync(path.join(REPO, 'masters', id, 'ref.json'), 'utf8'));
  const tokens = JSON.parse(readFileSync(path.join(REPO, 'brand', 'tokens.json'), 'utf8'));
  const min = tokens.qa.ssimMin;
  const outRoot = path.posix.join(params.out.dir, 'ref');
  const report = { id, ssimMin: min, cases: [] };
  let failed = 0;
  try {
    for (const c of ref.cases) {
      if (only && c.name !== only) continue;
      const dir = path.posix.join(outRoot, c.name);
      mkdirSync(dir, { recursive: true });
      const frames = caseFrames(c, dir);
      if (!argv.includes('--no-render')) {
        const r = await renderCase(params, c, frames);
        if (!r.wait.ok) throw new Error(`${c.name}: frames missing ${JSON.stringify(r.wait).slice(0, 300)}`);
      }
      let order = null;
      const last = [...frames].reverse().find((f) => f.gate);
      if (last && !argv.includes('--no-render') && !argv.includes('--no-order')) {
        const alone = { ...last, file: path.posix.join(dir, `alone_t${last.ms}.png`) };
        await closeProject(params);
        await renderCase(params, c, [alone]);
        const res = compareFrames(readPng(last.file), readPng(alone.file), {});
        order = { ms: last.ms, ssim: res.ssim, pass: res.ssim >= ORDER_MIN };
        if (!order.pass) failed += 1;
        console.log(`${c.name} t${last.ms}: alone on a fresh project vs in sequence ssim ${res.ssim.toFixed(4)}` +
          (order.pass ? '  PASS' : '  FAIL (the result depends on the order frames are evaluated in, C45)'));
      }
      const rows = [];
      // A golden canvas smaller than the frame (crop) is registered once, on the first gate frame, and the
      // same window is used for every frame of the case (moving frames must not be re-aligned).
      let origin = null;
      // golden.scale: the pack drew the golden at another size (CRS_Cover: 2560x1440, 0.75 of it is FHD), resized
      // by area first, premultiplied as AE wrote it; crop.golden: compare a part of the golden frame (e.g. a title
      // inside a full webinar screen)
      const sized = (img) => (c.golden.scale ? scaleImage(img, Math.round(img.width * c.golden.scale), Math.round(img.height * c.golden.scale), { premultiplied: true }) : img);
      const goldenPart = (img0) => {
        const img = sized(img0);
        return c.crop && c.crop.golden ? sampleWindow(img, c.crop.golden.x, c.crop.golden.y, c.crop.golden.w, c.crop.golden.h) : img;
      };
      if (c.crop && c.crop.fixed) {
        // the window stands where the geometry puts it (TRN_StepWipe's 1:1, the middle of the 16:9 wipe): no
        // registration, which on a nearly flat frame drifts by subpixels
        origin = c.crop.offset;
        console.log(`${c.name}: window origin ${origin.join(', ')} (fixed)`);
      } else if (c.crop) {
        const ref = frames.find((f) => f.gate) || frames[0];
        const reg = registerWindow(goldenPart(readPng(workPath('golden', c.golden.slug, c.golden.compSlug, `t${ref.ms}.png`))), readPng(ref.file),
          { offset: c.crop.offset, search: c.crop.search || 4 });
        origin = reg.origin;
        console.log(`${c.name}: window origin ${origin.join(', ')} (predicted ${c.crop.offset.join(', ')}, coarse ${reg.coarse.join(', ')}, MAD ${reg.mad.toFixed(2)})`);
      }
      const goldenFile = (ms) => workPath('golden', c.golden.slug, c.golden.compSlug, `t${ms}.png`);
      const pair = (f) => {
        const g0 = goldenPart(readPng(goldenFile(f.ms)));
        // AE's saveFrameToPng stores the colour premultiplied: the remap moves the colour of the edges too
        const g = c.remap ? remapColours(g0, { ...c.remap, rect: c.remap.rect || c.rect, premultiplied: true }) : g0;
        return { g, m: origin ? sampleWindow(readPng(f.file), origin[0], origin[1], g.width, g.height) : readPng(f.file) };
      };
      let parts = null;
      if (c.parts) {
        const { g, m } = pair(frames.find((f) => f.gate) || frames[0]);
        parts = registerParts(g, m, c.parts);
        for (const p of parts) console.log(`${c.name}: part ${p.name} stands ${p.shift.join(', ')} px from the pack's`);
      }
      for (const f of frames) {
        if (!existsSync(goldenFile(f.ms))) { rows.push({ ms: f.ms, error: 'no golden ' + goldenFile(f.ms) }); continue; }
        const { g, m } = pair(f);
        const res = compareFrames(g, m, { masks: c.masks || [], rect: c.rect });
        sideBySide(g, m, path.posix.join(dir, `cmp_t${f.ms}.png`), { rect: res.rect });
        const pr = parts ? compareParts(g, m, parts, { min, maxShift: c.maxShift === undefined ? 4 : c.maxShift }) : null;
        const pass = f.gate ? (pr ? pr.every((x) => x.pass) : judge(res, min)) : null;
        if (pass === false) failed += 1;
        rows.push({ ms: f.ms, t: f.t, gate: f.gate, pass, ssim: res.ssim, luma: res.luma, alpha: res.alpha, rect: res.rect, parts: pr,
          worst: res.over.map((o) => ({ backdrop: o.backdrop, ssim: o.ssim, worst: o.worst.slice(0, 2) })) });
        console.log(`${c.name} t${f.ms} (master ${f.t}s) ssim ${res.ssim.toFixed(4)} luma ${res.luma.toFixed(4)} alpha ${res.alpha.toFixed(4)}` +
          (pr ? `; by part ${pr.map((x) => `${x.name} ${x.ssim.toFixed(4)}`).join(', ')}` : '') + (f.gate ? (pass ? '  PASS' : '  FAIL') : '  view'));
      }
      report.cases.push({ name: c.name, title: c.title, golden: c.golden, ctrl: c.ctrl, text: c.text, origin,
        parts: parts && parts.map((p) => ({ name: p.name, rect: [p.x, p.y, p.w, p.h], shift: p.shift })), order, rows });
    }
  } finally {
    if (!argv.includes('--no-render')) await closeProject(params).catch((e) => console.error('close: ' + e.message));
  }
  const file = path.posix.join(outRoot, 'report.json');
  writeFileSync(file, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log((failed ? failed + ' gate frame(s) below ' + min : 'all gate frames >= ' + min) + '; report ' + file);
  if (failed) process.exitCode = 1;
}
