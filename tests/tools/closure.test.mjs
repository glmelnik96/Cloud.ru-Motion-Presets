import { describe, it, expect } from 'vitest';
import {
  SPIKES, suggest, closureRows, renderClosure, parseTables, unsignedRows, fillC27, c27Filled, closureProblems,
} from '../../tools/decisions/closure.mjs';

const res = (id, verdict, extra = {}) => ({ id, title: 'T ' + id, verdict, checks: [], fallback: 'fb ' + id, ...extra });

describe('closure table', () => {
  it('suggests the phase outcome from the spike verdict', () => {
    expect(suggest(res('S1', 'yes'))).toMatchObject({ outcome: 'да', path: 'основной' });
    expect(suggest(res('S2', 'no'))).toMatchObject({ outcome: 'нет', path: 'запасной: fb S2' });
    expect(suggest(res('S8', 'measured')).outcome).toBe('замер');
    expect(suggest(res('S9', 'not-run'))).toMatchObject({ outcome: 'не проводилась', path: 'запасной: fb S9' });
    const p = suggest(res('S3', 'partial', {
      checks: [{ name: 'a', pass: true }, { name: 'linear: dE', pass: false, required: false }],
    }));
    expect(p).toEqual({ outcome: '—', path: '—', failed: ['linear: dE'] });
  });
  it('lists S1..S11 and marks a missing result', () => {
    const rows = closureRows([res('S1', 'yes'), res('S11', 'no')]);
    expect(rows.map((r) => r.id)).toEqual(SPIKES);
    expect(rows[1]).toMatchObject({ id: 'S2', verdict: 'нет итога', outcome: '—', path: '—' });
  });
  it('renders a table with empty decision columns and escaped pipes', () => {
    const md = renderClosure(closureRows([res('S1', 'no', { title: 'a | b', checks: [{ name: 'x|y', pass: false }] })]),
      { date: '2026-10-20' });
    const t = parseTables(md)[0];
    expect(t.header).toEqual(['#', 'Что', 'Итог сборки', 'Не прошли', 'Итог фазы', 'Путь', 'Решение пользователя', 'Дата']);
    expect(t.rows).toHaveLength(11);
    expect(t.rows[0].slice(0, 4)).toEqual(['S1', 'a \\| b', 'no', 'x\\|y']);
    expect(unsignedRows(md)).toEqual(SPIKES);
  });
});

describe('sign-off', () => {
  it('finds rows with an empty decision or date in tables that have both columns', () => {
    const md = [
      '| # | Решение | Решение пользователя | Дата |', '|---|---|---|---|',
      '| D1 | x | принято | 2026-10-20 |', '| D2 | y | | |', '| D3 | z | 2 | |', '',
      '| # | Что |', '|---|---|', '| A1 | no sign-off columns |',
    ].join('\n');
    expect(unsignedRows(md)).toEqual(['D2', 'D3']);
  });
});

const CONTRACT = [
  '| № | Правило | Проверка | Как проверяем | Источник |', '|---|---|---|---|---|',
  '| C27 | Длина на слое экземпляра | авто: QA-гейт | приёмочная часть: кадры совпадают (SSIM ≥ 0,98). Механизм (растяжение слоя, '
    + 'сдвиг out point или time remap) берётся из итога S3 и вписывается сюда при закрытии фазы 0 | §4.2 «Время», S3 |',
].join('\n');

describe('C27 from S3', () => {
  it('replaces the mechanism sentence and keeps the acceptance part and the source', () => {
    expect(c27Filled(CONTRACT)).toBe(false);
    const md = fillC27(CONTRACT, 'remap');
    const row = parseTables(md)[0].rows[0];
    expect(row).toHaveLength(5);
    expect(row[3]).toMatch(/^приёмочная часть: кадры совпадают \(SSIM ≥ 0,98\)\. Механизм длины `fit: rdt` в AE: time remap/);
    expect(row[3]).toContain('итог S3: mechanism = remap');
    expect(row[4]).toBe('§4.2 «Время», S3');
    expect(c27Filled(md)).toBe(true);
    expect(fillC27(md, 'rdt')).toContain('mechanism = rdt');
  });
  it('rejects an unknown mechanism and a contract without C27', () => {
    expect(() => fillC27(CONTRACT, 'stretch')).toThrow(/unknown S3 mechanism/);
    expect(() => fillC27('| C26 | x |', 'rdt')).toThrow(/C27 not found/);
  });
});

describe('closureProblems', () => {
  const all = SPIKES.map((id) => res(id, 'yes'));
  const closed = renderClosure(closureRows(all)).replace(/основной \|  \|  \|/g, 'основной | принято | 2026-10-20 |');
  const panel = '| # | Что | Bolt CEP | Свой Vite | Как |\n|---|---|---|---|---|\n'
    + '| K1 | m | да | да | x |\n| K2 | z | да | нет: без метки времени | x |';
  const complete = {
    results: all,
    closureMd: closed,
    decisionsMd: '| # | Решение пользователя | Дата |\n|---|---|---|\n| D1 | 1 | 2026-10-20 |',
    contractMd: fillC27(CONTRACT, 'rdt'),
    panelMd: panel,
    logoGeometry: true,
  };
  it('is empty when everything is decided', () => {
    expect(closureProblems(complete)).toEqual([]);
  });
  it('lists what is still open', () => {
    expect(closureProblems({
      ...complete,
      results: all.slice(1),
      closureMd: null,
      contractMd: CONTRACT,
      panelMd: panel.replace('| K1 | m | да |', '| K1 | m | — |'),
      logoGeometry: false,
    })).toEqual([
      'spike S1: no spikes/results/S1.json',
      'docs/decisions/phase0-closure.md: missing (run --write)',
      'template-contract.md C27: mechanism from S3 not filled (run --fill-c27)',
      'panel-framework.md K1: not checked',
      'docs/research/logo-geometry.md: missing (plan 2, task 7)',
    ]);
  });
});
