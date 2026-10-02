#!/usr/bin/env node
// S1: Essential Graphics by script, on a fresh copy of the AE fixture.   node spikes/s1-egp/run.mjs
// Result: spikes/results/S1.json; probe data: spikes/results/S1.data.json (S2 reads it);
// project with Essential Graphics: <work>/fixtures/CRT_fixture_egp.aep.
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runSpike, REPO } from '../../tools/spike/runner.mjs';
import { fixturePaths, COMP_LT, COMP_HATCH, EGP, MARKERS } from '../fixtures/contract.mjs';

const p = fixturePaths();
if (!existsSync(p.fixtureAep)) {
  console.error('no fixture ' + p.fixtureAep + ': run node spikes/fixtures/build-ae-fixture.mjs');
  process.exit(2);
}
if (existsSync(p.egpAep)) renameSync(p.egpAep, p.egpAep.replace(/\.aep$/, '.prev.aep'));

const DATA = 'spikes/results/S1.data.json';
let out;
try {
  out = await runSpike({
    id: 'S1',
    title: 'Essential Graphics по скрипту',
    host: 'ae',
    files: ['spikes/lib/ae-project.jsx', 'spikes/s1-egp/probe.jsx'],
    params: {
      workDir: p.workDir, fixtureAep: p.fixtureAep, egpAep: p.egpAep,
      comps: { lt: COMP_LT, hatch: COMP_HATCH },
      egp: { lt: EGP[COMP_LT], hatch: EGP[COMP_HATCH] },
      markers: MARKERS,
    },
    timeoutMs: 300000,
    fallback: 'Essential Graphics каждого мастера собирается вручную один раз (~25 композиций); скрипт делает имена, маркеры и экспорт',
    notes: 'Цвет и выпадающий список — необязательные проверки: цвет в шаблонах задаётся списком палитры (§4.2), '
      + 'список при отказе добавляется вручную (§4.4). «Без openInEssentialGraphics» — проверка отчёта #504; '
      + 'конвейер всегда сначала открывает композицию в EGP.',
    evidence: [DATA],
  });
} catch (e) {
  console.error('ERROR: ' + e.message);
  console.error('Before any new call: node tools/host-run.mjs --host ae "JSON.stringify({ v: app.version })"');
  process.exit(1);
}
mkdirSync(path.join(REPO, 'spikes/results'), { recursive: true });
writeFileSync(path.join(REPO, DATA), JSON.stringify(out.data, null, 2) + '\n', 'utf8');
for (const c of out.result.checks) {
  console.log((c.pass ? 'ok  ' : (c.required ? 'FAIL' : 'warn')) + ' ' + c.name
    + (c.pass ? '' : '  -> ' + JSON.stringify(c.detail).slice(0, 300)));
}
console.log('S1: ' + out.result.verdict + ' -> ' + out.file);
