// Live run of the panel core, bridge and adapters in After Effects or Premiere on the build PC.
//   node tools/panel/live.mjs --host ae      (or --host pr; --no-frames skips the frame comparison)
// Needs the BrandKit Dev panel open in the host (CDP 8094 for AE, 8096 for Premiere, as for the masters)
// and the packaged masters in <work>/build. Report: docs/research/panel-live/<host>-report.json.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { composeHost } from '../../panel/host/compose.mjs';
import { Bridge, evalFileScript } from '../../panel/src/bridge/bridge.ts';
import { parseCatalog } from '../../panel/src/core/library.ts';
import { run } from '../../tools/host-run.mjs';
import { cdpEval, getPageTarget } from '../../tools/lib/cdp.mjs';
import { buildPayload, hostPort } from '../../tools/lib/payload.mjs';
import { workPath } from '../../tools/lib/work.mjs';
import { buildCatalog, calver } from '../../tools/library/build-catalog.mjs';
import { composeProbe, REPO } from '../../tools/spike/runner.mjs';
import { scanFonts } from '../../tools/fonts/scan-fonts.mjs';
import { presetSources, stagePreset } from '../../tools/pr/env.mjs';
import { waitForStableFiles } from '../../tools/golden/png.mjs';
import { compareFrames } from '../../tools/qa/ssim.mjs';
import { aeHooks, prHooks } from './hosts.mjs';
import { Report, runLive } from './runner.mjs';

const HOST = process.env.BRANDKIT_LIVE_HOST;
const FRAMES = process.env.BRANDKIT_LIVE_FRAMES !== '0';
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));

describe.skipIf(HOST !== 'ae' && HOST !== 'pr')('panel live', () => {
  it(`core, bridge and adapters in ${HOST}`, async () => {
    const R = new Report(HOST, (line) => console.log(line));
    const outDir = workPath('panel-live', HOST);
    const framesDir = path.posix.join(outDir, 'frames');
    mkdirSync(framesDir, { recursive: true });
    const reportFile = path.join(REPO, 'docs', 'research', 'panel-live', `${HOST}-report.json`);
    const tokens = readJson(path.join(REPO, 'brand', 'tokens.json'));
    try {
      // The catalog of the masters that are built, as the installer will lay it out.
      const src = readJson(path.join(REPO, 'library', 'library.src.json'));
      const buildDir = process.env.BRANDKIT_LIVE_BUILD || workPath('build');
      const libraryRoot = process.env.BRANDKIT_LIVE_LIBRARY || workPath('panel-live', 'library');
      const only = src.items.filter((i) => existsSync(path.join(buildDir, i.id, `${i.id}_v${i.version}.aep`))).map((i) => i.id);
      const built = await buildCatalog({ src, buildDir, outDir: libraryRoot, tokens, only, libraryVersion: calver() });
      R.check(`catalog built from ${buildDir}: ${only.join(', ') || 'no masters'}`, built.ok && only.length > 0, built.problems);
      if (!built.ok || !only.length) return;
      const loaded = parseCatalog(readFileSync(path.join(libraryRoot, 'library.json'), 'utf8'), '0.1.0');
      R.check('catalog read by the panel core', loaded.catalog && !loaded.problems.length, loaded.problems);
      if (!loaded.catalog) return;

      // The host bundle as the panel ships it, loaded with $.evalFile by the bridge on a cold start.
      const bundleFile = path.posix.join(outDir, 'brandkit.jsx');
      writeFileSync(bundleFile, composeHost(), 'ascii');
      const page = await getPageTarget(hostPort(HOST));
      const evalScript = (script) => cdpEval(page.webSocketDebuggerUrl, buildPayload(script, ''), { timeoutMs: 180000 });
      const bridge = new Bridge({
        evalScript,
        loadHost: async () => { await evalScript(evalFileScript(bundleFile)); },
        timeoutMs: 120000,
      });

      const base = { workDir: workPath(), framesDir, frameWaitMs: 8000 };
      if (HOST === 'ae') base.project = path.posix.join(outDir, 'panel_live.aep');
      if (HOST === 'pr') {
        base.project = path.posix.join(outDir, 'panel_live.prproj');
        base.seqPreset = stagePreset(presetSources().seq1080p25, 'HD1080p25.sqpreset');
        base.pngPreset = stagePreset(presetSources().pngStill, 'PNGStill.epr');
      }
      const libs = HOST === 'ae' ? ['spikes/lib/ae-project.jsx', 'tests/live/jsx/ae-live.jsx'] : ['spikes/lib/pr-helpers.jsx', 'tests/live/jsx/pr-live.jsx'];
      const hostRun = (op, params) => run(HOST, composeProbe(libs, { ...base, ...params, op }), { timeoutMs: 600000 });
      const wait = (files) => waitForStableFiles(files, { timeoutMs: 180000 });
      const hooks = HOST === 'ae' ? aeHooks({ wait }) : prHooks({ wait });

      const fonts = HOST === 'ae'
        ? async (names) => (await bridge.call('checkFonts', { names })).data ?? {}
        : async (names) => {
          const scan = scanFonts();
          return Object.fromEntries(names.map((n) => {
            const f = scan.fonts.find((x) => x.postScriptName === n);
            return [n, { found: Boolean(f), version: f ? f.versionString : null }];
          }));
        };

      await runLive({
        host: HOST,
        bridge,
        hostRun,
        coldStart: async () => { await evalScript('BK = undefined; "cold"'); },
        catalog: loaded.catalog,
        libraryRoot,
        platform: process.platform === 'win32' ? 'win' : 'mac',
        bkVersion: JSON.parse(readFileSync(path.join(REPO, 'panel', 'package.json'), 'utf8')).version,
        fonts,
        frames: FRAMES,
        framesDir,
        ssimMin: tokens.qa.ssimMin,
        compare: async (a, b) => compareFrames(a, b).ssim,
        R,
        ...hooks,
      });
    } catch (e) {
      R.check('live run finished without an exception', false, String(e && e.stack ? e.stack : e));
    } finally {
      mkdirSync(path.dirname(reportFile), { recursive: true });
      writeFileSync(reportFile, JSON.stringify({ ...R.toJSON(), hostVersion: R.hostVersion ?? null, frames: FRAMES, outDir }, null, 2) + '\n', 'utf8');
      console.log(`report ${reportFile}: ${R.toJSON().summary.passed}/${R.checks.length} passed`);
    }
    expect(R.failed()).toEqual([]);
  }, 3600000);
});
