// Paths the panel works with (spec 4.4, 6.1, 8.1, 8.2). Everything is kept with forward slashes; the adapters
// turn a path into a native one with File(p).fsName.
import { error, messages, type Problem } from './problems';

export type Platform = 'win' | 'mac';

export function slash(p: string): string {
  return String(p).replace(/\\/g, '/');
}

export function joinPath(...parts: string[]): string {
  const joined = parts.filter((p) => p !== '').map(slash).join('/');
  return joined.replace(/(?<!^)\/{2,}/g, '/');
}

export function dirname(p: string): string {
  const s = slash(p).replace(/\/+$/, '');
  const i = s.lastIndexOf('/');
  return i <= 0 ? (i === 0 ? '/' : '') : s.slice(0, i);
}

export function basename(p: string): string {
  const s = slash(p).replace(/\/+$/, '');
  return s.slice(s.lastIndexOf('/') + 1);
}

export function libraryRoot(platform: Platform): string {
  return platform === 'win' ? 'C:/ProgramData/CloudRuBrandKit/library' : '/Users/Shared/CloudRuBrandKit/library';
}

export function logDir(platform: Platform, env: Record<string, string | undefined>): string {
  if (platform === 'win') return joinPath(env.LOCALAPPDATA || 'C:/Users/Default/AppData/Local', 'CloudRuBrandKit/logs');
  return joinPath(env.HOME || '/Users/Shared', 'Library/Logs/CloudRuBrandKit');
}

// A library file (relative path from library.json) as an absolute path.
export function libraryFile(root: string, file: string): string {
  return joinPath(root, file);
}

export const BIN_NAME = 'Cloud.ru BrandKit';

export function libraryKey(id: string, version: number): string {
  return `${id}@${version}`;
}

// Media of an item copied next to the project, so the project opens on another machine and OS (spec 6.1).
export function projectAssetDir(projectPath: string, id: string, version: number): string {
  return joinPath(dirname(projectPath), BIN_NAME, libraryKey(id, version));
}

// Premiere unpacks a MOGRT under the project folder («Motion Graphics Template Media» and a long capsule
// path); past 260 characters it reports «Motion Graphics Template is corrupt» (spec 6.1). 120 characters
// are left for that tail, the AE asset folder fits in it as well.
export const WIN_PATH_LIMIT = 260;
export const WIN_PROJECT_DIR_LIMIT = WIN_PATH_LIMIT - 120;

export function projectPathProblem(platform: Platform, projectPath: string | null): Problem | null {
  if (platform !== 'win' || !projectPath) return null;
  const dir = dirname(projectPath);
  if (dir.length > WIN_PROJECT_DIR_LIMIT) return error('PATH_TOO_LONG', messages.pathTooLong(WIN_PROJECT_DIR_LIMIT), { dir, length: dir.length });
  return null;
}

export function isAscii(s: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /^[\x00-\x7f]*$/.test(s);
}
