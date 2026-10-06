// Opens a project made elsewhere — on the other OS, or a copy moved by hand — and lists every file it misses
// (spec 3, phase 3: «проект со вставками … открывается на другой ОС без пропавших файлов»).
//   node tools/panel/live.mjs --host ae --open <project.aep>      (or --host pr --open <project.prproj>)
// The project folder must hold what the panel put next to the project («Cloud.ru BrandKit», and in Premiere
// «Motion Graphics Template Media»). Report: docs/research/panel-live/<host>-open-<win|mac>-report.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from '../../tools/host-run.mjs';
import { workPath } from '../../tools/lib/work.mjs';
import { composeProbe, REPO } from '../../tools/spike/runner.mjs';
import { Report } from './runner.mjs';
import { transferVerdict } from './transfer.mjs';

const HOST = process.env.BRANDKIT_LIVE_HOST;
const OPEN = process.env.BRANDKIT_LIVE_OPEN;

describe.skipIf(!OPEN || (HOST !== 'ae' && HOST !== 'pr'))('panel live, open a moved project', () => {
  it(`opens ${OPEN} in ${HOST}`, async () => {
    const os = process.platform === 'win32' ? 'win' : 'mac';
    const R = new Report(HOST, (line) => console.log(line));
    const project = OPEN.replace(/\\/g, '/');
    const reportFile = path.join(REPO, 'docs', 'research', 'panel-live', `${HOST}-open-${os}-report.json`);
    let listing = null;
    try {
      const libs = HOST === 'ae' ? ['spikes/lib/ae-project.jsx', 'tests/live/jsx/ae-live.jsx'] : ['spikes/lib/pr-helpers.jsx', 'tests/live/jsx/pr-live.jsx'];
      const r = await run(HOST, composeProbe(libs, { workDir: workPath(), project, op: 'transferOpen' }), { timeoutMs: 600000 });
      listing = R.fromHost('open', r);
      const v = transferVerdict(listing?.items ?? [], path.posix.dirname(project));
      R.check(`no missing files (${v.count} listed)`, listing && v.count > 0 && v.missing.length === 0, v.missing);
      R.check(`every file the panel put next to the project found inside its folder (${v.ours})`, listing && v.ours > 0 && v.outside.length === 0, v.outside);
    } catch (e) {
      R.check('opened without an exception', false, String(e && e.stack ? e.stack : e));
    } finally {
      mkdirSync(path.dirname(reportFile), { recursive: true });
      writeFileSync(reportFile, JSON.stringify({ ...R.toJSON(), os, project, items: listing?.items ?? null }, null, 2) + '\n', 'utf8');
      console.log(`report ${reportFile}: ${R.toJSON().summary.passed}/${R.checks.length} passed`);
    }
    expect(R.failed()).toEqual([]);
  }, 900000);
});
