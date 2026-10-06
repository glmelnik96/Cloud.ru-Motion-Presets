// Live run of T2/T3 inserts and T1 companions in After Effects or Premiere on the build PC.
//   node tools/panel/live.mjs --host ae --media      (or --host pr)
// Needs the BrandKit Dev panel open in the host (CDP 8094 for AE, 8096 for Premiere), ffmpeg on PATH and the
// built lower third in <work>/build. The synthetic pack (tools/panel/media-fixtures.mjs) goes to
// <work>/panel-live/media; the scratch project to <work>/panel-live/<host>/media_live.*.
// Report: docs/research/panel-live/<host>-media-report.json.
import { copyFile } from 'node:fs/promises';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { composeHost } from '../../panel/host/compose.mjs';
import { Bridge, evalFileScript } from '../../panel/src/bridge/bridge.ts';
import { parseCatalog } from '../../panel/src/core/library.ts';
import { prepareFiles } from '../../panel/src/services/files.ts';
import { run } from '../../tools/host-run.mjs';
import { cdpEval, getPageTarget } from '../../tools/lib/cdp.mjs';
import { buildPayload, hostPorts } from '../../tools/lib/payload.mjs';
import { workPath } from '../../tools/lib/work.mjs';
import { buildMediaFixtures } from '../../tools/panel/media-fixtures.mjs';
import { composeProbe, REPO } from '../../tools/spike/runner.mjs';
import { presetSources, stagePreset } from '../../tools/pr/env.mjs';
import { waitForStableFiles } from '../../tools/golden/png.mjs';
import { findColorCentroid, pixelAt } from '../../tools/png/read-png.mjs';
import { spawnSync } from 'node:child_process';
import { runFitLive } from './fit.mjs';
import { runColorsLive } from './colors.mjs';
import { runEffectsLive } from './effects.mjs';
import { runMediaLive } from './media.mjs';
import { Report } from './runner.mjs';

const HOST = process.env.BRANDKIT_LIVE_HOST;
const MEDIA = process.env.BRANDKIT_LIVE_MEDIA === '1';

// The same file operations as the panel's Node services (panel/src/services/cep.ts).
const prepFs = {
  size: (p) => {
    try {
      const st = statSync(p);
      return st.isFile() ? st.size : null;
    } catch {
      return null;
    }
  },
  mkdirp: (dir) => mkdirSync(dir, { recursive: true }),
  copy: (from, to) => copyFile(from, to),
  rename: (from, to) => renameSync(from, to),
  remove: (p) => unlinkSync(p),
  write: (p, bytes) => writeFileSync(p, bytes),
};

