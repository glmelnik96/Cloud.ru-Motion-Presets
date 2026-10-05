// T2 and T3 files on the timeline (spec 6.1 «Premiere, элементы T2/T3», «After Effects», особые случаи):
// loops repeated end to end up to the length, transitions by their cut marker, stills, sounds, and the
// companions of a T1 template (the video under it, music and sound effects by the D14 checkboxes).
// The core lays every file out as pieces with times on the target timeline; the adapters only resolve the
// natural length of a file they imported and place it. Files are copied next to the project by the panel
// (Node, before the host call): a 4K loop takes longer to copy than a host call may last (decision P11).
import { error, messages, warning, type Problem } from './problems';
import { basename, BIN_NAME, dirname, joinPath, libraryFile, projectAssetDir } from './paths';
import { fromFrames, toFrames } from './timing';
import type { Companion, Host, HostTarget, Item, Variant } from './types';
import { pickVariant, type VariantPick } from './variant';

export type MediaKind = 'loop' | 'transition' | 'still' | 'sound' | 'clip';
export type PieceRole = 'intro' | 'loop' | 'outro' | 'clip' | 'still' | 'sound' | 'transition';

// One file on the timeline. Start: startSec, or for a piece aligned to its end, endSec (then it starts at
// endSec minus its length, not before floorSec). Length: lengthSec exactly (a loop repeats every periodSec
// up to it, a still is held for it), else the natural length of the file, at most maxSec.
export interface MediaPiece {
  role: PieceRole;
  source: string;
  file: string;
  startSec?: number;
  endSec?: number;
  floorSec?: number;
  lengthSec?: number | null;
  maxSec?: number | null;
  periodSec?: number | null;
}

export interface Backdrop {
  color: [number, number, number];
  // Premiere: a still of the frame size the panel writes next to the project; AE makes a solid.
  file: string | null;
  w: number;
  h: number;
  startSec: number;
  lengthSec: number;
}

// Video pieces go on one track (one layer each in AE), the backdrop right under them, each sound on a
// free audio track. `scale` fits a variant of another size into the frame.
export interface MediaLayout {
  video: MediaPiece[];
  backdrop: Backdrop | null;
  audio: MediaPiece[];
  scale: number;
}

export interface CopyJob {
  from: string;
  to: string;
}

export interface SolidJob {
  path: string;
  w: number;
  h: number;
  color: [number, number, number];
}

// Files the panel puts next to the project before it calls the host.
export interface Prepare {
  copies: CopyJob[];
  solids: SolidJob[];
}

export const BACKDROP_HEX = '#222222';
export const BACKDROP_RGB: [number, number, number] = [0x22, 0x22, 0x22];
// Premiere: nearest cut within this many seconds of the playhead (decision P13).
export const CUT_WINDOW_SEC = 5;
export const STILL_DEFAULT_SEC = 5;

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const ext = (f: string | undefined) => (f ? (/\.([A-Za-z0-9]+)$/.exec(f)?.[1] ?? '').toLowerCase() : '');

// The file that stands for a variant: its own file, or the first of its parts.
export function variantFile(v: Variant): string | undefined {
  return v.file ?? v.parts?.intro?.file ?? v.parts?.loop?.file ?? v.parts?.outro?.file;
}

// The panel places video (.mov), stills (.png) and sounds (.wav); .svg is for layouts, .ffx and the export
// presets have tabs of their own.
const PLACEABLE = ['mov', 'png', 'wav'];

export function placeable(v: Variant): boolean {
  return PLACEABLE.includes(ext(variantFile(v)));
}

export function mediaKind(item: Item, v: Variant): MediaKind | null {
  const e = ext(variantFile(v));
  if (e === 'wav') return 'sound';
  if (e === 'png') return 'still';
  if (e !== 'mov') return null;
  if (item.cutFrame !== undefined) return 'transition';
  if (item.loop || v.parts?.loop) return 'loop';
  return 'clip';
}

// Whether the host can insert the item from the panel at all; the rest is hidden (spec 7).
export function insertable(item: Item, host: Host): boolean {
  if (!item.hosts.includes(host)) return false;
  if (item.tier === 'T1') return true;
  return item.variants.some(placeable);
}

