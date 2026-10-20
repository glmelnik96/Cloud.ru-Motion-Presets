// The Premiere acceptance (tools/masters/pr-check.mjs) compares AE renders with Premiere's frames: both must
// show the same clip, so the AE render starts from the template's defaults like a Premiere clip does, and
// AE's premultiplied PNG colour is unmatted first.
import { describe, expect, it } from 'vitest';
import { withDefaults } from '../../tools/masters/package.mjs';
import { prValues, unmatte } from '../../tools/masters/pr-check.mjs';

const PARAMS = {
  ctrl: { Style: { label: 'Стиль', items: ['Подкаст', 'SMM'], value: 1 }, Size: { label: 'Размер текста', items: ['80 %', '100 %'], value: 2 } },
  text: { TXT_1: { value: 'Текст на плашке', label: 'Строка 1' }, TXT_2: { value: '', label: 'Строка 2' } },
};

describe('Premiere acceptance', () => {
  it('a clip that leaves a control out renders it at the default, not at the previous clip value', () => {
    expect(withDefaults(PARAMS, { Style: 2 }, { TXT_2: 'Вторая' })).toEqual({
      ctrl: { Style: 2, Size: 2 },
      text: { TXT_1: 'Текст на плашке', TXT_2: 'Вторая' },
    });
    expect(prValues({ Style: 2, Size: 2 }, PARAMS)).toEqual({ 'Стиль': 1, 'Размер текста': 1 });
  });

  it('AE colour premultiplied by alpha becomes straight, opaque and empty pixels stay', () => {
    const img = { width: 3, height: 1, data: Buffer.from([17, 91, 54, 112, 38, 208, 124, 255, 0, 0, 0, 0]) };
    expect([...unmatte(img).data]).toEqual([39, 207, 123, 112, 38, 208, 124, 255, 0, 0, 0, 0]);
    expect([...img.data.slice(0, 4)]).toEqual([17, 91, 54, 112]);
  });
});
