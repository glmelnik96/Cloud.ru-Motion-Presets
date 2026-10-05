import { describe, it, expect } from 'vitest';
import { buildHost, readParts } from '../../tools/panel/build-host.mjs';
import { APP_VERSION, assembleAdapter, callSource, loadAdapter } from './vm-host.mjs';

// A test host part: the host key plus probes that drive every path of CRBK.call.
const probes = (host) => `(function (CRBK) {
  CRBK.host = '${host}';
  CRBK.fns.echo = function (args) { return CRBK.ok(args); };
  CRBK.fns.chars = function (args) {
    var out = [], i;
    for (i = 0; i < args.s.length; i++) { out.push(args.s.charCodeAt(i)); }
    return CRBK.ok(out);
  };
  CRBK.fns.refuse = function (args) { throw CRBK.error('TARGET_CHANGED', args.why); };
  CRBK.fns.fail = function () { return CRBK.fail('NO_TARGET'); };
  CRBK.fns.failThrown = function (args) { throw CRBK.fail('NO_TARGET', args.why); };
  CRBK.fns.rewrapped = function () {
    try { throw CRBK.error('TEMPLATE_DUPLICATE', '2 folders'); } catch (e) { throw new Error('insert failed: ' + e); }
  };
  CRBK.fns.none = function () { return CRBK.ok(); };
  CRBK.fns.boom = function () { var o = null; return o.x; }; // BOOM
  CRBK.fns.plain = function () { throw 'plain'; };
  CRBK.fns.loose = function () { return 42; };
  CRBK.fns.bare = function () { return { ok: true }; };
  CRBK.fns.undef = function () { return { ok: true, data: undefined }; };
  CRBK.fns.fnData = function () { return CRBK.ok(function () {}); };
  CRBK.fns.cyclic = function () { var o = {}; o.self = o; return CRBK.ok(o); };
  // Like an AE object whose item was deleted: reading any property of it throws 'Object is invalid'.
  function invalid() {
    var o = {};
    o.__defineGetter__('ok', function () { throw new Error('Object is invalid'); });
    return o;
  }
  CRBK.fns.invalidThrown = function () { throw invalid(); };
  CRBK.fns.invalidReturned = function () { return invalid(); };
})($.global.CRBK);
`;
const load = (host = 'ae', opts = {}, globals = {}) => loadAdapter(host, globals, { parts: { [host]: probes(host) }, ...opts });
const ASCII = /^[\x00-\x7f]*$/;
// An expression evaluated inside the engine, brought out as JSON.
const js = (h, src) => JSON.parse(h.run(`JSON.stringify(${src})`));
// Text with the characters that AE 26.5's inherited operator members break an escape-table lookup on.
const OPERATORS = { path: 'C:/CRBK/work/x-y.aep', name: 'Анна-Мария', x: '2*3+1', 'a/b-c': '+*' };
const NOT_SERIALIZABLE = { ok: false, error: { code: 'HOST_EXCEPTION', message: 'reply is not serializable' } };

