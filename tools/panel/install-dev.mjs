#!/usr/bin/env node
// Dev install of the panel on the build PC (not the release installer of spec 8.1):
//   node tools/panel/install-dev.mjs [--no-build] [--library <root>] [--no-library]
// 1. builds panel/dist (npm run panel:build) unless --no-build;
// 2. copies it into the per-user CEP extensions folder as ru.cloud.brandkit, with a .debug file that opens
//    DevTools of the panel on 8101 (AE) and 8102 (Premiere): the dev harness holds 8094/8096 (background)
//    and 8095/8097 (its visible panel), and 8088, 8092, 8098-8100 are taken (spec 8.3);
// 3. copies a library root to the shared library folder the panel reads (C:\ProgramData\CloudRuBrandKit\library,
//    /Users/Shared/CloudRuBrandKit/library). Default: <work>/library of npm run library:build, else
//    <work>/panel-live/library of the live checks (recheck 2026-10-06: the build went to <work>/library and
//    the default missed it);
// 4. reports PlayerDebugMode (CSXS.11 and .12): an unsigned panel loads only with it.
// AE and Premiere must be closed or restarted afterwards: CEP reads extensions at start.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readManifest } from './manifest-info.mjs';
import { checkDist } from './dist-check.mjs';
import { workPath } from '../lib/work.mjs';
import { copyTree } from '../lib/copy-tree.mjs';

// The library of the panel: the catalog build if there is one, else the one of the live checks.
export function defaultLibrary(exists = existsSync) {
  const built = workPath('library');
  return exists(path.join(built, 'library.json')) ? built : workPath('panel-live', 'library');
}

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = path.join(REPO, 'panel', 'dist');
const BUNDLE_ID = 'ru.cloud.brandkit';
export const DEBUG_PORTS = { AEFT: 8101, PPRO: 8102 };

export function cepExtensionsDir(platform = process.platform, env = process.env) {
  if (platform === 'win32') return path.join(env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Adobe', 'CEP', 'extensions');
  return path.join(os.homedir(), 'Library', 'Application Support', 'Adobe', 'CEP', 'extensions');
}

export function sharedLibraryDir(platform = process.platform) {
  return platform === 'win32' ? 'C:/ProgramData/CloudRuBrandKit/library' : '/Users/Shared/CloudRuBrandKit/library';
}

export function debugXml(extensionId = `${BUNDLE_ID}.panel`, ports = DEBUG_PORTS) {
  const hosts = Object.entries(ports).map(([name, port]) => `      <Host Name="${name}" Port="${port}"/>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<ExtensionList>\n  <Extension Id="${extensionId}">\n    <HostList>\n${hosts}\n    </HostList>\n  </Extension>\n</ExtensionList>\n`;
}

function playerDebugMode() {
  if (process.platform !== 'win32') {
    return ['11', '12'].map((v) => {
      const r = spawnSync('defaults', ['read', `com.adobe.CSXS.${v}`, 'PlayerDebugMode'], { encoding: 'utf8' });
      return `CSXS.${v} PlayerDebugMode=${(r.stdout || '').trim() || 'not set (defaults write com.adobe.CSXS.' + v + ' PlayerDebugMode 1)'}`;
    });
  }
  return ['11', '12'].map((v) => {
    try {
      const out = execFileSync('reg', ['query', `HKCU\\Software\\Adobe\\CSXS.${v}`, '/v', 'PlayerDebugMode'], { encoding: 'utf8' });
      return `CSXS.${v} PlayerDebugMode=${/REG_SZ\s+(\S+)/.exec(out)?.[1] ?? '?'}`;
    } catch {
      return `CSXS.${v} PlayerDebugMode is not set. Run: reg add HKCU\\Software\\Adobe\\CSXS.${v} /v PlayerDebugMode /t REG_SZ /d 1 /f`;
    }
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const { version } = JSON.parse(readFileSync(path.join(REPO, 'panel', 'package.json'), 'utf8'));
  if (!argv.includes('--no-build')) {
    const r = spawnSync(process.execPath, [path.join(REPO, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config', 'panel/vite.config.mjs'], { cwd: REPO, stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
  const check = checkDist(DIST, { version });
  if (!check.ok) {
    console.error('panel/dist is not a valid extension:\n  ' + check.problems.join('\n  '));
    process.exit(1);
  }
  const dst = path.join(cepExtensionsDir(), BUNDLE_ID);
  if (existsSync(dst)) {
    const m = existsSync(path.join(dst, 'CSXS', 'manifest.xml')) ? readManifest(path.join(dst, 'CSXS', 'manifest.xml')) : null;
    if (!m || m.bundleId !== BUNDLE_ID) {
      console.error(`${dst} exists and is not ${BUNDLE_ID}; remove it by hand`);
      process.exit(1);
    }
    rmSync(dst, { recursive: true, force: true });
  }
  copyTree(DIST, dst);
  writeFileSync(path.join(dst, '.debug'), debugXml(), 'utf8');
  console.log(`panel ${version} -> ${dst} (DevTools: AE http://localhost:${DEBUG_PORTS.AEFT}, Premiere http://localhost:${DEBUG_PORTS.PPRO})`);

  if (!argv.includes('--no-library')) {
    const i = argv.indexOf('--library');
    const src = i === -1 ? defaultLibrary() : argv[i + 1];
    if (!existsSync(path.join(src, 'library.json'))) {
      console.log(`no library at ${src}: run node tools/panel/live.mjs --host ae once, or npm run library:build -- --out <root>, then --library <root>`);
    } else {
      const lib = sharedLibraryDir();
      rmSync(lib, { recursive: true, force: true });
      copyTree(src, lib);
      console.log(`library ${src} -> ${lib}`);
    }
  }
  for (const line of playerDebugMode()) console.log(line);
  console.log('Restart After Effects and Premiere, then Window > Extensions > Cloud.ru BrandKit.');
}
