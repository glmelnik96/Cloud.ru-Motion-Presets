// WEB_Screen «Экран вебинара»: its numbers from the webinars pack and its expressions run in Node on a stand-in comp
// (tests/helpers/master-expr.mjs): the layouts, the countdown to «Начинаем», the title and the speaker's plates with
// empty lines and long ones, the QR and its caption, the header, the 4K variant, the library entry.
// Resolves from the dumps: the build machine only.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bbox, samplePolyline } from '../../tools/dump/geometry.mjs';
import { exprComp } from '../helpers/master-expr.mjs';

const REPO = path.resolve(import.meta.dirname, '../..');
const HAS_DUMPS = existsSync('C:/CRBK/work/dumps/webinars/taymer_so_spikerom.json');
const TITLE = ['TXT_TITLE1', 'TXT_TITLE2', 'TXT_TITLE3'];
const SPEAKER = ['TXT_SPK1', 'TXT_SPK2', 'TXT_SPK3'];
const POS = ['transform', 'ADBE Position'];
const SCALE = ['transform', 'ADBE Scale'];
const OPACITY = ['transform', 'ADBE Opacity'];
const rectOf = (c, layer, t) => {
  const [w, h] = c.at(layer, ['group', 'Plate', 'Rect', 'ADBE Vector Rect Size'], t);
  const [x, y] = c.at(layer, ['group', 'Plate', 'Rect', 'ADBE Vector Rect Position'], t);
  return { x0: x - w / 2, x1: x + w / 2, y0: y - h / 2, y1: y + h / 2, w, h };
};

