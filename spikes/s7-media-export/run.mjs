#!/usr/bin/env node
// S7: media, brand export, "fit to window", Crop through QE, the template .prproj (spec 3.1 S7, D11, D25).
//   node spikes/s7-media-export/run.mjs                  every stage
//   node spikes/s7-media-export/run.mjs --only <stages>  continue after a failed stage (same run folder)
//   node spikes/s7-media-export/run.mjs --check          compose and lint every probe, no host
// Needs Premiere with CRT_pr_test.prproj and the BrandKit Dev panel (CDP 8096), the Task 15 fixture, and
// CR_Templates_test.prproj built by hand and closed (Task 18). ffmpeg/ffprobe check the exports.
import { copyFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { lintOrThrow } from '../../tools/host-run.mjs';
import { composeProbe } from '../../tools/spike/runner.mjs';
import { runStages, runStage, nodeCheck } from '../../tools/spike/multistage.mjs';
import { waitStableFile } from '../../tools/spike/wait-file.mjs';
import { probeMedia } from '../../tools/lib/media-probe.mjs';
import { workPath, ensureDir } from '../../tools/lib/work.mjs';
import { prBaseParams, fixtureMedia, clearFrames } from '../../tools/pr/env.mjs';
import { readPng, waitForPng } from '../../tools/png/read-png.mjs';
import { sourceRoot } from '../../tools/packs/paths.mjs';
import {
  WINDOW, WIDE_WINDOW, CROP_LEFT, EXPORT_RANGE, alphaChecks, parseMeanVolume, exportChecks, baseOfStill, fitChecks, blurChecks,
} from './analyze.mjs';

const ID = 'S7';
const TITLE = 'Медиа, экспорт, вписать в окно, шаблонный .prproj';
const FALLBACK = 'Размытие полей подкаста — .prfpset для ручного применения; стиль субтитров — инструкцией; '
  + 'если Crop через QE не работает — панель просит поставить клип спикера ниже клипа экрана или добавить Crop вручную';
const NOTES = 'Клоны секвенции CRT_Seq_1080p25 в CRT_pr_test.prproj: CRT_S7_media* (медиа и экспорт), CRT_S7_fit* (окно и Crop), '
  + 'CRT_S7_tpl* (корректирующий слой); экспорты и кадры — в папке прогона.';
const HELPERS = 'spikes/lib/pr-helpers.jsx';
// The source package is read-only: Node copies the brand preset out of it. Its path is sourceRoot() of
// plan 2 (tools/packs/paths.mjs), set with BRANDKIT_SOURCE.
const EPR_SRC = sourceRoot() + '/7_Пресеты_Media_Encoder/FullHD.epr';
const EPR = workPath('pr', 'FullHD.epr');
const TEMPLATES = workPath('pr', 'CR_Templates_test.prproj');
const ADJ = 'CRT_Blur_Adjust';
const STYLE = 'CR Субтитры';
const FIT = { stillSec: 40, wideSec: 50, shotSec: 41 };
const TPL = { atSec: 11, shotSec: 12 };

// Each group of stages works in its own clone of the fixture, made by the group's first stage, so a re-run
// of that stage starts again on a clean clone: media (+ export), fit-place (+ fit-apply), template-place.
function cloneOf(ctx, stage) {
  const d = ctx.stages[stage] && ctx.stages[stage].data;
  return { workSeqId: d ? d.workSeqId : null, workSeq: d ? d.workSeq : null };
}

function prParams(ctx, extra = {}, copy = true) {
  return { ...prBaseParams({ copy }), framesDir: path.posix.join(ctx.runDir, 'frames'), ...extra };
}

// Frame keys each stage exports; their files from an earlier attempt are removed first.
const FRAME_KEYS = {
  'stage-media.jsx': ['alphaBefore', 'alphaAfter'],
  'stage-fit-place.jsx': ['fitBase'],
  'stage-fit-apply.jsx': ['fitWindow', 'fitCrop'],
  'stage-template-place.jsx': ['tplBefore', 'tplAfter'],
};

async function prStage(ctx, file, extra, timeoutMs = 300000) {
  clearFrames(ensureDir(path.posix.join(ctx.runDir, 'frames')), FRAME_KEYS[file] || []);
  const r = await runStage({ host: 'pr', files: [HELPERS, 'spikes/s7-media-export/' + file], params: prParams(ctx, extra), timeoutMs });
  return { ...r, evidence: Object.values(r.data.frames || {}) };
}

// Frames of a stage as decoded images; a missing or broken frame is a failed check, not an exception.
async function framesOf(ctx, stage, keys) {
  const fr = (ctx.stages[stage] && ctx.stages[stage].data.frames) || {};
  const img = {};
  const checks = [];
  for (const k of keys) {
    const name = 'frame ' + k + ' is a complete 1920x1080 PNG';
    if (!fr[k]) {
      checks.push(nodeCheck(name, false, 'not exported by stage ' + stage));
      continue;
    }
    try {
      await waitForPng(fr[k], { timeoutMs: 60000 });
      img[k] = readPng(fr[k]);
      checks.push(nodeCheck(name, img[k].width === 1920 && img[k].height === 1080, img[k].width + 'x' + img[k].height));
    } catch (e) {
      checks.push(nodeCheck(name, false, e.message));
    }
  }
  return { img, checks };
}

const MEDIA_PARAMS = {
  alpha: fixtureMedia('alpha_prores4444_1080p25_5s.mov'), wav: fixtureMedia('tone_48k_5s.wav'), clipSec: 5, shotSec: 2,
};

const media = (ctx) => prStage(ctx, 'stage-media.jsx', { ...MEDIA_PARAMS, workBase: 'CRT_S7_media' });

async function mediaCheck(ctx) {
  const f = await framesOf(ctx, 'media', ['alphaBefore', 'alphaAfter']);
  const extra = f.img.alphaBefore && f.img.alphaAfter ? alphaChecks(f.img.alphaBefore, f.img.alphaAfter) : [];
  return { checks: f.checks.concat(extra) };
}

async function exportStage(ctx) {
  if (!existsSync(EPR_SRC)) throw new Error('brand preset not found: ' + EPR_SRC + ' (set BRANDKIT_SOURCE)');
  ensureDir(workPath('pr'));
  copyFileSync(EPR_SRC, EPR);
  const outDir = ensureDir(path.posix.join(ctx.runDir, 'export'));
  for (const f of readdirSync(outDir)) {
    if (/^(direct|ame)_/.test(f)) rmSync(path.posix.join(outDir, f), { force: true });
  }
  const startedAt = Date.now();
  const r = await prStage(ctx, 'stage-export.jsx', {
    ...cloneOf(ctx, 'media'), epr: EPR, outDir, inSec: EXPORT_RANGE.inSec, outSec: EXPORT_RANGE.outSec,
  }, 900000);
  return { ...r, data: { ...r.data, startedAt } };
}

function meanVolumeDb(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-ss', '1', '-t', '3', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'],
    { encoding: 'utf8' });
  return parseMeanVolume(String(r.stderr || ''));
}

