import { describe, it, expect } from 'vitest';
import {
  defaults, defaultOf, merge, validateValues, toWrites, sameValue, filledByPanel, isEditable,
} from '../../../panel/src/core/fields';
import type { Field, Item } from '../../../panel/src/core/types';
import { item } from './fixture';

// An item with one field of every kind the panel must skip or fall back on.
function odd(): Item {
  const fields: Field[] = [
    { key: 'title', label_ru: 'Заголовок', type: 'text', egpName: 'Заголовок', egpIndex: 4, maxLen: 30 },
    { key: 'on', label_ru: 'Показать', type: 'checkbox', egpName: 'Показать', egpIndex: 3 },
    { key: 'pick', label_ru: 'Вариант', type: 'dropdown', egpName: 'Вариант', egpIndex: 2,
      options: [{ index: 1, label_ru: 'Один' }, { index: 2, label_ru: 'Два' }] },
    { key: 'amount', label_ru: 'Сила', type: 'slider', egpName: 'Сила', egpIndex: 1, min: 10, max: 90 },
    { key: 'duration', label_ru: 'Длительность', type: 'slider', egpName: 'Длительность (служебное, не менять)', egpIndex: 0,
      min: 1, max: 60, default: 12, service: true, editable: false },
    { key: 'photo', label_ru: 'Фото', type: 'media', egpName: 'Фото', egpIndex: 5 },
    { key: 'ae_only', label_ru: 'Только AE', type: 'checkbox', egpName: 'Только AE', egpIndex: 6, default: false, hosts: ['ae'] },
    { key: 'local', label_ru: 'Без EGP', type: 'checkbox', default: true },
  ];
  return { ...item('LOGO_Mark'), fields };
}

describe('defaults', () => {
  it('takes the library defaults: 1-based dropdowns, Cyrillic text, booleans', () => {
    expect(defaults(item('TTL_LowerThird'))).toEqual({
      name: 'Имя Фамилия', role1: 'Должность', role2: '', style: 1, side: 1, speed: 2, size: 2,
    });
    expect(defaults(item('LOGO_Mark'))).toEqual({ plate: true, theme: 2, background: 1, speed: 2 });
  });
  it('falls back by type when a field has no default; media stays empty', () => {
    expect(defaults(odd())).toEqual({ title: '', on: false, pick: 1, amount: 10, duration: 12, ae_only: false, local: true });
  });
  it('starts a dropdown at 1 and a slider at 0 when the library gives no options and no minimum', () => {
    expect(defaultOf({ key: 'd', label_ru: 'Д', type: 'dropdown' })).toBe(1);
    expect(defaultOf({ key: 's', label_ru: 'С', type: 'slider' })).toBe(0);
  });
});

describe('isEditable', () => {
  const field = (over: Partial<Field>): Field => ({ key: 'k', label_ru: 'К', type: 'text', ...over });
  it('is true unless the field is a service field or is marked not editable', () => {
    for (const over of [{}, { editable: true }, { service: false }]) expect(isEditable(field(over)), JSON.stringify(over)).toBe(true);
    for (const over of [{ service: true }, { editable: false }, { service: true, editable: false }]) {
      expect(isEditable(field(over)), JSON.stringify(over)).toBe(false);
    }
  });
});

describe('merge', () => {
  it('keeps remembered values of a valid type and option, drops the rest', () => {
    const remembered = {
      name: 'Анна-Мария Ёлкина', role1: 42, role2: 'я'.repeat(51), style: 3, side: 5, speed: '3', size: 2.5, gone: 'x',
    };
    expect(merge(remembered, item('TTL_LowerThird'))).toEqual({
      name: 'Анна-Мария Ёлкина', role1: 'Должность', role2: '', style: 3, side: 1, speed: 2, size: 2,
    });
  });
  it('keeps a checkbox only as a boolean', () => {
    expect(merge({ plate: false }, item('LOGO_Mark')).plate).toBe(false);
    expect(merge({ plate: 0 }, item('LOGO_Mark')).plate).toBe(true);
  });
  it('keeps a remembered media path as text only', () => {
    expect(merge({ photo: 'C:/Media/a.png' }, odd()).photo).toBe('C:/Media/a.png');
    expect(merge({ photo: 5 }, odd())).not.toHaveProperty('photo');
  });
  it('never takes a remembered value for a service field, and checks slider ranges', () => {
    expect(merge({ duration: 30, amount: 50 }, odd())).toMatchObject({ duration: 12, amount: 50 });
    expect(merge({ amount: 95 }, odd()).amount).toBe(10);
  });
  it('returns the defaults for anything that is not a record', () => {
    const ttl = item('TTL_LowerThird');
    for (const bad of [null, undefined, 'x', 7, ['Анна']]) expect(merge(bad, ttl)).toEqual(defaults(ttl));
  });
});

