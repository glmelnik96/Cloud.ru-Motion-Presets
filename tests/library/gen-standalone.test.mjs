// panel/src/generated/catalog-validate.mjs: Ajv standalone validators of both library schemas for the panel.
// The committed file must equal what the generator gives now, and it must judge documents exactly as
// validate.mjs does (plan 2026-10-05 P8).
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generate, readGenerated, refresh } from '../../tools/library/gen-standalone.mjs';
import { validateCatalogSchema, validateSourceSchema } from '../../panel/src/generated/catalog-validate.mjs';
import { checkLibrary } from '../../tools/library/rules.mjs';
import { validateLibrary } from '../../tools/library/validate.mjs';

const REPO = new URL('../../', import.meta.url);
const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, REPO), 'utf8'));
const SHA = 'a'.repeat(64);

function catalogOf(src) {
  return {
    schemaVersion: 1,
    libraryVersion: '2026.10.05',
    minPluginVersion: '0.1.0',
    generatedAt: '2026-10-05T01:02:03Z',
    items: src.items.map((it) => ({
      ...it,
      ...(it.requiredFonts && { requiredFonts: it.requiredFonts.map((f) => ({ ...f, build: '1.002' })) }),
      variants: it.variants.map((v) => ({
        ...v,
        aeComp: `${v.aeComp}_v${it.version}`,
        file: `items/${it.id}/${it.id}_${v.key}_v${it.version}.mogrt`,
        sha256: SHA,
        bytes: 1,
      })),
      aep: { file: `items/${it.id}/${it.id}_v${it.version}.aep`, sha256: SHA, bytes: 2 },
      preview: { file: `items/${it.id}/preview.mp4`, sha256: SHA, bytes: 3 },
      poster: { file: `items/${it.id}/poster.jpg`, sha256: SHA, bytes: 4 },
    })),
  };
}

function cases() {
  const src = () => readJson('library/library.src.json');
  const out = [
    ['source', src()],
    ['source', readJson('docs/library/example.src.json')],
    ['catalog', catalogOf(src())],
    ['source', catalogOf(src())],
    ['catalog', src()],
    ['source', null],
    ['catalog', []],
  ];
  const badSource = src();
  badSource.items[0].colour = 'green';
  badSource.items[1].id = 'whoosh';
  badSource.items[2].fields[0].maxLen = 0;
  out.push(['source', badSource]);
  const mixedFps = src();
  mixedFps.items[1].variants[2].fps = 30;
  out.push(['source', mixedFps]);
  const badCatalog = catalogOf(src());
  delete badCatalog.items[2].requiredFonts[0].build;
  badCatalog.libraryVersion = '2026-10-05';
  badCatalog.items[0].variants[0].capsuleID = 'x';
  badCatalog.items[1].aep.sha256 = 'A'.repeat(64);
  out.push(['catalog', badCatalog]);
  const crossCatalog = catalogOf(src());
  crossCatalog.items[0].variants[1].aeComp = 'CR_LOGO_Shot_16x9_4K_v2';
  crossCatalog.items[2].variants[0].file = `items/TTL_LowerThird/${'x'.repeat(60)}.mogrt`;
  out.push(['catalog', crossCatalog]);
  return out;
}

describe('catalog-validate.mjs', () => {
  it('is fresh: the generator gives the committed file', () => {
    // core.autocrlf may check the file out with CRLF; the generator writes LF.
    expect(readGenerated()).toBe(generate());
  });

  it('refresh writes a missing or stale copy and leaves a fresh one alone (the panel build runs it, P8)', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'crbk-gen-'));
    try {
      const code = generate();
      const file = path.join(dir, 'generated', 'catalog-validate.mjs');
      expect([refresh(file, code), readFileSync(file, 'utf8')]).toEqual([true, code]);
      // Checked out with CRLF it is still fresh, and stays as it is.
      writeFileSync(file, code.replace(/\n/g, '\r\n'));
      expect([refresh(file, code), readFileSync(file, 'utf8')]).toEqual([false, code.replace(/\n/g, '\r\n')]);
      writeFileSync(file, '// stale\n');
      expect([refresh(file, code), readFileSync(file, 'utf8')]).toEqual([true, code]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('imports only the Ajv runtime and needs no require or fs', () => {
    const code = generate();
    const imports = [...code.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const m of imports) expect(m).toMatch(/^ajv\/dist\/runtime\/[a-z0-9]+\.js$/i);
    expect(code).not.toMatch(/\brequire\(|['"]node:|['"]fs['"]/);
    expect(code).toMatch(/^export const validateCatalogSchema = /m);
    expect(code).toMatch(/^export const validateSourceSchema = /m);
  });

  it('judges every case as validate.mjs does', () => {
    let failing = 0;
    for (const [kind, doc] of cases()) {
      const standalone = kind === 'catalog' ? validateCatalogSchema : validateSourceSchema;
      const expected = validateLibrary(doc, kind);
      if (!expected.ok) failing += 1;
      expect(checkLibrary(doc, kind, standalone), `${kind} ${JSON.stringify(doc).slice(0, 80)}`).toEqual(expected);
    }
    expect(failing).toBe(8);
  });
});
