import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import type { AeInsertArgs, HostApi, HostError, PrInsertArgs } from '../../../panel/src/core/types';
import { isAscii, jsxCall } from '../../../panel/src/bridge/ascii';
import {
  BRIDGE_CODES,
  COLD_START_CODES,
  createBridge,
  DEFAULT_TIMEOUTS,
  READ_RETRY_DELAYS,
  type BridgeDeps,
  type BridgeLogLevel,
  type BridgeTimers,
} from '../../../panel/src/bridge/host';

// The panel tsconfig has no Node types (types: []); the tests run in Node, so fs comes in untyped.
const nodeFs = 'node:fs';
const fs = (await import(nodeFs)) as { readFileSync(p: URL, enc: 'utf8'): string };

const BUILD = 'a1b2c3d4e5f6';
const FOREIGN = 'f0re1gnb1d00'; // another panel's CRBK in the shared engine
const SOURCE = '/* prelude-json + common + ae */ (function (g) { g.CRBK = { build: "a1b2c3d4e5f6" }; })($.global);';
const PING = 'CRBK.call("ping", "{}")';
const GET_CONTEXT = 'CRBK.call("getContext", "{}")';
const DIAG = 'CRBK.call("diag", "{}")';

const pong = (build: string): string => JSON.stringify({ ok: true, data: { build, app: '26.5x89' } });
const ok = (data: unknown): string => JSON.stringify({ ok: true, data });
const unknownFn = (fn: string): string => JSON.stringify({ ok: false, error: { code: 'UNKNOWN_FN', message: fn } });

const CONTEXT = {
  host: 'ae',
  hostVersion: '26.5x89',
  project: { path: 'C:/CRBK/work/panel/CRT_panel_ae.aep', saved: true },
  target: { kind: 'comp', id: '12', name: 'Комп 1', w: 1920, h: 1080, fps: 25, timeSec: 2 },
};
const PR_ARGS: PrInsertArgs = {
  seqId: '000f4241',
  mogrtPath: 'C:/ProgramData/CloudRuBrandKit/library/items/TTL_LowerThird/TTL_LowerThird_16x9_v1.mogrt',
  startTicks: '2540160000000',
  lenFrames: 200,
  defaultLenFrames: 150,
  expectName: 'TTL_LowerThird_16x9_v1',
  fields: [
    { egpName: 'Имя', type: 'text', value: 'Анна-Мария Ёлкина' },
    { egpName: 'Стиль', type: 'dropdown', value: 0 },
    { egpName: 'Логотип', type: 'checkbox', value: 1 },
  ],
  label: 'Cloud.ru BrandKit: Титр 16×9',
};
const AE_ARGS: AeInsertArgs = {
  compId: '12',
  aepPath: 'C:/ProgramData/CloudRuBrandKit/library/items/TTL_LowerThird/TTL_LowerThird_v1.aep',
  itemKey: 'TTL_LowerThird@1',
  aeComp: 'TTL_LowerThird_16x9_v1',
  timeSec: 2,
  lenSec: 8,
  durSec: 6,
  inSec: 1.5,
  outSec: 4.5,
  fields: [{ egpName: 'Имя', type: 'text', value: 'Ёлка × 2 «кавычки»' }],
  label: 'Cloud.ru BrandKit: Титр',
};
const PLACED = { kind: 'clip', id: 'c1', name: 'TTL_LowerThird_16x9_v1', track: 2, startSec: 10, endSec: 18 };
const RESULT = {
  placed: PLACED,
  fields: [{ egpName: 'Имя', written: 'Анна-Мария Ёлкина', back: 'Анна-Мария Ёлкина', ok: true }],
  warnings: [],
};
const PROBE = { kind: 'clip' as const, targetId: '000f4241', startSec: 10, name: 'TTL_LowerThird_16x9_v1' };
const INSERT = jsxCall('insertItem', PR_ARGS);
const CHECK_FONTS = jsxCall('checkFonts', ['SBSansText-Regular']);

// What the fake host answers to each evalScript, in order: a string arrives on the next microtask, {raw, after}
// after that many ms of fake time, 'never' not at all, and {throws} makes evalScript itself throw.
type Step = string | { raw: string; after: number } | 'never' | { throws: string };

