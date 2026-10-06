// «Вписать в окно» in Premiere (spec 6 «fitToWindow», 6.1 «Рецепт „вписать в окно“»; spike S7): the clip selected
// on the timeline gets Motion Scale and Position so that it fills a window of the frame template
// (`windows[]` of the item, rects in the frame of the variant). A screen window has the proportion of the
// recording (D9) and needs no cut; a portrait speaker window takes a 16:9 recording by its height, and the
// overflow is cut by Crop added through QE (its name depends on the UI language; S7: «Crop», matchName
// AE.ADBE AECrop). Without Crop the panel says to put the speaker clip under the screen clip or crop by hand.
// The math lives here; the adapter reads the clip (selectedClip) and writes the numbers (fitClip).
import type { HostCaller } from './host';
import { error, messages, warning, type Problem } from './problems';
import type { HostContext, Item, Values, Variant } from './types';
import { pickVariant } from './variant';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FitWindow {
  key: string;
  label_ru: string;
  rect: Rect;
}

// Crop names tried through QE: the effect list follows the language of the Premiere interface.
export const CROP_NAMES = ['Crop', 'Обрезка', 'Обрезать'];

const whenMatches = (when: Record<string, number | boolean> | undefined, values: Values) =>
  !when || Object.entries(when).every(([k, v]) => values[k] === v);

