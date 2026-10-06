// The only module that touches CEP and Node (spec 6: injected services). CEP 12 runs the panel in
// Chromium 99 with Node enabled (--enable-nodejs, --mixed-context in CSXS/manifest.xml), so `require`
// is on window. Calls go straight to window.__adobe_cep__, the object CSInterface.js wraps.
import { Bridge, evalFileScript, type EvalScript } from '../bridge/bridge';
import type { LogFs } from '../core/log';
import { joinPath, libraryRoot, logDir, type Platform } from '../core/paths';
import type { FontStatus, Host } from '../core/types';
import type { Prepare } from '../core/media';
import { prepareFiles, type PrepFs, type PrepResult } from './files';
import { revealCommand, runAerender, type AerenderJob, type AerenderResult } from './export';
import { fontDirs, scanFontFolders, type FontFs } from './fonts';
import type { Deflate } from './png';

interface AdobeCep {
  evalScript(script: string, callback: (result: string) => void): void;
  getHostEnvironment(): string;
  getSystemPath(pathType: string): string;
}

type NodeRequire = (module: string) => any;

declare global {
  interface Window {
    __adobe_cep__?: AdobeCep;
    cep_node?: { require: NodeRequire; process?: { platform: string; env: Record<string, string | undefined> } };
    require?: NodeRequire;
  }
}

export function cep(): AdobeCep | null {
  return typeof window !== 'undefined' && window.__adobe_cep__ ? window.__adobe_cep__ : null;
}

export function hostKey(): Host | null {
  const c = cep();
  if (!c) return null;
  try {
    const name = JSON.parse(c.getHostEnvironment()).appName;
    return name === 'AEFT' ? 'ae' : name === 'PPRO' ? 'pr' : null;
  } catch {
    return null;
  }
}

export function cepEvalScript(c: AdobeCep): EvalScript {
  return (script) => new Promise((resolve) => c.evalScript(script, (r) => resolve(r)));
}

// SystemPath.EXTENSION as CSInterface.getSystemPath returns it: decoded, without the file:// prefix.
export function extensionPath(c: AdobeCep, platform: Platform): string {
  const raw = decodeURI(c.getSystemPath('extension'));
  return platform === 'win' ? raw.replace('file:///', '') : raw.replace('file://', '');
}

export function nodeRequire(): NodeRequire | null {
  if (typeof window === 'undefined') return null;
  return window.cep_node?.require ?? window.require ?? null;
}

export interface NodeServices {
  platform: Platform;
  env: Record<string, string | undefined>;
  readText(path: string): string | null;
  logFs: LogFs;
  fontFs: FontFs;
  prepFs: PrepFs;
  deflate: Deflate;
}

export function nodeServices(req: NodeRequire): NodeServices {
  const fs = req('fs');
  const zlib = req('zlib');
  const proc = req('process');
  const platform: Platform = proc.platform === 'win32' ? 'win' : 'mac';
  return {
    platform,
    env: proc.env,
    readText: (p) => {
      try {
        return fs.readFileSync(p, 'utf8');
      } catch {
        return null;
      }
    },
    logFs: {
      mkdirp: (dir) => fs.mkdirSync(dir, { recursive: true }),
      append: (file, text) => fs.appendFileSync(file, text, 'utf8'),
      list: (dir) => fs.readdirSync(dir).map((name: string) => ({ name, bytes: fs.statSync(joinPath(dir, name)).size })),
      remove: (file) => fs.unlinkSync(file),
    },
    prepFs: {
      size: (p) => {
        try {
          const st = fs.statSync(p);
          return st.isFile() ? st.size : null;
        } catch {
          return null;
        }
      },
      mkdirp: (dir) => fs.mkdirSync(dir, { recursive: true }),
      copy: (from, to) => fs.promises.copyFile(from, to),
      rename: (from, to) => fs.renameSync(from, to),
      remove: (p) => fs.unlinkSync(p),
      write: (p, bytes) => fs.writeFileSync(p, bytes),
    },
    deflate: (raw) => new Uint8Array(zlib.deflateSync(raw)),
    fontFs: {
      // By hand, two levels deep: the Node of CEP 12 may predate readdirSync({ recursive }); Adobe's font
      // folder keeps faces in subfolders, the system folders are flat.
      list: (dir) => {
        const out: string[] = [];
        const walk = (d: string, depth: number) => {
          for (const name of fs.readdirSync(d) as string[]) {
            const p = joinPath(d, name);
            let isDir = false;
            try {
              isDir = fs.statSync(p).isDirectory();
            } catch {
              continue;
            }
            if (isDir) {
              if (depth < 2) walk(p, depth + 1);
            } else out.push(p);
          }
        };
        walk(dir, 0);
        return out;
      },
      read: (file) => new Uint8Array(fs.readFileSync(file)),
    },
  };
}

export interface CepRuntime {
  host: Host;
  platform: Platform;
  bridge: Bridge;
  node: NodeServices;
  libraryRoot: string;
  logDir: string;
  fonts(names: string[]): Promise<Record<string, FontStatus>>;
  prepareFiles(prepare: Prepare): Promise<PrepResult>;
  exportFs: { size(p: string): number | null; mkdirp(dir: string): void; documents: string };
  aerender(job: AerenderJob): Promise<AerenderResult>;
  reveal(path: string): void;
}

// Everything the panel needs from CEP, or null outside a host (a browser preview of the UI).
export function cepRuntime(bundleVersion?: string): CepRuntime | null {
  const c = cep();
  const host = hostKey();
  const req = nodeRequire();
  if (!c || !host || !req) return null;
  const node = nodeServices(req);
  const bundle = joinPath(extensionPath(c, node.platform), 'host', 'brandkit.jsx');
  const evalScript = cepEvalScript(c);
  const bridge = new Bridge({ evalScript, bundleVersion, loadHost: async () => { await evalScript(evalFileScript(bundle)); } });
  const root = node.env.BRANDKIT_LIBRARY ? node.env.BRANDKIT_LIBRARY.replace(/\\/g, '/') : libraryRoot(node.platform);
  return {
    host,
    platform: node.platform,
    bridge,
    node,
    libraryRoot: root,
    logDir: logDir(node.platform, node.env),
    fonts: async (names) => {
      if (host === 'ae') {
        const r = await bridge.call<Record<string, FontStatus>>('checkFonts', { names });
        return r.ok && r.data ? r.data : {};
      }
      return scanFontFolders(node.fontFs, fontDirs(node.platform, node.env), names);
    },
    prepareFiles: (prepare) => prepareFiles(node.prepFs, prepare, node.deflate),
    exportFs: {
      size: node.prepFs.size,
      mkdirp: node.prepFs.mkdirp,
      // SystemPath.MY_DOCUMENTS follows a Documents folder moved to OneDrive or another disk.
      documents: (() => {
        try {
          return decodeURI(c.getSystemPath('myDocuments')).replace(/^file:\/\/\/?/, node.platform === 'win' ? '' : '/').replace(/\\/g, '/');
        } catch {
          return joinPath(node.env.USERPROFILE || node.env.HOME || '', 'Documents');
        }
      })(),
    },
    aerender: (job) => runAerender(req('child_process').spawn, node.platform, job),
    reveal: (path) => {
      const r = revealCommand(node.platform, path, node.prepFs.size(path) !== null);
      try {
        req('child_process').spawn(r.cmd, r.args, { detached: true, stdio: 'ignore' }).unref();
      } catch {
        // the panel cannot open the folder; the path stays in the result line
      }
    },
  };
}
