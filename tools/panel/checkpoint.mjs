#!/usr/bin/env node
// The checkpoint of phase 3 (spec 3: «Сквозные сценарии зелёные в обоих приложениях на Win и Mac; чистая
// установка с нуля, на Mac включая файл с карантином; проект со вставками из AE и Premiere открывается на
// другой ОС без пропавших файлов») on one machine, in one command:
//   node tools/panel/checkpoint.mjs [--host ae|pr] [--skip-tests] [--only base,media,export,ui]
//   node tools/panel/checkpoint.mjs --host pr --only transfer --skip-tests     after a restart of Premiere
// Runs npm test and the live suites — base (every item of the library in every format), media (T2/T3,
// companions, effects, colours, the move of a project, fit to a window), export (tools/panel/live.mjs) and ui
// (the real panel, tools/panel/ui-check.mjs) — in each host, then writes docs/research/checkpoint/<win|mac>-<date>.json and .md: every criterion with what proves it.
// Premiere keeps the media of a session open until it quits, so its move of a project is checked after a restart
// (suite transfer, run only when named). A run updates the summary of the same day: criteria it did not check
// stay as they were. A suite that left no fresh report counts as failed. The clean install and the open on the other OS are
// checked by hand; the summary names the latest reports of them, it does not judge them.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LIVE = (flag) => (h) => ['tools/panel/live.mjs', '--host', h, ...(flag ? [flag] : [])];
export const SUITES = [
  { key: 'base', cmd: LIVE(null), report: (h) => `${h}-report.json`, what: 'каждый элемент библиотеки в каждом формате: вставка, поля, кадры' },
  { key: 'media', cmd: LIVE('--media'), report: (h) => `${h}-media-report.json`, what: 'T2/T3 и компаньоны; AE: эффекты и цвета; перенос проекта; Premiere: «вписать в окно»' },
  { key: 'export', cmd: LIVE('--export'), report: (h) => `${h}-export-report.json`, what: '«Экспорт» брендовыми пресетами' },
  { key: 'ui', cmd: (h) => ['tools/panel/ui-check.mjs', '--host', h], report: (h) => `${h}-ui-report.json`, what: 'настоящая панель: каталог, превью, форма, вставка из интерфейса' },
  { key: 'transfer', hosts: ['pr'], explicit: true, cmd: LIVE('--transfer'), report: (h) => `${h}-transfer-report.json`, what: 'перенос проекта после перезапуска Premiere' },
];
export const DEFAULT_ONLY = SUITES.filter((s) => !s.explicit).map((s) => s.key);
const TRANSFER_WHAT = 'копия проекта открывается без пропавших файлов при убранных оригиналах и библиотеке';
const WAIT_RESTART = 'ждёт перезапуска Premiere: node tools/panel/checkpoint.mjs --host pr --only transfer --skip-tests';

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));

// A suite report as the summary needs it; stale (older than the run) or missing is a failure.
export function suiteResult(report, startedAt) {
  if (!report) return { ok: false, reason: 'нет отчёта' };
  const fresh = !startedAt || Date.parse(report.startedAt) >= Date.parse(startedAt);
  // ui-check writes its checks without a summary: count them
  const checks = report.checks ?? [];
  const s = report.summary ?? { checks: checks.length, passed: checks.filter((c) => c.pass).length, failed: checks.filter((c) => c.required !== false && !c.pass).length };
  if (!fresh) return { ok: false, reason: `отчёт старше прогона (${report.startedAt})`, ...s };
  return { ok: s.failed === 0 && s.checks > 0, checks: s.checks, passed: s.passed, failed: report.failed ?? [] };
}

// The transfer checks inside a media report.
export function transferResult(report) {
  const checks = (report?.checks ?? []).filter((c) => /^transfer:/.test(c.name));
  if (!checks.length) return { ok: false, reason: 'проверок переноса нет в отчёте медиа' };
  const failed = checks.filter((c) => c.required !== false && !c.pass).map((c) => c.name);
  return { ok: failed.length === 0, checks: checks.length, failed };
}

// Premiere: the transfer report of the copy the latest media run staged.
export function deferredTransferResult(transferReport, mediaReport) {
  if (!transferReport) return { ok: false, reason: WAIT_RESTART };
  if (mediaReport && transferReport.staged?.mediaStartedAt !== mediaReport.startedAt) return { ok: false, reason: `проверена копия прошлого прогона медиа; ${WAIT_RESTART}` };
  return transferResult(transferReport);
}

// The summary of the same day with the criteria of this run put over it.
export function mergeSummary(prev, sum) {
  if (!prev) return sum;
  // the move of a project is one criterion per host, whichever suite proved it (media before 2026-10-06 in Premiere)
  const key = (c) => (c.criterion.startsWith('Перенос') ? `${c.criterion}|${c.host}` : `${c.criterion}|${c.host}|${c.suite}`);
  const fresh = new Set(sum.criteria.map(key));
  const criteria = [...prev.criteria.filter((c) => !fresh.has(key(c))), ...sum.criteria];
  const tests = sum.tests ?? prev.tests ?? null;
  return { ...sum, startedAt: prev.startedAt, tests, criteria, ok: (tests ? tests.ok : true) && criteria.every((c) => c.ok) };
}

// The reports a person made by hand: the install on this OS and the open of a moved project.
export function manualReports(repo = REPO, os) {
  const pick = (dir, re) => {
    const d = path.join(repo, dir);
    if (!existsSync(d)) return [];
    return readdirSync(d).filter((f) => re.test(f)).sort().map((f) => path.posix.join(dir.replace(/\\/g, '/'), f));
  };
  return {
    install: pick('docs/research/installer', os === 'win' ? /^windows.*\.json$/ : /^mac.*\.json$/),
    open: pick('docs/research/panel-live', /-open-(win|mac)-report\.json$/),
  };
}

