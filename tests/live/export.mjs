// Live checks of the «Экспорт» tab (decisions P18–P23) in After Effects or Premiere: planExport and runExport
// through the Bridge on a scratch project, the files checked with ffprobe against the canon of the brand
// presets (tools/library/export-pack.mjs). tests/panel/export-live.test.mjs runs it dry on the fakes.
//   AE       — the Render Queue with the «CR …» templates (loaded by hand from the brand .aom), Resize and the
//              preset frame rate, the work area; aerender in the background while AE stays open; a missing
//              template gives the instruction.
//   Premiere — the .epr straight out and through the AME queue, In to Out and the whole sequence.
import { aomFile, exportPresets, planExport, runExport } from '../../panel/src/core/export.ts';
import { EXPORT_CANON } from '../../tools/library/export-pack.mjs';

// Comps or sequences of the scratch project: the frames the presets are for, and an AE comp at 30 fps.
export const EXPORT_TARGETS = {
  ae: [
    { key: 'fhd', name: 'BK export FHD', w: 1920, h: 1080, fps: 25, dur: 10 },
    { key: 'fhd30', name: 'BK export FHD30', w: 1920, h: 1080, fps: 30, dur: 10 },
    { key: 'uhd', name: 'BK export 4K', w: 3840, h: 2160, fps: 25, dur: 10 },
    { key: 'sq', name: 'BK export 1x1', w: 1080, h: 1080, fps: 25, dur: 10 },
    { key: 'vert', name: 'BK export 9x16', w: 1080, h: 1920, fps: 25, dur: 10 },
  ],
  pr: [
    { key: 'fhd', name: 'BK export FHD', w: 1920, h: 1080, fps: 25 },
    { key: 'whole', name: 'BK export whole', w: 1920, h: 1080, fps: 25 },
    { key: 'uhd', name: 'BK export 4K', w: 3840, h: 2160, fps: 25 },
    { key: 'vert', name: 'BK export 9x16', w: 1080, h: 1920, fps: 25 },
  ],
};

// The range each target exports: AE work area 1–3 s, Premiere In/Out 0–2 s; «whole» has no marks and a 3 s clip.
export const RANGE = { ae: { startSec: 1, durSec: 2 }, pr: { inSec: 0, outSec: 2 }, wholeSec: 3 };

export const EXPORT_CASES = {
  ae: [
    { key: 'fullhd', target: 'fhd', preset: 'AME_FullHD', mode: 'render', expect: { durSec: 2, warn: [] } },
    { key: 'timer', target: 'fhd', preset: 'AME_WebinarTimer', mode: 'render', expect: { durSec: 2, warn: [] } },
    { key: 'again', target: 'fhd', preset: 'AME_FullHD', mode: 'render', expect: { durSec: 2, warn: [], suffix: '_2' } },
    { key: 'uhd', target: 'uhd', preset: 'AME_4K', mode: 'render', expect: { durSec: 2, warn: [] } },
    { key: 'down', target: 'uhd', preset: 'AME_FullHD', mode: 'render', expect: { durSec: 2, warn: [], resize: true } },
    { key: 'fps30', target: 'fhd30', preset: 'AME_FullHD', mode: 'render', expect: { durSec: 2, warn: ['EXPORT_FPS'] } },
    { key: 'square', target: 'sq', preset: 'AME_SMM_1x1', mode: 'render', expect: { durSec: 2, warn: [] } },
    { key: 'vertical', target: 'vert', preset: 'AME_SMM_9x16', mode: 'render', expect: { durSec: 2, warn: [] } },
    { key: 'aspect', target: 'fhd', preset: 'AME_SMM_9x16', mode: 'render', expect: { refused: 'EXPORT_ASPECT' } },
    { key: 'missing', target: 'fhd', preset: 'AME_FullHD', omTemplate: 'CR Missing', mode: 'render', expect: { refused: 'EXPORT_NO_TEMPLATE' } },
    { key: 'background', target: 'fhd', preset: 'AME_WebinarIntro', mode: 'background', expect: { durSec: 2, warn: [] } },
  ],
  pr: [
    { key: 'fullhd', target: 'fhd', preset: 'AME_FullHD', mode: 'direct', expect: { durSec: 2, warn: [] } },
    { key: 'again', target: 'fhd', preset: 'AME_FullHD', mode: 'direct', expect: { durSec: 2, warn: [], suffix: '_2' } },
    { key: 'smm', target: 'fhd', preset: 'AME_SMM_16x9', mode: 'direct', expect: { durSec: 2, warn: [] } },
    { key: 'queue', target: 'fhd', preset: 'AME_WebinarFinal', mode: 'queue', expect: { durSec: 2, warn: [] } },
    { key: 'whole', target: 'whole', preset: 'AME_WebinarTimer', mode: 'direct', expect: { durSec: RANGE.wholeSec, warn: [] } },
    { key: 'uhd', target: 'uhd', preset: 'AME_4K', mode: 'direct', expect: { durSec: 2, warn: [] } },
    { key: 'down', target: 'uhd', preset: 'AME_FullHD', mode: 'direct', expect: { durSec: 2, warn: [] } },
    { key: 'up', target: 'fhd', preset: 'AME_4K', mode: 'direct', expect: { durSec: 2, warn: ['EXPORT_UPSCALE'] } },
    { key: 'vertical', target: 'vert', preset: 'AME_SMM_9x16', mode: 'direct', expect: { durSec: 2, warn: [] } },
    { key: 'aspect', target: 'fhd', preset: 'AME_SMM_9x16', mode: 'direct', expect: { refused: 'EXPORT_ASPECT' } },
  ],
};

