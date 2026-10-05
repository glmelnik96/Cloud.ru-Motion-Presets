// Length of an insert (spec 6.1 step 1, contract C27): one rule for both hosts, then a mechanism per fit.
//   rdt  — Premiere: the clip is cut to the length, Responsive Design-Time keeps the intro and the outro (S5);
//          AE: time remap on the instance, keys 0→0, in→in, (L − outro)→out, L→D (S3, contract C27).
//   trim — the comp has the longest length (duration.maxSec), the clip is cut, and the service slider
//          «Длительность» gets the real length so the outro lands at the end.
import { error, messages, type Problem } from './problems';
import { isActive } from './fields';
import type { Field, Item, Values } from './types';

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

export function toFrames(sec: number, fps: number): number {
  return Math.round(r6(sec * fps));
}

export function fromFrames(frames: number, fps: number): number {
  return r6(frames / fps);
}

// Length of the template comp D (rdt), or of the longest insert (trim).
export function templateSec(item: Item): number {
  const d = item.duration;
  if (!d) return 0;
  if (item.fit === 'trim' && d.maxSec !== undefined) return d.maxSec;
  return r6(d.introSec + d.holdSec + d.outroSec);
}

export function drivingField(item: Item): Field | null {
  return (item.fields ?? []).find((f) => f.drivesDuration) ?? null;
}

export function serviceDurationField(item: Item): Field | null {
  return (item.fields ?? []).find((f) => f.service && f.type === 'slider') ?? null;
}

// The length the form proposes: the driving field when it is on (minutes of a timer × 60 s + outro),
// else the default length of the item (intro + hold + outro).
export function defaultLengthSec(item: Item, values: Values = {}): number {
  const d = item.duration;
  if (!d) return 0;
  const f = drivingField(item);
  if (f && isActive(f, values) && typeof values[f.key] === 'number') {
    return r6((values[f.key] as number) * (f.unitSec ?? 1) + d.outroSec);
  }
  return r6(d.introSec + d.holdSec + d.outroSec);
}

// The intro and the outro must both fit, with at least one frame between them.
export function minLengthSec(item: Item, fps: number): number {
  const d = item.duration;
  if (!d) return 0;
  return r6(d.introSec + d.outroSec + 1 / fps);
}

export function maxLengthSec(item: Item): number {
  return item.fit === 'trim' ? templateSec(item) : Infinity;
}

export type Key = [number, number];

// Time-remap keys of an AE instance (layer time → template time), or null when the instance plays as is.
export function remapKeys(item: Item, lengthSec: number, fps: number): Key[] | null {
  const d = item.duration;
  if (!d || item.fit !== 'rdt') return null;
  const D = templateSec(item);
  if (Math.abs(lengthSec - D) < 0.5 / fps) return null;
  const outStart = r6(D - d.outroSec);
  return [
    [0, 0],
    [d.introSec, d.introSec],
    [r6(lengthSec - d.outroSec), outStart],
    [r6(lengthSec), D],
  ];
}

export interface LengthPlan {
  sec: number;
  frames: number;
  // Premiere: the track must be free over the longer of the insert and the template as placed.
  placeSec: number;
  remap: Key[] | null;
  // trim: the value of the service slider «Длительность» (seconds).
  serviceDuration: { egpName: string; value: number } | null;
  problems: Problem[];
}

export function planLength(item: Item, requestedSec: number | null | undefined, values: Values, fps: number): LengthPlan {
  const want = requestedSec ?? defaultLengthSec(item, values);
  const frames = Math.max(1, toFrames(want, fps));
  const sec = fromFrames(frames, fps);
  const problems: Problem[] = [];
  const min = minLengthSec(item, fps);
  const max = maxLengthSec(item);
  if (sec + 1e-6 < min) problems.push(error('TOO_SHORT', messages.tooShort(sec, min), { sec, min }));
  if (sec - 1e-6 > max) problems.push(error('TOO_LONG', messages.tooLong(sec, max), { sec, max }));
  const svc = item.fit === 'trim' ? serviceDurationField(item) : null;
  return {
    sec,
    frames,
    placeSec: Math.max(sec, templateSec(item)),
    remap: remapKeys(item, sec, fps),
    serviceDuration: svc && svc.egpName ? { egpName: svc.egpName, value: sec } : null,
    problems,
  };
}
