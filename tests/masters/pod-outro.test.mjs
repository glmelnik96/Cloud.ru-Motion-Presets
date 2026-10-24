// POD_Outro «Аутро подкаста»: the pack's OUTRO read from its dump (the logo shot frozen on the cut at 2.88 s), the
// master on LOGO_Shot's packaged comps with «Подпись» and «Фон» set, frozen at the same time, one shot per proportion;
// the master's expressions run in Node on a stand-in comp (tests/helpers/master-expr.mjs).
// Resolves from the dumps: the build machine only.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { P } from '../../tools/masters/spec.mjs';
import { exprComp } from '../helpers/master-expr.mjs';

const HAS_DUMPS = existsSync('C:/CRBK/work/dumps/podcast/outro.json');

describe.skipIf(!HAS_DUMPS)('POD_Outro', async () => {
  const { resolve, libraryEntry, loadSources, outroModel, SHOT } = await import('../../masters/POD_Outro/resolve.mjs');
  const p = resolve();
  const comp = (w, h) => exprComp(p.spec, { w, h, ctrl: {}, ink: () => ({ l: 0, w: 0, b: 0 }) });

  it('reads the pack\'s outro: the logo shot played to 2.88 s, then held on that frame, 10 s', () => {
    expect(p.pack).toEqual({ freeze: 2.88, duration: 10 });
    const d = structuredClone(loadSources().outro);
    d.layers[0].props.find((n) => n.matchName === 'ADBE Time Remapping').keys[0].inInterp = 'LINEAR';
    expect(() => outroModel(d)).toThrow(/freeze/);
  });

  it('moves LOGO_Shot\'s packaged 16:9 and 9:16 over with «есть где развернуться» on «Тёмный»', () => {
    const t = p.spec.transplant;
    expect(t.aep).toMatch(/build\/LOGO_Shot\/LOGO_Shot_v1\.aep$/);
    expect(t.comps.map((c) => [c.name, c.source])).toEqual([
      ['DECOR_16x9', { name: 'CR_LOGO_Shot_16x9_v1', w: 1920, h: 1080, layers: 10 }],
      ['DECOR_9x16', { name: 'CR_LOGO_Shot_9x16_v1', w: 1080, h: 1920, layers: 10 }],
    ]);
    for (const c of t.comps) {
      expect(c.keep.map((k) => k.name)).toEqual(SHOT.layers);
      expect(c.set).toEqual([
        { layer: 'CTRL', path: ['effect', 'Caption', 'ADBE Dropdown Control', 1], value: 3 },
        { layer: 'CTRL', path: ['effect', 'Background', 'ADBE Dropdown Control', 1], value: 2 },
      ]);
    }
  });

  it('plays the logo shot to 2.88 s and holds it there; each proportion shows its own', () => {
    const wide = comp(1920, 1080);
    expect([0, 1, 2.88, 3, 9.96].map((t) => wide.at('SHOT_16X9', P.timeRemap, t))).toEqual([0, 1, 2.88, 2.88, 2.88]);
    expect([wide.at('SHOT_16X9', P.opacity, 0), wide.at('SHOT_9X16', P.opacity, 0)]).toEqual([100, 0]);
    expect(wide.at('SHOT_16X9', P.pos, 0)).toEqual([960, 540]);
    const tall = comp(1080, 1920);
    expect([tall.at('SHOT_16X9', P.opacity, 0), tall.at('SHOT_9X16', P.opacity, 0)]).toEqual([0, 100]);
    expect(tall.at('SHOT_9X16', P.pos, 0)).toEqual([540, 960]);
  });

  it('library.src.json has its entry: a 10 s clip per proportion, opaque', () => {
    const src = JSON.parse(readFileSync(new URL('../../library/library.src.json', import.meta.url), 'utf8'));
    const item = src.items.find((i) => i.id === 'POD_Outro');
    expect(item).toEqual(libraryEntry(p));
    expect(item).toMatchObject({ category: 'podcast', tier: 'T2', duration: { holdSec: 10 } });
    expect([item.alpha, item.loop, item.cutFrame, item.fields]).toEqual([undefined, undefined, undefined, undefined]);
    expect(item.variants.map((v) => [v.key, v.w, v.h, v.pack])).toEqual([['16x9', 1920, 1080, undefined], ['16x9_4K', 3840, 2160, '4k'], ['9x16', 1080, 1920, undefined]]);
    expect(p.files).toEqual([
      { key: '16x9', variant: '16x9', ctrl: {}, kind: 'clip', seconds: 10, options: {} },
      { key: '16x9_4K', variant: '16x9_4K', ctrl: {}, kind: 'clip', seconds: 10, options: {}, pack: '4k' },
      { key: '9x16', variant: '9x16', ctrl: {}, kind: 'clip', seconds: 10, options: {} },
    ]);
  });
});
