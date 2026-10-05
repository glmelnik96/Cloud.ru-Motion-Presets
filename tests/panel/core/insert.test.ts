import { describe, it, expect } from 'vitest';
import { planInsert, buildArgs, runInsert } from '../../../panel/src/core/insert';
import { chooseVariant } from '../../../panel/src/core/variant';
import { defaults, toWrites, type Values } from '../../../panel/src/core/fields';
import { c27Keys, defaultLen, minLen, round6, secToTicks } from '../../../panel/src/core/duration';
import { createLogger, type LogEntry } from '../../../panel/src/core/log';
import type {
  AeInsertArgs, HostApi, HostContext, HostReply, InsertPlan, InsertResult, Item, Placed, PlacedProbe, PrInsertArgs,
} from '../../../panel/src/core/types';
import { aeCtx, fontsFor, item, prCtx, variant } from './fixture';

const ROOT = 'C:\\ProgramData\\CloudRuBrandKit\\library\\';

function plan(id: string | Item, ctx: HostContext, over: { lenSec?: number; values?: Values; manual?: string } = {}): InsertPlan {
  const it = typeof id === 'string' ? item(id) : id;
  return planInsert({
    item: it,
    choice: chooseVariant(it, ctx.target, over.manual),
    values: over.values ?? defaults(it),
    lenSec: over.lenSec ?? defaultLen(it),
    ctx,
    fonts: fontsFor(it),
    pluginVersion: '0.1.0',
  });
}

// Answers insertItem and findPlaced with the given replies; an Error rejects the call. The replies are unknown on
// purpose: a broken adapter or bridge may hand back anything.
function fakeHost(insert: unknown, find: unknown = { ok: true, data: null }) {
  const calls = { insertItem: [] as (PrInsertArgs | AeInsertArgs)[], findPlaced: [] as PlacedProbe[] };
  const unused = () => Promise.reject(new Error('not used by runInsert'));
  const host: HostApi = {
    getContext: unused,
    insertItem: async (args) => {
      calls.insertItem.push(args);
      if (insert instanceof Error) throw insert;
      return insert as HostReply<InsertResult>;
    },
    findPlaced: async (probe) => {
      calls.findPlaced.push(probe);
      if (find instanceof Error) throw find;
      return find as HostReply<Placed | null>;
    },
    checkFonts: unused,
    diag: unused,
  };
  return { host, calls };
}

function logger() {
  const entries: LogEntry[] = [];
  return { entries, log: createLogger((e) => entries.push(e), () => new Date('2026-10-05T12:00:00Z')) };
}

// What a correct adapter returns: every field read back as written.
const echo = (p: InsertPlan, placed: Placed): InsertResult => ({
  placed,
  fields: p.fieldWrites.map((w) => ({ egpName: w.egpName, written: w.value, back: w.value, ok: true })),
  warnings: [],
});
const CLIP: Placed = { kind: 'clip', id: '000f4241', name: 'TTL_LowerThird_16x9_v1', track: 2, startSec: 12, endSec: 20 };
const LAYER: Placed = { kind: 'layer', id: '42', name: 'CR_LOGO_Shot_16x9_v1', startSec: 2, endSec: 10 };

