// The bridge between the panel and the host (spec 6 «Мост»): one entry point host.call(fn, args).
// - Arguments travel as ASCII: evalScript on Windows mangles Cyrillic, \uXXXX inside a string literal does not.
// - Calls run one after another: ExtendScript is single-threaded and a second evalScript only queues up.
// - Every call has a timeout. A read call that meets a cold host (the host script is not loaded yet) loads
//   it and tries again; a call that changes the project is never repeated (the core reads the state instead).
import type { CallOptions, HostCaller, HostReply } from '../core/host';

export type EvalScript = (script: string) => Promise<string>;

export interface BridgeEvent {
  fn: string;
  mutating: boolean;
  attempt: number;
  ms: number;
  ok: boolean;
  code?: string;
}

export interface BridgeOptions {
  evalScript: EvalScript;
  // Loads panel/host into the host (BK.call); called on a cold start before a read call is tried again.
  loadHost?: () => Promise<void>;
  timeoutMs?: number;
  coldRetries?: number;
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  onCall?: (e: BridgeEvent) => void;
}

// Non-ASCII characters as \uXXXX: inside a JS string literal the escape gives back the same string.
export function asciiEscape(s: string): string {
  return s.replace(/[\u0080-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

// A JS string literal holding `s`, ASCII only.
export function asciiLiteral(s: string): string {
  return asciiEscape(JSON.stringify(s));
}

export function hostScript(fn: string, args: unknown): string {
  return `BK.call(${asciiLiteral(fn)},${asciiLiteral(JSON.stringify(args ?? null))})`;
}

export const COLD = Symbol('cold');

// What evalScript gave back: a reply, or COLD when the script did not run (no BK in the host yet).
export function parseReply(raw: unknown): HostReply | typeof COLD {
  if (raw === undefined || raw === null) return COLD;
  const s = String(raw);
  if (s === '' || s === 'undefined' || s === 'null' || s.indexOf('EvalScript error') === 0) return COLD;
  let v: unknown;
  try {
    v = JSON.parse(s);
  } catch {
    return { ok: false, error: { code: 'BRIDGE', message: 'unreadable reply: ' + s.slice(0, 200) } };
  }
  if (!v || typeof v !== 'object' || typeof (v as HostReply).ok !== 'boolean') {
    return { ok: false, error: { code: 'BRIDGE', message: 'reply without ok: ' + s.slice(0, 200) } };
  }
  return v as HostReply;
}

const TIMED_OUT = Symbol('timeout');

export class Bridge implements HostCaller {
  private tail: Promise<unknown> = Promise.resolve();
  private readonly timeoutMs: number;
  private readonly coldRetries: number;
  private readonly retryDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(private readonly opts: BridgeOptions) {
    this.timeoutMs = opts.timeoutMs ?? 30000;
    this.coldRetries = opts.coldRetries ?? 2;
    this.retryDelayMs = opts.retryDelayMs ?? 300;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? (() => Date.now());
  }

  call<T = unknown>(fn: string, args?: unknown, opts: CallOptions = {}): Promise<HostReply<T>> {
    const run = () => this.exec<T>(fn, args, opts);
    const p = this.tail.then(run, run);
    this.tail = p.catch(() => undefined);
    return p;
  }

  private evalWithTimeout(script: string, ms: number): Promise<string | typeof TIMED_OUT> {
    return new Promise((resolve) => {
      let done = false;
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          resolve(TIMED_OUT);
        }
      }, ms);
      this.opts.evalScript(script).then(
        (r) => {
          if (!done) {
            done = true;
            clearTimeout(timer);
            resolve(r);
          }
        },
        (e) => {
          if (!done) {
            done = true;
            clearTimeout(timer);
            resolve('{"ok":false,"error":{"code":"BRIDGE","message":' + JSON.stringify(String(e)) + '}}');
          }
        },
      );
    });
  }

  private async exec<T>(fn: string, args: unknown, opts: CallOptions): Promise<HostReply<T>> {
    const mutating = opts.mutating === true;
    const script = hostScript(fn, args);
    for (let attempt = 0; ; attempt += 1) {
      const t0 = this.now();
      const raw = await this.evalWithTimeout(script, opts.timeoutMs ?? this.timeoutMs);
      const ms = this.now() - t0;
      if (raw === TIMED_OUT) {
        const reply: HostReply<T> = { ok: false, error: { code: 'TIMEOUT', message: `no reply in ${opts.timeoutMs ?? this.timeoutMs} ms` } };
        this.opts.onCall?.({ fn, mutating, attempt, ms, ok: false, code: 'TIMEOUT' });
        return reply;
      }
      const r = parseReply(raw);
      if (r === COLD) {
        this.opts.onCall?.({ fn, mutating, attempt, ms, ok: false, code: 'HOST_NOT_READY' });
        if (mutating || attempt >= this.coldRetries) {
          return { ok: false, error: { code: 'HOST_NOT_READY', message: 'the host script did not run: ' + String(raw).slice(0, 120) } };
        }
        if (this.opts.loadHost) await this.opts.loadHost();
        await this.sleep(this.retryDelayMs * (attempt + 1));
        continue;
      }
      this.opts.onCall?.({ fn, mutating, attempt, ms, ok: r.ok, code: r.error?.code });
      return r as HostReply<T>;
    }
  }
}

// CSInterface.evalScript as a promise (CEP): https://github.com/Adobe-CEP/CEP-Resources (CSInterface.js).
export interface CSInterfaceLike {
  evalScript(script: string, callback?: (result: string) => void): void;
}

export function csEval(cs: CSInterfaceLike): EvalScript {
  return (script) => new Promise((resolve) => cs.evalScript(script, (r) => resolve(r)));
}

// Loads the host bundle with $.evalFile; the path may hold Cyrillic (a user folder), so it goes ASCII-escaped.
export function evalFileScript(path: string): string {
  return `$.evalFile(${asciiLiteral(path.replace(/\\/g, '/'))});'loaded'`;
}
