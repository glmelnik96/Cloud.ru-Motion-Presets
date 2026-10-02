#!/usr/bin/env node
// S5: importMGT and MOGRT field writes in Premiere through CEP ExtendScript (spec 3.1, S5).
//   node spikes/s5-importmgt/run.mjs                    insert, shots, frames, readback, series, count
//   node spikes/s5-importmgt/run.mjs --only undo        on demand, right before the manual undo count
//   node spikes/s5-importmgt/run.mjs --only undo-group  the same inside app.beginUndoGroup, if Premiere has it
//   node spikes/s5-importmgt/run.mjs --only <stages>    continue after a failed stage (same run folder)
//   node spikes/s5-importmgt/run.mjs --check            compose and lint every probe, no host
// Needs the Task 15 fixture open in Premiere (BrandKit Dev panel, CDP 8096) and the S2 MOGRTs (part B).
import { existsSync } from 'node:fs';
import path from 'node:path';
import { lintOrThrow } from '../../tools/host-run.mjs';
import { composeProbe } from '../../tools/spike/runner.mjs';
import { runStages, runStage, nodeCheck } from '../../tools/spike/multistage.mjs';
import { workPath, ensureDir } from '../../tools/lib/work.mjs';
import { prBaseParams, clearFrames } from '../../tools/pr/env.mjs';
import { readPng, waitForPng } from '../../tools/png/read-png.mjs';
import { COMP_LT, COMP_HATCH, EGP, fixturePaths } from '../fixtures/contract.mjs';
import {
  AT, RDT_SEC, HATCH_SEC, SERIES, shotPlan, frameChecks, seriesStep, seriesChecks, recountChecks,
} from './analyze.mjs';

const ID = 'S5';
const TITLE = 'importMGT и запись полей (CEP)';
const FALLBACK = 'Если явная длительность ломает анимацию rdt-шаблона — вставка с длиной по умолчанию и ручное '
  + 'растягивание; trim-шаблоны панель всегда обрезает сама. Если не пишется текст — Premiere становится '
  + '«только вставка», текст правится в Properties';
const NOTES = 'Клон CRT_S5_work* секвенции CRT_Seq_1080p25 в CRT_pr_test.prproj: проверка перезаписи на V2 в 12 с; '
  + 'на V3 — L1 (поля записаны, 15 с) в 40 с, L2 (список) в 60 с, L3 (по умолчанию) в 75 с, Hatch (12 с) в 90 с, '
  + 'вставки для подсчёта отмены с 900 с. Серия — в своём клоне CRT_S5_series*, на V3 с 200 с.';
const HELPERS = 'spikes/lib/pr-helpers.jsx';
// The S2 templates and the Essential Graphics labels S1 gave them, key -> display name (fixture contract, part B).
const LT = path.posix.join(fixturePaths().mogrtDir, COMP_LT + '.mogrt');
const HATCH = path.posix.join(fixturePaths().mogrtDir, COMP_HATCH + '.mogrt');
const labels = (comp) => Object.fromEntries(EGP[comp].map((p) => [p.key, p.label]));
const NAMES = labels(COMP_LT);
const HATCH_NAMES = labels(COMP_HATCH);
const VALUES = {
  name: 'Анна-Мария Ёлкина-Константинопольская',
  role: 'Руководитель облачной платформы',
  accent: { r: 160, g: 104, b: 255 },
};
const UNDO_AT = { undo: 900, 'undo-group': 920 };

function prParams(ctx, extra = {}, copy = true) {
  const ins = ctx.stages.insert && ctx.stages.insert.data;
  return {
    ...prBaseParams({ copy }),
    workBase: 'CRT_S5_work',
    workSeqId: ins ? ins.workSeqId : null,
    workSeq: ins ? ins.workSeq : null,
    framesDir: path.posix.join(ctx.runDir, 'frames'),
    names: NAMES,
    hatchNames: HATCH_NAMES,
    ...extra,
  };
}

async function insert(ctx) {
  for (const f of [LT, HATCH]) {
    if (!existsSync(f)) throw new Error('missing ' + f + ': run S2 (part B) or export it by hand (Task 16, step 1)');
  }
  return runStage({
    host: 'pr',
    files: [HELPERS, 'spikes/s5-importmgt/stage-insert.jsx'],
    params: prParams(ctx, { lt: LT, hatch: HATCH, values: VALUES, at: AT, rdtSec: RDT_SEC, hatchSec: HATCH_SEC }),
    timeoutMs: 600000,
  });
}

async function shots(ctx) {
  clearFrames(ensureDir(path.posix.join(ctx.runDir, 'frames')), shotPlan().map((s) => s.key));
  const r = await runStage({
    host: 'pr', files: [HELPERS, 'spikes/lib/pr-shots.jsx'], params: prParams(ctx, { shots: shotPlan() }), timeoutMs: 300000,
  });
  return { ...r, evidence: Object.values(r.data.frames || {}) };
}

async function frames(ctx) {
  const files = (ctx.stages.shots && ctx.stages.shots.data.frames) || {};
  const checks = [];
  const img = {};
  for (const s of shotPlan()) {
    const name = 'frame ' + s.key + ' is a complete 1920x1080 PNG';
    if (!files[s.key]) {
      checks.push(nodeCheck(name, false, 'not exported'));
      continue;
    }
    try {
      await waitForPng(files[s.key], { timeoutMs: 60000 });
    } catch (e) {
      checks.push(nodeCheck(name, false, e.message));
      continue;
    }
    const im = readPng(files[s.key]);
    const full = im.width === 1920 && im.height === 1080;
    checks.push(nodeCheck(name, full, im.width + 'x' + im.height));
    if (full) img[s.key] = im;
  }
  const r = frameChecks(img, (ctx.stages.insert && ctx.stages.insert.data) || {});
  return { checks: checks.concat(r.checks), data: r.data };
}

