#!/usr/bin/env node
// S3: a template instance in a user's AE project (spec §3.1 S3, §6.1 "After Effects").
//   node spikes/s3-instance/run.mjs            probes 1-4 and 6 (time remap) in a fresh user project;
//                                              frames measured here
//   node spikes/s3-instance/run.mjs --linear   after the manual user_linear.aep step: probe 5, merged in
//   node spikes/s3-instance/run.mjs --check    compose and lint the six probes, no host needed
// Writes spikes/results/S3.json and spikes/results/S3.data.json (Essential Properties map, measurements, and
// the duration-fit mechanism for contract rule C27 as the top-level fields mechanism and mechanismReason).
// Several probes instead of one runSpike call: Node has to copy footage and wait for PNG files between them.
import { existsSync, copyFileSync, rmSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { run, lintOrThrow } from '../../tools/host-run.mjs';
import { composeProbe } from '../../tools/spike/runner.mjs';
import { makeResult, writeResult, RESULTS_DIR } from '../../tools/spike/result.mjs';
import { workPath, ensureDir } from '../../tools/lib/work.mjs';
import { readPng, waitForPng, meanColor, findColorCentroid } from '../../tools/png/read-png.mjs';
import { deltaE2000Rgb, hexToRgb, rgbToHex } from '../../tools/color/deltae.mjs';
import { COMP_LT, COMP_HATCH, EGP, fixturePaths, fixtureParams } from '../fixtures/contract.mjs';
import {
  LT, FRAMES, REGIONS, COLORS, REMAP_MODELS, expectedLtX, explainX, hatchX, nearX, frameTime, round, describeLt,
  remapKeys, recommendMechanism,
} from './analyze.mjs';

const ID = 'S3';
const TITLE = 'Экземпляр шаблона в проекте пользователя';
const FALLBACK = 'Выбрать работающий механизм длительности и записать в контракт §4.2';
const LIB = 'spikes/s3-instance/lib.jsx';
const RESULT_FILE = path.join(RESULTS_DIR, 'S3.json');
const DATA_FILE = path.join(RESULTS_DIR, 'S3.data.json');
const DE_MAX = 2; // spec §4.4: dE2000 <= 2
const HATCH_DEFAULT_DURATION = 10; // CRT_Hatch_v1 CTRL Duration in the fixture

// Essential Graphics display names set by S1, key -> label (fixture contract, part B). The Hatch Duration
// carries the same label as the lower third's (EGP[COMP_HATCH]), so probe 4 uses this map as well.
const EGP_LABELS = Object.fromEntries(EGP[COMP_LT].map((e) => [e.key, e.label]));

const FX = fixturePaths();
const W = {
  fixtureEgp: FX.egpAep,
  slotA: FX.slotA,
  slotB: path.posix.join(FX.mediaDir, 'slot_b.png'),
  userProject: workPath('s3', 'user_s3.aep'),
  linearProject: workPath('s3', 'user_linear.aep'),
  bkDir: workPath('s3', 'Cloud.ru BrandKit', 'CRT_LowerThird@1'),
  frames: workPath('s3', 'frames'),
};

const png = (name) => path.posix.join(W.frames, name);
const OUT = {
  before: png('lt_before_f200.png'),
  after: png('lt_after_f200.png'),
  rdtIntro: png('lt_rdt_f062.png'),
  rdtOutro: png('lt_rdt_f412.png'),
  trimIntro: png('lt_trimout_f062.png'),
  trimOutro: png('lt_trimout_f412.png'),
  hatchHold: png('hatch_f262.png'),
  hatchOut: png('hatch_f287.png'),
  remapIntro: png('lt_remap_f062.png'),
  remapOutro: png('lt_remap_f412.png'),
  linear: png('lt_linear_f200.png'),
};

const PARAMS = {
  userProject: W.userProject,
  linearProject: W.linearProject,
  fixtureEgp: W.fixtureEgp,
  slotB: W.slotB,
  fonts: Object.values(fixtureParams().fonts),
  ltComp: COMP_LT,
  hatchComp: COMP_HATCH,
  bin: 'Cloud.ru BrandKit',
  binComment: 'CRT_LowerThird@1',
  ltStart: LT.start,
  ltTarget: LT.target,
  hatchLength: 12,
  egp: EGP_LABELS,
  values: { name: 'Анна-Мария Ёлкина', showRole: 0, ltDuration: LT.target, style: 2, hatchDuration: 12 },
  // Probe 6: [layer time, template time] keys of the 15 s time-remapped instance (0->0, 1->1, 14->9, 15->10).
  remapKeys: remapKeys({ ...LT, layerDur: LT.target }),
  frames: FRAMES,
  out: OUT,
};

const checks = [];
const data = {};
let hostVersion = null;
const images = new Map();

const add = (name, pass, detail, required = true) => {
  checks.push({ name, pass: Boolean(pass), required, detail });
};

async function probe(file, params) {
  const jsx = composeProbe([LIB, 'spikes/s3-instance/' + file], params);
  const r = await run('ae', jsx, { timeoutMs: 300000 });
  if (!r || !Array.isArray(r.checks)) {
    throw new Error(file + ': the probe must return finish({...}); got ' + JSON.stringify(r).slice(0, 300));
  }
  checks.push(...r.checks);
  if (r.data && r.data.hostVersion) hostVersion = r.data.hostVersion;
  return r.data || {};
}

// saveFrameToPng returns before the files exist (ae-quirks #27, #40, #50): wait, then check the size.
async function frames(...files) {
  try {
    for (const f of files) await waitForPng(f, { timeoutMs: 180000 });
  } catch (e) {
    add('frames written to disk', false, e.message);
    return false;
  }
  const sizes = files.map((f) => {
    const img = readPng(f);
    images.set(f, img);
    return { file: path.posix.basename(f), w: img.width, h: img.height };
  });
  add('frames at full resolution 1920x1080: ' + sizes.map((s) => s.file).join(', '),
    sizes.every((s) => s.w === 1920 && s.h === 1080), sizes);
  return sizes.every((s) => s.w === 1920 && s.h === 1080);
}

const img = (f) => images.get(f);
const probeSq = (f) => findColorCentroid(img(f), COLORS.probe, 10);
const dE = (mean, hex) => deltaE2000Rgb(mean, hexToRgb(hex));

function analyseRdt() {
  const intro = probeSq(OUT.rdtIntro);
  const outro = probeSq(OUT.rdtOutro);
  data.rdt = { intro: describeLt(FRAMES.intro, intro), outro: describeLt(FRAMES.outro, outro) };
  add('RDT stretch: intro keeps its speed (PROBE_SQ x~148 at 0.48 s into the instance)',
    nearX(intro, expectedLtX(FRAMES.intro, 'rdt')), data.rdt.intro);
  add('RDT stretch: outro keeps its speed (PROBE_SQ x~248 at 14.48 s into the instance)',
    nearX(outro, expectedLtX(FRAMES.outro, 'rdt')), data.rdt.outro);
}

function analyseFields(color) {
  const before = img(OUT.before);
  const after = img(OUT.after);
  const patch = meanColor(after, REGIONS.patch);
  const dPatch = dE(patch, COLORS.qa);
  data.patchDefault = { r: patch.r, g: patch.g, b: patch.b };
  add('colour patch dE2000 <= 2 vs #26D07C in the user project', dPatch <= DE_MAX,
    { mean: rgbToHex(patch), alpha: round(patch.a, 1), dE: round(dPatch, 3), color });

  // Render-side confirmation of the writes. Optional: positions come from the part B fixture.
  const darkBefore = findColorCentroid(before, COLORS.plateDark, 6);
  const lightAfter = findColorCentroid(after, COLORS.plateLight, 6);
  add('render: style 2 turns the name plate light', darkBefore.count >= 1000 && lightAfter.count >= 1000,
    { darkBefore: darkBefore.count, lightAfter: lightAfter.count }, false);
  add('render: the longer name widens the plate (sourceRectAtTime sees the override)',
    Boolean(darkBefore.box && lightAfter.box) && lightAfter.box.w - darkBefore.box.w >= 40,
    { before: darkBefore.box, after: lightAfter.box }, false);
  const roleBefore = findColorCentroid(before, COLORS.white, 4, { region: REGIONS.role }).count;
  const roleAfter = findColorCentroid(after, COLORS.white, 4, { region: REGIONS.role }).count;
  add('render: showRole 0 hides the role line', roleBefore >= 50 && roleAfter === 0, { roleBefore, roleAfter }, false);
  const slotBefore = meanColor(before, REGIONS.slot);
  const slotAfter = meanColor(after, REGIONS.slot);
  const dA = dE(slotBefore, COLORS.slotA);
  const dB = dE(slotAfter, COLORS.slotB);
  add('render: the photo slot shows slot_b after setAlternateSource', dA <= DE_MAX && dB <= DE_MAX,
    { before: rgbToHex(slotBefore), dEslotA: round(dA, 3), after: rgbToHex(slotAfter), dEslotB: round(dB, 3) }, false);
}

function analyseTrimOut(layer) {
  const intro = probeSq(OUT.trimIntro);
  const outro = probeSq(OUT.trimOutro);
  data.trimOutFrames = { intro: describeLt(FRAMES.intro, intro), outro: describeLt(FRAMES.outro, outro) };
  add('trim-out (info): moving the out point alone gives an RDT fit',
    explainX(FRAMES.intro, intro).includes('rdt') && explainX(FRAMES.outro, outro).includes('rdt'),
    { layer: layer || null, ...data.trimOutFrames }, false);
}

function analyseHatch() {
  const d = PARAMS.values.hatchDuration;
  const rows = [
    [FRAMES.hatchHold, OUT.hatchHold, 'trim: hold until Duration - 1 (PROBE_SQ x~100 at 10.48 s)'],
    [FRAMES.hatchOut, OUT.hatchOut, 'trim: the outro follows Duration (PROBE_SQ x~148 at 11.48 s)'],
  ];
  data.trimFrames = [];
  for (const [frame, file, name] of rows) {
    const m = probeSq(file);
    const t = frameTime(frame);
    const detail = { frame, x: round(m.x), count: m.count, expected: round(hatchX(t, d)), ifDurationIgnored: round(hatchX(t, HATCH_DEFAULT_DURATION)) };
    data.trimFrames.push(detail);
    add(name, nearX(m, hatchX(t, d)), detail);
  }
}

// Time remap on the fresh instance in USER_Comp_Remap: the keys must give the rdt mapping.
// Information only; the mechanism for contract rule C27 comes from recommendMechanism.
function analyseRemap() {
  const intro = probeSq(OUT.remapIntro);
  const outro = probeSq(OUT.remapOutro);
  data.remapFrames = {
    intro: describeLt(FRAMES.intro, intro, REMAP_MODELS),
    outro: describeLt(FRAMES.outro, outro, REMAP_MODELS),
  };
  add('time remap: intro keeps its speed (PROBE_SQ x~148 at 0.48 s into the instance)',
    nearX(intro, expectedLtX(FRAMES.intro, 'remap')), data.remapFrames.intro, false);
  add('time remap: outro keeps its speed (PROBE_SQ x~248 at 14.48 s into the instance)',
    nearX(outro, expectedLtX(FRAMES.outro, 'remap')), data.remapFrames.outro, false);
}

function save(notes) {
  const result = makeResult({
    id: ID, title: TITLE, host: 'ae', hostVersion, checks, fallback: FALLBACK, notes,
    evidence: ['spikes/results/S3.data.json', ...Object.values(OUT).filter((f) => existsSync(f))],
  });
  const file = writeResult(result);
  // Plan 1 task 30 copies data.mechanism into contract rule C27.
  Object.assign(data, recommendMechanism(checks));
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
  const passed = checks.filter((c) => c.pass).length;
  console.log(`${ID}: ${result.verdict} (${passed}/${checks.length}) -> ${file}`);
  console.log(`${ID} mechanism: ${data.mechanism} (${data.mechanismReason})`);
}

function stop(reason) {
  save('stopped: ' + reason);
  console.error('S3 stopped: ' + reason);
  process.exitCode = 1;
}

async function main() {
  for (const f of [W.fixtureEgp, W.slotA, W.slotB]) {
    if (!existsSync(f)) {
      console.error('missing ' + f + ': run Task 7 and S1 (part B) first, or Task 14 step 1 by hand');
      process.exit(2);
    }
  }
  // Stale frames are indistinguishable from fresh ones (ae-quirks #27); a stale project would hide a failed save.
  rmSync(W.frames, { recursive: true, force: true });
  ensureDir(W.frames);
  ensureDir(W.bkDir);
  try {
    rmSync(W.userProject, { force: true });
  } catch (e) {
    console.error('cannot remove ' + W.userProject + ' (still open in AE?): ' + e.message);
    process.exit(2);
  }

  const s1 = await probe('probe-1-setup.jsx', PARAMS);
  data.setup = s1;
  if (s1.stopped) return stop(s1.stopped);
  if (!(await frames(OUT.before))) return stop('baseline frame missing');

  // Spec §6.1: template footage is copied next to the user project and relinked there.
  // Node copies the binaries; ExtendScript only relinks. Probe 1 opened a new project, so AE no
  // longer holds an older copy from a previous run (AE keeps imported files open: ae-quirks #188).
  const relink = [];
  const copied = [];
  for (const f of s1.footage || []) {
    const src = f.path.replace(/\\/g, '/');
    const dst = path.posix.join(W.bkDir, path.posix.basename(src));
    copyFileSync(src, dst);
    copied.push({ src, dst, same: statSync(src).size === statSync(dst).size });
    relink.push({ id: f.id, target: dst });
  }
  add('template footage copied into Cloud.ru BrandKit/CRT_LowerThird@1 (Node)',
    copied.length > 0 && copied.every((c) => c.same), copied);

  const ids = { userCompId: s1.userCompId, ltCompId: s1.ltCompId, hatchCompId: s1.hatchCompId, ltLayerId: s1.ltLayerId };
  const s2 = await probe('probe-2-fields.jsx', { ...PARAMS, ids, relink });
  data.fields = s2;
  if (s2.stopped) return stop(s2.stopped);
  if (!(await frames(OUT.rdtIntro, OUT.rdtOutro, OUT.after))) return stop('frames of probe 2 missing or not full size');
  analyseRdt();
  analyseFields(s1.colorDefault);

  const s3 = await probe('probe-3-trim-out.jsx', { ...PARAMS, ids });
  data.trimOut = s3;
  if (s3.stopped) return stop(s3.stopped);
  if (!(await frames(OUT.trimIntro, OUT.trimOutro))) return stop('frames of probe 3 missing or not full size');
  analyseTrimOut(s3.trimOut);

  const s4 = await probe('probe-4-hatch-trim.jsx', { ...PARAMS, ids });
  data.trim = s4;
  if (s4.stopped) return stop(s4.stopped);
  if (!(await frames(OUT.hatchHold, OUT.hatchOut))) return stop('frames of probe 4 missing or not full size');
  analyseHatch();

  // Time remap (spec §3.1 S3: "Responsive Time ... or time remap") on a fresh instance in USER_Comp_Remap.
  const s6 = await probe('probe-6-remap.jsx', { ...PARAMS, ids });
  data.remap = s6;
  if (s6.stopped) return stop(s6.stopped);
  if (!(await frames(OUT.remapIntro, OUT.remapOutro))) return stop('frames of probe 6 missing or not full size');
  analyseRemap();

  save('main run: probes 1-4 and 6');
  return undefined;
}

// The --linear run adds its checks (prefixed "linear: ") to the existing S3.json.
async function linear() {
  if (!existsSync(RESULT_FILE)) {
    console.error('no ' + RESULT_FILE + ': run the main S3 stage first');
    process.exit(2);
  }
  if (!existsSync(W.linearProject)) {
    console.error('missing ' + W.linearProject + ': do the manual step of Task 14 first');
    process.exit(2);
  }
  ensureDir(W.frames);
  rmSync(OUT.linear, { force: true });
  const s5 = await probe('probe-5-linear.jsx', PARAMS);
  const measured = {};
  if (!s5.stopped && (await frames(OUT.linear))) {
    const prevData = existsSync(DATA_FILE) ? JSON.parse(readFileSync(DATA_FILE, 'utf8')) : {};
    const patch = meanColor(img(OUT.linear), REGIONS.patch);
    const d = dE(patch, COLORS.qa);
    const vsDefault = prevData.patchDefault ? deltaE2000Rgb(patch, prevData.patchDefault) : null;
    measured.patch = { mean: rgbToHex(patch), dE: round(d, 3), dEvsDefaultProject: round(vsDefault, 3), color: s5.color };
    add('linear: colour patch dE2000 <= 2 vs #26D07C (linearized sRGB project)', d <= DE_MAX, measured.patch, false);
    const slot = meanColor(img(OUT.linear), REGIONS.slot);
    const ds = dE(slot, COLORS.slotA);
    measured.slot = { mean: rgbToHex(slot), dE: round(ds, 3) };
    add('linear: template photo slot_a dE2000 <= 2', ds <= DE_MAX, measured.slot, false);
  }
  const prev = JSON.parse(readFileSync(RESULT_FILE, 'utf8'));
  const mine = checks.map((c) => (c.name.startsWith('linear: ') ? c : { ...c, name: 'linear: ' + c.name }));
  const merged = makeResult({
    ...prev,
    hostVersion: prev.hostVersion || hostVersion,
    checks: prev.checks.filter((c) => !c.name.startsWith('linear: ')).concat(mine),
    verdict: undefined,
    date: undefined,
    notes: String(prev.notes || '').split('; linear run')[0] + '; linear run' + (s5.stopped ? ' stopped: ' + s5.stopped : ''),
  });
  writeResult(merged);
  const allData = existsSync(DATA_FILE) ? JSON.parse(readFileSync(DATA_FILE, 'utf8')) : {};
  allData.linear = { probe: s5, measured };
  Object.assign(allData, recommendMechanism(merged.checks)); // the linear checks never change it
  writeFileSync(DATA_FILE, JSON.stringify(allData, null, 2) + '\n', 'utf8');
  console.log(`${ID}: ${merged.verdict} (${merged.checks.filter((c) => c.pass).length}/${merged.checks.length}) after the linear run`);
  if (s5.stopped) process.exitCode = 1;
}

// Each probe composed with this run's PARAMS and linted exactly as host-run.mjs does before sending.
function checkOnly() {
  const ids = { userCompId: 1, ltCompId: 2, hatchCompId: 3, ltLayerId: 4 };
  for (const f of ['probe-1-setup.jsx', 'probe-2-fields.jsx', 'probe-3-trim-out.jsx', 'probe-4-hatch-trim.jsx',
    'probe-5-linear.jsx', 'probe-6-remap.jsx']) {
    lintOrThrow(composeProbe([LIB, 'spikes/s3-instance/' + f], { ...PARAMS, ids, relink: [] }));
    console.log('OK ' + f);
  }
}

const isLinear = process.argv.includes('--linear');
if (process.argv.includes('--check')) {
  checkOnly();
} else {
  (isLinear ? linear() : main()).catch((e) => {
    console.error('ERROR: ' + e.message);
    if (!isLinear && checks.length) save('aborted: ' + e.message);
    process.exit(1);
  });
}
