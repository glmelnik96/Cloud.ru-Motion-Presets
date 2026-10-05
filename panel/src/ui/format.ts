// How the panel says a frame to the user (the format chip of the header, spec 7): «Авто 16:9 · 25p», «Нет варианта:
// 2560×1440 → ближайший 16:9», and the list of variants behind a click on it. Pure: no DOM, no host.
import { chooseVariant, frameLabel } from '../core/variant';
import type { HostContext, HostKey, Item, Variant } from '../core/types';

type Target = NonNullable<HostContext['target']>;

export interface FormatOption {
  key: string | null; // null: automatic choice by the frame of the target
  label: string;
  hint?: string;
  selected: boolean;
}

export interface FormatChip {
  tone: 'ok' | 'warn' | 'error' | 'muted';
  text: string;
  title: string; // the tooltip: what exactly will be inserted, or what to do
  options: FormatOption[] | null; // null: nothing to choose (no item open, no target)
}

export interface ChipInput {
  host: HostKey;
  reachable: boolean; // the host answered its last getContext
  target: Target | null | undefined; // undefined: not asked yet; null: the host has no active comp or sequence
  item?: Item | null;
  manualKey?: string | null;
}

// The aspects of the library (tools/library/schema), matched within the library's own 1 %.
const KNOWN: readonly (readonly [number, number])[] = [[16, 9], [9, 16], [1, 1], [4, 5], [4, 3]];
const SAME_ASPECT = 0.01;
const MAX_TERM = 32; // 64:27 is no way to say 2560x1080: such a frame gets a ratio

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const comma = (n: number, digits: number): string => String(Math.round(n * 10 ** digits) / 10 ** digits).replace('.', ',');
const usable = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

// 25 -> '25p', 29.97003 -> '29,97p', 23.976 -> '23,976p'; '' for a rate that is not one.
export function fpsLabel(fps: number): string {
  return usable(fps) ? comma(fps, 3) + 'p' : '';
}

// '16:9' for 1920x1080, 3840x2160 and 1366x768; 8:5 for 1920x1200; a ratio for what has no tidy name; '' for no frame.
export function aspectLabel(w: number, h: number): string {
  if (!usable(w) || !usable(h)) return '';
  const ratio = w / h;
  for (const [a, b] of KNOWN) {
    if (Math.abs(ratio - a / b) / (a / b) <= SAME_ASPECT) return a + ':' + b;
  }
  const g = gcd(Math.round(w), Math.round(h));
  const a = Math.round(w) / g;
  const b = Math.round(h) / g;
  if (g > 0 && a <= MAX_TERM && b <= MAX_TERM) return a + ':' + b;
  return ratio >= 1 ? comma(ratio, 2) + ':1' : '1:' + comma(1 / ratio, 2);
}

// The library names the aspect of a variant ('16x9'); a variant without one is read off its size.
export function variantAspect(v: Variant): string {
  if (v.aspect) return v.aspect.replace('x', ':');
  return usable(v.w) && usable(v.h) ? aspectLabel(v.w, v.h) : '';
}

// '16:9 · 3840×2160': the aspect alone would not tell the 4K variant from the HD one.
export function variantLabel(v: Variant): string {
  if (!usable(v.w) || !usable(v.h)) return v.key;
  return variantAspect(v) + ' · ' + frameLabel(v.w, v.h);
}

const joinDot = (...parts: string[]): string => parts.filter(Boolean).join(' · ');

function options(item: Item, target: Target, manualKey: string | null | undefined, manual: boolean): FormatOption[] {
  // The hints come from the automatic choice: which variant would fit, whatever was picked by hand.
  const auto = chooseVariant(item, target);
  const list: FormatOption[] = [{ key: null, label: 'Авто по формату цели', selected: !manual }];
  for (const v of item.variants) {
    const option: FormatOption = { key: v.key, label: variantLabel(v), selected: manual && v.key === manualKey };
    if (auto.match === 'exact' && auto.variant === v) option.hint = 'точное совпадение';
    else if (auto.match === 'none' && auto.nearest === v) option.hint = 'ближайший';
    list.push(option);
  }
  return list;
}

export function formatChip(input: ChipInput): FormatChip {
  const { host, target, item } = input;
  if (!input.reachable) return { tone: 'error', text: 'Нет связи с приложением', title: '', options: null };
  if (target === undefined) return { tone: 'muted', text: 'Определяю формат…', title: '', options: null };
  if (target === null) {
    const noun = host === 'ae' ? 'композиции' : 'секвенции';
    return { tone: 'warn', text: 'Нет активной ' + noun, title: 'Откройте ' + (host === 'ae' ? 'композицию' : 'секвенцию') + ', куда вставлять шаблон.', options: null };
  }
  const fps = fpsLabel(target.fps);
  const frame = frameLabel(target.w, target.h);
  if (!item) {
    return { tone: 'ok', text: 'Авто ' + joinDot(aspectLabel(target.w, target.h), fps), title: frame, options: null };
  }

  const choice = chooseVariant(item, target, input.manualKey ?? undefined);
  const manual = choice.match === 'manual';
  const list = options(item, target, input.manualKey, manual);
  if (choice.variant && manual) {
    return {
      tone: 'ok',
      text: 'Вручную: ' + joinDot(variantLabel(choice.variant), fps),
      title: 'Вариант выбран вручную. «Авто» вернёт выбор по формату цели.',
      options: list,
    };
  }
  if (choice.variant) {
    return {
      tone: 'ok',
      text: 'Авто ' + joinDot(variantAspect(choice.variant), fps),
      title: 'Вариант ' + variantLabel(choice.variant),
      options: list,
    };
  }
  const nearest = choice.nearest;
  return {
    tone: 'warn',
    text: 'Нет варианта: ' + frame + (nearest ? ' → ближайший ' + variantAspect(nearest) : ''),
    title: nearest ? 'Ближайший вариант: ' + variantLabel(nearest) + '. Его можно выбрать вручную.' : 'У шаблона нет варианта под этот кадр.',
    options: list,
  };
}
