// The comps of the packs from the JSX dumps (tools/dump/comps.mjs), for planning the masters.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compsMarkdown, extractComps } from '../../tools/dump/comps.mjs';

describe('comps inventory', () => {
  it('records size, timing, markers, fields, nesting and Essential Graphics', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-comps-'));
    mkdirSync(path.join(dir, 'titles'));
    writeFileSync(path.join(dir, 'titles', 'index.json'), JSON.stringify({ comps: [{ file: 'a.json' }, { file: 'b.json' }] }));
    const text = (name, t) => ({ name, type: 'text', switches: {}, props: [{ matchName: 'ADBE Text Properties', children: [{ matchName: 'ADBE Text Document', value: { text: t, font: 'SBSansDisplay-Semibold', fontSize: 54 } }] }] });
    writeFileSync(path.join(dir, 'titles', 'a.json'), JSON.stringify({ comp: { name: 'Подпись 16x9', width: 1920, height: 1080, frameRate: 25, duration: 8, workAreaStart: 0, workAreaDuration: 6, usedIn: [], mgtName: 'Подпись', mgtControllerCount: 4, markers: [{ time: 1, comment: 'intro' }] },
      layers: [text('Имя', 'Анна  Петрова'), { name: 'Плашка pre', type: 'av', source: { kind: 'comp', name: 'Плашка' }, switches: { threeDLayer: true } }], stats: { expressions: 3 } }));
    writeFileSync(path.join(dir, 'titles', 'b.json'), JSON.stringify({ comp: { name: 'Плашка', width: 1920, height: 1080, frameRate: 25, duration: 8, usedIn: [12] }, layers: [] }));
    const comps = extractComps(dir);
    expect(comps[0]).toEqual({ pack: 'titles', name: 'Подпись 16x9', folder: null, w: 1920, h: 1080, fps: 25, duration: 8, workArea: [0, 6], root: true, usedIn: 0,
      egp: { name: 'Подпись', controllers: 4 }, markers: [{ time: 1, comment: 'intro' }], layers: 2, texts: [{ layer: 'Имя', text: 'Анна Петрова', font: 'SBSansDisplay-Semibold', size: 54 }],
      precomps: ['Плашка'], threeD: true, missing: [], off: [], expressions: 3 });
    expect(comps[1]).toMatchObject({ name: 'Плашка', root: false, egp: null });
    expect(compsMarkdown(comps)).toContain('| titles | Подпись 16x9 | 1920×1080 | 25 | 8 | да | 4 | 1 intro | Имя |');
  });

  it('names the footage a master would lose: missing files and file layers switched off', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-comps-'));
    mkdirSync(path.join(dir, 'courses_conv'));
    writeFileSync(path.join(dir, 'courses_conv', 'index.json'), JSON.stringify({ comps: [{ file: 'a.json' }] }));
    writeFileSync(path.join(dir, 'courses_conv', 'a.json'), JSON.stringify({ comp: { name: 'Visual', width: 1920, height: 1080, frameRate: 25, duration: 5 }, layers: [
      { name: '3D', type: 'av', switches: { enabled: true }, source: { kind: 'file', missing: true, file: '/Users/x/Desktop/3D.png' } },
      { name: 'K8s', type: 'av', switches: { enabled: false }, source: { kind: 'file', missing: false, hasVideo: true, file: 'C:\\CRBK\\packs\\courses\\Kubernetes.png' } },
      { name: 'Solid', type: 'av', switches: { enabled: false }, source: { kind: 'solid' } },
    ] }));
    const [c] = extractComps(dir);
    expect(c).toMatchObject({ missing: [{ layer: '3D', file: '3D.png' }], off: [{ layer: 'K8s', file: 'Kubernetes.png' }] });
    expect(compsMarkdown([c])).toContain('| нет: 3D.png; выкл.: Kubernetes.png |');
  });
});