// Media variants the panel may pick: placeable ones only, so a .png wins over its .svg twin.
export function pickMediaVariant(item: Item, frame: { w: number; h: number }, manualKey?: string | null): VariantPick {
  return pickVariant({ ...item, variants: item.variants.filter(placeable) }, frame, {}, manualKey);
}

function parts(v: Variant) {
  const fps = v.fps ?? 25;
  const sec = (frames: number | undefined) => (frames ? fromFrames(frames, fps) : 0);
  return { introSec: sec(v.parts?.intro?.frames), outroSec: sec(v.parts?.outro?.frames), fps };
}

export function loopPeriodSec(item: Item, v: Variant): number {
  const fps = v.fps ?? 25;
  const frames = v.parts?.loop?.frames ?? item.loop?.periodFrames ?? 0;
  return frames ? fromFrames(frames, fps) : 0;
}

// The length a loop is made when the user leaves the field empty: up to the end of the work area or of the
// in/out range when it lies after the playhead, else intro + one period + outro (decision P12).
export function defaultMediaLengthSec(item: Item, v: Variant | null, target: HostTarget | null): number | null {
  if (!v) return null;
  const kind = mediaKind(item, v);
  if (kind === 'still') return item.duration?.holdSec ?? STILL_DEFAULT_SEC;
  if (kind !== 'loop') return null;
  const p = parts(v);
  const one = r6(p.introSec + loopPeriodSec(item, v) + p.outroSec);
  if (target && typeof target.rangeEndSec === 'number') {
    const left = r6(target.rangeEndSec - target.timeSec);
    if (left >= Math.max(one / 10, p.introSec + p.outroSec + 1 / target.fps)) return left;
  }
  return one;
}

// The shortest loop keeps its intro and outro and one frame of the loop between them.
export function minMediaLengthSec(item: Item, v: Variant, fps: number): number {
  if (mediaKind(item, v) !== 'loop') return r6(1 / fps);
  const p = parts(v);
  return r6(p.introSec + p.outroSec + 1 / fps);
}

export interface PieceFiles {
  source: string;
  file: string;
}

// A library file and its copy in «Cloud.ru BrandKit/<id>@<version>/» next to the project.
export function pieceFiles(libraryRoot: string, assetDir: string, file: string): PieceFiles {
  return { source: libraryFile(libraryRoot, file), file: joinPath(assetDir, basename(file)) };
}

// A loop from startSec for lengthSec: intro, the loop part repeated end to end, outro. Lengths on the frame
// grid of the target so the pieces meet without a gap.
export function loopPieces(item: Item, v: Variant, startSec: number, lengthSec: number, fps: number, at: (file: string) => PieceFiles): MediaPiece[] {
  const p = parts(v);
  const total = toFrames(lengthSec, fps);
  const introF = toFrames(p.introSec, fps);
  const outroF = toFrames(p.outroSec, fps);
  const loopF = Math.max(1, total - introF - outroF);
  const period = loopPeriodSec(item, v);
  const out: MediaPiece[] = [];
  const s = (frames: number) => r6(startSec + fromFrames(frames, fps));
  if (v.parts?.intro) out.push({ role: 'intro', ...at(v.parts.intro.file), startSec: s(0), lengthSec: fromFrames(introF, fps) });
  const loopFile = v.parts?.loop?.file ?? v.file;
  if (loopFile) out.push({ role: 'loop', ...at(loopFile), startSec: s(introF), lengthSec: fromFrames(loopF, fps), periodSec: period || null });
  if (v.parts?.outro) out.push({ role: 'outro', ...at(v.parts.outro.file), startSec: s(introF + loopF), lengthSec: fromFrames(outroF, fps) });
  return out;
}

// The cut nearest to the playhead within the window; ties go to the earlier cut.
export function nearestCut(cuts: number[], t: number, windowSec = CUT_WINDOW_SEC): number | null {
  let best: number | null = null;
  for (const c of cuts) {
    const d = Math.abs(c - t);
    if (d > windowSec + 1e-9) continue;
    if (best === null || d < Math.abs(best - t) - 1e-9 || (Math.abs(d - Math.abs(best - t)) < 1e-9 && c < best)) best = c;
  }
  return best;
}

