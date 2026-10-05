// The host bridge (spec §6, plan P4 and P9). Every call is CRBK.call(fn, ascii json) through evalScript, strictly one
// at a time: ExtendScript is single-threaded, and the queue keeps the panel from stacking work behind a slow call.
// The adapter travels as source (no ScriptPath or $.evalFile: the extension path is Cyrillic). Before the first call,
// and whenever a reply or a timeout puts CRBK in doubt, a ping checks CRBK and its build stamp, and the source is
// (re)loaded on a miss. Reads are retried on cold-start replies. insertItem is sent exactly once: an insert whose reply
// was lost or late may still have changed the project, so the core polls findPlaced instead of sending it again.
// Neither a host that never answers, a source read that hangs nor a log that throws can hold the queue.
import type {
  AeInsertArgs,
  FontStatus,
  HostApi,
  HostContext,
  HostError,
  HostReply,
  InsertResult,
  Placed,
  PlacedProbe,
  PrInsertArgs,
} from '../core/types';
import { isAscii, jsxCall } from './ascii';
import { parseReply } from './reply';

export type BridgeLogLevel = 'info' | 'warn' | 'error';
export type BridgeLog = (level: BridgeLogLevel, code: string, msg: string, data?: Record<string, unknown>) => void;

// Method syntax on purpose: it accepts both window's and Node's timer signatures.
export interface BridgeTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface BridgeTimeouts {
  read: number;
  mutate: number;
}

export interface BridgeDeps {
  evalScript: (script: string, cb: (r: string) => void) => void;
  readAdapterSource: () => Promise<string>; // dist/host/<ae|pr>.jsx, chosen by appName; gets timeouts.read to settle
  build: string; // CRBK.build the source carries (__CRBK_BUILD__)
  timers?: BridgeTimers;
  log?: BridgeLog;
  timeouts?: Partial<BridgeTimeouts>; // per key; a value that is not a usable delay keeps the default
}

export interface HostBridge extends HostApi {
  ensureAdapter(): Promise<HostReply<{ build: string }>>;
}

// S8: the first insert of a new MOGRT into a project held Premiere for 18 s.
export const DEFAULT_TIMEOUTS: BridgeTimeouts = { read: 30000, mutate: 120000 };
// Pause before each attempt of a read or of the adapter check: none, then 300 ms, then 900 ms.
export const READ_RETRY_DELAYS: readonly number[] = [0, 300, 900];
// Replies that say the engine did not run our code (cold engine, no CRBK, no CEP yet), not what CRBK answered.
export const COLD_START_CODES: readonly string[] = ['HOST_EMPTY', 'HOST_EVAL_ERROR', 'HOST_BRIDGE_ERROR'];
// Every code the bridge makes itself, here and in reply.ts; any other code is the adapter's, passed on as it came.
// core/errors.ts keeps a Russian text for each.
export const BRIDGE_CODES: readonly string[] = [
  'HOST_EMPTY',
  'HOST_EVAL_ERROR',
  'HOST_BAD_REPLY',
  'HOST_BRIDGE_ERROR',
  'TIMEOUT',
  'ADAPTER_LOAD',
];

const PING = jsxCall('ping', {});
const MAX_LOGGED = 500;
const MAX_DELAY = 0x7fffffff; // setTimeout runs anything longer at once

// Looked up on every call, so fake timers installed after the bridge was made still apply.
const GLOBAL_TIMERS: BridgeTimers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as number),
};

type Failure = { ok: false; error: HostError };
type Ensured = { reply: HostReply<{ build: string }>; retry: boolean };

