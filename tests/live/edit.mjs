// Live check of «Монтаж» in Premiere (panel/src/core/edit.ts):
// - «Размыть поля» (D11): a checkerboard still on V1, selected, through runBlur and the Bridge; then the clip has
//   Fast Blur, V2 holds the copy of the same time with Crop, and a frame rendered by Premiere is sharp inside the
//   margins (every pixel as in the source) and blurred on them (a cell border turns grey);
// - «Стиль субтитров» (D25): the .prtextstyle of the build PC imported into the BrandKit bin once, as «CR Субтитры».
// tests/panel/edit-live.test.mjs runs it dry on the fake.
import { blurNumbers, planStyle, runBlur, runStyle } from '../../panel/src/core/edit.ts';

// The checkerboard: cells of 48 px, black from the top left corner (ffmpeg geq in media.live.mjs).
export const CELL = 48;
export const checker = (x, y) => ((Math.floor(x / CELL) + Math.floor(y / CELL)) % 2 ? 255 : 0);

// Inside: the middle of cells away from the margins; on the margins: points on a border between two cells.
export const SHARP_POINTS = [[984, 552], [600, 312], [1320, 792], [120, 120], [1800, 960]];
export const BLURRED_POINTS = [[20, 528], [1900, 528], [960 + 24, 20], [960 + 24, 1062]];

const near = (a, b, eps) => a !== null && a !== undefined && Math.abs(a - b) <= eps;

export async function runEditLive(o) {
  const { bridge, hostRun, R } = o;
  const setup = R.fromHost('blur: setup', await hostRun('setup', { targets: [{ key: 'blur', name: 'BK blur', w: 1920, h: 1080, fps: 25 }] }));
  const id = setup?.ids?.blur;
  if (id) {
    if (R.fromHost('blur: place', await hostRun('fitPlace', { id, file: o.checker, track: 0, startSec: 0 }))) {
      R.fromHost('blur: activate', await hostRun('activate', { id, time: 1 }));
      const ctx = (await bridge.call('getContext')).data;
      const out = await runBlur(bridge, ctx.target);
      if (R.check('blur: done', out.ok, { problems: out.problems, reply: out.reply })) {
        const n = blurNumbers({ w: 1920, h: 1080 }, { x: 0, y: 0, w: 1920, h: 1080 });
        R.check('blur: no warnings on a clean still', out.problems.length === 0, out.problems);
        R.check('blur: Fast Blur 20 on the clip, the copy on V2', near(out.reply.blurriness, 20, 0.01) && out.reply.copyTrack === 1, out.reply);
        R.check('blur: Crop of the copy 2.734 / 4.722 %', ['left', 'top', 'right', 'bottom'].every((k) => near(out.reply.crop[k], n.crop[k], 0.01)), out.reply.crop);
        const state = R.fromHost('blur: the timeline', await hostRun('editState', { id }));
        if (state) {
          const v1 = state.video[0] ?? [];
          const v2 = state.video[1] ?? [];
          R.check('blur: V1 — the clip with Fast Blur, V2 — one copy of the same time with Crop and without Fast Blur',
            v1.length === 1 && v2.length === 1 && v1[0].fx.includes('AE.ADBE Fast Blur') && v2[0].fx.includes('AE.ADBE AECrop') && !v2[0].fx.includes('AE.ADBE Fast Blur') && v1[0].start === v2[0].start && v1[0].end === v2[0].end, state);
        }
        const frame = await o.frame(id, 25, 'blur');
        if (R.check('blur: frame rendered', !!frame, frame)) {
          const sharp = SHARP_POINTS.map(([x, y]) => ({ x, y, want: checker(x, y), got: o.gray(frame, x, y) }));
          R.check('blur: inside the margins the frame is the source (±3)', sharp.every((p) => near(p.got, p.want, 3)), sharp);
          const soft = BLURRED_POINTS.map(([x, y]) => ({ x, y, got: o.gray(frame, x, y) }));
          R.check('blur: on the margins a cell border is grey (30…225)', soft.every((p) => p.got > 30 && p.got < 225), soft);
        }
      }
    }
  }
  if (!o.style) {
    R.check('style: no .prtextstyle on this PC — skipped', true, null, false);
    return;
  }
  const item = { id: 'CRS_SubtitleStyle', title_ru: 'Стиль', category: 'courses', tier: 'T3', hosts: ['pr'], version: 1, textStyle: 'CR Субтитры', variants: [{ key: 'style', file: o.style.file, minHostVersion: {} }] };
  const req = planStyle(item, { host: 'pr', version: '', project: { saved: true, path: null }, target: null }, o.style.root).request;
  const first = await runStyle(bridge, req);
  R.check('style: imported into the BrandKit bin as «CR Субтитры»', first.ok && first.reply?.imported === true && first.reply.name === 'CR Субтитры', first);
  const again = await runStyle(bridge, req);
  R.check('style: a second time it is found, not imported again', again.ok && again.reply?.imported === false, again);
}