export interface MediaPlanInput {
  item: Item;
  host: Host;
  target: HostTarget;
  projectPath: string;
  libraryRoot: string;
  lengthSec?: number | null;
  variantKey?: string | null;
  backdrop?: boolean | null;
  // Premiere: edges of the clips around the playhead (getCuts), for transitions.
  cuts?: number[] | null;
}

export interface MediaLayoutPlan {
  kind: MediaKind | null;
  pick: VariantPick;
  layout: MediaLayout | null;
  startSec: number;
  lengthSec: number | null;
  problems: Problem[];
}

// Whether the #222222 backdrop goes under an item when the user has not said: backgrounds get it.
export function backdropDefault(item: Item): boolean {
  return item.alpha === true && item.category === 'backgrounds';
}

// Premiere has no scripted colour matte: the backdrop is a still the panel writes once per frame size.
export function backdropPath(projectPath: string, w: number, h: number): string {
  return joinPath(dirname(projectPath), BIN_NAME, `backdrop_222222_${w}x${h}.png`);
}

// The layout of a T2/T3 item inserted on its own (spec 6.1): the variant, the length, the pieces.
export function planMediaLayout(input: MediaPlanInput): MediaLayoutPlan {
  const { item, host, target } = input;
  const problems: Problem[] = [];
  const pick = pickMediaVariant(item, target, input.variantKey);
  const v = pick.variant;
  const none = (kind: MediaKind | null = null): MediaLayoutPlan => ({ kind, pick, layout: null, startSec: target.timeSec, lengthSec: null, problems });
  if (!v) {
    problems.push(error('NOT_SUPPORTED', messages.notSupported(host), { id: item.id, why: 'no placeable variant' }));
    return none();
  }
  const kind = mediaKind(item, v);
  if (!kind) {
    problems.push(error('NOT_SUPPORTED', messages.notSupported(host), { id: item.id, variant: v.key }));
    return none();
  }
  const assetDir = projectAssetDir(input.projectPath, item.id, item.version);
  const at = (file: string) => pieceFiles(input.libraryRoot, assetDir, file);
  const fps = target.fps;
  let startSec = target.timeSec;
  let lengthSec: number | null = null;
  const video: MediaPiece[] = [];
  const audio: MediaPiece[] = [];

  if (kind === 'loop' || kind === 'still') {
    const want = input.lengthSec ?? defaultMediaLengthSec(item, v, target) ?? STILL_DEFAULT_SEC;
    lengthSec = fromFrames(Math.max(1, toFrames(want, fps)), fps);
    const min = minMediaLengthSec(item, v, fps);
    if (lengthSec + 1e-6 < min) problems.push(error('TOO_SHORT', messages.tooShort(lengthSec, min), { sec: lengthSec, min }));
    if (kind === 'loop') video.push(...loopPieces(item, v, startSec, lengthSec, fps, at));
    else video.push({ role: 'still', ...at(v.file as string), startSec, lengthSec });
  } else if (kind === 'transition') {
    // The marker of full cover meets the cut: the nearest one in Premiere, the current time in AE.
    let cut = startSec;
    if (host === 'pr') {
      const near = nearestCut(input.cuts ?? [], target.timeSec);
      if (near === null) problems.push(warning('NO_CUT', messages.noCut(CUT_WINDOW_SEC)));
      else cut = near;
    }
    const cutSec = fromFrames(item.cutFrame ?? 0, v.fps ?? fps);
    startSec = fromFrames(toFrames(cut - cutSec, fps), fps);
    if (host === 'pr' && startSec < -1e-6) {
      problems.push(error('TOO_EARLY', messages.tooEarly(cutSec), { cut, cutSec }));
    }
    video.push({ role: 'transition', ...at(v.file as string), startSec });
  } else if (kind === 'clip') {
    video.push({ role: 'clip', ...at(v.file as string), startSec });
  } else {
    audio.push({ role: 'sound', ...at(v.file as string), startSec });
  }

  const wantBackdrop = item.alpha === true && video.length > 0 && kind !== 'transition' && (input.backdrop ?? backdropDefault(item));
  const backdrop: Backdrop | null = wantBackdrop && lengthSec !== null
    ? { color: BACKDROP_RGB, file: host === 'pr' ? backdropPath(input.projectPath, target.w, target.h) : null, w: target.w, h: target.h, startSec, lengthSec }
    : null;
  return { kind, pick, layout: { video, backdrop, audio, scale: Math.round(pick.scale * 1e6) / 1e6 }, startSec, lengthSec, problems };
}

