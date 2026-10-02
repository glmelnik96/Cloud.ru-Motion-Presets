import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import { zxpInfo } from '../../tools/panel/zxp-info.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MANIFEST = readFileSync(path.join(REPO, 'dev/harness/CSXS/manifest.xml'), 'utf8');

function makeZxp(entries) {
  const zip = new AdmZip();
  for (const [name, body] of Object.entries(entries)) zip.addFile(name, Buffer.from(body, 'utf8'));
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), 'bk-zxp-')), 'trial.zxp');
  zip.writeZip(file);
  return file;
}

describe('zxpInfo', () => {
  it('sees a signed package with its manifest', () => {
    const z = zxpInfo(makeZxp({
      'CSXS/manifest.xml': MANIFEST, 'META-INF/signatures.xml': '<signatures/>', 'index.html': '<html></html>',
    }));
    expect(z).toMatchObject({ entries: 3, signed: true, hasManifest: true, hasDebugFile: false });
    expect(z.manifest.bundleId).toBe('ru.cloud.brandkit.dev');
    expect(z.sizeBytes).toBeGreaterThan(0);
  });
  it('flags an unsigned package and a leftover .debug', () => {
    const z = zxpInfo(makeZxp({ 'CSXS/manifest.xml': MANIFEST, '.debug': '<ExtensionList/>' }));
    expect(z.signed).toBe(false);
    expect(z.hasDebugFile).toBe(true);
  });
  it('reports a package without a manifest', () => {
    const z = zxpInfo(makeZxp({ 'index.html': '<html></html>' }));
    expect(z.hasManifest).toBe(false);
    expect(z.manifest).toBe(null);
  });
});
