// The summary of the phase 3 checkpoint (tools/panel/checkpoint.mjs): fresh reports only, the move of a
// project read from the media report, the manual reports named and not judged.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { manualReports, suiteResult, summarize, toMarkdown, transferResult } from '../../tools/panel/checkpoint.mjs';

const T0 = '2026-10-07T09:00:00.000Z';
const rep = (over = {}) => ({ startedAt: '2026-10-07T09:05:00.000Z', summary: { checks: 10, passed: 10, failed: 0 }, failed: [], checks: [], ...over });

describe('checkpoint summary', () => {
  it('a suite is green only with a fresh report without failures', () => {
    expect(suiteResult(rep(), T0)).toMatchObject({ ok: true, checks: 10 });
    expect(suiteResult(null, T0)).toEqual({ ok: false, reason: 'нет отчёта' });
    expect(suiteResult(rep({ startedAt: '2026-10-06T20:00:00.000Z' }), T0)).toMatchObject({ ok: false, reason: 'отчёт старше прогона (2026-10-06T20:00:00.000Z)' });
    expect(suiteResult(rep({ summary: { checks: 10, passed: 9, failed: 1 }, failed: ['x'] }), T0)).toMatchObject({ ok: false, failed: ['x'] });
    // ui-check: checks without a summary
    expect(suiteResult({ startedAt: '2026-10-07T09:05:00.000Z', checks: [{ name: 'a', pass: true }, { name: 'b', pass: true }], failed: [] }, T0)).toMatchObject({ ok: true, checks: 2 });
    expect(suiteResult({ startedAt: '2026-10-07T09:05:00.000Z', checks: [{ name: 'a', pass: false }], failed: ['a'] }, T0)).toMatchObject({ ok: false, failed: ['a'] });
  });

  it('reads the move of a project from the media report', () => {
    const checks = [{ name: 'transfer: no missing files after the move (12 listed)', pass: true }, { name: 'transfer: every file found inside the moved copy', pass: false, required: true }, { name: 'loop: x', pass: false }];
    expect(transferResult({ checks })).toEqual({ ok: false, checks: 2, failed: ['transfer: every file found inside the moved copy'] });
    expect(transferResult({ checks: [] })).toMatchObject({ ok: false });
  });

  it('puts every suite of every host under its criterion, with the manual reports by name', () => {
    const media = rep({ checks: [{ name: 'transfer: no missing files after the move (3 listed)', pass: true }] });
    const sum = summarize({
      os: 'win', hosts: ['ae', 'pr'], startedAt: T0, tests: { ok: true, line: 'Tests 745 passed' },
      suites: { ae: { base: suiteResult(rep(), T0), media: suiteResult(media, T0), mediaReport: media, export: suiteResult(rep(), T0) }, pr: { base: suiteResult(null, T0) } },
      manual: { install: ['docs/research/installer/windows-0.1.17.json'], open: [] },
    });
    expect(sum.ok).toBe(false);
    expect(sum.criteria.map((c) => [c.criterion, c.host, c.suite, c.ok])).toEqual([
      ['Сквозные сценарии', 'ae', 'base', true], ['Сквозные сценарии', 'ae', 'media', true], ['Сквозные сценарии', 'ae', 'export', true],
      ['Перенос проекта (на этой машине)', 'ae', 'media', true],
      ['Сквозные сценарии', 'pr', 'base', false],
    ]);
    const md = toMarkdown(sum);
    expect(md).toContain('| Сквозные сценарии | Premiere | base | нет: нет отчёта | — |');
    expect(md).toContain('- Чистая установка: `docs/research/installer/windows-0.1.17.json`');
    expect(md).toContain('- Открытие на другой ОС: нет отчёта');
  });

  it('finds the install reports of its OS and every open report', () => {
    const repo = mkdtempSync(path.join(os.tmpdir(), 'bk-cp-'));
    mkdirSync(path.join(repo, 'docs/research/installer'), { recursive: true });
    mkdirSync(path.join(repo, 'docs/research/panel-live'), { recursive: true });
    for (const f of ['windows.json', 'windows-0.1.17.json', 'mac-0.1.17.json']) writeFileSync(path.join(repo, 'docs/research/installer', f), '{}');
    for (const f of ['ae-open-mac-report.json', 'pr-report.json']) writeFileSync(path.join(repo, 'docs/research/panel-live', f), '{}');
    expect(manualReports(repo, 'win')).toEqual({ install: ['docs/research/installer/windows-0.1.17.json', 'docs/research/installer/windows.json'], open: ['docs/research/panel-live/ae-open-mac-report.json'] });
    expect(manualReports(repo, 'mac').install).toEqual(['docs/research/installer/mac-0.1.17.json']);
  });
});