describe('host common: CRBK.call', () => {
  it.each(['ae', 'pr'])('%s: ping reports the build, the app version, the adapter host and the JSON engine', (host) => {
    const h = load(host);
    expect(h.call('ping')).toEqual({ ok: true, data: { build: h.build, app: APP_VERSION[host], host, json: 'native' } });
    expect(h.build).toMatch(/^[0-9a-f]{12}$/);
  });

  it('pings without app and before a host part has registered', () => {
    const h = loadAdapter('ae', { app: undefined }, { parts: { ae: '' } });
    expect(h.call('ping').data).toMatchObject({ app: null, host: null });
  });

  it('refuses an unknown function, prototype and AE operator names included', () => {
    const h = load();
    expect(h.call('nope')).toEqual({ ok: false, error: { code: 'UNKNOWN_FN', message: 'nope' } });
    for (const fn of ['toString', 'constructor', 'hasOwnProperty']) expect(h.call(fn).error.code).toBe('UNKNOWN_FN');
    // Not identifiers, so the panel's encoder refuses them: sent raw.
    for (const fn of ['+', '*', '-', '/']) expect(JSON.parse(h.send(fn, '{}')).error).toEqual({ code: 'UNKNOWN_FN', message: fn });
    expect(JSON.parse(h.send('nope', '{bad')).error.code).toBe('UNKNOWN_FN');
  });

  it('refuses arguments that are not JSON of an object or an array', () => {
    const h = load();
    for (const json of ['{bad', '{"a": x}', '"text"', '5', 'true', '', 5]) {
      const r = JSON.parse(h.send('echo', json));
      expect(r.ok).toBe(false);
      expect(r.error.code).toBe('BAD_ARGS');
      expect(typeof r.error.message).toBe('string');
    }
    expect(JSON.parse(h.send('echo'))).toEqual({ ok: true, data: {} });
    expect(JSON.parse(h.send('echo', 'null'))).toEqual({ ok: true, data: {} });
    expect(h.call('echo', ['a', 'b'])).toEqual({ ok: true, data: ['a', 'b'] });
  });

  it('turns a thrown CRBK.error into its code and message, and passes a thrown CRBK.fail reply through', () => {
    const h = load();
    expect(h.call('refuse', { why: 'comp 7' })).toEqual({ ok: false, error: { code: 'TARGET_CHANGED', message: 'comp 7' } });
    expect(h.call('refuse')).toEqual({ ok: false, error: { code: 'TARGET_CHANGED' } });
    expect(h.call('failThrown', { why: 'comp 7' })).toEqual({ ok: false, error: { code: 'NO_TARGET', message: 'comp 7' } });
    expect(h.call('failThrown')).toEqual({ ok: false, error: { code: 'NO_TARGET' } });
  });

  it('passes CRBK.ok and CRBK.fail replies through, CRBK.ok() with data null', () => {
    const h = load();
    expect(h.call('fail')).toEqual({ ok: false, error: { code: 'NO_TARGET' } });
    expect(h.call('echo', { a: [1, true, null] })).toEqual({ ok: true, data: { a: [1, true, null] } });
    expect(h.run(callSource('none'))).toBe('{"ok":true,"data":null}');
  });

  it('turns any other exception into HOST_EXCEPTION with the message and the line of the assembly', () => {
    const h = load();
    const line = h.source.split('\n').findIndex((l) => l.includes('// BOOM')) + 1;
    expect(line).toBeGreaterThan(1);
    expect(h.call('boom')).toEqual({ ok: false, error: { code: 'HOST_EXCEPTION', message: expect.stringMatching(/^TypeError: /), line } });
    expect(h.call('plain')).toEqual({ ok: false, error: { code: 'HOST_EXCEPTION', message: 'plain' } });
    // A CRBK.error wrapped into another error keeps its code in the message.
    expect(h.call('rewrapped')).toEqual({
      ok: false,
      error: { code: 'HOST_EXCEPTION', message: 'Error: insert failed: TEMPLATE_DUPLICATE: 2 folders', line: expect.any(Number) },
    });
  });

  it('reports a function that returns no reply, a success without data or an unserializable reply', () => {
    const h = load();
    // bare, undef and fnData would reach the panel as {"ok":true}: JSON drops an undefined or function data.
    for (const fn of ['loose', 'bare', 'undef', 'fnData', 'cyclic', 'invalidReturned']) {
      expect(h.call(fn), fn).toEqual({ ok: false, error: { code: 'HOST_EXCEPTION', message: expect.stringContaining(fn) } });
    }
    expect(h.call('invalidThrown')).toEqual({ ok: false, error: { code: 'HOST_EXCEPTION', message: '[object Object]' } });
  });

  it('always replies with a JSON string', () => {
    const h = load();
    const fns = ['ping', 'nope', 'echo', 'refuse', 'fail', 'failThrown', 'rewrapped', 'none', 'boom', 'plain', 'loose',
      'bare', 'undef', 'fnData', 'cyclic', 'invalidThrown', 'invalidReturned'];
    const sources = fns.map((fn) => callSource(fn));
    sources.push('CRBK.call("echo", "{bad")', 'CRBK.call("echo")', 'CRBK.call()', 'CRBK.call("echo", 5)', 'CRBK.call(null, null)',
      'CRBK.call("+", "{}")');
    for (const src of sources) {
      const reply = h.run(src);
      expect(typeof reply, src).toBe('string');
      expect(typeof JSON.parse(reply).ok, src).toBe('boolean');
    }
  });

  it('replies with a fixed JSON string when the engine has no JSON at all', () => {
    const h = load('ae', { nativeJson: false, parts: { prelude: '', ae: probes('ae') } });
    for (const fn of ['ping', 'echo', 'nope']) expect(h.call(fn)).toEqual(NOT_SERIALIZABLE);
    expect(h.addedGlobals()).toEqual(['CRBK']);
  });

  it('replies with the fixed JSON string when the JSON it was loaded with does not give an object', () => {
    // Broken on objects only, so it passes the health check of the prelude that runs after it, which stringifies a
    // string, and stays in place.
    const half = "JSON = { stringify: function (v) { return typeof v === 'string' ? '\"' + v + '\"' : String(v); },\n" +
      "  parse: function (t) { return eval('(' + t + ')'); } };";
    const h = load('ae', { parts: { prelude: half + '\n' + readParts().prelude, ae: probes('ae') } });
    expect(h.run('JSON.stringify({})')).toBe('[object Object]');
    for (const fn of ['ping', 'echo', 'refuse']) expect(h.call(fn)).toEqual(NOT_SERIALIZABLE);
  });

  it('keeps the JSON it was loaded with when another extension replaces the shared global', () => {
    const h = load();
    h.run('JSON = { stringify: function () { return "broken"; }, parse: function () { return 1; } };');
    expect(h.call('echo', { s: '\u0410' })).toEqual({ ok: true, data: { s: 'А' } });
    expect(h.call('ping').data.json).toBe('native');
  });

  const swapped = 'keeps the JSON functions it was loaded with when another extension swaps them in place (native: %s)';
  it.each([true, false])(swapped, (nativeJson) => {
    const h = load('ae', { nativeJson });
    h.run('JSON.stringify = function () { return "broken"; }; JSON.parse = function () { return 1; };');
    expect(h.run(callSource('echo', { a: 1 }))).toBe('{"ok":true,"data":{"a":1}}');
    expect(h.call('echo', { s: '\u0410' })).toEqual({ ok: true, data: { s: 'А' } });
    expect(h.call('ping').data.json).toBe(nativeJson ? 'native' : 'polyfill');
  });
});