async function readback(ctx) {
  const ins = (ctx.stages.insert && ctx.stages.insert.data) || {};
  const w = ins.writes || {};
  return runStage({
    host: 'pr',
    files: [HELPERS, 'spikes/s5-importmgt/stage-readback.jsx'],
    params: prParams(ctx, {
      at: AT,
      rdtSec: RDT_SEC,
      expect: {
        name: VALUES.name,
        role: VALUES.role,
        showRole: w.showRole ? w.showRole.written.value : null,
        duration: RDT_SEC,
        style: ins.style ? ins.style.written : null,
        hatchDuration: HATCH_SEC,
      },
    }),
    timeoutMs: 120000,
  });
}

function seriesParams(ctx) {
  const ins = ctx.stages.insert && ctx.stages.insert.data;
  const lenF = ins && ins.l1 ? ins.l1.lenF : null;
  return { mogrt: LT, startSec: SERIES.startSec, stepSec: seriesStep(lenF), count: SERIES.count, vIdx: SERIES.vIdx };
}

async function series(ctx) {
  const sp = seriesParams(ctx);
  const r = await runStage({
    host: 'pr', files: [HELPERS, 'spikes/s5-importmgt/stage-series.jsx'], params: prParams(ctx, { ...sp, workBase: 'CRT_S5_series' }),
    timeoutMs: 900000,
  });
  const s = seriesChecks(r.data.rows || [], sp);
  return { ...r, checks: r.checks.concat(s.checks), notes: s.note, data: { ...r.data, summary: s.summary, params: sp } };
}

async function count(ctx) {
  const st = ctx.stages.series;
  if (!st || !st.data.params) throw new Error('stage series has not run');
  const r = await runStage({
    host: 'pr',
    files: [HELPERS, 'spikes/s5-importmgt/stage-count.jsx'],
    params: prParams(ctx, { ...st.data.params, workSeqId: st.data.workSeqId, workSeq: st.data.workSeq }),
    timeoutMs: 120000,
  });
  const c = recountChecks(st.data.rows || [], r.data.present || {});
  return { ...r, checks: r.checks.concat(c.checks), notes: c.note, data: { ...r.data, late: c.late } };
}

const undoStage = (name, useUndoGroup) => async (ctx) => {
  const r = await runStage({
    host: 'pr',
    files: [HELPERS, 'spikes/s5-importmgt/stage-undo.jsx'],
    params: prParams(ctx, { mogrt: LT, atSec: UNDO_AT[name], vIdx: SERIES.vIdx, text: 'Проверка отмены', useUndoGroup }),
    timeoutMs: 120000,
  });
  console.log(name + ': the clip for the History count is on V3 at ' + r.data.atSec + ' s of ' + r.data.workSeq);
  return r;
};

// Every probe composed with representative PARAMS and linted exactly as run() does before sending.
function checkOnly() {
  const ctx = { runDir: workPath('s5', 'run-check'), stages: { insert: { data: { workSeqId: 'x', workSeq: 'CRT_S5_work', l1: { lenF: 250 } } } } };
  const base = prParams(ctx, {}, false);
  const probes = [
    ['spikes/s5-importmgt/stage-insert.jsx', { lt: LT, hatch: HATCH, values: VALUES, at: AT, rdtSec: RDT_SEC, hatchSec: HATCH_SEC }],
    ['spikes/lib/pr-shots.jsx', { shots: shotPlan() }],
    ['spikes/s5-importmgt/stage-readback.jsx', { at: AT, rdtSec: RDT_SEC, expect: { name: VALUES.name } }],
    ['spikes/s5-importmgt/stage-series.jsx', { ...seriesParams(ctx), workBase: 'CRT_S5_series' }],
    ['spikes/s5-importmgt/stage-count.jsx', { ...seriesParams(ctx), workSeqId: 'y' }],
    ['spikes/s5-importmgt/stage-undo.jsx', { mogrt: LT, atSec: 900, vIdx: 2, text: 'Проверка отмены', useUndoGroup: true }],
  ];
  for (const [file, extra] of probes) {
    lintOrThrow(composeProbe([HELPERS, file], { ...base, ...extra }));
    console.log('OK ' + file);
  }
}

if (process.argv.includes('--check')) {
  checkOnly();
} else {
  const out = await runStages({
    id: ID,
    title: TITLE,
    host: 'pr',
    fallback: FALLBACK,
    notes: NOTES,
    argv: process.argv.slice(2),
    stages: [
      { name: 'insert', host: 'pr', run: insert },
      { name: 'shots', host: 'pr', run: shots },
      { name: 'frames', host: 'node', run: frames },
      { name: 'readback', host: 'pr', run: readback },
      { name: 'series', host: 'pr', run: series },
      { name: 'count', host: 'pr', run: count },
      { name: 'undo', host: 'pr', onDemand: true, run: undoStage('undo', false) },
      { name: 'undo-group', host: 'pr', onDemand: true, run: undoStage('undo-group', true) },
    ],
  });
  console.log('run folder: ' + out.runDir);
  process.exitCode = out.failed ? 1 : 0;
}
