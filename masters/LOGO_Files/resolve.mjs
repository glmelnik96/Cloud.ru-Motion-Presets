// LOGO_Files «Логотип: файлы»: the master logo (D18) as files (spec 5, «Логотипы-файлы»: T3, SVG and PNG, «цветной,
// моно, на тёмном и светлом») in the four schemes the brand book allows (tokens color.logoVariants, pp. 9 and 15):
// - PNG: a frame of 16:9 (FHD and 4K), 9:16 and 1:1 on a transparent ground with the logo where the header has it
//   (LOGO_Header: on the cube of the webinars pack's «Логоблок с челкой»), rendered in AE; the panel places it;
// - SVG: the logo alone, tight to its drawing, for layouts; written here from the master SVG, the panel shows it in
//   its folder.
// Built from a declarative spec (tools/masters/jsx/build-spec.jsx); choices: masters/LOGO_Files/README.md.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workDir, workPath } from '../../tools/lib/work.mjs';
import { fitCube, masterBoxes, masterLockup } from '../../tools/masters/logo.mjs';
import { addQaPatch } from '../../tools/masters/rig-plate.mjs';
import { nul, P, pathGroup, shape, Spec } from '../../tools/masters/spec.mjs';
import { headerLayout, loadSources } from '../LOGO_Header/resolve.mjs';

export const ID = 'LOGO_Files';
export const COMP = 'CR_LOGO_Files';
const FPS = 25;
const DEFAULT_SEC = 10;
const FORMATS = ['16x9', '16x9_4K', '9x16', '1x1'];
// the schemes in the order of the form: the key names the files, logo is the brand book's combination
export const SCHEMES = [
  { key: 'dark', logo: 'onBlack', label: 'Цветной, для тёмного фона' },
  { key: 'light', logo: 'onWhite', label: 'Цветной, для светлого фона' },
  { key: 'green', logo: 'onGreen', label: 'Чёрный, для зелёного фона' },
  { key: 'mono', logo: 'onBlackMono', label: 'Белый, для фото' },
];

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const js = (v) => JSON.stringify(v);
const rgba = (h) => [1, 3, 5].map((i) => r6(parseInt(h.slice(i, i + 2), 16) / 255)).concat(1);

// The logo alone in a scheme's colours: the master's two paths, the cube's and the wordmark's, in a viewBox tight to
// the drawing (the ascenders of the wordmark reach above the cube).
export function logoSvg(svgText, { mark, wordmark }) {
  const paths = [...svgText.matchAll(/<path\b[^>]*>/g)].map((m) => ({ d: /\sd="([^"]+)"/.exec(m[0])?.[1], fill: /\sfill="([^"]+)"/.exec(m[0])?.[1] }));
  const cube = paths.filter((p) => (p.fill || '').toUpperCase() === '#26D07C');
  if (paths.length !== 2 || cube.length !== 1 || paths.some((p) => !p.d)) throw new Error('the master logo is no longer a cube and a wordmark');
  const word = paths.find((p) => p !== cube[0]);
  const { all } = masterBoxes(svgText);
  const vb = [all.x0, all.y0, all.x1 - all.x0, all.y1 - all.y0].map(r6);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${vb[2]}" height="${vb[3]}" viewBox="${vb.join(' ')}">`,
    '<title>Cloud.ru</title>',
    `<path fill="${mark}" d="${cube[0].d}"/>`,
    `<path fill="${wordmark}" d="${word.d}"/>`,
    '</svg>',
    '',
  ].join('\n');
}

