// The CEP build of the panel: one classic IIFE script (CEP opens file://), the manifest for AE and Premiere
// with the plugin version, the ASCII host bundle; a clean release folder (spec 8.1).
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';
import { checkDist } from '../../tools/panel/dist-check.mjs';
import { debugXml, defaultLibrary } from '../../tools/panel/install-dev.mjs';
import { workPath } from '../../tools/lib/work.mjs';
import { certArgs, signArgs } from '../../tools/panel/package-zxp.mjs';

const REPO = path.resolve(import.meta.dirname, '../..');
const { version } = JSON.parse(readFileSync(path.join(REPO, 'panel', 'package.json'), 'utf8'));

describe('panel build', () => {
  it('builds an extension folder CEP can load', async () => {
    const out = mkdtempSync(path.join(os.tmpdir(), 'bk-panel-'));
    await build({ configFile: path.join(REPO, 'panel', 'vite.config.mjs'), logLevel: 'silent', build: { outDir: out, emptyOutDir: true } });
    const check = checkDist(out, { version });
    expect(check.problems).toEqual([]);
    expect(check.manifest).toMatchObject({ bundleId: 'ru.cloud.brandkit', bundleVersion: version, csxs: '11.0' });
    const html = readFileSync(path.join(out, 'index.html'), 'utf8');
    expect(html).toMatch(/<script defer src="\.\/assets\/index-[\w-]+\.js"><\/script>/);
    const js = readdirSync(path.join(out, 'assets')).filter((f) => f.endsWith('.js'));
    expect(js).toHaveLength(1);
    const code = readFileSync(path.join(out, 'assets', js[0]), 'utf8');
    expect(code.startsWith('(function')).toBe(true);
    expect(code.includes('DemoHost')).toBe(false);
    expect(code.includes(version)).toBe(true);
    expect(readFileSync(path.join(out, 'CSXS', 'manifest.xml'), 'utf8')).toContain('<ScriptPath>./host/brandkit.jsx</ScriptPath>');
  }, 60000);

  it('flags junk and a .debug file in a release folder', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-junk-'));
    mkdirSync(path.join(dir, 'CSXS'));
    writeFileSync(path.join(dir, '.debug'), 'x');
    writeFileSync(path.join(dir, '.DS_Store'), 'x');
    writeFileSync(path.join(dir, 'CSXS', '._manifest.xml'), 'x');
    const p = checkDist(dir).problems.join('\n');
    expect(p).toMatch(/junk \.debug/);
    expect(p).toMatch(/junk \.DS_Store/);
    expect(p).toMatch(/junk CSXS\/\._manifest\.xml/);
    expect(p).toMatch(/no CSXS\/manifest\.xml/);
    expect(p).toMatch(/no index\.html/);
    expect(checkDist(dir, { allowDebug: true }).problems.join('\n')).not.toMatch(/junk \.debug/);
  });

  it('opens DevTools of the dev install on ports of its own', () => {
    expect(debugXml()).toContain('<Extension Id="ru.cloud.brandkit.panel">');
    expect(debugXml()).toContain('<Host Name="AEFT" Port="8101"/>');
    expect(debugXml()).toContain('<Host Name="PPRO" Port="8102"/>');
  });

  it('signs with a DigiCert time stamp and keeps the password out of the repo', () => {
    expect(signArgs({ dist: 'panel/dist', out: 'x.zxp', cert: 'c.p12', password: 'p' })).toEqual(['-sign', 'panel/dist', 'x.zxp', 'c.p12', 'p', '-tsa', 'http://timestamp.digicert.com']);
    expect(certArgs({ cert: 'c.p12', password: 'p' })).toEqual(['-selfSignedCert', 'RU', 'Moscow', 'Cloud.ru', 'Cloud.ru BrandKit', 'p', 'c.p12']);
  });
  it('install-dev takes the catalog build by default, else the library of the live checks', () => {
    expect(defaultLibrary(() => true)).toBe(workPath('library'));
    expect(defaultLibrary(() => false)).toBe(workPath('panel-live', 'library'));
  });
});
