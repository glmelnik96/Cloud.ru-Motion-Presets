#!/usr/bin/env node
// S10: (a) an Output Module template made by script; (b) the AME queue with the brand FullHD.epr via BridgeTalk.
//   node spikes/s10-ame/run.mjs              both parts
//   node spikes/s10-ame/run.mjs --only om    re-run one part; the other part's checks stay in S10.json
//   node spikes/s10-ame/run.mjs --only ame
//   node spikes/s10-ame/run.mjs --persist    after an AE restart: is the template still listed
// Preconditions for (b): Media Encoder 2026 installed, its queue empty (runBatch encodes everything queued).
// FullHD.epr comes from the source package: sourceRoot() of tools/packs/paths.mjs, BRANDKIT_SOURCE overrides it.
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { run } from '../../tools/host-run.mjs';
import { composeProbe, REPO } from '../../tools/spike/runner.mjs';
import { makeResult, writeResult, readResults } from '../../tools/spike/result.mjs';
import { sleep, findNewFiles, waitStableFile } from '../../tools/spike/wait-file.mjs';
import { ensureDir, workPath } from '../../tools/lib/work.mjs';
import { hasBinary, probeMedia } from '../../tools/lib/media-probe.mjs';
import { sourceRoot } from '../../tools/packs/paths.mjs';
import { fixturePaths, COMP_LT, COMP_HATCH } from '../fixtures/contract.mjs';
import {
  parseAmeReply, guidListed, matchesEpr, isProRes4444Alpha, compByDuration, mergeChecks, recordPersist,
} from './lib.mjs';

const SRC_EPR = path.posix.join(sourceRoot(), '7_Пресеты_Media_Encoder', 'FullHD.epr');
const DATA = 'spikes/results/S10.data.json';
const FILES = ['spikes/lib/ae-project.jsx', 'spikes/s10-ame/probe.jsx'];

const argv = process.argv.slice(2);
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
if (only !== null && only !== 'om' && only !== 'ame') {
  console.error('usage: node spikes/s10-ame/run.mjs [--only om|ame] [--persist]');
  process.exit(2);
}
const p = fixturePaths();
const base = {
  workDir: p.workDir, fixtureAep: p.fixtureAep, comp: COMP_LT, comps: { lt: COMP_LT, hatch: COMP_HATCH },
  template: 'CRBK_ProRes4444_Alpha', alphaPattern: 'alpha|альф', codec: 'Apple ProRes 4444',
  omTestMov: workPath('s10', 'om_test.mov'), testFrames: 10,
  ameName: 'ame', epr: workPath('ame', 'FullHD.epr'), outComp: workPath('ame', 'out_comp'),
  outDl: workPath('ame', 'out_dl'), replyFile: workPath('ame', 'reply.txt'), format: 'H.264', sendTimeoutSec: 60,
};

async function host(action, extra, timeoutMs) {
  const r = await run('ae', composeProbe(FILES, { ...base, ...extra, action }), { timeoutMs });
  if (!r || !Array.isArray(r.checks)) {
    throw new Error('S10 ' + action + ': the probe must return finish({...}); got ' + JSON.stringify(r).slice(0, 300));
  }
  return r;
}

async function partOm(evidence, checks) {
  ensureDir(workPath('s10'));
  rmSync(base.omTestMov, { force: true });                       // our own test render from a previous run
  const r = await host('om', {}, 300000);
  checks.push(...r.checks);
  evidence.om = r.data.om;
  let render = null;
  const w = await waitStableFile(base.omTestMov, { stableMs: 2000, timeoutMs: 30000 });
  if (w.ok && hasBinary('ffprobe')) render = probeMedia(base.omTestMov);
  evidence.omRender = render;
  checks.push({ name: 'om: test render is ProRes 4444 with alpha (ffprobe)', pass: isProRes4444Alpha(render),
    required: false, detail: render || 'no ' + base.omTestMov });
  return r.data.hostVersion;
}