// exportAsMediaDirect has finished when it returns; the AME job writes later, after its queue starts.
async function exportCheck(ctx) {
  const st = (ctx.stages.export && ctx.stages.export.data) || {};
  const checks = [];
  const data = {};
  for (const [key, timeoutMs, required] of [['direct', 120000, true], ['ame', 900000, false]]) {
    const file = st[key] && st[key].file;
    if (!file) {
      checks.push(...exportChecks(key, null, null, required));
      continue;
    }
    const w = await waitStableFile(file, { stableMs: 5000, timeoutMs, intervalMs: 1000, sinceMs: (st.startedAt || 0) - 2000 });
    if (!w.ok) {
      checks.push(nodeCheck(key + ': the export file settled', false, w, required));
      continue;
    }
    data[key] = { probe: probeMedia(file), meanVolume: meanVolumeDb(file), bytes: w.size };
    checks.push(...exportChecks(key, data[key].probe, data[key].meanVolume, required));
  }
  return { checks, data, evidence: ['direct', 'ame'].map((k) => st[k] && st[k].file).filter(Boolean) };
}

const fitPlace = (ctx) => prStage(ctx, 'stage-fit-place.jsx', {
  workBase: 'CRT_S7_fit', still: fixtureMedia('slot_b.png'), bars2: fixtureMedia('bars2_1080p25_10s.mp4'), ...FIT,
});

// Scale of the still as it arrived (Motion parameter 1, recorded by fit-place), so baseW is at Scale 100.
async function fitBase(ctx) {
  const f = await framesOf(ctx, 'fit-place', ['fitBase']);
  if (!f.img.fitBase) return { checks: f.checks };
  const motion = ctx.stages['fit-place'].data.motion;
  const scale = motion && motion[1] ? Number(motion[1].value.value) : 100;
  const r = baseOfStill(f.img.fitBase, scale > 0 ? scale : 100);
  return { checks: f.checks.concat([r.check]), data: { baseW: r.baseW, currentScale: scale } };
}

