#!/usr/bin/env node
// Live E2E of the panel (plan 2026-10-05, task 10): the panel inserts every pack-1 item in every format through its
// dev test hook (window.__crbkTest, CDP 8101 AE / 8102 Premiere), and an observer independent of the panel's adapter
// (tools/panel/jsx/e2e-*.jsx through the dev extension, CDP 8094 / 8096) reads back what landed: place, length,
// selection and every field. It works only in the E2E fixtures (tools/panel/fixtures.mjs) and refuses to run when a
// project that is not ours is open.
//   node tools/panel/e2e.mjs --host ae|pr [--item ID] [--only KEY] [--no-reload]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cdpEval, hardReload } from '../lib/cdp.mjs';
import { workDir, workPath } from '../lib/work.mjs';
import { run } from '../host-run.mjs';
import { composeProbe } from '../spike/runner.mjs';
import { printChecks } from '../masters/build-master.mjs';
import { openPanel, PORTS } from '../dev/open-panel.mjs';
import { AE_FIXTURE, PR_FIXTURE, ensureFixture } from './fixtures.mjs';

const TIME = 2; // seconds: the insert point in every target
const LIBRARY = 'C:/CRBK/work/library/library.json';

// What the panel is asked to write, per item (library field keys, library bases: dropdowns 1-based).
export const VALUES = {
  LOGO_Shot: { caption: 2, theme: 2, background: 3, speed: 2 },
  LOGO_Mark: { plate: false, theme: 1, background: 2, speed: 3 },
  TTL_LowerThird: { name: 'Анна-Мария Ёлкина', role1: 'Руководитель облачной платформы', role2: 'Cloud.ru', style: 2, side: 1, speed: 2, size: 2 },
};

// The cases: every variant of every item at its own format, a longer clip, and the refusals the panel must make.
export function cases(library) {
  const out = [];
  for (const item of library.items) {
    for (const v of item.variants) out.push({ key: `${item.id}@${v.key}`, item: item.id, target: v.key, expect: 'insert' });
  }
  out.push({ key: 'TTL_LowerThird@16x9+8s', item: 'TTL_LowerThird', target: '16x9', lenSec: 8, expect: 'insert' });
  out.push({ key: 'LOGO_Mark@QHD', item: 'LOGO_Mark', target: 'QHD', expect: 'NO_VARIANT' });
  return out;
}

// The value the host must read back for a field, from the library value (AE as is; Premiere dropdowns 0-based).
export function expected(host, field, value) {
  if (field.type === 'dropdown') return host === 'pr' ? value - 1 : value;
  if (field.type === 'checkbox') return value ? 1 : 0;
  return String(value);
}

export function same(field, want, got) {
  if (field.type === 'checkbox') return (got === true || got === 1 || got === '1' || got === 'true' ? 1 : 0) === want;
  if (field.type === 'text') return String(got) === want;
  return Number(got) === want;
}

async function observe(host, params) {
  const files = host === 'ae'
    ? ['spikes/lib/ae-project.jsx', 'tools/panel/jsx/e2e-ae.jsx']
    : ['spikes/lib/pr-helpers.jsx', 'tools/panel/jsx/e2e-pr.jsx'];
  const r = await run(host, composeProbe(files, { workDir: workDir(), ...params }), { timeoutMs: 120000 });
  const failed = printChecks(r.checks, () => {});
  return { ok: !failed, checks: r.checks, data: r.data };
}

async function panelCall(page, expr, timeoutMs = 180000) {
  const raw = await cdpEval(page.webSocketDebuggerUrl, `Promise.resolve(${expr}).then((r) => JSON.stringify(r))`, { timeoutMs });
  return JSON.parse(raw);
}

async function guard(host) {
  if (host === 'ae') {
    const r = await run('ae', 'JSON.stringify({ file: app.project.file ? String(app.project.file.fsName) : null, dirty: app.project.dirty, items: app.project.numItems })');
    const ours = r.file && r.file.replace(/\\/g, '/').toLowerCase() === AE_FIXTURE().toLowerCase();
    if (!ours && (r.dirty || r.items > 0)) throw new Error(`AE has a project that is not the E2E fixture open (${r.file || 'untitled'}): stopped`);
    return;
  }
  const r = await run('pr', 'var a = []; for (var i = 0; i < app.projects.numProjects; i++) { a.push(String(app.projects[i].path)); } JSON.stringify(a)');
  const foreign = r.filter((p) => !/^c:[\\/]crbk[\\/]work[\\/]/i.test(p));
  if (foreign.length) throw new Error(`Premiere has projects that are not ours open (${foreign.join(', ')}): stopped`);
}

