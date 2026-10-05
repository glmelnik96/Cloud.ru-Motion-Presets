// Live checks of T2/T3 inserts and T1 companions (spec 6.1, 8.3) on the synthetic pack of
// tools/panel/media-fixtures.mjs: the same code as the panel — planItem, the Node file preparation, runMedia
// and runInsert through the Bridge — and a listing of the timeline by the test bed to check what landed.
// The host side is injected, so tests/panel/media-live.test.mjs runs this flow on the vm fakes.
import { planItem, runInsert, runMedia } from '../../panel/src/core/insert.ts';
import { initialValues } from '../../panel/src/core/fields.ts';
import { CUT_WINDOW_SEC } from '../../panel/src/core/media.ts';
import { BIN_NAME, dirname, joinPath, libraryFile } from '../../panel/src/core/paths.ts';

const near = (a, b, eps = 0.021) => Math.abs(Number(a) - Number(b)) <= eps;
const brief = (out) => ({ ok: out.ok, problems: out.problems.map((p) => p.code + ': ' + p.message), reply: out.reply });

// One comp or sequence per case, 1920x1080 25p; `time` is the playhead, `range` the end of the work area or
// out point, `edges` the clips the test bed puts on V1 so a transition has cuts (Premiere).
export const MEDIA_CASES = [
  { key: 'loop', id: 'BG_Arrows', time: 2, range: 20, expect: { lengthSec: 18, backdrop: true, loops: 2 } },
  { key: 'reuse', id: 'BG_Arrows', target: 'loop', time: 30, options: { lengthSec: 12, backdrop: false }, expect: { lengthSec: 12, backdrop: false, imported: 0 } },
  { key: 'transition', id: 'TRN_StepWipe', time: 12, edges: [0, 10, 20], expect: { startPr: 9.52, startAe: 11.52 } },
  { key: 'still', id: 'BG_DotGrid', time: 2, options: { lengthSec: 8, backdrop: false }, expect: { lengthSec: 8 } },
  { key: 'sound', id: 'SFX_WhooshIn', time: 5, expect: { lengthSec: 0.8 } },
  { key: 'companions', id: 'TTL_LowerThird', time: 2, sound: { music: false, sfx: true }, expect: { companions: ['intro', 'loop', 'outro', 'sound'], soundStart: 7.2 } },
];

