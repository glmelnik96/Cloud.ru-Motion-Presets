import { afterAll, describe, it, expect } from 'vitest';
import { createFiles, posixPath } from '../../../panel/src/services/files';

// The panel tsconfig has no Node types (types: []); the tests run in Node, so the built-ins come in untyped.
const nodeModule = 'node:module';
const { createRequire } = (await import(nodeModule)) as { createRequire(url: string): (id: string) => any };
const req = createRequire(import.meta.url);
const fs = req('fs');
const os = req('os');
const nodePath = req('path');
const crypto = req('crypto');

const made: string[] = [];
const tmp = (): string => {
  const dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'crbk-files-'));
  made.push(dir);
  return posixPath(dir);
};
afterAll(() => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
});

const files = createFiles(req);

// A Node require whose fs.promises logs calls and lets a test break single operations.
function spyRequire(over: Record<string, (...args: any[]) => Promise<unknown>>, log: string[]) {
  const real = fs.promises;
  const promises = new Proxy(real, {
    get(target: any, key: string) {
      const fn = over[key] ?? target[key];
      if (typeof fn !== 'function') return fn;
      return (...args: any[]) => {
        const paths = key === 'rename' ? args.slice(0, 2) : args.slice(0, 1);
        log.push([key, ...paths.map((p) => nodePath.basename(String(p)))].join(' '));
        return fn.apply(target, args);
      };
    },
  });
  return (id: string) => (id === 'fs' ? { ...fs, promises } : req(id));
}

