import { describe, it, expect } from 'vitest';
import { message, MESSAGES, PARAMS } from '../../../panel/src/core/errors';
import type { Issue } from '../../../panel/src/core/types';
import { BRIDGE_CODES } from '../../../panel/src/bridge/host';

// Plan 2026-10-05, "Коды ошибок", plus the codes the core, the bridge and the adapters add.
const PLAN_CODES = [
  'NO_TARGET', 'PROJECT_NOT_SAVED', 'FONT_MISSING', 'FONT_BUILD', 'HOST_TOO_OLD', 'PLUGIN_TOO_OLD', 'NO_VARIANT',
  'FPS_MISMATCH', 'PATH_TOO_LONG', 'LENGTH_TOO_SHORT',
  'NO_FREE_TRACK', 'TARGET_CHANGED', 'TEMPLATE_NOT_FOUND', 'TEMPLATE_DUPLICATE', 'INSERT_FAILED', 'READBACK_MISMATCH',
  'TIMEOUT', 'ADAPTER_LOAD', 'HOST_EXCEPTION', 'LIBRARY_MISSING', 'LIBRARY_INVALID', 'FILE_MISSING',
];
const EXTRA_CODES = [
  'FIELD_TOO_LONG', 'FIELD_INVALID', 'FONT_CHECK_FAILED', 'TIMEOUT_LANDED', 'INSERT_UNCONFIRMED',
  'HOST_EMPTY', 'HOST_EVAL_ERROR', 'HOST_BAD_REPLY', 'HOST_BRIDGE_ERROR', 'UNKNOWN_FN', 'BAD_ARGS',
  // the adapters: AE refuses a target inside the BrandKit bin, Premiere warns about a clip named unlike its template
  'TARGET_IS_TEMPLATE', 'NAME_MISMATCH',
];

const SAMPLE: Record<string, string | number> = {
  font: 'SBSansDisplay-Bold', need: '26.5', have: '26.0', frame: '2560×1440', nearest: '16x9', template: 25, target: 29.97,
  length: 260, max: 40, min: 4.24, fields: 'Имя, Стиль', detail: 'x is undefined', line: 12, path: 'C:/ProgramData/CloudRuBrandKit/library',
  details: 'schema: /items/0 unknown property "colour"', count: 1, file: 'items/LOGO_Shot/LOGO_Shot_v1.aep', field: 'Должность, 2-я строка',
  key: 'role2', len: 51, value: '0',
};
const paramsFor = (code: string) => Object.fromEntries((PARAMS[code] ?? []).map((p) => [p, SAMPLE[p] ?? 'X']));
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
// A text that reads as a whole sentence: nothing of the template syntax left, no hole where a param was.
const whole = (text: string) => {
  expect(text).not.toMatch(/[{}[\]|]/);
  expect(text).not.toContain('undefined');
  expect(text).not.toMatch(/ {2}| [.,:;)]|\( |«»|\(\)/);
  expect(text).toMatch(/^[А-ЯЁ]/);
};

