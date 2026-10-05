// The form of an item: which fields the panel fills on this host, their values, and the writes a host adapter
// performs (spec 6 "проверка возможностей", 4.4 fields[]). Premiere numbers dropdown items from 0 and takes
// checkboxes as booleans; Essential Properties in AE number them from 1 and take 0/1 (S3, S5).
import { error, type Problem } from './problems';
import type { Field, FieldValue, Host, Item, Values } from './types';

// panel: the panel writes it; properties: shown greyed out, «заполните в Properties после вставки»;
// hidden: a service field the panel writes itself (Duration) and never shows.
export type FieldMode = 'panel' | 'properties' | 'hidden';

export function fieldMode(field: Field, host: Host): FieldMode {
  if (field.service) return 'hidden';
  if (field.type === 'media' && host === 'pr') return 'properties';
  if (field.hosts && !field.hosts.includes(host)) return 'properties';
  return 'panel';
}

export interface FormField {
  field: Field;
  mode: FieldMode;
}

export function formFields(item: Item, host: Host): FormField[] {
  return (item.fields ?? [])
    .map((field) => ({ field, mode: fieldMode(field, host) }))
    .filter((f) => f.mode !== 'hidden');
}

// A field switched off by its checkbox (enabledBy) stays visible but inactive.
export function isActive(field: Field, values: Values): boolean {
  return !field.enabledBy || values[field.enabledBy] === true;
}

export function emptyValue(field: Field): FieldValue {
  switch (field.type) {
    case 'text': return '';
    case 'checkbox': return false;
    case 'dropdown': return 1;
    case 'slider': return field.min ?? 0;
    default: return null;
  }
}

export function defaultValue(field: Field): FieldValue {
  return field.default === undefined || field.default === null ? emptyValue(field) : field.default;
}

// Why a value does not fit its field, in Russian, or null.
export function valueProblem(field: Field, v: FieldValue): string | null {
  switch (field.type) {
    case 'text':
      if (typeof v !== 'string') return 'нужен текст';
      if (field.maxLen !== undefined && [...v].length > field.maxLen) return `не длиннее ${field.maxLen} знаков`;
      return null;
    case 'checkbox':
      return typeof v === 'boolean' ? null : 'нужно «да» или «нет»';
    case 'dropdown': {
      const n = field.options?.length ?? 0;
      return Number.isInteger(v) && (v as number) >= 1 && (v as number) <= n ? null : `выберите пункт от 1 до ${n}`;
    }
    case 'slider':
      if (typeof v !== 'number' || !Number.isFinite(v)) return 'нужно число';
      if (field.min !== undefined && v < field.min) return `не меньше ${field.min}`;
      if (field.max !== undefined && v > field.max) return `не больше ${field.max}`;
      return null;
    case 'media':
      return v === null || (typeof v === 'string') ? null : 'нужен файл';
    default:
      return 'неизвестный тип поля';
  }
}

// Values to start the form with: remembered values that still fit their field, else the defaults.
export function initialValues(item: Item, remembered: Values = {}): Values {
  const out: Values = {};
  for (const f of item.fields ?? []) {
    if (f.service) continue;
    const r = remembered[f.key];
    out[f.key] = r !== undefined && valueProblem(f, r) === null ? r : defaultValue(f);
  }
  return out;
}

export function validateValues(item: Item, values: Values, host: Host): Problem[] {
  const out: Problem[] = [];
  for (const { field, mode } of formFields(item, host)) {
    if (mode !== 'panel') continue;
    const why = valueProblem(field, values[field.key] ?? defaultValue(field));
    if (why) out.push(error('BAD_VALUE', `${field.label_ru}: ${why}.`, { key: field.key }));
  }
  return out;
}

// AE text breaks lines with \r; a pasted \r\n or \n becomes one break.
export function hostText(s: string): string {
  return s.replace(/\r\n?|\n/g, '\r');
}

export function hostValue(field: Field, v: FieldValue, host: Host): FieldValue {
  switch (field.type) {
    case 'text': return hostText(String(v ?? ''));
    case 'checkbox': return host === 'ae' ? (v ? 1 : 0) : Boolean(v);
    case 'dropdown': return host === 'pr' ? Number(v) - 1 : Number(v);
    case 'slider': return Number(v);
    default: return v;
  }
}

export interface HostWrite {
  key: string;
  egpName: string;
  type: Field['type'];
  value: FieldValue;
}

// Writes for the adapter, in the order of the fields. Media goes only where the panel fills slots (AE) and
// only when a file was chosen. Service fields are written by the length plan, not from the form.
export function writesFor(item: Item, values: Values, host: Host): HostWrite[] {
  const out: HostWrite[] = [];
  for (const { field, mode } of formFields(item, host)) {
    if (mode !== 'panel' || !field.egpName) continue;
    const v = values[field.key] ?? defaultValue(field);
    if (field.type === 'media' && (v === null || v === '')) continue;
    out.push({ key: field.key, egpName: field.egpName, type: field.type, value: hostValue(field, v, host) });
  }
  return out;
}

// What the panel remembers between inserts: form fields only, never media paths (they belong to a project).
export function rememberable(item: Item, values: Values): Values {
  const out: Values = {};
  for (const f of item.fields ?? []) {
    if (f.service || f.type === 'media') continue;
    if (values[f.key] !== undefined && valueProblem(f, values[f.key]) === null) out[f.key] = values[f.key];
  }
  return out;
}