function fakeHost(steps: Step[]) {
  const scripts: string[] = [];
  const unexpected: string[] = [];
  const evalScript = (script: string, cb: (r: string) => void): void => {
    scripts.push(script);
    const step = steps.shift();
    if (step === undefined) {
      unexpected.push(script);
      return;
    }
    if (step === 'never') return;
    if (typeof step === 'string') {
      void Promise.resolve().then(() => cb(step));
      return;
    }
    if ('throws' in step) throw new Error(step.throws);
    setTimeout(() => cb(step.raw), step.after);
  };
  return { scripts, unexpected, steps, evalScript };
}

interface LogEntry {
  level: BridgeLogLevel;
  code: string;
  msg: string;
  data?: Record<string, unknown>;
}

function setup(steps: Step[], deps: Partial<BridgeDeps> = {}) {
  const host = fakeHost(steps);
  const logs: LogEntry[] = [];
  let sourceReads = 0;
  const bridge = createBridge({
    evalScript: host.evalScript,
    readAdapterSource: () => {
      sourceReads++;
      return Promise.resolve(SOURCE);
    },
    build: BUILD,
    log: (level, code, msg, data) => {
      logs.push({ level, code, msg, data });
    },
    ...deps,
  });
  return { host, bridge, logs, sourceReads: () => sourceReads };
}

// Runs every pending reply and continuation without moving the fake clock.
const settle = (): Promise<unknown> => vi.advanceTimersByTimeAsync(0);
const advance = (ms: number): Promise<unknown> => vi.advanceTimersByTimeAsync(ms);

// Watches a promise so a test can see whether it has settled without awaiting it.
function track<T>(p: Promise<T>): { done: boolean; value?: T } {
  const s: { done: boolean; value?: T } = { done: false };
  void p.then((v) => {
    s.done = true;
    s.value = v;
  });
  return s;
}

const count = (scripts: string[], script: string): number => scripts.filter((s) => s === script).length;

// Timers that record every delay the bridge asks for.
function recordingTimers(): { timers: BridgeTimers; delays: number[] } {
  const delays: number[] = [];
  const timers: BridgeTimers = {
    setTimeout: (fn, ms) => {
      delays.push(ms);
      return setTimeout(fn, ms);
    },
    clearTimeout: (handle) => clearTimeout(handle as number),
  };
  return { timers, delays };
}

