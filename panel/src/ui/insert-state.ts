// The insert button's states as data (spec 8.2): idle, checking, inserting, then done, refused or readback, each
// with the Russian text of core/errors.ts (and the code next to it). A refusal lists every reason; a mismatch lists
// the fields that did not read back and says where to fill them. Pure: no DOM.
import { sameValue } from '../core/fields';
import type { InsertOutcome } from '../core/insert';
import type { HostKey, Item, Placed } from '../core/types';
import { formatSeconds } from './form';
import { describeIssue, type IssueText } from './issues';

export type InsertPhase = 'idle' | 'checking' | 'inserting' | 'done' | 'refused' | 'readback';

export interface InsertView {
  phase: InsertPhase;
  busy: boolean; // the button is off: a second click would queue a second insert
  tone: 'neutral' | 'ok' | 'warn' | 'error';
  title: string;
  summary?: string; // where the clip or layer went
  lines: IssueText[]; // refusal reasons, or warnings of a done insert
  notes: string[]; // plain facts: tracks the insert added
  fields: string[]; // readback: the fields that did not read back, by their names in the form
  hint?: string;
}

const view = (phase: InsertPhase, busy: boolean, tone: InsertView['tone'], title: string): InsertView => ({
  phase, busy, tone, title, lines: [], notes: [], fields: [],
});

export const idleView = (): InsertView => view('idle', false, 'neutral', '');
export const checkingView = (): InsertView => view('checking', true, 'neutral', 'Проверяю шаблон, шрифты и цель…');

// S8: the first insert of a MOGRT into a Premiere project held the host for 18 s.
export const insertingView = (host: HostKey): InsertView =>
  view('inserting', true, 'neutral', host === 'pr' ? 'Вставляю шаблон… Первая вставка может занять до 20 секунд.' : 'Вставляю шаблон…');

// 'Дорожка V2, 12–18 с' (the adapter counts tracks from 0), 'Слой «CR_…», 2–8 с'.
export function placedSummary(placed: Placed): string {
  const span = formatSeconds(placed.startSec) + '–' + formatSeconds(placed.endSec) + ' с';
  if (placed.kind === 'layer') return 'Слой «' + placed.name + '», ' + span;
  return (typeof placed.track === 'number' ? 'Дорожка V' + (placed.track + 1) : 'Клип «' + placed.name + '»') + ', ' + span;
}

function tracksNote(added: number | undefined): string[] {
  if (!added || added < 1) return [];
  return [added === 1 ? 'Добавлена новая видеодорожка.' : 'Добавлено новых видеодорожек: ' + added + '.'];
}

export interface OutcomeContext {
  host: HostKey;
  item: Item;
}

// Where to fill what did not read back: Premiere shows it in Essential Graphics, After Effects in Essential Properties.
const WHERE: Readonly<Record<HostKey, string>> = {
  pr: 'Заполните их в Properties (панель Essential Graphics) или отмените вставку.',
  ae: 'Заполните их в Properties (Essential Properties слоя) или отмените вставку.',
};

export function outcomeView(outcome: InsertOutcome, ctx: OutcomeContext): InsertView {
  if (!outcome.ok) {
    return { ...view('refused', false, 'error', 'Не вставлено'), lines: outcome.issues.map(describeIssue) };
  }
  const { result, issues } = outcome;
  const base = { summary: placedSummary(result.placed), notes: tracksNote(result.tracksAdded) };
  const mismatch = issues.find((i) => i.code === 'READBACK_MISMATCH');
  if (!mismatch) {
    return { ...view('done', false, issues.length ? 'warn' : 'ok', 'Вставлено'), ...base, lines: issues.map(describeIssue) };
  }

  // The adapter's verdict backed by the core's own comparison, as runInsert judged it (a dropdown read back as
  // '1' for 1 is no mismatch). The field's name in the form, not the host's: they are the same in pack 1.
  const named = (egpName: string) => ctx.item.fields?.find((f) => f.egpName === egpName);
  const bad = (Array.isArray(result.fields) ? result.fields : []).filter(
    (f) => !f.ok && !sameValue(ctx.host, named(f.egpName)?.type ?? 'text', f.written, f.back),
  );
  const listed = String(mismatch.params?.fields ?? '');
  const fields = bad.length ? bad.map((f) => named(f.egpName)?.label_ru ?? f.egpName) : listed ? [listed] : [];
  return {
    ...view('readback', false, 'warn', 'Вставлено, но поля не прочитались назад'),
    ...base,
    fields,
    hint: WHERE[ctx.host],
    lines: issues.filter((i) => i !== mismatch).map(describeIssue),
  };
}