describe('host common: Cyrillic transport', () => {
  it('sends arguments as the panel does: ASCII JSON packed into a JS string literal', () => {
    expect(callSource('echo', { s: '\u0410\u00d7' })).toBe('CRBK.call("echo", "{\\"s\\":\\"\\\\u0410\\\\u00d7\\"}")');
  });

  it('decodes \\u0410 into one character U+0410 inside the host', () => {
    const h = load();
    expect(h.call('chars', { s: '\u0410' })).toEqual({ ok: true, data: [0x410] });
    expect(h.call('echo', { s: '\u0410' }).data.s).toBe('А');
  });

  it('brings Cyrillic back in an ASCII reply', () => {
    const h = load();
    const args = { title: 'Ёлка × 2', 'ключ': 'А', edge: '~' + String.fromCharCode(0x7f, 0xffff, 0xd83d, 0xde00) };
    const raw = h.run(callSource('echo', args));
    expect(raw).toMatch(ASCII);
    expect(raw).toContain('~\\u007f\\uffff\\ud83d\\ude00');
    expect(JSON.parse(raw)).toEqual({ ok: true, data: args });
  });

  const engines = [['ae', true], ['ae', false], ['pr', true], ['pr', false]];
  it.each(engines)('%s, native JSON %s: echoes everything the panel encoder sends', (host, nativeJson) => {
    const h = load(host, { nativeJson });
    const args = {
      ...OPERATORS,
      text: 'Ёлка × 2 \u007f \u2028\u2029 \ud83d\ude00 \ud800 \x00\x01\x1f \\ "q"',
      list: ['А', 1.5, true, null, { 'ключ': '/' }],
    };
    const raw = h.run(callSource('echo', args));
    expect(raw).toMatch(ASCII);
    expect(JSON.parse(raw)).toEqual({ ok: true, data: args });
  });
});

