import { describe, it, expect } from 'vitest';
import {
  buildForm, clampSeconds, DURATION_STEP, formatSeconds, parseSeconds, stepSeconds, type Control,
} from '../../../panel/src/ui/form';
import { defaults, merge } from '../../../panel/src/core/fields';
import { defaultLen, minLen } from '../../../panel/src/core/duration';
import type { Field, Item } from '../../../panel/src/core/types';
import { item } from '../core/fixture';

const TTL = (): Item => item('TTL_LowerThird');
const SHOT = (): Item => item('LOGO_Shot');
const MARK = (): Item => item('LOGO_Mark');
const controlOf = (controls: Control[], key: string): Control => {
  const c = controls.find((x) => x.key === key);
  if (!c) throw new Error('no control ' + key);
  return c;
};
const withFields = (it: Item, fields: Field[]): Item => ({ ...it, fields });

describe('buildForm: the controls', () => {
  it('has a control per field, in the order of the library, typed by the field', () => {
    const form = buildForm(TTL(), 'pr', defaults(TTL()), defaultLen(TTL()));
    expect(form.controls.map((c) => [c.key, c.kind])).toEqual([
      ['name', 'text'], ['role1', 'text'], ['role2', 'text'],
      ['style', 'segments'], ['side', 'segments'], ['speed', 'segments'], ['size', 'segments'],
    ]);
    expect(form.controls.map((c) => c.label)).toEqual([
      'Имя', 'Должность', 'Должность, 2-я строка', 'Стиль', 'Сторона', 'Скорость', 'Размер текста',
    ]);
    expect(form.controls.every((c) => !c.disabled)).toBe(true);
  });

  it('shows a text with its limit and a counter', () => {
    const form = buildForm(TTL(), 'pr', { ...defaults(TTL()), name: 'Анна-Мария Ёлкина' }, 6);
    expect(controlOf(form.controls, 'name')).toMatchObject({
      kind: 'text', value: 'Анна-Мария Ёлкина', maxLen: 40, counter: '17/40', level: 'ok',
    });
    // the second line of the role is empty by default
    expect(controlOf(form.controls, 'role2')).toMatchObject({ kind: 'text', value: '', maxLen: 50, counter: '0/50', level: 'ok' });
  });

  it('warns when the text nears its limit and flags it past the limit', () => {
    const near = buildForm(TTL(), 'pr', { ...defaults(TTL()), name: 'я'.repeat(36) }, 6);
    expect(controlOf(near.controls, 'name')).toMatchObject({ counter: '36/40', level: 'near' });
    const full = buildForm(TTL(), 'pr', { ...defaults(TTL()), name: 'я'.repeat(40) }, 6);
    expect(controlOf(full.controls, 'name')).toMatchObject({ counter: '40/40', level: 'near' });
    const over = buildForm(TTL(), 'pr', { ...defaults(TTL()), name: 'я'.repeat(41) }, 6);
    expect(controlOf(over.controls, 'name')).toMatchObject({ counter: '41/40', level: 'over' });
  });

  it('shows a dropdown of up to five options as segments with the 1-based index of the option', () => {
    const style = controlOf(buildForm(TTL(), 'pr', defaults(TTL()), 6).controls, 'style');
    expect(style).toEqual({
      kind: 'segments', key: 'style', label: 'Стиль', disabled: false, value: 1, layout: 'row',
      options: [{ index: 1, label: 'Титры' }, { index: 2, label: 'Подкаст' }, { index: 3, label: 'Вебинар' }],
    });
    const speed = controlOf(buildForm(TTL(), 'ae', defaults(TTL()), 6).controls, 'speed');
    expect(speed).toMatchObject({ kind: 'segments', value: 2 });
    expect(speed.kind === 'segments' && speed.options.map((o) => o.label)).toEqual(['0,75×', '1×', '1,25×', '1,5×', '2×']);
  });

  it('puts a dropdown of more than five options in a list', () => {
    const six = withFields(TTL(), [{
      key: 'color', label_ru: 'Цвет', type: 'dropdown', egpName: 'Цвет', egpIndex: 0, default: 1,
      options: ['а', 'б', 'в', 'г', 'д', 'е'].map((label_ru, i) => ({ index: i + 1, label_ru })),
    }]);
    expect(buildForm(six, 'pr', defaults(six), 6).controls[0]).toMatchObject({ kind: 'select', value: 1 });
  });

  it('stacks segments whose labels would not fit a row', () => {
    const caption = controlOf(buildForm(SHOT(), 'pr', defaults(SHOT()), 5).controls, 'caption');
    expect(caption).toMatchObject({ kind: 'segments', layout: 'stack', value: 1 });
    // short labels stay in a row, even three of the longest the pack has («Прозрачный»)
    expect(controlOf(buildForm(SHOT(), 'pr', defaults(SHOT()), 5).controls, 'background')).toMatchObject({ layout: 'row' });
  });

  it('shows a checkbox with its value', () => {
    const plate = controlOf(buildForm(MARK(), 'pr', defaults(MARK()), 4).controls, 'plate');
    expect(plate).toEqual({ kind: 'checkbox', key: 'plate', label: 'Подложка', disabled: false, value: true });
    const off = controlOf(buildForm(MARK(), 'pr', { ...defaults(MARK()), plate: false }, 4).controls, 'plate');
    expect(off).toMatchObject({ value: false });
  });

  it('falls back to the default of the field for a missing or unusable value', () => {
    const form = buildForm(TTL(), 'pr', { name: 'Иван', style: 9, side: 'left' as unknown as number }, 6);
    expect(controlOf(form.controls, 'name')).toMatchObject({ value: 'Иван' });
    expect(controlOf(form.controls, 'style')).toMatchObject({ value: 1 });
    expect(controlOf(form.controls, 'side')).toMatchObject({ value: 1 });
    expect(controlOf(form.controls, 'role1')).toMatchObject({ value: 'Должность' });
    expect(controlOf(form.controls, 'speed')).toMatchObject({ value: 2 });
  });

  it('shows the values the panel remembered for the item', () => {
    const ttl = TTL();
    const remembered = { name: 'Пётр Сидоров', style: 3, side: 2, gone: 'x', size: 99 };
    const form = buildForm(ttl, 'pr', merge(remembered, ttl), defaultLen(ttl));
    expect(controlOf(form.controls, 'name')).toMatchObject({ value: 'Пётр Сидоров' });
    expect(controlOf(form.controls, 'style')).toMatchObject({ value: 3 });
    expect(controlOf(form.controls, 'side')).toMatchObject({ value: 2 });
    // a remembered option that is out of range is dropped by merge, so the default shows
    expect(controlOf(form.controls, 'size')).toMatchObject({ value: 2 });
  });
});

