// The form of an item as data (spec 7): one control per field of the library, a text with its limit and counter, a
// dropdown as segmented buttons up to five options, a checkbox, and for an item that fits by remap the «Длительность,
// с» control (plan P3). Fields the host does not fill stay in the form, off, with the hint to fill them in
// Properties (spec 6, capability check). Pure: the components only draw what is here.
import { minLen, defaultLen, round6 } from '../core/duration';
import { defaultOf, filledByPanel, type Values } from '../core/fields';
import type { Field, FieldValue, HostKey, Item } from '../core/types';

interface Base {
  key: string;
  label: string;
  disabled: boolean;
  hint?: string;
}

export interface TextControl extends Base {
  kind: 'text';
  value: string;
  maxLen: number;
  counter: string; // '17/40'
  level: 'ok' | 'near' | 'over';
}

export interface Option {
  index: number; // 1-based, as in the library
  label: string;
}

export interface SegmentsControl extends Base {
  kind: 'segments';
  value: number;
  options: Option[];
  layout: 'row' | 'stack'; // long labels get a line each
}

export interface SelectControl extends Base {
  kind: 'select';
  value: number;
  options: Option[];
}

export interface CheckboxControl extends Base {
  kind: 'checkbox';
  value: boolean;
}

export interface NumberControl extends Base {
  kind: 'number';
  value: number;
  min?: number;
  max?: number;
  step: number;
}

export interface MediaControl extends Base {
  kind: 'media';
}

export type Control = TextControl | SegmentsControl | SelectControl | CheckboxControl | NumberControl | MediaControl;

export interface DurationControl {
  label: string;
  value: number; // seconds
  text: string; // as shown in the field
  min: number;
  default: number;
  step: number;
  tooShort: boolean;
  hint: string;
}

export interface FormModel {
  controls: Control[];
  duration: DurationControl | null;
}

export const DURATION_LABEL = 'Длительность, с';
export const DURATION_STEP = 0.04; // a frame at 25 fps, the fps of the library
export const MAX_SEGMENTS = 5;
const STACK_AT = 14; // a label longer than this (in characters) cannot share a row of segments with the others
const NEAR = 0.9; // the counter turns to a warning at this share of the limit
const LEN_EPS = 1e-6;

const PROPERTIES_HINT = 'Заполните в Properties после вставки.';
const MEDIA_HINT = 'Файл добавляется в Properties после вставки.';

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

// The value in the form, else the library default, else a neutral one: a form never shows a hole.
function pick<T extends FieldValue>(f: Field, values: Values, ok: (v: unknown) => v is T, fallback: T): T {
  const v: unknown = own(values, f.key) ? values[f.key] : undefined;
  if (ok(v)) return v;
  const d = defaultOf(f);
  return ok(d) ? d : fallback;
}

const isText = (v: unknown): v is string => typeof v === 'string';
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function controlOf(f: Field, values: Values, host: HostKey, all: Field[]): Control {
  const base: Base = { key: f.key, label: f.label_ru, disabled: false };
  if (f.type === 'media') return { kind: 'media', ...base, disabled: true, hint: MEDIA_HINT };

  let hint: string | undefined;
  let disabled = false;
  if (!filledByPanel(f, host)) {
    disabled = true;
    hint = PROPERTIES_HINT;
  } else if (f.enabledBy) {
    const gate = all.find((g) => g.key === f.enabledBy);
    if (gate && !pick(gate, values, isBool, false)) {
      disabled = true;
      hint = 'Включите «' + gate.label_ru + '».';
    }
  }
  const shared = hint === undefined ? { ...base, disabled } : { ...base, disabled, hint };

  switch (f.type) {
    case 'text': {
      const value = pick(f, values, isText, '');
      const maxLen = f.maxLen ?? 0;
      const level = value.length > maxLen ? 'over' : value.length >= Math.ceil(maxLen * NEAR) ? 'near' : 'ok';
      return { kind: 'text', ...shared, value, maxLen, counter: value.length + '/' + maxLen, level };
    }
    case 'checkbox':
      return { kind: 'checkbox', ...shared, value: pick(f, values, isBool, false) };
    case 'dropdown': {
      const options = (f.options ?? []).map((o) => ({ index: o.index, label: o.label_ru }));
      const has = (v: unknown): v is number => isNum(v) && options.some((o) => o.index === v);
      const value = pick(f, values, has, options[0]?.index ?? 1);
      if (options.length > MAX_SEGMENTS) return { kind: 'select', ...shared, value, options };
      const longest = Math.max(0, ...options.map((o) => o.label.length));
      return { kind: 'segments', ...shared, value, options, layout: longest > STACK_AT ? 'stack' : 'row' };
    }
    default: {
      // slider (media returned above)
      const control: NumberControl = { kind: 'number', ...shared, value: pick(f, values, isNum, f.min ?? 0), step: 1 };
      if (f.min !== undefined) control.min = f.min;
      if (f.max !== undefined) control.max = f.max;
      return control;
    }
  }
}

// 4.2 -> '4,2', 5 -> '5', 6.04 -> '6,04'; '' for what is not a number.
export function formatSeconds(sec: number): string {
  return Number.isFinite(sec) ? String(Math.round(sec * 100) / 100).replace('.', ',') : '';
}

// '8', '4,5', '4.5', '.5'; null for anything else, so a half-typed or foreign text is never taken for a length.
export function parseSeconds(text: string): number | null {
  const t = String(text).trim();
  return /^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(t) ? Number(t.replace(',', '.')) : null;
}

// Whether the item takes a length from the user: a T1 item that fits by remap (rdt) has a length to change.
const hasDuration = (item: Item): boolean => item.fit === 'rdt' && !!item.duration;

export function clampSeconds(item: Item, sec: number): number {
  return Number.isFinite(sec) ? Math.max(minLen(item), sec) : defaultLen(item);
}

export function stepSeconds(item: Item, sec: number, dir: 1 | -1): number {
  const from = Number.isFinite(sec) ? sec : defaultLen(item);
  return Math.max(minLen(item), round6(Math.round((from + dir * DURATION_STEP) * 100) / 100));
}

function durationOf(item: Item, lenSec: number): DurationControl | null {
  if (!hasDuration(item)) return null;
  const min = minLen(item);
  const def = defaultLen(item);
  return {
    label: DURATION_LABEL,
    value: lenSec,
    text: formatSeconds(lenSec),
    min,
    default: def,
    step: DURATION_STEP,
    tooShort: !Number.isFinite(lenSec) || lenSec + LEN_EPS < min,
    hint: 'Минимум ' + formatSeconds(min) + ' с, по умолчанию ' + formatSeconds(def) + ' с',
  };
}

export function buildForm(item: Item, host: HostKey, values: Values, lenSec: number): FormModel {
  const fields = item.fields ?? [];
  return {
    controls: fields.filter((f) => !f.service).map((f) => controlOf(f, values, host, fields)),
    duration: durationOf(item, lenSec),
  };
}
