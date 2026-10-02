#!/usr/bin/env node
// Live check of the dumper against the phase-0 fixture (Plan 1, Task 7: CRT_fixture.aep).
//   node tools/dump/dump.mjs --slug fixture --project C:/CRBK/work/fixtures/CRT_fixture.aep
//   node tools/dump/check-fixture-dump.mjs [--dir C:/CRBK/work/dumps/fixture]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workPath } from '../lib/work.mjs';
import { findLayers, layerProp, readJson } from './model.mjs';

const near = (a, b, eps = 1e-3) => typeof a === 'number' && Math.abs(a - b) <= eps;

// Contract of CRT_LowerThird_v1 (fixture contract, Plan 1 Task 7).
const PROBE_KEYS = [[0, 100, 100], [1, 200, 100], [9, 200, 100], [10, 300, 100]];
const CTRL_EFFECTS = [
  ['ShowRole', 'ADBE Checkbox Control'], ['Duration', 'ADBE Slider Control'], ['Accent', 'ADBE Color Control'],
  ['Style', 'ADBE Dropdown Control'], ['QA', 'ADBE Checkbox Control'],
];

export function checkFixtureDump(dump) {
  const checks = [];
  const add = (name, pass, detail = '') => checks.push({ name, pass: Boolean(pass), detail: String(detail) });
  const c = dump.comp || {};
  add('comp 1920x1080, 25 fps, 10 s', c.width === 1920 && c.height === 1080 && near(c.frameRate, 25) && near(c.duration, 10),
    `${c.width}x${c.height}, ${c.frameRate} fps, ${c.duration} s`);

  const probe = findLayers(dump, 'PROBE_SQ')[0];
  const keys = ((probe && layerProp(probe, 'ADBE Transform Group', 'ADBE Position')) || {}).keys || [];
  add('PROBE_SQ Position has 4 keys', keys.length === 4, `${keys.length} keys`);
  add('PROBE_SQ keys at 0/1/9/10 s = (100,100) (200,100) (200,100) (300,100)',
    keys.length === 4 && PROBE_KEYS.every(([t, x, y], i) => near(keys[i].time, t) && Array.isArray(keys[i].value) &&
      near(keys[i].value[0], x) && near(keys[i].value[1], y)),
    keys.map((k) => `${k.time}s:(${Array.isArray(k.value) ? k.value.slice(0, 2).join(',') : '?'})`).join(' '));
  add('PROBE_SQ keys are linear', keys.length === 4 && keys.every((k) => k.inInterp === 'LINEAR' && k.outInterp === 'LINEAR'),
    keys.map((k) => `${k.inInterp}/${k.outInterp}`).join(' '));

  const name = findLayers(dump, 'TXT_NAME')[0];
  const st = name && layerProp(name, 'ADBE Text Properties', 'ADBE Text Document');
  const doc = st ? (st.value || (st.keys && st.keys[0] && st.keys[0].value)) : null;
  add('TXT_NAME font is SBSansDisplay-Semibold', doc && doc.font === 'SBSansDisplay-Semibold', doc ? doc.font : 'no Source Text');
  add('TXT_NAME is "Имя Фамилия", 60 px', doc && doc.text === 'Имя Фамилия' && near(doc.fontSize, 60),
    doc ? `"${doc.text}", ${doc.fontSize} px` : '');

  const marks = c.markers || [];
  const want = [[0, 1, 'in'], [9, 1, 'out']];
  add('comp markers: protected 0-1 s "in", 9-10 s "out"',
    marks.length === 2 && want.every(([t, d, cm], i) => near(marks[i].time, t) && near(marks[i].duration, d) &&
      marks[i].comment === cm && marks[i].protectedRegion === true),
    marks.map((m) => `${m.time}+${m.duration} "${m.comment}" protected=${m.protectedRegion}`).join('; '));

  const ctrl = findLayers(dump, 'CTRL')[0];
  const fx = ctrl ? ctrl.effects : [];
  // AE 26.5 dumps a Dropdown Menu Control as a per-instance pseudo effect "Pseudo/@@<id>" whose first
  // parameter is "Menu" (seen live 2026-10-02); that counts as 'ADBE Dropdown Control'.
  const isDropdown = (e) => /^Pseudo\/@@/.test(e.matchName) && Array.isArray(e.params) && e.params.length > 0 &&
    e.params[0].name === 'Menu' && e.params[0].matchName === e.matchName + '-0001';
  const matches = (e, mn) => e.matchName === mn || (mn === 'ADBE Dropdown Control' && isDropdown(e));
  add('CTRL effects by name and matchName', CTRL_EFFECTS.every(([n, mn]) => fx.some((e) => e.name === n && matches(e, mn))),
    fx.map((e) => `${e.name}=${e.matchName}`).join(', '));

  const role = findLayers(dump, 'TXT_ROLE')[0];
  const op = role && layerProp(role, 'ADBE Transform Group', 'ADBE Opacity');
  const ex = op && op.expression;
  add('TXT_ROLE Opacity expression reads ShowRole and gives 100',
    ex && /ShowRole/.test(ex.text) && ex.error === '' && near(ex.valueAt0, 100),
    ex ? `${ex.text.replace(/\s+/g, ' ').slice(0, 80)} = ${ex.valueAt0}` : 'no expression');
  return checks;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--dir');
  const dir = i === -1 ? workPath('dumps', 'fixture') : argv[i + 1];
  const index = readJson(path.join(dir, 'index.json'));
  const entry = index.comps.find((c) => c.name === 'CRT_LowerThird_v1');
  if (!entry) { console.error('CRT_LowerThird_v1 is not in ' + dir + '/index.json'); process.exit(1); }
  const dump = readJson(path.join(dir, entry.file));
  const checks = checkFixtureDump(dump);
  for (const ch of checks) console.log(`${ch.pass ? 'PASS' : 'FAIL'}  ${ch.name}  | ${ch.detail}`);
  console.log(`renderer: ${dump.comp.renderer}; available: ${(dump.comp.renderers || []).join(', ')}`);
  const failed = checks.filter((ch) => !ch.pass).length;
  console.log(failed ? `${failed} of ${checks.length} checks failed` : `all ${checks.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
