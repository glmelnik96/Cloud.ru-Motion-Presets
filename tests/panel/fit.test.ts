// The core of «Вписать в окно» (panel/src/core/fit.ts): the windows of a variant, the window in the frame of
// the sequence, the scale, position and crop of a clip.
import { describe, expect, it } from 'vitest';
import { fitNumbers, planFit, toFrame, windowsFor } from '../../panel/src/core/fit';
import { aeContext, exampleItem, prContext } from './fixtures';

const web = () => exampleItem('WEB_Screen');

describe('fit windows', () => {
  it('lists the windows of the variant', () => {
    const v = web().variants.find((x) => x.key === '16x9')!;
    expect(windowsFor(web(), v).map((w) => [w.key, w.label_ru, w.rect])).toEqual([
      ['screen', 'Экран', { x: 96, y: 162, w: 1280, h: 720 }],
      ['speaker', 'Спикер', { x: 1440, y: 162, w: 384, h: 720 }],
    ]);
  });

  it('puts a window of a scaled template into the frame of the sequence', () => {
    // the 1920x1080 variant in a 1280x720 sequence: scale 2/3 about the centre
    expect(toFrame({ x: 96, y: 162, w: 1280, h: 720 }, { w: 1920, h: 1080 }, { w: 1280, h: 720 }, 2 / 3)).toEqual({ x: 64, y: 108, w: 853.333, h: 480 });
    expect(toFrame({ x: 10, y: 20, w: 30, h: 40 }, { w: 100, h: 100 }, { w: 100, h: 100 }, 1)).toEqual({ x: 10, y: 20, w: 30, h: 40 });
  });
});

describe('fit numbers', () => {
  it('a recording of the window proportion: scaled into the screen window, no crop (D9)', () => {
    expect(fitNumbers({ w: 1920, h: 1080, par: 1 }, { x: 96, y: 162, w: 1280, h: 720 })).toEqual({ scale: 66.667, position: [736, 522], crop: null });
  });

  it('a 16:9 recording into the portrait speaker window: by its height, the sides cut equally', () => {
    const n = fitNumbers({ w: 1920, h: 1080, par: 1 }, { x: 1440, y: 162, w: 384, h: 720 });
    // displayed 1280x720, 384 wide window: (1280 - 384) / 2 = 448 px off each side = 35 %
    expect(n).toEqual({ scale: 66.667, position: [1632, 522], crop: { left: 35, top: 0, right: 35, bottom: 0 } });
  });

  it('a square still in a wide window: by its width, top and bottom cut; the pixel aspect counts', () => {
    expect(fitNumbers({ w: 400, h: 400, par: 1 }, { x: 0, y: 0, w: 800, h: 400 })).toEqual({ scale: 200, position: [400, 200], crop: { left: 0, top: 25, right: 0, bottom: 25 } });
    expect(fitNumbers({ w: 1440, h: 1080, par: 4 / 3 }, { x: 0, y: 0, w: 1920, h: 1080 }).crop).toBeNull();
  });
});

describe('fit plan', () => {
  it('the window of the variant the form inserts, in Premiere only', () => {
    const p = planFit(web(), prContext(), {}, 'speaker');
    expect(p.ok).toBe(true);
    expect(p.request).toEqual({ targetId: 'seq-1', window: 'speaker', label: 'Спикер', rect: { x: 1440, y: 162, w: 384, h: 720 }, frame: { w: 1920, h: 1080 } });
    const uhd = planFit(web(), prContext({ target: { ...prContext().target!, w: 3840, h: 2160 } }), {}, 'screen');
    expect(uhd.request!.rect).toEqual({ x: 192, y: 324, w: 2560, h: 1440 });
    expect(planFit(web(), aeContext(), {}, 'screen').problems[0].code).toBe('NOT_SUPPORTED');
    expect(planFit(web(), prContext(), {}, 'nope').problems[0].message).toBe('У этого формата шаблона нет окна «nope».');
  });
});
