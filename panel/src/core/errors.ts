// Russian texts for issue codes (spec 8.2: the user reads plain Russian, the log keeps the code). In a text, {name}
// takes a param; a [bracketed part] is dropped when a param inside it is missing, empty or null, and [part|other]
// gives the other wording then. Every param sits in such a part (test), so a text never shows a hole: errors from
// the host reach message() with only detail (the host's message) and line, whatever params the code documents.
// Numbers get a decimal comma.
import type { Issue } from './types';

type Params = NonNullable<Issue['params']>;

export const MESSAGES: Readonly<Record<string, string>> = {
  // before the insert
  NO_TARGET: 'Нет активной композиции или секвенции. Откройте ту, куда вставлять шаблон.',
  PROJECT_NOT_SAVED: 'Проект не сохранён. Сохраните его: шаблону нужна папка рядом с файлом проекта.',
  FONT_MISSING: 'Не установлен шрифт[ {font}]. Установите SB Sans по инструкции и перезапустите приложение.',
  FONT_CHECK_FAILED: 'Не удалось проверить шрифты шаблона. Повторите вставку; если не поможет, '
    + 'скопируйте диагностику и передайте разработчикам.',
  FONT_BUILD: '[Шрифт {font}: установлена сборка {have}, шаблон сделан на {need}|Сборка шрифта не та, на которой сделан шаблон]. '
    + 'Плашки могут сместиться.',
  HOST_TOO_OLD: 'Шаблону нужна версия приложения [{need} или новее, у вас {have}|новее вашей].',
  PLUGIN_TOO_OLD: 'Библиотеке нужна панель BrandKit [{need} или новее, у вас {have}|новее вашей]. Обновите панель.',
  NO_VARIANT: 'Нет варианта под [кадр {frame}|этот кадр].[ Ближайший — {nearest}, его можно выбрать вручную в чипе формата.]',
  FPS_MISMATCH: '[Шаблон сделан для {template} к/с, а у цели {target} к/с|Частота кадров цели не та, что у шаблона]. '
    + 'Движение может идти неровно.',
  PATH_TOO_LONG: 'Слишком длинный путь к проекту: Premiere не распакует шаблон[ ({length} символов при пределе {max})]. '
    + 'Перенесите проект в папку с коротким путём.',
  LENGTH_TOO_SHORT: 'Слишком короткая длительность.[ Минимум для этого шаблона — {min} с.]',
  FIELD_TOO_LONG: 'Поле[ «{field}»] длиннее [{max} символов|допустимого][ (сейчас {len})].',
  FIELD_INVALID: 'Недопустимое значение поля[ «{field}»].',
  // during the insert
  NO_FREE_TRACK: 'Нет свободной видеодорожки на месте вставки, и добавить её не удалось.',
  TARGET_CHANGED: 'Активная композиция или секвенция сменилась во время вставки. Проверьте цель и повторите.',
  TARGET_IS_TEMPLATE: 'Эту композицию нельзя менять: она из библиотеки BrandKit. Откройте свою композицию.',
  TEMPLATE_NOT_FOUND: 'Шаблон не найден в проекте после импорта. Проверьте папку Cloud.ru BrandKit.',
  TEMPLATE_DUPLICATE: 'В проекте несколько копий этого шаблона. Оставьте одну в папке Cloud.ru BrandKit.',
  INSERT_FAILED: 'Вставка не выполнена: шаблон не появился на таймлайне.',
  INSERT_UNCONFIRMED: 'Приложение не подтвердило вставку, и проверить её не удалось. '
    + 'Посмотрите на таймлайн, прежде чем вставлять снова.',
  READBACK_MISMATCH: 'Шаблон вставлен, но не прочитались назад поля[: {fields}]. Проверьте их в Properties или отмените вставку.',
  NAME_MISMATCH: 'Шаблон вставлен, но клип называется не так, как шаблон. Проверьте, тот ли это шаблон.',
  TIMEOUT_LANDED: 'Шаблон вставлен, но приложение не подтвердило запись полей. Проверьте их в Properties.',
  // bridge and library
  TIMEOUT: 'Приложение не ответило вовремя. Проверьте таймлайн, прежде чем вставлять снова.',
  ADAPTER_LOAD: 'Не удалось загрузить скрипты панели в приложение. Закройте и снова откройте панель.',
  HOST_EXCEPTION: 'Ошибка скрипта в приложении[ (строка {line})]. Скопируйте диагностику и передайте разработчикам.',
  HOST_EMPTY: 'Приложение пока не отвечает. Подождите несколько секунд и повторите.',
  HOST_BRIDGE_ERROR: 'Панель пока не может связаться с приложением. Подождите несколько секунд и повторите.',
  HOST_EVAL_ERROR: 'Приложение не смогло выполнить команду панели. Закройте и снова откройте панель.',
  HOST_BAD_REPLY: 'Приложение вернуло непонятный ответ. Скопируйте диагностику и передайте разработчикам.',
  UNKNOWN_FN: 'Скрипты панели в приложении устарели. Закройте и снова откройте панель.',
  BAD_ARGS: 'Панель передала приложению неверные данные. Скопируйте диагностику и передайте разработчикам.',
  LIBRARY_MISSING: 'Библиотека шаблонов не найдена[: {path}]. Переустановите BrandKit.',
  LIBRARY_INVALID: 'Библиотека шаблонов повреждена. Переустановите BrandKit.[ Подробности: {details}]',
  FILE_MISSING: 'Нет файла шаблона в библиотеке[: {file}]. Переустановите BrandKit.',
};

