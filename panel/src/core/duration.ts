// Insert length (plan P3, contract C27). The default is the template length intro + hold + outro; the minimum is
// intro + outro: the protected regions are sized for 0.75x speed (C44), so a shorter clip cuts into them and the
// C27 time-remap keys run backwards. Premiere counts time in ticks, AE in seconds; both snap to the frame grid.
import type { HostKey, Item } from './types';

export const TICKS_PER_SECOND = 254016000000;
const TPS = BigInt(TICKS_PER_SECOND);

// Rounded to 1e-6 (1 us for seconds): 2.84 + 0.76 + 1.4 is 4.999999999999999 and 2.2 * 25 is 55.00000000000001.
export const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

export function defaultLen(item: Item): number {
  const d = item.duration;
  return d ? round6(d.introSec + d.holdSec + d.outroSec) : 0;
}

export function minLen(item: Item): number {
  const d = item.duration;
  return d ? round6(d.introSec + d.outroSec) : 0;
}

// Nearest whole frame.
export function toFrames(sec: number, fps: number): number {
  return Math.round(round6(sec * fps));
}

export function framesToSec(frames: number, fps: number): number {
  return round6(frames / fps);
}

// The fewest frames of an insert that passed the minimum: intro + outro rounded up to a frame. AE gets a whole frame
// of hold on top for its C27 remap. At L == minLen keys 2 and 3 share a time, and Property.setValueAtTime on an
// existing key time replaces that key: the intro and the hold would then play squeezed into the intro's time (TTL:
// 4 s in 2.2 s). A hold of less than a frame is no safer: both keys can fall between the same two frames, so the hold
// is never drawn, and AE may round key times to the frame grid. At 30 fps LOGO_Shot (127.2 frames) gets 129, not 128.
// planInsert sends a length on the template length's own frame unremapped, before this applies. Premiere's RDT plays
// a clip of exactly intro + outro as made.
export function minFrames(item: Item, fps: number, host: HostKey): number {
  const min = Math.ceil(round6(minLen(item) * fps));
  return host === 'ae' && item.duration ? min + 1 : min;
}

// Frames of an insert lenSec long at fps. Rounding may not take a length that passed the minimum below minFrames:
// 4.24 s at 30 fps is 127.2 frames, and 127 would clip the outro, so it becomes 128 (129 in AE). A length under the
// minimum keeps its plain rounding: preflight refuses it with LENGTH_TOO_SHORT. 0 when lenSec or fps is not usable.
export function insertFrames(item: Item, lenSec: number, fps: number, host: HostKey): number {
  if (!Number.isFinite(lenSec) || !(fps > 0)) return 0;
  const frames = toFrames(lenSec, fps);
  return lenSec + 1e-6 >= minLen(item) ? Math.max(frames, minFrames(item, fps, host)) : frames;
}

// Premiere ticks as a plain decimal string. Whole seconds go through BigInt: exact at any length, and never the
// exponent form String() gives past 1e21. The fraction is rounded to a tick on its own, so frame-grid times of the
// usual rates stay exact up to 9 h (2^15 s), where seconds times ticks in Number math is a tick off from 4.5 h on.
// Past that a double cannot carry the frame exactly: buildArgs prefers the playhead ticks of the context.
export function secToTicks(sec: number): string {
  if (!Number.isFinite(sec)) throw new RangeError('secToTicks: not a time: ' + sec);
  const whole = Math.floor(sec);
  const part = Math.round((sec - whole) * TICKS_PER_SECOND);
  return (BigInt(whole) * TPS + BigInt(part)).toString();
}

// Time-remap keys [layer time, template time] that make an AE instance L seconds long (C27; a port of remapKeys in
// spikes/s3-instance/analyze.mjs): the intro and the outro play at template speed, the hold takes up the change.
// D is the template length, inSec the end of the intro, outSec the start of the outro. Below minLen the keys run
// backwards; at L == minLen the hold is gone and keys 2 and 3 share a time, which AE cannot hold (minFrames).
export function c27Keys(D: number, inSec: number, outSec: number, L: number): [number, number][] {
  return [
    [0, 0],
    [round6(inSec), round6(inSec)],
    [round6(L - (D - outSec)), round6(outSec)],
    [round6(L), round6(D)],
  ];
}
