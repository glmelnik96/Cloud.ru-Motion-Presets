#!/usr/bin/env node
// S8, AE stage: export three existing comps as MOGRT without properties, strictly one at a time.
//   node spikes/s8-perf/run-ae.mjs [--only podcast,smm]
// Works on copies of the plan 2 relinked projects (C:/CRBK/packs/<slug>/<slug>_relinked.aep) in
// <work>/s8/aep; the relinked copies themselves are never opened or saved.
import { copyFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import AdmZip from 'adm-zip';
import { run } from '../../tools/host-run.mjs';
import { composeProbe } from '../../tools/spike/runner.mjs';
import { writeStageResult } from '../../tools/spike/stages.mjs';
import { machineInfo } from '../../tools/spike/machine.mjs';
import { workPath, ensureDir } from '../../tools/lib/work.mjs';
import {
  S8_ID, S8_TITLE, S8_FALLBACK, S8_NOTES, S8_PACKS, relinkedAep, mogrtPath, nameVariants,
  waitValidFile, updateMeasurements,
} from './lib.mjs';

const argv = process.argv.slice(2);
const onlyArg = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
const packs = onlyArg ? S8_PACKS.filter((p) => onlyArg.split(',').includes(p.slug)) : S8_PACKS;

function validMogrt(file) {
  try {
    const names = new AdmZip(file).getEntries().map((e) => e.entryName);
    const ok = names.some((n) => /(^|\/)definition\.json$/i.test(n));
    return { ok, detail: names.length + ' zip entries' + (ok ? '' : ', no definition.json') };
  } catch (e) {
    return { ok: false, detail: 'not a readable zip: ' + e.message };
  }
}

// Spec §3.1 S8: a measurement without a verdict in phase 0, so the verdict is 'measured' and locked.
function record(slug, checks, hostVersion) {
  return writeStageResult({
    id: S8_ID, title: S8_TITLE, host: 'ae+pr', hostVersion, stage: 'ae:' + slug, checks,
    verdict: 'measured', verdictLocked: true,
    fallback: S8_FALLBACK, notes: S8_NOTES, evidence: ['spikes/results/S8.data.json'],
  });
}

updateMeasurements({ ae: { machine: machineInfo() } });
const mogrtDir = ensureDir(workPath('s8', 'mogrt'));
ensureDir(workPath('s8', 'aep'));

for (const p of packs) {
  const src = relinkedAep(p.slug);
  if (!existsSync(src)) {
    record(p.slug, [{ name: `ae ${p.slug}: relinked copy exists`, pass: false, required: true, detail: 'missing ' + src + ' (plan 2, tasks 1-3)' }], null);
    console.log(`${p.slug}: SKIP, no ${src}`);
    continue;
  }
  const copy = workPath('s8', 'aep', p.slug + '_s8.aep');
  copyFileSync(src, copy);
  const target = mogrtPath(p.slug);
  rmSync(target, { force: true });
  const params = {
    slug: p.slug, aepPath: copy, copyDir: workPath('s8', 'aep'), compNames: nameVariants(p.comp),
    folderName: p.folder, templateName: 'perf_' + p.slug, mogrtDir,
  };
  const t0 = performance.now();
  let r;
  try {
    r = await run('ae', composeProbe(['spikes/s8-perf/ae-export.jsx'], params), { timeoutMs: 600000 });
  } catch (e) {
    record(p.slug, [{ name: `ae ${p.slug}: probe answered`, pass: false, required: true, detail: e.message }], null);
    console.error(`${p.slug}: ${e.message}`);
    console.error('STOP: check AE for a dialog, then run: node tools/host-run.mjs --host ae "JSON.stringify({ v: app.version })"');
    process.exit(1);
  }
  const probeMs = Math.round(performance.now() - t0);
  const checks = r.checks.slice();
  const d = r.data || {};
  const entry = { comp: p.comp, copy, probeMs, timings: d.timings, facts: d.facts, exportReturned: d.exportReturned };
  if (d.exportCalled) {
    const w = await waitValidFile(target, { validate: validMogrt, stableMs: 4000, intervalMs: 500, timeoutMs: 600000 });
    if (!w.ok) w.detail += '; .mogrt files in the folder: ' + (readdirSync(mogrtDir).join(', ') || 'none');
    checks.push({ name: `ae ${p.slug}: ${path.posix.basename(target)} written and readable`, pass: w.ok, required: true, detail: w.detail });
    Object.assign(entry, { mogrt: target, mogrtBytes: w.bytes, readyAfterReturnMs: w.ms });
    console.log(`${p.slug}: ${w.ok ? 'OK' : 'FAIL'} ${target} ${(w.bytes / 1e6).toFixed(1)} MB, `
      + `export call ${d.timings && d.timings.exportCallMs} ms + ${w.ms} ms until the last write; renderer ${d.facts && d.facts.renderer}`);
  } else {
    console.log(`${p.slug}: FAIL before export, see spikes/results/S8.json`);
  }
  updateMeasurements({ ae: { version: d.hostVersion, packs: { [p.slug]: entry } } });
  const res = record(p.slug, checks, 'AE ' + d.hostVersion);
  console.log(`  ${checks.filter((c) => c.pass).length}/${checks.length} checks, S8 now: ${res.verdict}`);
}