describe('files', () => {
  it('writes text through a temp file and a rename, then reads it back', async () => {
    const dir = tmp();
    const file = dir + '/settings.json';
    const log: string[] = [];
    const spied = createFiles(spyRequire({}, log));
    await spied.writeText(file, 'первый');
    await spied.writeText(file, 'второй — ×');
    expect(await files.readText(file)).toBe('второй — ×');
    expect((await files.readDir(dir)).map((e) => e.name)).toEqual(['settings.json']);
    const writes = log.filter((l) => l.startsWith('writeFile') || l.startsWith('rename'));
    expect(writes).toHaveLength(4);
    expect(writes[0]).toMatch(/^writeFile settings\.json\..+\.tmp$/);
    expect(writes[1]).toMatch(/^rename settings\.json\..+\.tmp settings\.json$/);
  });

  it.each(['EPERM', 'EACCES', 'EBUSY'])('retries a rename that Windows refuses for a moment (%s)', async (code) => {
    const dir = tmp();
    const file = dir + '/a.json';
    let fails = 2;
    const busy = async (from: string, to: string) => {
      if (fails-- > 0) throw Object.assign(new Error(code + ': refused for a moment'), { code });
      return fs.promises.rename(from, to);
    };
    const log: string[] = [];
    await createFiles(spyRequire({ rename: busy }, log)).writeText(file, 'ok');
    expect(await files.readText(file)).toBe('ok');
    expect(log.filter((l) => l.startsWith('rename '))).toHaveLength(3);
  });

  it('removes its temp file when the rename keeps failing', async () => {
    const dir = tmp();
    const locked = async () => {
      throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
    };
    const log: string[] = [];
    await expect(createFiles(spyRequire({ rename: locked }, log)).writeText(dir + '/a.json', 'x')).rejects.toThrow(/EBUSY/);
    expect(log.filter((l) => l.startsWith('rename '))).toHaveLength(4); // the first try and three retries
    expect(await files.readDir(dir)).toEqual([]);
  });

  it('gives up at once on a rename error that waiting cannot fix', async () => {
    const dir = tmp();
    const crossDevice = async () => {
      throw Object.assign(new Error('EXDEV: cross-device link not permitted'), { code: 'EXDEV' });
    };
    const log: string[] = [];
    await expect(createFiles(spyRequire({ rename: crossDevice }, log)).writeText(dir + '/a.json', 'x')).rejects.toThrow(/EXDEV/);
    expect(log.filter((l) => l.startsWith('rename '))).toHaveLength(1);
    expect(await files.readDir(dir)).toEqual([]);
  });

  it('throws when stat or remove fails for a reason other than a missing path', async () => {
    const dir = tmp();
    fs.writeFileSync(dir + '/locked.jsonl', 'x');
    const denied = (op: string) => async () => {
      throw Object.assign(new Error('EACCES: permission denied, ' + op), { code: 'EACCES' });
    };
    const locked = createFiles(spyRequire({ stat: denied('stat'), unlink: denied('unlink') }, []));
    await expect(locked.stat(dir + '/locked.jsonl')).rejects.toThrow(/EACCES/);
    await expect(locked.remove(dir + '/locked.jsonl')).rejects.toThrow(/EACCES/);
    expect(fs.existsSync(dir + '/locked.jsonl')).toBe(true);
  });

  it('refuses to write into a missing folder', async () => {
    const dir = tmp();
    await expect(files.writeText(dir + '/missing/a.json', 'x')).rejects.toThrow();
    expect(await files.exists(dir + '/missing')).toBe(false);
  });

  it('drops a UTF-8 byte order mark when reading text', async () => {
    const dir = tmp();
    fs.writeFileSync(dir + '/bom.json', '\uFEFF{"libraryRoot":"C:/CRBK/work/library"}', 'utf8');
    expect(JSON.parse(await files.readText(dir + '/bom.json'))).toEqual({ libraryRoot: 'C:/CRBK/work/library' });
  });

  it('appends text and creates the file on the first append', async () => {
    const dir = tmp();
    await files.append(dir + '/log.jsonl', '{"a":1}\n');
    await files.append(dir + '/log.jsonl', '{"b":"ё"}\n');
    expect(fs.readFileSync(dir + '/log.jsonl', 'utf8')).toBe('{"a":1}\n{"b":"ё"}\n');
  });

  it('tells files from folders and missing paths', async () => {
    const dir = tmp();
    fs.writeFileSync(dir + '/five.txt', '12345');
    expect(await files.exists(dir + '/five.txt')).toBe(true);
    expect(await files.exists(dir + '/nothing.txt')).toBe(false);
    const st = await files.stat(dir + '/five.txt');
    expect(st && { size: st.size, isFile: st.isFile, isDir: st.isDir }).toEqual({ size: 5, isFile: true, isDir: false });
    expect(typeof st?.mtimeMs).toBe('number');
    expect((await files.stat(dir))?.isDir).toBe(true);
    expect(await files.stat(dir + '/nothing.txt')).toBeNull();
    expect(await files.stat(dir + '/five.txt/inside')).toBeNull();
  });

  it('lists a folder in code unit order on every file system and marks subfolders', async () => {
    const dir = tmp();
    fs.writeFileSync(dir + '/B.otf', ''); // NTFS lists it after 'a', APFS in hash order
    fs.writeFileSync(dir + '/Шрифт.ttf', '');
    fs.mkdirSync(dir + '/a');
    expect(await files.readDir(dir)).toEqual([
      { name: 'B.otf', dir: false },
      { name: 'a', dir: true },
      { name: 'Шрифт.ttf', dir: false },
    ]);
    await expect(files.readDir(dir + '/missing')).rejects.toThrow();
  });

  it('creates nested folders and accepts existing ones', async () => {
    const dir = tmp();
    await files.mkdirp(dir + '/CloudRuBrandKit/logs');
    await files.mkdirp(dir + '/CloudRuBrandKit/logs');
    expect((await files.stat(dir + '/CloudRuBrandKit/logs'))?.isDir).toBe(true);
  });

  it('removes a file and ignores one that is already gone', async () => {
    const dir = tmp();
    fs.writeFileSync(dir + '/old.jsonl', 'x');
    await files.remove(dir + '/old.jsonl');
    await files.remove(dir + '/old.jsonl');
    expect(await files.exists(dir + '/old.jsonl')).toBe(false);
  });

  it('hashes files with sha256 as a stream', async () => {
    const dir = tmp();
    fs.writeFileSync(dir + '/abc.txt', 'abc');
    fs.writeFileSync(dir + '/empty.txt', '');
    const big = new Uint8Array(300 * 1024).map((_, i) => (i * 31) % 251);
    fs.writeFileSync(dir + '/big.bin', big);
    expect(await files.sha256(dir + '/abc.txt')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await files.sha256(dir + '/empty.txt')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(await files.sha256(dir + '/big.bin')).toBe(crypto.createHash('sha256').update(big).digest('hex'));
    await expect(files.sha256(dir + '/missing.bin')).rejects.toThrow();
  });

  it('reads bytes: a whole file or a range', async () => {
    const dir = tmp();
    fs.writeFileSync(dir + '/bytes.bin', new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
    expect(Array.from(await files.readBytes(dir + '/bytes.bin'))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(Array.from(await files.readBytes(dir + '/bytes.bin', 2, 3))).toEqual([2, 3, 4]);
    expect(Array.from(await files.readBytes(dir + '/bytes.bin', 8, 100))).toEqual([8, 9]);
    expect(Array.from(await files.readBytes(dir + '/bytes.bin', 20, 4))).toEqual([]);
    expect(Array.from(await files.readBytes(dir + '/bytes.bin', 0, 2 ** 40))).toHaveLength(10); // a bogus length from a broken font
    await expect(files.readBytes(dir + '/missing.bin', 0, 4)).rejects.toThrow();
  });

  it('joins Windows paths with forward slashes and gives native ones back', () => {
    const win = createFiles((id) => (id === 'path' ? nodePath.win32 : req(id)));
    expect(win.join('C:\\Users\\Глеб', 'AppData', '..', 'Local', 'CloudRuBrandKit')).toBe('C:/Users/Глеб/Local/CloudRuBrandKit');
    expect(win.join('C:/ProgramData/CloudRuBrandKit/library', 'items/TTL_LowerThird/TTL_LowerThird_16x9_v1.mogrt'))
      .toBe('C:/ProgramData/CloudRuBrandKit/library/items/TTL_LowerThird/TTL_LowerThird_16x9_v1.mogrt');
    expect(win.dirname('C:\\a\\b\\c.json')).toBe('C:/a/b');
    expect(win.basename('C:\\a\\b\\c.json')).toBe('c.json');
    expect(win.basename('C:/a/b/c.json')).toBe('c.json');
    expect(win.native('C:/a/b/c.json')).toBe('C:\\a\\b\\c.json');
  });

  it('keeps POSIX paths on macOS', () => {
    const mac = createFiles((id) => (id === 'path' ? nodePath.posix : req(id)));
    expect(mac.join('/Users/gleb', 'Library', 'Logs', 'CloudRuBrandKit')).toBe('/Users/gleb/Library/Logs/CloudRuBrandKit');
    expect(mac.dirname('/Users/Shared/CloudRuBrandKit/library/library.json')).toBe('/Users/Shared/CloudRuBrandKit/library');
    expect(mac.basename('/Users/Shared/x.json')).toBe('x.json');
    expect(mac.native('/Users/Shared/x.json')).toBe('/Users/Shared/x.json');
  });

  it('turns backslashes into forward slashes', () => {
    expect(posixPath('C:\\Users\\Глеб\\AppData')).toBe('C:/Users/Глеб/AppData');
    expect(posixPath('\\\\server\\share\\lib')).toBe('//server/share/lib');
    expect(posixPath('/Users/Shared')).toBe('/Users/Shared');
  });
});
