// CDP expression that runs JSX in the host through the panel's CSInterface.evalScript.
// Non-ASCII characters are escaped to \uXXXX: evalScript on Windows mangles Cyrillic, and inside
// JSX string literals the escape yields the same string. Outside strings the lint forbids non-ASCII.

export function asciiEscape(src) {
  return String(src).replace(/[\u0080-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

export function buildPayload(jsx, prelude = '') {
  const literal = JSON.stringify(asciiEscape(prelude + '\n' + jsx));
  return '(function(){var __jsx=' + literal + ';' +
    'return new Promise(function(res){try{var cs=new CSInterface();' +
    'cs.evalScript(__jsx,function(r){res(r);});}' +
    'catch(e){res("HOST_BRIDGE_ERROR: "+String(e));}});})()';
}

export function parseResponse(str) {
  if (typeof str !== 'string' || str === '' || str === 'undefined' || str === 'null') {
    throw new Error('HOST_EMPTY: the host returned nothing (does the JSX end with JSON.stringify(...) or finish(...)?)');
  }
  if (str.indexOf('HOST_BRIDGE_ERROR') === 0) throw new Error(str);
  if (str.indexOf('EvalScript error') === 0) throw new Error('HOST_EVAL_ERROR: ' + str);
  try {
    return JSON.parse(str);
  } catch {
    return { raw: str };
  }
}

export function hostPort(host, env = process.env) {
  if (host === 'ae') return Number(env.BRANDKIT_AE_PORT || 8094);
  if (host === 'pr') return Number(env.BRANDKIT_PR_PORT || 8096);
  throw new Error('unknown host: ' + host + ' (expected ae or pr)');
}

// Ports to try for a host: the one set in the environment, else the background BrandKit Dev panel and then
// its visible panel (dev/harness/.debug: 8094/8095 for AE, 8096/8097 for Premiere).
export function hostPorts(host, env = process.env) {
  if (host === 'ae') return env.BRANDKIT_AE_PORT ? [Number(env.BRANDKIT_AE_PORT)] : [8094, 8095];
  if (host === 'pr') return env.BRANDKIT_PR_PORT ? [Number(env.BRANDKIT_PR_PORT)] : [8096, 8097];
  throw new Error('unknown host: ' + host + ' (expected ae or pr)');
}
