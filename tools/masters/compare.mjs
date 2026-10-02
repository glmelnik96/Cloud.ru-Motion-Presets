#!/usr/bin/env node
// Golden comparison of a packaged master (spec §4.4 step 6): for every case of masters/<id>/ref.json the
// variant is rendered in AE with the case's control values at the golden moments (shifted where the
// master's timing differs), then compared with the pack's golden PNGs: SSIM over black and white plus
// alpha (tools/qa/ssim.mjs), and a golden | master | diff picture for the eye.
//   node tools/masters/compare.mjs --item LOGO_Shot [--case egr] [--no-render]
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../host-run.mjs';
import { composeProbe, REPO } from '../spike/runner.mjs';
import { waitForStableFiles } from '../golden/png.mjs';
import { workPath } from '../lib/work.mjs';
import { compareFrames } from '../qa/ssim.mjs';
import { sideBySide } from '../qa/side-by-side.mjs';
import { readPng } from '../png/read-png.mjs';
import { loadMaster, printChecks } from './build-master.mjs';
import { packagePaths, variantPlan } from './package.mjs';

export function masterTime(ms, shift) {
  const t = ms / 1000;
  const seg = shift.find((s) => t >= s.from - 1e-9 && t <= s.to + 1e-9);
  return Math.round((t + (seg ? seg.by : 0)) * 1e6) / 1e6;
}

export function caseFrames(c, dir) {
  const list = [...new Set([...(c.gate || []), ...(c.view || [])])].sort((x, y) => x - y);
  return list.map((ms) => ({ ms, t: masterTime(ms, c.shift || []), file: path.posix.join(dir, `m${ms}.png`), gate: (c.gate || []).includes(ms) }));
}

async function renderCase(params, c, frames) {
  const v = variantPlan(params).find((x) => x.key === c.variant);
  if (!v) throw new Error(`${c.name}: no variant ${c.variant}`);
  const { aep } = packagePaths(params);
  for (const f of frames) rmSync(f.file, { force: true });
  const since = Date.now();
  const body = composeProbe(['spikes/lib/ae-project.jsx', 'tools/masters/jsx/render-case.jsx'], {
    workDir: params.workDir, aep, comp: v.comp, ctrl: c.ctrl, frames: frames.map((f) => ({ t: f.t, file: f.file })),
  });
  const r = await run('ae', body, { timeoutMs: 300000 });
  if (printChecks(r.checks, () => {})) throw new Error(`${c.name}: render call failed: ${JSON.stringify(r.checks).slice(0, 400)}`);
  const sizes = await waitForStableFiles(frames.map((f) => f.file), { timeoutMs: 300000 });
  return { since, wait: { ok: true, sizes } };
}

async function closeProject(params) {
  const body = composeProbe(['spikes/lib/ae-project.jsx'], { workDir: params.workDir }) +
    '\nJSON.stringify({ checks: [], released: bkReleaseProject() });';
  return run('ae', body, { timeoutMs: 120000 });
}

export function judge(result, min) {
  return result.ssim >= min;
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
      const rows = [];
      for (const f of frames) {
        const golden = workPath('golden', c.golden.slug, c.golden.compSlug, `t${f.ms}.png`);
        if (!existsSync(golden)) { rows.push({ ms: f.ms, error: 'no golden ' + golden }); continue; }
        const g = readPng(golden);
        const m = readPng(f.file);
        const res = compareFrames(g, m);
        sideBySide(g, m, path.posix.join(dir, `cmp_t${f.ms}.png`), { rect: res.rect });
        const pass = f.gate ? judge(res, min) : null;
        if (pass === false) failed += 1;
        rows.push({ ms: f.ms, t: f.t, gate: f.gate, pass, ssim: res.ssim, luma: res.luma, alpha: res.alpha, rect: res.rect,
          worst: res.over.map((o) => ({ backdrop: o.backdrop, ssim: o.ssim, worst: o.worst.slice(0, 2) })) });
        console.log(`${c.name} t${f.ms} (master ${f.t}s) ssim ${res.ssim.toFixed(4)} luma ${res.luma.toFixed(4)} alpha ${res.alpha.toFixed(4)}` +
          (f.gate ? (pass ? '  PASS' : '  FAIL') : '  view'));
      }
      report.cases.push({ name: c.name, title: c.title, golden: c.golden, ctrl: c.ctrl, rows });
    }
  } finally {
    if (!argv.includes('--no-render')) await closeProject(params).catch((e) => console.error('close: ' + e.message));
  }
  const file = path.posix.join(outRoot, 'report.json');
  writeFileSync(file, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log((failed ? failed + ' gate frame(s) below ' + min : 'all gate frames >= ' + min) + '; report ' + file);
  if (failed) process.exitCode = 1;
}
