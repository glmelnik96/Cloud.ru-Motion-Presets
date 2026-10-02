// ASCII slugs for comp and file names. NFC first (Mac NFD names), then Russian transliteration,
// lower case, only [a-z0-9_], at most 64 characters. Deterministic: same name, same slug.
export const MAX_SLUG = 64;

const TABLE = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};
const SYMBOLS = { '+': '_plus_', '&': '_and_', '%': '_pct_', '@': '_at_' };
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/;

export const nfc = (s) => String(s).normalize('NFC');

export function translit(s) {
  let out = '';
  for (const ch of nfc(s).toLowerCase()) out += TABLE[ch] ?? ch;
  return out;
}

export function slugify(name, { maxLen = MAX_SLUG, fallback = 'untitled' } = {}) {
  let s = translit(name)
    .replace(/[+&%@]/g, (c) => SYMBOLS[c])
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // é -> e
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (s.length > maxLen) s = s.slice(0, maxLen).replace(/_+$/, '');
  if (!s) s = fallback;
  if (WINDOWS_RESERVED.test(s)) s += '_';
  return s;
}

// Unique slugs in input order: a repeated "podkast" becomes "podkast_2", then "podkast_3".
export function uniqueSlugs(names, opts = {}) {
  const maxLen = opts.maxLen || MAX_SLUG;
  const used = new Set();
  return names.map((name) => {
    const base = slugify(name, opts);
    let s = base;
    for (let k = 2; used.has(s); k += 1) {
      const suffix = '_' + k;
      s = base.slice(0, maxLen - suffix.length).replace(/_+$/, '') + suffix;
    }
    used.add(s);
    return s;
  });
}

// compSlug of every comp in a project: unique in the project and assigned in ascending item id,
// so golden renders (ROOT comps only) and JSX dumps (all comps) give a comp the same slug.
export function compSlugs(comps) {
  const sorted = [...comps].sort((a, b) => a.id - b.id);
  const slugs = uniqueSlugs(sorted.map((c) => c.name));
  return new Map(sorted.map((c, i) => [c.id, slugs[i]]));
}
