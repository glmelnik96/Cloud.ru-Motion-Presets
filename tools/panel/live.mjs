#!/usr/bin/env node
// Live checks of the panel in a running host (spec 8.3): core + bridge + adapters through the BrandKit Dev
// panel, on a scratch project in <work>/panel-live/<host>. The project of the user is never touched: a
// dirty AE project is refused before anything happens.
//   node tools/panel/live.mjs --host ae [--no-frames]
//   node tools/panel/live.mjs --host pr [--no-frames]
//   node tools/panel/live.mjs --host ae|pr --media   T2/T3 and companions on a synthetic pack (tests/live/media.live.mjs)
//   node tools/panel/live.mjs --host ae|pr --export  «Экспорт» with the brand presets (tests/live/export.live.mjs)
// Report: docs/research/panel-live/<host>-report.json (<host>-media-report.json with --media,
// <host>-export-report.json with --export); frames and the scratch projects in <work>/panel-live.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const host = argv.includes('--host') ? argv[argv.indexOf('--host') + 1] : null;
if (host !== 'ae' && host !== 'pr') {
  console.error('usage: node tools/panel/live.mjs --host ae|pr [--no-frames] [--media | --export]');
  process.exit(2);
}
// The CLI file itself: vitest's package exports do not list it, so require.resolve fails on Node 24.
const vitest = path.join(REPO, 'node_modules', 'vitest', 'vitest.mjs');
const media = argv.includes('--media');
const exp = argv.includes('--export');
const file = exp ? 'tests/live/export.live.mjs' : media ? 'tests/live/media.live.mjs' : 'tests/live/panel.live.mjs';
const r = spawnSync(process.execPath, [vitest, 'run', '--config', 'vitest.live.config.mjs', '--reporter', 'verbose', file], {
  cwd: REPO,
  stdio: 'inherit',
  env: { ...process.env, BRANDKIT_LIVE_HOST: host, BRANDKIT_LIVE_FRAMES: argv.includes('--no-frames') ? '0' : '1', BRANDKIT_LIVE_MEDIA: media ? '1' : '0', BRANDKIT_LIVE_EXPORT: exp ? '1' : '0' },
});
process.exit(r.status ?? 1);
