// Problems the panel reports (spec 8.2): a code for the log, a plain Russian message for the user.
// Errors stop an insert before anything changes; warnings are shown and the insert goes on.
import type { Host } from './types';

export type Severity = 'error' | 'warning';

export type ProblemCode =
  | 'LIBRARY'
  | 'PLUGIN_TOO_OLD'
  | 'NOT_SUPPORTED'
  | 'NO_TARGET'
  | 'NOT_SAVED'
  | 'PATH_TOO_LONG'
  | 'HOST_TOO_OLD'
  | 'NO_VARIANT'
  | 'NEAREST_VARIANT'
  | 'FPS_MISMATCH'
  | 'NO_FONT'
  | 'FONT_BUILD'
  | 'COLOR_SETTINGS'
  | 'BAD_VALUE'
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'TOO_EARLY'
  | 'NO_CUT'
  | 'COMPANION'
  | 'FILES'
  | 'NO_SELECTION'
  | 'PRESET_NO_EFFECT'
  | 'PRESET_PARTIAL'
  | 'PRESET_NEW_LAYER'
  | 'COLOR_NO_TARGET'
  | 'COLOR_PARTIAL'
  | 'COLOR_EXPRESSION'
  | 'COLOR_SOLID'
  | 'EXPORT_ASPECT'
  | 'EXPORT_UPSCALE'
  | 'EXPORT_FPS'
  | 'EXPORT_NO_TEMPLATE'
  | 'EXPORT_BUSY'
  | 'EXPORT_FAILED'
  | 'AERENDER'
  | 'FIT_FAILED'
  | 'FIT_NO_CROP'
  | 'BLUR_FAILED'
  | 'BLUR_NO_TRACK'
  | 'BLUR_DONE'
  | 'BLUR_NOT_FULL'
  | 'BLUR_EFFECTS'
  | 'BLUR_KEYED'
  | 'STYLE_FAILED'
  | 'EASE_NO_KEYS'
  | 'EASE_SINGLE'
  | 'INSERT_FAILED'
  | 'READBACK'
  | 'TIMEOUT'
  | 'HOST_ERROR';

export interface Problem {
  code: ProblemCode;
  severity: Severity;
  message: string;
  detail?: unknown;
}

const APP: Record<Host, string> = { ae: 'After Effects', pr: 'Premiere' };

export const appName = (host: Host): string => APP[host];

export function error(code: ProblemCode, message: string, detail?: unknown): Problem {
  return detail === undefined ? { code, severity: 'error', message } : { code, severity: 'error', message, detail };
}

export function warning(code: ProblemCode, message: string, detail?: unknown): Problem {
  return detail === undefined ? { code, severity: 'warning', message } : { code, severity: 'warning', message, detail };
}

export const hasErrors = (list: Problem[]): boolean => list.some((p) => p.severity === 'error');

// Seconds as the panel prints them: up to two decimals, a comma as the decimal mark.
export function sec(v: number): string {
  return String(Math.round(v * 100) / 100).replace('.', ',');
}

