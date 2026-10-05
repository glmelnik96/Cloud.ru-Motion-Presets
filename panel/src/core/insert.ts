// Insert on click (spec 6.1): the core plans everything it can know before touching the host — variant,
// length, field writes, companions, refusals and warnings — and the adapter executes one request in one
// host call: insertItem for a T1 template with its companions, insertMedia for a T2/T3 file (media.ts).
import { colorProblems, fontProblems } from './checks';
import { validateValues, writesFor, type HostWrite } from './fields';
import type { HostCaller } from './host';
import { error, hasErrors, messages, warning, type Problem } from './problems';
import { planCompanions, planMediaLayout, prepareFor, type MediaKind, type MediaLayout, type Prepare } from './media';
import { BIN_NAME, libraryFile, libraryKey, projectAssetDir, projectPathProblem, type Platform } from './paths';
import { planLength, type Key } from './timing';
import type { FieldValue, FontStatus, Host, HostContext, HostTarget, Item, Values, Variant } from './types';
import { pickVariant, variantLabel, type VariantPick } from './variant';
import { atLeast, shortVersion } from './version';

export interface InsertRequest {
  id: string;
  version: number;
  title: string;
  fit: 'rdt' | 'trim';
  libraryKey: string;
  // The comp or sequence the plan was made for: the adapter refuses to act on any other (spec 8.2).
  targetId: string;
  startSec: number;
  lengthSec: number;
  lengthFrames: number;
  fps: number;
  placeSec: number;
  variant: { key: string; w: number | null; h: number | null; fps: number | null; file: string | null; aeComp: string | null };
  aep: string | null;
  scale: number;
  remap: Key[] | null;
  writes: HostWrite[];
  serviceDuration: { egpName: string; value: number } | null;
  assetDir: string | null;
  libraryRoot: string;
  bin: string;
  undoLabel: string;
  // The video under the template and the sounds (media.ts); placed in the same call, after the template.
  companions: MediaLayout | null;
  // Files the panel copies next to the project before the call; the adapter does not read it.
  prepare: Prepare;
  // Premiere: how long to look for the clip after importMGT (3000 ms when absent; S5 saw no clip later).
  waitMs?: number;
}

// A T2/T3 file inserted on its own (insertMedia of the adapters).
export interface MediaRequest {
  id: string;
  version: number;
  title: string;
  kind: MediaKind;
  libraryKey: string;
  targetId: string;
  startSec: number;
  lengthSec: number | null;
  fps: number;
  variant: { key: string; w: number | null; h: number | null; fps: number | null };
  layout: MediaLayout;
  bin: string;
  undoLabel: string;
  prepare: Prepare;
}

export interface InsertEnv {
  platform: Platform;
  libraryRoot: string;
}

export interface InsertOptions {
  lengthSec?: number | null;
  variantKey?: string | null;
  // The user agreed to the nearest variant when the frame has no exact one.
  acceptNearest?: boolean;
  // Music and sound effects checkboxes (D14); companions are left out when absent.
  sound?: { music: boolean; sfx: boolean } | null;
  // The #222222 backdrop under an alpha loop or still; null: the default of the item.
  backdrop?: boolean | null;
  // Premiere: clip edges around the playhead, for transitions (getCuts).
  cuts?: number[] | null;
}

export interface InsertInput {
  item: Item;
  ctx: HostContext;
  values: Values;
  fonts?: Record<string, FontStatus> | null;
  options?: InsertOptions;
  env: InsertEnv;
  // Other items of the catalog, for companions.
  lookup?: (id: string) => Item | undefined;
}

export interface InsertPlan {
  ok: boolean;
  problems: Problem[];
  pick: VariantPick | null;
  request: InsertRequest | null;
  media?: MediaRequest | null;
}

// What every insert checks before it touches the host: a target, a saved project with a short path.
function targetProblems(ctx: HostContext, env: InsertEnv, problems: Problem[]): HostTarget | null {
  const target = ctx.target;
  if (!target) {
    problems.push(error('NO_TARGET', messages.noTarget(ctx.host)));
    return null;
  }
  if (!ctx.project.saved || !ctx.project.path) problems.push(error('NOT_SAVED', messages.notSaved()));
  const pathProblem = projectPathProblem(env.platform, ctx.project.path);
  if (pathProblem) problems.push(pathProblem);
  return target;
}