async function partAme(evidence, checks) {
  if (!existsSync(SRC_EPR)) throw new Error('brand preset not found: ' + SRC_EPR + ' (set BRANDKIT_SOURCE to the package folder)');
  ensureDir(workPath('ame'));
  copyFileSync(SRC_EPR, base.epr);                               // Node copies binaries; the package stays read-only
  for (const d of [base.outComp, base.outDl]) {
    rmSync(d, { recursive: true, force: true });                 // our own outputs from a previous run
    ensureDir(d);
  }

  // 1) Media Encoder known and running: launch once, then a cheap status read every 5 s, at most 180 s.
  let st = await host('ame-status', { launch: true }, 60000);
  const wasRunning = st.data.running === true;
  const t0 = Date.now();
  while (!(st.data.running === true && /IDLE|PUMPING|UNDEFINED/.test(st.data.status)) && Date.now() - t0 < 180000) {
    if (st.data.status === 'BUSY') console.log('Media Encoder is BUSY: close any dialog in AME');
    await sleep(5000);
    st = await host('ame-status', { launch: false }, 60000);
  }
  if (!wasRunning && st.data.running === true) await sleep(10000); // let a fresh AME finish starting up
  checks.push(...st.checks);
  const ready = st.data.running === true && /IDLE|PUMPING|UNDEFINED/.test(st.data.status);
  checks.push({ name: 'ame: Media Encoder running and idle', pass: ready, required: true, detail: st.data });
  evidence.ameStatus = st.data;
  if (!ready) return st.data.hostVersion;

  // 2) Two jobs and runBatch, sent through BridgeTalk without waiting in AE (a waiting AE cannot serve
  //    Dynamic Link to Media Encoder, and both hang). Media Encoder writes its reply to base.replyFile.
  const since = Date.now() - 2000;
  rmSync(base.replyFile, { force: true });
  const q = await host('ame-queue', {}, 120000);
  checks.push(...q.checks);
  const got = await waitStableFile(base.replyFile, { stableMs: 1000, timeoutMs: base.sendTimeoutSec * 5 * 1000 });
  const replyText = got.ok ? readFileSync(base.replyFile, 'utf8') : null;
  checks.push({ name: 'ame: reply file from Media Encoder', pass: replyText !== null, required: false,
    detail: { file: base.replyFile, wait: got, reply: replyText } });
  const reply = parseAmeReply(replyText);
  evidence.ameQueue = { ...q.data, reply: replyText, parsed: reply };

  // 3) Outputs: AME encodes the jobs one after another. outputPath may be taken as a folder or a file
  //    name, so look for new .mp4 anywhere under <work>/ame and sort them by path.
  const ameDir = workPath('ame');
  const expectDl = reply.addDL === 'ok';
  const deadline = Date.now() + 600000;
  let files = [];
  while (Date.now() < deadline) {
    files = findNewFiles(ameDir, { exts: ['.mp4'], sinceMs: since });
    const hasComp = files.some((f) => f.includes('/out_comp'));
    const hasDl = files.some((f) => f.includes('/out_dl'));
    if (hasComp && (hasDl || !expectDl)) break;
    await sleep(2000);
  }
  const outputs = [];
  for (const f of files) {
    const w = await waitStableFile(f, { stableMs: 5000, timeoutMs: Math.max(15000, deadline - Date.now()), sinceMs: since });
    let probe = null;
    if (w.ok && hasBinary('ffprobe')) {
      try {
        probe = probeMedia(f);
      } catch (e) {
        probe = { error: e.message };
      }
    }
    let job = 'unknown';
    if (f.includes('/out_comp')) job = 'comp';
    if (f.includes('/out_dl')) job = 'dl';
    outputs.push({ file: f, job, wait: w, probe, comp: compByDuration(probe && probe.duration) });
  }
  evidence.ameOutputs = outputs;
  const compOut = outputs.find((o) => o.job === 'comp');
  const dlOut = outputs.find((o) => o.job === 'dl');
  checks.push({ name: 'ame: addCompToBatch accepted the job', pass: reply.addComp === 'true' || Boolean(compOut),
    required: true, detail: { addComp: reply.addComp || null, output: compOut ? compOut.file : null } });
  checks.push({ name: 'ame: addCompToBatch output written and stable', pass: Boolean(compOut && compOut.wait.ok),
    required: true, detail: compOut || 'no new .mp4 under ' + ameDir });
  checks.push({ name: 'ame: output matches FullHD.epr (H.264 1920x1080 25 fps)',
    pass: Boolean(compOut && matchesEpr(compOut.probe)), required: true, detail: compOut ? compOut.probe : null });
  checks.push({ name: 'ame: comp GUID listed by getDLItemsAtRoot', pass: guidListed(q.data.guidLt, reply.guids),
    required: false, detail: { guidLt: q.data.guidLt, guids: reply.guids || null } });
  checks.push({ name: 'ame: addDLToBatch renders the chosen comp (' + COMP_LT + ', 10 s)',
    pass: Boolean(dlOut && dlOut.wait.ok && dlOut.comp === COMP_LT), required: false,
    detail: dlOut || { addDL: reply.addDL || null } });
  return q.data.hostVersion;
}

