#!/usr/bin/env node
// Packages a built master (spec §4.4 steps 1-4) in the live AE, one host call per step:
//   variants  <work>/build/<id>/<id>_work.aep -> <id>_v<N>.aep with CR_<...>_<fmt>_v<N> comps (k = min(w,h)/1080)
//   export    one .mogrt per variant into <work>/build/<id>/mogrt/<id>_<fmt>_v<N>.mogrt, checked in Node
//   node tools/masters/package.mjs --item LOGO_Shot [--only variants|export]
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../host-run.mjs';
import { composeProbe } from '../spike/runner.mjs';
import { readMogrt } from '../spike/mogrt.mjs';
import { waitStableFile } from '../spike/wait-file.mjs';
import { loadMaster, LIBS, printChecks } from './build-master.mjs';

export function variantPlan(params) {
  const v = params.version;
  return params.variants.map(({ key, w, h }) => ({
    key, w, h,
    k: Math.min(w, h) / 1080,
    comp: `${params.comp.name}_${key}_v${v}`,
    template: `${params.id}_${key}_v${v}`,
  }));
}

// Essential Graphics labels of an item. params.egp lists controllers in the order they are added (newest
// first in AE): an effect name on CTRL (LOGO_Shot style) or { effect } / { text: layer }.
export function egpLabels(params) {
  return params.egp.map((e) => {
    if (typeof e === 'string') return params.ctrl[e].label;
    if (e.effect) return params.ctrl[e.effect].label;
    return params.text[e.text].label;
  });
}

export function packagePaths(params) {
  return {
    aep: path.posix.join(params.out.dir, `${params.id}_v${params.version}.aep`),
    mogrtDir: path.posix.join(params.out.dir, 'mogrt'),
  };
}

// A MOGRT as the library needs it: definition.json, project.aegraphic, every EGP label of the item, dropdowns
// with their Russian items, the AE renderer Premiere will use.
export function checkMogrt(m, { labels, dropdowns = {} }) {
  const problems = [];
  if (!m.hasDefinition) problems.push('no definition.json');
  if (!m.hasAegraphic) problems.push('no project.aegraphic');
  const names = m.controls.filter((c) => c.kind !== 'group').map((c) => c.names[0]);
  for (const l of labels) if (!names.includes(l)) problems.push('missing control ' + l);
  if (names.length !== labels.length) problems.push(`controls ${names.length}, expected ${labels.length}`);
  const def = m.definition || {};
  for (const [label, items] of Object.entries(dropdowns)) {
    const c = (def.clientControls || []).find((x) => x.type === 13 && JSON.stringify(x.uiName || {}).includes(label));
    const text = JSON.stringify(c || {});
    const lost = items.filter((it) => !text.includes(it));
    if (!c) problems.push('dropdown ' + label + ' not found');
    else if (lost.length) problems.push(`dropdown ${label}: items not found ${lost.join(', ')}`);
  }
  return { ok: problems.length === 0, problems, controls: names, capsuleID: m.capsuleID, renderers: def.usedCompRenderers || null };
}

async function host(body, timeoutMs = 300000) {
  const r = await run('ae', body, { timeoutMs });
  if (!r || !Array.isArray(r.checks)) throw new Error('unexpected reply: ' + JSON.stringify(r).slice(0, 400));
  return r;
}

export async function packageVariants(params) {
  const plan = variantPlan(params);
  const { aep } = packagePaths(params);
  if (existsSync(aep)) renameSync(aep, aep.replace(/\.aep$/, '.prev.aep'));
  const body = composeProbe(LIBS.concat(['tools/masters/jsx/variants.jsx']), {
    workDir: params.workDir, workAep: params.out.aep, outAep: aep, master: params.comp.name,
    variants: plan, removeMaster: true, sweepTimes: params.sweepTimes,
  });
  const r = await host(body);
  return { failed: printChecks(r.checks), report: r };
}

export async function exportMogrts(params) {
  const plan = variantPlan(params);
  const { aep, mogrtDir } = packagePaths(params);
  mkdirSync(mogrtDir, { recursive: true });
  const labels = egpLabels(params);
  const dropdowns = Object.fromEntries(Object.values(params.ctrl).map((c) => [c.label, c.items]));
  const results = [];
  let failed = 0;
  for (const v of plan) {
    const file = path.posix.join(mogrtDir, v.template + '.mogrt');
    if (existsSync(file)) renameSync(file, file.replace(/\.mogrt$/, '.prev.mogrt'));
    const since = Date.now();
    const body = composeProbe(['spikes/lib/ae-project.jsx', 'tools/masters/jsx/mogrt-export.jsx'], {
      workDir: params.workDir, aep, comp: v.comp, template: v.template, outDir: mogrtDir, qa: 0,
    });
    const r = await host(body);
    failed += printChecks(r.checks);
    const w = await waitStableFile(file, { sinceMs: since - 1000, timeoutMs: 180000 });
    if (!w.ok) {
      failed += 1;
      console.log(`FAIL ${v.template}.mogrt: ${w.reason}`);
      results.push({ key: v.key, file, wait: w });
      continue;
    }
    const c = checkMogrt(readMogrt(file), { labels, dropdowns });
    console.log((c.ok ? 'ok   ' : 'FAIL ') + `${v.template}.mogrt ${Math.round(w.size / 1024)} KB, controls ${c.controls.join(', ')}` +
      (c.ok ? '' : ' -> ' + c.problems.join('; ')));
    if (!c.ok) failed += 1;
    results.push({ key: v.key, file, size: w.size, waitedMs: w.waitedMs, ...c });
  }
  return { failed, results };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const id = argv.includes('--item') ? argv[argv.indexOf('--item') + 1] : null;
  const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
  const { params } = await loadMaster(id);
  const report = { id, plan: variantPlan(params) };
  let failed = 0;
  try {
    if (!only || only === 'variants') {
      const r = await packageVariants(params);
      failed += r.failed;
      report.variants = r.report;
    }
    if (!failed && (!only || only === 'export')) {
      const r = await exportMogrts(params);
      failed += r.failed;
      report.mogrt = r.results;
    }
  } catch (e) {
    console.error('ERROR: ' + e.message);
    console.error('Before any new call: node tools/host-run.mjs --host ae "JSON.stringify({ v: app.version })"');
    process.exitCode = 1;
  }
  const file = path.posix.join(params.out.dir, 'package-report.json');
  writeFileSync(file, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log((failed ? failed + ' step(s) failed' : 'packaged ' + id) + '; report ' + file);
  if (failed) process.exitCode = 1;
}