describe('buildForm: fields the panel does not fill', () => {
  const extra: Field[] = [
    { key: 'title', label_ru: 'Заголовок', type: 'text', egpName: 'Заголовок', egpIndex: 0, maxLen: 30, default: 'Привет' },
    { key: 'only_ae', label_ru: 'Только AE', type: 'checkbox', egpName: 'Только AE', egpIndex: 1, default: false, hosts: ['ae'] },
    { key: 'photo', label_ru: 'Фото', type: 'media', egpName: 'Фото', egpIndex: 2, accepts: ['photo'] } as unknown as Field,
    { key: 'len', label_ru: 'Длина', type: 'slider', egpName: 'Длина', egpIndex: 3, min: 0, max: 10, default: 5, service: true, editable: false },
  ];
  const extended = (): Item => withFields(TTL(), extra);

  it('shows them, off, with the hint to fill them in Properties', () => {
    const form = buildForm(extended(), 'pr', defaults(extended()), 6);
    expect(controlOf(form.controls, 'only_ae')).toMatchObject({
      kind: 'checkbox', disabled: true, hint: 'Заполните в Properties после вставки.', value: false,
    });
    expect(controlOf(form.controls, 'photo')).toMatchObject({ kind: 'media', disabled: true, hint: 'Файл добавляется в Properties после вставки.' });
    // in the host that fills it, the same field is a live control
    expect(controlOf(buildForm(extended(), 'ae', defaults(extended()), 6).controls, 'only_ae')).toMatchObject({ disabled: false });
    expect(controlOf(form.controls, 'title')).toMatchObject({ disabled: false });
    expect(controlOf(form.controls, 'title').hint).toBeUndefined();
  });

  it('never shows a service field', () => {
    expect(buildForm(extended(), 'pr', defaults(extended()), 6).controls.map((c) => c.key)).toEqual(['title', 'only_ae', 'photo']);
  });

  it('switches a field off while the checkbox that enables it is off', () => {
    const gated = withFields(TTL(), [
      { key: 'timer', label_ru: 'Таймер', type: 'checkbox', egpName: 'Таймер', egpIndex: 0, default: false },
      { key: 'minutes', label_ru: 'Минуты', type: 'text', egpName: 'Минуты', egpIndex: 1, maxLen: 3, default: '5', enabledBy: 'timer' },
    ]);
    const off = buildForm(gated, 'pr', defaults(gated), 6);
    expect(controlOf(off.controls, 'minutes')).toMatchObject({ disabled: true, hint: 'Включите «Таймер».' });
    const on = buildForm(gated, 'pr', { ...defaults(gated), timer: true }, 6);
    expect(controlOf(on.controls, 'minutes')).toMatchObject({ disabled: false });
    expect(controlOf(on.controls, 'minutes').hint).toBeUndefined();
  });

  it('shows a slider as a number with its range', () => {
    const slider = withFields(TTL(), [{ key: 'size', label_ru: 'Размер', type: 'slider', egpName: 'Размер', egpIndex: 0, min: 50, max: 150, default: 100 }]);
    expect(buildForm(slider, 'pr', defaults(slider), 6).controls[0]).toEqual({
      kind: 'number', key: 'size', label: 'Размер', disabled: false, value: 100, min: 50, max: 150, step: 1,
    });
  });
});

