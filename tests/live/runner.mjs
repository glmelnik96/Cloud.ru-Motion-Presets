// Live checks of the panel core, bridge and adapters in a real After Effects or Premiere (spec 8.3
// «Живые сквозные прогоны»). Everything the panel will do goes through the same code: planInsert and
// runInsert of the core, the Bridge over evalScript, the host bundle loaded with $.evalFile. The test bed
// around it (scratch project, comps or sequences, frames, listings) runs as separate JSX steps.
// The host side is injected, so tests/panel/live-runner.test.mjs runs this flow on the vm fakes.
import path from 'node:path';
import { initialValues } from '../../panel/src/core/fields.ts';
import { planInsert, runInsert } from '../../panel/src/core/insert.ts';
import { EXTRA_SEC, EXTRA_TARGETS, framePlan, probeTimes, sampleValues, variantCases } from './plan.mjs';

export class Report {
  constructor(host, log = () => {}) {
    this.host = host;
    this.log = log;
    this.startedAt = new Date().toISOString();
    this.checks = [];
  }

  check(name, pass, detail = null, required = true) {
    const c = { name, pass: Boolean(pass), required, detail };
    this.checks.push(c);
    this.log(`${c.pass ? 'ok  ' : required ? 'FAIL' : 'info'} ${name}${c.pass ? '' : ' -> ' + JSON.stringify(detail).slice(0, 300)}`);
    return c.pass;
  }

  // Checks a JSX step recorded itself ({ checks, data } from spikes/lib/check.jsx).
  fromHost(step, reply) {
    for (const c of reply?.checks ?? []) this.check(`${step}: ${c.name}`, c.pass, c.detail, c.required !== false);
    return reply?.data ?? null;
  }

  failed() {
    return this.checks.filter((c) => c.required && !c.pass).map((c) => c.name);
  }

  toJSON() {
    const failed = this.failed();
    return {
      host: this.host,
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      summary: { checks: this.checks.length, passed: this.checks.filter((c) => c.pass).length, failed: failed.length },
      failed,
      checks: this.checks,
    };
  }
}

const labelsOf = (item) => Object.fromEntries((item.fields ?? []).map((f) => [f.key, f.label_ru]));
const near = (a, b, eps = 0.002) => Math.abs(Number(a) - Number(b)) <= eps;
const brief = (r) => (r.out ? { ok: r.out.ok, problems: r.out.problems.map((p) => p.code + ': ' + p.message), reply: r.out.reply } : { plan: r.plan.problems.map((p) => p.code + ': ' + p.message) });

function sameValue(a, b) {
  if (typeof b === 'number' || typeof b === 'boolean') return near(Number(a), Number(b), 1e-6);
  return String(a ?? '').replace(/\r\n?|\n/g, '\r') === String(b ?? '').replace(/\r\n?|\n/g, '\r');
}