async function fitApply(ctx) {
  const place = ctx.stages['fit-place'] && ctx.stages['fit-place'].data;
  const baseW = ctx.stages['fit-base'] && ctx.stages['fit-base'].data.baseW;
  if (!place || !place.still || !place.wide || !baseW) throw new Error('stages fit-place and fit-base must pass first');
  return prStage(ctx, 'stage-fit-apply.jsx', {
    ...cloneOf(ctx, 'fit-place'), ...FIT, stillTrack: place.still.track, wideTrack: place.wide.track, window: WINDOW, wideWindow: WIDE_WINDOW, baseW,
    frameW: 1920, frameH: 1080, cropNames: ['Crop', 'Обрезка', 'AE.ADBE Crop'], cropHints: ['crop', 'обрез'], cropParam: 0, cropLeft: CROP_LEFT,
  });
}

async function fitCheck(ctx) {
  const f = await framesOf(ctx, 'fit-apply', ['fitWindow', 'fitCrop']);
  return { checks: f.checks.concat(fitChecks(f.img.fitWindow || null, f.img.fitCrop || null)) };
}

async function templateImport(ctx) {
  if (!existsSync(TEMPLATES)) throw new Error('missing ' + TEMPLATES + ': build it by hand first (Task 18, step 13)');
  return prStage(ctx, 'stage-template-import.jsx', { templates: TEMPLATES, adjName: ADJ, styleName: STYLE, waitMs: 30000 }, 180000);
}

function templatePlace(ctx) {
  const imp = ctx.stages['template-import'] && ctx.stages['template-import'].data;
  return prStage(ctx, 'stage-template-place.jsx', {
    workBase: 'CRT_S7_tpl', adjNodeId: imp && imp.adj ? imp.adj.nodeId : null, adjName: ADJ, ...TPL,
  });
}

async function templateCheck(ctx) {
  const f = await framesOf(ctx, 'template-place', ['tplBefore', 'tplAfter']);
  const extra = f.img.tplBefore && f.img.tplAfter ? blurChecks(f.img.tplBefore, f.img.tplAfter) : [];
  return { checks: f.checks.concat(extra) };
}

function checkOnly() {
  const ctx = { runDir: workPath('s7', 'run-check'), stages: { media: { data: { workSeqId: 'x', workSeq: 'CRT_S7_media' } } } };
  const probes = [
    ['stage-media.jsx', { ...MEDIA_PARAMS, workBase: 'CRT_S7_media' }],
    ['stage-export.jsx', { ...cloneOf(ctx, 'media'), epr: EPR, outDir: workPath('s7', 'run-check', 'export'), inSec: 0, outSec: 5 }],
    ['stage-fit-place.jsx', { workBase: 'CRT_S7_fit', still: fixtureMedia('slot_b.png'), bars2: fixtureMedia('bars2_1080p25_10s.mp4'), ...FIT }],
    ['stage-fit-apply.jsx', { workSeqId: 'y', ...FIT, stillTrack: 1, wideTrack: 1, window: WINDOW, wideWindow: WIDE_WINDOW, baseW: 400, frameW: 1920, frameH: 1080,
      cropNames: ['Crop', 'Обрезка', 'AE.ADBE Crop'], cropHints: ['crop', 'обрез'], cropParam: 0, cropLeft: CROP_LEFT }],
    ['stage-template-import.jsx', { templates: TEMPLATES, adjName: ADJ, styleName: STYLE, waitMs: 30000 }],
    ['stage-template-place.jsx', { workBase: 'CRT_S7_tpl', adjNodeId: null, adjName: ADJ, ...TPL }],
  ];
  for (const [file, extra] of probes) {
    lintOrThrow(composeProbe([HELPERS, 'spikes/s7-media-export/' + file], prParams(ctx, extra, false)));
    console.log('OK spikes/s7-media-export/' + file);
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
      { name: 'media', host: 'pr', run: media },
      { name: 'media-check', host: 'node', run: mediaCheck },
      { name: 'export', host: 'pr', run: exportStage },
      { name: 'export-check', host: 'node', run: exportCheck },
      { name: 'fit-place', host: 'pr', run: fitPlace },
      { name: 'fit-base', host: 'node', run: fitBase },
      { name: 'fit-apply', host: 'pr', run: fitApply },
      { name: 'fit-check', host: 'node', run: fitCheck },
      { name: 'template-import', host: 'pr', run: templateImport },
      { name: 'template-place', host: 'pr', run: templatePlace },
      { name: 'template-check', host: 'node', run: templateCheck },
    ],
  });
  console.log('run folder: ' + out.runDir);
  process.exitCode = out.failed ? 1 : 0;
}
