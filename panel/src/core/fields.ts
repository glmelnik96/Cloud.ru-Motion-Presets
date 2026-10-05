// Form values <-> template controls. Values in the form, the library and AE are 1-based for dropdowns; Premiere
// ExtendScript counts dropdown items from 0, takes a checkbox as 1/0 and reads it back as a boolean (S5, pr-check).
// Both hosts find a control by egpName; writes go in egpIndex order, the Essential Graphics order.
import type { Field, FieldValue, FieldWrite, HostKey, Issue, Item } from './types';

export type Values = Record<string, FieldValue>;

type Problem = 'type' | 'long' | 'range' | null;

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const order = (f: Field) => f.egpIndex ?? Number.MAX_SAFE_INTEGER;

export const isEditable = (f: Field) => !f.service && f.editable !== false;

// Whether the panel writes the field in this host. The other fields stay in the form, disabled, with a
// "fill it in Properties after the insert" hint (spec 6, capability check).
export function filledByPanel(f: Field, host: HostKey): boolean {
  return !!f.egpName && isEditable(f) && f.type !== 'media' && (!f.hosts || f.hosts.includes(host));
}

// The library default, else a neutral value of the type; a media slot has none until a file is chosen.
export function defaultOf(f: Field): FieldValue | undefined {
  if (f.default !== undefined) return f.default;
  if (f.type === 'text') return '';
  if (f.type === 'checkbox') return false;
  if (f.type === 'dropdown') return f.options?.[0]?.index ?? 1;
  if (f.type === 'slider') return f.min ?? 0;
  return undefined;
}

export function defaults(item: Item): Values {
  const out: Values = {};
  for (const f of item.fields ?? []) {
    const d = defaultOf(f);
    if (d !== undefined) out[f.key] = d;
  }
  return out;
}

function problem(f: Field, v: unknown): Problem {
  switch (f.type) {
    case 'text':
      if (typeof v !== 'string') return 'type';
      return f.maxLen !== undefined && v.length > f.maxLen ? 'long' : null;
    case 'dropdown':
      if (typeof v !== 'number' || !Number.isInteger(v)) return 'type';
      return v >= 1 && v <= (f.options?.length ?? 0) ? null : 'range';
    case 'checkbox':
      return typeof v === 'boolean' ? null : 'type';
    case 'slider':
      if (typeof v !== 'number' || !Number.isFinite(v)) return 'type';
      return (f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max) ? 'range' : null;
    case 'media':
      return typeof v === 'string' ? null : 'type';
  }
  return 'type';
}

// Remembered values (settings, by itemId@version) over the defaults: only for fields that still exist, are
// editable and hold a value of the right type and option, so the result always passes validateValues.
export function merge(remembered: unknown, item: Item): Values {
  const out = defaults(item);
  if (typeof remembered !== 'object' || remembered === null || Array.isArray(remembered)) return out;
  const r = remembered as Record<string, unknown>;
  for (const f of item.fields ?? []) {
    if (!isEditable(f) || !own(r, f.key)) continue;
    const v = r[f.key];
    if (problem(f, v) === null) out[f.key] = v as FieldValue;
  }
  return out;
}

// One issue per bad field. A missing key means the default. Service and media fields are not the form's to check.
export function validateValues(item: Item, values: Values): Issue[] {
  const issues: Issue[] = [];
  for (const f of item.fields ?? []) {
    if (!isEditable(f) || f.type === 'media') continue;
    const v = own(values, f.key) ? values[f.key] : defaultOf(f);
    const p = problem(f, v);
    const at = { field: f.label_ru, key: f.key };
    if (p === 'long') {
      issues.push({ code: 'FIELD_TOO_LONG', level: 'error', params: { ...at, max: f.maxLen ?? 0, len: String(v).length } });
    } else if (p) {
      issues.push({ code: 'FIELD_INVALID', level: 'error', params: { ...at, value: v === undefined ? '' : String(v) } });
    }
  }
  return issues;
}

function toBool(v: unknown): boolean | null {
  if (v === true || v === 1 || v === '1' || v === 'true') return true;
  if (v === false || v === 0 || v === '0' || v === 'false') return false;
  return null;
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return Number.NaN;
}

function hostValue(f: Field, v: FieldValue | undefined, host: HostKey): FieldValue {
  if (f.type === 'dropdown') return toNumber(v) - (host === 'pr' ? 1 : 0);
  // 1/0 in both hosts: Premiere takes 1/0 (masters' pr-check), an AE checkbox Essential Property is a OneD
  // number property and reads back 0/1 (S3).
  if (f.type === 'checkbox') return toBool(v) ? 1 : 0;
  if (f.type === 'slider') return toNumber(v);
  return v === undefined ? '' : String(v);
}

// What the adapter writes, already in the host's base, in egpIndex order.
export function toWrites(item: Item, values: Values, host: HostKey): FieldWrite[] {
  return (item.fields ?? [])
    .filter((f) => filledByPanel(f, host))
    .map((f, i) => ({ f, i }))
    .sort((a, b) => order(a.f) - order(b.f) || a.i - b.i)
    .map(({ f }) => ({
      egpName: f.egpName as string,
      type: f.type,
      value: hostValue(f, own(values, f.key) ? values[f.key] : defaultOf(f), host),
    }));
}

// Whether a read-back equals the written value, both in the host's base. A checkbox may come back as a boolean
// (Premiere) or 0/1 (AE), numbers may come back as strings; text must match exactly. The rules are the same in
// both hosts today; host is kept for host-specific readings.
export function sameValue(host: HostKey, type: Field['type'], written: FieldValue, back: FieldValue | null): boolean {
  void host;
  if (back === null || back === undefined) return false;
  if (type === 'checkbox') {
    const w = toBool(written);
    return w !== null && w === toBool(back);
  }
  if (type === 'dropdown' || type === 'slider') {
    const x = toNumber(written);
    const y = toNumber(back);
    return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= (type === 'slider' ? 1e-6 : 0);
  }
  return String(back) === String(written);
}
