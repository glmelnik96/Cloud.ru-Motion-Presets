import { describe, expect, it } from 'vitest';
import { initialValues } from '../../panel/src/core/fields';
import type { CallOptions, HostCaller, HostReply } from '../../panel/src/core/host';
import { planInsert, readbackMismatches, runInsert, type InsertInput, type InsertRequest } from '../../panel/src/core/insert';
import { ALL_FONTS, aeContext, item, prContext, webScreen } from './fixtures';

const ENV = { platform: 'win' as const, libraryRoot: 'C:/ProgramData/CloudRuBrandKit/library' };

function input(over: Partial<InsertInput> = {}): InsertInput {
  const it = over.item ?? item('TTL_LowerThird');
  return { item: it, ctx: prContext(), values: initialValues(it), fonts: ALL_FONTS, env: ENV, ...over };
}

describe('planInsert', () => {
  it('plans a Premiere insert: MOGRT of the frame, length, writes', () => {
    const p = planInsert(input({ values: { ...initialValues(item('TTL_LowerThird')), name: 'Анна', style: 2 } }));
    expect(p.problems).toEqual([]);
    expect(p.request).toMatchObject({
      id: 'TTL_LowerThird',
      targetId: 'seq-1',
      startSec: 40,
      lengthSec: 6,
      lengthFrames: 150,
      placeSec: 6,
      scale: 1,
      remap: null,
      aep: null,
      variant: { key: '16x9', file: 'C:/ProgramData/CloudRuBrandKit/library/items/TTL_LowerThird/TTL_LowerThird_16x9_v1.mogrt', aeComp: null },
      undoLabel: 'BrandKit: Подпись спикера',
    });
    expect(p.request!.writes.slice(0, 1)).toEqual([{ key: 'name', egpName: 'Имя', type: 'text', value: 'Анна' }]);
    expect(p.request!.writes.find((w) => w.key === 'style')!.value).toBe(1);
  });

  it('plans an AE insert: the .aep, the variant comp, time remap for a longer instance', () => {
    const p = planInsert(input({ ctx: aeContext(), options: { lengthSec: 10 } }));
    expect(p.ok).toBe(true);
    expect(p.request).toMatchObject({
      targetId: '12',
      aep: 'C:/ProgramData/CloudRuBrandKit/library/items/TTL_LowerThird/TTL_LowerThird_v1.aep',
      variant: { aeComp: 'CR_TTL_LowerThird_16x9_v1', file: null },
      remap: [[0, 0], [2.2, 2.2], [8, 4], [10, 6]],
      assetDir: 'C:/CRBK/work/user/Cloud.ru BrandKit/TTL_LowerThird@1',
      bin: 'Cloud.ru BrandKit',
      libraryKey: 'TTL_LowerThird@1',
    });
    expect(p.request!.writes.find((w) => w.key === 'style')!.value).toBe(1);
  });

  it('refuses without a target, without a saved project, on an old host', () => {
    expect(planInsert(input({ ctx: prContext({ target: null }) })).problems.map((x) => x.code)).toEqual(['NO_TARGET']);
    const unsaved = planInsert(input({ ctx: aeContext({ project: { saved: false, path: null } }) }));
    expect(unsaved.ok).toBe(false);
    expect(unsaved.problems.map((x) => x.code)).toEqual(['NOT_SAVED']);
    expect(planInsert(input({ ctx: prContext({ version: '25.6.1' }) })).problems.map((x) => x.code)).toEqual(['HOST_TOO_OLD']);
  });

  it('asks before the nearest variant and scales it into the frame', () => {
    const ctx = prContext({ target: { ...prContext().target!, w: 2560, h: 1440 } });
    const asked = planInsert(input({ ctx }));
    expect(asked.ok).toBe(false);
    expect(asked.problems[0]).toMatchObject({ code: 'NO_VARIANT', detail: { key: '16x9_4K' } });
    const agreed = planInsert(input({ ctx, options: { acceptNearest: true } }));
    expect(agreed.ok).toBe(true);
    expect(agreed.problems.map((x) => [x.code, x.severity])).toEqual([['NEAREST_VARIANT', 'warning']]);
    expect(agreed.request!.scale).toBe(0.666667);
  });

  it('collects every refusal at once: fonts, values, length', () => {
    const it2 = item('TTL_LowerThird');
    const p = planInsert(input({
      values: { ...initialValues(it2), name: 'x'.repeat(41) },
      fonts: { ...ALL_FONTS, 'SBSansDisplay-Bold': { found: false } },
      options: { lengthSec: 1 },
    }));
    expect(p.problems.map((x) => x.code)).toEqual(['NO_FONT', 'BAD_VALUE', 'TOO_SHORT']);
  });

  it('warns about fps and colour but goes on', () => {
    const ctx = aeContext({ target: { ...aeContext().target!, fps: 29.97 }, color: { workingSpace: 'None', linearize: true, bpc: 16 } });
    const p = planInsert(input({ ctx }));
    expect(p.ok).toBe(true);
    expect(p.problems.map((x) => x.code)).toEqual(['FPS_MISMATCH', 'COLOR_SETTINGS']);
  });

  it('cuts a trim template and writes its duration slider', () => {
    const web = webScreen();
    const p = planInsert(input({ item: web, values: { ...initialValues(web), timer: true, minutes: 3 }, fonts: ALL_FONTS }));
    expect(p.request).toMatchObject({ fit: 'trim', lengthSec: 185, placeSec: 905, serviceDuration: { value: 185 } });
  });

  it('does not insert what is not a template yet', () => {
    const t3 = { ...item('LOGO_Shot'), tier: 'T3' as const };
    expect(planInsert(input({ item: t3 })).problems.map((x) => x.code)).toEqual(['NOT_SUPPORTED']);
  });
});

