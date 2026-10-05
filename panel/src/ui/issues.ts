// Issue -> the line the panel shows. The core has a Russian text per code (core/errors.ts, the adapters' warnings
// included: runInsert turns InsertResult.warnings into warning issues); this adds the codes the app itself makes
// (app.ts, APP_CODES), so the panel never shows a bare code as its message. The code stays next to the text: the user
// reads Russian, the person who is sent the diagnostics reads the code (spec 8.2).
import { message, MESSAGES } from '../core/errors';
import type { Issue } from '../core/types';

type Params = NonNullable<Issue['params']>;

export interface IssueText {
  code: string;
  level: 'error' | 'warning';
  text: string;
  detail?: string; // what the producer added, for a code that has no text of its own
}

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const tail = (v: string | number | undefined): string => (v === undefined || v === '' ? '' : ': ' + v);

export const APP_MESSAGES: Readonly<Record<string, (p: Params) => string>> = {
  PANEL_BOOT_FAILED: (p) => 'Панель не запустилась' + tail(p.detail) + '. Закройте и снова откройте панель.',
  PANEL_ERROR: (p) => 'Ошибка панели' + tail(p.detail) + '. Скопируйте диагностику и передайте разработчикам.',
  ITEM_NOT_FOUND: (p) => 'Шаблон не найден в библиотеке' + tail(p.id) + '.',
  INSERT_BUSY: () => 'Предыдущая вставка ещё выполняется. Дождитесь результата и повторите.',
};

export function describeIssue(issue: Issue): IssueText {
  const params = issue.params ?? {};
  const base = { code: issue.code, level: issue.level };
  if (own(APP_MESSAGES, issue.code)) return { ...base, text: (APP_MESSAGES[issue.code] as (p: Params) => string)(params) };
  const text = message(issue);
  // A code the core has no text for gets the generic one; what the producer said is then the only clue.
  const detail = !own(MESSAGES, issue.code) && params.detail !== undefined && params.detail !== '' ? String(params.detail) : undefined;
  return detail === undefined ? { ...base, text } : { ...base, text, detail };
}
