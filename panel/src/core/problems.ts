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
  placement: (what: string[]) => `Файлы встали не так, как задумано (${what.join('; ')}). Отмените вставку и повторите.`,
  insertFailed: (detail: string) => `Вставка не выполнена: ${detail}.`,
  readback: (labels: string[]) =>
    `Не записались поля: ${labels.join(', ')}. Клип оставлен выделенным: отмените вставку или заполните поля в Properties.`,
  timeout: (host: Host, s: number) => `${APP[host]} не ответил за ${sec(s)} с.`,
  hostError: (host: Host, message: string) => `Ошибка в ${APP[host]}: ${message}`,
  library: (detail: string) => `Библиотека повреждена: ${detail}. Запустите установщик заново.`,
};
