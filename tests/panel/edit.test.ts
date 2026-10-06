// «Монтаж» in Premiere (panel/src/core/edit.ts): the numbers of «Размыть поля» from the pack (D11) for any
// frame and any clip placement, what the problems of the adapter become, and the caption style (D25).
import { describe, expect, it } from 'vitest';
import { blurNumbers, blurriness, clipRect, fieldMargins, planBlur, planStyle, runBlur, runStyle, textStyles } from '../../panel/src/core/edit';
import type { HostCaller } from '../../panel/src/core/host';
import type { Catalog, HostContext, Item } from '../../panel/src/core/types';

const full = { w: 1920, h: 1080 };

function caller(answers: Record<string, unknown>): HostCaller & { calls: Array<[string, unknown]> } {
  const calls: Array<[string, unknown]> = [];
  return {
    calls,
    async call<T>(fn: string, args?: unknown) {
      calls.push([fn, args]);
      const a = answers[fn];
      return (typeof a === 'function' ? a(args) : a) as { ok: boolean; data?: T; error?: { code: string; message: string } };
    },
  } as HostCaller & { calls: Array<[string, unknown]> };
}

const clip = { track: 0, startTicks: '0', name: 'rec.mp4', src: { w: 1920, h: 1080, par: 1 }, motion: { position: [960, 540] as [number, number], scale: 100, scaleWidth: 100, uniform: true } };
const reply = { name: 'rec.mp4', copyTrack: 1, blurriness: 20, crop: { left: 2.734, top: 4.722, right: 2.734, bottom: 4.722 }, effects: [], keyed: false };

describe('«Размыть поля»: numbers', () => {
  it('the pack at 1080p and 4K: Fast Blur 20 and 38, margins 52.5/51 and 105/102', () => {
    expect(blurriness(full)).toBe(20);
    expect(blurriness({ w: 3840, h: 2160 })).toBe(38);
    expect(fieldMargins({ w: 3840, h: 2160 })).toEqual({ x: 105, y: 102 });
    // a vertical frame scales by its short side
    expect(blurriness({ w: 1080, h: 1920 })).toBe(20);
    expect(fieldMargins({ w: 1080, h: 1920 })).toEqual({ x: 52.5, y: 51 });
  });

  it('a clip that fills the frame: Crop of the copy is the margins in percent (as the probe of the build PC)', () => {
    const n = blurNumbers(full, clipRect(clip.src, clip.motion));
    expect(n).toEqual({ blurriness: 20, margins: { x: 52.5, y: 51 }, crop: { left: 2.734, right: 2.734, top: 4.722, bottom: 4.722 }, covers: true });
    // a 4K source at 50 % in a 1080p sequence: the same picture, the same percent
    expect(blurNumbers(full, clipRect({ w: 3840, h: 2160, par: 1 }, { ...clip.motion, scale: 50 })).crop).toEqual(n.crop);
  });

  it('a clip scaled up or moved: Crop counts in the clip, a clip that does not cover the frame says so', () => {
    const big = blurNumbers(full, clipRect(clip.src, { ...clip.motion, scale: 200 }));
    expect(big.covers).toBe(true);
    expect(big.crop.left).toBeCloseTo(((960 + 52.5) / 3840) * 100, 2);
    const small = blurNumbers(full, clipRect(clip.src, { ...clip.motion, scale: 50 }));
    expect(small).toMatchObject({ covers: false, crop: { left: 0, right: 0, top: 0, bottom: 0 } });
    // Scale Width counts only when Uniform Scale is off
    expect(clipRect(clip.src, { ...clip.motion, scaleWidth: 50, uniform: false }).w).toBe(960);
    expect(clipRect(clip.src, { ...clip.motion, scaleWidth: 50, uniform: true }).w).toBe(1920);
  });
});

