#!/usr/bin/env node
// S8, Premiere stage. Run after spikes/s8-perf/run-ae.mjs, with an EMPTY saved project open in Premiere.
//   node spikes/s8-perf/run-pr.mjs --stage insert [--project CRT_s8_perf.prproj]
//     8 sequences (3 elements x FHD/UHD + 2 baselines), baseline clip, 6 timed importMGT calls
//   node spikes/s8-perf/run-pr.mjs --stage export
//     8 timed exportAsMediaDirect calls, 10 s each (In/Out 0..10 s, Apple ProRes 422 LT)
// Every host call is timed here (wall clock, including the bridge) and in the host (importMogrt's ms for
// an insert, $.hiresTimer for an export).
// Checks, stages and numbers carry the machine name, so runs on several machines are kept side by side.
import { existsSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { run } from '../../tools/host-run.mjs';
import { composeProbe } from '../../tools/spike/runner.mjs';
import { writeStageResult } from '../../tools/spike/stages.mjs';
import { machineInfo } from '../../tools/spike/machine.mjs';
import { workPath, ensureDir } from '../../tools/lib/work.mjs';
import {
  S8_ID, S8_TITLE, S8_FALLBACK, S8_NOTES, S8_PACKS, RANGE_SEC, mogrtPath, prPaths, sequencePlan,
  realtimeFactor, readMeasurements, updateMeasurements, summaryLines, machineKey,
} from './lib.mjs';

// pr.jsx runs after the shared Premiere helpers: its insert uses importMogrt (part D, task 15).
const FILES = ['spikes/lib/pr-helpers.jsx', 'spikes/s8-perf/pr.jsx'];
const BASE_ITEM = 'bars_1080p25_30s.mp4';
const HOST = machineKey();
const argv = process.argv.slice(2);
const val = (f, d) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : d);
const stage = val('--stage', null);
const projectFile = val('--project', 'CRT_s8_perf.prproj');
if (stage !== 'insert' && stage !== 'export') {
  console.error('usage: node spikes/s8-perf/run-pr.mjs --stage insert|export [--project CRT_s8_perf.prproj]');
  process.exit(2);
}

const plan = sequencePlan();
const pr = prPaths();
const checks = [];
let prVersion = null;
const tagged = (name) => name.replace(/^pr: /, `pr@${HOST}: `);
console.log(`machine key: ${HOST}`);

// Spec §3.1 S8: a measurement without a verdict in phase 0, so the verdict is 'measured' and locked.
function save() {
  return writeStageResult({
    id: S8_ID, title: S8_TITLE, host: 'ae+pr', hostVersion: prVersion ? 'Pr ' + prVersion : null,
    stage: `pr:${stage}@${HOST}`, checks, verdict: 'measured', verdictLocked: true,
    fallback: S8_FALLBACK, notes: S8_NOTES, evidence: ['spikes/results/S8.data.json'],
  });
}

function stop(message) {
  save();
  console.error('STOP: ' + message);
  process.exit(1);
}

function nodeCheck(name, pass, detail, required = true) {
  checks.push({ name: tagged(name), pass, required, detail });
  return pass;
}

// One host call; a failed or timed-out call is recorded and stops the run. Node never repeats a host call
// (plan conventions); the single importMGT retry of spec 6.1 happens inside pr.jsx.
async function call(params, timeoutMs) {
  const what = params.seqName ? params.action + ' ' + params.seqName : params.action;
  const t0 = performance.now();
  let r;
  try {
    r = await run('pr', composeProbe(FILES, params), { timeoutMs });
  } catch (e) {
    nodeCheck('pr: ' + what + ' answered', false, e.message);
    stop(e.message + '\nCheck Premiere for a dialog, then: node tools/host-run.mjs --host pr "JSON.stringify({ v: app.version })"');
  }
  checks.push(...r.checks.map((c) => ({ ...c, name: tagged(c.name) })));
  prVersion = (r.data && r.data.hostVersion) || prVersion;
  return {
    data: r.data || {},
    wallMs: Math.round(performance.now() - t0),
    ok: r.checks.every((c) => c.pass || c.required === false),
  };
}

function probeVideo(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,nb_frames', '-of', 'json', file], { encoding: 'utf8' });
  const s = (JSON.parse(out).streams || [])[0] || {};
  return { w: Number(s.width), h: Number(s.height), frames: Number(s.nb_frames) };
}

