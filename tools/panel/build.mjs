#!/usr/bin/env node
// Builds the panel into panel/dist, the extension root: the ES3 host adapters (build-host.mjs), then vite build
// with their stamp, then dist/host/{ae,pr}.jsx. --dev builds in development mode (the test hook
// window.__crbkTest is on) and writes dist/.debug with CDP 8101 (AE) and 8102 (Premiere), plan 2026-10-05 P5.
// A release build never contains .debug.
//   node tools/panel/build.mjs [--dev]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { OUT as VALIDATOR, refresh as refreshValidator } from '../library/gen-standalone.mjs';
import { buildHost, HOSTS, REPO } from './build-host.mjs';

export const PANEL = path.join(REPO, 'panel');
export const DIST = path.join(PANEL, 'dist');
export const DEBUG_PORTS = { AEFT: 8101, PPRO: 8102 };

export function debugXml(ports = DEBUG_PORTS) {
  const hosts = Object.entries(ports).map(([h, p]) => `      <Host Name="${h}" Port="${p}" />`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<ExtensionList>\n  <Extension Id="ru.cloud.brandkit.panel">\n    <HostList>\n${hosts}\n    </HostList>\n  </Extension>\n</ExtensionList>\n`;
}

// The manifest carries the version twice; both must equal panel/version.json.
export function checkVersions(manifest, version) {
  const bundle = /ExtensionBundleVersion="([^"]+)"/.exec(manifest);
  const ext = /<Extension Id="ru\.cloud\.brandkit\.panel" Version="([^"]+)"/.exec(manifest);
  if (!bundle || bundle[1] !== version || !ext || ext[1] !== version) {
    throw new Error(`manifest versions ${bundle && bundle[1]} / ${ext && ext[1]} differ from panel/version.json ${version}`);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const dev = process.argv.includes('--dev');
  const { version } = JSON.parse(readFileSync(path.join(PANEL, 'version.json'), 'utf8'));
  checkVersions(readFileSync(path.join(PANEL, 'public', 'CSXS', 'manifest.xml'), 'utf8'), version);
  const host = buildHost();
  process.env.CRBK_BUILD = host.build;
  // Plan P8: the schemas are compiled into the panel's validator at panel build. A stale committed copy is
  // rewritten before vite bundles it, so the bundle never checks libraries against old schemas.
  if (refreshValidator()) console.log(`wrote ${path.relative(REPO, VALIDATOR).replace(/\\/g, '/')}: it was stale, commit it`);
  await build({ configFile: path.join(PANEL, 'vite.config.mjs'), mode: dev ? 'development' : 'production', logLevel: 'warn' });
  mkdirSync(path.join(DIST, 'host'), { recursive: true });
  for (const h of HOSTS) writeFileSync(path.join(DIST, 'host', h + '.jsx'), host[h], 'utf8');
  if (dev) writeFileSync(path.join(DIST, '.debug'), debugXml(), 'utf8');
  for (const h of HOSTS) for (const w of host.warnings[h]) console.log(`warn host ${h}: ${w}`);
  console.log(`panel ${version} build ${host.build}${dev ? ' (dev, .debug 8101/8102)' : ''} -> ${DIST}`);
}