describe('error texts', () => {
  it('has a Russian text and documented params for every code', () => {
    for (const code of [...PLAN_CODES, ...EXTRA_CODES]) {
      expect(MESSAGES[code], code).toMatch(/[А-Яа-яЁё]/);
      expect(PARAMS[code], code).toBeDefined();
    }
    expect(Object.keys(PARAMS).sort()).toEqual(Object.keys(MESSAGES).sort());
  });
  it('has a text for every code the bridge makes itself (panel/src/bridge/host.ts lists them)', () => {
    expect(BRIDGE_CODES.length).toBeGreaterThan(0);
    for (const code of BRIDGE_CODES) expect(MESSAGES[code], code).toMatch(/[А-Яа-яЁё]/);
  });
  it('uses only documented params, and fills every one of them', () => {
    for (const code of Object.keys(MESSAGES)) {
      for (const p of placeholders(MESSAGES[code]!)) expect(PARAMS[code], `${code} {${p}}`).toContain(p);
      const text = message({ code, level: 'error', params: paramsFor(code) });
      expect(text, code).not.toMatch(/[{}[\]|]/);
      expect(text, code).not.toContain('undefined');
    }
  });
  it('keeps every param inside an optional part, so a text never shows a hole', () => {
    for (const code of Object.keys(MESSAGES)) {
      expect(MESSAGES[code]!.replace(/\[[^\]]*\]/g, ''), code).not.toMatch(/[{}]/);
    }
  });
  it('reads as a whole sentence with no params, and with any one param missing (a host error carries only detail and line)', () => {
    for (const code of Object.keys(MESSAGES)) {
      whole(message({ code, level: 'error' }));
      whole(message({ code, level: 'error', params: {} }));
      whole(message({ code, level: 'error', params: { detail: 'SBSansText-Regular', line: 3 } }));
      const full = paramsFor(code);
      for (const p of Object.keys(full)) {
        const { [p]: _, ...rest } = full;
        whole(message({ code, level: 'error', params: rest }));
      }
    }
    expect(message({ code: 'FONT_MISSING', level: 'error', params: { detail: 'SBSansText-Regular' } }))
      .toBe('Не установлен шрифт. Установите SB Sans по инструкции и перезапустите приложение.');
    expect(message({ code: 'LENGTH_TOO_SHORT', level: 'error' })).toBe('Слишком короткая длительность.');
    expect(message({ code: 'READBACK_MISMATCH', level: 'warning' }))
      .toBe('Шаблон вставлен, но не прочитались назад поля. Проверьте их в Properties или отмените вставку.');
  });
  it('gives the other wording of [part|other] when a param of the part is missing', () => {
    expect(message({ code: 'HOST_TOO_OLD', level: 'error', params: { need: '26.5.3', have: '26.5.2' } }))
      .toBe('Шаблону нужна версия приложения 26.5.3 или новее, у вас 26.5.2.');
    expect(message({ code: 'HOST_TOO_OLD', level: 'error', params: { need: '26.5.3' } })).toBe('Шаблону нужна версия приложения новее вашей.');
    expect(message({ code: 'NO_VARIANT', level: 'error' })).toBe('Нет варианта под этот кадр.');
    expect(message({ code: 'FIELD_TOO_LONG', level: 'error', params: { field: 'Имя' } })).toBe('Поле «Имя» длиннее допустимого.');
  });
  it('takes a param set to undefined or null as missing', () => {
    const params = { font: undefined, need: null } as unknown as Record<string, string>;
    expect(message({ code: 'FONT_MISSING', level: 'error', params })).not.toContain('undefined');
    expect(message({ code: 'PLUGIN_TOO_OLD', level: 'error', params: { ...params, have: '0.1.0' } }))
      .toBe('Библиотеке нужна панель BrandKit новее вашей. Обновите панель.');
  });
  it('says what the spec example says for NO_VARIANT, with the multiplication sign', () => {
    expect(message({ code: 'NO_VARIANT', level: 'error', params: { frame: '2560×1440', nearest: '16x9' } }))
      .toBe('Нет варианта под кадр 2560×1440. Ближайший — 16x9, его можно выбрать вручную в чипе формата.');
  });
  it('drops an optional part whose param is missing or empty', () => {
    expect(message({ code: 'NO_VARIANT', level: 'error', params: { frame: '2560×1440' } })).toBe('Нет варианта под кадр 2560×1440.');
    expect(message({ code: 'NO_VARIANT', level: 'error', params: { frame: '2560×1440', nearest: '' } }))
      .toBe('Нет варианта под кадр 2560×1440.');
    expect(message({ code: 'HOST_EXCEPTION', level: 'error' })).not.toContain('строка');
    expect(message({ code: 'HOST_EXCEPTION', level: 'error', params: { line: 12 } })).toContain('(строка 12)');
    expect(message({ code: 'HOST_EXCEPTION', level: 'error', params: { line: 0 } })).toContain('(строка 0)');
  });
  it('writes numbers with a decimal comma', () => {
    expect(message({ code: 'LENGTH_TOO_SHORT', level: 'error', params: { min: 4.24 } })).toContain('4,24 с');
    expect(message({ code: 'FPS_MISMATCH', level: 'warning', params: { template: 25, target: 29.97 } }))
      .toContain('25 к/с, а у цели 29,97 к/с');
    expect(message({ code: 'LENGTH_TOO_SHORT', level: 'error', params: { min: 4.266667 } })).toContain('4,267 с');
  });
  it('quotes Cyrillic field names', () => {
    expect(message({ code: 'FIELD_TOO_LONG', level: 'error', params: { field: 'Должность, 2-я строка', key: 'role2', max: 50, len: 51 } }))
      .toBe('Поле «Должность, 2-я строка» длиннее 50 символов (сейчас 51).');
    expect(message({ code: 'READBACK_MISMATCH', level: 'warning', params: { fields: 'Имя, Стиль' } })).toContain('Имя, Стиль');
  });
  it('tells the user what to do about the adapter refusals and the unsettled inserts', () => {
    expect(message({ code: 'TARGET_IS_TEMPLATE', level: 'error' }))
      .toBe('Эту композицию нельзя менять: она из библиотеки BrandKit. Откройте свою композицию.');
    // like HOST_EMPTY: the panel cannot reach the app yet
    expect(message({ code: 'HOST_BRIDGE_ERROR', level: 'error', params: { detail: 'insertItem: evalScript threw' } }))
      .toBe('Панель пока не может связаться с приложением. Подождите несколько секунд и повторите.');
    expect(message({ code: 'NAME_MISMATCH', level: 'warning' })).toMatch(/^Шаблон вставлен/);
    expect(message({ code: 'INSERT_UNCONFIRMED', level: 'error' })).toContain('прежде чем вставлять снова');
    expect(message({ code: 'FONT_CHECK_FAILED', level: 'error' })).not.toContain('Не установлен');
  });
  it('still says something useful for an unknown code', () => {
    const text = message({ code: 'WEIRD_THING', level: 'error' });
    expect(text).toContain('WEIRD_THING');
    expect(text).toMatch(/[А-Яа-я]/);
    whole(text);
  });
  it('takes a code as an own key: names off Object.prototype are unknown codes, not functions', () => {
    for (const code of ['constructor', 'toString', 'hasOwnProperty', '__proto__', 'valueOf']) {
      expect(message({ code, level: 'error' }), code)
        .toBe(`Непредвиденная ошибка ${code}. Скопируйте диагностику и передайте разработчикам.`);
    }
  });
  it('leaves no hole in the sentence for a missing or empty code', () => {
    const none = 'Непредвиденная ошибка. Скопируйте диагностику и передайте разработчикам.';
    expect(message({ code: '', level: 'error' })).toBe(none);
    expect(message({ level: 'error' } as Issue)).toBe(none); // a JS producer that forgot the code
  });
});
