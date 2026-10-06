// Live run of the «Экспорт» tab in After Effects or Premiere on the build PC (decisions P18–P23).
//   node tools/panel/live.mjs --host ae --export      (or --host pr)
// Needs the BrandKit Dev panel open in the host, ffmpeg and ffprobe on PATH, the brand presets staged into
// <work>/build by tools/library/export-pack.mjs and, for AE, the brand .aom loaded by hand
// (Edit → Templates → Output Module → Load). The catalog of the presets goes to <work>/panel-live/export/library,
// the scratch project and the files to <work>/panel-live/<host>/ (Export/ next to export_live.*).
// Report: docs/research/panel-live/<host>-export-report.json.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { composeHost } from '../../panel/host/compose.mjs';
import { Bridge, evalFileScript } from '../../panel/src/bridge/bridge.ts';
import { parseCatalog } from '../../panel/src/core/library.ts';
import { runAerender } from '../../panel/src/services/export.ts';
import { run } from '../../tools/host-run.mjs';
import { cdpEval, getPageTarget } from '../../tools/lib/cdp.mjs';
import { probeMedia } from '../../tools/lib/media-probe.mjs';
import { buildPayload, hostPorts } from '../../tools/lib/payload.mjs';
import { workPath } from '../../tools/lib/work.mjs';
import { buildCatalog, calver } from '../../tools/library/build-catalog.mjs';
import { waitForStableFiles } from '../../tools/golden/png.mjs';
import { presetSources, stagePreset } from '../../tools/pr/env.mjs';
import { composeProbe, REPO } from '../../tools/spike/runner.mjs';
import { runExportLive } from './export.mjs';
import { Report } from './runner.mjs';

const HOST = process.env.BRANDKIT_LIVE_HOST;
const EXPORT = process.env.BRANDKIT_LIVE_EXPORT === '1';
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));

describe.skipIf(!EXPORT || (HOST !== 'ae' && HOST !== 'pr'))('panel live, export', () => {
  it(`«Экспорт» in ${HOST}`, async () => {
    const R = new Report(HOST, (line) => console.log(line));
    const outDir = workPath('panel-live', HOST).replace(/\\/g, '/');
    mkdirSync(outDir, { recursive: true });
    const reportFile = path.join(REPO, 'docs', 'research', 'panel-live', `${HOST}-export-report.json`);
    try {
      // The catalog of the export items, from the presets staged into the build dir.
      const example = readJson(path.join(REPO, 'docs', 'library', 'example.src.json'));
      const src = { schemaVersion: 1, items: example.items.filter((i) => i.category === 'export') };
      const libDir = workPath('panel-live', 'export', 'library');
      const built = await buildCatalog({ src, buildDir: process.env.BRANDKIT_LIVE_BUILD || workPath('build'), outDir: libDir, tokens: readJson(path.join(REPO, 'brand', 'tokens.json')), libraryVersion: calver() });
      if (!R.check('export catalog built from the staged presets (tools/library/export-pack.mjs)', built.ok, built.problems)) return;
      const loaded = parseCatalog(readFileSync(path.join(libDir, 'library.json'), 'utf8'), '0.1.0');
      if (!R.check('catalog read by the panel core', loaded.catalog && !loaded.problems.length, loaded.problems)) return;

      // A 3 s clip with picture and sound; the Export folder of the scratch project starts empty.
      const clip = path.posix.join(outDir, 'export-clip.mp4');
      if (!existsSync(clip)) {
        const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=25:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=3:sample_rate=48000',
          '-ac', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', clip], { encoding: 'utf8' });
        if (!R.check('export clip made with ffmpeg', r.status === 0, r.stderr)) return;
      }
      rmSync(path.join(outDir, 'Export'), { recursive: true, force: true });

      const bundleFile = path.posix.join(outDir, 'brandkit.jsx');
      writeFileSync(bundleFile, composeHost(), 'ascii');
      const page = await getPageTarget(hostPorts(HOST));
      const evalScript = (script) => cdpEval(page.webSocketDebuggerUrl, buildPayload(script, ''), { timeoutMs: 900000 });
      const bundleVersion = readJson(path.join(REPO, 'panel', 'package.json')).version;
      const bridge = new Bridge({ evalScript, bundleVersion, loadHost: async () => { await evalScript(evalFileScript(bundleFile)); }, timeoutMs: 120000 });
      await evalScript('BK = undefined; "cold"');
      const ping = await bridge.call('ping');
      R.check(`bridge: the host bundle ${bundleVersion} answers`, ping.ok && ping.data?.bk === bundleVersion, ping);
      R.hostVersion = ping.data?.version ?? null;

      const base = { workDir: workPath() };
      if (HOST === 'pr') base.seqPreset = stagePreset(presetSources().seq1080p25, 'HD1080p25.sqpreset');
      const libs = HOST === 'ae' ? ['spikes/lib/ae-project.jsx', 'tests/live/jsx/ae-live.jsx'] : ['spikes/lib/pr-helpers.jsx', 'tests/live/jsx/pr-live.jsx'];
      const hostRun = (op, params) => run(HOST, composeProbe(libs, { ...base, ...params, op }), { timeoutMs: 600000 });
      const platform = process.platform === 'win32' ? 'win' : 'mac';

      await runExportLive({
        host: HOST,
        bridge,
        hostRun,
        catalog: loaded.catalog,
        libraryRoot: libDir.replace(/\\/g, '/'),
        project: path.posix.join(outDir, `export_live.${HOST === 'ae' ? 'aep' : 'prproj'}`),
        clip,
        documents: path.join(os.homedir(), 'Documents').replace(/\\/g, '/'),
        exists: (p) => existsSync(p),
        mkdirp: (d) => mkdirSync(d, { recursive: true }),
        probe: (f) => probeMedia(f),
        aerender: (job) => runAerender(spawn, platform, job),
        // AME and aerender write the file after the call returns: wait until its size stays the same.
        waitFile: async (f) => {
          try {
            await waitForStableFiles([f], { timeoutMs: 300000, complete: () => true });
            return true;
          } catch {
            return false;
          }
        },
        R,
      });
    } catch (e) {
      R.check('live run finished without an exception', false, String(e && e.stack ? e.stack : e));
    } finally {
      mkdirSync(path.dirname(reportFile), { recursive: true });
      writeFileSync(reportFile, JSON.stringify({ ...R.toJSON(), hostVersion: R.hostVersion ?? null, outDir }, null, 2) + '\n', 'utf8');
      console.log(`report ${reportFile}: ${R.toJSON().summary.passed}/${R.checks.length} passed`);
    }
    expect(R.failed()).toEqual([]);
  }, 3600000);
});
