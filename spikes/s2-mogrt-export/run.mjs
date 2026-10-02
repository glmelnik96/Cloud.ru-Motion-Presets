#!/usr/bin/env node
// S2: MOGRT export strictly one at a time.   node spikes/s2-mogrt-export/run.mjs
// Needs S1 (CRT_fixture_egp.aep and spikes/results/S1.data.json). Three host calls:
// lower third, hatch, lower third again with overwrite. Between calls Node waits until the .mogrt
// size has not changed for 2 s (max 120 s), then opens it with adm-zip.
// Writes spikes/results/S2.json, the data spikes/results/S2.data.json and the definition dumps
// spikes/results/evidence/S2-<comp>[-again]-definition.json.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { run } from '../../tools/host-run.mjs';
import { composeProbe, REPO } from '../../tools/spike/runner.mjs';
import { makeResult, writeResult } from '../../tools/spike/result.mjs';
import { waitStableFile, statOrNull, findNewFiles } from '../../tools/spike/wait-file.mjs';
import { readMogrt, matchControls } from '../../tools/spike/mogrt.mjs';
import { ensureDir, workPath } from '../../tools/lib/work.mjs';
import { fixturePaths, COMP_LT, COMP_HATCH } from '../fixtures/contract.mjs';

const p = fixturePaths();
const S1DATA = path.join(REPO, 'spikes/results/S1.data.json');
if (!existsSync(p.egpAep) || !existsSync(S1DATA)) {
  console.error('run S1 first (node spikes/s1-egp/run.mjs): need ' + p.egpAep + ' and ' + S1DATA);
  process.exit(2);
}
const s1 = JSON.parse(readFileSync(S1DATA, 'utf8'));
const s2Aep = workPath('fixtures', 'CRT_fixture_s2.aep');
ensureDir(p.mogrtDir);
if (existsSync(s2Aep)) renameSync(s2Aep, s2Aep.replace(/\.aep$/, '.prev.aep'));
for (const c of [COMP_LT, COMP_HATCH]) rmSync(path.posix.join(p.mogrtDir, c + '.mogrt'), { force: true });   // our own outputs

const checks = [];
const evidence = { phases: [] };
let hostVersion = null;

async function phase({ comp, openProject, again }) {
  const file = path.posix.join(p.mogrtDir, comp + '.mogrt');
  const before = statOrNull(file);
  const prev = again && before ? readMogrt(file) : null;
  const t0 = Date.now();
  const params = { workDir: p.workDir, egpAep: p.egpAep, s2Aep, comp, templateName: comp,
    folder: p.mogrtDir, overwrite: true, openProject };
  const r = await run('ae', composeProbe(['spikes/lib/ae-project.jsx', 'spikes/s2-mogrt-export/probe.jsx'], params),
    { timeoutMs: 180000 });
  if (!r || !Array.isArray(r.checks)) throw new Error('S2 probe must return finish({...}); got ' + JSON.stringify(r).slice(0, 300));
  hostVersion = (r.data && r.data.hostVersion) || hostVersion;
  for (const c of r.checks) checks.push(again ? { ...c, name: c.name + ' (re-export)', required: false } : c);

  const tag = comp + (again ? ', re-export' : '');
  const w = await waitStableFile(file, { stableMs: 2000, timeoutMs: 120000, sinceMs: again && before ? before.mtimeMs : 0 });
  const extra = findNewFiles(p.mogrtDir, { exts: ['.mogrt'], sinceMs: t0 - 1000 }).filter((f) => f !== file);
  checks.push({ name: 'mogrt written and stable (' + tag + ')', pass: w.ok, required: !again,
    detail: { ...w, otherNewMogrts: extra, returned: r.data && r.data.returned } });
  const ph = { comp, again: Boolean(again), probe: r.data, wait: w, otherNewMogrts: extra };
  if (w.ok) {
    const m = readMogrt(file);
    ph.mogrt = { entries: m.entries, capsuleID: m.capsuleID, capsuleName: m.capsuleName, controls: m.controls };
    const defOut = 'spikes/results/evidence/S2-' + comp + (again ? '-again' : '') + '-definition.json';
    writeFileSync(path.join(REPO, defOut), JSON.stringify(m.definition, null, 2) + '\n', 'utf8');
    ph.definitionFile = defOut;
    if (!again) {
      checks.push({ name: 'zip has definition.json and project.aegraphic (' + tag + ')',
        pass: m.hasDefinition && m.hasAegraphic, required: true, detail: m.entries });
      // Every S1 controller must be in the MOGRT; extra controls are recorded (count vs S1), not failed.
      const names = (s1.controllers && s1.controllers[comp] && s1.controllers[comp].names) || [];
      const mc = matchControls(m.controls, names);
      checks.push({ name: 'definition.json has every S1 controller (' + tag + ')',
        pass: names.length > 0 && mc.missing.length === 0, required: true,
        detail: { ...mc, s1Count: names.length, s1: names, kinds: m.controls.map((c) => c.kind + ':' + (c.names[0] || '')) } });
    } else {
      ph.capsuleBefore = prev ? prev.capsuleID : null;
      ph.capsuleSame = Boolean(prev && prev.capsuleID === m.capsuleID);
    }
  }
  evidence.phases.push(ph);
}

mkdirSync(path.join(REPO, 'spikes/results/evidence'), { recursive: true });   // definition dumps
try {
  await phase({ comp: COMP_LT, openProject: true });
  await phase({ comp: COMP_HATCH, openProject: false });
  await phase({ comp: COMP_LT, openProject: false, again: true });
} catch (e) {
  console.error('ERROR: ' + e.message);
  console.error('Before any new call: node tools/host-run.mjs --host ae "JSON.stringify({ v: app.version })"');
  checks.push({ name: 'all three export calls completed', pass: false, required: true, detail: e.message });
}

const DATA = 'spikes/results/S2.data.json';
writeFileSync(path.join(REPO, DATA), JSON.stringify(evidence, null, 2) + '\n', 'utf8');
const re = evidence.phases.find((x) => x.again) || {};
const returnedValues = evidence.phases.map((x) => (x.probe ? String(x.probe.returned) : 'n/a')).join('/');
let capsule = 'неизвестен';
if (re.capsuleBefore) capsule = re.capsuleSame ? 'тот же' : 'новый';
const counts = evidence.phases.filter((x) => !x.again && x.mogrt)
  .map((x) => x.comp + ': ' + x.mogrt.controls.filter((c) => c.kind !== 'group').length).join(', ');
const result = makeResult({
  id: 'S2',
  title: 'Экспорт MOGRT по одному',
  host: 'ae',
  hostVersion,
  checks,
  fallback: 'Экспорт MOGRT вручную по чек-листу; AE-сторона плагина от этого не зависит',
  notes: 'exportAsMotionGraphicsTemplate вернул: ' + returnedValues + ' (LT/Hatch/повтор). '
    + 'Свойств в definition.json: ' + (counts || 'n/a') + '. '
    + 'Повторный экспорт с overwrite=true: capsuleID ' + capsule + ' (вход для S6). '
    + 'Экспорт с overwrite=false не проверялся: возможен модальный вопрос.',
  evidence: [DATA],
});
const file = writeResult(result);
for (const c of checks) {
  console.log((c.pass ? 'ok  ' : (c.required ? 'FAIL' : 'warn')) + ' ' + c.name
    + (c.pass ? '' : '  -> ' + JSON.stringify(c.detail).slice(0, 300)));
}
console.log('S2: ' + result.verdict + ' -> ' + file);