export async function runMediaLive(o) {
  const { host, bridge, hostRun, catalog, R, prepare, fileExists } = o;
  const env = { platform: o.platform, libraryRoot: o.libraryRoot };
  const byId = new Map(catalog.items.map((i) => [i.id, i]));
  const lookup = (id) => byId.get(id);

  const ping = await bridge.call('ping');
  R.check('bridge: the host bundle answers', ping.ok && ping.data?.bk === o.bkVersion, ping);
  if (!ping.ok) return;
  R.hostVersion = ping.data.version;

  const targets = MEDIA_CASES.filter((c) => !c.target).map((c) => ({ key: c.key, name: `BK media ${c.key}`, w: 1920, h: 1080, fps: 25, dur: 60 }));
  const ids = R.fromHost('setup', await hostRun('setup', { targets }))?.ids;
  if (!ids) return;
  const listing = async (step, id) => R.fromHost(step, await hostRun('timeline', { id })) ?? {};

  for (const c of MEDIA_CASES) {
    const item = byId.get(c.id);
    const id = ids[c.target ?? c.key];
    if (!R.check(`${c.key}: ${c.id} is in the catalog`, Boolean(item), c.id)) continue;
    if (c.range) R.fromHost(`${c.key}: range`, await hostRun('range', { id, endSec: c.range }));
    if (c.edges && host === 'pr') {
      // A copy in the scratch folder, not the library file: Premiere keeps an imported file open, and the
      // library is rebuilt in place on the next run (EBUSY, 2026-10-05).
      const still = byId.get('BG_DotGrid').variants.find((v) => v.file?.endsWith('.png'));
      const cutFile = joinPath(o.scratchDir, 'cut-clip.png');
      await prepare({ copies: [{ from: libraryFile(o.libraryRoot, still.file), to: cutFile }], solids: [] });
      R.fromHost(`${c.key}: cuts on V1`, await hostRun('cuts', { id, edges: c.edges, file: cutFile }));
    }
    R.fromHost(`${c.key}: activate`, await hostRun('activate', { id, time: c.time }));
    const ctx = (await bridge.call('getContext')).data;
    if (c.range) R.check(`${c.key}: getContext reports the end of the range, ${c.range} s`, near(ctx?.target?.rangeEndSec, c.range), ctx?.target);

    let cuts = null;
    if (host === 'pr' && item.cutFrame !== undefined) {
      const r = await bridge.call('getCuts', { targetId: ctx.target.id, aroundSec: ctx.target.timeSec, windowSec: CUT_WINDOW_SEC });
      cuts = r.ok ? r.data.cuts : [];
      R.check(`${c.key}: getCuts finds the edges of the clips on V1 near the playhead`, near(cuts.find((x) => near(x, 10)) ?? -1, 10), r);
    }
    const values = item.tier === 'T1' ? initialValues(item) : {};
    const plan = planItem({ item, ctx, values, fonts: null, options: { acceptNearest: false, sound: c.sound ?? { music: false, sfx: false }, cuts, ...c.options }, env, lookup });
    if (!R.check(`${c.key}: planned without errors`, plan.ok, plan.problems)) continue;
    const req = plan.media ?? plan.request;

    // The panel copies the files next to the project before the host call.
    try {
      const done = await prepare(req.prepare);
      R.check(`${c.key}: files copied next to the project (${done.copied.length} copied, ${done.reused.length} reused, ${done.written.length} written)`,
        [...req.prepare.copies.map((x) => x.to), ...req.prepare.solids.map((x) => x.path)].every(fileExists), done);
    } catch (e) {
      R.check(`${c.key}: files copied next to the project`, false, String(e));
      continue;
    }
    const projectDir = dirname(ctx.project.path);
    const out = plan.media ? await runMedia(bridge, host, plan.media) : await runInsert(bridge, host, plan.request);
    if (!R.check(`${c.key}: inserted, every piece where the plan put it`, out.ok, brief(out))) continue;

    const t = await listing(`${c.key}: timeline`, id);
    const rows = host === 'ae' ? t.layers ?? [] : t.clips ?? [];
    const placed = plan.media ? out.reply.placed : out.reply.companions ?? [];
    for (const p of placed) {
      const hit = rows.find((x) => x.name === p.name && near(x.startSec, p.startSec) && (host === 'ae' || (x.track === p.track && x.audio === Boolean(p.audio))));
      R.check(`${c.key}: ${p.role} on the timeline as reported (${p.startSec} s${p.track ? `, ${p.audio ? 'A' : 'V'}${p.track}` : ''})`, hit, { placed: p, rows });
      if (hit && p.role !== 'backdrop' && host === 'ae') {
        R.check(`${c.key}: ${p.role} ends where reported`, near(hit.endSec, p.startSec + p.lengthSec), { hit, p });
      }
      if (hit && hit.file) {
        R.check(`${c.key}: ${p.role} plays the copy in «${BIN_NAME}» next to the project`, hit.file.toLowerCase().startsWith(joinPath(projectDir, BIN_NAME).toLowerCase() + '/'), hit.file);
      }
    }
    await checkCase({ ...c, targetId: id }, { host, plan, out, rows, t, R, o });
    const first = plan.media ? (plan.media.layout.video[0] ?? plan.media.layout.audio[0]) : null;
    if (first) {
      const probe = await bridge.call('probeInsert', { targetId: ctx.target.id, startSec: out.reply.placed[0].startSec, aeComp: null, file: first.file });
      R.check(`${c.key}: probeInsert finds the file after the fact (what a timeout would read)`, probe.ok && probe.data?.found, probe);
    }
  }
  R.fromHost('save', await hostRun('save', {}));
}

