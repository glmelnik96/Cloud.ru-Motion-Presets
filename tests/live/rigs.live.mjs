// Live run of «Движения» alone in After Effects on the build PC (the media run has the same check):
//   node tools/panel/live.mjs --host ae --rigs
// Needs the BrandKit Dev panel open in AE (CDP 8094). The bundle is composed from the current sources; the scratch
// project goes to <work>/panel-live/ae/rigs_live.aep. Report: docs/research/panel-live/ae-rigs-report.json.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { composeHost } from '../../panel/host/compose.mjs';
import { Bridge, evalFileScript } from '../../panel/src/bridge/bridge.ts';
import { run } from '../../tools/host-run.mjs';
import { cdpEval, getPageTarget } from '../../tools/lib/cdp.mjs';
import { buildPayload, hostPorts } from '../../tools/lib/payload.mjs';
import { workPath } from '../../tools/lib/work.mjs';
import { composeProbe, REPO } from '../../tools/spike/runner.mjs';
import { runRigsLive } from './rigs.mjs';
import { Report } from './runner.mjs';

const HOST = process.env.BRANDKIT_LIVE_HOST;
const RIGS = process.env.BRANDKIT_LIVE_RIGS === '1';

describe.skipIf(!RIGS || HOST !== 'ae')('panel live, «Движения»', () => {
  it('the movements M1–M12 in ae', async () => {
    const R = new Report(HOST, (line) => console.log(line));
    const outDir = workPath('panel-live', HOST);
    mkdirSync(outDir, { recursive: true });
    const reportFile = path.join(REPO, 'docs', 'research', 'panel-live', `${HOST}-rigs-report.json`);
    try {
      const bundleFile = path.posix.join(outDir, 'brandkit.jsx');
      writeFileSync(bundleFile, composeHost(), 'ascii');
      const page = await getPageTarget(hostPorts(HOST));
      const evalScript = (script) => cdpEval(page.webSocketDebuggerUrl, buildPayload(script, ''), { timeoutMs: 180000 });
      const bundleVersion = JSON.parse(readFileSync(path.join(REPO, 'panel', 'package.json'), 'utf8')).version;
      const bridge = new Bridge({ evalScript, bundleVersion, loadHost: async () => { await evalScript(evalFileScript(bundleFile)); }, timeoutMs: 120000 });
      await evalScript('BK = undefined; "cold"');
      const hostRun = (op, params) => run(HOST, composeProbe(['spikes/lib/ae-project.jsx', 'tests/live/jsx/ae-live.jsx'], { workDir: workPath(), ...params, op }), { timeoutMs: 600000 });
      await runRigsLive({ bridge, hostRun, R, project: path.posix.join(outDir, 'rigs_live.aep'), framesDir: path.posix.join(outDir, 'rigs-frames'), sheet: path.join(REPO, 'docs', 'research', 'panel-live', 'ae-rigs-sheet.png') });
    } catch (e) {
      R.check('live run finished without an exception', false, String(e && e.stack ? e.stack : e));
    } finally {
      mkdirSync(path.dirname(reportFile), { recursive: true });
      writeFileSync(reportFile, JSON.stringify(R.toJSON(), null, 2) + '\n', 'utf8');
      console.log(`report ${reportFile}: ${R.checks.filter((c) => c.pass).length}/${R.checks.length} passed`);
    }
    expect(R.failed()).toEqual([]);
  });
});