describe('planInsert', () => {
  it('plans a Premiere TTL insert: variant by frame, frames, 0-based writes in egpIndex order', () => {
    const ctx = prCtx();
    const ttl = item('TTL_LowerThird');
    const values = { ...defaults(ttl), name: 'Анна-Мария Ёлкина' };
    const choice = chooseVariant(ttl, ctx.target);
    const p = planInsert({ item: ttl, choice, values, lenSec: 6, ctx, fonts: fontsFor(ttl), pluginVersion: '0.1.0' });
    expect(p).toEqual({
      item: ttl, variant: variant(ttl, '16x9'), lenSec: 6, lenFrames: 150, fieldWrites: toWrites(ttl, values, 'pr'), issues: [],
    });
    expect(p.fieldWrites[0]).toEqual({ egpName: 'Имя', type: 'text', value: 'Анна-Мария Ёлкина' });
    expect(p.fieldWrites[3]).toEqual({ egpName: 'Стиль', type: 'dropdown', value: 0 });
  });
  it('keeps AE dropdowns 1-based', () => {
    expect(plan('TTL_LowerThird', aeCtx()).fieldWrites[3]).toEqual({ egpName: 'Стиль', type: 'dropdown', value: 1 });
  });
  it('snaps the length to the target frame grid, never below the minimum (P3)', () => {
    expect(plan('LOGO_Shot', prCtx(), { lenSec: 8.01 })).toMatchObject({ lenSec: 8, lenFrames: 200, issues: [] });
    expect(plan('LOGO_Shot', prCtx({ fps: 30 }), { lenSec: 4.24 })).toMatchObject({
      lenSec: 4.266667, lenFrames: 128, issues: [{ code: 'FPS_MISMATCH', level: 'warning', params: { template: 25, target: 30 } }],
    });
  });
  it('carries the refusals; the nearest variant is only a placeholder then', () => {
    const p = plan('LOGO_Shot', prCtx({ w: 2560, h: 1440 }));
    expect(p.variant.key).toBe('16x9');
    expect(p.issues).toEqual([{ code: 'NO_VARIANT', level: 'error', params: { frame: '2560×1440', nearest: '16x9' } }]);
    expect(plan('LOGO_Shot', prCtx({ w: 2560, h: 1440 }), { manual: '16x9' }).issues).toEqual([]);
  });
  it('refuses a text template when the font check did not run, without calling the fonts missing', () => {
    const ttl = item('TTL_LowerThird');
    const input = { item: ttl, choice: chooseVariant(ttl, prCtx().target), values: defaults(ttl), lenSec: 6, ctx: prCtx() };
    expect(planInsert({ ...input, fonts: null, pluginVersion: '0.1.0' }).issues).toEqual([{ code: 'FONT_CHECK_FAILED', level: 'error' }]);
    // @ts-expect-error fonts and pluginVersion are required: a caller that skips the font check must not compile
    expect(planInsert(input).issues).toEqual([{ code: 'FONT_CHECK_FAILED', level: 'error' }]);
    const mark = item('LOGO_Mark'); // no required fonts: nothing to check
    expect(planInsert({ ...input, item: mark, choice: chooseVariant(mark, prCtx().target), values: defaults(mark), lenSec: 4, fonts: null, pluginVersion: '0.1.0' }).issues).toEqual([]);
  });
  it('counts frames on the variant fps when the target has none, else on 25', () => {
    expect(plan('LOGO_Shot', aeCtx({ fps: 0 }), { lenSec: 8 }).lenFrames).toBe(200);
    const at30 = item('LOGO_Shot');
    for (const v of at30.variants) v.fps = 30;
    expect(plan(at30, aeCtx({ fps: 0 }), { lenSec: 8 })).toMatchObject({ lenSec: 8, lenFrames: 240 });
    expect(plan(at30, prCtx({ fps: Number.NaN }), { lenSec: 8 }).lenFrames).toBe(240);
    expect(plan(at30, prCtx(null), { lenSec: 8 }).lenFrames).toBe(240); // no target: the stand-in variant
    const bare = item('LOGO_Shot');
    for (const v of bare.variants) delete v.fps;
    expect(plan(bare, aeCtx({ fps: 0 }), { lenSec: 8 }).lenFrames).toBe(200);
    expect(plan(bare, aeCtx({ fps: 0 }), { lenSec: 4.24 }).lenFrames).toBe(107); // 25 fps, plus the AE frame of hold
  });
});

