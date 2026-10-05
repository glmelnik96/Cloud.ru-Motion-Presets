// ASCII-only scripts for evalScript. CEP on Windows mangles every character from U+0080 up on its way into
// ExtendScript, so arguments travel as JSON with \uXXXX escapes, which an ES3 string literal and the adapter's
// JSON.parse (tools/jsx/prelude-json.jsx, eval-based) turn back into the same characters. U+007F is escaped too, and
// so are U+2028/U+2029, which JSON.stringify leaves raw although they end an ES3 string literal.

// Per UTF-16 code unit, so a surrogate pair becomes two escapes.
const ESCAPED = /[\u007f-\uffff]/g;
const NON_ASCII = /[^\x00-\x7f]/;
const FN_NAME = /^[A-Za-z_$][\w$]*$/;

export function isAscii(s: string): boolean {
  return !NON_ASCII.test(s);
}

export function asciiJson(value: unknown): string {
  const json: string | undefined = JSON.stringify(value);
  if (typeof json !== 'string') throw new TypeError('asciiJson: the value has no JSON form');
  return json.replace(ESCAPED, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

// CRBK.call("fn", "<ascii json>"): the JSON travels as a JS string literal, so the adapter gets it as one string
// and parses it itself (panel/host/common.jsx). Printable ASCII only.
export function jsxCall(fn: string, args: unknown = {}): string {
  if (!FN_NAME.test(fn)) throw new TypeError('jsxCall: not a function name: ' + asciiJson(fn));
  return 'CRBK.call(' + JSON.stringify(fn) + ', ' + JSON.stringify(asciiJson(args)) + ')';
}
