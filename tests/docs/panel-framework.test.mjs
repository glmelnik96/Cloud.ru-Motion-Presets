import { describe, it, expect } from 'vitest';
import { readDoc, tableRows } from './markdown.mjs';

const md = readDoc('docs/decisions/panel-framework.md');

describe('docs/decisions/panel-framework.md', () => {
  it('has both criteria and the observations, one column per variant', () => {
    const rows = tableRows(md, /^[KN]\d+$/);
    expect(rows.map((r) => r[0])).toEqual(['K1', 'K2', 'N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8', 'N9']);
    for (const r of rows) {
      expect(r).toHaveLength(5);
      expect(r[2]).not.toBe('');
      expect(r[3]).not.toBe('');
      expect(r[4]).not.toBe('');
    }
  });
  it('answers the criteria with да, нет or — (not checked yet)', () => {
    for (const r of tableRows(md, /^K\d+$/)) {
      expect(r[2]).toMatch(/^(да|нет|—)/);
      expect(r[3]).toMatch(/^(да|нет|—)/);
    }
  });
  it('states a recommendation', () => {
    expect(md).toMatch(/^\*\*Рекомендация:\*\* \S/m);
  });
});
