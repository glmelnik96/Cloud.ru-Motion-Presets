// Shared by the tests of the plate masters (TTL_Plate, TTL_PlateSwap): the pack's ink as the stand-in comp
// reads it (tests/helpers/master-expr.mjs) and a plate's rectangle from its expressions.

// Ink in FHD units at the masters' font sizes: the pack's 4K podcast texts / 2, the SMM texts at 75 %; any
// other text gets 22 px per character and no descender. Podcast texts are placed by their ink, so their side
// bearing is 1; b is how far the pack's ink reaches below its baseline.
export function packInk(metrics) {
  const byText = new Map();
  for (const c of metrics.cases) {
    for (const row of Object.values(c.layers)) {
      const s = c.pack === 'podcast' ? 0.5 : (c.comp === 'Плашки_9x16' ? 0.75 : 1080 / 1440);
      const base = row.lines.find(Boolean)[1];
      byText.set(row.text.replace(/^\r/, ''), { l: c.pack === 'podcast' ? 1 : row.rect[0] * s, w: row.rect[2] * s, b: (row.rect[1] + row.rect[3] - base) * s });
    }
  }
  return (layer, text) => (text ? byText.get(text) || { l: 1, w: text.length * 22, b: 0 } : { l: 0, w: 0, b: 0 });
}

export const plateOf = (c, n, t) => {
  const [w, h] = c.at(n, ['group', 'Plate', 'Rect', 'ADBE Vector Rect Size'], t);
  const [x, y] = c.at(n, ['group', 'Plate', 'Rect', 'ADBE Vector Rect Position'], t);
  return { x0: x - w / 2, x1: x + w / 2, y0: y - h / 2, y1: y + h / 2, w, h };
};
