import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { diagnose, loadRelinkMap, nfdMarks, renderDoctor } from '../../tools/dump/doctor.mjs';
import { loadPalette } from '../../tools/dump/colors.mjs';

const NFD = 'Дисклеймер.wav'.normalize('NFD');
const sw = (extra) => ({ enabled: true, guideLayer: false, ...extra });
const layer = (index, name, type, extra = {}) => ({ index, name, type, stretch: 100, switches: sw(), props: [], effects: [], masks: [], ...extra });
const fill = (rgb) => ({ matchName: 'ADBE Root Vectors Group', name: 'Contents', children: [
  { matchName: 'ADBE Vector Graphic - Fill', name: 'Fill 1', enabled: true, children: [
    { matchName: 'ADBE Vector Fill Color', name: 'Color', pvt: 'COLOR', value: rgb }] }] });

function podcast() {
  return {
    dir: 'C:/CRBK/work/dumps/podcast',
    index: { slug: 'podcast', file: 'C:\\CRBK\\packs\\podcast\\podcast_relinked.aep', aeVersion: '26.5x50', expressionEngine: 'extendscript', comps: [] },
    project: {
      expressionEngine: 'extendscript',
      items: [
        { id: 1, name: 'Pre-comp 3', kind: 'comp', folder: 'Precomp' },
        { id: 2, name: NFD, kind: 'footage', folder: 'SFX', source: { kind: 'file', file: 'C:/CRBK/packs/podcast/media/disclaimer.wav', hasVideo: false, hasAudio: true } },
        { id: 3, name: 'clip.mp4', kind: 'footage', folder: '', source: { kind: 'file', file: 'C:/CRBK/packs/podcast/media/clip.mp4', hasVideo: true, isStill: false, frameRate: 24 } },
        { id: 4, name: 'slide_01.png', kind: 'footage', folder: '', source: { kind: 'file', file: 'G:/Курсы/slide_01.png', missing: true, hasVideo: true, isStill: true } },
      ],
    },
    comps: [
      { comp: { id: 10, name: 'Overlay', frameRate: 25, renderer: 'ADBE Calder', bgColor: [0, 0, 0] }, layers: [
        layer(1, 'Still 2025-12-10 132207_1.1.1.png', 'av', { source: { kind: 'file', name: 'Still 2025-12-10 132207_1.1.1.png', file: 'C:/CRBK/packs/podcast/media/still.png', hasVideo: true, isStill: true } }),
        layer(2, 'Shape Layer 1', 'shape', { switches: sw({ threeDLayer: true }), props: [fill([0.827451, 0.827451, 0.827451, 1])] }),
        layer(3, 'SFX', 'av', { source: { kind: 'file', name: NFD, file: 'C:/CRBK/packs/podcast/media/disclaimer.wav', hasVideo: false, hasAudio: true } }),
        layer(4, 'Pre-comp 3', 'av', { stretch: -100, switches: sw({ timeRemapEnabled: true }), source: { kind: 'comp', name: 'Pre-comp 3', frameRate: 24 },
          props: [{ matchName: 'ADBE Time Remapping', name: 'Time Remap', pvt: 'OneD', keys: [
            { time: 0, value: 0, outInterp: 'LINEAR' }, { time: 1, value: 1, outInterp: 'LINEAR' },
            { time: 5, value: 1, outInterp: 'LINEAR' }, { time: 6, value: 0.5, outInterp: 'LINEAR' }] }] }),
        layer(5, 'TXT_TITLE', 'text', { props: [{ matchName: 'ADBE Transform Group', name: 'Transform', children: [
          { matchName: 'ADBE Opacity', name: 'Opacity', pvt: 'OneD', value: 100, expression: { text: 'thisComp.layer("X").opacity', enabled: true, error: 'Layer named X is missing\r\nline 1' } }] }] }),
        layer(6, 'SLOT_PHOTO', 'av', { source: { kind: 'file', name: 'photo.png', file: 'C:/CRBK/packs/podcast/media/photo.png', hasVideo: true, isStill: true } }),
        layer(7, 'Still guide', 'av', { switches: sw({ guideLayer: true }), source: { kind: 'file', name: 'Still 2.png', file: 'C:/CRBK/packs/podcast/media/still2.png', hasVideo: true, isStill: true } }),
      ] },
      { comp: { id: 11, name: 'Pre-comp 3', frameRate: 24, renderer: 'ADBE Escher', bgColor: [0.133333, 0.133333, 0.133333] }, layers: [] },
    ],
  };
}

const RELINK = { file: 'C:/CRBK/packs/podcast/relink-map.json', found: true, entries: [
  { from: 'C:/orig/(Footage)/SFX/' + NFD, to: 'C:/CRBK/packs/podcast/media/disclaimer.wav' }] };