export const messages = {
  noTarget: (host: Host) =>
    host === 'ae'
      ? 'Нет активной композиции. Откройте композицию на таймлайне и повторите.'
      : 'Нет активной секвенции. Откройте секвенцию на таймлайне и повторите.',
  notSaved: () => 'Проект не сохранён. Сохраните его: файлы шаблона кладутся в папку «Cloud.ru BrandKit» рядом с проектом.',
  pathTooLong: (limit: number) => `Путь к проекту длиннее ${limit} символов. Перенесите проект в папку с коротким путём.`,
  hostTooOld: (host: Host, have: string, need: string) => `${APP[host]} ${have} старше нужной версии ${need}. Обновите приложение.`,
  pluginTooOld: (lib: string, need: string, have: string) =>
    `Библиотеке ${lib} нужна панель ${need} или новее, установлена ${have}. Запустите новый установщик.`,
  notSupported: (host: Host) => `${APP[host]} не умеет вставлять этот элемент.`,
  noVariant: (w: number, h: number) => `Нет варианта под кадр ${w}×${h}.`,
  nearest: (w: number, h: number, key: string) => `Нет варианта под кадр ${w}×${h}. Ближайший — ${key}, он будет вписан в кадр.`,
  fps: (template: number, have: number, host: Host) =>
    `Шаблон сделан в ${template} fps, ${host === 'ae' ? 'композиция' : 'секвенция'} — в ${have} fps. Движение может идти рывками.`,
  noFont: (ps: string) => `Не установлен шрифт ${ps}. Установите SB Sans по инструкции.`,
  substituteFont: (ps: string) => `Шрифт ${ps} подменён другим. Установите SB Sans по инструкции.`,
  fontBuild: (ps: string, have: string, need: string) =>
    `Шрифт ${ps} другой сборки (${have}, эталон — ${need}): плашки могут сдвинуться.`,
  color: (what: string) => `Настройки цвета проекта отличаются от эталона (${what}). Цвета шаблона могут измениться.`,
  tooShort: (len: number, min: number) => `Длина ${sec(len)} с меньше минимальной ${sec(min)} с: не помещаются вход и уход.`,
  tooLong: (len: number, max: number) => `Длина ${sec(len)} с больше длины шаблона ${sec(max)} с.`,
  tooEarly: (cutSec: number) => `Переход не помещается: до склейки нужно не меньше ${sec(cutSec)} с от начала секвенции.`,
  noCut: (windowSec: number) => `Склеек ближе ${sec(windowSec)} с к плейхеду нет: маркер перехода поставлен на плейхед.`,
  companion: (title: string) => `«${title}» не вставлен: нет подходящего файла в библиотеке.`,
  files: (detail: string) => `Не удалось скопировать файлы рядом с проектом: ${detail}.`,
  noSelection: () => 'Выделите в композиции слои, к которым применить эффект: без выделения After Effects создаёт новый слой.',
  noSelectionColor: () => 'Выделите в композиции слои, которые перекрасить.',
  colorNothing: (target: string) => target === 'effect'
    ? 'Выделенные слои не принимают эффекты: перекрашивать нечего.'
    : `У выделенных слоёв нет ${target === 'fill' ? 'заливки (шейпа или солида)' : target === 'stroke' ? 'обводки шейпа' : 'текста'}: перекрашивать нечего.`,
  colorPartial: (names: string[], target: string) => target === 'effect'
    ? `Слои ${names.join(', ')} не принимают эффекты — они не изменились.`
    : `У слоёв ${names.join(', ')} нет ${target === 'fill' ? 'заливки' : target === 'stroke' ? 'обводки' : 'текста'} — они не изменились.`,
  colorExpression: (props: string[]) => `Цвет задан выражением, не изменён: ${props.join('; ')}.`,
  colorSolid: () => 'Цвет солида меняется в его настройках: так же перекрасятся все слои с этим солидом.',
  presetNoEffect: (names: string[]) => `Пресет ничего не изменил у слоёв ${names.join(', ')}. Возможно, он для другого типа слоя (например, только для текста).`,
  presetPartial: (names: string[]) => `К слоям ${names.join(', ')} пресет не применился: возможно, он для другого типа слоя.`,
  presetNewLayer: (names: string[]) => `Пресет добавил слои: ${names.join(', ')}.`,
  exportAspect: (w: number, h: number, pw: number, ph: number) =>
    `Пресет ${pw}×${ph} другой пропорции, чем кадр ${w}×${h}: картинка сожмётся или ляжет с полями.`,
  exportNone: (w: number, h: number) => `Нет брендового пресета под кадр ${w}×${h}: пресеты есть для 16:9, 9:16, 1:1 и 4:3.`,
  exportUpscale: (w: number, h: number, pw: number, ph: number) =>
    `Кадр ${w}×${h} меньше пресета ${pw}×${ph}: картинка будет увеличена и потеряет резкость.`,
  exportFps: (host: Host, have: number, need: number) =>
    `${host === 'ae' ? 'Композиция' : 'Секвенция'} в ${sec(have)} к/с, пресет выводит ${sec(need)} к/с: движение может идти рывками.`,
  exportNoTemplate: (name: string, aom: string | null) =>
    `В After Effects нет шаблона вывода «${name}». Загрузите брендовые шаблоны один раз: Edit → Templates → Output Module → Load…` +
    (aom ? ` и выберите файл ${aom}.` : '.') + ' Затем повторите экспорт.',
  exportNotSaved: () => 'Для рендера в фоне проект должен быть сохранён: aerender рендерит файл проекта. Сохраните проект или выберите Render Queue.',
  exportBusy: () => 'After Effects уже рендерит очередь. Дождитесь конца рендера.',
  exportFailed: (detail: string) => `Экспорт не выполнен: ${detail}.`,
  aerender: (detail: string) => `Рендер в фоне не выполнен: ${detail}.`,
  fitNoWindow: (key: string) => `У этого формата шаблона нет окна «${key}».`,
  fitSelection: (detail: string) => `Выделите на таймлайне один видеоклип, который вписать в окно${detail ? ` (${detail})` : ''}.`,
  fitNoSize: () => 'Premiere не сообщил размер кадра клипа: вписать его в окно нельзя. Задайте Scale и Position вручную.',
  fitFailed: (detail: string) => `Не удалось вписать клип в окно: ${detail}.`,
  fitNoCrop: () => 'Клип больше окна, а Crop добавить не удалось: поставьте клип спикера на дорожку ниже клипа экрана или добавьте Crop вручную.',
  blurSelection: (detail: string) => `Выделите на таймлайне один видеоклип, у которого размыть поля${detail ? ` (${detail})` : ''}.`,
  blurNoTrack: (track: number) => `Над клипом нужна свободная видеодорожка V${track} на всю длину клипа: туда ляжет резкая копия. Добавьте дорожку (Sequence → Add Tracks) или освободите её.`,
  blurDone: () => 'У клипа поля уже размыты (на нём есть Fast Blur). Чтобы повторить, удалите Fast Blur и копию над клипом.',
  blurNotFull: () => 'Клип не закрывает кадр целиком: поля размыты только там, где он есть.',
  blurEffects: (names: string[]) => `На клипе есть эффекты (${names.join(', ')}): на резкую копию сверху они не перенесены. Скопируйте их на копию: Edit → Copy, затем Paste Attributes.`,
  blurKeyed: () => 'У клипа есть ключи Motion или Opacity: на копию перенесены только значения на начало клипа. Проверьте, что копия двигается вместе с клипом.',
  blurFailed: (detail: string) => `Не удалось размыть поля: ${detail}. Отмените последние действия (Ctrl+Z) и повторите.`,
  easeUnknown: () => 'Такой кривой нет в каноне.',
  easeNoKeys: (single: string[]) => single.length
    ? `Выделите хотя бы два ключа одного свойства: у ${single.join(', ')} выделен один ключ.`
    : 'Выделите на таймлайне ключи, между которыми поставить кривую: хотя бы два ключа одного свойства.',
  easeSingle: (names: string[]) => `У свойств ${names.join(', ')} выделен один ключ — кривая на них не поставлена.`,
  styleNone: () => 'В библиотеке нет стиля субтитров.',
  styleFailed: (detail: string) => `Стиль не добавлен в проект: ${detail}.`,
  placement: (what: string[]) => `Файлы встали не так, как задумано (${what.join('; ')}). Отмените вставку и повторите.`,
  insertFailed: (detail: string) => `Вставка не выполнена: ${detail}.`,
  readback: (labels: string[]) =>
    `Не записались поля: ${labels.join(', ')}. Клип оставлен выделенным: отмените вставку или заполните поля в Properties.`,
  timeout: (host: Host, s: number) => `${APP[host]} не ответил за ${sec(s)} с.`,
  hostError: (host: Host, message: string) => `Ошибка в ${APP[host]}: ${message}`,
  library: (detail: string) => `Библиотека повреждена: ${detail}. Запустите установщик заново.`,
};
