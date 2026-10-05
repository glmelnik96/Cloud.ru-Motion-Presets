// One click, one host call (plan P9): plan the insert, refuse on any preflight error, call insertItem once, and
// never re-send it. An insert whose answer is lost may still have landed: a call that timed out (S8: the first insert
// of a MOGRT into a project takes up to 18 s), a reply that does not parse (the adapter may have finished; 35b9993
// was such a reply) or a rejected bridge call. The host is then asked whether the clip or layer is there; asking is
// safe, re-sending is not.
import type {
  AeInsertArgs, FontStatus, HostApi, HostContext, HostError, HostReply, InsertPlan, InsertResult, Issue, Item, Placed,
  PlacedProbe, PrInsertArgs, Variant,
} from './types';
import { preflight } from './checks';
import { defaultLen, insertFrames, round6, secToTicks, toFrames } from './duration';
import { sameValue, toWrites, type Values } from './fields';
import type { Logger } from './log';
import { templateName, type VariantChoice } from './variant';

export interface PlanInput {
  item: Item;
  choice: VariantChoice;
  values: Values;
  lenSec: number;
  ctx: HostContext;
  // Required on purpose: statuses of item.requiredFonts (AE: host checkFonts, Premiere: the Node font service), or
  // null when that check did not run or failed (FONT_CHECK_FAILED). A font the check did not report counts as missing.
  fonts: FontStatus[] | null;
  pluginVersion: string;
  minPluginVersion?: string;
}

export type InsertOutcome = { ok: true; result: InsertResult; issues: Issue[] } | { ok: false; issues: Issue[] };

export const LABEL_PREFIX = 'Cloud.ru BrandKit: ';

// InsertResult.warnings of the adapters, 'CODE' or 'CODE: detail' (panel/host/*.jsx), as warning issues. A FIELD_* code
// reads 'FIELD_*: <Essential Graphics name>[: <reason>]'.
export function adapterWarnings(list: unknown): Issue[] {
  const out: Issue[] = [];
  for (const w of Array.isArray(list) ? list : []) {
    const text = typeof w === 'string' ? w.trim() : '';
    if (!text) continue;
    const parts = text.split(': ');
    const code = parts[0]!.trim();
    const rest = parts.slice(1).join(': ').trim();
    const params: Record<string, string> = {};
    if (code.startsWith('FIELD_') && rest) {
      // 'FIELD_*: <name>[: <why>]': the field's Essential Graphics name for the user, the reason for the log
      params.field = parts[1]!.trim();
      const why = parts.slice(2).join(': ').trim();
      if (why) params.detail = why;
    } else if (rest) {
      params.detail = rest;
    }
    out.push(Object.keys(params).length ? { code, level: 'warning', params } : { code, level: 'warning' });
  }
  return out;
}
const FALLBACK_FPS = 25; // pack-1 templates; used only to count frames when neither target nor variant has fps

const gridFps = (ctx: HostContext, variant: Variant) => {
  const fps = ctx.target?.fps;
  if (typeof fps === 'number' && fps > 0) return fps;
  return typeof variant.fps === 'number' && variant.fps > 0 ? variant.fps : FALLBACK_FPS;
};

const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// The plan carries the preflight issues; runInsert refuses on any error among them. Without a chosen variant the
// nearest (or the first) stands in, so the plan stays complete; NO_VARIANT or NO_TARGET then blocks the insert.
export function planInsert(input: PlanInput): InsertPlan {
  const { item, choice, values, lenSec, ctx } = input;
  const variant: Variant = choice.variant ?? choice.nearest ?? item.variants[0] ?? { key: '', minHostVersion: {} };
  const issues = preflight({
    ctx, item, choice, values, lenSec,
    fonts: input.fonts,
    pluginVersion: input.pluginVersion,
    minPluginVersion: input.minPluginVersion,
  });
  const fps = gridFps(ctx, variant);
  // What the host will get: whole frames. AE remaps (C27) when lenSec differs from the template length, so a length
  // on the template length's own frame goes as that length and is not remapped (no frame of hold to keep then): at
  // 29.97 fps the default 5 s is 150 frames, which is 5.005 s.
  const D = defaultLen(item);
  const asTemplate = ctx.host === 'ae' && D > 0 && Number.isFinite(lenSec) && toFrames(lenSec, fps) === toFrames(D, fps);
  const lenFrames = asTemplate ? toFrames(D, fps) : insertFrames(item, lenSec, fps, ctx.host);
  return {
    item,
    variant,
    lenSec: asTemplate ? D : lenFrames > 0 ? round6(lenFrames / fps) : lenSec,
    lenFrames,
    fieldWrites: toWrites(item, values, ctx.host),
    issues,
  };
}