describe('«Размыть поля»: plan and run', () => {
  const ctx = (host: 'ae' | 'pr', target = true): HostContext => ({ host, version: '26.5', project: { saved: true, path: 'C:/p.prproj' }, target: target ? { kind: 'sequence', id: 's1', name: 'Edit', w: 1920, h: 1080, fps: 25, timeSec: 0, durationSec: 60 } : null });

  it('Premiere with a sequence only', () => {
    expect(planBlur(ctx('pr'))).toEqual([]);
    expect(planBlur(ctx('ae'))[0].code).toBe('NOT_SUPPORTED');
    expect(planBlur(ctx('pr', false))[0].code).toBe('NO_TARGET');
  });

  it('reads the clip, sends the numbers without Motion, and turns the reply into warnings', async () => {
    const c = caller({ selectedClip: { ok: true, data: clip }, blurFields: { ok: true, data: { ...reply, effects: ['Lumetri Color'], keyed: true } } });
    const out = await runBlur(c, { id: 's1', w: 1920, h: 1080 });
    expect(out.ok).toBe(true);
    expect(c.calls[1]).toEqual(['blurFields', { targetId: 's1', clip: { track: 0, startTicks: '0', name: 'rec.mp4', src: clip.src }, blurriness: 20, crop: reply.crop, blurNames: ['Fast Blur', 'Быстрое размытие'], cropNames: ['Crop', 'Обрезка', 'Обрезать'] }]);
    expect(out.problems.map((p) => [p.code, p.severity])).toEqual([['BLUR_EFFECTS', 'warning'], ['BLUR_KEYED', 'warning']]);
    expect(out.problems[0].message).toContain('Lumetri Color');
  });

  it('no selection, a busy track above, a clip blurred already', async () => {
    const none = await runBlur(caller({ selectedClip: { ok: false, error: { code: 'NO_SELECTION', message: 'выделено клипов: 2' } } }), { id: 's1', w: 1920, h: 1080 });
    expect(none.problems[0]).toMatchObject({ code: 'NO_SELECTION', message: expect.stringContaining('выделено клипов: 2') });
    const busy = await runBlur(caller({ selectedClip: { ok: true, data: clip }, blurFields: { ok: false, error: { code: 'NO_TRACK', message: 'V2' } } }), { id: 's1', w: 1920, h: 1080 });
    expect(busy.problems[0]).toMatchObject({ code: 'BLUR_NO_TRACK', message: expect.stringContaining('V2') });
    const done = await runBlur(caller({ selectedClip: { ok: true, data: clip }, blurFields: { ok: false, error: { code: 'ALREADY', message: '' } } }), { id: 's1', w: 1920, h: 1080 });
    expect(done.problems[0].code).toBe('BLUR_DONE');
    // a clip that does not cover the frame is blurred with a warning
    const small = await runBlur(caller({ selectedClip: { ok: true, data: { ...clip, motion: { ...clip.motion, scale: 50 } } }, blurFields: { ok: true, data: reply } }), { id: 's1', w: 1920, h: 1080 });
    expect(small.problems.map((p) => p.code)).toEqual(['BLUR_NOT_FULL']);
  });
});

describe('«Стиль субтитров»', () => {
  const style: Item = { id: 'CRS_SubtitleStyle', title_ru: 'Стиль', category: 'courses', tier: 'T3', hosts: ['pr'], version: 1, textStyle: 'CR Субтитры', variants: [{ key: 'style', file: 'items/CRS_SubtitleStyle/CRS_SubtitleStyle_style_v1.prtextstyle', minHostVersion: { pr: '26.0' } }] };
  const cat: Catalog = { schemaVersion: 1, libraryVersion: '2026.10.07', minPluginVersion: '0.1.0', items: [style, { ...style, id: 'X', textStyle: undefined }] };
  const pr: HostContext = { host: 'pr', version: '26.5', project: { saved: true, path: null }, target: null };

  it('the style items of the catalog, and the request with the library file and the BrandKit bin', () => {
    expect(textStyles(cat).map((i) => i.id)).toEqual(['CRS_SubtitleStyle']);
    expect(textStyles(null)).toEqual([]);
    expect(planStyle(style, pr, 'C:/lib').request).toEqual({ id: 'CRS_SubtitleStyle', name: 'CR Субтитры', file: 'C:/lib/items/CRS_SubtitleStyle/CRS_SubtitleStyle_style_v1.prtextstyle', bin: 'Cloud.ru BrandKit' });
    expect(planStyle(style, { ...pr, host: 'ae' }, 'C:/lib').problems[0].code).toBe('NOT_SUPPORTED');
  });

  it('imported, already there, no file', async () => {
    const req = planStyle(style, pr, 'C:/lib').request!;
    expect(await runStyle(caller({ importTextStyle: { ok: true, data: { name: 'CR Субтитры', imported: true } } }), req)).toMatchObject({ ok: true, reply: { imported: true } });
    const nofile = await runStyle(caller({ importTextStyle: { ok: false, error: { code: 'NO_FILE', message: 'нет файла' } } }), req);
    expect(nofile.problems[0]).toMatchObject({ code: 'STYLE_FAILED', message: expect.stringContaining('запустите установщик') });
  });
});
