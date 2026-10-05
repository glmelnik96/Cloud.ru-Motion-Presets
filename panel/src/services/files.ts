// Files a T2/T3 insert needs next to the project (spec 6.1 «Переносимость», decision P11): copies of the
// library files in «Cloud.ru BrandKit/<id>@<version>/» and the backdrop still. The panel does it with Node
// before the host call, so a 4K loop copies without freezing the host. A file already there with the same
// size is reused; a copy goes to «.part» first and is renamed, so a broken copy never looks finished.
import { dirname } from '../core/paths';
import type { Prepare } from '../core/media';
import { solidPng, type Deflate } from './png';

export interface PrepFs {
  // Size in bytes, or null when there is no such file.
  size(path: string): number | null;
  mkdirp(dir: string): void;
  copy(from: string, to: string): Promise<void>;
  rename(from: string, to: string): void;
  remove(path: string): void;
  write(path: string, bytes: Uint8Array): void;
}

export interface PrepResult {
  copied: string[];
  reused: string[];
  written: string[];
}

export async function prepareFiles(fs: PrepFs, prepare: Prepare, deflate: Deflate): Promise<PrepResult> {
  const out: PrepResult = { copied: [], reused: [], written: [] };
  for (const c of prepare.copies) {
    const want = fs.size(c.from);
    if (want === null) throw new Error(`нет файла библиотеки ${c.from}`);
    if (fs.size(c.to) === want) {
      out.reused.push(c.to);
      continue;
    }
    fs.mkdirp(dirname(c.to));
    const part = `${c.to}.part`;
    try {
      await fs.copy(c.from, part);
      if (fs.size(c.to) !== null) fs.remove(c.to);
      fs.rename(part, c.to);
    } catch (e) {
      try { fs.remove(part); } catch { /* nothing to clean */ }
      throw new Error(`${c.to}: ${String((e as Error)?.message ?? e)}`);
    }
    out.copied.push(c.to);
  }
  for (const s of prepare.solids) {
    if (fs.size(s.path) !== null) {
      out.reused.push(s.path);
      continue;
    }
    fs.mkdirp(dirname(s.path));
    fs.write(s.path, solidPng(s.w, s.h, s.color, deflate));
    out.written.push(s.path);
  }
  return out;
}
