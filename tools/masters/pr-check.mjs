#!/usr/bin/env node
// Premiere acceptance of a packaged master (spec §4.4 step 7): the variant's .mogrt is inserted into a test
// sequence of <work>/pr/CRT_masters.prproj (created on first use), its fields are written 0-based and read
// back in a new call, frames are exported, and the same pictures rendered in AE must match them
// (SSIM over black >= tokens.qa.ssimMin; deltaE2000 of the brand-colour areas <= tokens.qa.deltaE2000Max).
//   node tools/masters/pr-check.mjs --item LOGO_Shot [--plan premiere|premiere9x16]
// Needs Premiere (CDP 8096) and AE (CDP 8094) running; neither touches a project of the user.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../host-run.mjs';
import { composeProbe, REPO } from '../spike/runner.mjs';
import { waitForStableFiles } from '../golden/png.mjs';
import { workPath } from '../lib/work.mjs';
import { prBaseParams, presetSources, stagePreset, TPF_25 } from '../pr/env.mjs';
import { readPng, findColorCentroid, meanColor } from '../png/read-png.mjs';
import { deltaE2000, rgbToXyz, xyzToLab } from '../color/deltae.mjs';
import { compareFrames } from '../qa/ssim.mjs';
import { sideBySide } from '../qa/side-by-side.mjs';
import { loadMaster, printChecks } from './build-master.mjs';
import { packagePaths, variantPlan } from './package.mjs';

export const PR_PROJECT = () => workPath('pr', 'CRT_masters.prproj');

// 1-based effect values (AE, library) -> Premiere labels with 0-based values.
export function prValues(ctrl, params) {
  const out = {};
  for (const [effect, v] of Object.entries(ctrl)) {
    const spec = params.ctrl[effect];
    if (!spec) throw new Error('unknown control ' + effect);
    if (!(v >= 1 && v <= spec.items.length)) throw new Error(`${effect}: ${v} is outside 1..${spec.items.length}`);
    out[spec.label] = v - 1;
  }
  return out;
}

async function prCall(params, extra) {
  const body = composeProbe(['spikes/lib/pr-helpers.jsx', 'tools/masters/jsx/pr-check.jsx'], { ...extra });
  const r = await run('pr', body, { timeoutMs: 300000 });
  if (!r || !Array.isArray(r.checks)) throw new Error('unexpected reply: ' + JSON.stringify(r).slice(0, 400));
  return r;
}

async function aeRender(params, variant, ctrl, frames, text = {}) {
  const { aep } = packagePaths(params);
  const v = variantPlan(params).find((x) => x.key === variant);
  for (const f of frames) rmSync(f.file, { force: true });
  const body = composeProbe(['spikes/lib/ae-project.jsx', 'tools/masters/jsx/render-case.jsx'], {
    workDir: params.workDir, aep, comp: v.comp, ctrl, text, frames,
  });
  const r = await run('ae', body, { timeoutMs: 300000 });
  if (printChecks(r.checks, () => {})) throw new Error('AE render failed: ' + JSON.stringify(r.checks).slice(0, 400));
  await waitForStableFiles(frames.map((f) => f.file), { timeoutMs: 300000 });
}

async function aeClose(params) {
  const body = composeProbe(['spikes/lib/ae-project.jsx'], { workDir: params.workDir }) +
    '\nJSON.stringify({ checks: [], released: bkReleaseProject() });';
  return run('ae', body, { timeoutMs: 120000 });
}