describe('validateValues', () => {
  it('passes the defaults of every pack-1 item', () => {
    for (const id of ['LOGO_Shot', 'LOGO_Mark', 'TTL_LowerThird']) expect(validateValues(item(id), defaults(item(id)))).toEqual([]);
  });
  it('counts Cyrillic by characters and flags text over maxLen', () => {
    const ttl = item('TTL_LowerThird');
    expect(validateValues(ttl, { ...defaults(ttl), name: 'Ё'.repeat(40) })).toEqual([]);
    expect(validateValues(ttl, { ...defaults(ttl), name: 'Ё'.repeat(41) })).toEqual([
      { code: 'FIELD_TOO_LONG', level: 'error', params: { field: 'Имя', key: 'name', max: 40, len: 41 } },
    ]);
  });
  it('flags a dropdown outside 1..n and values of the wrong type', () => {
    const ttl = item('TTL_LowerThird');
    const issues = validateValues(ttl, { ...defaults(ttl), style: 0, side: 3, speed: 2.5, size: '2', role1: 7 });
    expect(issues).toEqual([
      { code: 'FIELD_INVALID', level: 'error', params: { field: 'Должность', key: 'role1', value: '7' } },
      { code: 'FIELD_INVALID', level: 'error', params: { field: 'Стиль', key: 'style', value: '0' } },
      { code: 'FIELD_INVALID', level: 'error', params: { field: 'Сторона', key: 'side', value: '3' } },
      { code: 'FIELD_INVALID', level: 'error', params: { field: 'Скорость', key: 'speed', value: '2.5' } },
      { code: 'FIELD_INVALID', level: 'error', params: { field: 'Размер текста', key: 'size', value: '2' } },
    ]);
    expect(validateValues(item('LOGO_Mark'), { plate: 'true' })).toEqual([
      { code: 'FIELD_INVALID', level: 'error', params: { field: 'Подложка', key: 'plate', value: 'true' } },
    ]);
  });
  it('uses the default of a missing key and skips service and media fields', () => {
    expect(validateValues(item('TTL_LowerThird'), {})).toEqual([]);
    expect(validateValues(odd(), { duration: 999, photo: 5 })).toEqual([]);
  });
  it('holds a slider to its range, ends included, and refuses a number that is not finite', () => {
    const it2 = odd(); // amount: 10..90
    const codes = (amount: number) => validateValues(it2, { ...defaults(it2), amount }).map((i) => i.code);
    for (const ok of [10, 50, 90]) expect(codes(ok), String(ok)).toEqual([]);
    for (const bad of [9.99, 90.01, Number.NaN, Number.POSITIVE_INFINITY]) expect(codes(bad), String(bad)).toEqual(['FIELD_INVALID']);
  });
  it('refuses a dropdown value when the field lists no options', () => {
    const noOptions: Item = { ...item('LOGO_Mark'), fields: [{ key: 'pick', label_ru: 'Вариант', type: 'dropdown', egpName: 'Вариант', egpIndex: 0 }] };
    expect(validateValues(noOptions, { pick: 1 }).map((i) => i.code)).toEqual(['FIELD_INVALID']);
  });
});

describe('toWrites', () => {
  const ttl = item('TTL_LowerThird');
  const values = { ...defaults(ttl), name: 'Анна-Мария Ёлкина', style: 3, speed: 5 };

  it('maps TTL for Premiere: egpIndex order, dropdowns 0-based, text as is', () => {
    expect(toWrites(ttl, values, 'pr')).toEqual([
      { egpName: 'Имя', type: 'text', value: 'Анна-Мария Ёлкина' },
      { egpName: 'Должность', type: 'text', value: 'Должность' },
      { egpName: 'Должность, 2-я строка', type: 'text', value: '' },
      { egpName: 'Стиль', type: 'dropdown', value: 2 },
      { egpName: 'Сторона', type: 'dropdown', value: 0 },
      { egpName: 'Скорость', type: 'dropdown', value: 4 },
      { egpName: 'Размер текста', type: 'dropdown', value: 1 },
    ]);
  });
  it('keeps AE dropdowns 1-based, as in the library', () => {
    expect(toWrites(ttl, values, 'ae').map((w) => w.value)).toEqual(['Анна-Мария Ёлкина', 'Должность', '', 3, 1, 5, 2]);
  });
  it('writes a checkbox as 1/0 in both hosts', () => {
    const mark = item('LOGO_Mark');
    for (const host of ['pr', 'ae'] as const) {
      expect(toWrites(mark, defaults(mark), host)[0]).toEqual({ egpName: 'Подложка', type: 'checkbox', value: 1 });
      expect(toWrites(mark, { ...defaults(mark), plate: false }, host)[0]).toEqual({ egpName: 'Подложка', type: 'checkbox', value: 0 });
    }
  });
  it('follows egpIndex, not the order of the fields in the library', () => {
    const shot = item('LOGO_Shot');
    const reversed: Item = { ...shot, fields: [...(shot.fields ?? [])].reverse() };
    expect(toWrites(reversed, defaults(reversed), 'pr').map((w) => w.egpName)).toEqual(['Подпись', 'Тема', 'Фон', 'Скорость']);
  });
  it('keeps the library order of fields that have no egpIndex, after those that have one', () => {
    const named = (n: string, egpIndex?: number): Field => (
      egpIndex === undefined ? { key: n, label_ru: n, type: 'text', egpName: n } : { key: n, label_ru: n, type: 'text', egpName: n, egpIndex }
    );
    const loose: Item = { ...item('LOGO_Mark'), fields: [named('c'), named('a'), named('d', 0), named('b')] };
    expect(toWrites(loose, {}, 'pr').map((w) => w.egpName)).toEqual(['d', 'c', 'a', 'b']);
  });
  it('skips fields the panel does not fill: other host, service, not editable, media, no egpName', () => {
    const it2 = odd();
    expect(toWrites(it2, { ...defaults(it2), title: 'Заголовок А', on: true, pick: 2, amount: 55 }, 'pr')).toEqual([
      { egpName: 'Сила', type: 'slider', value: 55 },
      { egpName: 'Вариант', type: 'dropdown', value: 1 },
      { egpName: 'Показать', type: 'checkbox', value: 1 },
      { egpName: 'Заголовок', type: 'text', value: 'Заголовок А' },
    ]);
    expect(toWrites(it2, defaults(it2), 'ae').map((w) => w.egpName)).toEqual(['Сила', 'Вариант', 'Показать', 'Заголовок', 'Только AE']);
    const fields = it2.fields ?? [];
    expect(fields.filter((f) => filledByPanel(f, 'pr')).map((f) => f.key)).toEqual(['title', 'on', 'pick', 'amount']);
  });
});