export function summarize({ os, hosts, tests, suites, startedAt, manual }) {
  const criteria = [];
  for (const h of hosts) {
    for (const s of SUITES.filter((x) => x.key !== 'transfer')) {
      const r = suites[h]?.[s.key];
      if (r === undefined) continue;
      criteria.push({ criterion: 'Сквозные сценарии', host: h, suite: s.key, what: s.what, ...r });
    }
    const media = suites[h]?.mediaReport;
    if (suites[h]?.deferredTransfer !== undefined) criteria.push({ criterion: 'Перенос проекта (на этой машине)', host: h, suite: 'transfer', what: `${TRANSFER_WHAT}; после перезапуска Premiere`, ...suites[h].deferredTransfer });
    else if (media !== undefined) criteria.push({ criterion: 'Перенос проекта (на этой машине)', host: h, suite: 'media', what: TRANSFER_WHAT, ...transferResult(media) });
  }
  const ok = (tests ? tests.ok : true) && criteria.every((c) => c.ok);
  return {
    os, startedAt, finishedAt: new Date().toISOString(), ok,
    tests,
    criteria,
    manual: {
      'Чистая установка': manual.install.length ? manual.install : 'нет отчёта: установщик проверяется вручную',
      'Открытие на другой ОС': manual.open.length ? manual.open : 'нет отчёта: node tools/panel/live.mjs --host ae|pr --open <проект с другой ОС>',
    },
  };
}

export function toMarkdown(sum) {
  const lines = [`# Контрольная точка фазы 3 — ${sum.os === 'win' ? 'Windows' : 'macOS'}, ${sum.startedAt.slice(0, 10)}`, '', `Итог: **${sum.ok ? 'зелёный' : 'есть провалы'}**.`, ''];
  if (sum.tests) lines.push(`npm test: ${sum.tests.ok ? 'зелёный' : 'упал'}${sum.tests.line ? ` (${sum.tests.line})` : ''}.`, '');
  lines.push('| Критерий | Хост | Набор | Итог | Проверок |', '|---|---|---|---|---|');
  for (const c of sum.criteria) lines.push(`| ${c.criterion} | ${c.host === 'ae' ? 'AE' : 'Premiere'} | ${c.suite} | ${c.ok ? 'да' : `нет: ${c.reason ?? (c.failed ?? []).slice(0, 3).join('; ')}`} | ${c.checks ?? '—'} |`);
  lines.push('', 'Вручную:');
  for (const [k, v] of Object.entries(sum.manual)) lines.push(`- ${k}: ${Array.isArray(v) ? v.map((x) => `\`${x}\``).join(', ') : v}`);
  return lines.join('\n') + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
  const hosts = opt('--host') ? [opt('--host')] : ['ae', 'pr'];
  const only = opt('--only') ? opt('--only').split(',') : DEFAULT_ONLY;
  const os = process.platform === 'win32' ? 'win' : 'mac';
  const startedAt = new Date().toISOString();
  let tests = null;
  if (!argv.includes('--skip-tests')) {
    const r = spawnSync(process.execPath, [path.join(REPO, 'node_modules', 'vitest', 'vitest.mjs'), 'run'], { cwd: REPO, encoding: 'utf8' });
    const line = (r.stdout.match(/Tests\s+[^\n]+/) ?? [''])[0].trim();
    tests = { ok: r.status === 0, line };
    console.log(`npm test: ${tests.ok ? 'ok' : 'FAILED'} ${line}`);
  }
  const suites = {};
  for (const h of hosts) {
    suites[h] = {};
    for (const s of SUITES.filter((x) => only.includes(x.key) && (!x.hosts || x.hosts.includes(h)))) {
      console.log(`\n== ${h} ${s.key} ==`);
      const [script, ...args] = s.cmd(h);
      spawnSync(process.execPath, [path.join(REPO, script), ...args], { cwd: REPO, stdio: 'inherit' });
      const file = path.join(REPO, 'docs', 'research', 'panel-live', s.report(h));
      const report = existsSync(file) ? readJson(file) : null;
      suites[h][s.key] = suiteResult(report, startedAt);
      if (s.key === 'media') suites[h].mediaReport = report && suiteResult(report, startedAt).reason === undefined ? report : null;
    }
    if (h === 'pr' && (only.includes('media') || only.includes('transfer'))) {
      const read = (f) => (existsSync(path.join(REPO, 'docs', 'research', 'panel-live', f)) ? readJson(path.join(REPO, 'docs', 'research', 'panel-live', f)) : null);
      suites[h].deferredTransfer = deferredTransferResult(read('pr-transfer-report.json'), read('pr-media-report.json'));
    }
    delete suites[h].transfer;
  }
  const dir = path.join(REPO, 'docs', 'research', 'checkpoint');
  mkdirSync(dir, { recursive: true });
  const base = path.join(dir, `${os}-${startedAt.slice(0, 10)}`);
  const sum = mergeSummary(existsSync(`${base}.json`) ? readJson(`${base}.json`) : null, summarize({ os, hosts, tests, suites, startedAt, manual: manualReports(REPO, os) }));
  writeFileSync(`${base}.json`, JSON.stringify(sum, null, 2) + '\n', 'utf8');
  writeFileSync(`${base}.md`, toMarkdown(sum), 'utf8');
  console.log(`\n${toMarkdown(sum)}\nwritten ${base}.json and .md`);
  process.exit(sum.ok ? 0 : 1);
}
