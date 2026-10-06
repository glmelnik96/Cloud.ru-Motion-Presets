// «Монтаж» in Premiere: what the podcast and the courses need beside the catalog.
//
// «Размыть поля» (D11). The pack blurs the margins of the podcast frame with an adjustment layer: Fast Box Blur
// radius 15, 3 iterations, Repeat Edge Pixels, under an inverted rectangle mask 105/102 px in from the edges
// of the 4K frame. Premiere 26.5 has no Fast Box Blur, and neither an adjustment layer, an effect mask nor an
// effect preset can be set by a script (probes of the build PC, 2026-10-06/07). The same picture comes from two
// copies of the clip: the clip itself gets Fast Blur (20 at 1080p, 38 at 4K — the width of the kernel matched
// by frames), and a copy on the track above, cut by Crop to the inside of the margins, keeps the centre sharp
// (RMS 1.6 of 255 at 1080p and 0.15 at 4K against the preset with the mask). The panel does both through QE.
//
// «Стиль субтитров» (D25). The style «CR Субтитры» is a Track Style file (.prtextstyle) of the library;
// app.project.importFiles brings it into the project and Premiere lists it under Track Style. A script cannot
// give it to a caption track: the editor picks it in the list, one click per track.
import type { ClipInfo, Rect } from './fit';
import { CROP_NAMES } from './fit';
import type { HostCaller } from './host';
import { BIN_NAME, libraryFile } from './paths';
import { error, messages, warning, type Problem } from './problems';
import type { Catalog, HostContext, Item } from './types';

// The numbers of the pack (docs/research/premiere/blur-and-captions.json) in a frame whose short side is
// 1080; other frames scale by their short side.
export const BLUR_FIELDS = { marginPx: { x: 52.5, y: 51 }, blurriness: { at1080: 20, at2160: 38 } };
// Fast Blur by the names of the effect list, which follow the language of the Premiere interface.
export const FAST_BLUR_NAMES = ['Fast Blur', 'Быстрое размытие'];

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const shortSide = (frame: { w: number; h: number }) => Math.min(frame.w, frame.h);

export function blurriness(frame: { w: number; h: number }): number {
  const b = BLUR_FIELDS.blurriness;
  const s = shortSide(frame);
  return Math.max(1, Math.round((b.at1080 + ((s - 1080) * (b.at2160 - b.at1080)) / 1080) * 10) / 10);
}

export function fieldMargins(frame: { w: number; h: number }): { x: number; y: number } {
  const k = shortSide(frame) / 1080;
  return { x: r3(BLUR_FIELDS.marginPx.x * k), y: r3(BLUR_FIELDS.marginPx.y * k) };
}

// Where the clip lies in the frame of the sequence: its source scaled by Motion around Position.
export function clipRect(src: ClipInfo['src'], motion: NonNullable<ClipInfo['motion']>): Rect {
  const sy = motion.scale / 100;
  const sx = motion.uniform === false && motion.scaleWidth !== null ? motion.scaleWidth / 100 : sy;
  const w = src.w * (src.par || 1) * sx;
  const h = src.h * sy;
  return { x: r3(motion.position[0] - w / 2), y: r3(motion.position[1] - h / 2), w: r3(w), h: r3(h) };
}

export interface BlurNumbers {
  blurriness: number;
  margins: { x: number; y: number };
  // Crop of the sharp copy in percent of the clip: what lies in the margins of the frame.
  crop: { left: number; top: number; right: number; bottom: number };
  // The clip covers the whole frame (else the margins are blurred only where it is).
  covers: boolean;
}

export function blurNumbers(frame: { w: number; h: number }, rect: Rect): BlurNumbers {
  const m = fieldMargins(frame);
  const pct = (v: number, size: number) => r3(Math.min(100, Math.max(0, (v / size) * 100)));
  const covers = rect.x <= 0.5 && rect.y <= 0.5 && rect.x + rect.w >= frame.w - 0.5 && rect.y + rect.h >= frame.h - 0.5;
  return {
    blurriness: blurriness(frame),
    margins: m,
    crop: {
      left: pct(m.x - rect.x, rect.w),
      right: pct(rect.x + rect.w - (frame.w - m.x), rect.w),
      top: pct(m.y - rect.y, rect.h),
      bottom: pct(rect.y + rect.h - (frame.h - m.y), rect.h),
    },
    covers,
  };
}

// What blurFields of the adapter answers.
export interface BlurReply {
  name: string;
  // Video track (0-based) of the sharp copy.
  copyTrack: number;
  blurriness: number;
  crop: BlurNumbers['crop'];
  // Effects of the clip the copy did not get (Lumetri and the like), and whether Motion or Opacity had keys.
  effects: string[];
  keyed: boolean;
}

export interface BlurOutcome {
  ok: boolean;
  problems: Problem[];
  numbers: BlurNumbers | null;
  reply: BlurReply | null;
}