// What each case adds to the generic checks.
async function checkCase(c, { host, plan, out, rows, t, R, o }) {
  const e = c.expect;
  if (e.lengthSec !== undefined) R.check(`${c.key}: length ${e.lengthSec} s`, near(out.reply.lengthSec, e.lengthSec), out.reply);
  if (e.backdrop !== undefined) {
    const b = out.reply.placed.find((p) => p.role === 'backdrop');
    R.check(`${c.key}: backdrop #222222 ${e.backdrop ? 'under the loop' : 'left out'}`, Boolean(b) === e.backdrop, out.reply.placed);
    if (b && host === 'ae') {
      const solid = rows.find((x) => x.name === b.name);
      const loopRow = rows.find((x) => x.name === out.reply.placed[0].name);
      R.check(`${c.key}: the solid is #222222 and lies under the loop layers`, solid && String(solid.solid) === '34,34,34' && solid.index > loopRow.index, { solid, loopRow });
    }
    if (b && host === 'pr') {
      const v = out.reply.placed.find((p) => p.role === 'loop');
      R.check(`${c.key}: the backdrop still is on the track right under the loop`, b.track < v.track, out.reply.placed);
    }
  }
  if (e.backdrop && o.backdropPixel) {
    // The colour of the backdrop as the host renders it, not as a screenshot shows it: a corner of the frame
    // at 10 s, where only the backdrop is (the box runs through the middle).
    const px = await o.backdropPixel({ id: c.targetId, sec: 10 });
    R.check(`${c.key}: the rendered backdrop is #222222 (34, 34, 34 ± 2) where nothing covers it`, px && px.slice(0, 3).every((v) => Math.abs(v - 34) <= 2), px);
  }
  if (e.loops !== undefined) {
    const loop = out.reply.placed.find((p) => p.role === 'loop');
    if (host === 'ae') {
      const row = rows.find((x) => x.name === loop.name);
      R.check(`${c.key}: Interpret Footage > Loop ${e.loops}×`, row && row.loop >= e.loops, row);
    } else {
      R.check(`${c.key}: the loop repeats as ${e.loops} clips end to end`, loop.clips === e.loops && rows.filter((x) => x.name === loop.name && !x.audio).length >= e.loops, { loop, rows });
    }
  }
  if (e.imported !== undefined) R.check(`${c.key}: nothing imported twice into «Cloud.ru BrandKit»`, out.reply.imported === e.imported, { imported: out.reply.imported, bin: t.binItems ?? t.binFootage });
  if (e.startPr !== undefined) {
    const want = host === 'pr' ? e.startPr : e.startAe;
    R.check(`${c.key}: the marker of full cover (frame ${plan.media ? 12 : '?'}) on the ${host === 'pr' ? 'nearest cut' : 'current time'}: starts at ${want} s`, near(out.reply.placed[0].startSec, want), out.reply.placed);
  }
  if (e.companions) {
    const cs = out.reply.companions ?? [];
    R.check(`${c.key}: companions placed: ${e.companions.join(', ')}`, cs.map((x) => x.role).join(',') === e.companions.join(','), cs);
    const sound = cs.find((x) => x.role === 'sound');
    R.check(`${c.key}: the whoosh ends with the template (placement out): starts at ${e.soundStart} s`, sound && near(sound.startSec, e.soundStart), sound);
    if (host === 'pr') {
      const video = cs.find((x) => x.role === 'loop');
      R.check(`${c.key}: the background runs on a track under the MOGRT`, video && video.track < out.reply.track, { mogrt: out.reply.track, video });
    } else {
      const tpl = rows.find((x) => x.name === out.reply.name);
      const under = cs.filter((x) => !x.audio && x.role !== 'sound').map((x) => rows.find((r) => r.name === x.name && near(r.startSec, x.startSec)));
      R.check(`${c.key}: the background layers lie right under the template layer`, tpl && under.every((r) => r && r.index > tpl.index), { tpl, under });
    }
  }
}