export interface CompanionInput {
  item: Item;
  host: Host;
  target: HostTarget;
  projectPath: string;
  libraryRoot: string;
  lookup: (id: string) => Item | undefined;
  sound: { music: boolean; sfx: boolean };
  // Where the template landed: its start and its length on the timeline.
  startSec: number;
  lengthSec: number;
}

export function companionOn(c: Companion, sound: { music: boolean; sfx: boolean }): boolean {
  if (c.kind === 'music') return sound.music;
  if (c.kind === 'sfx') return sound.sfx;
  return c.default;
}

// Companions of a T1 template (spec 4.4, 6.1 steps 7 and 9): the video under the template for its whole
// length (a loop repeats), sounds by placement — in: from the start, out: ending with the template,
// under: the whole length; neither runs past the template (decision P15). A companion that cannot be placed
// is left out with a warning; the template still goes in.
export function planCompanions(input: CompanionInput): { layout: MediaLayout | null; problems: Problem[] } {
  const problems: Problem[] = [];
  const video: MediaPiece[] = [];
  const audio: MediaPiece[] = [];
  const end = r6(input.startSec + input.lengthSec);
  let scale = 1;
  for (const c of input.item.companions ?? []) {
    if (!companionOn(c, input.sound)) continue;
    const ref = input.lookup(c.ref);
    const skip = (why: string) => problems.push(warning('COMPANION', messages.companion(ref?.title_ru ?? c.ref), { ref: c.ref, why }));
    if (!ref || !ref.hosts.includes(input.host)) { skip('not in the library for this host'); continue; }
    const pick = pickMediaVariant(ref, input.target);
    const v = pick.variant;
    const kind = v ? mediaKind(ref, v) : null;
    if (!v || !kind) { skip('no placeable variant'); continue; }
    const at = (file: string) => pieceFiles(input.libraryRoot, projectAssetDir(input.projectPath, ref.id, ref.version), file);
    if (c.kind === 'video') {
      if (kind === 'loop') video.push(...loopPieces(ref, v, input.startSec, input.lengthSec, input.target.fps, at));
      else if (kind === 'still') video.push({ role: 'still', ...at(v.file as string), startSec: input.startSec, lengthSec: input.lengthSec });
      else video.push({ role: 'clip', ...at(v.file as string), startSec: input.startSec, maxSec: input.lengthSec });
      scale = Math.round(pick.scale * 1e6) / 1e6;
      if (pick.needsConsent) problems.push(warning('NEAREST_VARIANT', messages.nearest(input.target.w, input.target.h, v.key), { ref: c.ref, scale }));
      continue;
    }
    if (kind !== 'sound') { skip('not a sound'); continue; }
    const file = at(v.file as string);
    if (c.placement === 'out') audio.push({ role: 'sound', ...file, endSec: end, floorSec: input.startSec });
    else audio.push({ role: 'sound', ...file, startSec: input.startSec, maxSec: input.lengthSec });
  }
  if (!video.length && !audio.length) return { layout: null, problems };
  return { layout: { video, backdrop: null, audio, scale }, problems };
}

// What the panel copies and writes before the host call.
export function prepareFor(...layouts: Array<MediaLayout | null>): Prepare {
  const copies = new Map<string, CopyJob>();
  const solids: SolidJob[] = [];
  for (const l of layouts) {
    if (!l) continue;
    for (const p of [...l.video, ...l.audio]) copies.set(p.file.toLowerCase(), { from: p.source, to: p.file });
    if (l.backdrop?.file) solids.push({ path: l.backdrop.file, w: l.backdrop.w, h: l.backdrop.h, color: l.backdrop.color });
  }
  return { copies: [...copies.values()], solids };
}
