// JSON polyfill for ExtendScript (ES3). Installed only where the engine has no native JSON.
// Source: Extensions-LLM-Chat_Pr/host/premiere.jsx (checked in ExtendScript; json2.js fails to parse there).
// parse uses eval: input is always JSON produced by our own tools, never untrusted data.
if (typeof JSON === 'undefined' || JSON === undefined || JSON === null) {
  JSON = {};
}
(function () {
  // By character code, never esc[c]: ExtendScript objects inherit operator members such as '-' (panel/host/common.jsx).
  function quote(s) {
    var out = '', i, code;
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
        out += '\\u' + ('0000' + code.toString(16)).slice(-4);
      } else {
        out += s.charAt(i);
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
          if (v.hasOwnProperty(k)) {
            part = str(v[k]);
            if (part !== undefined) { parts.push(quote(k) + ':' + part); }
          }
        }
        return '{' + parts.join(',') + '}';
      default:
        return undefined;
    }
  }
  if (typeof JSON.stringify !== 'function') {
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
