// Spike results: one JSON file per spike in spikes/results, rendered into spikes/RESULTS.md.
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 'measured' is for spikes that only measure (S8 in phase 0); 'not-run' for spikes that could not run.
export const VERDICTS = ['yes', 'no', 'partial', 'not-run', 'measured'];
const here = path.dirname(fileURLToPath(import.meta.url));
export const RESULTS_DIR = path.resolve(here, '../../spikes/results');

export function decideVerdict(checks) {
  if (!checks.length) return 'not-run';
  if (checks.some((c) => c.required !== false && !c.pass)) return 'no';
  return checks.every((c) => c.pass) ? 'yes' : 'partial';
}

// verdictLocked: the verdict was set on purpose (measured, not-run) and manual checks must not change it.
export function makeResult({ id, title, host, hostVersion = null, checks = [], verdict, verdictLocked = false, fallback = '', notes = '', evidence = [], date }) {
  if (!/^S\d+$/.test(String(id))) throw new Error('bad spike id: ' + id);
  for (const c of checks) {
    if (!c || typeof c.name !== 'string' || typeof c.pass !== 'boolean') throw new Error('bad check: ' + JSON.stringify(c));
  }
  if (verdictLocked && !verdict) throw new Error('a locked verdict needs an explicit verdict');
  const v = verdict || decideVerdict(checks);
  if (!VERDICTS.includes(v)) throw new Error('bad verdict: ' + v);
  return {
    id, title, host, hostVersion,
    date: date || new Date().toISOString().slice(0, 10),
    verdict: v, verdictLocked: Boolean(verdictLocked), checks, fallback, notes, evidence,
  };
}

export function writeResult(result, dir = RESULTS_DIR) {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, result.id + '.json');
  writeFileSync(file, JSON.stringify(result, null, 2) + '\n', 'utf8');
  return file;
}

export function readResults(dir = RESULTS_DIR) {
  let names;
  try { names = readdirSync(dir).filter((n) => /^S\d+\.json$/.test(n)); } catch { return []; }
  return names.map((n) => JSON.parse(readFileSync(path.join(dir, n), 'utf8')));
}

// Adds a manual observation; a manual check with the same name is replaced, so re-runs do not duplicate it.
export function appendManualCheck(id, check, dir = RESULTS_DIR) {
  const file = path.join(dir, id + '.json');
  const r = JSON.parse(readFileSync(file, 'utf8'));
  const entry = { required: true, detail: '', ...check, manual: true };
  const checks = r.checks.filter((c) => !(c.manual && c.name === entry.name)).concat([entry]);
  const next = makeResult({ ...r, checks, verdict: r.verdictLocked ? r.verdict : undefined });
  writeResult(next, dir);
  return next;
}

const esc = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|');

export function renderReport(results) {
  const rows = [...results].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
  const lines = [
    '# Пробные сборки фазы 0 — итоги',
    '',
    'Собирается командой `npm run spike:report` из `spikes/results/*.json`; руками не править.',
    '',
    '| # | Что | Хост | Версия | Итог | Проверки | Запасной путь |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    const passed = r.checks.filter((c) => c.pass).length;
    lines.push(`| ${r.id} | ${esc(r.title)} | ${esc(r.host)} | ${esc(r.hostVersion || '—')} | ${r.verdict} | ${passed}/${r.checks.length} | ${esc(r.fallback || '—')} |`);
  }
  return lines.join('\n') + '\n';
}