export function planBlur(ctx: HostContext): Problem[] {
  if (ctx.host !== 'pr') return [error('NOT_SUPPORTED', messages.notSupported(ctx.host))];
  if (!ctx.target) return [error('NO_TARGET', messages.noTarget('pr'))];
  return [];
}

export async function runBlur(caller: HostCaller, target: { id: string; w: number; h: number }): Promise<BlurOutcome> {
  const info = await caller.call<ClipInfo>('selectedClip', { targetId: target.id });
  if (!info.ok || !info.data) {
    const code = info.error?.code;
    if (code === 'NO_SELECTION') return { ok: false, problems: [error('NO_SELECTION', messages.blurSelection(info.error?.message ?? ''))], numbers: null, reply: null };
    if (code === 'NO_TARGET') return { ok: false, problems: [error('NO_TARGET', messages.noTarget('pr'))], numbers: null, reply: null };
    if (code === 'NO_SIZE') return { ok: false, problems: [error('BLUR_FAILED', messages.blurFailed('Premiere не сообщил размер кадра клипа'))], numbers: null, reply: null };
    return { ok: false, problems: [error('HOST_ERROR', messages.hostError('pr', info.error?.message ?? 'нет ответа'), info.error)], numbers: null, reply: null };
  }
  const frame = { w: target.w, h: target.h };
  const motion = info.data.motion ?? { position: [frame.w / 2, frame.h / 2] as [number, number], scale: 100, scaleWidth: null, uniform: null };
  const numbers = blurNumbers(frame, clipRect(info.data.src, motion));
  const { motion: _m, ...clip } = info.data;
  const r = await caller.call<BlurReply>('blurFields', { targetId: target.id, clip, blurriness: numbers.blurriness, crop: numbers.crop, blurNames: FAST_BLUR_NAMES, cropNames: CROP_NAMES }, { mutating: true, timeoutMs: 60000 });
  if (!r.ok || !r.data) {
    const code = r.error?.code;
    if (code === 'NO_TRACK') return { ok: false, problems: [error('BLUR_NO_TRACK', messages.blurNoTrack(info.data.track + 2))], numbers, reply: null };
    if (code === 'ALREADY') return { ok: false, problems: [error('BLUR_DONE', messages.blurDone())], numbers, reply: null };
    if (code === 'NO_TARGET') return { ok: false, problems: [error('NO_TARGET', messages.blurSelection('клип сдвинулся'))], numbers, reply: null };
    return { ok: false, problems: [error('BLUR_FAILED', messages.blurFailed(r.error?.message ?? 'нет ответа'), r.error)], numbers, reply: null };
  }
  const problems: Problem[] = [];
  if (!numbers.covers) problems.push(warning('BLUR_NOT_FULL', messages.blurNotFull()));
  if (r.data.effects.length) problems.push(warning('BLUR_EFFECTS', messages.blurEffects(r.data.effects)));
  if (r.data.keyed) problems.push(warning('BLUR_KEYED', messages.blurKeyed()));
  return { ok: true, problems, numbers, reply: r.data };
}

// ---- «Стиль субтитров» ----

export function textStyles(catalog: Catalog | null): Item[] {
  return (catalog?.items ?? []).filter((i) => i.textStyle && i.hosts.includes('pr') && i.variants.some((v) => /\.prtextstyle$/i.test(v.file ?? '')));
}

export interface StyleRequest {
  id: string;
  name: string;
  file: string;
  bin: string;
}

export function planStyle(item: Item, ctx: HostContext, libraryRoot: string): { problems: Problem[]; request: StyleRequest | null } {
  if (ctx.host !== 'pr') return { problems: [error('NOT_SUPPORTED', messages.notSupported(ctx.host))], request: null };
  const v = item.variants.find((x) => /\.prtextstyle$/i.test(x.file ?? ''));
  if (!v || !item.textStyle) return { problems: [error('STYLE_FAILED', messages.styleNone())], request: null };
  return { problems: [], request: { id: item.id, name: item.textStyle, file: libraryFile(libraryRoot, v.file as string), bin: BIN_NAME } };
}

// What importTextStyle answers: the style item in the project, and whether it was there already.
export interface StyleReply {
  name: string;
  imported: boolean;
}

export async function runStyle(caller: HostCaller, req: StyleRequest): Promise<{ ok: boolean; problems: Problem[]; reply: StyleReply | null }> {
  const r = await caller.call<StyleReply>('importTextStyle', req, { mutating: true, timeoutMs: 30000 });
  if (!r.ok || !r.data) {
    const msg = r.error?.code === 'NO_FILE' ? 'нет файла стиля в библиотеке, запустите установщик заново' : r.error?.message ?? 'нет ответа';
    return { ok: false, problems: [error('STYLE_FAILED', messages.styleFailed(msg), r.error)], reply: null };
  }
  return { ok: true, problems: [], reply: r.data };
}
