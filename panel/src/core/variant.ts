// Choosing the variant of an item for the active comp or sequence (spec 4.3): an AE-made MOGRT does not adapt
// to the sequence, so the panel picks the format by frame size. The manual format switch wins; without an
// exact size the nearest variant is offered and scaled into the frame.
import type { Item, Values, Variant } from './types';

export interface Frame {
  w: number;
  h: number;
}

export type PickReason = 'manual' | 'exact' | 'aspect' | 'nearest' | 'any' | 'none';

export interface VariantPick {
  variant: Variant | null;
  reason: PickReason;
  // Uniform scale that fits the variant into the frame (1 for an exact size). Only for sized variants.
  scale: number;
  // True when the frame and the variant differ and the user has to agree to the nearest one.
  needsConsent: boolean;
}

const ASPECT_TOLERANCE = 0.01;

export function sameAspect(a: Frame, b: Frame): boolean {
  const ra = a.w / a.h;
  const rb = b.w / b.h;
  return Math.abs(ra - rb) / rb <= ASPECT_TOLERANCE;
}

export function fitScale(v: Frame, frame: Frame): number {
  return Math.min(frame.w / v.w, frame.h / v.h);
}

// Variants whose prerender options (colour, logo, plate of a T2 file) agree with the values of the form.
export function variantsForValues(item: Item, values: Values = {}): Variant[] {
  return item.variants.filter((v) => Object.entries(v.options ?? {}).every(([k, want]) => !(k in values) || values[k] === want));
}

const sized = (v: Variant): v is Variant & { w: number; h: number } => typeof v.w === 'number' && typeof v.h === 'number';

function pick(variant: Variant, reason: PickReason, frame: Frame): VariantPick {
  if (!sized(variant)) return { variant, reason, scale: 1, needsConsent: false };
  const exact = variant.w === frame.w && variant.h === frame.h;
  const scale = exact ? 1 : fitScale(variant, frame);
  return { variant, reason, scale, needsConsent: !exact && reason !== 'manual' };
}

export function pickVariant(item: Item, frame: Frame, values: Values = {}, manualKey?: string | null): VariantPick {
  const pool = variantsForValues(item, values);
  if (manualKey) {
    const m = pool.find((v) => v.key === manualKey);
    if (m) return pick(m, 'manual', frame);
  }
  if (!pool.length) return { variant: null, reason: 'none', scale: 1, needsConsent: false };
  const withSize = pool.filter(sized);
  if (!withSize.length) return pick(pool[0], 'any', frame);

  const exact = withSize.find((v) => v.w === frame.w && v.h === frame.h);
  if (exact) return pick(exact, 'exact', frame);

  const same = withSize.filter((v) => sameAspect(v, frame));
  if (same.length) return pick(bestBySize(same, frame), 'aspect', frame);

  // Other proportions: the closest ratio, then the size rule among the variants of that ratio.
  const ratio = frame.w / frame.h;
  const dist = (v: { w: number; h: number }) => Math.abs(Math.log(v.w / v.h / ratio));
  const d0 = Math.min(...withSize.map(dist));
  return pick(bestBySize(withSize.filter((v) => dist(v) - d0 < 1e-9), frame), 'nearest', frame);
}

// The smallest variant that still covers the frame (scaled down, stays sharp); if every variant is smaller
// than the frame, the largest one. Ties keep the catalog order.
function bestBySize<V extends { w: number; h: number }>(list: V[], frame: Frame): V {
  const rank = (v: V) => {
    const s = fitScale(v, frame);
    return s <= 1 + 1e-9 ? [0, -s] : [1, s];
  };
  return list.slice().sort((a, b) => {
    const [ga, sa] = rank(a);
    const [gb, sb] = rank(b);
    return ga - gb || sa - sb;
  })[0];
}

// "16:9 · 1920×1080 · 25p" for the format chip.
export function variantLabel(v: Variant): string {
  const aspect = v.aspect ? v.aspect.replace('x', ':') : v.key;
  const size = v.w && v.h ? ` · ${v.w}×${v.h}` : '';
  const fps = v.fps ? ` · ${v.fps}p` : '';
  return aspect + size + fps;
}
