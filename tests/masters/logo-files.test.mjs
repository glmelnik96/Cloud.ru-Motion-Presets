// LOGO_Files «Логотип: файлы»: the four schemes of the brand book, the SVGs written from the master logo, the logo on
// the header's cube in every frame, the files and the library entry they make; the master's expressions run in Node
// on a stand-in comp (tests/helpers/master-expr.mjs). Resolves from the dumps: the build machine only.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { masterParts } from '../../tools/dump/logo-diff.mjs';
import { P } from '../../tools/masters/spec.mjs';
import { exprComp } from '../helpers/master-expr.mjs';

const REPO = path.resolve(import.meta.dirname, '../..');
const HAS_DUMPS = existsSync('C:/CRBK/work/dumps/webinars/logoblok_s_chelkoy.json');
const rgba = (h) => [1, 3, 5].map((i) => Math.round((parseInt(h.slice(i, i + 2), 16) / 255) * 1e6) / 1e6).concat(1);

describe.skipIf(!HAS_DUMPS)('LOGO_Files', async () => {
  // vitest runs a skipped body to collect its tests: without the dumps it must not read them
  if (!HAS_DUMPS) return;
  const { resolve, libraryEntry, logoSvg } = await import('../../masters/LOGO_Files/resolve.mjs');
  const { resolve: header } = await import('../../masters/LOGO_Header/resolve.mjs');
  const p = resolve();
  const master = readFileSync(path.join(REPO, 'brand', 'logo', 'master-ae-motion-live.svg'), 'utf8');
  const comp = (w, h, Scheme = 1) => exprComp(p.spec, { w, h, ink: () => ({ l: 0, w: 0 }), ctrl: { Scheme } });

  it('takes the four combinations of the brand book', () => {
    expect(p.schemes.map((s) => [s.key, s.colours.mark, s.colours.wordmark, s.plate])).toEqual([
      ['dark', '#26D07C', '#FFFFFF', '#222222'],
      ['light', '#26D07C', '#222222', '#FFFFFF'],
      ['green', '#222222', '#222222', '#26D07C'],
      ['mono', '#FFFFFF', '#FFFFFF', '#222222'],
    ]);
    // the previews show each scheme on its plate
    const ref = JSON.parse(readFileSync(path.join(REPO, 'masters', 'LOGO_Files', 'ref.json'), 'utf8'));
    expect(ref.preview.backdropColor).toEqual(p.schemes.map((s, i) => ({ when: { scheme: i + 1 }, color: s.plate })));
  });

  it('writes the SVG from the master logo: the same outlines in the scheme\'s colours, tight to the drawing', () => {
    const svg = p.files.find((f) => f.key === 'svg_light').content;
    const a = masterParts(svg);
    const b = masterParts(master);
    expect(a.parts).toEqual(b.parts);
    expect(svg).toContain('<path fill="#26D07C" d=');
    expect(svg).toContain('<path fill="#222222" d=');
    expect(svg).toMatch(/viewBox="0 0 340\.5 63"/);
    // the master's green marks its cube; the file takes the scheme's colour (a black mark on green)
    expect(logoSvg(master, { mark: '#222222', wordmark: '#222222' }).match(/fill="#222222"/g)).toHaveLength(2);
    expect(() => logoSvg('<svg><path d="M0 0" fill="#FFFFFF"/></svg>', { mark: '#000000', wordmark: '#000000' })).toThrow(/cube and a wordmark/);
  });

  it('puts the logo on the header\'s cube and scales it with the frame\'s short side', () => {
    expect(p.layout.cube).toEqual(header().layout.logo.cube);
    expect([p.layout.boxes.all.x0, p.layout.boxes.all.x1].map((v) => Math.round(v * 10) / 10)).toEqual([80, 391]);
    expect(comp(1920, 1080).at('LOGO', P.scale, 0)).toEqual([100, 100]);
    expect(comp(3840, 2160).at('LOGO', P.scale, 0)).toEqual([200, 200]);
    expect(comp(1080, 1920).at('LOGO', P.scale, 0)).toEqual([100, 100]);
    expect(comp(1080, 1080).at('LOGO', P.scale, 0)).toEqual([100, 100]);
  });

  it('colours the logo by «Схема»', () => {
    p.schemes.forEach((s, i) => {
      const c = comp(1920, 1080, i + 1);
      expect(c.at('LOGO', P.fill('Cube'), 0)).toEqual(rgba(s.colours.mark));
      expect(c.at('LOGO', P.fill('Wordmark'), 0)).toEqual(rgba(s.colours.wordmark));
    });
  });

  it('lists a PNG of each format and an SVG per scheme; the library entry agrees', () => {
    expect(p.files.map((f) => f.key)).toEqual(['dark', 'light', 'green', 'mono'].flatMap((s) => [`16x9_${s}`, `16x9_4K_${s}`, `9x16_${s}`, `1x1_${s}`, `svg_${s}`]));
    expect(p.files.filter((f) => f.kind === 'still').every((f) => f.t === 0 && f.ctrl.Scheme === f.options.scheme)).toBe(true);
    const lib = JSON.parse(readFileSync(path.join(REPO, 'library', 'library.src.json'), 'utf8'));
    expect(lib.items.find((i) => i.id === 'LOGO_Files')).toEqual(libraryEntry(p));
    const e = libraryEntry(p);
    expect(e.variants.find((v) => v.key === '16x9_4K_mono')).toMatchObject({ aspect: '16x9', w: 3840, h: 2160, options: { scheme: 4 } });
    expect(e.variants.find((v) => v.key === 'svg_green')).toEqual({ key: 'svg_green', options: { scheme: 3 }, minHostVersion: { ae: '26.0', pr: '26.0' } });
  });
});
