import { describe, it, expect } from 'vitest';
import { readDoc, tableRows } from './markdown.mjs';

const md = readDoc('docs/decisions/brandbook-rules.md');

describe('docs/decisions/brandbook-rules.md', () => {
  it('gives every rule a brandbook page', () => {
    const rows = tableRows(md, /^[LBKPFG]\d+$/);
    expect(rows.length).toBeGreaterThanOrEqual(20);
    for (const r of rows) expect(r[2]).toMatch(/^\d+([–,] ?\d+)*$/);
  });
  it('names the descriptor and asks the owner six questions', () => {
    expect(md).toContain('облачные сервисы и AI-технологии');
    expect(md.match(/^\d\. /gm)).toHaveLength(6);
  });
});
