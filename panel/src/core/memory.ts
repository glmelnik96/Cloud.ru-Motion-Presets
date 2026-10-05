// Remembered form values and favourites (spec 7: «поля с запоминанием последних значений», «Избранное»).
// The store is injected: localStorage in CEP, a Map in tests.
import { initialValues, rememberable } from './fields';
import type { Item, Values } from './types';

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v) };
}

function readJson(store: KeyValueStore, key: string): unknown {
  try {
    const raw = store.get(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

const PREFIX = 'brandkit.';

export class FieldMemory {
  constructor(private readonly store: KeyValueStore) {}

  // Values for the form: remembered ones that still fit the current fields, defaults for the rest.
  load(item: Item): Values {
    const saved = readJson(this.store, `${PREFIX}fields.${item.id}`);
    const remembered = saved && typeof saved === 'object' && !Array.isArray(saved) ? (saved as Values) : {};
    return initialValues(item, remembered);
  }

  save(item: Item, values: Values): void {
    this.store.set(`${PREFIX}fields.${item.id}`, JSON.stringify(rememberable(item, values)));
  }

  favorites(): Set<string> {
    const list = readJson(this.store, `${PREFIX}favorites`);
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  }

  toggleFavorite(id: string): Set<string> {
    const fav = this.favorites();
    if (fav.has(id)) fav.delete(id);
    else fav.add(id);
    this.store.set(`${PREFIX}favorites`, JSON.stringify([...fav].sort()));
    return fav;
  }

  // Music and sound effects checkboxes (D14): music off, sound effects on until the user changes them.
  sound(): { music: boolean; sfx: boolean } {
    const s = readJson(this.store, `${PREFIX}sound`) as { music?: unknown; sfx?: unknown } | null;
    return { music: s?.music === true, sfx: s?.sfx !== false };
  }

  setSound(v: { music: boolean; sfx: boolean }): void {
    this.store.set(`${PREFIX}sound`, JSON.stringify(v));
  }
}
