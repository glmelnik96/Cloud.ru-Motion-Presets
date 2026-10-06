// The summary of the phase 3 checkpoint (tools/panel/checkpoint.mjs): fresh reports only, the move of a
// project read from the media report, the manual reports named and not judged.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ONLY, deferredTransferResult, manualReports, mergeSummary, suiteResult, summarize, toMarkdown, transferResult } from '../../tools/panel/checkpoint.mjs';

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

  it('Premiere: the move is judged by the transfer report of the copy the latest media run staged', () => {
    const media = rep({ startedAt: '2026-10-07T09:05:00.000Z' });
    const transfer = rep({ startedAt: '2026-10-07T10:00:00.000Z', staged: { mediaStartedAt: media.startedAt }, checks: [{ name: 'transfer: no missing files after the move (5 listed)', pass: true }] });
    expect(deferredTransferResult(transfer, media)).toMatchObject({ ok: true, checks: 1 });
    expect(deferredTransferResult(null, media)).toMatchObject({ ok: false, reason: expect.stringMatching(/перезапуска Premiere.*--only transfer/) });
    expect(deferredTransferResult({ ...transfer, staged: { mediaStartedAt: '2026-10-06T08:00:00.000Z' } }, media)).toMatchObject({ ok: false, reason: expect.stringMatching(/прошлого прогона/) });
    expect(DEFAULT_ONLY).toEqual(['base', 'media', 'export', 'ui']);
    const sum = summarize({ os: 'win', hosts: ['pr'], startedAt: T0, tests: null, suites: { pr: { media: suiteResult(media, T0), mediaReport: media, deferredTransfer: deferredTransferResult(transfer, media) } }, manual: { install: [], open: [] } });
    expect(sum.criteria.map((c) => [c.criterion, c.suite, c.ok])).toEqual([['Сквозные сценарии', 'media', true], ['Перенос проекта (на этой машине)', 'transfer', true]]);
  });

  it('a later run of the same day keeps the criteria it did not check', () => {
    const c = (host, suite, ok) => ({ criterion: 'Сквозные сценарии', host, suite, ok });
    const prev = { startedAt: T0, tests: { ok: true, line: 'Tests 780 passed' }, ok: false, criteria: [c('ae', 'base', true), c('pr', 'base', true), { criterion: 'Перенос проекта (на этой машине)', host: 'pr', suite: 'transfer', ok: false }] };
    const sum = { startedAt: '2026-10-07T11:00:00.000Z', tests: null, ok: true, criteria: [{ criterion: 'Перенос проекта (на этой машине)', host: 'pr', suite: 'transfer', ok: true }] };
    const m = mergeSummary(prev, sum);
    expect(m).toMatchObject({ ok: true, startedAt: T0, tests: { ok: true } });
    expect(m.criteria.map((x) => `${x.host} ${x.suite} ${x.ok}`)).toEqual(['ae base true', 'pr base true', 'pr transfer true']);
    expect(mergeSummary(null, sum)).toBe(sum);
    // the move judged by the media report before replaces nothing else, and is replaced by the transfer suite
    const old = { ...prev, criteria: [c('pr', 'base', true), { criterion: 'Перенос проекта (на этой машине)', host: 'pr', suite: 'media', ok: false }] };
    expect(mergeSummary(old, sum).criteria.map((x) => `${x.host} ${x.suite} ${x.ok}`)).toEqual(['pr base true', 'pr transfer true']);
  });
});
