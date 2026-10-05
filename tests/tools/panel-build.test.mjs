import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildHost, readParts, stampOf } from '../../tools/panel/build-host.mjs';
import { checkVersions, debugXml } from '../../tools/panel/build.mjs';

const manifest = readFileSync(new URL('../../panel/public/CSXS/manifest.xml', import.meta.url), 'utf8');
const { version } = JSON.parse(readFileSync(new URL('../../panel/version.json', import.meta.url), 'utf8'));

describe('panel build', () => {
  it('keeps the manifest versions equal to panel/version.json', () => {
    expect(() => checkVersions(manifest, version)).not.toThrow();
    expect(() => checkVersions(manifest, '9.9.9')).toThrow(/differ/);
  });
  it('declares one panel for AEFT and PPRO without StartOn (Premiere starts a headless Dynamic Link AE)', () => {
    expect(manifest).toMatch(/ExtensionBundleId="ru\.cloud\.brandkit"/);
    expect(manifest).toMatch(/<Host Name="AEFT" Version="\[26\.0,99\.9\]"/);
    expect(manifest).toMatch(/<Host Name="PPRO" Version="\[26\.0,99\.9\]"/);
    expect(manifest).not.toMatch(/StartOn/);
  });
  it('writes the dev .debug with the panel ports 8101 and 8102 (plan P5)', () => {
    const x = debugXml();
    expect(x).toContain('<Extension Id="ru.cloud.brandkit.panel">');
    expect(x).toContain('<Host Name="AEFT" Port="8101" />');
    expect(x).toContain('<Host Name="PPRO" Port="8102" />');
  });
  it('assembles ASCII adapters stamped with one build id for both hosts', () => {
    const parts = readParts();
    const h = buildHost(parts);
    expect(h.build).toBe(stampOf(parts));
    expect(h.build).toMatch(/^[0-9a-f]{12}$/);
    for (const host of ['ae', 'pr']) {
      expect(h[host]).not.toMatch(/[^\x00-\x7f]/);
      expect(h[host]).not.toContain('__CRBK_BUILD__');
      expect(h[host]).toContain(`CRBK.build = '${h.build}'`);
    }
  });
  it('refuses a non-ASCII adapter and an ES3 lint error', () => {
    const parts = readParts();
    expect(() => buildHost({ ...parts, ae: parts.ae + '\n// \u0436\n' })).toThrow(/non-ASCII/);
    expect(() => buildHost({ ...parts, pr: parts.pr + '\nlet x = 1;\n' })).toThrow(/ES3 lint/);
  });
});
