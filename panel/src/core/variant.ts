// Variant choice by frame size (plan P1; spec 4.3, 8.2). Only an exact w x h is chosen automatically: an AE-made
// MOGRT does not adapt to the sequence, so FHD in a QHD sequence would come out the wrong size. Without an exact
// variant the panel refuses and offers the nearest one, which the user may still pick in the format chip.
import type { Item, Variant } from './types';

export interface Frame {
  w: number;
  h: number;
  fps?: number;
}

export type VariantMatch = 'exact' | 'manual' | 'none';

export interface VariantChoice {
  variant: Variant | null;
  match: VariantMatch;
  nearest?: Variant; // only with match 'none': what to offer
}

type Sized = Variant & { w: number; h: number };

const SAME_ASPECT = 0.01; // the library's own aspect tolerance (rule 'aspect' in tools/library/validate.mjs)
const EPS = 1e-9;

const isSized = (v: Variant): v is Sized => typeof v.w === 'number' && typeof v.h === 'number' && v.w > 0 && v.h > 0;
const sameFps = (a?: number, b?: number) => a !== undefined && b !== undefined && Math.round(a * 1000) === Math.round(b * 1000);

export function chooseVariant(item: Item, target: Frame | null, manualKey?: string): VariantChoice {
  if (manualKey) {
    const manual = item.variants.find((v) => v.key === manualKey);
    if (manual) return { variant: manual, match: 'manual' };
  }
  if (!target || !(target.w > 0) || !(target.h > 0)) return { variant: null, match: 'none' };
  const sized = item.variants.filter(isSized);
  const exact = sized.filter((v) => v.w === target.w && v.h === target.h);
  // Two variants of one frame (say 25p and 30p) are told apart by fps; the catalog rules allow neither today.
  const pick = exact.find((v) => sameFps(v.fps, target.fps)) ?? exact[0];
  if (pick) return { variant: pick, match: 'exact' };
  const nearest = nearestVariant(sized, target);
  return nearest ? { variant: null, match: 'none', nearest } : { variant: null, match: 'none' };
}

// The same aspect (within 1 %) with the closest area; with no such variant, the closest aspect (as a ratio, so
// 1:2 and 2:1 are equally far from 1:1), then the closest area. Ties keep the library order.
export function nearestVariant(variants: Variant[], target: Frame): Variant | undefined {
  const ratio = target.w / target.h;
  const area = target.w * target.h;
  const pool = variants.filter(isSized);
  const same = pool.filter((v) => Math.abs(ratio - v.w / v.h) / (v.w / v.h) <= SAME_ASPECT);
  const aspectGap = (v: Sized) => (same.length ? 0 : Math.abs(Math.log(v.w / v.h / ratio)));
  const areaGap = (v: Sized) => Math.abs(v.w * v.h - area);
  let best: Sized | undefined;
  for (const v of same.length ? same : pool) {
    if (!best) {
      best = v;
      continue;
    }
    const d = aspectGap(v) - aspectGap(best);
    if (d < -EPS || (Math.abs(d) <= EPS && areaGap(v) < areaGap(best))) best = v;
  }
  return best;
}

// The template name Premiere gives the clip and the capsule: the .mogrt base name ('TTL_LowerThird_16x9_v1').
export function templateName(variant: Variant): string {
  const base = (variant.file ?? '').split('/').pop() ?? '';
  return base.replace(/\.[^.]*$/, '');
}

// '2560x1440' with the multiplication sign U+00D7, as the panel shows a frame.
export function frameLabel(w: number, h: number): string {
  return `${w}\u00d7${h}`;
}