describe.skipIf(!HAS_DUMPS)('WEB_Screen', async () => {
  // vitest runs a skipped body to collect its tests: without the dumps it must not read them
  if (!HAS_DUMPS) return;
  const { resolve, libraryEntry, MINUTES } = await import('../../masters/WEB_Screen/resolve.mjs');
  const p = resolve();
  const L = p.layout;
  const metrics = JSON.parse(readFileSync(path.join(REPO, 'masters', 'WEB_Screen', 'source-metrics.json'), 'utf8'));
  const own = metrics.speakerLines.lines;
  const speakerTexts = SPEAKER.map((t) => p.packs.speaker[t]);
  // lines: the pack's speaker lines by their measured ink; any other text 20 px per character
  const ink = (layer, s) => {
    if (!s) return { l: 0, w: 0 };
    const i = speakerTexts.indexOf(s);
    if (SPEAKER.includes(layer) && i >= 0) return { l: own[i].left, w: own[i].right - own[i].left };
    return { l: 2, w: s.length * 20 };
  };
  const comp = (opts = {}) => exprComp(p.spec, { ink, ...opts });

  it('takes the screens apart: the title, the timer, the speaker block, the QR, the windows, the header', () => {
    expect([L.card.x0, L.right.x0, L.right.x1]).toEqual([80, 1078, 1840]);
    expect([L.title.origin, L.title.first, L.title.step, L.title.size, L.title.font].map((v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v))).toEqual([129, 271, 67, 60, 'SBSansDisplay-Regular']);
    expect(L.label).toMatchObject({ size: 35, text: 'начало через' });
    expect(L.label.origin.map((v) => Math.round(v * 100) / 100)).toEqual([132.2, 617.75]);
    expect(L.digits.origin.map((v) => Math.round(v * 100) / 100)).toEqual([131.5, 765.45]);
    expect(L.digits.size).toBe(155);
    expect(Math.round(L.strip)).toBe(539);
    expect(L.room).toBe(metrics.timer.one.right);
    expect([L.block.origin, L.block.first, L.block.step, L.block.size, L.block.tracking].map((v) => Math.round(v * 100) / 100)).toEqual([1087.48, 698.16, 47, 35, 19]);
    expect([L.block.plate.x0, L.block.plate.h]).toEqual([1078, 50]);
    expect(L.block.plate.above).toBeCloseTo(35.4, 1);
    expect(L.block.plate.padR).toBeCloseTo(15.87, 2);
    expect(L.qr.square).toEqual({ x0: expect.closeTo(80, 3), y0: 873, x1: expect.closeTo(207, 3), y1: 1000 });
    expect(L.qr.modules).toHaveLength(71);
    expect(L.caption).toMatchObject({ size: 36, pack: ['Канал Cloud.ru', 'в Telegram'] });
    expect([L.caption.origin, ...L.caption.bases].map((v) => Math.round(v * 10) / 10)).toEqual([251, 952.8, 999.8]);
    expect(Object.values(L.window).map((v) => Math.round(v * 10) / 10)).toEqual([1025.8, 224, 1844.1, 1011.9]);
    expect(L.photo).toEqual({ x0: 998, y0: 169, x1: 1808, y1: 1080 });
    expect(L.header.at).toEqual([960, 542]);
    expect(p.colors).toEqual({ dark: '#222222', light: '#FFFFFF', card: '#F2F2F2', green: '#26D07C' });
    expect(p.duration).toEqual({ introSec: 0, holdSec: 25, outroSec: 5, maxSec: 905 });
    expect(p.comp.duration).toBe(905);
    // the master logo on the pack's: its cube fitted, the wordmark after it
    const logo = p.spec.layers.find((l) => l.name === 'LOGO');
    const b = bbox(logo.groups.flatMap((g) => g.paths.flatMap((sp) => samplePolyline(sp))));
    expect([b.x0, b.y0].map((v) => Math.round(v))).toEqual([80, 49]);
    expect(b.x1).toBeGreaterThan(350);
    expect(b.x1).toBeLessThan(400);
  });

  it('moves the logo block over with its logo hidden and the hatching on a seamless cycle', () => {
    const tp = p.spec.transplant;
    expect(tp.source).toEqual({ name: 'Логоблок с челкой', w: 1920, h: 1080, layers: 4 });
    const c = tp.comps[0];
    expect(c).toMatchObject({ name: 'DECOR_HEADER', hide: ['Logo'], duration: 905, extendLayers: true });
    expect(c.keep.map((k) => k.name)).toEqual(['Logo', 'облачные  и ИИ-сервисы', 'Shape Layer 4', 'Shape Layer 5']);
    expect(c.set).toEqual([{ layer: 'Shape Layer 4', path: ['group', 'Shape 1', 'Repeater 1', 'ADBE Vector Repeater Offset'], expr: '-100 + (time % 6) * 0.5' }]);
    expect(p.spec.layers.find((l) => l.name === 'DECOR_HEADER')).toMatchObject({ type: 'precomp', collapse: true });
  });

  it('counts down from the minutes to «Начинаем»; the label and the digits go, «Начинаем» stays to the end', () => {
    const c = comp({ ctrl: { Timer: 1 } });
    const shown = (layer, t) => c.at(layer, OPACITY, t);
    expect(['TXT_TIMER', 0, 0.04, 0.96, 1, 59.96, 60, 299.96].slice(1).map((t) => c.at('TXT_TIMER', ['text'], t))).toEqual(['5:00', '5:00', '5:00', '4:59', '4:01', '4:00', '0:01']);
    expect([shown('TXT_STARTS', 299.96), shown('TXT_TIMER', 299.96), shown('TXT_GO', 299.96)]).toEqual([100, 100, 0]);
    expect([shown('TXT_STARTS', 300), shown('TXT_TIMER', 300), shown('TXT_GO', 300), shown('TXT_GO', 304.96)]).toEqual([0, 0, 100, 100]);
    expect(c.at('TXT_TIMER', SCALE, 0)).toEqual([100, 100]);
    // two digits of minutes shrink to the room of one; the slider is clamped to 1–15 and rounded
    const long = comp({ ctrl: { Timer: 1, Minutes: 12 } });
    expect(long.at('TXT_TIMER', ['text'], 0)).toBe('12:00');
    expect(long.at('TXT_TIMER', SCALE, 0)[0]).toBeCloseTo((100 * metrics.timer.one.right) / metrics.timer.two.right, 3);
    expect(comp({ ctrl: { Timer: 1, Minutes: 40 } }).at('TXT_TIMER', ['text'], 0)).toBe('15:00');
    expect(comp({ ctrl: { Timer: 1, Minutes: 0.2 } }).at('TXT_GO', OPACITY, 60)).toBe(100);
    expect(comp({ ctrl: { Timer: 1, Minutes: 2.6 } }).at('TXT_TIMER', ['text'], 0)).toBe('3:00');
    // «Начинаем» fits the countdown's room: the pack's widest timer with one digit of minutes
    const go = metrics.probe.find((x) => x.text === 'Начинаем');
    expect(c.at('TXT_GO', SCALE, 300)[0] / 100 * (go.rect[0] + go.rect[2])).toBeCloseTo(L.room, 3);
    expect(c.at('TXT_GO', POS, 300)).toEqual(c.at('TXT_TIMER', POS, 0));
    // without the timer: none of it
    const off = comp();
    expect(['TXT_STARTS', 'TXT_TIMER', 'TXT_GO'].map((l) => [off.at(l, OPACITY, 10), off.at(l, OPACITY, 400)])).toEqual([[0, 0], [0, 0], [0, 0]]);
  });

  it('«Раскладка» shows the visual or the speaker with the plates', () => {
    const vis = comp({ texts: p.packs.speaker });
    const spk = comp({ texts: p.packs.speaker, ctrl: { Layout: 2 } });
    const show = (c) => ['SLOT_VISUAL', 'SLOT_PHOTO', 'PL_SPK1', 'TXT_SPK2'].map((l) => c.at(l, OPACITY, 1));
    expect(show(vis)).toEqual([100, 0, 0, 0]);
    expect(show(spk)).toEqual([0, 100, 100, 100]);
    // the slots fill the pack's window and the picture's frame
    expect(vis.at('SLOT_VISUAL', POS, 1).map((v) => Math.round(v * 10) / 10)).toEqual([1435, 617.9]);
    const vph = p.spec.layers.find((l) => l.name === 'SLOT_VISUAL').placeholder;
    expect(vis.at('SLOT_VISUAL', SCALE, 1)[0] / 100 * vph.w).toBeCloseTo(L.window.x1 - L.window.x0, 6);
    const pph = p.spec.layers.find((l) => l.name === 'SLOT_PHOTO').placeholder;
    expect([pph.w, pph.h]).toEqual([1620, 1822]);
    expect(spk.at('SLOT_PHOTO', SCALE, 1)[0]).toBeCloseTo(50, 6);
    expect(spk.at('SLOT_PHOTO', POS, 1)).toEqual([1403, 624.5]);
  });

  it('the speaker\'s lines on their plates as the pack has them; empty lines collapse, a long line shrinks the block', () => {
    const c = comp({ texts: p.packs.speaker, ctrl: { Layout: 2 } });
    SPEAKER.forEach((t, i) => {
      const [x, y] = c.at(t, POS, 1);
      expect(x).toBeCloseTo(L.block.origin, 6);
      expect(y).toBeCloseTo(L.block.first + 47 * i, 6);
      const r = rectOf(c, `PL_SPK${i + 1}`, 1);
      expect(r.x0).toBeCloseTo(1078, 6);
      expect(r.h).toBe(50);
      // within 2.5 px of the pack's plates, which were placed by hand
      expect(Math.abs(r.x1 - L.block.pack[i].x1)).toBeLessThan(2.5);
      expect(Math.abs(r.y0 - L.block.pack[i].y0)).toBeLessThan(2.5);
    });
    const gap = comp({ texts: { TXT_SPK1: 'Имя Фамилия', TXT_SPK2: '', TXT_SPK3: 'Роль' }, ctrl: { Layout: 2 } });
    expect(gap.at('TXT_SPK3', POS, 1)[1]).toBeCloseTo(L.block.first + 47, 6);
    expect(rectOf(gap, 'PL_SPK2', 1).w).toBe(0);
    const long = comp({ texts: { TXT_SPK1: 'Ж'.repeat(60), TXT_SPK2: 'Роль', TXT_SPK3: '' }, ctrl: { Layout: 2 } });
    const f = long.at('TXT_SPK1', SCALE, 1)[0] / 100;
    expect(f).toBeLessThan(1);
    expect(rectOf(long, 'PL_SPK1', 1).x1).toBeCloseTo(L.right.x1 - p.fit.margin, 6);
    expect(rectOf(long, 'PL_SPK2', 1).h).toBeCloseTo(50 * f, 6);
  });

  it('the title on the pack\'s baselines; empty lines collapse, a long line shrinks to the visual\'s window', () => {
    const c = comp({ texts: p.packs.visual });
    TITLE.forEach((t, i) => expect(c.at(t, POS, 1)).toEqual([L.title.origin, 271 + 67 * i]));
    const gap = comp({ texts: { TXT_TITLE1: '', TXT_TITLE2: 'Одна строка', TXT_TITLE3: '' } });
    expect(gap.at('TXT_TITLE2', POS, 1)).toEqual([L.title.origin, 271]);
    const long = comp({ texts: { TXT_TITLE1: 'Ш'.repeat(60), TXT_TITLE2: 'вторая', TXT_TITLE3: '' } });
    const f = long.at('TXT_TITLE1', SCALE, 1)[0] / 100;
    expect((2 + 60 * 20) * f).toBeCloseTo(p.fit.titleRoom, 6);
    expect(L.title.origin + p.fit.titleRoom).toBeCloseTo(L.window.x0 - p.fit.margin, 6);
    expect(long.at('TXT_TITLE2', POS, 1)[1]).toBeCloseTo(271 + 67 * f, 6);
  });

  it('the QR slot holds the pack\'s channel QR; the caption on the pack\'s baselines', () => {
    const q = p.spec.layers.find((l) => l.name === 'SLOT_QR');
    expect(q.placeholder).toMatchObject({ w: 512, h: 512 });
    const b = bbox(q.placeholder.layers[0].groups[0].paths.flatMap((sp) => samplePolyline(sp)));
    expect([b.x0, b.y0, b.x1, b.y1].map((v) => Math.round(v))).toEqual([0, 0, 512, 512]);
    const c = comp();
    expect(c.at('SLOT_QR', SCALE, 1)[0]).toBeCloseTo(100 * 127 / 512, 3);
    expect(c.at('TXT_QR1', POS, 1)).toEqual([L.caption.origin, L.caption.bases[0]]);
    expect(c.at('TXT_QR2', POS, 1)).toEqual([L.caption.origin, L.caption.bases[1]]);
  });

  it('4K: everything at twice the place, the texts as their fonts grow', () => {
    const c = comp({ w: 3840, h: 2160, texts: p.packs.speaker, ctrl: { Layout: 2, Timer: 1 } });
    expect(c.at('TXT_TIMER', POS, 0)).toEqual(L.digits.origin.map((v) => v * 2));
    expect(c.at('TXT_SPK2', POS, 1).map((v) => Math.round(v * 1000) / 1000)).toEqual([L.block.origin * 2, (L.block.first + 47) * 2].map((v) => Math.round(v * 1000) / 1000));
    expect(c.at('DECOR_HEADER', SCALE, 0)).toEqual([200, 200]);
    expect(c.at('TXT_SPK1', SCALE, 1)).toEqual([100, 100]);
  });

  it('the panel\'s form, Essential Graphics and the library entry agree', () => {
    expect(p.spec.egpNames).toEqual(['Раскладка', 'Таймер', 'Минуты', 'Заголовок, строка 1', 'Заголовок, строка 2', 'Заголовок, строка 3', 'Визуал', 'Фото спикера',
      'Спикер, строка 1', 'Спикер, строка 2', 'Спикер, строка 3', 'QR-код', 'Подпись QR, строка 1', 'Подпись QR, строка 2']);
    const lib = JSON.parse(readFileSync(path.join(REPO, 'library', 'library.src.json'), 'utf8'));
    expect(lib.items.find((i) => i.id === 'WEB_Screen')).toEqual(libraryEntry(p));
    const minutes = libraryEntry(p).fields.find((f) => f.key === 'minutes');
    expect(minutes).toMatchObject({ min: MINUTES.min, max: MINUTES.max, default: 5, drivesDuration: true, unitSec: 60, enabledBy: 'timer' });
    // the portal's loops answer to the same keys and values
    const portal = lib.items.find((i) => i.id === 'BG_WebinarPortal');
    expect(portal.variants.filter((v) => !v.pack).map((v) => v.options)).toEqual([{ layout: 1, timer: false }, { layout: 1, timer: true }, { layout: 2, timer: false }, { layout: 2, timer: true }]);
    expect(portal.variants.filter((v) => v.pack).map((v) => v.options)).toEqual(portal.variants.filter((v) => !v.pack).map((v) => v.options));
    // D21: no real name, role or title in the template
    const words = Object.values(p.text).map((t) => t.value).join(' ');
    for (const s of [...Object.values(p.packs.speaker), ...Object.values(p.packs.visual)].filter((s) => s && !/Cloud\.ru|Telegram/.test(s))) expect(words).not.toContain(s);
  });
});