// The params each code's producers set (core checks, fields, library and insert; the bridge; the adapters).
export const PARAMS: Readonly<Record<string, readonly string[]>> = {
  NO_TARGET: [],
  PROJECT_NOT_SAVED: [],
  FONT_MISSING: ['font'],
  FONT_CHECK_FAILED: [],
  FONT_BUILD: ['font', 'need', 'have'],
  HOST_TOO_OLD: ['need', 'have'],
  PLUGIN_TOO_OLD: ['need', 'have'],
  NO_VARIANT: ['frame', 'nearest'],
  FPS_MISMATCH: ['template', 'target'],
  PATH_TOO_LONG: ['length', 'max'],
  LENGTH_TOO_SHORT: ['min'],
  FIELD_TOO_LONG: ['field', 'key', 'max', 'len'],
  FIELD_INVALID: ['field', 'key', 'value'],
  NO_FREE_TRACK: [],
  TARGET_CHANGED: [],
  TARGET_IS_TEMPLATE: [],
  TEMPLATE_NOT_FOUND: [],
  TEMPLATE_DUPLICATE: [],
  INSERT_FAILED: [],
  INSERT_UNCONFIRMED: ['detail'],
  READBACK_MISMATCH: ['fields'],
  NAME_MISMATCH: [],
  TIMEOUT_LANDED: [],
  TIMEOUT: ['detail'],
  ADAPTER_LOAD: [],
  HOST_EXCEPTION: ['detail', 'line'],
  HOST_EMPTY: [],
  HOST_BRIDGE_ERROR: ['detail'],
  HOST_EVAL_ERROR: [],
  HOST_BAD_REPLY: [],
  UNKNOWN_FN: [],
  BAD_ARGS: [],
  LIBRARY_MISSING: ['path'],
  LIBRARY_INVALID: ['details', 'count'],
  FILE_MISSING: ['file'],
};

const FALLBACK = 'Непредвиденная ошибка[ {code}]. Скопируйте диагностику и передайте разработчикам.';

const own = (o: object, key: string) => Object.prototype.hasOwnProperty.call(o, key);

function show(v: string | number): string {
  if (typeof v !== 'number') return String(v);
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000).replace('.', ',');
}

function fill(text: string, params: Params): string {
  // '' for a param that is missing, undefined or null: the Issue type does not stop a JS producer from setting them.
  const value = (name: string): string => {
    const v: unknown = own(params, name) ? params[name] : undefined;
    return v === undefined || v === null ? '' : show(v as string | number);
  };
  const kept = text.replace(/\[([^\]]*)\]/g, (_, part: string) => {
    const bar = part.indexOf('|');
    const main = bar < 0 ? part : part.slice(0, bar);
    const names = [...main.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '');
    if (names.every((n) => value(n) !== '')) return main;
    return bar < 0 ? '' : part.slice(bar + 1);
  });
  return kept.replace(/\{(\w+)\}/g, (_, name: string) => value(name));
}

// A code comes from a producer outside the core (an adapter may say anything), so it is looked up as an own key:
// 'constructor' or 'toString' must get the fallback, not a function off Object.prototype.
export function message(issue: Issue): string {
  const text = own(MESSAGES, issue.code) ? MESSAGES[issue.code] : undefined;
  return text === undefined ? fill(FALLBACK, { code: issue.code }) : fill(text, issue.params ?? {});
}