const canon = (id) => EXPORT_CANON.find((c) => c.id === id);
const near = (a, b, eps) => a !== null && a !== undefined && Math.abs(Number(a) - Number(b)) <= eps;

// What ffprobe must see in a file of a preset: its frame, 25 fps, High at its level, AAC 48 kHz stereo.
export function fileChecks(presetId, s, durSec) {
  const c = canon(presetId);
  const v = s?.video ?? {};
  const a = s?.audio ?? {};
  return [
    [`frame ${c.w}x${c.h}`, v.width === c.w && v.height === c.h],
    ['25 fps', near(v.fps, 25, 0.01)],
    [`H.264 High, level ${c.level / 10}`, v.codec === 'h264' && v.profile === 'High' && v.level === c.level],
    ['AAC 48 kHz stereo', a.codec === 'aac' && a.sampleRate === 48000 && a.channels === 2],
    [`${durSec} s long`, near(s?.duration, durSec, 0.1)],
  ];
}

export async function runExportLive(o) {
  const { host, bridge, hostRun, catalog, R } = o;
  const presets = exportPresets(catalog, host, o.libraryRoot);
  R.check(`export: the catalog has the ${EXPORT_CANON.length} presets for ${host}`, presets.length === EXPORT_CANON.length, presets.map((p) => p.id));
  const aom = aomFile(catalog, o.libraryRoot);
  const setup = R.fromHost('export: setup', await hostRun('exportSetup', { project: o.project, targets: EXPORT_TARGETS[host], clip: o.clip, range: RANGE }));
  const ids = setup?.ids;
  if (!ids) return;
  if (host === 'ae') {
    const t = R.fromHost('export: templates', await hostRun('templates', {}));
    const missing = EXPORT_CANON.map((c) => c.omTemplate).filter((n) => !(t?.names ?? []).includes(n));
    if (!R.check('export: every «CR …» template is loaded in AE (Edit → Templates → Output Module → Load)', !missing.length, { missing, aom })) return;
    R.fromHost('export: a queued item of the user', await hostRun('queueUser', { id: ids.fhd }));
  }

  for (const c of EXPORT_CASES[host]) {
    const name = `export ${c.key} (${c.preset}, ${c.mode})`;
    R.fromHost(`${name}: activate`, await hostRun('activate', { id: ids[c.target], time: 0 }));
    const cx = await bridge.call('getContext');
    if (!R.check(`${name}: context`, cx.ok && cx.data?.target, cx.error)) continue;
    let preset = presets.find((p) => p.id === c.preset);
    if (c.omTemplate) preset = { ...preset, omTemplate: c.omTemplate };
    const plan = planExport({ ctx: cx.data, preset, mode: c.mode, documents: o.documents, exists: o.exists });
    if (c.expect.refused === 'EXPORT_ASPECT') {
      R.check(`${name}: refused before the host (another proportion)`, !plan.ok && plan.problems.some((p) => p.code === 'EXPORT_ASPECT'), plan.problems);
      continue;
    }
    if (!R.check(`${name}: planned`, plan.ok, plan.problems)) continue;
    const warn = c.expect.warn ?? [];
    R.check(`${name}: warnings ${warn.join(', ') || 'none'}`, plan.problems.map((p) => p.code).join() === warn.join(), plan.problems);
    if (c.expect.suffix) R.check(`${name}: the next file gets ${c.expect.suffix}`, plan.request.output.endsWith(`${c.expect.suffix}.mp4`), plan.request.output);
    if (c.expect.resize) R.check(`${name}: Resize to the preset frame`, plan.request.resize?.w === canon(c.preset).w, plan.request.resize);
    const rqBefore = host === 'ae' ? R.fromHost(`${name}: queue before`, await hostRun('rq', {})) : null;
    o.mkdirp(plan.request.output.slice(0, plan.request.output.lastIndexOf('/')));
    const t0 = Date.now();
    const out = await runExport(bridge, plan.request, aom);
    if (c.expect.refused) {
      R.check(`${name}: refused (${c.expect.refused}) with the instruction`, !out.ok && out.problems[0]?.code === c.expect.refused && (!aom || out.problems[0].message.includes(aom)), out.problems);
      const rq = R.fromHost(`${name}: queue after`, await hostRun('rq', {}));
      R.check(`${name}: the render queue is as it was`, JSON.stringify(rq?.items) === JSON.stringify(rqBefore?.items), { before: rqBefore, after: rq });
      continue;
    }
    if (!R.check(`${name}: exported`, out.ok, { problems: out.problems, reply: out.reply })) continue;
    const file = out.reply.file;
    R.check(`${name}: the file is where the plan put it`, file.toLowerCase() === plan.request.output.toLowerCase(), { file, planned: plan.request.output });
    if (c.mode === 'queue') {
      R.check(`${name}: the host returned at once (${Date.now() - t0} ms), the job in AME`, out.reply.queued === true && Date.now() - t0 < 30000, out.reply);
    }
    if (c.mode === 'background') {
      R.check(`${name}: aerender gets the saved project and the queue item`, !!out.reply.aerender?.exe && out.reply.aerender.rqIndex > 0, out.reply.aerender);
      const rq = R.fromHost(`${name}: queue of the open project`, await hostRun('rq', {}));
      R.check(`${name}: the item left the queue of the open project; the user's item is still queued`, JSON.stringify(rq?.items) === JSON.stringify(rqBefore?.items), { before: rqBefore, after: rq });
      const r = await o.aerender(out.reply.aerender);
      R.check(`${name}: aerender finished while AE is open`, r.ok, r);
    }
    if (c.mode === 'queue' || c.mode === 'background') {
      if (!R.check(`${name}: the file appeared`, await o.waitFile(file), file)) continue;
    }
    if (host === 'ae' && c.mode === 'render') {
      const rq = R.fromHost(`${name}: queue after`, await hostRun('rq', {}));
      R.check(`${name}: the render queue is as it was, the user's item still queued`, JSON.stringify(rq?.items) === JSON.stringify(rqBefore?.items), { before: rqBefore, after: rq });
    }
    const s = o.probe(file);
    for (const [what, pass] of fileChecks(c.preset, s, c.expect.durSec)) R.check(`${name}: ${what}`, pass, s);
  }
}
