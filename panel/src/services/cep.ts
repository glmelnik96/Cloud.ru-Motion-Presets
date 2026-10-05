// The CEP side of the panel: the host's ExtendScript engine, the host environment, the extension folder and Node.
// main.tsx hands window in once; nothing else in the panel touches __adobe_cep__, cep_node or require.
import type { HostKey } from '../core/types';
import { posixPath, trimSlash } from './files';
import type { NodeRequire } from './files';

export type Env = Record<string, string | undefined>;

export interface HostEnv {
  appName: 'AEFT' | 'PPRO';
  appVersion: string;
}

export type CepWindow = Pick<Window, '__adobe_cep__' | 'cep_node' | 'require'>;

export interface Cep {
  // Answers at most once. A throw of the runtime goes to the caller as it is: the bridge turns it into
  // HOST_BRIDGE_ERROR with the runtime's reason, which a stand-in 'EvalScript error.' reply would lose.
  evalScript(script: string, callback: (result: string) => void): void;
  hostEnv(): HostEnv;
  host(): HostKey;
  extensionPath(): string; // forward slashes, no trailing slash
  nodeRequire(): NodeRequire;
}

export interface SystemInfo {
  env: Env;
  platform: string;
  home: string;
}

const HOSTS: Record<HostEnv['appName'], HostKey> = { AEFT: 'ae', PPRO: 'pr' };

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

// Windows variable names ignore case (windir, ProgramData), but a copy of process.env does not. Empty is unset.
export function envVar(env: Env, name: string): string | undefined {
  let value = env[name];
  if (value === undefined) {
    const want = name.toLowerCase();
    const key = Object.keys(env).find((k) => k.toLowerCase() === want);
    if (key !== undefined) value = env[key];
  }
  return value ? value : undefined;
}

// getSystemPath answers with a URL: file:///C:/Users/%D0%93... on Windows, file:///Users/... on a Mac. Each run of
// escapes is decoded on its own, so a '%' that is part of a folder name stays as it is.
export function fileUrlToPath(url: string): string {
  let s = String(url).replace(/(?:%[0-9A-Fa-f]{2})+/g, (run) => {
    try {
      return decodeURIComponent(run);
    } catch {
      return run;
    }
  });
  s = posixPath(s);
  if (/^file:\/\/\/[A-Za-z]:/i.test(s)) s = s.slice(8);
  else if (/^file:\/\/\//i.test(s)) s = s.slice(7);
  else if (/^file:\/\//i.test(s)) s = '//' + s.slice(7); // file://server/share: a UNC path
  return trimSlash(s);
}

export function systemInfo(nodeRequire: NodeRequire): SystemInfo {
  const proc = nodeRequire('process') as { env: Env; platform: string };
  const os = nodeRequire('os') as { homedir(): string };
  return { env: proc.env, platform: proc.platform, home: posixPath(os.homedir()) };
}

export function createCep(win: CepWindow): Cep {
  const found = win.__adobe_cep__;
  if (!found) throw new Error('window.__adobe_cep__ is missing: the panel runs outside After Effects or Premiere Pro');
  const runtime: CepRuntime = found;
  let env: HostEnv | null = null;
  let extension: string | null = null;

  function hostEnv(): HostEnv {
    if (env) return env;
    let raw: unknown;
    try {
      raw = JSON.parse(runtime.getHostEnvironment());
    } catch (e) {
      throw new Error('cannot read the host environment: ' + messageOf(e));
    }
    const { appName, appVersion } = (raw && typeof raw === 'object' ? raw : {}) as { appName?: unknown; appVersion?: unknown };
    if (appName !== 'AEFT' && appName !== 'PPRO') throw new Error('unsupported host application: ' + String(appName));
    env = { appName, appVersion: String(appVersion ?? '') };
    return env;
  }

  return {
    evalScript(script, callback) {
      let answered = false;
      runtime.evalScript(script, (result) => {
        if (answered) return;
        answered = true;
        callback(result);
      });
    },
    hostEnv,
    host: () => HOSTS[hostEnv().appName],
    extensionPath: () => (extension ??= fileUrlToPath(runtime.getSystemPath('extension'))),
    nodeRequire() {
      const node = win.cep_node;
      if (node && typeof node.require === 'function') return (id) => node.require(id);
      const req = win.require;
      if (typeof req === 'function') return (id) => req(id);
      throw new Error('Node.js is off in this panel: the manifest needs --enable-nodejs and --mixed-context');
    },
  };
}
