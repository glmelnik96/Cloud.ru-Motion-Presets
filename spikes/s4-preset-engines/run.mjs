#!/usr/bin/env node
// S4: applyPreset with and without a selection, expressions in both engines.   node spikes/s4-preset-engines/run.mjs
// The two presets ship with AE; Node copies them into the ASCII work folder (the probe only sees work paths).
// Override the AE presets folder with BRANDKIT_AE_PRESETS if AE lives elsewhere.
import { copyFileSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runSpike, REPO } from '../../tools/spike/runner.mjs';
import { ensureDir, workPath } from '../../tools/lib/work.mjs';
import { fixturePaths, COMP_LT, COMP_HATCH } from '../fixtures/contract.mjs';

const AE_PRESETS = process.env.BRANDKIT_AE_PRESETS || (process.platform === 'win32'
  ? 'C:/Program Files/Adobe/Adobe After Effects 2026/Support Files/Presets'
  : '/Applications/Adobe After Effects 2026/Presets');
const SOURCES = {
  generic: path.join(AE_PRESETS, 'Transitions - Wipes', 'Linear Wipe.ffx'),
  text: path.join(AE_PRESETS, 'Text', 'Animate In', 'Fade Up Characters.ffx'),
};

const p = fixturePaths();
if (!existsSync(p.fixtureAep)) {
  console.error('no fixture ' + p.fixtureAep + ': run node spikes/fixtures/build-ae-fixture.mjs');
  process.exit(2);
}
const presets = {};
ensureDir(workPath('s4', 'presets'));
for (const [key, src] of Object.entries(SOURCES)) {
  if (!existsSync(src)) {
    console.error('preset not found: ' + src + ' (set BRANDKIT_AE_PRESETS)');
    process.exit(2);
  }
  presets[key] = workPath('s4', 'presets', key === 'generic' ? 'linear_wipe.ffx' : 'fade_up_characters.ffx');
  copyFileSync(src, presets[key]);
}
const s4Aep = workPath('s4', 'CRT_fixture_s4.aep');
if (existsSync(s4Aep)) renameSync(s4Aep, s4Aep.replace(/\.aep$/, '.prev.aep'));

const DATA = 'spikes/results/S4.data.json';
let out;
try {
  out = await runSpike({
    id: 'S4',
    title: 'applyPreset и оба движка выражений',
    host: 'ae',
    files: ['spikes/lib/ae-project.jsx', 'spikes/s4-preset-engines/probe.jsx'],
    params: {
      workDir: p.workDir, fixtureAep: p.fixtureAep, s4Aep,
      comps: { lt: COMP_LT, hatch: COMP_HATCH },
      presets,
      times: { selected: 2, text: 3, none: 4 },
      evalTimes: [0, 0.6, 5, 9.6, 30],
      expectedExpressions: 8,
    },
    timeoutMs: 300000,
    fallback: 'Панель требует выделения перед применением пресета',
    notes: 'Пресеты из поставки AE: Transitions - Wipes/Linear Wipe.ffx (общий), Text/Animate In/Fade Up Characters.ffx '
      + '(текстовый); копии в рабочей папке. Обязательные проверки: пресет на выделенный слой, первый ключ на comp.time, '
      + 'выражения фикстуры в обоих движках. Без выделения, текстовый пресет и арифметика без .value — наблюдения.',
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
console.log('S4: ' + out.result.verdict + ' -> ' + out.file);