// The adapter arguments. Paths go to the host with forward slashes (ExtendScript File takes them on Windows).
// Never throws: a refused plan still gets arguments, and runInsert does not send them.
export function buildArgs(plan: InsertPlan, ctx: HostContext, libraryRoot: string): PrInsertArgs | AeInsertArgs {
  const { item, variant } = plan;
  const root = String(libraryRoot).replace(/\\/g, '/').replace(/\/+$/, '');
  const target = ctx.target;
  const label = LABEL_PREFIX + item.title_ru;
  if (ctx.host === 'pr') {
    return {
      seqId: target?.id ?? '',
      mogrtPath: variant.file ? root + '/' + variant.file : '',
      startTicks: target?.ticks ?? (target && Number.isFinite(target.timeSec) ? secToTicks(target.timeSec) : '0'),
      lenFrames: plan.lenFrames,
      defaultLenFrames: toFrames(defaultLen(item), gridFps(ctx, variant)),
      expectName: templateName(variant),
      fields: plan.fieldWrites,
      label,
    };
  }
  const durSec = defaultLen(item);
  return {
    compId: target?.id ?? '',
    aepPath: item.aep ? root + '/' + item.aep.file : '',
    itemKey: item.id + '@' + item.version,
    aeComp: variant.aeComp ?? '',
    timeSec: target?.timeSec ?? 0,
    lenSec: plan.lenSec,
    durSec,
    inSec: item.duration?.introSec ?? 0,
    outSec: round6(durSec - (item.duration?.outroSec ?? 0)),
    fields: plan.fieldWrites,
    label,
  };
}

function hostIssue(error: HostError): Issue {
  const params: Record<string, string | number> = {};
  if (error.message) params.detail = error.message;
  if (typeof error.line === 'number') params.line = error.line;
  return Object.keys(params).length ? { code: error.code, level: 'error', params } : { code: error.code, level: 'error' };
}

const said = (fn: string, e: HostError) => fn + ' ' + e.code + (e.message ? ': ' + e.message : '');

// A host call as runInsert sees it. thrown: the call was rejected instead of answered (a bridge bug), so whether it
// reached the host is unknown.
type Answer<T> = { ok: true; data: T } | { ok: false; error: HostError; thrown?: true };

// The bridge answers with a HostReply; whatever else comes back is HOST_BAD_REPLY (a failure without a code too),
// a rejection is reported like a host exception.
async function ask<T>(call: () => Promise<HostReply<T>>): Promise<Answer<T>> {
  let reply: unknown;
  try {
    reply = await call();
  } catch (e) {
    return { ok: false, error: { code: 'HOST_EXCEPTION', message: reason(e) }, thrown: true };
  }
  if (isRecord(reply) && reply.ok === true) return reply as { ok: true; data: T };
  if (isRecord(reply) && reply.ok === false && isRecord(reply.error)) {
    const error = reply.error as HostError;
    return { ok: false, error: { ...error, code: (typeof error.code === 'string' && error.code) || 'HOST_BAD_REPLY' } };
  }
  return { ok: false, error: { code: 'HOST_BAD_REPLY', message: 'not a HostReply' } };
}