describe('host common: loading', () => {
  const state = (h) => js(h, 'CRBK.state');

  it('keeps the object, its state and the common functions when the same build is loaded again', () => {
    const h = load();
    const first = h.context.CRBK;
    const call = first.call;
    h.run('CRBK.state.ae = { inserts: 1 };');
    h.load();
    expect(h.context.CRBK).toBe(first);
    expect(h.context.CRBK.call).toBe(call);
    expect(state(h)).toEqual({ ae: { inserts: 1 } });
    expect(h.call('ping').data).toMatchObject({ build: h.build, host: 'ae' });
  });

  it('replaces the functions and starts from an empty state when a different build is loaded', () => {
    const h = load();
    h.run('CRBK.fns.stale = function () { return CRBK.ok(1); }; CRBK.state.ae = 1;');
    expect(h.call('stale')).toEqual({ ok: true, data: 1 });
    const next = assembleAdapter('ae', { ae: probes('ae') + '// next build\n' });
    expect(next.build).not.toBe(h.build);
    h.load(next.source);
    expect(h.call('stale')).toEqual({ ok: false, error: { code: 'UNKNOWN_FN', message: 'stale' } });
    expect(state(h)).toEqual({});
    expect(h.call('ping').data).toMatchObject({ build: next.build, host: 'ae' });
  });

  it('adds no globals but CRBK', () => {
    const h = load();
    h.call('echo', { a: 1 });
    h.call('boom');
    h.load();
    expect(h.addedGlobals()).toEqual(['CRBK']);
  });

  it.each(['ae', 'pr'])('%s: runs on a host without native JSON: only the prelude polyfill joins CRBK', (host) => {
    const h = load(host, { nativeJson: false });
    expect(h.addedGlobals()).toEqual(['CRBK', 'JSON']);
    expect(h.call('ping').data.json).toBe('polyfill');
    expect(h.call('chars', { s: '\u0410' }).data).toEqual([0x410]);
    const args = { title: 'Ёлка × 2', ...OPERATORS };
    const raw = h.run(callSource('echo', args));
    expect(raw).toMatch(ASCII);
    expect(JSON.parse(raw)).toEqual({ ok: true, data: args });
    for (const fn of ['+', '*']) expect(JSON.parse(h.send(fn, '{}')).error.code).toBe('UNKNOWN_FN');
    for (const json of ['{bad', 'alert(1)']) expect(JSON.parse(h.send('echo', json)).error.code).toBe('BAD_ARGS');
    expect(h.call('boom').error.code).toBe('HOST_EXCEPTION');
  });

  it('loads the real assemblies of both hosts exactly as the build writes them, with no globals but CRBK', () => {
    const built = buildHost();
    for (const host of ['ae', 'pr']) {
      for (const nativeJson of [true, false]) {
        const h = loadAdapter(host, {}, { nativeJson });
        expect(h.source).toBe(built[host]);
        expect(h.call('ping').data).toMatchObject({ build: built.build, host, json: nativeJson ? 'native' : 'polyfill' });
        h.load();
        expect(h.addedGlobals(), host).toEqual(nativeJson ? ['CRBK'] : ['CRBK', 'JSON']);
      }
    }
  });

  it('keeps CRBK.state of the real assemblies across a same-build reload and drops it with any other build', () => {
    for (const host of ['ae', 'pr']) {
      const h = loadAdapter(host);
      expect(state(h)).toEqual({});
      h.run(`CRBK.state.${host} = { last: 7 };`);
      h.load();
      expect(state(h)).toEqual({ [host]: { last: 7 } });
      const next = assembleAdapter(host, { [host]: readParts()[host] + '\n// next build\n' });
      expect(next.build).not.toBe(h.build);
      h.load(next.source);
      expect(state(h)).toEqual({});
      expect(h.call('ping').data).toMatchObject({ build: next.build, host });
    }
  });

  it('lints the prelude and the common head without warnings', () => {
    expect(assembleAdapter('ae', { ae: '' }).warnings).toEqual([]);
  });
});

