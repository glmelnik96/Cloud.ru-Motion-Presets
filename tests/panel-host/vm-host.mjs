// node:vm stand-in for the ExtendScript engine of AE and Premiere, shared by the host adapter tests (plan
// 2026-10-05, tasks 5-7). The adapter is assembled the way the build does it (tools/panel/build-host.mjs:
// prelude + common + host part, build stamp, ASCII and ES3 lint gate) and called with the panel's own encoder
// (panel/src/bridge/ascii.ts): one source CRBK.call("<fn>", "<json>") whose JSON has every char >= U+007F written
// as \uXXXX.
//   const h = loadAdapter('pr', { app, Time, File, qe });
//   h.call('getContext');        // -> { ok: true, data: {...} }, parsed from the JSON string reply
// Host globals are the caller's mocks (app defaults to { version } of the host); $ is { global, sleep } plus any $
// given, where $.global is the engine's global object, as in ExtendScript. Like ExtendScript, an error thrown
// by adapter code carries e.line, the line of the assembly. Like AE 26.5, the 'ae' engine gives every object of its
// own realm the inherited members AE_OPERATORS below. Objects made outside the engine (the caller's mocks) have
// neither those members nor the engine's Array: adapter code that should run with the JSON polyfill must build
// arrays inside the engine (the polyfill tests instanceof Array of its own realm).
import vm from 'node:vm';
import { asciiJson, jsxCall } from '../../panel/src/bridge/ascii.ts';
import { assemble, readParts, stampOf } from '../../tools/panel/build-host.mjs';

export const APP_VERSION = { ae: '26.5x89', pr: '26.5.2' };

// AE 26.5 gives every object inherited '*', '+', '-' and '/' members (ExtendScript operator overloading, seen live
// 2026-10-05; Premiere has none), so a lookup by an arbitrary key without hasOwnProperty finds a function. Only the
// lookup is emulated: V8 never calls them for an operator. The same line as tests/tools/prelude-json.test.mjs.
export const AE_OPERATORS = "Object.prototype['*'] = Object.prototype['+'] = Object.prototype['-'] = Object.prototype['/'] = function () { throw new Error('Object of type Function found where a Number, Array, or Property is needed'); };";

// The panel's encoder itself, so the calls made here cannot drift from what the panel sends. callSource(fn, args)
// is the evalScript source of one call; like the panel it refuses a fn that is not a plain identifier (h.send
// takes any name).
export { asciiJson, jsxCall as callSource };

// -> { build, source, warnings } for one host; `parts` replaces some of the repo files (prelude, common, ae, pr).
export function assembleAdapter(host, parts = {}) {
  const all = { ...readParts(), ...parts };
  const build = stampOf(all);
  return { build, ...assemble(all, host, build) };
}

// ExtendScript errors know their line; V8 errors only have a stack. Errors made by code of `file` get an e.line
// from their first stack frame in it.
function lineShim(file) {
  const re = new RegExp('[( ]' + file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':(\\d+):\\d+');
  return `Object.defineProperty(Error.prototype, 'line', {
  configurable: true,
  get: function () { var m = ${re}.exec(String(this.stack)); return m ? Number(m[1]) : undefined; },
  set: function (v) { Object.defineProperty(this, 'line', { value: v, writable: true, enumerable: true, configurable: true }); }
});`;
}

// opts: parts (as in assembleAdapter), nativeJson (false deletes JSON first, so the prelude installs its polyfill,
// as on hosts without one; AE is the host seen without it), aeOperators (default host === 'ae': AE_OPERATORS runs
// before anything else), timeout (ms per evaluation; a wait loop that never ends fails instead of hanging).
export function loadAdapter(host, globals = {}, opts = {}) {
  const { parts, nativeJson = true, aeOperators = host === 'ae', timeout = 10000 } = opts;
  const adapter = assembleAdapter(host, parts);
  const file = `crbk-${host}.jsx`;
  const context = vm.createContext({ app: { version: APP_VERSION[host] }, ...globals });
  if (aeOperators) vm.runInContext(AE_OPERATORS, context);
  const global = vm.runInContext('this', context);
  context.$ = { sleep() {}, ...globals.$, global };
  if (!nativeJson) vm.runInContext('delete this.JSON;', context);
  vm.runInContext(lineShim(file), context);
  const names = () => vm.runInContext('Object.getOwnPropertyNames(this)', context);
  const baseline = new Set(names());
  const run = (src, filename = 'evalScript') => vm.runInContext(src, context, { filename, timeout });
  const h = {
    host,
    context,
    global,
    ...adapter,
    run,
    // Loads an adapter source again (default: the same build), as the panel does after a cold start or an update.
    load: (source = adapter.source) => run(source, file),
    // Raw reply to a raw second argument (any JS value, e.g. broken JSON).
    send: (fn, json) => run(`CRBK.call(${JSON.stringify(String(fn))}, ${json === undefined ? 'undefined' : JSON.stringify(json)})`),
    call(fn, args) {
      const reply = run(jsxCall(fn, args));
      if (typeof reply !== 'string') throw new Error(`CRBK.call("${fn}") returned ${typeof reply}, not a JSON string`);
      return JSON.parse(reply);
    },
    // Global names that appeared since just before the first load (host globals and $ excluded), sorted.
    addedGlobals: () => names().filter((n) => !baseline.has(n)).sort(),
  };
  h.load();
  return h;
}