export async function runE2E({ host, item: onlyItem, only, reload = true }) {
  const library = JSON.parse(readFileSync(LIBRARY, 'utf8'));
  await guard(host);
  await ensureFixture(host);
  let { page } = await openPanel(host);
  if (reload) page = await hardReload(PORTS[host].panel, { ready: 'window.__crbkTest !== undefined' });
  const boot = await panelCall(page, 'window.__crbkTest.ready()');
  if (!boot || boot.ok === false) throw new Error('panel not ready: ' + JSON.stringify(boot));

  const report = { host, at: new Date().toISOString(), library: library.libraryVersion, cases: [] };
  for (const c of cases(library)) {
    if (onlyItem && c.item !== onlyItem) continue;
    if (only && c.key !== only) continue;
    const item = library.items.find((i) => i.id === c.item);
    const target = host === 'ae' ? { comp: 'T_' + c.target, time: TIME } : { seq: 'S_' + c.target, sec: TIME };
    const fixture = host === 'ae' ? AE_FIXTURE() : PR_FIXTURE();
    const row = { key: c.key, expect: c.expect };
    report.cases.push(row);
    const prep = await observe(host, { fixture, stage: 'prepare', ...target });
    if (!prep.ok) { row.pass = false; row.why = 'prepare: ' + JSON.stringify(prep.checks.filter((x) => !x.pass)); continue; }

    const values = VALUES[c.item];
    const opts = c.lenSec ? { lenSec: c.lenSec } : {};
    const t0 = Date.now();
    const outcome = await panelCall(page, `window.__crbkTest.insert(${JSON.stringify(c.item)}, ${JSON.stringify(values)}, ${JSON.stringify(opts)})`);
    row.ms = Date.now() - t0;
    row.issues = (outcome.issues || []).map((i) => i.code + ':' + i.level);

    if (c.expect !== 'insert') {
      row.pass = !outcome.ok && (outcome.issues || []).some((i) => i.code === c.expect);
      if (!row.pass) row.why = 'expected the refusal ' + c.expect + ', got ' + JSON.stringify(outcome).slice(0, 300);
      continue;
    }
    if (!outcome.ok) { row.pass = false; row.why = 'refused: ' + JSON.stringify(outcome.issues); continue; }

    const variant = item.variants.find((v) => v.key === c.target);
    const fields = (item.fields || []).filter((f) => f.egpName).sort((a, b) => a.egpIndex - b.egpIndex);
    const read = host === 'ae'
      ? await observe(host, { fixture, stage: 'read', ...target, aeComp: variant.aeComp, egpNames: fields.map((f) => f.egpName) })
      : await observe(host, { fixture, stage: 'read', ...target, expectName: path.posix.basename(variant.file, '.mogrt'), names: fields.map((f) => f.egpName) });
    if (!read.ok) { row.pass = false; row.why = 'read: ' + JSON.stringify(read.checks.filter((x) => !x.pass)); continue; }

    const problems = [];
    const got = new Map(read.data.values);
    for (const f of fields) {
      const want = expected(host, f, values[f.key]);
      if (!same(f, want, got.get(f.egpName))) problems.push(`${f.egpName}: want ${JSON.stringify(want)}, got ${JSON.stringify(got.get(f.egpName))}`);
    }
    const D = item.duration.introSec + item.duration.holdSec + item.duration.outroSec;
    const L = c.lenSec || D;
    if (host === 'pr') {
      if (read.data.lenF !== Math.round(L * 25)) problems.push(`length ${read.data.lenF} frames, want ${Math.round(L * 25)}`);
      if (!read.data.selected) problems.push('the clip is not selected');
    } else {
      if (Math.abs(read.data.out - read.data.in - L) > 0.02) problems.push(`length ${(read.data.out - read.data.in).toFixed(3)} s, want ${L}`);
      if (L !== D && !read.data.remap.on) problems.push('no time remap for a length other than the template');
      if (L === D && read.data.remap.on) problems.push('time remap on a default-length insert');
      if (!read.data.selected || read.data.selectedCount !== 1) problems.push(`selection: layer ${read.data.selected}, ${read.data.selectedCount} selected`);
    }
    row.read = read.data;
    row.pass = problems.length === 0;
    if (problems.length) row.why = problems.join('; ');
  }
  return report;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
  const host = arg('--host') || 'ae';
  if (host !== 'ae' && host !== 'pr') throw new Error('--host ae|pr');
  const report = await runE2E({ host, item: arg('--item'), only: arg('--only'), reload: !process.argv.includes('--no-reload') });
  mkdirSync(workPath('panel'), { recursive: true });
  const file = path.posix.join(workPath('panel'), `e2e-${host}.json`);
  writeFileSync(file, JSON.stringify(report, null, 1) + '\n', 'utf8');
  let failed = 0;
  for (const r of report.cases) {
    if (!r.pass) failed += 1;
    console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.key}${r.ms ? ` ${r.ms} ms` : ''}${r.issues && r.issues.length ? ' [' + r.issues.join(', ') + ']' : ''}${r.why ? ' — ' + r.why : ''}`);
  }
  console.log(`${report.cases.length - failed}/${report.cases.length} passed; report ${file}`);
  if (failed) process.exitCode = 1;
}
