import { afterAll, describe, it, expect } from 'vitest';
import { createFiles, posixPath } from '../../../panel/src/services/files';
import { createSettings, defaultLibraryRoot, settingsPath } from '../../../panel/src/services/settings';
import type { StorageLike } from '../../../panel/src/services/settings';

// The panel tsconfig has no Node types (types: []); the tests run in Node, so the built-ins come in untyped.
const nodeModule = 'node:module';
const { createRequire } = (await import(nodeModule)) as { createRequire(url: string): (id: string) => any };
const req = createRequire(import.meta.url);
const fs = req('fs');
const os = req('os');
const nodePath = req('path');

const made: string[] = [];
const tmp = (): string => {
  const dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'crbk-settings-'));
  made.push(dir);
  return posixPath(dir);
};
afterAll(() => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
});

const files = createFiles(req);

function memory(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
  };
}

const broken: StorageLike = {
  getItem: () => {
    throw new Error('SecurityError: access denied');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
  removeItem: () => {
    throw new Error('SecurityError: access denied');
  },
};

// A Windows profile in a temp folder: LOCALAPPDATA holds CloudRuBrandKit/settings.json.
function profile(json?: string): { local: string; settings: ReturnType<typeof createSettings> } {
  const local = tmp();
  if (json !== undefined) {
    fs.mkdirSync(local + '/CloudRuBrandKit');
    fs.writeFileSync(local + '/CloudRuBrandKit/settings.json', json, 'utf8');
  }
  const env = { LOCALAPPDATA: local, ProgramData: 'C:\\ProgramData' };
  return { local, settings: createSettings({ files, storage: memory(), env, platform: 'win32', home: 'C:/Users/u' }) };
}

describe('settings: library root', () => {
  it('takes libraryRoot from settings.json in LOCALAPPDATA', async () => {
    expect(await profile('{"libraryRoot": "C:/CRBK/work/library"}').settings.libraryRoot()).toBe('C:/CRBK/work/library');
  });

  it('normalises backslashes, a trailing slash and a byte order mark', async () => {
    expect(await profile('\uFEFF{"libraryRoot": "D:\\\\Brand\\\\Библиотека\\\\"}').settings.libraryRoot()).toBe('D:/Brand/Библиотека');
  });

  it('falls back to ProgramData without settings or with unusable settings', async () => {
    const fallback = 'C:/ProgramData/CloudRuBrandKit/library';
    expect(await profile().settings.libraryRoot()).toBe(fallback);
    for (const bad of ['not json', '[]', '{}', '{"libraryRoot": ""}', '{"libraryRoot": "   "}', '{"libraryRoot": 42}', 'null']) {
      expect(await profile(bad).settings.libraryRoot()).toBe(fallback);
    }
  });

  it('places the default library and the settings file per platform', () => {
    expect(defaultLibraryRoot({ ProgramData: 'D:\\ProgramData' }, 'win32')).toBe('D:/ProgramData/CloudRuBrandKit/library');
    expect(defaultLibraryRoot({ PROGRAMDATA: 'C:\\ProgramData' }, 'win32')).toBe('C:/ProgramData/CloudRuBrandKit/library');
    expect(defaultLibraryRoot({}, 'win32')).toBe('C:/ProgramData/CloudRuBrandKit/library');
    expect(defaultLibraryRoot({}, 'darwin')).toBe('/Users/Shared/CloudRuBrandKit/library');
    expect(settingsPath({ LOCALAPPDATA: 'C:\\Users\\Глеб\\AppData\\Local' }, 'win32', 'C:\\Users\\Глеб'))
      .toBe('C:/Users/Глеб/AppData/Local/CloudRuBrandKit/settings.json');
    expect(settingsPath({}, 'win32', 'C:\\Users\\u')).toBe('C:/Users/u/AppData/Local/CloudRuBrandKit/settings.json');
    expect(settingsPath({}, 'darwin', '/Users/gleb')).toBe('/Users/gleb/Library/Application Support/CloudRuBrandKit/settings.json');
  });

  it('reads the macOS settings file from Application Support', async () => {
    const home = tmp();
    fs.mkdirSync(home + '/Library/Application Support/CloudRuBrandKit', { recursive: true });
    fs.writeFileSync(home + '/Library/Application Support/CloudRuBrandKit/settings.json', '{"libraryRoot":"/Volumes/Brand/library/"}');
    const settings = createSettings({ files, storage: memory(), env: {}, platform: 'darwin', home });
    expect(await settings.libraryRoot()).toBe('/Volumes/Brand/library');
  });
});

describe('settings: remembered values', () => {
  const make = (storage: StorageLike | null) => createSettings({ files, storage, env: {}, platform: 'win32', home: 'C:/Users/u' });

  it('remembers field values per item version', () => {
    const s = make(memory());
    expect(s.remembered('TTL_LowerThird@1')).toBeNull();
    expect(s.remember('TTL_LowerThird@1', { name: 'Иван Петров', style: 2, plate: true })).toBe(true);
    expect(s.remembered('TTL_LowerThird@1')).toEqual({ name: 'Иван Петров', style: 2, plate: true });
    expect(s.remembered('TTL_LowerThird@2')).toBeNull();
    expect(s.remember('TTL_LowerThird@1', { name: 'Ёлка × 2' })).toBe(true);
    expect(s.remembered('TTL_LowerThird@1')).toEqual({ name: 'Ёлка × 2' });
  });

  it('keeps only text, number and checkbox values', () => {
    const storage = memory();
    const s = make(storage);
    const values = { a: 'x', b: 1, c: false, d: null, e: { x: 1 }, f: Number.NaN, g: [1] } as unknown as Record<string, string>;
    s.remember('X@1', values);
    expect(s.remembered('X@1')).toEqual({ a: 'x', b: 1, c: false });
    const key = [...storage.map.keys()][0] ?? '';
    expect(storage.map.get(key)).toBe('{"a":"x","b":1,"c":false}');
    storage.map.set(key, '{"a":"x","__proto__":5,"o":{"polluted":true},"n":[1],"m":2}');
    const back = s.remembered('X@1');
    expect(back).toEqual({ a: 'x', m: 2 });
    expect(Object.getPrototypeOf(back)).toBe(Object.prototype);
    for (const junk of ['not json', '[1,2]', '"text"', 'null']) {
      storage.map.set(key, junk);
      expect(s.remembered('X@1')).toBeNull();
    }
  });

  it('remembers the manual variant per item and forgets it on null', () => {
    const s = make(memory());
    expect(s.manualVariant('LOGO_Shot')).toBeNull();
    expect(s.setManualVariant('LOGO_Shot', '16x9_4K')).toBe(true);
    expect(s.manualVariant('LOGO_Shot')).toBe('16x9_4K');
    expect(s.manualVariant('LOGO_Mark')).toBeNull();
    expect(s.setManualVariant('LOGO_Shot', null)).toBe(true);
    expect(s.manualVariant('LOGO_Shot')).toBeNull();
  });

  it('keeps the two kinds of memory apart', () => {
    const storage = memory();
    const s = make(storage);
    s.remember('LOGO_Shot', { caption: 2 });
    s.setManualVariant('LOGO_Shot', '9x16');
    expect(storage.map.size).toBe(2);
    expect(s.remembered('LOGO_Shot')).toEqual({ caption: 2 });
    expect(s.manualVariant('LOGO_Shot')).toBe('9x16');
  });

  it('survives a storage that throws or is missing', () => {
    for (const storage of [broken, null]) {
      const s = make(storage);
      expect(s.remembered('X@1')).toBeNull();
      expect(s.remember('X@1', { a: 'x' })).toBe(false);
      expect(s.manualVariant('X')).toBeNull();
      expect(s.setManualVariant('X', '16x9')).toBe(false);
      expect(s.setManualVariant('X', null)).toBe(false);
    }
  });
});