describe('buildForm: the duration', () => {
  it('is a control for a T1 item that fits by remap, with the minimum and the default of the item', () => {
    const ttl = TTL();
    const form = buildForm(ttl, 'pr', defaults(ttl), 8);
    expect(form.duration).toEqual({
      label: 'Длительность, с', value: 8, text: '8', min: 4.2, default: 6, step: 0.04, tooShort: false,
      hint: 'Минимум 4,2 с, по умолчанию 6 с',
    });
    expect(form.duration?.min).toBe(minLen(ttl));
    expect(form.duration?.default).toBe(defaultLen(ttl));
    expect(DURATION_STEP).toBe(0.04);
  });

  it('knows the length of each item of the pack', () => {
    expect(buildForm(SHOT(), 'ae', defaults(SHOT()), 5).duration).toMatchObject({ min: 4.24, default: 5, text: '5' });
    expect(buildForm(MARK(), 'ae', defaults(MARK()), 4).duration).toMatchObject({ min: 3.76, default: 4, text: '4' });
  });

  it('says when the length is under the minimum', () => {
    expect(buildForm(TTL(), 'pr', defaults(TTL()), 4).duration).toMatchObject({ value: 4, tooShort: true });
    expect(buildForm(TTL(), 'pr', defaults(TTL()), 4.2).duration).toMatchObject({ tooShort: false });
    expect(buildForm(TTL(), 'pr', defaults(TTL()), Number.NaN).duration).toMatchObject({ tooShort: true, text: '' });
  });

  it('is not a control when the item does not fit by remap or has no length', () => {
    expect(buildForm({ ...TTL(), fit: 'trim' }, 'pr', defaults(TTL()), 6).duration).toBeNull();
    const bare: Item = { ...TTL() };
    delete bare.duration;
    expect(buildForm(bare, 'pr', defaults(bare), 0).duration).toBeNull();
  });
});

describe('seconds', () => {
  it('writes seconds with a decimal comma and at most two decimals', () => {
    expect(formatSeconds(5)).toBe('5');
    expect(formatSeconds(4.5)).toBe('4,5');
    expect(formatSeconds(4.24)).toBe('4,24');
    expect(formatSeconds(2.84 + 0.76 + 1.4)).toBe('5');
    expect(formatSeconds(6.04)).toBe('6,04');
    expect(formatSeconds(0.1 + 0.2)).toBe('0,3');
    expect(formatSeconds(Number.NaN)).toBe('');
    expect(formatSeconds(Number.POSITIVE_INFINITY)).toBe('');
  });

  it('reads seconds typed with a comma or a point', () => {
    expect(parseSeconds('8')).toBe(8);
    expect(parseSeconds('4,5')).toBe(4.5);
    expect(parseSeconds('4.5')).toBe(4.5);
    expect(parseSeconds('  12,04 ')).toBe(12.04);
    expect(parseSeconds('0,5')).toBe(0.5);
    expect(parseSeconds('.5')).toBe(0.5);
  });

  it('reads nothing from what is not a length', () => {
    for (const text of ['', ' ', 'abc', '4,5,6', '-3', '1e3', '4 с', '∞', '0x10', '4,']) expect(parseSeconds(text)).toBeNull();
  });

  it('steps by one frame at 25 fps and never under the minimum', () => {
    const ttl = TTL();
    expect(stepSeconds(ttl, 6, 1)).toBe(6.04);
    expect(stepSeconds(ttl, 6, -1)).toBe(5.96);
    expect(stepSeconds(ttl, 4.22, -1)).toBe(4.2);
    expect(stepSeconds(ttl, 4.2, -1)).toBe(4.2);
    expect(stepSeconds(ttl, Number.NaN, 1)).toBe(6.04); // from the default
  });

  it('keeps a length at or above the minimum', () => {
    const ttl = TTL();
    expect(clampSeconds(ttl, 3)).toBe(4.2);
    expect(clampSeconds(ttl, 4.2)).toBe(4.2);
    expect(clampSeconds(ttl, 8)).toBe(8);
    expect(clampSeconds(ttl, Number.NaN)).toBe(6);
  });
});
