import { describe, it, expect } from 'vitest';
import { planInsert, buildArgs, runInsert } from '../../../panel/src/core/insert';
import { chooseVariant } from '../../../panel/src/core/variant';
import { defaults, toWrites, type Values } from '../../../panel/src/core/fields';
import { c27Keys, defaultLen, minFrames, minLen, round6, secToTicks } from '../../../panel/src/core/duration';
import { createLogger, type LogEntry } from '../../../panel/src/core/log';
import type {
  AeInsertArgs, HostApi, HostContext, HostReply, InsertPlan, InsertResult, Item, Placed, PlacedProbe, PrInsertArgs,
} from '../../../panel/src/core/types';
import { aeCtx, fontsFor, item, prCtx, variant } from './fixture';

const ROOT = 'C:\\ProgramData\\CloudRuBrandKit\\library\\';
const PACK1 = ['LOGO_Shot', 'LOGO_Mark', 'TTL_LowerThird'];
// Frame rates of a target: whole, NTSC (as the double the host reports and as a rounded decimal) and high.
const FPS = [23.976, 24000 / 1001, 24, 25, 29.97, 30000 / 1001, 30, 50, 59.94, 60000 / 1001, 60];

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
  it('stands in the first variant when there is neither a choice nor a nearest one, an empty variant when there is none', () => {
    expect(plan('LOGO_Shot', prCtx(null)).variant.key).toBe('16x9');
    const bare: Item = { ...item('LOGO_Shot'), variants: [] };
    expect(plan(bare, prCtx()).variant).toEqual({ key: '', minHostVersion: {} });
  });
  it('keeps the plain rounding of a length that is refused, so the count stays honest', () => {
    const refused = { issues: [{ code: 'LENGTH_TOO_SHORT', level: 'error' }] };
    expect(plan('LOGO_Shot', prCtx(), { lenSec: 3 })).toMatchObject({ lenSec: 3, lenFrames: 75, ...refused });
    expect(plan('LOGO_Shot', prCtx(), { lenSec: 0.05 })).toMatchObject({ lenSec: 0.04, lenFrames: 1, ...refused });
    expect(plan('LOGO_Shot', prCtx(), { lenSec: 0.01 })).toMatchObject({ lenSec: 0.01, lenFrames: 0, ...refused }); // under a frame
    expect(plan('LOGO_Shot', prCtx(), { lenSec: Number.NaN })).toMatchObject({ lenFrames: 0, ...refused });
  });
  it('never plans fewer frames than the minimum for a length that preflight lets through', () => {
    // preflight lets 1 us below the minimum through (checks.ts) and the frame count has to agree (duration.ts)
    const bad: string[] = [];
    for (const host of ['ae', 'pr'] as const) {
      for (const id of PACK1) {
        const it = item(id);
        for (const fps of FPS) {
          const ctx = host === 'ae' ? aeCtx({ fps }) : prCtx({ fps });
          for (const under of [2e-6, 1.5e-6, 1e-6, 5e-7, 0, -1e-7, -0.01]) {
            const p = plan(it, ctx, { lenSec: minLen(it) - under });
            const refused = p.issues.some((i) => i.code === 'LENGTH_TOO_SHORT');
            if (!refused && p.lenFrames < minFrames(it, fps, host)) bad.push(`${host} ${id} ${fps} -${under}: ${p.lenFrames}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
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
    const zero = item('LOGO_Shot');
    for (const v of zero.variants) v.fps = 0;
    expect(plan(zero, aeCtx({ fps: 0 }), { lenSec: 8 }).lenFrames).toBe(200); // a frame rate of 0 is none
    expect(plan(bare, aeCtx({ fps: 0 }), { lenSec: 4.24 }).lenFrames).toBe(107); // 25 fps, plus the AE frame of hold
  });
});

describe('planInsert: AE length (P3, C27)', () => {
  const timesOf = (keys: [number, number][]) => keys.map((k) => k[0]);
  const increasing = (xs: number[]) => xs.every((x, i) => i === 0 || x > xs[i - 1]!);

  it('keeps the C27 key times strictly increasing and a whole frame apart, for every pack-1 item, fps and length from the minimum up', () => {
    const bad: string[] = [];
    for (const id of PACK1) {
      const it = item(id);
      for (const fps of FPS) {
        const ctx = aeCtx({ fps });
        // from just under the minimum (preflight lets half a microsecond below it through) to well past the frames it
        // can matter in
        const lengths = [
          minLen(it) - 5e-7, ...Array.from({ length: 401 }, (_, k) => round6(minLen(it) + k * 0.001)), defaultLen(it), 8, 60,
        ];
        for (const lenSec of lengths) {
          const p = plan(it, ctx, { lenSec });
          const args = buildArgs(p, ctx, ROOT) as AeInsertArgs;
          const times = timesOf(c27Keys(args.durSec, args.inSec, args.outSec, args.lenSec));
          const refused = p.issues.some((i) => i.level === 'error');
          // 1e-3 frame of slack: the keys and the length are rounded to 1 us
          const holdFrames = (times[2]! - times[1]!) * fps;
          if (refused || !increasing(times) || !(args.lenSec > minLen(it)) || holdFrames < 1 - 1e-3) bad.push(`${id} ${fps} ${lenSec}: ${times}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
  it('keeps a whole frame of hold at the minimum; Premiere keeps the minimum itself', () => {
    expect(plan('TTL_LowerThird', aeCtx(), { lenSec: 4.2 })).toMatchObject({ lenSec: 4.24, lenFrames: 106 });
    expect(plan('TTL_LowerThird', prCtx(), { lenSec: 4.2 })).toMatchObject({ lenSec: 4.2, lenFrames: 105 });
    expect(plan('LOGO_Shot', aeCtx(), { lenSec: 4.25 })).toMatchObject({ lenSec: 4.28, lenFrames: 107 });
    // 127.2 frames at 30 fps: 128 would leave 0.8 frame of hold, so AE takes 129 and Premiere 128
    expect(plan('LOGO_Shot', aeCtx({ fps: 30 }), { lenSec: 4.24 })).toMatchObject({ lenSec: 4.3, lenFrames: 129 });
    expect(plan('LOGO_Shot', prCtx({ fps: 30 }), { lenSec: 4.24 })).toMatchObject({ lenSec: 4.266667, lenFrames: 128 });
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
    // with empty ids and the start of the timeline
    expect(buildArgs(plan('TTL_LowerThird', ctx), ctx, ROOT)).toMatchObject({ seqId: '', startTicks: '0' });
    expect(buildArgs(plan('TTL_LowerThird', ae), ae, ROOT)).toMatchObject({ compId: '', timeSec: 0 });
  });
  it('gives an AE item without a duration no C27 split: its length, no intro and no outro', () => {
    const loose: Item = { ...item('LOGO_Mark'), tier: 'T3' };
    delete loose.duration;
    const ctx = aeCtx();
    expect(buildArgs(plan(loose, ctx, { lenSec: 3 }), ctx, ROOT)).toMatchObject({ lenSec: 3, durSec: 0, inSec: 0, outSec: 0 });
    // there is no template length to land on, not even 0
    expect(plan(loose, ctx, { lenSec: 0.01 })).toMatchObject({ lenSec: 0.01, lenFrames: 0 });
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
  // The adapters report what they could not do as warning codes, 'CODE' or 'CODE: detail' (panel/host/*.jsx).
  it('turns the adapter warnings into warning issues after the outcome and before the plan warnings', async () => {
    const ctx = aeCtx({ fps: 30 });
    const p = plan('TTL_LowerThird', ctx, { lenSec: 8 });
    const result = { ...echo(p, LAYER), warnings: ['REMAP_KEYS_MISMATCH', 'FIELD_NOT_FOUND: Должность, 2-я строка', '  ', 'FIELD_WRITE_FAILED: Имя: Error: read-only'] };
    const { host } = fakeHost({ ok: true, data: result });
    const r = await runInsert(host, p, ctx, buildArgs(p, ctx, ROOT), logger().log);
    expect(r.ok).toBe(true);
    expect(r.issues.slice(0, 3)).toEqual([
      { code: 'REMAP_KEYS_MISMATCH', level: 'warning' },
      { code: 'FIELD_NOT_FOUND', level: 'warning', params: { field: 'Должность, 2-я строка' } },
      // AE's 'FIELD_*: <name>: <why>': the name for the user, the reason for the log
      { code: 'FIELD_WRITE_FAILED', level: 'warning', params: { field: 'Имя', detail: 'Error: read-only' } },
    ]);
    expect(r.issues.slice(3)).toEqual(p.issues.filter((i) => i.level !== 'error'));
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
    expect(await run({ code: 'WEIRD_THING' })).toEqual({ ok: false, issues: [{ code: 'WEIRD_THING', level: 'error' }] });
    expect(await run({ code: 'HOST_BRIDGE_ERROR', message: 'insertItem: evalScript threw' })).toMatchObject({
      ok: false, issues: [{ code: 'HOST_BRIDGE_ERROR' }],
    });
    expect(probes).toEqual([]);
  });
  // common.jsx answers HOST_EXCEPTION for a reply it cannot serialise, and that happens after insertItem has placed
  // the clip or layer; any other adapter exception may also come after the placing. So the probe decides, read-only.
  it('probes after an adapter HOST_EXCEPTION and never re-sends', async () => {
    const ctx = prCtx();
    const p = plan('TTL_LowerThird', ctx);
    const args = buildArgs(p, ctx, ROOT);
    const unserialisable = { code: 'HOST_EXCEPTION', message: 'reply of insertItem is not serializable: TypeError: Converting circular structure to JSON' };
    const landed = fakeHost({ ok: false, error: unserialisable }, { ok: true, data: CLIP });
    const r = await runInsert(landed.host, p, ctx, args, logger().log);
    expect(r).toMatchObject({ ok: true, result: { placed: CLIP, fields: [] }, issues: [{ code: 'TIMEOUT_LANDED', level: 'warning' }] });
    expect([landed.calls.insertItem.length, landed.calls.findPlaced.length]).toEqual([1, 1]);
    // nothing landed: the user reads the adapter's own exception, not a generic failure
    const missed = fakeHost({ ok: false, error: { code: 'HOST_EXCEPTION', message: 'undefined is not an object', line: 212 } }, { ok: true, data: null });
    expect(await runInsert(missed.host, p, ctx, args, logger().log)).toEqual({
      ok: false, issues: [{ code: 'HOST_EXCEPTION', level: 'error', params: { detail: 'undefined is not an object', line: 212 } }],
    });
    expect([missed.calls.insertItem.length, missed.calls.findPlaced.length]).toEqual([1, 1]);
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
  // [what came back, the reply, the cause the log keeps: the user only ever hears TIMEOUT_LANDED or INSERT_FAILED]
  const unsettled: [string, unknown, Record<string, unknown>][] = [
    ['a timeout', { ok: false, error: { code: 'TIMEOUT', message: 'insertItem: no reply in 120000 ms' } },
      { code: 'TIMEOUT', message: 'insertItem: no reply in 120000 ms' }],
    ['an unparsable reply', { ok: false, error: { code: 'HOST_BAD_REPLY', message: 'not json' } },
      { code: 'HOST_BAD_REPLY', message: 'not json' }],
    ['a rejected bridge call', new Error('bridge down'), { code: 'HOST_EXCEPTION', message: 'bridge down', thrown: true }],
    ['a failure without a code', { ok: false, error: { code: '' } }, { code: 'HOST_BAD_REPLY' }],
    ['no reply object', undefined, { code: 'HOST_BAD_REPLY', message: 'not a HostReply' }],
    ['a success without a placed layer', { ok: true, data: { fields: [] } },
      { code: 'HOST_BAD_REPLY', message: 'no placed clip or layer' }],
  ];

  it.each(unsettled)('after %s: landed is TIMEOUT_LANDED, the cause stays in the log', async (_, reply, cause) => {
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
    expect(entries[entries.length - 1]).toMatchObject({ level: 'warn', code: 'TIMEOUT_LANDED', data: { placed: MARK, cause } });
  });
  it.each(unsettled)('after %s: nothing placed is INSERT_FAILED, the cause stays in the log', async (_, reply, cause) => {
    const { entries, log } = logger();
    const ctx = prCtx();
    const p = plan('TTL_LowerThird', ctx);
    const { host, calls } = fakeHost(reply, ABSENT);
    expect(await runInsert(host, p, ctx, buildArgs(p, ctx, ROOT), log)).toEqual({
      ok: false,
      issues: [{ code: 'INSERT_FAILED', level: 'error' }],
    });
    expect([calls.insertItem.length, calls.findPlaced.length]).toEqual([1, 1]);
    expect(entries[entries.length - 1]).toMatchObject({ level: 'error', code: 'INSERT_FAILED', data: { data: { cause } } });
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