if (argv.includes('--persist')) {
  try {
    const r = await host('om-persist', {}, 120000);
    const c = r.checks[0];
    const res = recordPersist(c);                                // replaces the entry of an earlier --persist
    console.log((c.pass ? 'ok   ' : 'warn ') + c.name + ' -> S10: ' + res.verdict);
  } catch (e) {
    console.error('ERROR: ' + e.message);
    process.exit(1);
  }
  process.exit(0);
}

const previous = readResults().find((r) => r.id === 'S10') || null;
let evidence = {};
try {
  evidence = JSON.parse(readFileSync(path.join(REPO, DATA), 'utf8'));
} catch {
  evidence = {};
}
const checks = [];
let hostVersion = previous ? previous.hostVersion : null;
let part = 'om';
try {
  if (!only || only === 'om') {
    part = 'om';
    hostVersion = (await partOm(evidence, checks)) || hostVersion;
  }
  if (!only || only === 'ame') {
    part = 'ame';
    hostVersion = (await partAme(evidence, checks)) || hostVersion;
  }
} catch (e) {
  console.error('ERROR: ' + e.message);
  console.error('Before any new call: node tools/host-run.mjs --host ae "JSON.stringify({ v: app.version })"');
  checks.push({ name: part + ': run completed', pass: false, required: part === 'ame', detail: e.message });
}

const all = only ? mergeChecks(previous ? previous.checks : [], checks, only + ':') : checks;
const compOut = (evidence.ameOutputs || []).find((o) => o.job === 'comp');
const notes = [
  'OM: путь ' + ((evidence.om && evidence.om.path) || 'n/a') + '; Format через setSettings: '
    + JSON.stringify((evidence.om && evidence.om.formatTry) || null),
  'AME: addCompToBatch взял композицию ' + ((compOut && compOut.comp) || '(не опознана)') + ' — её AME считает первой в проекте',
  'ответ BridgeTalk: ' + ((evidence.ameQueue && evidence.ameQueue.reply) || 'нет'),
].join('; ');
mkdirSync(path.join(REPO, 'spikes/results'), { recursive: true });
writeFileSync(path.join(REPO, DATA), JSON.stringify(evidence, null, 2) + '\n', 'utf8');
const result = makeResult({
  id: 'S10',
  title: 'AME с брендовым .epr и шаблон Output Module',
  host: 'ae',
  hostVersion,
  checks: all,
  fallback: 'Экспорт из AE через Render Queue или aerender с шаблоном Output Module, повторяющим брендовый `.epr`; '
    + 'шаблон создаёт панель или пользователь загружает по инструкции — по итогу S10 (§8.1)',
  notes,
  evidence: [DATA],
});
const file = writeResult(result);
for (const c of all) {
  console.log((c.pass ? 'ok  ' : (c.required ? 'FAIL' : 'warn')) + ' ' + c.name
    + (c.pass ? '' : '  -> ' + JSON.stringify(c.detail).slice(0, 300)));
}
console.log('S10: ' + result.verdict + ' -> ' + file);
