// Insert on click (spec 6.1): the core plans everything it can know before touching the host — variant,
// length, field writes, refusals and warnings — and the adapter executes one request in one host call.
// Only T1 templates are inserted for now; T2/T3 files come with the media part of the panel.
import { colorProblems, fontProblems } from './checks';
import { validateValues, writesFor, type HostWrite } from './fields';
import type { HostCaller } from './host';
import { error, hasErrors, messages, warning, type Problem } from './problems';
import { BIN_NAME, libraryFile, libraryKey, projectAssetDir, projectPathProblem, type Platform } from './paths';
import { planLength, type Key } from './timing';
import type { FieldValue, FontStatus, Host, HostContext, Item, Values } from './types';
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
  // Premiere: how long to look for the clip after importMGT (3000 ms when absent; S5 saw no clip later).
  waitMs?: number;
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
}

export interface InsertInput {
  item: Item;
  ctx: HostContext;
  values: Values;
  fonts?: Record<string, FontStatus> | null;
  options?: InsertOptions;
  env: InsertEnv;
}

export interface InsertPlan {
  ok: boolean;
  problems: Problem[];
  pick: VariantPick | null;
  request: InsertRequest | null;
}

export function planInsert({ item, ctx, values, fonts, options = {}, env }: InsertInput): InsertPlan {
  const host: Host = ctx.host;
  const problems: Problem[] = [];
  const done = (pick: VariantPick | null = null): InsertPlan => ({ ok: false, problems, pick, request: null });

  if (!item.hosts.includes(host) || item.tier !== 'T1' || !item.fit || !item.duration) {
    problems.push(error('NOT_SUPPORTED', messages.notSupported(host), { id: item.id, tier: item.tier }));
    return done();
  }
  const target = ctx.target;
  if (!target) {
    problems.push(error('NO_TARGET', messages.noTarget(host)));
    return done();
  }
  if (!ctx.project.saved || !ctx.project.path) problems.push(error('NOT_SAVED', messages.notSaved()));
  const pathProblem = projectPathProblem(env.platform, ctx.project.path);
  if (pathProblem) problems.push(pathProblem);

  const pick = pickVariant(item, target, values, options.variantKey);
  const v = pick.variant;
  if (!v) {
    problems.push(error('NO_VARIANT', messages.noVariant(target.w, target.h)));
    return done(pick);
  }
  if (pick.needsConsent) {
    const p = messages.nearest(target.w, target.h, variantLabel(v));
    problems.push(options.acceptNearest ? warning('NEAREST_VARIANT', p, { key: v.key, scale: pick.scale }) : error('NO_VARIANT', p, { key: v.key, scale: pick.scale }));
  }
  const need = v.minHostVersion[host];
  if (need && !atLeast(ctx.version, need)) problems.push(error('HOST_TOO_OLD', messages.hostTooOld(host, shortVersion(ctx.version), need)));
  if (v.fps && Math.abs(v.fps - target.fps) > 0.01) problems.push(warning('FPS_MISMATCH', messages.fps(v.fps, Math.round(target.fps * 1000) / 1000, host)));
  if (fonts) problems.push(...fontProblems(item, fonts));
  if (host === 'ae') problems.push(...colorProblems(ctx.color));
  problems.push(...validateValues(item, values, host));

  const length = planLength(item, options.lengthSec, values, target.fps);
  problems.push(...length.problems);

  const file = host === 'pr' ? v.file ?? null : null;
  if (host === 'pr' && !file) problems.push(error('NOT_SUPPORTED', messages.notSupported(host), { id: item.id, variant: v.key, why: 'no MOGRT' }));
  if (host === 'ae' && (!item.aep || !v.aeComp)) problems.push(error('NOT_SUPPORTED', messages.notSupported(host), { id: item.id, variant: v.key, why: 'no aep' }));

  if (hasErrors(problems)) return done(pick);

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

export async function runInsert(caller: HostCaller, host: Host, request: InsertRequest, labels: Record<string, string> = {}, timeoutMs = 120000): Promise<InsertOutcome> {
  const reply = await caller.call<InsertReply>('insertItem', request, { mutating: true, timeoutMs });
  if (!reply.ok || !reply.data) {
    const code = reply.error?.code ?? 'HOST_EXCEPTION';
    const msg = reply.error?.message ?? 'нет ответа';
    if (code === 'TIMEOUT') {
      // The host may still finish the insert: read what is there instead of repeating the call (spec 6).
      const probe = await caller.call<{ found: boolean; name?: string }>('probeInsert', { targetId: request.targetId, startSec: request.startSec, aeComp: request.variant.aeComp, file: request.variant.file });
      if (probe.ok && probe.data?.found) {
        return { ok: true, problems: [warning('TIMEOUT', `${messages.timeout(host, timeoutMs / 1000)} Шаблон вставлен, проверьте поля в Properties.`)], reply: null };
      }
      return { ok: false, problems: [error('TIMEOUT', messages.timeout(host, timeoutMs / 1000))], reply: null };
    }
    const make = HOST_PROBLEM[code];
    return { ok: false, problems: [make ? make(host, msg) : error('HOST_ERROR', messages.hostError(host, msg), reply.error)], reply: null };
  }
  const bad = readbackMismatches(request, reply.data.readback ?? {});
  if (bad.length) {
    const names = bad.map((w) => labels[w.key] ?? w.egpName);
    return { ok: false, problems: [error('READBACK', messages.readback(names), { fields: bad.map((w) => w.key), readback: reply.data.readback })], reply: reply.data };
  }
  return { ok: true, problems: [], reply: reply.data };
}
