// Panel settings. The library root (plan P6) comes from settings.json in %LOCALAPPDATA%\CloudRuBrandKit (the dev
// link script writes it), else it is the installer's folder in ProgramData (Mac: /Users/Shared). Field values
// per '<id>@<version>' and the manual variant per item live in the panel's storage (localStorage in CEP); when
// the storage fails (private mode, quota, no access) the panel just does not remember.
import type { FieldValue } from '../core/types';
import { envVar } from './cep';
import type { Env } from './cep';
import { joinPosix, posixPath, trimSlash } from './files';
import type { Files } from './files';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SettingsOptions {
  files: Pick<Files, 'readText'>;
  storage: StorageLike | null; // null: nothing is remembered
  env: Env;
  platform: string;
  home: string;
}

export interface Settings {
  libraryRoot(): Promise<string>; // forward slashes, no trailing slash
  remembered(itemKey: string): Record<string, FieldValue> | null;
  remember(itemKey: string, values: Record<string, FieldValue>): boolean; // false when the storage refused
  manualVariant(itemId: string): string | null;
  setManualVariant(itemId: string, key: string | null): boolean; // null forgets
}

const FIELDS_KEY = 'crbk.fields.';
const VARIANT_KEY = 'crbk.variant.';

export function settingsPath(env: Env, platform: string, home: string): string {
  if (platform === 'win32') {
    return joinPosix(envVar(env, 'LOCALAPPDATA') ?? joinPosix(home, 'AppData/Local'), 'CloudRuBrandKit/settings.json');
  }
  return joinPosix(home, 'Library/Application Support/CloudRuBrandKit/settings.json');
}

export function defaultLibraryRoot(env: Env, platform: string): string {
  if (platform === 'win32') return joinPosix(envVar(env, 'ProgramData') ?? 'C:/ProgramData', 'CloudRuBrandKit/library');
  return '/Users/Shared/CloudRuBrandKit/library';
}

// Text, number and checkbox values only; anything else in storage is somebody else's or broken. (A '__proto__'
// key from JSON is harmless here: the prototype setter ignores the primitives that pass the filter.)
function fieldValues(raw: unknown): Record<string, FieldValue> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, FieldValue> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) out[key] = value;
  }
  return out;
}

export function createSettings({ files, storage, env, platform, home }: SettingsOptions): Settings {
  function read(key: string): string | null {
    if (!storage) return null;
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  }

  function store(key: string, value: string | null): boolean {
    if (!storage) return false;
    try {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  return {
    async libraryRoot() {
      try {
        const doc = JSON.parse(await files.readText(settingsPath(env, platform, home))) as unknown; // readText drops a BOM
        const root = doc && typeof doc === 'object' ? (doc as { libraryRoot?: unknown }).libraryRoot : undefined;
        if (typeof root === 'string' && root.trim()) return trimSlash(posixPath(root.trim()));
      } catch {
        // No settings.json, or not JSON: the installer's folder.
      }
      return defaultLibraryRoot(env, platform);
    },

    remembered(itemKey) {
      const text = read(FIELDS_KEY + itemKey);
      if (text === null) return null;
      try {
        return fieldValues(JSON.parse(text));
      } catch {
        return null;
      }
    },

    remember(itemKey, values) {
      const clean = fieldValues(values);
      return clean !== null && store(FIELDS_KEY + itemKey, JSON.stringify(clean));
    },

    manualVariant(itemId) {
      return read(VARIANT_KEY + itemId) || null;
    },

    setManualVariant(itemId, key) {
      return store(VARIANT_KEY + itemId, key);
    },
  };
}