// Brand colour areas: the green of the logo cube, found in the AE frame and measured in both.
function colourChecks(ae, pr, hex, maxDE) {
  const c = findColorCentroid(ae, hex, 12);
  if (!c || !c.count) return { found: false };
  const s = 6;
  const rect = { x: Math.round(c.x) - s, y: Math.round(c.y) - s, w: 2 * s, h: 2 * s };
  const a = meanColor(ae, rect);
  const b = meanColor(pr, rect);
  const lab = (c) => xyzToLab(rgbToXyz({ r: c.r, g: c.g, b: c.b }));
  const de = deltaE2000(lab(a), lab(b));
  return { found: true, rect, ae: [a.r, a.g, a.b].map(Math.round), pr: [b.r, b.g, b.b].map(Math.round), deltaE: de, pass: de <= maxDE };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const id = argv.includes('--item') ? argv[argv.indexOf('--item') + 1] : null;
  const { params } = await loadMaster(id);
  const ref = JSON.parse(readFileSync(path.join(REPO, 'masters', id, 'ref.json'), 'utf8'));
  const which = argv.includes('--plan') ? argv[argv.indexOf('--plan') + 1] : 'premiere';
  const plan = ref[which];
  if (!plan) throw new Error(`masters/${id}/ref.json has no "${which}" plan`);
  const tokens = JSON.parse(readFileSync(path.join(REPO, 'brand', 'tokens.json'), 'utf8'));
  const dir = path.posix.join(params.out.dir, which === 'premiere' ? 'pr' : which);
  mkdirSync(dir, { recursive: true });
  const v = variantPlan(params).find((x) => x.key === plan.variant);
  const mogrt = path.posix.join(packagePaths(params).mogrtDir, v.template + '.mogrt');
  const base = prBaseParams();
  const prTexts = (text = {}) => Object.fromEntries(Object.entries(text).map(([layer, v]) => [params.text[layer].label, v]));
  const clips = plan.clips.map((c) => ({ key: c.key, atSec: c.atSec, lenSec: c.lenSec, values: prValues(c.ctrl, params), texts: prTexts(c.text) }));
  const common = {
    ...base, project: PR_PROJECT(), mogrt, clips, framesDir: dir, tpf: TPF_25,
    seqPreset: stagePreset(presetSources().seq1080p25, 'HD1080p25.sqpreset'), seqBase: `CRT_${id}_${plan.variant}`,
    seqSize: [v.w, v.h],
    frames: plan.frames.map((f) => ({ key: 'pr_' + f.key, clip: f.clip, sec: f.sec })),
  };
  const report = { id, mogrt, ssimMin: tokens.qa.ssimMin, deltaEMax: tokens.qa.deltaE2000Max, stages: {}, frames: [] };
  let failed = 0;
  try {
    for (const f of plan.frames) rmSync(path.posix.join(dir, 'pr_' + f.key + '.png'), { force: true });
    const ins = await prCall(params, { ...common, stage: 'insert' });
    failed += printChecks(ins.checks);
    report.stages.insert = ins;
    if (failed) throw new Error('insert stage failed');
    const rb = await prCall(params, { ...common, stage: 'readback', seqId: ins.data.seqId, seqName: ins.data.seqName });
    failed += printChecks(rb.checks);
    report.stages.readback = rb;
    if (failed) throw new Error('readback stage failed');
    await waitForStableFiles(plan.frames.map((f) => path.posix.join(dir, 'pr_' + f.key + '.png')), { timeoutMs: 120000 });
    for (const c of plan.clips) {
      const frames = plan.frames.filter((f) => f.clip === c.key).map((f) => ({ t: f.master, file: path.posix.join(dir, 'ae_' + f.key + '.png') }));
      await aeRender(params, plan.variant, c.ctrl, frames, c.text);
    }
    for (const f of plan.frames) {
      const pr = readPng(path.posix.join(dir, 'pr_' + f.key + '.png'));
      const ae = readPng(path.posix.join(dir, 'ae_' + f.key + '.png'));
      const cmp = compareFrames(ae, pr, { backdrops: [[0, 0, 0]], alpha: false });
      sideBySide(ae, pr, path.posix.join(dir, 'cmp_' + f.key + '.png'), { rect: cmp.rect, backdrop: [0, 0, 0] });
      const col = colourChecks(ae, pr, '#26D07C', tokens.qa.deltaE2000Max);
      const pass = cmp.ssim >= tokens.qa.ssimMin && (!col.found || col.pass);
      if (!pass) failed += 1;
      report.frames.push({ ...f, ssim: cmp.ssim, rect: cmp.rect, colour: col, pass });
      console.log(`${pass ? 'ok  ' : 'FAIL'} ${f.key}: Premiere vs AE ssim ${cmp.ssim.toFixed(4)}` +
        (col.found ? `, cube dE ${col.deltaE.toFixed(2)}` : ', no cube in frame'));
    }
  } catch (e) {
    console.error('ERROR: ' + e.message);
    process.exitCode = 1;
  } finally {
    await aeClose(params).catch(() => {});
  }
  const file = path.posix.join(dir, 'pr-report.json');
  writeFileSync(file, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log((failed ? failed + ' check(s) failed' : 'Premiere acceptance passed') + '; report ' + file);
  if (failed) process.exitCode = 1;
}