function variantProblems(pick: VariantPick, v: Variant, ctx: HostContext, target: HostTarget, acceptNearest: boolean | undefined, problems: Problem[]): void {
  const host = ctx.host;
  if (pick.needsConsent) {
    const p = messages.nearest(target.w, target.h, variantLabel(v));
    problems.push(acceptNearest ? warning('NEAREST_VARIANT', p, { key: v.key, scale: pick.scale }) : error('NO_VARIANT', p, { key: v.key, scale: pick.scale }));
  }
  const need = v.minHostVersion?.[host];
  if (need && !atLeast(ctx.version, need)) problems.push(error('HOST_TOO_OLD', messages.hostTooOld(host, shortVersion(ctx.version), need)));
  if (v.fps && Math.abs(v.fps - target.fps) > 0.01) problems.push(warning('FPS_MISMATCH', messages.fps(v.fps, Math.round(target.fps * 1000) / 1000, host)));
}

// T1 goes to planInsert, T2/T3 to planMedia.
export function planItem(input: InsertInput): InsertPlan {
  return input.item.tier === 'T1' ? planInsert(input) : planMedia(input);
}

export function planMedia({ item, ctx, options = {}, env }: InsertInput): InsertPlan {
  const host = ctx.host;
  const problems: Problem[] = [];
  const done = (pick: VariantPick | null = null): InsertPlan => ({ ok: false, problems, pick, request: null, media: null });
  if (!item.hosts.includes(host) || item.tier === 'T1') {
    problems.push(error('NOT_SUPPORTED', messages.notSupported(host), { id: item.id, tier: item.tier }));
    return done();
  }
  const target = targetProblems(ctx, env, problems);
  if (!target) return done();
  const plan = planMediaLayout({
    item, host, target, projectPath: ctx.project.path ?? '', libraryRoot: env.libraryRoot,
    lengthSec: options.lengthSec, variantKey: options.variantKey, backdrop: options.backdrop, cuts: options.cuts,
  });
  const v = plan.pick.variant;
  if (v && plan.kind) variantProblems(plan.pick, v, ctx, target, options.acceptNearest, problems);
  problems.push(...plan.problems);
  if (hasErrors(problems) || !plan.layout || !plan.kind || !v) return done(plan.pick);
  const media: MediaRequest = {
    id: item.id,
    version: item.version,
    title: item.title_ru,
    kind: plan.kind,
    libraryKey: libraryKey(item.id, item.version),
    targetId: target.id,
    startSec: plan.startSec,
    lengthSec: plan.lengthSec,
    fps: target.fps,
    variant: { key: v.key, w: v.w ?? null, h: v.h ?? null, fps: v.fps ?? null },
    layout: plan.layout,
    bin: BIN_NAME,
    undoLabel: `BrandKit: ${item.title_ru}`,
    prepare: prepareFor(plan.layout),
  };
  return { ok: true, problems, pick: plan.pick, request: null, media };
}

export function planInsert({ item, ctx, values, fonts, options = {}, env, lookup }: InsertInput): InsertPlan {
  const host: Host = ctx.host;
  const problems: Problem[] = [];
  const done = (pick: VariantPick | null = null): InsertPlan => ({ ok: false, problems, pick, request: null });

  if (!item.hosts.includes(host) || item.tier !== 'T1' || !item.fit || !item.duration) {
    problems.push(error('NOT_SUPPORTED', messages.notSupported(host), { id: item.id, tier: item.tier }));
    return done();
  }
  const target = targetProblems(ctx, env, problems);
  if (!target) return done();

  const pick = pickVariant(item, target, values, options.variantKey);
  const v = pick.variant;
  if (!v) {
    problems.push(error('NO_VARIANT', messages.noVariant(target.w, target.h)));
    return done(pick);
  }
  variantProblems(pick, v, ctx, target, options.acceptNearest, problems);
  if (fonts) problems.push(...fontProblems(item, fonts));
  if (host === 'ae') problems.push(...colorProblems(ctx.color));
  problems.push(...validateValues(item, values, host));

  const length = planLength(item, options.lengthSec, values, target.fps);
  problems.push(...length.problems);

  const file = host === 'pr' ? v.file ?? null : null;
  if (host === 'pr' && !file) problems.push(error('NOT_SUPPORTED', messages.notSupported(host), { id: item.id, variant: v.key, why: 'no MOGRT' }));
  if (host === 'ae' && (!item.aep || !v.aeComp)) problems.push(error('NOT_SUPPORTED', messages.notSupported(host), { id: item.id, variant: v.key, why: 'no aep' }));

  if (hasErrors(problems)) return done(pick);

  const companions = options.sound && lookup && ctx.project.path
    ? planCompanions({ item, host, target, projectPath: ctx.project.path, libraryRoot: env.libraryRoot, lookup, sound: options.sound, startSec: target.timeSec, lengthSec: length.sec })
    : { layout: null, problems: [] };
  problems.push(...companions.problems);

  const request: InsertRequest = {
    id: item.id,
    version: item.version,
    title: item.title_ru,
    fit: item.fit,
    libraryKey: libraryKey(item.id, item.version),
    targetId: target.id,
    startSec: target.timeSec,
    lengthSec: length.sec,
    lengthFrames: length.frames,
    fps: target.fps,
    placeSec: length.placeSec,
    variant: {
      key: v.key,
      w: v.w ?? null,
      h: v.h ?? null,
      fps: v.fps ?? null,
      file: file ? libraryFile(env.libraryRoot, file) : null,
      aeComp: host === 'ae' ? v.aeComp ?? null : null,
    },
    aep: host === 'ae' && item.aep ? libraryFile(env.libraryRoot, item.aep.file) : null,
    scale: Math.round(pick.scale * 1e6) / 1e6,
    remap: host === 'ae' ? length.remap : null,
    writes: writesFor(item, values, host),
    serviceDuration: length.serviceDuration,
    assetDir: host === 'ae' && ctx.project.path ? projectAssetDir(ctx.project.path, item.id, item.version) : null,
    libraryRoot: env.libraryRoot,
    bin: BIN_NAME,
    undoLabel: `BrandKit: ${item.title_ru}`,
    companions: companions.layout,
    prepare: prepareFor(companions.layout),
  };
  return { ok: true, problems, pick, request };
}