// The windows of a variant for the values of the form.
export function windowsFor(item: Item, variant: Variant, values: Values = {}): FitWindow[] {
  const out: FitWindow[] = [];
  for (const w of item.windows ?? []) {
    const r = w.rects.find((x) => x.variant === variant.key && whenMatches(x.when, values));
    if (r) out.push({ key: w.key, label_ru: w.label_ru, rect: { x: r.x, y: r.y, w: r.w, h: r.h } });
  }
  return out;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

// A rect of the variant in the frame of the sequence: the template is centred and scaled by `scale` (P1).
export function toFrame(rect: Rect, variant: { w: number; h: number }, frame: { w: number; h: number }, scale: number): Rect {
  const cx = frame.w / 2 + (rect.x + rect.w / 2 - variant.w / 2) * scale;
  const cy = frame.h / 2 + (rect.y + rect.h / 2 - variant.h / 2) * scale;
  return { x: r3(cx - (rect.w * scale) / 2), y: r3(cy - (rect.h * scale) / 2), w: r3(rect.w * scale), h: r3(rect.h * scale) };
}

export interface ClipInfo {
  // Video track (0-based), start in ticks and name: how fitClip finds the clip again.
  track: number;
  startTicks: string;
  name: string;
  // Size of the source in pixels and its pixel aspect ratio.
  src: { w: number; h: number; par: number };
  // Motion at the start of the clip: Position in pixels of the sequence, Scale and Scale Width in percent
  // (Scale Width counts when Uniform Scale is off). Read since 0.1.19 for «Размыть поля».
  motion?: { position: [number, number]; scale: number; scaleWidth: number | null; uniform: boolean | null };
}

export interface FitNumbers {
  // Motion Scale in percent and Position in pixels of the sequence (the centre of the window).
  scale: number;
  position: [number, number];
  // Crop in percent of the source, or null when the clip fits the window exactly.
  crop: { left: number; top: number; right: number; bottom: number } | null;
}

// The clip covers the window and is centred in it; what sticks out is cut equally on both sides. A clip of
// the window's proportion is scaled only. Overflow under half a pixel is no overflow.
export function fitNumbers(src: ClipInfo['src'], rect: Rect): FitNumbers {
  const w0 = src.w * (src.par || 1);
  const h0 = src.h;
  const s = Math.max(rect.w / w0, rect.h / h0);
  const w = w0 * s;
  const h = h0 * s;
  const ox = (w - rect.w) / 2;
  const oy = (h - rect.h) / 2;
  const cut = ox > 0.5 || oy > 0.5;
  const lr = ox > 0.5 ? r3((ox / w) * 100) : 0;
  const tb = oy > 0.5 ? r3((oy / h) * 100) : 0;
  return {
    scale: r3(s * 100),
    position: [r3(rect.x + rect.w / 2), r3(rect.y + rect.h / 2)],
    crop: cut ? { left: lr, top: tb, right: lr, bottom: tb } : null,
  };
}

export interface FitRequest {
  targetId: string;
  window: string;
  label: string;
  rect: Rect;
  frame: { w: number; h: number };
}

export interface FitPlan {
  ok: boolean;
  problems: Problem[];
  request: FitRequest | null;
}

// The window of the variant the form would insert, in the frame of the active sequence.
export function planFit(item: Item, ctx: HostContext, values: Values, windowKey: string, manualVariant: string | null = null): FitPlan {
  const problems: Problem[] = [];
  if (ctx.host !== 'pr') return { ok: false, problems: [error('NOT_SUPPORTED', messages.notSupported(ctx.host))], request: null };
  const t = ctx.target;
  if (!t) return { ok: false, problems: [error('NO_TARGET', messages.noTarget('pr'))], request: null };
  const pick = pickVariant(item, t, values, manualVariant);
  const v = pick.variant;
  if (!v || !v.w || !v.h) return { ok: false, problems: [error('NO_VARIANT', messages.noVariant(t.w, t.h))], request: null };
  const win = windowsFor(item, v, values).find((w) => w.key === windowKey);
  if (!win) return { ok: false, problems: [error('NOT_SUPPORTED', messages.fitNoWindow(windowKey))], request: null };
  return {
    ok: true,
    problems,
    request: { targetId: t.id, window: win.key, label: win.label_ru, rect: toFrame(win.rect, { w: v.w, h: v.h }, t, pick.scale), frame: { w: t.w, h: t.h } },
  };
}

// What fitClip of the adapter answers: the values read back.
export interface FitReply {
  name: string;
  scale: number;
  position: [number, number];
  normalized: boolean;
  crop: FitNumbers['crop'];
  cropAdded: boolean;
  // Crop was needed and QE could not add it.
  cropMissing: boolean;
}

export async function runFit(caller: HostCaller, req: FitRequest): Promise<{ ok: boolean; problems: Problem[]; numbers: FitNumbers | null; reply: FitReply | null }> {
  const info = await caller.call<ClipInfo>('selectedClip', { targetId: req.targetId });
  if (!info.ok || !info.data) {
    const code = info.error?.code;
    if (code === 'NO_SELECTION') return { ok: false, problems: [error('NO_SELECTION', messages.fitSelection(info.error?.message ?? ''))], numbers: null, reply: null };
    if (code === 'NO_TARGET') return { ok: false, problems: [error('NO_TARGET', messages.noTarget('pr'))], numbers: null, reply: null };
    if (code === 'NO_SIZE') return { ok: false, problems: [error('FIT_FAILED', messages.fitNoSize())], numbers: null, reply: null };
    return { ok: false, problems: [error('HOST_ERROR', messages.hostError('pr', info.error?.message ?? 'нет ответа'), info.error)], numbers: null, reply: null };
  }
  const numbers = fitNumbers(info.data.src, req.rect);
  const r = await caller.call<FitReply>('fitClip', { targetId: req.targetId, clip: info.data, frame: req.frame, ...numbers, cropNames: CROP_NAMES }, { mutating: true, timeoutMs: 30000 });
  if (!r.ok || !r.data) {
    return { ok: false, problems: [error('FIT_FAILED', messages.fitFailed(r.error?.message ?? 'нет ответа'), r.error)], numbers, reply: null };
  }
  const problems: Problem[] = [];
  if (r.data.cropMissing) problems.push(warning('FIT_NO_CROP', messages.fitNoCrop()));
  return { ok: true, problems, numbers, reply: r.data };
}
