#!/usr/bin/env node
// S6: a changed MOGRT imported again into a project that already uses it; capsuleID (spec 3.1, S6).
//   node spikes/s6-capsule/run.mjs                  every stage, AE first, then Premiere
//   node spikes/s6-capsule/run.mjs --only <stages>  continue after a failed stage (same run folder)
//   node spikes/s6-capsule/run.mjs --project CRT_pr_s6_2.prproj --only pr-a,...   another fresh project
//   node spikes/s6-capsule/run.mjs --check          compose and lint every probe, no host
// Needs After Effects with the BrandKit Dev panel (CDP 8094) and no unsaved project of the user, Premiere
// with the fresh empty project CRT_pr_s6.prproj and the panel (CDP 8096), and S1/S2 outputs (part B).
import { copyFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { lintOrThrow } from '../../tools/host-run.mjs';
import { composeProbe } from '../../tools/spike/runner.mjs';
import { runStages, runStage, nodeCheck } from '../../tools/spike/multistage.mjs';
import { waitStableFile } from '../../tools/spike/wait-file.mjs';
import { workDir, workPath, ensureDir } from '../../tools/lib/work.mjs';
import { prBaseParams, presetSources, stagePreset, clearFrames } from '../../tools/pr/env.mjs';
import { readCapsuleId, patchCapsuleId, newCapsuleId, mogrtReady } from '../../tools/mogrt/capsule.mjs';
import { waitForPng } from '../../tools/png/read-png.mjs';
import { hexToRgb } from '../../tools/color/deltae.mjs';
import { COMP_LT, fixturePaths, fixtureParams } from '../fixtures/contract.mjs';
import { NEW_HEX, SLOTS, LOOK_KEYS, shotsAfter, qaLook, capsuleChecks, policyNote } from './analyze.mjs';

const ID = 'S6';
const TITLE = 'Повторный импорт MOGRT и capsuleID';
const FALLBACK = 'Политика: вставленные экземпляры заморожены, новая версия = новый шаблон с версией в имени';
const NOTES = 'AE работает с копией CRT_fixture_egp.aep в папке прогона; Premiere — в свежем проекте CRT_pr_s6.prproj, '
  + 'секвенция CRT_S6: A — шаблон S2, B — повторный экспорт как есть, C — он же со старым capsuleID, D — с новым.';
// Fixture contract (part B): the S2 template, the S1 copy with Essential Graphics, the SB Sans fonts.
const FIXTURE = fixturePaths();
const ORIG = path.posix.join(FIXTURE.mogrtDir, COMP_LT + '.mogrt');
const EGP_AEP = FIXTURE.egpAep;
const FONTS = Object.values(fixtureParams().fonts);
const DUP = 'CRT_LowerThird_v2';
const argv = process.argv.slice(2);
const PR6 = {
  projectFile: argv.includes('--project') ? argv[argv.indexOf('--project') + 1] : 'CRT_pr_s6.prproj',
  seqName: 'CRT_S6',
  dir: workPath('pr', 's6'),
};
const MGT_MEDIA = path.posix.join(PR6.dir, 'Motion Graphics Template Media');
const AE_PROBE = 'spikes/s6-capsule/ae-export.jsx';
const PR_FILES = ['spikes/lib/pr-helpers.jsx', 'spikes/s6-capsule/pr-insert.jsx'];

const aepCopy = (ctx) => path.posix.join(ctx.runDir, 'CRT_fixture_s6.aep');

function aeParams(ctx, mode) {
  const rgb = hexToRgb(NEW_HEX);
  return {
    mode, workDir: workDir(), aep: aepCopy(ctx), comp: COMP_LT, outDir: path.posix.join(ctx.runDir, mode),
    fonts: FONTS, hex: NEW_HEX, rgb: [rgb.r / 255, rgb.g / 255, rgb.b / 255], dupName: DUP,
  };
}

// S2 discipline: the next AE stage starts only after this .mogrt stopped growing and opens as a zip.
const aeStage = (mode) => async (ctx) => {
  if (mode === 'asis') {
    for (const f of [ORIG, EGP_AEP]) {
      if (!existsSync(f)) throw new Error('missing ' + f + ': run S1 and S2 (part B); by hand: part C task 14 step 1, task 16 step 1');
    }
    if (!existsSync(aepCopy(ctx))) copyFileSync(EGP_AEP, aepCopy(ctx));
  }
  const params = aeParams(ctx, mode);
  ensureDir(params.outDir);
  const t0 = Date.now();
  const r = await runStage({ host: 'ae', files: [AE_PROBE], params, timeoutMs: 300000 });
  if (r.data.returned === undefined) return r;
  const name = r.data.templateName || (mode === 'dup' ? DUP : COMP_LT);
  const file = path.posix.join(params.outDir, name + '.mogrt');
  const w = await waitStableFile(file, { stableMs: 2000, timeoutMs: 180000, sinceMs: t0 - 2000 });
  const ready = w.ok ? mogrtReady(file) : { ok: false, error: w.reason };
  r.checks.push(nodeCheck(mode + ': ' + name + '.mogrt written and readable', w.ok && ready.ok,
    { file, waitedMs: w.waitedMs, bytes: w.size, capsuleID: ready.capsuleID || null, error: ready.error || null }));
  return {
    ...r,
    data: { ...r.data, file: w.ok && ready.ok ? file : null, capsuleID: ready.capsuleID || null },
    evidence: w.ok ? [file] : [],
  };
};

async function ids(ctx) {
  const fileOf = (stage) => (ctx.stages[stage] && ctx.stages[stage].data.file) || null;
  const files = { asis: fileOf('ae-asis'), v2: fileOf('ae-changed'), dup: fileOf('ae-dup') };
  if (!files.v2) throw new Error('no re-exported .mogrt from stage ae-changed');
  const id = { orig: readCapsuleId(ORIG) };
  for (const [k, f] of Object.entries(files)) id[k] = f ? readCapsuleId(f) : null;
  const facts = {
    ...id,
    unchangedKeepsId: id.asis === null ? null : id.asis === id.orig,
    changedKeepsId: id.v2 === id.orig,
    dupNewId: id.dup === null ? null : id.dup !== id.orig && id.dup !== id.v2,
  };
  // The same file name in every variant, so only capsuleID and content differ.
  const sameFile = path.posix.join(ensureDir(path.posix.join(ctx.runDir, 'pr-sameid')), COMP_LT + '.mogrt');
  const newFile = path.posix.join(ensureDir(path.posix.join(ctx.runDir, 'pr-newid')), COMP_LT + '.mogrt');
  patchCapsuleId(files.v2, sameFile, id.orig);
  const fresh = patchCapsuleId(files.v2, newFile, newCapsuleId()).newId;
  return {
    checks: [
      nodeCheck('capsuleIDs read from the S2 template and the AE exports', Boolean(id.orig && id.v2), id),
      nodeCheck('AE: a re-export of the unchanged comp keeps the capsuleID', facts.unchangedKeepsId === true, facts, false),
      nodeCheck('AE: a re-export after a change keeps the capsuleID', facts.changedKeepsId === true, facts, false),
      nodeCheck('AE: a duplicated comp exports with a new capsuleID', facts.dupNewId === true, facts, false),
      nodeCheck('patched copies carry the old and a fresh capsuleID, the re-export itself unchanged',
        readCapsuleId(sameFile) === id.orig && readCapsuleId(newFile) === fresh && readCapsuleId(files.v2) === id.v2,
        { sameFile, newFile, fresh }),
    ],
    data: { facts, files: { ...files, sameFile, newFile } },
    evidence: [ORIG, sameFile, newFile],
  };
}

function listDir(dir) {
  return existsSync(dir) ? readdirSync(dir).sort() : 'missing';
}

function prParams(ctx, extra = {}, copy = true) {
  const a = ctx.stages['pr-a'];
  return {
    ...prBaseParams({ copy }),
    projectFile: PR6.projectFile,
    seqName: PR6.seqName,
    seqId: a ? a.data.seqId : null,
    preset: copy ? stagePreset(presetSources().seq1080p25, 'HD_1080p_25fps.sqpreset') : workPath('pr', 'presets', 'HD_1080p_25fps.sqpreset'),
    framesDir: path.posix.join(ctx.runDir, 'frames'),
    templateHint: 'CRT_LowerThird',
    ...extra,
  };
}

const prStage = (step, key, label, fileOf) => async (ctx) => {
  const file = fileOf(ctx);
  if (!file) throw new Error('no .mogrt for ' + key + ': stage ids has not run');
  clearFrames(ensureDir(path.posix.join(ctx.runDir, 'frames')), shotsAfter(step).map((s) => s.key));
  const r = await runStage({
    host: 'pr',
    files: PR_FILES,
    params: prParams(ctx, { mode: step === 0 ? 'setup' : 'insert', key, label, file, atSec: SLOTS[key], shots: shotsAfter(step) }),
    timeoutMs: 300000,
  });
  return { ...r, data: { ...r.data, mgtMedia: listDir(MGT_MEDIA) }, evidence: Object.values(r.data.frames || {}) };
};

const idsFile = (key) => (ctx) => ctx.stages.ids && ctx.stages.ids.data.files[key];

async function looks(ctx) {
  const frames = {};
  for (const n of ['pr-a', 'pr-b', 'pr-c', 'pr-d']) Object.assign(frames, (ctx.stages[n] && ctx.stages[n].data.frames) || {});
  const look = {};
  const detail = {};
  for (const key of LOOK_KEYS) {
    if (!frames[key]) {
      look[key] = 'missing';
      continue;
    }
    try {
      await waitForPng(frames[key], { timeoutMs: 60000 });
      detail[key] = qaLook(frames[key]);
      look[key] = detail[key].look;
    } catch (e) {
      look[key] = 'error';
      detail[key] = e.message;
    }
  }
  const facts = (ctx.stages.ids && ctx.stages.ids.data.facts) || {};
  const media = {};
  for (const n of ['pr-a', 'pr-b', 'pr-c', 'pr-d']) media[n] = ctx.stages[n] ? ctx.stages[n].data.mgtMedia : null;
  return {
    checks: capsuleChecks(look, facts).concat([
      nodeCheck('Motion Graphics Template Media after each import recorded', true, media, false),
    ]),
    data: { look, detail, media },
    notes: policyNote(look, facts),
  };
}

function checkOnly() {
  const ctx = { runDir: workPath('s6', 'run-check'), stages: { 'pr-a': { data: { seqId: 'x' } } } };
  for (const mode of ['asis', 'changed', 'dup']) {
    lintOrThrow(composeProbe([AE_PROBE], aeParams(ctx, mode)));
    console.log('OK ' + AE_PROBE + ' (' + mode + ')');
  }
  for (const step of [0, 1]) {
    lintOrThrow(composeProbe(PR_FILES, prParams(ctx, { mode: step ? 'insert' : 'setup', key: 'A', label: 'x', file: ORIG, atSec: 0, shots: shotsAfter(step) }, false)));
    console.log('OK spikes/s6-capsule/pr-insert.jsx (' + (step ? 'insert' : 'setup') + ')');
  }
}

if (process.argv.includes('--check')) {
  checkOnly();
} else {
  const out = await runStages({
    id: ID,
    title: TITLE,
    host: 'ae+pr',
    fallback: FALLBACK,
    notes: NOTES,
    argv,
    stages: [
      { name: 'ae-asis', host: 'ae', run: aeStage('asis') },
      { name: 'ae-changed', host: 'ae', run: aeStage('changed') },
      { name: 'ae-dup', host: 'ae', run: aeStage('dup') },
      { name: 'ids', host: 'node', run: ids },
      { name: 'pr-a', host: 'pr', run: prStage(0, 'A', 'S2 template', () => ORIG) },
      { name: 'pr-b', host: 'pr', run: prStage(1, 'B', 'AE re-export as is', idsFile('v2')) },
      { name: 'pr-c', host: 'pr', run: prStage(2, 'C', 're-export with the old capsuleID', idsFile('sameFile')) },
      { name: 'pr-d', host: 'pr', run: prStage(3, 'D', 're-export with a fresh capsuleID', idsFile('newFile')) },
      { name: 'looks', host: 'node', run: looks },
    ],
  });
  console.log('run folder: ' + out.runDir);
  process.exitCode = out.failed ? 1 : 0;
}