// What insertItem of an adapter answers (panel/host/ae.jsx, pr.jsx).
export interface InsertReply {
  name: string;
  startSec: number;
  lengthSec: number;
  readback: Record<string, FieldValue>;
  imported?: boolean;
  track?: number;
  layerId?: number;
  retried?: boolean;
  addedTracks?: number;
  notes?: string[];
  companions?: PlacedPiece[];
}

// A file as the adapter placed it: on a track (Premiere, `clips` when a loop took several) or as a layer (AE).
export interface PlacedPiece {
  role: string;
  name: string;
  startSec: number;
  lengthSec: number;
  track?: number;
  audio?: boolean;
  clips?: number;
  layerId?: number;
}

// What insertMedia of an adapter answers.
export interface MediaReply {
  name: string;
  startSec: number;
  lengthSec: number;
  placed: PlacedPiece[];
  imported: number;
  addedTracks?: number;
  notes?: string[];
}

// The pieces of a layout the way the adapter must have placed them, in its order: video, backdrop, audio.
// Only what the plan fixed is compared: exact starts and exact lengths (natural lengths are the host's).
export function placementMismatches(layout: MediaLayout, placed: PlacedPiece[], fps: number): string[] {
  const want: Array<{ role: string; startSec?: number; lengthSec?: number | null }> = [
    ...layout.video,
    ...(layout.backdrop ? [{ role: 'backdrop', startSec: layout.backdrop.startSec, lengthSec: layout.backdrop.lengthSec }] : []),
    ...layout.audio,
  ];
  const tol = 0.5 / fps + 1e-6;
  const out: string[] = [];
  want.forEach((w, i) => {
    const p = placed[i];
    if (!p || p.role !== w.role) { out.push(`${w.role}: не поставлен`); return; }
    if (typeof w.startSec === 'number' && Math.abs(p.startSec - w.startSec) > tol) out.push(`${w.role}: начало ${p.startSec} с вместо ${w.startSec} с`);
    if (typeof w.lengthSec === 'number' && Math.abs(p.lengthSec - w.lengthSec) > tol) out.push(`${w.role}: длина ${p.lengthSec} с вместо ${w.lengthSec} с`);
  });
  return out;
}

function same(a: FieldValue | undefined, b: FieldValue): boolean {
  if (typeof b === 'number' || typeof a === 'number' || typeof b === 'boolean' || typeof a === 'boolean') {
    return Math.abs(Number(a) - Number(b)) < 1e-6;
  }
  return String(a ?? '').replace(/\r\n?|\n/g, '\r') === String(b ?? '').replace(/\r\n?|\n/g, '\r');
}

// Fields whose value did not read back (spec 8.2 «Значение не прочиталось назад»).
export function readbackMismatches(request: InsertRequest, readback: Record<string, FieldValue>): HostWrite[] {
  const writes = request.writes.filter((w) => w.type !== 'media');
  const svc = request.serviceDuration
    ? [{ key: '_duration', egpName: request.serviceDuration.egpName, type: 'slider' as const, value: request.serviceDuration.value }]
    : [];
  return [...writes, ...svc].filter((w) => !same(readback[w.egpName], w.value));
}

