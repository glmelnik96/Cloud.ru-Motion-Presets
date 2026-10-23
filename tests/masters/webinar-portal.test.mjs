// BG_WebinarPortal «Фон экрана вебинара»: the four screens' backgrounds as the pack has them, the portal's edge on M10
// through the pack's turning points (the mask's path by expression), the rack's noise cycled to the 60 s loop, the
// form picking the file. Resolves from the dumps: the build machine only.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { P } from '../../tools/masters/spec.mjs';
import { exprComp } from '../helpers/master-expr.mjs';

const FILES = ['zastavka_s_vizhualom', 'zastavka_so_spikerom', 'taymer_s_vizhualom', 'taymer_so_spikerom', 'pattern_rack_animation'];
const HAS_DUMPS = FILES.every((f) => existsSync(`C:/CRBK/work/dumps/webinars/${f}.json`));
const FN = (n) => `ADBE Fractal Noise-${String(n).padStart(4, '0')}`;

describe.skipIf(!HAS_DUMPS)('BG_WebinarPortal', async () => {
  const { resolve, libraryEntry, turningPoints, SCREENS } = await import('../../masters/BG_WebinarPortal/resolve.mjs');
  const p = resolve();
  const tp = p.spec.transplant.comps;

  it('reads the portal: mint #8EE7BB, the left card\'s right edge turning at 118, 417.41, 229.21, 402.44', () => {
    expect(p.portal.fill).toBe('#8EE7BB');
    expect(p.portal.vertices).toEqual([[118, -356], [-880, -356], [-880, 268], [118, 268]]);
    expect(p.portal.points).toEqual([118, 417.405518, 229.207031, 402.435669, 118]);
    expect(turningPoints([118, 417.4, 229.2, 402.4, 118, 417.4, 229.2])).toEqual([118, 417.4, 229.2, 402.4, 118]);
  });

  it('moves the edge on M10: 15 s a segment, eased, the loop closing at 60 s', () => {
    const src = tp[0].set[0].expr;
    const path = new Function('time', 'createPath', src.replace(/\n([^\n]*)$/, '\nreturn ($1);'));
    const make = (pts) => pts;
    const edge = (t) => path(t, make)[0][0];
    expect([0, 15, 30, 45, 60].map((t) => +edge(t).toFixed(3))).toEqual([118, 417.406, 229.207, 402.436, 118]);
    // slow off a turning point: under a quarter of the way at 7.5 s (0.775,0,0.667,1)
    expect((edge(7.5) - 118) / (417.405518 - 118)).toBeCloseTo(0.222, 2);
    expect(path(33, make).slice(1, 3)).toEqual([[-880, -356], [-880, 268]]);
  });

  it('keeps each screen\'s background layers and changes the portal and, with the speaker, the rack\'s noise', () => {
    expect(tp.map((c) => [c.name, c.keep.map((k) => k.name)])).toEqual([
      ['DECOR_VISUAL', ['Pattern2', 'PORTAL', 'Dark Gray Solid 1']],
      ['DECOR_VISUAL_TIMER', ['Pattern0', 'PORTAL', 'Dark Gray Solid 1']],
      ['DECOR_SPEAKER', ['Group 2131327780.png', 'Group 2131327780.png', 'PATTERN RACK_Animation', 'PORTAL', 'Dark Gray Solid 1']],
      ['DECOR_SPEAKER_TIMER', ['PATTERN RACK_Animation', 'PORTAL', 'Dark Gray Solid 1']],
    ]);
    expect(tp.every((c) => c.duration === 60 && c.extendLayers)).toBe(true);
    // the noise: whole revolutions in the loop at the speed nearest M9's 40°/s
    expect(p.rack).toEqual({ revs: 7, speed: 42 });
    const speaker = tp[2].set.filter((s) => s.comp === 'PATTERN RACK_Animation');
    expect(speaker.map((s) => [s.path[3], s.expr ?? s.value])).toEqual([[FN(23), 'time * 42'], [FN(25), 1], [FN(26), 7]]);
  });

  it('shows one screen by «Раскладка» and «С таймером»', () => {
    for (const s of SCREENS) {
      const c = exprComp(p.spec, { w: 1920, h: 1080, ctrl: { Layout: s.layout, Timer: s.timer ? 1 : 0 }, ink: () => ({ l: 0, w: 0, b: 0 }) });
      expect(SCREENS.map((x) => c.at(x.key.toUpperCase(), P.opacity, 0))).toEqual(SCREENS.map((x) => (x === s ? 100 : 0)));
    }
  });

  it('library.src.json has its entry: four 60 s loops, opaque, picked by the form', () => {
    const src = JSON.parse(readFileSync(new URL('../../library/library.src.json', import.meta.url), 'utf8'));
    const item = src.items.find((i) => i.id === 'BG_WebinarPortal');
    expect(item).toEqual(libraryEntry(p));
    expect(item).toMatchObject({ category: 'webinars', tier: 'T2', loop: { periodFrames: 1500 } });
    expect(item.alpha).toBeUndefined();
    expect(item.variants.map((v) => [v.key, v.options])).toEqual([
      ['16x9_visual', { layout: 1, timer: false }], ['16x9_visual_timer', { layout: 1, timer: true }],
      ['16x9_speaker', { layout: 2, timer: false }], ['16x9_speaker_timer', { layout: 2, timer: true }],
    ]);
  });
});