describe('sameValue', () => {
  it('reads a Premiere checkbox back as a boolean', () => {
    expect(sameValue('pr', 'checkbox', 1, true)).toBe(true);
    expect(sameValue('pr', 'checkbox', 0, false)).toBe(true);
    expect(sameValue('pr', 'checkbox', 1, false)).toBe(false);
  });
  it('reads an AE checkbox back as 0/1', () => {
    expect(sameValue('ae', 'checkbox', 1, 1)).toBe(true);
    expect(sameValue('ae', 'checkbox', 0, '0')).toBe(true);
    expect(sameValue('ae', 'checkbox', 0, 1)).toBe(false);
    expect(sameValue('ae', 'checkbox', 1, 'yes')).toBe(false);
    expect(sameValue('ae', 'checkbox', 0, 'yes')).toBe(false); // an unreadable value is no "off" either
  });
  it('reads a checkbox that comes back as a string', () => {
    expect(sameValue('ae', 'checkbox', 1, '1')).toBe(true);
    expect(sameValue('pr', 'checkbox', 1, 'true')).toBe(true);
    expect(sameValue('pr', 'checkbox', 0, 'false')).toBe(true);
    expect(sameValue('pr', 'checkbox', 1, 'false')).toBe(false);
  });
  it('compares numbers that come back as strings', () => {
    expect(sameValue('pr', 'dropdown', 2, '2')).toBe(true);
    expect(sameValue('pr', 'dropdown', 0, 0)).toBe(true);
    expect(sameValue('ae', 'dropdown', 3, '2')).toBe(false);
    expect(sameValue('pr', 'dropdown', 0, '')).toBe(false);
    expect(sameValue('ae', 'slider', 15, 15.0000001)).toBe(true);
    expect(sameValue('ae', 'slider', 15, '16')).toBe(false);
  });
  it('allows a microunit of slack on a slider, none on a dropdown', () => {
    expect(sameValue('ae', 'slider', 15, 15.0000005)).toBe(true);
    expect(sameValue('ae', 'slider', 15, 15.000005)).toBe(false);
    expect(sameValue('pr', 'dropdown', 2, 2.0000005)).toBe(false);
  });
  it('is not fooled by the words "null" and "undefined" as the text of a missing read-back', () => {
    expect(sameValue('pr', 'text', 'null', null)).toBe(false);
    expect(sameValue('pr', 'text', 'undefined', undefined as unknown as null)).toBe(false);
  });
  it('compares text exactly, Cyrillic included', () => {
    expect(sameValue('pr', 'text', 'Анна-Мария Ёлкина', 'Анна-Мария Ёлкина')).toBe(true);
    expect(sameValue('ae', 'text', 'Ёлкина', 'Елкина')).toBe(false);
    expect(sameValue('pr', 'text', 'Имя', 'Имя ')).toBe(false);
    expect(sameValue('pr', 'text', '', '')).toBe(true);
  });
  it('never accepts a missing read-back', () => {
    for (const type of ['text', 'dropdown', 'checkbox', 'slider', 'media'] as const) {
      expect(sameValue('pr', type, type === 'text' ? '' : 0, null)).toBe(false);
    }
  });
});
