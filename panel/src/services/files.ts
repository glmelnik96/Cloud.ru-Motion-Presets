// The file service of the panel: Node's fs, path and crypto (CEP 12 runs Node 17) reached through the injected
// require, so the tests run it in plain Node. Every call returns a Promise. Paths go in with either slash and
// come out with forward slashes (C:/Users/...), which fs accepts on Windows too; native() turns one back for a
// person or a host. The panel has no Node types, so the slice of Node used here is typed by hand.

export type NodeRequire = (id: string) => unknown;

export interface DirEntry {
  name: string;
  dir: boolean;
}

export interface FileStat {
  size: number;
  mtimeMs: number;
  isFile: boolean;
  isDir: boolean;
}

export interface Files {
  readText(file: string): Promise<string>; // UTF-8 without a byte order mark
  readBytes(file: string, start?: number, length?: number): Promise<Uint8Array>; // short at the end of the file
  writeText(file: string, text: string): Promise<void>; // atomic: a temp file in the same folder, then a rename
  append(file: string, text: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<FileStat | null>; // null when the path does not exist
  readDir(dir: string): Promise<DirEntry[]>; // sorted by name
  mkdirp(dir: string): Promise<void>;
  remove(file: string): Promise<void>; // one file; a missing file is fine
  sha256(file: string): Promise<string>; // lowercase hex, read as a stream
  join(...parts: string[]): string;
  dirname(path: string): string;
  basename(path: string): string;
  native(path: string): string;
}

interface NodeStats {
  size: number;
  mtimeMs: number;
  isFile(): boolean;
  isDirectory(): boolean;
}

interface NodeFileHandle {
  read(buffer: Uint8Array, offset: number, length: number, position: number): Promise<{ bytesRead: number }>;
  stat(): Promise<NodeStats>;
  close(): Promise<void>;
}

interface NodeReadStream {
  on(event: 'data', listener: (chunk: Uint8Array) => void): NodeReadStream;
  on(event: 'end', listener: () => void): NodeReadStream;
  on(event: 'error', listener: (error: unknown) => void): NodeReadStream;
}

interface NodeFs {
  promises: {
    readFile(path: string, encoding: 'utf8'): Promise<string>;
    readFile(path: string): Promise<Uint8Array>;
    writeFile(path: string, data: string, encoding: 'utf8'): Promise<void>;
    appendFile(path: string, data: string, encoding: 'utf8'): Promise<void>;
    rename(from: string, to: string): Promise<void>;
    unlink(path: string): Promise<void>;
    stat(path: string): Promise<NodeStats>;
    readdir(path: string, options: { withFileTypes: true }): Promise<{ name: string; isDirectory(): boolean }[]>;
    mkdir(path: string, options: { recursive: true }): Promise<unknown>;
    access(path: string): Promise<void>;
    open(path: string, flags: 'r'): Promise<NodeFileHandle>;
  };
  createReadStream(path: string): NodeReadStream;
}

interface NodePath {
  sep: string;
  join(...parts: string[]): string;
  dirname(path: string): string;
  basename(path: string): string;
}

interface NodeHash {
  update(chunk: Uint8Array): NodeHash;
  digest(encoding: 'hex'): string;
}

interface NodeCrypto {
  createHash(algorithm: 'sha256'): NodeHash;
}

// Windows refuses a rename for a moment while an antivirus or the indexer holds the target open.
const RENAME_RETRY_MS = [20, 60, 180];

const codeOf = (e: unknown): unknown => (e && typeof e === 'object' ? (e as { code?: unknown }).code : undefined);
const isMissing = (e: unknown): boolean => codeOf(e) === 'ENOENT' || codeOf(e) === 'ENOTDIR';
const isBusy = (e: unknown): boolean => codeOf(e) === 'EPERM' || codeOf(e) === 'EACCES' || codeOf(e) === 'EBUSY';
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function posixPath(p: string): string {
  return String(p).replace(/\\/g, '/');
}

// Drops trailing slashes but keeps a root ('/', 'C:/').
export function trimSlash(p: string): string {
  let s = p;
  while (s.length > 1 && s.endsWith('/') && !/^[A-Za-z]:\/$/.test(s)) s = s.slice(0, -1);
  return s;
}

// Joins a folder from the environment (either slash) with a POSIX tail: default locations need no Node.
export function joinPosix(base: string, tail: string): string {
  const b = trimSlash(posixPath(base));
  return (b.endsWith('/') ? b : b + '/') + tail;
}

export function createFiles(nodeRequire: NodeRequire): Files {
  const fs = nodeRequire('fs') as NodeFs;
  const path = nodeRequire('path') as NodePath;
  const crypto = nodeRequire('crypto') as NodeCrypto;
  const fsp = fs.promises;

  async function readRange(file: string, start: number, length: number): Promise<Uint8Array> {
    const handle = await fsp.open(file, 'r');
    try {
      // Sized by the file, so a bogus length from a broken font cannot allocate gigabytes.
      const { size } = await handle.stat();
      const want = Math.max(0, Math.min(length, size - start));
      const buf = new Uint8Array(want);
      let got = 0;
      while (got < want) {
        const { bytesRead } = await handle.read(buf, got, want - got, start + got);
        if (bytesRead === 0) break;
        got += bytesRead;
      }
      return buf.subarray(0, got);
    } finally {
      await handle.close();
    }
  }

  return {
    async readText(file) {
      const text = await fsp.readFile(file, 'utf8');
      return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    },

    async readBytes(file, start = 0, length) {
      if (length !== undefined) return readRange(file, start, length);
      const all = await fsp.readFile(file);
      return start > 0 ? all.subarray(start) : all;
    },

    async writeText(file, text) {
      const temp = file + '.' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + '.tmp';
      try {
        await fsp.writeFile(temp, text, 'utf8');
        for (let attempt = 0; ; attempt += 1) {
          try {
            await fsp.rename(temp, file);
            return;
          } catch (e) {
            if (attempt >= RENAME_RETRY_MS.length || !isBusy(e)) throw e;
            await sleep(RENAME_RETRY_MS[attempt] ?? 0);
          }
        }
      } catch (e) {
        await fsp.unlink(temp).catch(() => undefined);
        throw e;
      }
    },

    async append(file, text) {
      await fsp.appendFile(file, text, 'utf8');
    },

    async exists(p) {
      return fsp.access(p).then(
        () => true,
        () => false,
      );
    },

    async stat(p) {
      try {
        const s = await fsp.stat(p);
        return { size: s.size, mtimeMs: s.mtimeMs, isFile: s.isFile(), isDir: s.isDirectory() };
      } catch (e) {
        if (isMissing(e)) return null;
        throw e;
      }
    },

    async readDir(dir) {
      const list = await fsp.readdir(dir, { withFileTypes: true });
      return list
        .map((d) => ({ name: String(d.name), dir: d.isDirectory() }))
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    },

    async mkdirp(dir) {
      await fsp.mkdir(dir, { recursive: true });
    },

    async remove(file) {
      try {
        await fsp.unlink(file);
      } catch (e) {
        if (!isMissing(e)) throw e;
      }
    },

    sha256(file) {
      return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        fs.createReadStream(file)
          .on('error', reject)
          .on('data', (chunk) => {
            hash.update(chunk);
          })
          .on('end', () => resolve(hash.digest('hex')));
      });
    },

    join: (...parts) => posixPath(path.join(...parts)),
    dirname: (p) => posixPath(path.dirname(p)),
    basename: (p) => path.basename(p),
    native: (p) => (path.sep === '\\' ? posixPath(p).replace(/\//g, '\\') : p),
  };
}
