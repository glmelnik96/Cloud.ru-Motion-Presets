// Shared head of the BrandKit host adapters (ES3, ASCII only). The panel sends prelude-json.jsx + this file +
// ae.jsx or pr.jsx as one source through evalScript (plan 2026-10-05 P4), then calls CRBK.call(fn, json): json is
// the arguments as JSON with everything >= U+007F written as \uXXXX. The reply is a JSON string, ASCII too:
// {ok:true,data} or {ok:false,error:{code,message,line}}. Russian text never lives here: the panel maps codes to
// messages. $.global.CRBK is the only global, because ExtendScript globals are shared by every extension of a host.
//
// A host part (ae.jsx, pr.jsx) is (function (CRBK) { ... })($.global.CRBK); and keeps these rules:
// - It sets CRBK.host ('ae' or 'pr') and CRBK.fns.<name> = function (args) { ... }. args is the parsed object or
//   array ({} when none); the function returns CRBK.ok(data) or CRBK.fail(code, message), or throws
//   CRBK.error(code, message) from any depth. Any other exception becomes HOST_EXCEPTION with its line.
// - Its load-time code only defines functions (its own helpers go under CRBK.<host>): a same-build reload keeps
//   this object and runs the host part again.
// - State that must outlive a call lives in CRBK.state.<host>, never reset at load: a same-build reload keeps it,
//   any other build starts again from CRBK.state = {}.
// - No other globals. AE 26.5 objects inherit '*', '+', '-' and '/' members: look arbitrary keys up with
//   Object.prototype.hasOwnProperty.
// Helpers: CRBK.ok(data) (null data when none), CRBK.fail(code, message), CRBK.error(code, message) (prints as
// 'CODE: message'), CRBK.isList(v) (Array.isArray), CRBK.round(n, digits) (half away from zero), and
// CRBK._wrap(name, args), the reply object of one function before JSON.
(function (g) {
  var CRBK = { host: null, fns: {}, state: {} };
  CRBK.build = '__CRBK_BUILD__';
  // The same build loaded again (a retried load, a second panel load) keeps the object, its state and these
  // functions; the host part that follows only assigns the same functions again.
  if (g.CRBK && g.CRBK.build === CRBK.build) {
    return;
  }
  // Any other build starts from a fresh object, so nothing of an older adapter survives an update.

  var REPLY_FAILED = '{"ok":false,"error":{"code":"HOST_EXCEPTION","message":"reply is not serializable"}}';
  // JSON as loaded (native or the prelude's polyfill), down to its functions: another extension replacing the
  // shared global or a method of it later must not change how the panel's calls are parsed and answered. They are
  // called on the object they came from, as JSON.parse(t) would be.
  var codec = typeof JSON !== 'undefined' && JSON ? JSON : null;
  var codecParse = codec ? codec.parse : null;
  var codecStringify = codec ? codec.stringify : null;

  // What CRBK.error makes: a refusal thrown from any depth below a CRBK.fns function.
  function HostError(code, message) {
    this.code = String(code);
    if (message !== undefined && message !== null) {
      this.message = String(message);
    }
  }

  // 'CODE: message', so a CRBK.error that is logged, kept as a warning or wrapped into another error keeps its code.
  HostError.prototype.toString = function () {
    return this.message !== undefined ? this.code + ': ' + this.message : this.code;
  };

  function has(o, k) {
    return Object.prototype.hasOwnProperty.call(o, k);
  }

  // Own functions only: 'toString', 'constructor' or AE's '+' must not reach Object.prototype.
  function fnOf(name) {
    return has(CRBK.fns, name) && typeof CRBK.fns[name] === 'function' ? CRBK.fns[name] : null;
  }

  function text(v) {
    try {
      return String(v);
    } catch (e) {
      return 'unprintable value';
    }
  }

  // ExtendScript errors carry the line of the script they come from, here the adapter assembly.
  function lineOf(e) {
    try {
      return e && typeof e.line === 'number' && e.line > 0 ? e.line : 0;
    } catch (x) {
      return 0;
    }
  }

  // A CRBK.ok or CRBK.fail reply, or a hand-made one of the same shape. A success needs data that JSON keeps: an
  // undefined or function data would reach the panel as {"ok":true}. A failure needs a string code. Never throws,
  // whatever a function returned or threw.
  function isReply(r) {
    try {
      if (!r || typeof r !== 'object') {
        return false;
      }
      if (r.ok === true) {
        return r.data !== undefined && typeof r.data !== 'function';
      }
      return r.ok === false && !!r.error && typeof r.error.code === 'string';
    } catch (e) {
      return false;
    }
  }

  function thrown(e) {
    var error;
    if (e instanceof HostError) {
      return CRBK.fail(e.code, e.message);
    }
    // throw CRBK.fail(code) ends the call as return CRBK.fail(code) does.
    if (isReply(e) && e.ok === false) {
      return e;
    }
    error = { code: 'HOST_EXCEPTION', message: text(e) };
    if (lineOf(e)) {
      error.line = lineOf(e);
    }
    return { ok: false, error: error };
  }

  // Absent or null arguments mean none; anything else must be the JSON of an object or an array.
  function parseArgs(json) {
    var args;
    if (json === undefined || json === null) {
      return {};
    }
    if (typeof json !== 'string') {
      throw new HostError('BAD_ARGS', 'arguments must be a JSON string, not ' + typeof json);
    }
    try {
      args = codecParse.call(codec, json);
    } catch (e) {
      throw new HostError('BAD_ARGS', text(e));
    }
    if (args === null) {
      return {};
    }
    if (typeof args !== 'object') {
      throw new HostError('BAD_ARGS', 'arguments must be an object or an array');
    }
    return args;
  }

  // evalScript on Windows mangles non-ASCII text, so the reply travels as ASCII JSON like the arguments. A plain
  // loop, like the prelude's quote(): no regex or replace callback to depend on in ExtendScript.
  function ascii(s) {
    var out = [], from = 0, i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c > 126) {
        out.push(s.substring(from, i), '\\u' + ('000' + c.toString(16)).slice(-4));
        from = i + 1;
      }
    }
    if (!out.length) {
      return s;
    }
    out.push(s.substring(from));
    return out.join('');
  }

  // Every reply is an object, so its JSON starts with '{'; any other string comes from a JSON broken on objects.
  function isObjectJson(s) {
    return typeof s === 'string' && s.charAt(0) === '{';
  }

  // Never throws: host objects or cycles in the data, or such a broken JSON, give a HOST_EXCEPTION reply.
  function toJson(name, reply) {
    var s, why = '';
    try {
      s = codecStringify.call(codec, reply);
    } catch (e) {
      why = ': ' + text(e);
    }
    if (!isObjectJson(s)) {
      try {
        s = codecStringify.call(codec, CRBK.fail('HOST_EXCEPTION', 'reply of ' + name + ' is not serializable' + why));
      } catch (x) {
        s = null;
      }
    }
    return isObjectJson(s) ? ascii(s) : REPLY_FAILED;
  }

  function jsonKind() {
    if (!codecStringify) {
      return 'none';
    }
    return /\[native code\]/.test(text(codecStringify)) ? 'native' : 'polyfill';
  }

  CRBK.ok = function (data) {
    return { ok: true, data: data === undefined ? null : data };
  };

  CRBK.fail = function (code, message) {
    var error = { code: String(code) };
    if (message !== undefined && message !== null) {
      error.message = String(message);
    }
    return { ok: false, error: error };
  };

  // throw CRBK.error('TARGET_CHANGED', id) ends the call with {ok:false,error:{code,message}}.
  CRBK.error = function (code, message) {
    return new HostError(code, message);
  };

  // Array.isArray, which ES3 lacks; also true for an array made in another realm (the vm tests' host mocks). Not
  // named isArray: the ES3 linter warns on every .isArray( call, and a host part would trip it.
  CRBK.isList = function (v) {
    return Object.prototype.toString.call(v) === '[object Array]';
  };

  // Half away from zero to `digits` decimals (default 0).
  CRBK.round = function (n, digits) {
    var k = Math.pow(10, digits || 0), r = Math.round(Math.abs(n) * k) / k;
    if (n < 0 && r !== 0) {
      r = -r;
    }
    return r;
  };

  // Runs one adapter function: a CRBK.ok or CRBK.fail reply as is, a thrown CRBK.error as its code, any other
  // exception as HOST_EXCEPTION with the message and the line.
  CRBK._wrap = function (name, args) {
    var f = fnOf(name), r;
    if (!f) {
      return CRBK.fail('UNKNOWN_FN', name);
    }
    try {
      r = f(args);
    } catch (e) {
      return thrown(e);
    }
    return isReply(r) ? r : CRBK.fail('HOST_EXCEPTION', name + ' returned no CRBK.ok or CRBK.fail reply');
  };

  // The one entry point of the panel; never throws.
  CRBK.call = function (fn, json) {
    var name = text(fn), reply;
    try {
      reply = fnOf(name) ? CRBK._wrap(name, parseArgs(json)) : CRBK.fail('UNKNOWN_FN', name);
    } catch (e) {
      reply = thrown(e);
    }
    return toJson(name, reply);
  };

  CRBK.fns.ping = function () {
    return CRBK.ok({
      build: CRBK.build,
      app: typeof app !== 'undefined' && app ? String(app.version) : null,
      host: CRBK.host || null,
      json: jsonKind()
    });
  };

  g.CRBK = CRBK;
})($.global);
