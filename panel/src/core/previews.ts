// Which preview the form shows (user 2026-10-05: «Превью должно отображать все варианты»): the one of the same
// proportion as the variant in use whose conditions all hold for the values of the form, the most specific
// first; a preview of exactly that variant wins a tie. Without one of that proportion, the card's preview.
import type { Item, PreviewEntry, Stored, Values } from './types';

export interface PreviewMedia {
  video?: Stored;
  poster?: Stored;
}

export function previewFor(item: Item, variantKey: string | null | undefined, values: Values): PreviewMedia {
  const card = { video: item.preview, poster: item.poster };
  const list = item.previews ?? [];
  const variant = item.variants.find((v) => v.key === variantKey);
  if (!list.length || !variant) return card;
  const aspectOf = (key: string) => item.variants.find((v) => v.key === key)?.aspect ?? key;
  const fits = (p: PreviewEntry) => Object.entries(p.when ?? {}).every(([k, want]) => values[k] === undefined || values[k] === want);
  const pool = list.filter((p) => (p.variant === variant.key || aspectOf(p.variant) === (variant.aspect ?? variant.key)) && fits(p));
  if (!pool.length) return card;
  const score = (p: PreviewEntry) => Object.keys(p.when ?? {}).length * 2 + (p.variant === variant.key ? 1 : 0);
  const best = pool.slice().sort((a, b) => score(b) - score(a))[0];
  return { video: best.video, poster: best.poster };
}
