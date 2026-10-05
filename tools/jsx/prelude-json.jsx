// JSON polyfill for ExtendScript (ES3). Installed only where the engine has no native JSON, or where the JSON in
// place cannot stringify '*', '+', '-' and '/' (an older copy of this polyfill: in AE 26.5 every object inherits
// '*', '+', '-' and '/' members, ExtendScript operator overloading, so an escape table read without
// hasOwnProperty returned a function for them; seen live 2026-10-05, Premiere has no such members).
// Source: Extensions-LLM-Chat_Pr/host/premiere.jsx (checked in ExtendScript; json2.js fails to parse there).
// parse uses eval: input is always JSON produced by our own tools, never untrusted data.
if (typeof JSON === 'undefined' || JSON === undefined || JSON === null) {
  JSON = {};
}
(function () {
  var own = Object.prototype.hasOwnProperty;
  var esc = {};
  esc['\b'] = '\\b';
  esc['\t'] = '\\t';
  esc['\n'] = '\\n';
  esc['\f'] = '\\f';
  esc['\r'] = '\\r';
  esc['"'] = '\\"';
  esc['\\'] = '\\\\';
  function quote(s) {
    var out = '', i, c, e;
    for (i = 0; i < s.length; i++) {
      c = s.charAt(i);
      e = own.call(esc, c) ? esc[c] : undefined;
      if (e) {
        out += e;
      } else if (c.charCodeAt(0) < 32) {
        out += '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
      } else {
        out += c;
      }
    }
    return '"' + out + '"';
  }
  function str(v) {
    var i, k, part, parts;
    if (v === null) { return 'null'; }
    switch (typeof v) {
      case 'string':
        return quote(v);
      case 'number':
        return isFinite(v) ? String(v) : 'null';
      case 'boolean':
        return String(v);
      case 'object':
        parts = [];
        if (v instanceof Array) {
          for (i = 0; i < v.length; i++) { parts[i] = str(v[i]) || 'null'; }
          return '[' + parts.join(',') + ']';
        }
        for (k in v) {
          if (own.call(v, k)) {
            part = str(v[k]);
            if (part !== undefined) { parts.push(quote(k) + ':' + part); }
          }
        }
        return '{' + parts.join(',') + '}';
      default:
        return undefined;
    }
  }
  var healthy = false;
  try {
    healthy = typeof JSON.stringify === 'function' && JSON.stringify('-+*/') === '"-+*/"';
  } catch (e) {
    healthy = false;
  }
  if (!healthy) {
    JSON.stringify = function (v) { return str(v); };
  }
  if (typeof JSON.parse !== 'function') {
    JSON.parse = function (t) {
      t = String(t);
      var trimmed = t.replace(/^\s+|\s+$/g, '');
      var first = trimmed.charAt(0);
      if (first !== '{' && first !== '[' && first !== '"' &&
          first !== '-' && (first < '0' || first > '9') &&
          trimmed !== 'true' && trimmed !== 'false' && trimmed !== 'null') {
        throw new SyntaxError('JSON.parse: unexpected input');
      }
      return eval('(' + t + ')');
    };
  }
})();