export function resolveFiles(sources = loadSources()) {
  const { svg, tokens } = sources;
  const base = tokens.color.base;
  const L = headerLayout(sources);
  const schemes = SCHEMES.map((s) => {
    const v = tokens.color.logoVariants[s.logo];
    if (!v) throw new Error(`the brand book has no ${s.logo} logo`);
    return { ...s, colours: { mark: base[v.mark].hex, wordmark: base[v.wordmark].hex }, plate: base[v.plate].hex };
  });
  const ctrl = { Scheme: { label: 'Схема', items: schemes.map((s) => s.label), value: 1 } };

  const spec = new Spec({ name: COMP, w: L.W, h: L.H, fps: FPS, duration: DEFAULT_SEC });
  // the logo on the header's cube (LOGO_Header), scaled with the frame's short side; its colours by «Схема»
  const lockup = masterLockup(svg, fitCube(svg, L.logo.cube));
  const first = schemes[0].colours;
  spec.add(shape('LOGO', [pathGroup('Wordmark', first.wordmark, lockup.wordmark), pathGroup('Cube', first.mark, lockup.cube)]));
  spec.expr('LOGO', P.scale, 'var k = Math.min(thisComp.width, thisComp.height) / 1080;\n[100 * k, 100 * k]');
  const pick = 'var s = thisComp.layer("CTRL").effect("Scheme")(1).value;\n';
  spec.expr('LOGO', P.fill('Wordmark'), pick + `${js(schemes.map((s) => rgba(s.colours.wordmark)))}[s - 1]`);
  spec.expr('LOGO', P.fill('Cube'), pick + `${js(schemes.map((s) => rgba(s.colours.mark)))}[s - 1]`);
  addQaPatch(spec, base.green.hex);
  spec.add(nul('CTRL', [
    { kind: 'dropdown', name: 'Scheme', items: ctrl.Scheme.items, value: ctrl.Scheme.value },
    { kind: 'checkbox', name: 'QA', value: false },
  ]));

  // the files: per scheme a still of each format (the first frame) and the logo as SVG
  const files = schemes.flatMap((s, i) => [
    ...FORMATS.map((variant) => ({ key: `${variant}_${s.key}`, variant, ctrl: { Scheme: i + 1 }, kind: 'still', t: 0, options: { scheme: i + 1 } })),
    { key: `svg_${s.key}`, kind: 'svg', content: logoSvg(svg, s.colours), options: { scheme: i + 1 } },
  ]);
  const built = spec.toJSON();
  return {
    id: ID,
    workDir: workDir(),
    out: { dir: workPath('build', ID), aep: workPath('build', ID, ID + '_work.aep') },
    comp: spec.comp,
    schemes,
    layout: { cube: L.logo.cube, boxes: lockup.boxes },
    ctrl,
    text: {},
    slots: {},
    egp: [],
    rig: {},
    markers: [],
    duration: { introSec: 0, holdSec: DEFAULT_SEC, outroSec: 0 },
    files,
    spec: {
      ...built,
      fonts: [],
      markers: [],
      egp: [],
      egpNames: [],
      measure: [],
      defaults: { text: {}, ctrl: { Scheme: 1 } },
    },
    check: {},
    version: 1,
    variants: FORMATS.map((key) => ({ key, ...tokens.video.formats[key] })),
    sweepTimes: [0],
    rest: 0,
  };
}

export const resolve = resolveFiles;

// The library entry (library.src.json): tier T3, «Схема» picks the files (variant options); the PNGs are frames the
// panel places by the format of the comp or sequence, the SVG is for layouts.
export function libraryEntry(p = resolveFiles()) {
  const minHostVersion = { ae: '26.0', pr: '26.0' };
  return {
    id: ID,
    title_ru: 'Логотип: файлы',
    category: 'logo',
    tier: 'T3',
    hosts: ['ae', 'pr'],
    version: p.version,
    duration: p.duration,
    fields: [{ key: 'scheme', label_ru: 'Схема', type: 'dropdown', default: 1, options: p.schemes.map((s, i) => ({ index: i + 1, label_ru: s.label })) }],
    variants: p.files.map((f) => {
      if (f.kind === 'svg') return { key: f.key, options: f.options, minHostVersion };
      const v = p.variants.find((x) => x.key === f.variant);
      return { key: f.key, aspect: f.variant === '16x9_4K' ? '16x9' : f.variant, w: v.w, h: v.h, fps: FPS, options: f.options, minHostVersion };
    }),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = resolveFiles();
  console.log(JSON.stringify({ layers: r.spec.order, expressions: r.spec.expressions.length, layout: r.layout, schemes: r.schemes, files: r.files.map((f) => f.key) }, null, 1));
}