function fail(code: string, message?: string): Failure {
  return message === undefined ? { ok: false, error: { code } } : { ok: false, error: { code, message } };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function clip(s: string, max = MAX_LOGGED): string {
  return s.length > max ? s.slice(0, max) + '...' : s;
}

function isCold(code: string): boolean {
  return COLD_START_CODES.indexOf(code) !== -1;
}

// undefined, NaN, 0 or less, or more than setTimeout can wait would time out every call at once.
function delayOr(ms: number | undefined, fallback: number): number {
  return typeof ms === 'number' && ms > 0 && ms <= MAX_DELAY ? ms : fallback;
}

function describe(r: HostReply<unknown>): string {
  if (r.ok) return 'build ' + String(isRecord(r.data) ? r.data.build : undefined);
  return r.error.code + (r.error.message ? ' ' + clip(r.error.message, 120) : '');
}

export function createBridge(deps: BridgeDeps): HostBridge {
  const timers = deps.timers ?? GLOBAL_TIMERS;
  const timeouts: BridgeTimeouts = {
    read: delayOr(deps.timeouts?.read, DEFAULT_TIMEOUTS.read),
    mutate: delayOr(deps.timeouts?.mutate, DEFAULT_TIMEOUTS.mutate),
  };
  // A sink that throws must not reach a call: a reply never settled would hold every call queued behind it.
  const log: BridgeLog = (level, code, msg, data) => {
    try {
      deps.log?.(level, code, msg, data);
    } catch {
      // the line is lost; there is nowhere else to report it
    }
  };
  let ready = false; // CRBK with our build answered a ping, and no reply or timeout since has put that in doubt
  let tail: Promise<unknown> = Promise.resolve();

  function enqueue<T>(job: () => Promise<HostReply<T>>): Promise<HostReply<T>> {
    const run = tail.then(job).catch((e: unknown): HostReply<T> => fail('HOST_BRIDGE_ERROR', errorText(e)));
    tail = run;
    return run;
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      timers.setTimeout(resolve, ms);
    });
  }

  // Settles as p does, or fails after ms: a file read that hangs must not hold the queue either.
  function within<T>(p: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = timers.setTimeout(() => reject(new Error('no answer in ' + ms + ' ms')), ms);
      Promise.resolve(p).then(
        (v) => {
          resolve(v);
          timers.clearTimeout(timer);
        },
        (e: unknown) => {
          reject(e);
          timers.clearTimeout(timer);
        },
      );
    });
  }

  // One evalScript round trip. A reply after the timeout is only logged: the queue has moved on by then. Each path
  // settles the call first and logs after.
  function send(script: string, fn: string, ms: number): Promise<HostReply<unknown>> {
    return new Promise((resolve) => {
      const started = Date.now();
      let state: 'pending' | 'answered' | 'timedOut' = 'pending';
      const timer = timers.setTimeout(() => {
        if (state !== 'pending') return;
        state = 'timedOut';
        const message = fn + ': no reply in ' + ms + ' ms';
        resolve(fail('TIMEOUT', message));
        log('warn', 'TIMEOUT', message, { fn, ms });
      }, ms);
      const answer = (reply: HostReply<unknown>): void => {
        state = 'answered';
        resolve(reply);
        timers.clearTimeout(timer);
      };
      try {
        deps.evalScript(script, (raw) => {
          if (state === 'pending') {
            answer(parseReply(String(raw)));
          } else if (state === 'timedOut') {
            state = 'answered';
            const afterMs = Date.now() - started;
            log('warn', 'LATE_REPLY', fn + ': reply ' + afterMs + ' ms after the call, past its ' + ms + ' ms; ignored', {
              fn,
              ms,
              afterMs,
              reply: clip(String(raw)),
            });
          }
        });
      } catch (e) {
        if (state === 'pending') answer(fail('HOST_BRIDGE_ERROR', fn + ': evalScript threw: ' + errorText(e)));
      }
    });
  }

  function scriptFor(fn: string, args: unknown): string | Failure {
    try {
      return jsxCall(fn, args);
    } catch (e) {
      return fail('HOST_BRIDGE_ERROR', fn + ': ' + errorText(e));
    }
  }

  function isOurs(r: HostReply<unknown>): r is { ok: true; data: { build: string } } {
    return r.ok && isRecord(r.data) && r.data.build === deps.build;
  }

  function confirmed(r: { ok: true; data: { build: string } }): Ensured {
    ready = true;
    return { reply: { ok: true, data: r.data }, retry: false };
  }

  function loadFailed(message: string, retry: boolean, was: string): Ensured {
    log(retry ? 'warn' : 'error', 'ADAPTER_LOAD', message, { build: deps.build, was });
    return { reply: fail('ADAPTER_LOAD', message), retry };
  }

  // Ping; on anything but our build, send the adapter source and ping again. retry: worth another round later,
  // because a cold engine may have dropped the source or its answer. A wrong build or a timeout is not.
  async function ensureOnce(): Promise<Ensured> {
    // Only a ping with our build sets it again: a check that fails, even ensureAdapter's own, leaves CRBK in doubt.
    ready = false;
    const first = await send(PING, 'ping', timeouts.read);
    if (isOurs(first)) return confirmed(first);
    // A busy host would only queue the source behind whatever holds it.
    if (!first.ok && first.error.code === 'TIMEOUT') return { reply: first, retry: false };
    const was = first.ok ? describe(first) : first.error.code;
    let source: string;
    try {
      source = await within(deps.readAdapterSource(), timeouts.read);
    } catch (e) {
      return loadFailed('cannot read the adapter source: ' + errorText(e), false, was);
    }
    if (!isAscii(source)) return loadFailed('the adapter source is not ASCII; evalScript would mangle it', false, was);
    const loaded = await send(source, 'adapter', timeouts.read); // its own value means nothing, the ping decides
    if (!loaded.ok && loaded.error.code === 'TIMEOUT') return { reply: loaded, retry: false };
    const second = await send(PING, 'ping', timeouts.read);
    if (isOurs(second)) {
      log('info', 'ADAPTER_LOADED', 'adapter ' + deps.build + ' loaded (was: ' + was + ')', { build: deps.build, was });
      return confirmed(second);
    }
    if (!second.ok && second.error.code === 'TIMEOUT') return { reply: second, retry: false };
    const message = 'no CRBK ' + deps.build + ' after loading: ping ' + describe(second) + '; load ' + describe(loaded);
    return loadFailed(message, !second.ok && isCold(second.error.code), was);
  }

  // Waits READ_RETRY_DELAYS[attempt] before an attempt; a retry is logged with the reply that called for it.
  async function pause(fn: string, attempt: number, after?: HostReply<unknown>): Promise<void> {
    const ms = READ_RETRY_DELAYS[attempt] ?? 0;
    if (after) {
      const why = after.ok ? 'ok' : after.error.code;
      log('warn', 'HOST_RETRY', fn + ': attempt ' + (attempt + 1) + ' in ' + ms + ' ms after ' + why, {
        fn,
        attempt: attempt + 1,
        ms,
        after: why,
      });
    }
    if (ms > 0) await sleep(ms);
  }

  async function ensureWithRetries(): Promise<HostReply<{ build: string }>> {
    await pause('ensureAdapter', 0);
    let e = await ensureOnce();
    for (let i = 1; i < READ_RETRY_DELAYS.length && !e.reply.ok && e.retry; i++) {
      await pause('ensureAdapter', i, e.reply);
      e = await ensureOnce();
    }
    return e.reply;
  }

  // A read: re-sent after a cold-start reply, with the adapter checked again before each retry.
  async function read<T>(fn: string, args: unknown): Promise<HostReply<T>> {
    const script = scriptFor(fn, args);
    if (typeof script !== 'string') return script;
    let last: HostReply<unknown> = fail('HOST_EMPTY');
    let checked = false; // a ping inside this call confirmed our build
    for (let i = 0; i < READ_RETRY_DELAYS.length; i++) {
      await pause(fn, i, i > 0 ? last : undefined);
      if (!ready) {
        const e = await ensureOnce();
        if (!e.reply.ok) {
          if (!e.retry) return e.reply;
          last = e.reply;
          continue;
        }
        checked = true;
      }
      const r = await send(script, fn, timeouts.read);
      if (r.ok) return r as HostReply<T>;
      const code = r.error.code;
      // Not re-sent after a timeout: a busy host would queue the retry behind the call it is stuck on. Busy, or held
      // by a modal dialog, it is in doubt all the same, so the next call pings first.
      if (code === 'TIMEOUT') {
        ready = false;
        return r;
      }
      // UNKNOWN_FN from a build confirmed in this very call is final: that adapter has no such function.
      if (!isCold(code) && !(code === 'UNKNOWN_FN' && !checked)) return r;
      ready = false;
      last = r;
    }
    return last as HostReply<T>;
  }

  // The one mutating call: the adapter check before it may be retried, the insert itself never.
  async function insert(args: PrInsertArgs | AeInsertArgs): Promise<HostReply<InsertResult>> {
    const script = scriptFor('insertItem', args);
    if (typeof script !== 'string') return script;
    if (!ready) {
      const e = await ensureWithRetries();
      if (!e.ok) return e;
    }
    const r = await send(script, 'insertItem', timeouts.mutate);
    if (!r.ok) {
      const code = r.error.code;
      // After a reply that suggests CRBK is gone, or a timeout, the next call pings first. A host still held by this
      // insert (a modal dialog blocks it) then fails that ping, and a second click queues no second insert behind it.
      if (isCold(code) || code === 'UNKNOWN_FN' || code === 'TIMEOUT') ready = false;
    }
    return r as HostReply<InsertResult>;
  }

  return {
    ensureAdapter: () => enqueue(ensureWithRetries),
    getContext: () => enqueue(() => read<HostContext>('getContext', {})),
    insertItem: (args: PrInsertArgs | AeInsertArgs) => enqueue(() => insert(args)),
    findPlaced: (probe: PlacedProbe) => enqueue(() => read<Placed | null>('findPlaced', probe)),
    checkFonts: (psNames: string[]) => enqueue(() => read<FontStatus[]>('checkFonts', psNames)),
    diag: () => enqueue(() => read<Record<string, unknown>>('diag', {})),
  };
}
