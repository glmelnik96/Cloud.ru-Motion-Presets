import { describe, it, expect } from 'vitest';
import { readDoc, tableRows } from './markdown.mjs';

const md = readDoc('docs/contract/template-contract.md');
const rules = tableRows(md, /^C\d\d$/);
const MODES = ['авто: tplProblems', 'авто: QA-гейт', 'просмотр'];

describe('docs/contract/template-contract.md', () => {
  it('numbers the rules C01..Cnn without gaps', () => {
    expect(rules.length).toBeGreaterThanOrEqual(40);
    rules.forEach((r, i) => expect(r[0]).toBe('C' + String(i + 1).padStart(2, '0')));
  });
  it('marks every rule with one check mode and a planned check', () => {
    for (const r of rules) {
      expect(r).toHaveLength(5);
      expect(MODES).toContain(r[2]);
      expect(r[3]).not.toBe('');
      expect(r[4]).not.toBe('');
    }
  });
  it('keeps the font names exact', () => {
    expect(md).toContain('`SBSansDisplay-Semibold` (строчная b)');
    expect(md).not.toMatch(/SBSansDisplay-SemiBold/);
  });
});
