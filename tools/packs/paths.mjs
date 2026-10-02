// Fixed places of the phase-1 preparation. Everything ExtendScript sees is ASCII; only the
// source package path has Cyrillic, and only Node reads it.
import path from 'node:path';
import { workDir } from '../lib/work.mjs';

export const SOURCE_ROOT = 'C:/Users/Глеб/Documents/Граф пакет Cloud.ru';
export const ARCHIVE_DATE = '2026-10-02';

export function sourceRoot(env = process.env) {
  return String(env.BRANDKIT_SOURCE || SOURCE_ROOT).replace(/\\/g, '/');
}

// C:/CRBK on Windows: the parent of the work folder, so BRANDKIT_WORK moves all of it together.
export function crbkRoot(env = process.env, platform = process.platform) {
  return path.posix.dirname(workDir(env, platform));
}

export function archiveDir(env = process.env, platform = process.platform) {
  return path.posix.join(crbkRoot(env, platform), 'archive', ARCHIVE_DATE);
}

export function packsDir(env = process.env, platform = process.platform) {
  return path.posix.join(crbkRoot(env, platform), 'packs');
}

export function packDir(slug, env = process.env, platform = process.platform) {
  return path.posix.join(packsDir(env, platform), slug);
}