export async function runLive(o) {
  const { host, bridge, hostRun, coldStart, catalog, R } = o;
  const byId = new Map(catalog.items.map((i) => [i.id, i]));
  const env = { platform: o.platform, libraryRoot: o.libraryRoot };

  // ---- Bridge: cold start, then the bundle version ----
  await coldStart();
  const ping = await bridge.call('ping');
  R.check('cold start: the bridge loads the host bundle with $.evalFile and pings', ping.ok && ping.data?.bk === o.bkVersion, ping);
  if (!ping.ok) return;
  R.hostVersion = ping.data.version;

  const cases = variantCases(catalog, host);
  const targets = [...cases, ...EXTRA_TARGETS].map((t) => ({ key: t.key, name: t.name, w: t.w, h: t.h, fps: t.fps, dur: 120 }));
  const setup = R.fromHost('setup', await hostRun('setup', { targets }));
  const ids = setup?.ids;
  if (!ids) return;

  // ---- Fonts ----
  const names = [...new Set(catalog.items.flatMap((i) => (i.requiredFonts ?? []).map((f) => f.postScriptName)))];
  const fonts = await o.fonts(names);
  R.check('fonts: every brand font is installed', names.every((n) => fonts[n]?.found), fonts);

  const activate = async (key, time) => R.fromHost(`activate ${key} at ${time} s`, await hostRun('activate', { id: ids[key], time }));

  async function insertAt(key, time, item, values, options = {}) {
    await activate(key, time);
    const cx = await bridge.call('getContext');
    if (!cx.ok) return { plan: { problems: [{ code: 'CONTEXT', message: JSON.stringify(cx.error) }] }, out: null };
    const plan = planInsert({ item, ctx: cx.data, values, fonts, options, env });
    if (!plan.ok) return { plan, out: null, ctx: cx.data };
    const out = await runInsert(bridge, host, plan.request, labelsOf(item));
    return { plan, out, ctx: cx.data };
  }

  // ---- Every variant: A at the template length, B four seconds longer, same values ----
  for (const c of cases) {
    const item = byId.get(c.id);
    const values = sampleValues(item);
    const { D } = probeTimes(item, c.fps);
    const A = await insertAt(c.key, 2, item, values, { lengthSec: D });
    const B = await insertAt(c.key, 20, item, values, { lengthSec: D + EXTRA_SEC });
    R.check(`${c.key}: A inserted at 2 s, ${D} s long`, A.out?.ok && near(A.out.reply.startSec, 2) && near(A.out.reply.lengthSec, D), brief(A));
    R.check(`${c.key}: B inserted at 20 s, ${D + EXTRA_SEC} s long`, B.out?.ok && near(B.out.reply.startSec, 20) && near(B.out.reply.lengthSec, D + EXTRA_SEC), brief(B));
    if (!A.out?.ok || !B.out?.ok) continue;
    R.check(`${c.key}: variant ${c.variant} chosen for ${c.w}x${c.h}`, A.plan.pick.variant.key === c.variant && A.plan.pick.reason === 'exact', A.plan.pick);

    const fields = A.plan.request.writes.filter((w) => w.type !== 'media').map((w) => ({ egpName: w.egpName, type: w.type }));
    for (const [tag, r, start] of [['A', A, 2], ['B', B, 20]]) {
      const args = host === 'ae' ? { layerId: r.out.reply.layerId, fields } : { targetId: ids[c.key], startSec: start, fields };
      const back = await bridge.call('readFields', args);
      const bad = back.ok ? r.plan.request.writes.filter((w) => w.type !== 'media' && !sameValue(back.data.values[w.egpName], w.value)).map((w) => w.egpName) : ['(no reply)'];
      R.check(`${c.key}: ${tag} fields read back in a new call`, back.ok && bad.length === 0, { bad, back: back.data ?? back.error });
    }
    const probe = await bridge.call('probeInsert', { targetId: ids[c.key], startSec: 20, aeComp: B.plan.request.variant.aeComp, file: B.plan.request.variant.file });
    R.check(`${c.key}: probeInsert finds B`, probe.ok && probe.data?.found, probe.data ?? probe.error);
    await o.inspectCase({ c, item, A, B, D, ids, R, hostRun });

    if (o.frames) {
      const fp = framePlan(item, c.fps, 2, 20);
      const shots = fp.frames.map((f) => ({ ...f, file: path.posix.join(o.framesDir, `${c.key}_${f.key}.png`), name: `${c.key}_${f.key}` }));
      await o.renderFrames({ key: c.key, id: ids[c.key], fps: c.fps, shots, R, hostRun });
      for (const [a, b] of fp.pairs) {
        const fa = shots.find((s) => s.key === a);
        const fb = shots.find((s) => s.key === b);
        try {
          const ssim = await o.compare(fa.file, fb.file);
          R.check(`${c.key}: frame ${a} = ${b} (intro and outro keep their speed)`, ssim >= o.ssimMin, { ssim, a: fa.file, b: fb.file });
        } catch (e) {
          R.check(`${c.key}: frame ${a} = ${b} (intro and outro keep their speed)`, false, String(e));
        }
      }
    }
  }

  // ---- The nearest variant, scaled into a 2560x1440 frame ----
  const big = catalog.items.find((i) => i.tier === 'T1' && i.hosts.includes(host) && i.variants.some((v) => v.w === 3840 && v.h === 2160));
  if (big) {
    const asked = await insertAt('nearest', 2, big, initialValues(big));
    R.check('nearest: 2560x1440 without consent is refused before the host is called', !asked.out && asked.plan.problems.some((p) => p.code === 'NO_VARIANT'), asked.plan.problems);
    const r = await insertAt('nearest', 2, big, initialValues(big), { acceptNearest: true });
    R.check('nearest: with consent the 4K variant goes in', r.out?.ok && r.plan.pick.variant.w === 3840, brief(r));
    if (r.out?.ok) await o.inspectScale({ key: 'nearest', id: ids.nearest, r, R, hostRun, expect: (2560 / 3840) * 100 });
  }

  const first = byId.get(cases[0]?.id);
  if (first) {
    // ---- Never act on another comp or sequence than the one the plan was made for ----
    await activate('other', 2);
    const cx = await bridge.call('getContext');
    const plan = planInsert({ item: first, ctx: cx.data, values: initialValues(first), fonts, env });
    await activate('undo', 2);
    const before = await o.count({ key: 'undo', id: ids.undo, hostRun, R });
    const wrong = plan.ok ? await runInsert(bridge, host, plan.request, labelsOf(first)) : null;
    const after = await o.count({ key: 'undo', id: ids.undo, hostRun, R });
    R.check('target: an insert planned for another comp or sequence is refused, nothing added', wrong && !wrong.ok && wrong.problems[0]?.code === 'NO_TARGET' && after === before, { problems: wrong?.problems, before, after });

    // ---- One undo step per click: Premiere only. In AE a scripted Edit > Undo (executeCommand 16) from inside
    // a script call undid nothing and raised «Undo group mismatch» (live run 2026-10-05); there Ctrl+Z after
    // a panel insert is checked by hand (handoff, part B). ----
    if (host === 'pr') {
      const ins = await insertAt('undo', 2, first, initialValues(first));
      const mid = await o.count({ key: 'undo', id: ids.undo, hostRun, R });
      R.fromHost('undo', await hostRun('undo', {}));
      const end = await o.count({ key: 'undo', id: ids.undo, hostRun, R });
      R.check('undo: one undo step removes the insert with its field writes', ins.out?.ok && mid === before + 1 && end === before, { before, mid, end }, false);
    }

    // ---- Premiere: tracks over the placed length, a new track when all are taken ----
    if (host === 'pr') {
      const tr = [];
      for (const t of [40, 41, 42]) tr.push(await insertAt('tracks', t, first, initialValues(first)));
      const got = tr.map((r) => (r.out?.ok ? { track: r.out.reply.track, added: r.out.reply.addedTracks } : brief(r)));
      R.check('tracks: overlapping inserts go to V2, V3, then a new V4 through QE', got.map((g) => g.track).join() === '2,3,4' && got[2].added === 1, got);
    }
  }

  R.fromHost('save', await hostRun('save', {}));
}