describe('doctor', () => {
  it('reads relink maps in several shapes', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-doc-'));
    const write = (name, v) => { const f = path.join(dir, name); writeFileSync(f, JSON.stringify(v)); return f; };
    expect(loadRelinkMap(write('a.json', [{ from: 'a', to: 'b' }])).entries).toEqual([{ from: 'a', to: 'b' }]);
    expect(loadRelinkMap(write('b.json', { entries: [{ original: 'a', relinked: 'b' }] })).entries).toEqual([{ from: 'a', to: 'b' }]);
    expect(loadRelinkMap(write('c.json', { 'C:/a.wav': 'C:/b.wav' })).entries).toEqual([{ from: 'C:/a.wav', to: 'C:/b.wav' }]);
    expect(loadRelinkMap(path.join(dir, 'none.json'))).toMatchObject({ found: false, entries: [] });
  });

  it('names the combining marks of an NFD string', () => {
    expect(nfdMarks(NFD)).toBe('U+0306');
  });

  it('finds every hygiene problem of the synthetic pack', () => {
    const f = diagnose(podcast(), { palette: loadPalette(null), relink: RELINK });
    expect(f.engine).toMatchObject({ value: 'extendscript', legacy: true, expressions: 1 });
    expect(f.engine.errors).toEqual([{ comp: 'Overlay', layer: 'TXT_TITLE', where: 'Transform › Opacity', error: 'Layer named X is missing' }]);
    expect(f.advanced3d).toEqual([{ comp: 'Overlay', renderer: 'ADBE Calder', rendererName: 'Advanced 3D', threeDLayers: 1 }]);
    expect(f.renderers).toEqual({ 'ADBE Calder': 1, 'ADBE Escher': 1 });
    expect(f.nfd.map((n) => n.where)).toEqual(['элемент проекта', 'карта перелинковки, было']);
    expect(f.unnamed.map((u) => u.name)).toEqual(['Shape Layer 1', 'Pre-comp 3']);
    expect(f.unnamedComps).toEqual([{ name: 'Pre-comp 3', folder: 'Precomp' }]);
    expect(f.audio).toEqual([{ comp: 'Overlay', layer: 'SFX', file: 'C:/CRBK/packs/podcast/media/disclaimer.wav', audioEnabled: true, video: false }]);
    expect(f.fps.comps).toEqual({ 25: 1, 24: 1 });
    expect(f.fps.offCanon).toEqual([{ comp: 'Pre-comp 3', fps: 24 }]);
    expect(f.fps.nested).toEqual([{ comp: 'Overlay', fps: 25, layer: 'Pre-comp 3', sourceFps: 24 }]);
    expect(f.fps.footage).toEqual([{ name: 'clip.mp4', fps: 24, file: 'C:/CRBK/packs/podcast/media/clip.mp4' }]);
    expect(f.colors.list.map((c) => [c.hex, c.status, c.nearest])).toEqual([['#D3D3D3', 'off', '#F2F2F2']]);
    expect(f.colors.bg).toEqual({ '#000000': 1, '#222222': 1 });
    expect(f.stills).toEqual([{ comp: 'Overlay', layer: 'Still 2025-12-10 132207_1.1.1.png', file: 'C:/CRBK/packs/podcast/media/still.png' }]);
    expect(f.stillsHidden).toBe(1);
    expect(f.outsideSlots).toEqual([{ file: 'C:/CRBK/packs/podcast/media/still.png', layers: 1, comps: ['Overlay'] }]);
    expect(f.timeRemap).toEqual([{ comp: 'Overlay', layer: 'Pre-comp 3', issues: ['удержание 1–5 с (кадр 1 с)', 'обратный ход 5–6 с'] }]);
    expect(f.negativeStretch).toEqual([{ comp: 'Overlay', layer: 'Pre-comp 3', stretch: -100 }]);
    expect(f.missing).toEqual([{ name: 'slide_01.png', file: 'G:/Курсы/slide_01.png' }]);
  });

  it('reports a freeze frame and a hold key', () => {
    const b = podcast();
    b.comps[0].layers[3].props[0].keys = [{ time: 0, value: 2, outInterp: 'HOLD' }, { time: 3, value: 4, outInterp: 'LINEAR' }];
    expect(diagnose(b).timeRemap[0].issues).toEqual(['удержание ключом HOLD 0–3 с']);
    b.comps[0].layers[3].props[0] = { matchName: 'ADBE Time Remapping', name: 'Time Remap', pvt: 'OneD', value: 1.5 };
    expect(diagnose(b).timeRemap[0].issues).toEqual(['без ключей: стоп-кадр 1.5 с']);
  });

  it('renders the report with a summary table and sections', () => {
    const md = renderDoctor(diagnose(podcast(), { palette: loadPalette(null), relink: RELINK }), { date: '2026-10-05', dumpDir: 'C:/CRBK/work/dumps/podcast' });
    expect(md).toContain('# Доктор пакета: podcast');
    expect(md).toContain('| Движок выражений | extendscript (устаревший); выражений 1, с ошибкой 1 |');
    expect(md).toContain('| Пропавший футаж | 1 |');
    expect(md).toContain('| slide_01.png | G:/Курсы/slide_01.png |');
    expect(md).toContain('| Не Classic 3D | 1 комп. |');
    expect(md).toContain('| Имена в NFD | 2 |');
    expect(md).toContain('| Частоты кадров | 24 fps × 1, 25 fps × 1; не 25 fps: композиций 1, вложений с другой частотой 1, видеофутажа 1 |');
    expect(md).toContain('| #D3D3D3 | #F2F2F2 | 6.85 | fill | 1 | 0 | Overlay › Shape Layer 1 |');
    expect(md).toContain('| Overlay | Pre-comp 3 | удержание 1–5 с (кадр 1 с); обратный ход 5–6 с |');
    expect(md).toContain('Карта перелинковки: `C:/CRBK/packs/podcast/relink-map.json`, записей 1.');
    expect(md).not.toContain('\r');
  });

  it('says when the relink map is missing', () => {
    const md = renderDoctor(diagnose(podcast()), { dumpDir: 'x' });
    expect(md).toContain('Карта перелинковки не найдена');
    expect(md).toContain('Палитра: палитра D1 из спецификации (§9).');
  });
});