if (stage === 'insert') {
  const presetsOk = [pr.presets.FHD, pr.presets.UHD]
    .map((f) => nodeCheck('pr: sequence preset exists', existsSync(f), f)).every(Boolean);
  if (!presetsOk) stop('sequence presets not found; set BRANDKIT_PR_ROOT to the Premiere install folder');
  const baseClip = workPath('fixtures', 'media', BASE_ITEM);
  nodeCheck('pr: baseline clip exists (task 7)', existsSync(baseClip), baseClip, false);
  const ready = S8_PACKS.filter((p) => nodeCheck(`pr: ${p.slug} MOGRT from the AE stage exists`, existsSync(mogrtPath(p.slug)), mogrtPath(p.slug)));
  if (!ready.length) stop('no MOGRT from the AE stage in ' + workPath('s8', 'mogrt'));

  const st = await call({ action: 'state', expectFresh: true, projectFile }, 60000);
  if (!st.ok) stop(`open an empty saved project ${projectFile} in Premiere (task 19, manual step)`);
  await call({
    action: 'setup',
    create: plan.map((s) => ({ name: s.name, preset: pr.presets[s.size] })),
    baseClip,
  }, 300000);
  await call({ action: 'state', expectSequences: plan.map((s) => ({ name: s.name, w: s.w, h: s.h })) }, 60000);
  await call({ action: 'base', baseItemName: BASE_ITEM, targets: plan.filter((s) => s.slug === 'base').map((s) => s.name) }, 120000);

  const inserts = {};
  let order = 0;
  for (const s of plan.filter((x) => ready.some((p) => p.slug === x.slug))) {
    order += 1;
    const res = await call({ action: 'insert', seqName: s.name, mogrtPath: mogrtPath(s.slug), label: 'perf_' + s.slug }, 600000);
    inserts[s.name] = {
      order, wallMs: res.wallMs, hostMs: res.data.hostMs, retried: res.data.retried === true,
      retryMs: res.data.retryMs || null, firstAttempt: res.data.firstAttempt || null, clip: res.data.clip || null,
    };
    console.log(`${s.name}: insert ${(res.wallMs / 1000).toFixed(1)} s (in host ${res.data.hostMs} ms)`
      + `${order === 1 ? ', first MOGRT in this project' : ''}${res.data.retried ? ', second attempt' : ''}`);
  }
  updateMeasurements({
    machines: { [HOST]: { machine: machineInfo(), pr: { version: prVersion, project: projectFile, presets: pr.presets, inserts } } },
  });
  const result = save();
  console.log(`S8 now: ${result.verdict}. Next: manual playback check (task 19), then --stage export`);
}

if (stage === 'export') {
  if (!nodeCheck('pr: export preset exists', existsSync(pr.exportPreset), pr.exportPreset)) {
    stop('export preset not found; set BRANDKIT_PR_ROOT to the Premiere install folder');
  }
  const mine = (readMeasurements().machines || {})[HOST] || {};
  const inserted = (mine.pr && mine.pr.inserts) || {};
  const outDir = ensureDir(workPath('s8', 'export'));
  const exportsM = {};
  for (const s of plan) {
    if (s.slug !== 'base' && !inserted[s.name]) {
      console.log(`${s.name}: skipped, no insert recorded on ${HOST}`);
      continue;
    }
    const outPath = `${outDir}/${s.name}.mov`;
    rmSync(outPath, { force: true });
    const required = s.slug !== 'base';
    const res = await call({
      action: 'export', seqName: s.name, outPath, presetPath: pr.exportPreset, rangeSec: RANGE_SEC, required,
    }, 1800000);
    const e = { wallMs: res.wallMs, hostMs: res.data.hostMs, returned: res.data.returned, realtime: realtimeFactor(RANGE_SEC, res.wallMs) };
    if (existsSync(outPath)) {
      const v = probeVideo(outPath);
      Object.assign(e, v, { bytes: statSync(outPath).size });
      nodeCheck(`pr: ${s.name} export is ${s.w}x${s.h} with ${RANGE_SEC * 25} frames (+-1)`,
        v.w === s.w && v.h === s.h && Math.abs(v.frames - RANGE_SEC * 25) <= 1, `${v.w}x${v.h}, ${v.frames} frames`, required);
    }
    exportsM[s.name] = e;
    console.log(`${s.name}: export of ${RANGE_SEC} s took ${(res.wallMs / 1000).toFixed(1)} s (${e.realtime}x real time)`);
  }
  const m = updateMeasurements({ machines: { [HOST]: { pr: { exports: exportsM } } } });
  const result = save();
  console.log('\n' + summaryLines(m.machines[HOST]).join('\n'));
  console.log(`\nS8: ${result.verdict} (${result.checks.length} checks) -> spikes/results/S8.json`);
}
