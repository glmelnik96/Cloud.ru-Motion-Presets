import { describe, it, expect } from 'vitest';
import { readDoc, tableRows } from './markdown.mjs';

const md = readDoc('docs/decisions/phase0-decisions.md');

describe('docs/decisions/phase0-decisions.md', () => {
  it('lists D1..D25 once each, with seven cells and empty decision columns', () => {
    const rows = tableRows(md, /^D\d+$/);
    expect(rows.map((r) => r[0])).toEqual(Array.from({ length: 25 }, (_, i) => 'D' + (i + 1)));
    for (const r of rows) {
      expect(r).toHaveLength(7);
      expect(r[2]).not.toBe('');
      expect(r[4]).not.toBe('');
    }
  });
  it('gives each of the 12 movement types rule 1 or 2 (D19)', () => {
    const section = md.split('### D19.')[1];
    expect(section).toBeDefined();
    const types = tableRows(section.split('\n## ')[0], /^M\d+$/);
    expect(types.map((r) => r[0])).toEqual(Array.from({ length: 12 }, (_, i) => 'M' + (i + 1)));
    for (const r of types) {
      expect(r).toHaveLength(6);
      expect(r[3]).toMatch(/^[12] — /);
    }
    expect(tableRows(md, /^D19$/)[0][2]).toContain('«D19. Канон движения по типам»');
  });
  it('lists the other phase 0 approvals', () => {
    expect(tableRows(md, /^A\d+$/).map((r) => r[0])).toEqual(['A1', 'A2', 'A3', 'A4', 'A5', 'A6']);
  });
  it('asks the owner concrete questions on D16, D20 and D21', () => {
    for (const id of ['D16', 'D20', 'D21']) {
      const section = md.split(`### ${id}.`)[1];
      expect(section).toBeDefined();
      const questions = section.split('\n### ')[0].match(/^\d\. .*\?/gm);
      expect(questions.length).toBeGreaterThanOrEqual(4);
    }
  });
});