describe('planInsert: AE length (P3, C27)', () => {
  const FPS = [23.976, 24000 / 1001, 24, 25, 29.97, 30000 / 1001, 30, 50, 59.94, 60000 / 1001, 60];
  const timesOf = (keys: [number, number][]) => keys.map((k) => k[0]);
  const increasing = (xs: number[]) => xs.every((x, i) => i === 0 || x > xs[i - 1]!);

  it('keeps the C27 key times strictly increasing for every pack-1 item, fps and length from the minimum up', () => {
    const bad: string[] = [];
    for (const id of ['LOGO_Shot', 'LOGO_Mark', 'TTL_LowerThird']) {
      const it = item(id);
      for (const fps of FPS) {
        const ctx = aeCtx({ fps });
        const lengths = [...Array.from({ length: 401 }, (_, k) => round6(minLen(it) + k * 0.001)), defaultLen(it), 8, 60];
        for (const lenSec of lengths) {
          const p = plan(it, ctx, { lenSec });
          const args = buildArgs(p, ctx, ROOT) as AeInsertArgs;
          const times = timesOf(c27Keys(args.durSec, args.inSec, args.outSec, args.lenSec));
          const refused = p.issues.some((i) => i.level === 'error');
          if (refused || !increasing(times) || !(args.lenSec > minLen(it))) bad.push(`${id} ${fps} ${lenSec}: ${times}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
  it('keeps one frame of hold at the minimum; Premiere keeps the minimum itself', () => {
    expect(plan('TTL_LowerThird', aeCtx(), { lenSec: 4.2 })).toMatchObject({ lenSec: 4.24, lenFrames: 106 });
    expect(plan('TTL_LowerThird', prCtx(), { lenSec: 4.2 })).toMatchObject({ lenSec: 4.2, lenFrames: 105 });
    expect(plan('LOGO_Shot', aeCtx(), { lenSec: 4.25 })).toMatchObject({ lenSec: 4.28, lenFrames: 107 });
    // 127.2 frames at 30 fps: rounding up already leaves 0.8 frame of hold
    expect(plan('LOGO_Shot', aeCtx({ fps: 30 }), { lenSec: 4.24 })).toMatchObject({ lenSec: 4.266667, lenFrames: 128 });
    expect(buildArgs(plan('TTL_LowerThird', aeCtx(), { lenSec: 4.2 }), aeCtx(), ROOT)).toMatchObject({ lenSec: 4.24, durSec: 6 });
  });
  it('sends the template length itself when the length lands on its frame, so the adapter does not remap', () => {
    for (const fps of [30000 / 1001, 24000 / 1001, 29.97, 25]) {
      const ctx = aeCtx({ fps });
      const args = buildArgs(plan('LOGO_Shot', ctx), ctx, ROOT) as AeInsertArgs;
      expect([args.lenSec, args.durSec], String(fps)).toEqual([5, 5]);
    }
    const ntsc = aeCtx({ fps: 30000 / 1001 });
    expect(plan('LOGO_Shot', ntsc)).toMatchObject({ lenSec: 5, lenFrames: 150 }); // 150 frames are 5.005 s
    expect(plan('LOGO_Shot', ntsc, { lenSec: 5.02 })).toMatchObject({ lenSec: 5, lenFrames: 150 });
    expect(plan('LOGO_Shot', ntsc, { lenSec: 5.04 })).toMatchObject({ lenSec: 5.038367, lenFrames: 151 });
    // Premiere gets frames (lenFrames vs defaultLenFrames); its seconds stay the snapped length
    expect(plan('LOGO_Shot', prCtx({ fps: 30000 / 1001 }))).toMatchObject({ lenSec: 5.005, lenFrames: 150 });
  });
  it('adds no hold to a template without one while it keeps its own length', () => {
    const cut: Item = { ...item('LOGO_Mark'), duration: { introSec: 1, holdSec: 0, outroSec: 1 } }; // minLen == D
    expect(plan(cut, aeCtx(), { lenSec: 2 })).toMatchObject({ lenSec: 2, lenFrames: 50, issues: [] });
    const longer = buildArgs(plan(cut, aeCtx(), { lenSec: 2.02 }), aeCtx(), ROOT) as AeInsertArgs;
    expect(c27Keys(longer.durSec, longer.inSec, longer.outSec, longer.lenSec)).toEqual([[0, 0], [1, 1], [1.04, 1], [2.04, 2]]);
  });
});

describe('buildArgs', () => {
  it('builds the Premiere call: MOGRT under the library root, playhead ticks, frames, label', () => {
    const ctx = prCtx();
    const p = plan('TTL_LowerThird', ctx, { lenSec: 8 });
    expect(buildArgs(p, ctx, ROOT)).toEqual({
      seqId: 'seq-0001',
      mogrtPath: 'C:/ProgramData/CloudRuBrandKit/library/items/TTL_LowerThird/TTL_LowerThird_16x9_v1.mogrt',
      startTicks: '3048192000000',
      lenFrames: 200,
      defaultLenFrames: 150,
      expectName: 'TTL_LowerThird_16x9_v1',
      fields: p.fieldWrites,
      label: 'Cloud.ru BrandKit: Подпись спикера',
    });
  });
  it('takes the playhead ticks over its seconds: the seconds are rounded, the ticks are exact', () => {
    // frame 1 of a 29.97 sequence: 1001/30000 s, which getContext rounds to 0.033367
    const ctx = prCtx({ fps: 30000 / 1001, timeSec: 0.033367, ticks: '8475667200' });
    expect(secToTicks(0.033367)).not.toBe('8475667200');
    expect(buildArgs(plan('TTL_LowerThird', ctx), ctx, ROOT)).toMatchObject({ startTicks: '8475667200' });
  });
  it('counts frames on the sequence fps and takes ticks from seconds when the context has none', () => {
    const ctx = prCtx({ fps: 30, ticks: undefined, timeSec: 2.2 });
    const args = buildArgs(plan('TTL_LowerThird', ctx), ctx, ROOT) as PrInsertArgs;
    expect(args).toMatchObject({ startTicks: '558835200000', lenFrames: 180, defaultLenFrames: 180 });
  });
  it('takes the 4K MOGRT for a UHD sequence', () => {
    const ctx = prCtx({ w: 3840, h: 2160 });
    expect(buildArgs(plan('TTL_LowerThird', ctx), ctx, ROOT)).toMatchObject({
      mogrtPath: 'C:/ProgramData/CloudRuBrandKit/library/items/TTL_LowerThird/TTL_LowerThird_16x9_4K_v1.mogrt',
      expectName: 'TTL_LowerThird_16x9_4K_v1',
    });
  });
  it('builds the AE call: the item .aep, the variant comp, C27 timing', () => {
    const ctx = aeCtx();
    const p = plan('LOGO_Shot', ctx, { lenSec: 8 });
    expect(buildArgs(p, ctx, 'C:/CRBK/work/library')).toEqual({
      compId: '17',
      aepPath: 'C:/CRBK/work/library/items/LOGO_Shot/LOGO_Shot_v1.aep',
      itemKey: 'LOGO_Shot@1',
      aeComp: 'CR_LOGO_Shot_16x9_v1',
      timeSec: 2,
      lenSec: 8,
      durSec: 5,
      inSec: 2.84,
      outSec: 3.6,
      fields: p.fieldWrites,
      label: 'Cloud.ru BrandKit: Логошот с подписью',
    });
    const tall = aeCtx({ w: 1080, h: 1920 });
    expect(buildArgs(plan('LOGO_Shot', tall), tall, 'C:/CRBK/work/library')).toMatchObject({ aeComp: 'CR_LOGO_Shot_9x16_v1', lenSec: 5 });
  });
  it('does not throw for a refused plan: runInsert refuses it', () => {
    const ctx = prCtx(null);
    expect(() => buildArgs(plan('TTL_LowerThird', ctx), ctx, ROOT)).not.toThrow();
    const ae = aeCtx(null);
    expect(() => buildArgs(plan('TTL_LowerThird', ae), ae, ROOT)).not.toThrow();
  });
});

describe('runInsert', () => {
  it('refuses on any preflight error before the host call', async () => {
    const { entries, log } = logger();
    const ctx = prCtx(null);
    const p = plan('TTL_LowerThird', ctx);
    const { host, calls } = fakeHost({ ok: true, data: echo(p, CLIP) });
    expect(await runInsert(host, p, ctx, buildArgs(p, ctx, ROOT), log)).toEqual({
      ok: false,
      issues: [{ code: 'NO_TARGET', level: 'error' }],
    });
    expect(calls).toEqual({ insertItem: [], findPlaced: [] });
    expect(entries.map((e) => [e.level, e.code])).toEqual([['warn', 'INSERT_REFUSED']]);
  });
  it('refuses a plan made for a target the context no longer has: NO_TARGET first, no host call', async () => {
    const { entries, log } = logger();
    const ctx = prCtx({ fps: 30 });
    const p = plan('TTL_LowerThird', ctx);
    expect(p.issues).toEqual([{ code: 'FPS_MISMATCH', level: 'warning', params: { template: 25, target: 30 } }]);
    const { host, calls } = fakeHost({ ok: true, data: echo(p, CLIP) });
    expect(await runInsert(host, p, prCtx(null), buildArgs(p, ctx, ROOT), log)).toEqual({
      ok: false,
      issues: [{ code: 'NO_TARGET', level: 'error' }, ...p.issues],
    });
    expect(calls).toEqual({ insertItem: [], findPlaced: [] });
    expect(entries.map((e) => [e.level, e.code])).toEqual([['warn', 'INSERT_REFUSED']]);
  });
  it('refuses a plan with warnings and an error, returning all of them', async () => {
    const ctx = prCtx({ fps: 30 });
    const p = plan('TTL_LowerThird', ctx, { lenSec: 3 });
    const { host, calls } = fakeHost({ ok: true, data: echo(p, CLIP) });
    const r = await runInsert(host, p, ctx, buildArgs(p, ctx, ROOT), logger().log);
    expect(r).toEqual({ ok: false, issues: p.issues });
    expect(r.issues.map((i) => i.code)).toEqual(['LENGTH_TOO_SHORT', 'FPS_MISMATCH']);
    expect(calls.insertItem).toEqual([]);
  });
  it('inserts once and hands back the host result', async () => {
    const { entries, log } = logger();
    const ctx = prCtx();
    const p = plan('TTL_LowerThird', ctx, { lenSec: 8 });
    const args = buildArgs(p, ctx, ROOT);
    const result = echo(p, CLIP);
    const { host, calls } = fakeHost({ ok: true, data: result });
    expect(await runInsert(host, p, ctx, args, log)).toEqual({ ok: true, result, issues: [] });
    expect(calls).toEqual({ insertItem: [args], findPlaced: [] });
    expect(entries.map((e) => [e.level, e.code])).toEqual([['info', 'INSERT_START'], ['info', 'INSERT_OK']]);
  });
  it('keeps the plan warnings after a successful insert', async () => {
    const ctx = aeCtx({ fps: 30 });
    const p = plan('LOGO_Shot', ctx);
    const { host } = fakeHost({ ok: true, data: echo(p, LAYER) });
    const r = await runInsert(host, p, ctx, buildArgs(p, ctx, ROOT), logger().log);
    expect(r).toMatchObject({ ok: true, issues: [{ code: 'FPS_MISMATCH', level: 'warning' }] });
  });
  it('reports fields that did not read back, as a warning; the clip stays', async () => {
    const { entries, log } = logger();
    const ctx = prCtx();
    const p = plan('TTL_LowerThird', ctx, { values: { ...defaults(item('TTL_LowerThird')), name: 'Анна' } });
    const result = echo(p, CLIP);
    result.fields[0] = { egpName: 'Имя', written: 'Анна', back: 'Имя Фамилия', ok: false };
    result.fields[3] = { egpName: 'Стиль', written: 0, back: null, ok: false };
    const { host, calls } = fakeHost({ ok: true, data: result });
    expect(await runInsert(host, p, ctx, buildArgs(p, ctx, ROOT), log)).toEqual({
      ok: true,
      result,
      issues: [{ code: 'READBACK_MISMATCH', level: 'warning', params: { fields: 'Имя, Стиль' } }],
    });
    expect(calls.insertItem).toHaveLength(1);
    expect(entries.map((e) => [e.level, e.code])).toEqual([['info', 'INSERT_START'], ['warn', 'READBACK_MISMATCH']]);
  });
  it('accepts a read-back that only differs in form (a Premiere checkbox comes back as a boolean)', async () => {
    const ctx = prCtx();
    const p = plan('LOGO_Mark', ctx);
    const result = echo(p, { ...CLIP, name: 'LOGO_Mark_16x9_v1' });
    result.fields[0] = { egpName: 'Подложка', written: 1, back: true, ok: false };
    result.fields[1] = { egpName: 'Тема', written: 1, back: '1', ok: false };
    const { host } = fakeHost({ ok: true, data: result });
    expect(await runInsert(host, p, ctx, buildArgs(p, ctx, ROOT), logger().log)).toEqual({ ok: true, result, issues: [] });
  });
  it('after a TIMEOUT asks whether the clip landed, and never re-sends (Premiere)', async () => {
    const ctx = prCtx();
    const p = plan('TTL_LowerThird', ctx);
    const { host, calls } = fakeHost({ ok: false, error: { code: 'TIMEOUT' } }, { ok: true, data: CLIP });
    expect(await runInsert(host, p, ctx, buildArgs(p, ctx, ROOT), logger().log)).toEqual({
      ok: true,
      result: { placed: CLIP, fields: [], warnings: [] },
      issues: [{ code: 'TIMEOUT_LANDED', level: 'warning' }],
    });
    expect(calls.insertItem).toHaveLength(1);
    expect(calls.findPlaced).toEqual([{ kind: 'clip', targetId: 'seq-0001', startSec: 12, name: 'TTL_LowerThird_16x9_v1' }]);
  });
  it('probes for the layer by comp name after an AE TIMEOUT', async () => {
    const ctx = aeCtx();
    const p = plan('LOGO_Shot', ctx);
    const { host, calls } = fakeHost({ ok: false, error: { code: 'TIMEOUT' } }, { ok: true, data: LAYER });
    expect(await runInsert(host, p, ctx, buildArgs(p, ctx, ROOT), logger().log)).toMatchObject({ ok: true, result: { placed: LAYER } });
    expect(calls.findPlaced).toEqual([{ kind: 'layer', targetId: '17', startSec: 2, name: 'CR_LOGO_Shot_16x9_v1' }]);
  });
  it('a TIMEOUT with nothing placed is INSERT_FAILED', async () => {
    const { entries, log } = logger();
    const ctx = prCtx();
    const p = plan('TTL_LowerThird', ctx);
    const { host, calls } = fakeHost({ ok: false, error: { code: 'TIMEOUT' } }, { ok: true, data: null });
    expect(await runInsert(host, p, ctx, buildArgs(p, ctx, ROOT), log)).toEqual({
      ok: false,
      issues: [{ code: 'INSERT_FAILED', level: 'error' }],
    });
    expect(calls.insertItem).toHaveLength(1);
    expect(entries[entries.length - 1]).toMatchObject({ level: 'error', code: 'INSERT_FAILED' });
  });
  it('a TIMEOUT the probe cannot settle stays TIMEOUT: check the timeline, nothing is re-sent', async () => {
    const ctx = prCtx();
    const p = plan('TTL_LowerThird', ctx);
    const silent = fakeHost({ ok: false, error: { code: 'TIMEOUT' } }, { ok: false, error: { code: 'HOST_EMPTY' } });
    expect(await runInsert(silent.host, p, ctx, buildArgs(p, ctx, ROOT), logger().log)).toEqual({
      ok: false,
      issues: [{ code: 'TIMEOUT', level: 'error', params: { detail: 'findPlaced HOST_EMPTY' } }],
    });
    const broken = fakeHost({ ok: false, error: { code: 'TIMEOUT' } }, new Error('bridge down'));
    expect(await runInsert(broken.host, p, ctx, buildArgs(p, ctx, ROOT), logger().log)).toEqual({
      ok: false,
      issues: [{ code: 'TIMEOUT', level: 'error', params: { detail: 'findPlaced HOST_EXCEPTION: bridge down' } }],
    });
    expect([silent.calls.insertItem.length, broken.calls.insertItem.length]).toEqual([1, 1]);
  });
  it('maps the adapter\'s own refusals to their code, unknown codes included, without probing', async () => {
    const ctx = prCtx();
    const p = plan('TTL_LowerThird', ctx);
    const args = buildArgs(p, ctx, ROOT);
    const probes: PlacedProbe[] = [];
    const run = (error: { code: string; message?: string; line?: number }) => {
      const { host, calls } = fakeHost({ ok: false, error }, { ok: true, data: CLIP });
      return runInsert(host, p, ctx, args, logger().log).finally(() => probes.push(...calls.findPlaced));
    };
    expect(await run({ code: 'TARGET_CHANGED' })).toEqual({ ok: false, issues: [{ code: 'TARGET_CHANGED', level: 'error' }] });
    expect(await run({ code: 'NO_FREE_TRACK', message: 'V1..V3 busy' })).toEqual({
      ok: false, issues: [{ code: 'NO_FREE_TRACK', level: 'error', params: { detail: 'V1..V3 busy' } }],
    });
    expect(await run({ code: 'HOST_EXCEPTION', message: 'undefined is not an object', line: 212 })).toEqual({
      ok: false, issues: [{ code: 'HOST_EXCEPTION', level: 'error', params: { detail: 'undefined is not an object', line: 212 } }],
    });
    expect(await run({ code: 'WEIRD_THING' })).toEqual({ ok: false, issues: [{ code: 'WEIRD_THING', level: 'error' }] });
    expect(await run({ code: 'HOST_BRIDGE_ERROR', message: 'insertItem: evalScript threw' })).toMatchObject({
      ok: false, issues: [{ code: 'HOST_BRIDGE_ERROR' }],
    });
    expect(probes).toEqual([]);
  });
  it('puts the outcome before the plan warnings', async () => {
    const ctx = prCtx({ fps: 30 });
    const p = plan('TTL_LowerThird', ctx);
    const { host } = fakeHost({ ok: false, error: { code: 'TARGET_CHANGED' } });
    const r = await runInsert(host, p, ctx, buildArgs(p, ctx, ROOT), logger().log);
    expect(r.issues.map((i) => i.code)).toEqual(['TARGET_CHANGED', 'FPS_MISMATCH']);
  });
});

// Replies after which nobody knows whether the insert ran: they get the TIMEOUT treatment (ask, never re-send).
describe('runInsert: an unsettled insert is probed, never re-sent', () => {
  const MARK: Placed = { ...LAYER, name: 'CR_LOGO_Mark_16x9_v1', endSec: 6 };
  const LANDED = { ok: true, data: MARK };
  const ABSENT = { ok: true, data: null };
  const unsettled: [string, unknown][] = [
    ['an unparsable reply', { ok: false, error: { code: 'HOST_BAD_REPLY', message: 'not json' } }],
    ['a rejected bridge call', new Error('bridge down')],
    ['a failure without a code', { ok: false, error: { code: '' } }],
    ['no reply object', undefined],
    ['a success without a placed layer', { ok: true, data: { fields: [] } }],
  ];

  it.each(unsettled)('after %s: landed is TIMEOUT_LANDED, the cause stays in the log', async (_, reply) => {
    const { entries, log } = logger();
    const ctx = aeCtx();
    const p = plan('LOGO_Mark', ctx);
    const { host, calls } = fakeHost(reply, LANDED);
    expect(await runInsert(host, p, ctx, buildArgs(p, ctx, ROOT), log)).toEqual({
      ok: true,
      result: { placed: MARK, fields: [], warnings: [] },
      issues: [{ code: 'TIMEOUT_LANDED', level: 'warning' }],
    });
    expect(calls.insertItem).toHaveLength(1);
    expect(calls.findPlaced).toEqual([{ kind: 'layer', targetId: '17', startSec: 2, name: 'CR_LOGO_Mark_16x9_v1' }]);
    const last = entries[entries.length - 1];
    expect(last).toMatchObject({ level: 'warn', code: 'TIMEOUT_LANDED' });
    expect((last?.data as { cause: { code: string } }).cause.code).toMatch(/^(HOST_BAD_REPLY|HOST_EXCEPTION)$/);
  });
  it.each(unsettled)('after %s: nothing placed is INSERT_FAILED', async (_, reply) => {
    const ctx = prCtx();
    const p = plan('TTL_LowerThird', ctx);
    const { host, calls } = fakeHost(reply, ABSENT);
    expect(await runInsert(host, p, ctx, buildArgs(p, ctx, ROOT), logger().log)).toEqual({
      ok: false,
      issues: [{ code: 'INSERT_FAILED', level: 'error' }],
    });
    expect([calls.insertItem.length, calls.findPlaced.length]).toEqual([1, 1]);
  });
  it('says so when the probe cannot settle it either: INSERT_UNCONFIRMED with both causes', async () => {
    const ctx = prCtx();
    const p = plan('TTL_LowerThird', ctx);
    const bad = fakeHost({ ok: false, error: { code: 'HOST_BAD_REPLY', message: 'not json' } }, { ok: false, error: { code: 'HOST_EMPTY' } });
    expect(await runInsert(bad.host, p, ctx, buildArgs(p, ctx, ROOT), logger().log)).toEqual({
      ok: false,
      issues: [{ code: 'INSERT_UNCONFIRMED', level: 'error', params: { detail: 'insertItem HOST_BAD_REPLY: not json; findPlaced HOST_EMPTY' } }],
    });
    const rejected = fakeHost(new Error('bridge down'), new Error('bridge down'));
    expect(await runInsert(rejected.host, p, ctx, buildArgs(p, ctx, ROOT), logger().log)).toEqual({
      ok: false,
      issues: [{
        code: 'INSERT_UNCONFIRMED', level: 'error',
        params: { detail: 'insertItem HOST_EXCEPTION: bridge down; findPlaced HOST_EXCEPTION: bridge down' },
      }],
    });
    const junk = fakeHost({ ok: false, error: { code: 'HOST_BAD_REPLY' } }, { ok: true, data: 'CR_LOGO' });
    expect(await runInsert(junk.host, p, ctx, buildArgs(p, ctx, ROOT), logger().log)).toMatchObject({
      ok: false,
      issues: [{ code: 'INSERT_UNCONFIRMED', params: { detail: 'insertItem HOST_BAD_REPLY; findPlaced HOST_BAD_REPLY: not a clip or layer' } }],
    });
    expect([bad, rejected, junk].map((h) => h.calls.insertItem.length)).toEqual([1, 1, 1]);
  });
});