// A log sink that keeps the codes it was given and then throws, as a full disk would.
function throwingLog(): { log: BridgeDeps['log']; codes: string[] } {
  const codes: string[] = [];
  const log = (_level: BridgeLogLevel, code: string): void => {
    codes.push(code);
    throw new Error('disk full');
  };
  return { log, codes };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('createBridge', () => {
  it('is a HostApi; reads wait 30 s, insertItem 120 s, read retries at 0/300/900 ms', () => {
    const { bridge } = setup([]);
    const api: HostApi = bridge;
    expect(typeof api.insertItem).toBe('function');
    expect(typeof bridge.ensureAdapter).toBe('function');
    expect(DEFAULT_TIMEOUTS).toEqual({ read: 30000, mutate: 120000 });
    expect(READ_RETRY_DELAYS).toEqual([0, 300, 900]);
  });

  it('BRIDGE_CODES lists every code the bridge makes itself, the cold-start ones included', () => {
    // Read off the sources, so a new fail('CODE') in host.ts or reply.ts cannot slip past the list and its Russian text.
    const made = new Set<string>();
    for (const file of ['host.ts', 'reply.ts']) {
      const src = fs.readFileSync(new URL('../../../panel/src/bridge/' + file, import.meta.url), 'utf8');
      for (const m of src.matchAll(/\bfail\('([A-Z_]+)'/g)) made.add(m[1] ?? '');
    }
    expect([...BRIDGE_CODES].sort()).toEqual([...made].sort());
    for (const code of COLD_START_CODES) expect(BRIDGE_CODES).toContain(code);
  });

  it('keeps the default for a timeout that is undefined, NaN, 0, negative or past what setTimeout can wait', async () => {
    for (const bad of [undefined, Number.NaN, 0, -1, Infinity, 2 ** 31]) {
      const { timers, delays } = recordingTimers();
      const { bridge } = setup([{ raw: pong(BUILD), after: 50 }, { raw: ok(RESULT), after: 50 }], {
        timers,
        timeouts: { read: bad, mutate: bad },
      });
      const r = track(bridge.insertItem(PR_ARGS));
      await advance(100);
      expect(r.value).toEqual({ ok: true, data: RESULT });
      expect(delays).toEqual([30000, 120000]);
    }
  });
});

describe('adapter loading', () => {
  it('cold start: no CRBK, so the source is loaded and pinged before the first call', async () => {
    const { host, bridge, logs, sourceReads } = setup(['EvalScript error.', 'undefined', pong(BUILD), ok(CONTEXT)]);
    expect(await bridge.getContext()).toEqual({ ok: true, data: CONTEXT });
    expect(host.scripts).toEqual([PING, SOURCE, PING, GET_CONTEXT]);
    expect(sourceReads()).toBe(1);
    expect(logs.find((l) => l.code === 'ADAPTER_LOADED')).toMatchObject({ level: 'info', data: { build: BUILD, was: 'HOST_EVAL_ERROR' } });
    expect(host.unexpected).toEqual([]);
  });

  it('uses an adapter with our build as it is and checks it only before the first call', async () => {
    const { host, bridge, sourceReads } = setup([pong(BUILD), ok(CONTEXT), ok({ qe: true })]);
    expect(await bridge.getContext()).toEqual({ ok: true, data: CONTEXT });
    expect(await bridge.diag()).toEqual({ ok: true, data: { qe: true } });
    expect(host.scripts).toEqual([PING, GET_CONTEXT, DIAG]);
    expect(sourceReads()).toBe(0);
  });

  it('reloads a stale build', async () => {
    const { host, bridge, logs } = setup([pong('0ld0ld0ld0ld'), 'undefined', pong(BUILD), ok(CONTEXT)]);
    expect(await bridge.getContext()).toEqual({ ok: true, data: CONTEXT });
    expect(host.scripts).toEqual([PING, SOURCE, PING, GET_CONTEXT]);
    expect(logs.find((l) => l.code === 'ADAPTER_LOADED')?.data).toMatchObject({ was: 'build 0ld0ld0ld0ld' });
  });

  it('ensureAdapter answers with the build, always pings, and leaves the adapter ready', async () => {
    const { host, bridge } = setup(['', 'undefined', pong(BUILD), pong(BUILD), ok(CONTEXT)]);
    expect(await bridge.ensureAdapter()).toMatchObject({ ok: true, data: { build: BUILD } });
    expect(await bridge.ensureAdapter()).toMatchObject({ ok: true, data: { build: BUILD } });
    expect(await bridge.getContext()).toEqual({ ok: true, data: CONTEXT });
    expect(host.scripts).toEqual([PING, SOURCE, PING, PING, GET_CONTEXT]);
  });

  it('a wrong build after loading is ADAPTER_LOAD, and the call is not sent', async () => {
    const { host, bridge, logs } = setup([pong('0ld0ld0ld0ld'), 'undefined', pong('0ld0ld0ld0ld')]);
    const r = await bridge.getContext();
    expect(r).toMatchObject({ ok: false, error: { code: 'ADAPTER_LOAD' } });
    await advance(60000);
    expect(host.scripts).toEqual([PING, SOURCE, PING]);
    expect(logs.find((l) => l.code === 'ADAPTER_LOAD')?.level).toBe('error');
  });

  it('refuses a source that is not ASCII without sending it', async () => {
    const { host, bridge } = setup(['EvalScript error.'], { readAdapterSource: () => Promise.resolve('var s = "Ёлка";') });
    const r = await bridge.getContext();
    expect(r).toMatchObject({ ok: false, error: { code: 'ADAPTER_LOAD' } });
    if (!r.ok) expect(r.error.message).toMatch(/ASCII/);
    expect(host.scripts).toEqual([PING]);
  });

  it('an unreadable source is ADAPTER_LOAD', async () => {
    const { host, bridge } = setup(['EvalScript error.'], {
      readAdapterSource: () => Promise.reject(new Error('ENOENT: dist/host/ae.jsx')),
    });
    const r = await bridge.ensureAdapter();
    expect(r).toMatchObject({ ok: false, error: { code: 'ADAPTER_LOAD' } });
    if (!r.ok) expect(r.error.message).toContain('ENOENT');
    expect(host.scripts).toEqual([PING]);
  });

  it('a ping that times out is TIMEOUT and the source is not sent behind it', async () => {
    const { host, bridge, sourceReads } = setup(['never']);
    const r = track(bridge.ensureAdapter());
    await advance(29999);
    expect(r.done).toBe(false);
    await advance(1);
    expect(r.value).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    expect(host.scripts).toEqual([PING]);
    expect(sourceReads()).toBe(0);
  });

  it('a cold engine that dropped the source gets another round 300 ms later', async () => {
    const { host, bridge } = setup(['EvalScript error.', 'undefined', 'EvalScript error.', 'EvalScript error.', 'undefined', pong(BUILD)]);
    const r = track(bridge.ensureAdapter());
    await settle();
    expect(host.scripts).toEqual([PING, SOURCE, PING]);
    await advance(299);
    expect(r.done).toBe(false);
    await advance(1);
    expect(host.scripts).toEqual([PING, SOURCE, PING, PING, SOURCE, PING]);
    expect(r.value).toMatchObject({ ok: true, data: { build: BUILD } });
  });

  it('a source read that never settles is ADAPTER_LOAD after the read timeout, and the queue moves on', async () => {
    const { host, bridge } = setup(['EvalScript error.', pong(BUILD), ok(CONTEXT)], {
      readAdapterSource: () => new Promise<string>(() => undefined),
    });
    const r = track(bridge.ensureAdapter());
    const c = track(bridge.getContext());
    await advance(29999);
    expect(r.done).toBe(false);
    await advance(1);
    expect(r.value).toMatchObject({ ok: false, error: { code: 'ADAPTER_LOAD', message: expect.stringContaining('30000 ms') } });
    expect(c.value).toEqual({ ok: true, data: CONTEXT });
    expect(host.scripts).toEqual([PING, PING, GET_CONTEXT]);
  });

  it('a source eval that times out is TIMEOUT, and nothing is sent behind it', async () => {
    const { host, bridge } = setup(['EvalScript error.', 'never']);
    const r = track(bridge.ensureAdapter());
    await advance(29999);
    expect(r.done).toBe(false);
    await advance(1);
    expect(r.value).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    await advance(60000);
    expect(host.scripts).toEqual([PING, SOURCE]);
  });

  it('a failed check leaves the adapter in doubt: the next insert checks again and never reaches a foreign build', async () => {
    const { host, bridge } = setup([
      pong(BUILD), ok(CONTEXT),
      pong(FOREIGN), 'EvalScript error.', pong(FOREIGN),
      pong(FOREIGN), 'EvalScript error.', pong(FOREIGN),
    ]);
    expect(await bridge.getContext()).toEqual({ ok: true, data: CONTEXT });
    expect(await bridge.ensureAdapter()).toMatchObject({ ok: false, error: { code: 'ADAPTER_LOAD' } });
    const ins = track(bridge.insertItem(PR_ARGS));
    await advance(60000);
    expect(ins.value).toMatchObject({ ok: false, error: { code: 'ADAPTER_LOAD' } });
    expect(host.scripts).toEqual([PING, GET_CONTEXT, PING, SOURCE, PING, PING, SOURCE, PING]);
  });
});

describe('reads', () => {
  it('retry on cold-start replies at 0, 300 and 900 ms, checking the adapter before each retry', async () => {
    const { host, bridge, logs } = setup([pong(BUILD), '', pong(BUILD), 'EvalScript error.', pong(BUILD), ok(CONTEXT)]);
    const r = track(bridge.getContext());
    await settle();
    expect(host.scripts).toEqual([PING, GET_CONTEXT]);
    await advance(299);
    expect(host.scripts).toHaveLength(2);
    await advance(1);
    expect(host.scripts).toEqual([PING, GET_CONTEXT, PING, GET_CONTEXT]);
    await advance(899);
    expect(host.scripts).toHaveLength(4);
    expect(r.done).toBe(false);
    await advance(1);
    expect(host.scripts).toEqual([PING, GET_CONTEXT, PING, GET_CONTEXT, PING, GET_CONTEXT]);
    expect(r.value).toEqual({ ok: true, data: CONTEXT });
    expect(logs.filter((l) => l.code === 'HOST_RETRY').map((l) => l.data?.ms)).toEqual([300, 900]);
  });

  it('give up after the third cold-start reply; the next call checks the adapter again', async () => {
    const { host, bridge } = setup([pong(BUILD), 'EvalScript error.', pong(BUILD), '', pong(BUILD), 'undefined']);
    const r = track(bridge.diag());
    await advance(1200);
    expect(r.value).toMatchObject({ ok: false, error: { code: 'HOST_EMPTY' } });
    await advance(60000);
    expect(count(host.scripts, DIAG)).toBe(3);
    expect(host.scripts).toHaveLength(6);
    host.steps.push(pong(BUILD), ok(CONTEXT));
    expect(await bridge.getContext()).toEqual({ ok: true, data: CONTEXT });
    expect(host.scripts.slice(6)).toEqual([PING, GET_CONTEXT]);
  });

  it('a read that times out is not retried, the next call pings first, and the late reply is logged and ignored', async () => {
    const { host, bridge, logs } = setup([pong(BUILD), { raw: ok(CONTEXT), after: 31000 }, pong(BUILD), ok({ qe: true })]);
    const r = track(bridge.getContext());
    const d = track(bridge.diag());
    await settle();
    expect(host.scripts).toEqual([PING, GET_CONTEXT]);
    await advance(29999);
    expect(r.done).toBe(false);
    await advance(1);
    expect(r.value).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    expect(logs.find((l) => l.code === 'TIMEOUT')).toMatchObject({ level: 'warn', data: { fn: 'getContext', ms: 30000 } });
    // The queue moved on, and a host that timed out is in doubt until a ping answers.
    expect(host.scripts).toEqual([PING, GET_CONTEXT, PING, DIAG]);
    expect(d.value).toEqual({ ok: true, data: { qe: true } });
    await advance(1000);
    expect(logs.find((l) => l.code === 'LATE_REPLY')).toMatchObject({ level: 'warn', data: { fn: 'getContext', ms: 30000 } });
    expect(r.value).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    expect(host.scripts).toHaveLength(4);
  });

  it('UNKNOWN_FN makes the bridge check the adapter; a function our build lacks stays UNKNOWN_FN', async () => {
    const { host, bridge } = setup([pong(BUILD), ok(CONTEXT), unknownFn('checkFonts'), pong(BUILD), unknownFn('checkFonts')]);
    await bridge.getContext();
    const r = track(bridge.checkFonts(['SBSansText-Regular']));
    await settle();
    expect(host.scripts).toEqual([PING, GET_CONTEXT, CHECK_FONTS]);
    await advance(300);
    expect(host.scripts).toEqual([PING, GET_CONTEXT, CHECK_FONTS, PING, CHECK_FONTS]);
    expect(r.value).toMatchObject({ ok: false, error: { code: 'UNKNOWN_FN' } });
  });

  it('UNKNOWN_FN from another build reloads ours and sends the call again', async () => {
    const fonts = [{ postScriptName: 'SBSansText-Regular', found: true, build: '1.002', substitute: false }];
    const { host, bridge } = setup([
      pong(BUILD), ok(CONTEXT), unknownFn('checkFonts'), pong('07he7b0i1d00'), 'undefined', pong(BUILD), ok(fonts),
    ]);
    await bridge.getContext();
    const r = track(bridge.checkFonts(['SBSansText-Regular']));
    await advance(300);
    expect(host.scripts).toEqual([PING, GET_CONTEXT, CHECK_FONTS, PING, SOURCE, PING, CHECK_FONTS]);
    expect(r.value).toEqual({ ok: true, data: fonts });
  });

  it('UNKNOWN_FN right after the adapter was checked is final', async () => {
    const { host, bridge } = setup([pong(BUILD), unknownFn('checkFonts')]);
    expect(await bridge.checkFonts(['SBSansText-Regular'])).toMatchObject({ ok: false, error: { code: 'UNKNOWN_FN' } });
    expect(host.scripts).toEqual([PING, CHECK_FONTS]);
  });

  it('a host error is returned as it is, without a retry', async () => {
    const err = JSON.stringify({ ok: false, error: { code: 'HOST_EXCEPTION', message: 'boom', line: 7 } });
    const { host, bridge } = setup([pong(BUILD), err]);
    expect(await bridge.findPlaced(PROBE)).toEqual({ ok: false, error: { code: 'HOST_EXCEPTION', message: 'boom', line: 7 } });
    await advance(60000);
    expect(host.scripts).toEqual([PING, jsxCall('findPlaced', PROBE)]);
  });
});

describe('queue', () => {
  it('sends one call at a time, in the order the calls were made', async () => {
    const { host, bridge } = setup([pong(BUILD), { raw: ok(CONTEXT), after: 500 }, ok(RESULT), ok(PLACED), ok({ qe: true })]);
    const order: string[] = [];
    const a = bridge.getContext().then((r) => (order.push('getContext'), r));
    const b = bridge.insertItem(PR_ARGS).then((r) => (order.push('insertItem'), r));
    const c = bridge.findPlaced(PROBE).then((r) => (order.push('findPlaced'), r));
    const d = bridge.diag().then((r) => (order.push('diag'), r));
    await settle();
    expect(host.scripts).toEqual([PING, GET_CONTEXT]);
    await advance(499);
    expect(host.scripts).toEqual([PING, GET_CONTEXT]);
    expect(order).toEqual([]);
    await advance(1);
    expect(host.scripts).toEqual([PING, GET_CONTEXT, INSERT, jsxCall('findPlaced', PROBE), DIAG]);
    expect(await a).toEqual({ ok: true, data: CONTEXT });
    expect(await b).toEqual({ ok: true, data: RESULT });
    expect(await c).toEqual({ ok: true, data: PLACED });
    expect(await d).toEqual({ ok: true, data: { qe: true } });
    expect(order).toEqual(['getContext', 'insertItem', 'findPlaced', 'diag']);
  });

  it('keeps going after evalScript throws', async () => {
    const { host, bridge } = setup([pong(BUILD), { throws: 'no __adobe_cep__' }, pong(BUILD), ok(CONTEXT)]);
    await bridge.ensureAdapter();
    const r = await bridge.insertItem(PR_ARGS);
    expect(r).toMatchObject({ ok: false, error: { code: 'HOST_BRIDGE_ERROR' } });
    if (!r.ok) expect(r.error.message).toContain('no __adobe_cep__');
    expect(await bridge.getContext()).toEqual({ ok: true, data: CONTEXT });
    expect(host.scripts).toEqual([PING, INSERT, PING, GET_CONTEXT]);
  });

  it('uses the injected timers', async () => {
    const { timers, delays } = recordingTimers();
    const { bridge } = setup([pong(BUILD), ok(RESULT)], { timers });
    await bridge.insertItem(PR_ARGS);
    expect(delays).toEqual([30000, 120000]);
  });
});

describe('logging', () => {
  it('a log that throws on TIMEOUT does not hold the queue', async () => {
    const log = (_level: BridgeLogLevel, code: string): void => {
      if (code === 'TIMEOUT') throw new Error('disk full');
    };
    const { host, bridge } = setup([pong(BUILD), 'never', pong(BUILD), ok({ qe: true })], { log, timeouts: { read: 1000 } });
    const c = track(bridge.getContext());
    const d = track(bridge.diag());
    await advance(1000);
    expect(c.value).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    expect(d.value).toEqual({ ok: true, data: { qe: true } });
    expect(host.scripts).toEqual([PING, GET_CONTEXT, PING, DIAG]);
  });

  it('a log that always throws changes no reply', async () => {
    const { log, codes } = throwingLog();
    const { host, bridge } = setup(
      [
        'EvalScript error.', 'undefined', pong(BUILD), '', pong(BUILD), ok(CONTEXT),
        { raw: ok({ qe: true }), after: 31000 },
        pong('0ld0ld0ld0ld'), 'undefined', pong('0ld0ld0ld0ld'),
      ],
      { log },
    );
    const c = track(bridge.getContext());
    await advance(300);
    expect(c.value).toEqual({ ok: true, data: CONTEXT });
    const d = track(bridge.diag());
    await advance(31000);
    expect(d.value).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    expect(await bridge.ensureAdapter()).toMatchObject({ ok: false, error: { code: 'ADAPTER_LOAD' } });
    expect(host.scripts).toEqual([PING, SOURCE, PING, GET_CONTEXT, PING, GET_CONTEXT, DIAG, PING, SOURCE, PING]);
    // Every place the bridge logs was reached, and each threw.
    expect(codes).toEqual(['ADAPTER_LOADED', 'HOST_RETRY', 'TIMEOUT', 'LATE_REPLY', 'ADAPTER_LOAD']);
  });
});

describe('insertItem', () => {
  it('on a host without CRBK loads the adapter first, then sends the insert once', async () => {
    const { host, bridge } = setup(['EvalScript error.', 'undefined', pong(BUILD), ok(RESULT)]);
    expect(await bridge.insertItem(PR_ARGS)).toEqual({ ok: true, data: RESULT });
    expect(host.scripts).toEqual([PING, SOURCE, PING, INSERT]);
  });

  it('is never sent while the adapter cannot be loaded', async () => {
    const { host, bridge } = setup(['EvalScript error.', 'undefined', pong('0ld0ld0ld0ld')]);
    expect(await bridge.insertItem(PR_ARGS)).toMatchObject({ ok: false, error: { code: 'ADAPTER_LOAD' } });
    await advance(60000);
    expect(host.scripts).toEqual([PING, SOURCE, PING]);
  });

  it('retries the adapter check on a cold engine, never the insert', async () => {
    const { host, bridge } = setup(['EvalScript error.', 'undefined', 'EvalScript error.', pong(BUILD), ok(RESULT)]);
    const r = track(bridge.insertItem(PR_ARGS));
    await settle();
    expect(host.scripts).toEqual([PING, SOURCE, PING]);
    await advance(300);
    expect(host.scripts).toEqual([PING, SOURCE, PING, PING, INSERT]);
    expect(r.value).toEqual({ ok: true, data: RESULT });
  });

  it('is not retried or re-sent after a cold-start reply; the next call checks the adapter', async () => {
    const { host, bridge } = setup([pong(BUILD), 'EvalScript error.']);
    await bridge.ensureAdapter();
    expect(await bridge.insertItem(PR_ARGS)).toEqual({ ok: false, error: { code: 'HOST_EVAL_ERROR', message: 'EvalScript error.' } });
    await advance(60000);
    expect(host.scripts).toEqual([PING, INSERT]);
    host.steps.push(pong(BUILD), ok(CONTEXT));
    await bridge.getContext();
    expect(host.scripts).toEqual([PING, INSERT, PING, GET_CONTEXT]);
    expect(count(host.scripts, INSERT)).toBe(1);
  });

  it('times out after 120 s with TIMEOUT, is not re-sent, logs its late reply; the queue moves on with a ping first', async () => {
    const { host, bridge, logs } = setup([pong(BUILD), { raw: ok(RESULT), after: 130000 }, pong(BUILD), ok(CONTEXT)]);
    await bridge.ensureAdapter();
    const ins = track(bridge.insertItem(PR_ARGS));
    const ctx = track(bridge.getContext());
    await settle();
    expect(host.scripts).toEqual([PING, INSERT]);
    await advance(119999);
    expect(ins.done).toBe(false);
    expect(ctx.done).toBe(false);
    await advance(1);
    expect(ins.value).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    expect(host.scripts).toEqual([PING, INSERT, PING, GET_CONTEXT]);
    expect(ctx.value).toEqual({ ok: true, data: CONTEXT });
    await advance(10000);
    expect(logs.find((l) => l.code === 'LATE_REPLY')).toMatchObject({ level: 'warn', data: { fn: 'insertItem', ms: 120000 } });
    expect(ins.value).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    expect(count(host.scripts, INSERT)).toBe(1);
    expect(host.unexpected).toEqual([]);
  });

  it('after a timed-out insert the next call pings first, and a ping that times out keeps a second insert unsent', async () => {
    // A modal dialog holds the host: a second click must not queue another insert behind the first.
    const { host, bridge } = setup([pong(BUILD), 'never', 'never', pong(BUILD), ok(CONTEXT)]);
    await bridge.ensureAdapter();
    const first = track(bridge.insertItem(PR_ARGS));
    const second = track(bridge.insertItem(PR_ARGS));
    const ctx = track(bridge.getContext());
    await advance(120000);
    expect(first.value).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    expect(host.scripts).toEqual([PING, INSERT, PING]);
    await advance(29999);
    expect(second.done).toBe(false);
    await advance(1);
    expect(second.value).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    // Still in doubt after the ping timed out, so the read checks again.
    expect(ctx.value).toEqual({ ok: true, data: CONTEXT });
    expect(host.scripts).toEqual([PING, INSERT, PING, PING, GET_CONTEXT]);
    expect(count(host.scripts, INSERT)).toBe(1);
  });

  it('is never sent when the ping before it times out', async () => {
    const { host, bridge } = setup(['never']);
    const r = track(bridge.insertItem(PR_ARGS));
    await advance(29999);
    expect(r.done).toBe(false);
    await advance(1);
    expect(r.value).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    await advance(120000);
    expect(host.scripts).toEqual([PING]);
  });

  it.each<[string, string, HostError]>([
    ['UNKNOWN_FN', unknownFn('insertItem'), { code: 'UNKNOWN_FN', message: 'insertItem' }],
    ['an empty reply', '', { code: 'HOST_EMPTY', message: '' }],
  ])('returns %s as it came, sends the insert once, and checks the adapter before the next call', async (_, raw, error) => {
    const { host, bridge } = setup([pong(BUILD), raw, pong(BUILD), ok(CONTEXT)]);
    expect(await bridge.insertItem(PR_ARGS)).toEqual({ ok: false, error });
    await advance(60000);
    expect(host.scripts).toEqual([PING, INSERT]);
    expect(await bridge.getContext()).toEqual({ ok: true, data: CONTEXT });
    expect(host.scripts).toEqual([PING, INSERT, PING, GET_CONTEXT]);
    expect(count(host.scripts, INSERT)).toBe(1);
  });

  it('honours custom timeouts', async () => {
    const { host, bridge } = setup([pong(BUILD), 'never', 'never'], { timeouts: { read: 1000, mutate: 5000 } });
    await bridge.ensureAdapter();
    const ins = track(bridge.insertItem(PR_ARGS));
    await advance(4999);
    expect(ins.done).toBe(false);
    await advance(1);
    expect(ins.value).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    // The ping that the timeout calls for waits as long as a read.
    const ctx = track(bridge.getContext());
    await advance(999);
    expect(ctx.done).toBe(false);
    await advance(1);
    expect(ctx.value).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    expect(host.scripts).toEqual([PING, INSERT, PING]);
  });
});

describe('ASCII on the wire', () => {
  it('sends only ASCII, and the host decodes Cyrillic, Ё and × arguments intact', async () => {
    const title = 'Титр «Ёлка» 16×9';
    const { host, bridge } = setup(['EvalScript error.', 'undefined', pong(BUILD), ok(RESULT), ok(PLACED)]);
    await bridge.insertItem(AE_ARGS);
    await bridge.findPlaced({ kind: 'layer', targetId: '12', startSec: 2, name: title });
    expect(host.scripts).toHaveLength(5);
    for (const s of host.scripts) expect(isAscii(s)).toBe(true);
    const seen: { fn: string; args: unknown }[] = [];
    const CRBK = {
      call(fn: string, json: string): string {
        seen.push({ fn, args: JSON.parse(json) });
        return '';
      },
    };
    for (const s of [host.scripts[3], host.scripts[4]]) (new Function('CRBK', String(s)) as (c: typeof CRBK) => void)(CRBK);
    expect(seen).toEqual([
      { fn: 'insertItem', args: AE_ARGS },
      { fn: 'findPlaced', args: { kind: 'layer', targetId: '12', startSec: 2, name: title } },
    ]);
  });
});