describe('host common: AE engine of the tests', () => {
  it('gives every object made on ae the operator members of AE 26.5, and none on pr or when turned off', () => {
    expect(load('ae').run("typeof ({})['/'] + typeof []['+']")).toBe('functionfunction');
    expect(load('pr').run("typeof ({})['/']")).toBe('undefined');
    expect(load('ae', { aeOperators: false }).run("typeof ({})['/']")).toBe('undefined');
  });
});

describe('host common: helpers for adapters', () => {
  it('tells arrays from array-likes, also for arrays made by host mocks', () => {
    const h = load('ae', {}, { mockList: [1, 2] });
    expect(js(h, '[CRBK.isList([]), CRBK.isList([1]), CRBK.isList(mockList)]')).toEqual([true, true, true]);
    expect(js(h, '[CRBK.isList({ length: 0 }), CRBK.isList("ab"), CRBK.isList(null), CRBK.isList(undefined)]')).toEqual([false, false, false, false]);
    expect(js(h, 'typeof CRBK.isArray')).toBe('undefined');
  });

  it('lets a host part call every helper without an ES3 lint warning', () => {
    const part = `(function (CRBK) {
  CRBK.fns.f = function (a) {
    if (!CRBK.isList(a)) { throw CRBK.error('BAD_ARGS', 'a list'); }
    return a.length ? CRBK.ok(CRBK.round(a[0], 2)) : CRBK.fail('NO_TARGET');
  };
})($.global.CRBK);
`;
    expect(assembleAdapter('ae', { ae: part }).warnings).toEqual([]);
    const h = loadAdapter('ae', {}, { parts: { ae: part } });
    expect(h.call('f', [-0.125])).toEqual({ ok: true, data: -0.13 });
    expect(h.call('f', [])).toEqual({ ok: false, error: { code: 'NO_TARGET' } });
    expect(h.call('f', { a: 1 })).toEqual({ ok: false, error: { code: 'BAD_ARGS', message: 'a list' } });
  });

  it('rounds half away from zero to the given digits', () => {
    const h = load();
    expect(js(h, '[CRBK.round(2.5), CRBK.round(-2.5), CRBK.round(7), CRBK.round(29.97002997, 3), CRBK.round(12.36, 4), CRBK.round(0.1 + 0.2, 2)]'))
      .toEqual([3, -3, 7, 29.97, 12.36, 0.3]);
  });

  it('makes CRBK.error throwable outside CRBK.call too', () => {
    const h = load();
    expect(js(h, '(function () { try { throw CRBK.error("NO_TARGET", "x"); } catch (e) { return [e.code, e.message]; } })()')).toEqual(['NO_TARGET', 'x']);
  });

  it('prints a CRBK.error as its code and message, so logging or wrapping it keeps the code', () => {
    const h = load();
    expect(js(h, '[String(CRBK.error("TEMPLATE_DUPLICATE", "2 folders")), String(CRBK.error("NO_TARGET")), "w: " + CRBK.error("X", 0)]'))
      .toEqual(['TEMPLATE_DUPLICATE: 2 folders', 'NO_TARGET', 'w: X: 0']);
  });

  it('exposes _wrap: the reply object of one function, before JSON', () => {
    const h = load();
    expect(js(h, 'CRBK._wrap("refuse", { why: "w" })')).toEqual({ ok: false, error: { code: 'TARGET_CHANGED', message: 'w' } });
    expect(js(h, 'CRBK._wrap("echo", [1])')).toEqual({ ok: true, data: [1] });
    expect(js(h, 'CRBK._wrap("nope", {})').error.code).toBe('UNKNOWN_FN');
    expect(js(h, 'CRBK._wrap("bare", {})').error.code).toBe('HOST_EXCEPTION');
  });
});