class FakeHost implements HostCaller {
  calls: Array<{ fn: string; args: unknown; opts?: CallOptions }> = [];
  constructor(private readonly replies: Record<string, HostReply | ((args: unknown) => HostReply)>) {}
  async call<T>(fn: string, args?: unknown, opts?: CallOptions): Promise<HostReply<T>> {
    this.calls.push({ fn, args, opts });
    const r = this.replies[fn];
    return (typeof r === 'function' ? r(args) : r) as HostReply<T>;
  }
}

const request = (): InsertRequest => planInsert(input({ values: { ...initialValues(item('TTL_LowerThird')), name: 'Анна' } })).request!;

function echo(args: unknown): HostReply {
  const req = args as InsertRequest;
  return { ok: true, data: { name: 'TTL', startSec: req.startSec, lengthSec: req.lengthSec, readback: Object.fromEntries(req.writes.map((w) => [w.egpName, w.value])) } };
}

describe('runInsert', () => {
  it('sends one mutating call and accepts values that read back', async () => {
    const host = new FakeHost({ insertItem: echo });
    const r = await runInsert(host, 'pr', request());
    expect(r.ok).toBe(true);
    expect(host.calls.map((c) => [c.fn, c.opts?.mutating])).toEqual([['insertItem', true]]);
  });

  it('lists the fields that did not read back by their form labels', async () => {
    const host = new FakeHost({ insertItem: (a) => { const r = echo(a); (r.data as { readback: Record<string, unknown> }).readback['Имя'] = 'Имя Фамилия'; return r; } });
    const r = await runInsert(host, 'pr', request(), { name: 'Имя' });
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatchObject({ code: 'READBACK', detail: { fields: ['name'] } });
    expect(r.problems[0].message).toMatch(/^Не записались поля: Имя\./);
  });

  it('reads the state after a timeout instead of inserting again', async () => {
    const found = new FakeHost({ insertItem: { ok: false, error: { code: 'TIMEOUT', message: '' } }, probeInsert: { ok: true, data: { found: true } } });
    const r1 = await runInsert(found, 'ae', request(), {}, 30000);
    expect(r1.ok).toBe(true);
    expect(r1.problems[0]).toMatchObject({ code: 'TIMEOUT', severity: 'warning' });
    expect(found.calls.map((c) => [c.fn, Boolean(c.opts?.mutating)])).toEqual([['insertItem', true], ['probeInsert', false]]);

    const lost = new FakeHost({ insertItem: { ok: false, error: { code: 'TIMEOUT', message: '' } }, probeInsert: { ok: true, data: { found: false } } });
    const r2 = await runInsert(lost, 'ae', request(), {}, 30000);
    expect(r2.problems[0]).toMatchObject({ code: 'TIMEOUT', severity: 'error', message: 'After Effects не ответил за 30 с.' });
  });

  it('turns host refusals into the panel messages', async () => {
    const r = await runInsert(new FakeHost({ insertItem: { ok: false, error: { code: 'INSERT_FAILED', message: 'клип не появился на V3' } } }), 'pr', request());
    expect(r.problems[0].message).toBe('Вставка не выполнена: клип не появился на V3.');
    const e = await runInsert(new FakeHost({ insertItem: { ok: false, error: { code: 'HOST_EXCEPTION', message: 'boom' } } }), 'pr', request());
    expect(e.problems[0]).toMatchObject({ code: 'HOST_ERROR', message: 'Ошибка в Premiere: boom' });
  });

  it('compares numbers, booleans and line breaks as values', () => {
    const req = request();
    const back = Object.fromEntries(req.writes.map((w) => [w.egpName, typeof w.value === 'number' ? String(w.value) : w.value]));
    expect(readbackMismatches(req, back)).toEqual([]);
  });
});
