// BrandKit host bundle, common part (ExtendScript, ES3). panel/host/compose.mjs joins it after the JSON
// polyfill (tools/jsx/prelude-json.jsx) and before ae.jsx and pr.jsx into dist/host/brandkit.jsx.
// Everything lives under BK: CEP panels share the ExtendScript engine of the host, so no other globals.
//
// Contract (spec 6 «Адаптеры»): the panel evaluates BK.call("<fn>", "<arguments as JSON>") and gets back
// a JSON string {ok, data, error{code, message, detail}}, with non-ASCII characters as \uXXXX so the reply
// survives evalScript on any Windows code page. Adapters raise refusals with BK.fail(code, message).
var BK = (typeof BK !== 'undefined' && BK) ? BK : {};
BK.version = '0.1.0';
BK.adapters = BK.adapters || {};

BK.fail = function (code, message, detail) {
  var e = new Error(String(message));
  e.bkCode = code;
  e.bkDetail = detail;
  return e;
};

// BridgeTalk.appName names the host the script runs in: "aftereffects" or "premierepro".
BK.appKey = function () {
  var n = '';
  try {
    n = String(BridgeTalk.appName);
  } catch (e) {
    n = '';
  }
  if (n === 'aftereffects') {
    return 'ae';
  }
  if (n === 'premierepro') {
    return 'pr';
  }
  return n;
};

BK.ascii = function (s) {
  return String(s).replace(/[^\x00-\x7e]/g, function (ch) {
    var h = ch.charCodeAt(0).toString(16);
    while (h.length < 4) {
      h = '0' + h;
    }
    return '\\u' + h;
  });
};

BK.reply = function (obj) {
  return BK.ascii(JSON.stringify(obj));
};

BK.errorReply = function (e) {
  var code = (e && e.bkCode) ? e.bkCode : 'HOST_EXCEPTION';
  var msg = (e && e.message !== undefined) ? String(e.message) : String(e);
  if (code === 'HOST_EXCEPTION' && e && e.line) {
    msg += ' (line ' + e.line + ')';
  }
  return { ok: false, error: { code: code, message: msg, detail: (e && e.bkDetail !== undefined) ? e.bkDetail : null } };
};

BK.call = function (fn, argJson) {
  var adapter, args, data;
  try {
    adapter = BK.adapters[BK.appKey()];
    if (!adapter) {
      throw BK.fail('NO_FUNCTION', 'no BrandKit adapter for ' + BK.appKey());
    }
    if (typeof fn !== 'string' || fn.charAt(0) === '_' || typeof adapter[fn] !== 'function') {
      throw BK.fail('NO_FUNCTION', 'no host function ' + fn);
    }
    try {
      args = (argJson === undefined || argJson === null || argJson === '') ? null : JSON.parse(argJson);
    } catch (pe) {
      throw BK.fail('BAD_ARGS', 'arguments are not JSON');
    }
    data = adapter[fn](args);
    return BK.reply({ ok: true, data: data === undefined ? null : data });
  } catch (e) {
    return BK.reply(BK.errorReply(e));
  }
};

// ---- Helpers shared by both adapters ----

BK.round = function (v) {
  return Math.round(Number(v) * 1000000) / 1000000;
};

BK.slash = function (p) {
  return p === null || p === undefined ? null : String(p).split('\\').join('/');
};

BK.samePath = function (a, b) {
  return String(BK.slash(a)).toLowerCase() === String(BK.slash(b)).toLowerCase();
};

// File name without folder and extension: "C:/lib/TTL_LowerThird_16x9_v1.mogrt" -> "TTL_LowerThird_16x9_v1".
BK.baseName = function (p) {
  var parts = String(BK.slash(p)).split('/');
  var leaf = parts[parts.length - 1].split('.');
  if (leaf.length > 1) {
    leaf.pop();
  }
  return leaf.join('.');
};

// Creates a folder with its missing parents; Folder.create alone needs the parent to exist.
BK.mkdirs = function (path) {
  var f = new Folder(path);
  if (f.exists) {
    return true;
  }
  if (f.parent && !f.parent.exists) {
    BK.mkdirs(f.parent.fsName);
  }
  return f.create();
};