describe.skipIf(!MEDIA || (HOST !== 'ae' && HOST !== 'pr'))('panel live, media', () => {
  it(`T2/T3 and companions in ${HOST}`, async () => {
    const R = new Report(HOST, (line) => console.log(line));
    const outDir = workPath('panel-live', HOST);
    mkdirSync(outDir, { recursive: true });
    const reportFile = path.join(REPO, 'docs', 'research', 'panel-live', `${HOST}-media-report.json`);
    try {
      const built = await buildMediaFixtures({ realBuild: process.env.BRANDKIT_LIVE_BUILD || workPath('build') });
      R.check(`synthetic pack built: ${built.made.length} files made, catalog in ${built.libraryRoot}`, built.ok, built.problems);
      if (!built.ok) return;
      const loaded = parseCatalog(readFileSync(path.join(built.libraryRoot, 'library.json'), 'utf8'), '0.1.0');
      R.check('catalog read by the panel core', loaded.catalog && !loaded.problems.length, loaded.problems);
      if (!loaded.catalog) return;

      const bundleFile = path.posix.join(outDir, 'brandkit.jsx');
      writeFileSync(bundleFile, composeHost(), 'ascii');
      const page = await getPageTarget(hostPorts(HOST));
      const evalScript = (script) => cdpEval(page.webSocketDebuggerUrl, buildPayload(script, ''), { timeoutMs: 180000 });
      const bundleVersion = JSON.parse(readFileSync(path.join(REPO, 'panel', 'package.json'), 'utf8')).version;
      const bridge = new Bridge({ evalScript, bundleVersion, loadHost: async () => { await evalScript(evalFileScript(bundleFile)); }, timeoutMs: 120000 });
      await evalScript('BK = undefined; "cold"');

      const framesDir = path.posix.join(outDir, 'media-frames');
      mkdirSync(framesDir, { recursive: true });
      const base = { workDir: workPath(), framesDir, frameWaitMs: 8000 };
      if (HOST === 'ae') base.project = path.posix.join(outDir, 'media_live.aep');
      if (HOST === 'pr') {
        base.project = path.posix.join(outDir, 'media_live.prproj');
        base.seqPreset = stagePreset(presetSources().seq1080p25, 'HD1080p25.sqpreset');
        base.pngPreset = stagePreset(presetSources().pngStill, 'PNGStill.epr');
      }
      const libs = HOST === 'ae' ? ['spikes/lib/ae-project.jsx', 'tests/live/jsx/ae-live.jsx'] : ['spikes/lib/pr-helpers.jsx', 'tests/live/jsx/pr-live.jsx'];
      const hostRun = (op, params) => run(HOST, composeProbe(libs, { ...base, ...params, op }), { timeoutMs: 600000 });
      // A frame rendered by the host (AE saveFrameToPng, Premiere exportFramePNG), read in its top-left corner.
      const backdropPixel = async ({ id, sec }) => {
        let file = path.posix.join(framesDir, `backdrop-${HOST}.png`);
        if (HOST === 'ae') {
          await hostRun('frames', { frames: [{ compId: id, t: sec, file }] });
        } else {
          const r = await hostRun('frames', { id, frames: [{ key: 'backdrop', frame: Math.round(sec * 25) }] });
          file = r?.data?.frames?.backdrop ?? null;
        }
        if (!file) return null;
        await waitForStableFiles([file], { timeoutMs: 120000 });
        const p = pixelAt(file, 8, 8);
        return [p.r, p.g, p.b, p.a];
      };

      await runMediaLive({
        host: HOST,
        bridge,
        hostRun,
        catalog: loaded.catalog,
        libraryRoot: built.libraryRoot.replace(/\\/g, '/'),
        platform: process.platform === 'win32' ? 'win' : 'mac',
        bkVersion: JSON.parse(readFileSync(path.join(REPO, 'panel', 'package.json'), 'utf8')).version,
        prepare: (p) => prepareFiles(prepFs, p, (raw) => new Uint8Array(deflateSync(raw))),
        fileExists: (p) => existsSync(p),
        scratchDir: outDir,
        backdropPixel,
        R,
      });
      // The «Эффекты» tab: AE only, with AE's own presets standing in for the brand .ffx.
      if (HOST === 'ae') {
        if (R.check('effects: stand-in presets found in the AE presets folder', built.fx, 'set BRANDKIT_AE_PRESETS to the Presets folder of AE')) {
          await runEffectsLive({ bridge, hostRun, catalog: loaded.catalog, libraryRoot: built.libraryRoot.replace(/\\/g, '/'), project: path.posix.join(outDir, 'effects_live.aep'), R });
        }
      }
      // The «Цвета» tab: AE only, on its own scratch project.
      if (HOST === 'ae') await runColorsLive({ bridge, hostRun, project: path.posix.join(outDir, 'colors_live.aep'), R });
      // «Вписать в окно»: Premiere only, stills of a known colour into the windows of WEB_Screen (example source).
      if (HOST === 'pr') {
        const clips = {};
        for (const [key, hex] of [['screen', '26D07C'], ['speaker', 'A068FF']]) {
          clips[key] = path.posix.join(outDir, `fit-${key}.png`);
          if (!existsSync(clips[key])) spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=0x${hex}:s=1920x1080`, '-frames:v', '1', clips[key]]);
        }
        const example = JSON.parse(readFileSync(path.join(REPO, 'docs', 'library', 'example.src.json'), 'utf8'));
        await runFitLive({
          bridge, hostRun, R, clips,
          item: example.items.find((i) => i.id === 'WEB_Screen'),
          frame: async (id, frame, key) => {
            const r = await hostRun('frames', { id, frames: [{ key, frame }] });
            const file = r?.data?.frames?.[key] ?? null;
            if (file) await waitForStableFiles([file], { timeoutMs: 120000 });
            return file;
          },
          colorBox: (file, hex) => findColorCentroid(file, hex, 16).box,
        });
      }
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