export interface InsertOutcome {
  ok: boolean;
  problems: Problem[];
  reply: InsertReply | null;
}

const HOST_PROBLEM: Record<string, (host: Host, msg: string) => Problem> = {
  NO_TARGET: (h) => error('NO_TARGET', messages.noTarget(h)),
  NOT_SAVED: () => error('NOT_SAVED', messages.notSaved()),
  INSERT_FAILED: (_h, m) => error('INSERT_FAILED', messages.insertFailed(m)),
  TEMPLATE_BROKEN: (_h, m) => error('INSERT_FAILED', messages.insertFailed(m)),
  NO_FILE: (_h, m) => error('INSERT_FAILED', messages.insertFailed(m)),
};

interface ProbeArgs {
  targetId: string;
  startSec: number;
  aeComp: string | null;
  file: string | null;
}

// A failed mutating call: after a timeout the host may still finish, so its state is read instead of
// repeating the call (spec 6); other errors become problems.
async function failure(caller: HostCaller, host: Host, err: { code?: string; message?: string } | undefined, probe: ProbeArgs, timeoutMs: number): Promise<Problem[] | null> {
  const code = err?.code ?? 'HOST_EXCEPTION';
  const msg = err?.message ?? 'нет ответа';
  if (code === 'TIMEOUT') {
    const p = await caller.call<{ found: boolean; name?: string }>('probeInsert', probe);
    if (p.ok && p.data?.found) return null;
    return [error('TIMEOUT', messages.timeout(host, timeoutMs / 1000))];
  }
  const make = HOST_PROBLEM[code];
  return [make ? make(host, msg) : error('HOST_ERROR', messages.hostError(host, msg), err)];
}

export async function runInsert(caller: HostCaller, host: Host, request: InsertRequest, labels: Record<string, string> = {}, timeoutMs = 120000): Promise<InsertOutcome> {
  const reply = await caller.call<InsertReply>('insertItem', request, { mutating: true, timeoutMs });
  if (!reply.ok || !reply.data) {
    const probe = { targetId: request.targetId, startSec: request.startSec, aeComp: request.variant.aeComp, file: request.variant.file };
    const problems = await failure(caller, host, reply.error, probe, timeoutMs);
    if (!problems) return { ok: true, problems: [warning('TIMEOUT', `${messages.timeout(host, timeoutMs / 1000)} Шаблон вставлен, проверьте поля в Properties.`)], reply: null };
    return { ok: false, problems, reply: null };
  }
  const bad = readbackMismatches(request, reply.data.readback ?? {});
  if (bad.length) {
    const names = bad.map((w) => labels[w.key] ?? w.egpName);
    return { ok: false, problems: [error('READBACK', messages.readback(names), { fields: bad.map((w) => w.key), readback: reply.data.readback })], reply: reply.data };
  }
  if (request.companions) {
    const off = placementMismatches(request.companions, reply.data.companions ?? [], request.fps);
    if (off.length) return { ok: false, problems: [error('INSERT_FAILED', messages.placement(off), { companions: reply.data.companions })], reply: reply.data };
  }
  return { ok: true, problems: [], reply: reply.data };
}

export interface MediaOutcome {
  ok: boolean;
  problems: Problem[];
  reply: MediaReply | null;
}

export async function runMedia(caller: HostCaller, host: Host, request: MediaRequest, timeoutMs = 120000): Promise<MediaOutcome> {
  const reply = await caller.call<MediaReply>('insertMedia', request, { mutating: true, timeoutMs });
  if (!reply.ok || !reply.data) {
    const first = request.layout.video[0] ?? request.layout.audio[0];
    const probe = { targetId: request.targetId, startSec: first?.startSec ?? request.startSec, aeComp: null, file: first?.file ?? null };
    const problems = await failure(caller, host, reply.error, probe, timeoutMs);
    if (!problems) return { ok: true, problems: [warning('TIMEOUT', `${messages.timeout(host, timeoutMs / 1000)} Файл вставлен, проверьте таймлайн.`)], reply: null };
    return { ok: false, problems, reply: null };
  }
  const off = placementMismatches(request.layout, reply.data.placed ?? [], request.fps);
  if (off.length) return { ok: false, problems: [error('INSERT_FAILED', messages.placement(off), { placed: reply.data.placed })], reply: reply.data };
  return { ok: true, problems: [], reply: reply.data };
}
