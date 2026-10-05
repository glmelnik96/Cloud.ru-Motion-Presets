// Names of the previews of an item (tools/masters/preview.mjs writes them, build-catalog.mjs reads them):
//   preview_<variant>[_<field>-<value>…].mp4 and poster_<the same>.jpg, a checkbox as on/off.
// The panel shows the one that matches the format and the values of the form.

// File stem of a preview: "16x9", "9x16_style-2", "16x9_plate-on_theme-1" (field keys in the order of axes).
export function previewName(variantKey, when = {}) {
  const tail = Object.entries(when).map(([k, v]) => `_${k}-${v === true ? 'on' : v === false ? 'off' : v}`).join('');
  return `${variantKey}${tail}`;
}

// The other way: "9x16_style-2" -> { variant: '9x16', when: { style: 2 } }, with the types of the fields; null
// when the stem names no variant or field of the item. A variant key may hold "_" (16x9_4K): the longest key
// the stem starts with wins.
export function parsePreviewName(stem, item) {
  const variant = item.variants.map((x) => x.key).filter((k) => stem === k || stem.startsWith(k + '_')).sort((a, b) => b.length - a.length)[0];
  if (!variant) return null;
  const when = {};
  for (const part of stem.slice(variant.length).split('_').filter(Boolean)) {
    const m = /^([a-z][A-Za-z0-9]*)-(on|off|\d+)$/.exec(part);
    const f = m && (item.fields || []).find((x) => x.key === m[1]);
    if (!f || (f.type === 'checkbox') !== (m[2] === 'on' || m[2] === 'off')) return null;
    when[m[1]] = f.type === 'checkbox' ? m[2] === 'on' : Number(m[2]);
  }
  return { variant, when };
}
