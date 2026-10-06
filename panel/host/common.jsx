// BrandKit host bundle, common part (ExtendScript, ES3). panel/host/compose.mjs joins it before ae.jsx and
// pr.jsx into dist/host/brandkit.jsx. It brings its own JSON (BK.json) and does not touch the global one.
// Everything lives under BK: CEP panels share the ExtendScript engine of the host, so no other globals.
//
// Contract (spec 6 «Адаптеры»): the panel evaluates BK.call("<fn>", "<arguments as JSON>") and gets back
// a JSON string {ok, data, error{code, message, detail}}, with non-ASCII characters as \uXXXX so the reply
// survives evalScript on any Windows code page. Adapters raise refusals with BK.fail(code, message).
var BK = (typeof BK !== 'undefined' && BK) ? BK : {};
BK.version = '0.1.16';
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

// JSON of our own, never the engine's, and with no lookups of characters in an object. ExtendScript
// overloads operators through members named after them ('+', '-', '<' ...): on After Effects 26.5 a plain
// object answered esc['-'] with a function, so a hyphen in a string broke stringify, and a project path such
// as C:/work/panel-live/x.aep left the panel with «Нет композиции» (installer checks 2026-10-05; the engine's
// own JSON failed the same way). Characters are escaped by their codes instead. The global JSON is left alone.
// parse uses eval: the input is JSON our panel wrote.
BK.json = (function () {
  function quote(s) {
    var out = '';
    var i, code, h;
    for (i = 0; i < s.length; i++) {
      code = s.charCodeAt(i);
      if (code === 34) {
        out += '\\"';
      } else if (code === 92) {
        out += '\\\\';
      } else if (code === 10) {
        out += '\\n';
      } else if (code === 13) {
        out += '\\r';
      } else if (code === 9) {
        out += '\\t';
      } else if (code < 32) {
        h = code.toString(16);
        while (h.length < 4) {
          h = '0' + h;
        }
        out += '\\u' + h;
      } else {
        out += s.charAt(i);
      }
    }
    return '"' + out + '"';
  }
  function str(v) {
    var i, k, part, parts;
    if (v === null || v === undefined) {
      return v === null ? 'null' : undefined;
    }
    if (typeof v === 'string') {
      return quote(v);
    }
    if (typeof v === 'number') {
      return isFinite(v) ? String(v) : 'null';
    }
    if (typeof v === 'boolean') {
      return String(v);
    }
    if (typeof v === 'object') {
      parts = [];
      if (v instanceof Array) {
        for (i = 0; i < v.length; i++) {
          part = str(v[i]);
          parts.push(part === undefined ? 'null' : part);
        }
        return '[' + parts.join(',') + ']';
      }
      for (k in v) {
        if (v.hasOwnProperty(k)) {
          part = str(v[k]);
          if (part !== undefined) {
            parts.push(quote(k) + ':' + part);
          }
        }
      }
      return '{' + parts.join(',') + '}';
    }
    return undefined;
  }
  function parse(t) {
    var s = String(t).replace(/^\s+|\s+$/g, '');
    var first = s.charAt(0);
    if (first !== '{' && first !== '[' && first !== '"' && first !== '-' && (first < '0' || first > '9') &&
        s !== 'true' && s !== 'false' && s !== 'null') {
      throw new Error('not JSON');
    }
    return eval('(' + s + ')');
  }
  return { stringify: str, parse: parse };
}());

BK.reply = function (obj) {
  return BK.ascii(BK.json.stringify(obj));
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
    adapter = BK.adapters.hasOwnProperty(BK.appKey()) ? BK.adapters[BK.appKey()] : null;
    if (!adapter) {
      throw BK.fail('NO_FUNCTION', 'no BrandKit adapter for ' + BK.appKey());
    }
    // Own members with plain names only: inherited members include ExtendScript operators such as '-'.
    if (typeof fn !== 'string' || !/^[A-Za-z][A-Za-z0-9]*$/.test(fn) || !adapter.hasOwnProperty(fn) || typeof adapter[fn] !== 'function') {
      throw BK.fail('NO_FUNCTION', 'no host function ' + fn);
    }
    try {
      args = (argJson === undefined || argJson === null || argJson === '') ? null : BK.json.parse(argJson);
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

// Where and how long a media piece goes (panel/src/core/media.ts MediaPiece), once the adapter knows the
// natural length of its file (null for a still, which lasts as long as it is told). Seconds.
BK.resolvePiece = function (p, natural) {
  var len, start;
  if (typeof p.lengthSec === 'number') {
    len = p.lengthSec;
  } else if (natural === null || natural === undefined) {
    len = typeof p.maxSec === 'number' ? p.maxSec : 5;
  } else {
    len = natural;
  }
  if (typeof p.maxSec === 'number' && len > p.maxSec) {
    len = p.maxSec;
  }
  if (typeof p.startSec === 'number') {
    start = p.startSec;
  } else {
    start = p.endSec - len;
    if (typeof p.floorSec === 'number' && start < p.floorSec) {
      start = p.floorSec;
      len = p.endSec - start;
    }
  }
  return { start: BK.round(start), len: BK.round(len) };
};

// File name with its extension: "C:/x/BG_Arrows_16x9_loop_v1.mov" -> "BG_Arrows_16x9_loop_v1.mov".
BK.leafName = function (p) {
  var parts = String(BK.slash(p)).split('/');
  return parts[parts.length - 1];
};
