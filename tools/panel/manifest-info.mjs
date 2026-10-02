// Reads a CEP manifest (CSXS/manifest.xml) without an XML library: bundle id and version, manifest version,
// CSXS runtime, bundle hosts, and every extension with its main path, own HostList and CEF parameters.
// Task 29 checks with it that one manifest runs the panel in AE and Premiere; the release build reuses it.
import { readFileSync } from 'node:fs';

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function attr(tag, name) {
  const m = new RegExp('\\b' + name + '\\s*=\\s*"([^"]*)"').exec(tag);
  return m ? m[1] : null;
}

// Inner XML of the first <tag ...>...</tag>, or '' when there is none.
function block(xml, tag) {
  const m = new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)</' + tag + '>').exec(xml);
  return m ? m[1] : '';
}

function text(xml, tag) {
  const m = new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)</' + tag + '>').exec(xml);
  return m ? m[1].trim() : null;
}

function hostsIn(xml) {
  const out = [];
  const re = /<Host\b[^>]*>/g;
  let m;
  while ((m = re.exec(xml))) out.push({ name: attr(m[0], 'Name'), version: attr(m[0], 'Version') });
  return out;
}

export function manifestInfo(xml) {
  const src = String(xml).replace(/<!--[\s\S]*?-->/g, '');
  const root = /<ExtensionManifest\b[^>]*>/.exec(src);
  if (!root) throw new Error('not a CEP manifest: no <ExtensionManifest>');
  const env = block(src, 'ExecutionEnvironment');
  const runtime = /<RequiredRuntime\b[^>]*\bName\s*=\s*"CSXS"[^>]*>/.exec(env);
  const ids = [];
  const reList = /<Extension\b[^>]*>/g;
  const list = block(src, 'ExtensionList');
  let m;
  while ((m = reList.exec(list))) ids.push(attr(m[0], 'Id'));
  const dispatch = block(src, 'DispatchInfoList');
  const extensions = ids.map((id) => {
    const re = new RegExp('<Extension\\b[^>]*\\bId\\s*=\\s*"' + escapeRe(id) + '"[^>]*>([\\s\\S]*?)</Extension>');
    const body = (re.exec(dispatch) || [])[1] || '';
    const own = block(body, 'HostList');
    return {
      id,
      mainPath: text(body, 'MainPath'),
      scriptPath: text(body, 'ScriptPath'),
      type: text(body, 'Type'),
      hosts: own ? hostsIn(own) : null,
      parameters: (block(body, 'CEFCommandLine').match(/<Parameter>[\s\S]*?<\/Parameter>/g) || [])
        .map((p) => p.replace(/<\/?Parameter>/g, '').trim()),
    };
  });
  return {
    bundleId: attr(root[0], 'ExtensionBundleId'),
    bundleVersion: attr(root[0], 'ExtensionBundleVersion'),
    manifestVersion: attr(root[0], 'Version'),
    csxs: runtime ? attr(runtime[0], 'Version') : null,
    hosts: hostsIn(block(env, 'HostList')),
    extensions,
  };
}

export function readManifest(file) {
  return manifestInfo(readFileSync(file, 'utf8'));
}

// Hosts an extension runs in: its own HostList when it has one, else the bundle HostList.
export function effectiveHosts(info, ext) {
  return (ext.hosts || info.hosts).map((h) => h.name);
}

// Criterion K1 of task 29: every extension of the bundle runs in all the given hosts.
export function coversHosts(info, names) {
  const missing = [];
  for (const ext of info.extensions) {
    const hosts = effectiveHosts(info, ext);
    for (const n of names) if (!hosts.includes(n)) missing.push(ext.id + ': ' + n);
  }
  return { ok: info.extensions.length > 0 && missing.length === 0, missing };
}