export async function runInsert(
  host: HostApi,
  plan: InsertPlan,
  ctx: HostContext,
  args: PrInsertArgs | AeInsertArgs,
  log: Logger,
): Promise<InsertOutcome> {
  const what = { item: plan.item.id + '@' + plan.item.version, variant: plan.variant.key, host: ctx.host };
  const warnings = plan.issues.filter((i) => i.level !== 'error');
  const target = ctx.target;
  const blocked = plan.issues.some((i) => i.level === 'error');
  if (blocked || !target) {
    // The plan should already say NO_TARGET; a plan built for another context might not.
    const issues: Issue[] = blocked ? plan.issues : [{ code: 'NO_TARGET', level: 'error' }, ...plan.issues];
    log.warn('INSERT_REFUSED', 'refused before the host call', { ...what, codes: issues.map((i) => i.code) });
    return { ok: false, issues };
  }
  const failed = (issue: Issue, data: unknown, msg = 'insert failed'): InsertOutcome => {
    log.error(issue.code, msg, { ...what, data });
    return { ok: false, issues: [issue, ...warnings] };
  };

  log.info('INSERT_START', 'insert', { ...what, target: target.id, lenSec: plan.lenSec, lenFrames: plan.lenFrames });
  const reply = await ask(() => host.insertItem(args));

  if (reply.ok && isRecord(reply.data) && isRecord(reply.data.placed)) {
    const result = reply.data;
    // The adapter's own warnings ('CODE' or 'CODE: detail') come after the outcome, before the plan's.
    warnings.unshift(...adapterWarnings(result.warnings));
    const typeOf = (egpName: string) => plan.fieldWrites.find((w) => w.egpName === egpName)?.type ?? 'text';
    // The adapter's verdict, backed by the core's normalised comparison (boolean vs 1/0, '2' vs 2).
    const bad = (Array.isArray(result.fields) ? result.fields : [])
      .filter((f) => !f.ok && !sameValue(ctx.host, typeOf(f.egpName), f.written, f.back));
    if (!bad.length) {
      log.info('INSERT_OK', 'inserted', { ...what, placed: result.placed });
      return { ok: true, result, issues: warnings };
    }
    // The clip stays (spec 8.2): no rollback, no retry; the user checks the fields or undoes the insert.
    log.warn('READBACK_MISMATCH', 'inserted, fields did not read back', { ...what, placed: result.placed, fields: bad });
    const fields = bad.map((f) => f.egpName).join(', ');
    return { ok: true, result, issues: [{ code: 'READBACK_MISMATCH', level: 'warning', params: { fields } }, ...warnings] };
  }

  // A success that names nothing placed is as unreadable as a reply that does not parse.
  const error: HostError = reply.ok ? { code: 'HOST_BAD_REPLY', message: 'no placed clip or layer' } : reply.error;
  const thrown = !reply.ok && reply.thrown === true;
  // The adapter's own refusals (TARGET_CHANGED, NO_FREE_TRACK...) are settled answers. Its HOST_EXCEPTION is not:
  // common.jsx answers HOST_EXCEPTION for a reply it cannot serialise, after insertItem has placed the clip or layer.
  const adapterException = !thrown && error.code === 'HOST_EXCEPTION';
  if (!thrown && !adapterException && error.code !== 'TIMEOUT' && error.code !== 'HOST_BAD_REPLY') {
    return failed(hostIssue(error), error);
  }

  // Unsettled: ask whether it landed, never re-send. The cause stays in the log; the user gets the probe's verdict.
  const cause = thrown ? { ...error, thrown } : error;
  const probe: PlacedProbe = {
    kind: ctx.host === 'pr' ? 'clip' : 'layer',
    targetId: target.id,
    startSec: target.timeSec,
    name: 'expectName' in args ? args.expectName : args.aeComp, // a layer is named after its comp
  };
  const found = await ask<Placed | null>(() => host.findPlaced(probe));
  if (found.ok && (found.data === null || found.data === undefined)) {
    // Nothing landed: the adapter's exception is the user's answer; a lost or broken reply is a failed insert.
    if (adapterException) return failed(hostIssue(error), { probe, cause });
    return failed({ code: 'INSERT_FAILED', level: 'error' }, { probe, cause });
  }
  if (!found.ok || !isRecord(found.data)) {
    // Nobody knows whether it landed: say so, and let the user look before clicking again.
    const miss: HostError = found.ok ? { code: 'HOST_BAD_REPLY', message: 'not a clip or layer' } : found.error;
    const issue: Issue = error.code === 'TIMEOUT'
      ? { code: 'TIMEOUT', level: 'error', params: { detail: said('findPlaced', miss) } }
      : { code: 'INSERT_UNCONFIRMED', level: 'error', params: { detail: said('insertItem', error) + '; ' + said('findPlaced', miss) } };
    return failed(issue, { probe, cause, error: miss }, 'insert unconfirmed, the probe could not tell');
  }
  const placed = found.data as unknown as Placed;
  log.warn('TIMEOUT_LANDED', 'insert unanswered (' + error.code + ') but landed; fields unknown', { ...what, placed, cause });
  const result: InsertResult = { placed, fields: [], warnings: [] };
  return { ok: true, result, issues: [{ code: 'TIMEOUT_LANDED', level: 'warning' }, ...warnings] };
}
