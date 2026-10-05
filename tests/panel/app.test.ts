import { describe, it, expect } from 'vitest';
import { parseLibrary } from '../../panel/src/core/library';
import { validateCatalog } from '../../panel/src/core/validate-catalog';
import { catalog } from './core/fixture';

// The panel tsconfig has no Node types (types: []); the tests run in Node, so the built-ins come in untyped.
const nodeFs = 'node:fs';
const fs = (await import(nodeFs)) as { existsSync(p: string): boolean; readFileSync(p: string, enc: 'utf8'): string };

const REAL_LIBRARY = 'C:/CRBK/work/library/library.json';

describe('validateCatalog', () => {
  it('accepts a catalog the pipeline would write', () => {
    expect(validateCatalog(catalog())).toEqual({ ok: true, errors: [] });
  });

  it('accepts the real library built on this machine', ({ skip }) => {
    if (!fs.existsSync(REAL_LIBRARY)) skip();
    const doc: unknown = JSON.parse(fs.readFileSync(REAL_LIBRARY, 'utf8'));
    expect(validateCatalog(doc)).toEqual({ ok: true, errors: [] });
  });

  it('says what is wrong with a broken copy, schema errors and cross-field rules alike', () => {
    const broken = catalog();
    (broken.items[0] as unknown as Record<string, unknown>).colour = 'green'; // a schema error
    const schema = validateCatalog(broken);
    expect(schema.ok).toBe(false);
    expect(schema.errors).toContain('schema: /items/0 unknown property "colour"');

    const twice = catalog();
    const ttl = twice.items[2]!;
    ttl.fields![1]!.egpName = ttl.fields![0]!.egpName; // a cross-field rule: egpName used twice
    const cross = validateCatalog(twice);
    expect(cross.ok).toBe(false);
    expect(cross.errors.join('\n')).toMatch(/egp-name.*used twice/);
  });

  it('refuses anything that is not a catalog without throwing', () => {
    for (const doc of [null, undefined, 42, 'library', [], {}]) {
      const r = validateCatalog(doc);
      expect(r.ok).toBe(false);
      expect(r.errors.length).toBeGreaterThan(0);
    }
  });

  it('is what parseLibrary needs: a broken file becomes LIBRARY_INVALID, a good one a library', () => {
    const broken = catalog();
    (broken as unknown as Record<string, unknown>).libraryVersion = 'today';
    const bad = parseLibrary(JSON.stringify(broken), validateCatalog, '0.1.0');
    expect(bad.ok).toBe(false);
    expect(bad.issues[0]?.code).toBe('LIBRARY_INVALID');
    const good = parseLibrary(JSON.stringify(catalog()), validateCatalog, '0.1.0');
    expect(good.ok).toBe(true);
  });
});
