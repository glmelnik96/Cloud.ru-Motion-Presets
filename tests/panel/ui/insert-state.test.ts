import { describe, it, expect } from 'vitest';
import { checkingView, idleView, insertingView, outcomeView, placedSummary } from '../../../panel/src/ui/insert-state';
import { message } from '../../../panel/src/core/errors';
import type { InsertOutcome } from '../../../panel/src/core/insert';
import type { FieldResult, InsertResult, Issue, Placed } from '../../../panel/src/core/types';
import { item } from '../core/fixture';

const TTL = item('TTL_LowerThird');
const PR = { host: 'pr' as const, item: TTL };
const AE = { host: 'ae' as const, item: TTL };

const clip: Placed = { kind: 'clip', id: 'c1', name: 'TTL_LowerThird_16x9_v1', track: 1, startSec: 12, endSec: 18 };
const layer: Placed = { kind: 'layer', id: '7', name: 'CR_TTL_LowerThird_16x9_v1', startSec: 2, endSec: 8 };
const okField = (egpName: string, value: FieldResult['written'] = 'x'): FieldResult => ({ egpName, written: value, back: value, ok: true });
const result = (placed: Placed, extra: Partial<InsertResult> = {}): InsertResult => ({ placed, fields: [okField('Имя')], warnings: [], ...extra });
const inserted = (placed: Placed, issues: Issue[] = [], extra: Partial<InsertResult> = {}): InsertOutcome => ({
  ok: true, result: result(placed, extra), issues,
});
const warning = (code: string, params?: Issue['params']): Issue => (params ? { code, level: 'warning', params } : { code, level: 'warning' });
const error = (code: string, params?: Issue['params']): Issue => (params ? { code, level: 'error', params } : { code, level: 'error' });

describe('the states before the answer', () => {
  it('idle shows nothing and takes a click', () => {
    expect(idleView()).toEqual({ phase: 'idle', busy: false, tone: 'neutral', title: '', lines: [], notes: [], fields: [] });
  });

  it('checking and inserting hold the button off', () => {
    expect(checkingView()).toMatchObject({ phase: 'checking', busy: true, tone: 'neutral', title: 'Проверяю шаблон, шрифты и цель…' });
    expect(insertingView('ae')).toMatchObject({ phase: 'inserting', busy: true, title: 'Вставляю шаблон…' });
  });

  it('says that the first insert in Premiere takes long (S8: up to 18 s)', () => {
    expect(insertingView('pr').title).toBe('Вставляю шаблон… Первая вставка может занять до 20 секунд.');
  });
});

describe('a refusal', () => {
  it('shows the Russian text and the code of every reason, in the order the core gave them', () => {
    const issues = [error('NO_TARGET'), error('PROJECT_NOT_SAVED'), warning('FPS_MISMATCH', { template: 25, target: 30 })];
    const v = outcomeView({ ok: false, issues }, PR);
    expect(v).toMatchObject({ phase: 'refused', busy: false, tone: 'error', title: 'Не вставлено', fields: [], notes: [] });
    expect(v.lines.map((l) => [l.code, l.level])).toEqual([['NO_TARGET', 'error'], ['PROJECT_NOT_SAVED', 'error'], ['FPS_MISMATCH', 'warning']]);
    expect(v.lines[0]?.text).toBe(message(issues[0]!));
    expect(v.lines[2]?.text).toBe(message(issues[2]!));
    expect(v.summary).toBeUndefined();
  });

  it('names the nearest variant when there is none for the frame', () => {
    const v = outcomeView({ ok: false, issues: [error('NO_VARIANT', { frame: '2560×1440', nearest: '16x9' })] }, PR);
    expect(v.lines[0]?.text).toContain('2560×1440');
    expect(v.lines[0]?.text).toContain('16x9');
  });

  it('says what the host or the bridge failed with, in Russian, and keeps the detail for a code it does not know', () => {
    const v = outcomeView({ ok: false, issues: [error('TIMEOUT', { detail: 'insertItem TIMEOUT' }), error('WEIRD', { detail: 'x' })] }, AE);
    expect(v.lines[0]).toEqual({ code: 'TIMEOUT', level: 'error', text: message(error('TIMEOUT')) });
    expect(v.lines[1]).toMatchObject({ code: 'WEIRD', detail: 'x' });
    expect(v.lines[1]?.text).toMatch(/Непредвиденная ошибка WEIRD/);
  });

  it('shows the codes the app makes in Russian as well', () => {
    const v = outcomeView({ ok: false, issues: [error('INSERT_BUSY')] }, PR);
    expect(v.lines[0]?.text).toBe('Предыдущая вставка ещё выполняется. Дождитесь результата и повторите.');
  });
});

describe('a done insert', () => {
  it('says where the clip is put: the track (from 1) and the time in seconds', () => {
    const v = outcomeView(inserted(clip), PR);
    expect(v).toMatchObject({ phase: 'done', busy: false, tone: 'ok', title: 'Вставлено', summary: 'Дорожка V2, 12–18 с', fields: [], notes: [] });
    expect(v.lines).toEqual([]);
    expect(v.hint).toBeUndefined();
  });

  it('says it for a layer in After Effects, with its name', () => {
    expect(outcomeView(inserted(layer), AE).summary).toBe('Слой «CR_TTL_LowerThird_16x9_v1», 2–8 с');
  });

  it('writes seconds with a decimal comma', () => {
    expect(placedSummary({ ...clip, track: 0, startSec: 12.04, endSec: 18.5 })).toBe('Дорожка V1, 12,04–18,5 с');
    expect(placedSummary({ ...layer, startSec: 0, endSec: 6.04 })).toBe('Слой «CR_TTL_LowerThird_16x9_v1», 0–6,04 с');
  });

  it('does not invent a track the adapter did not name', () => {
    const { track: _track, ...noTrack } = clip;
    expect(placedSummary(noTrack)).toBe('Клип «TTL_LowerThird_16x9_v1», 12–18 с');
  });

  it('shows the warnings of the plan and of the adapter, and turns the tone to a warning', () => {
    const issues = [
      warning('FIELD_NOT_FOUND', { field: 'Имя' }),
      warning('NAME_MISMATCH'),
      warning('FPS_MISMATCH', { template: 25, target: 30 }),
    ];
    const v = outcomeView(inserted(clip, issues), PR);
    expect(v).toMatchObject({ phase: 'done', tone: 'warn', title: 'Вставлено' });
    expect(v.lines.map((l) => l.code)).toEqual(['FIELD_NOT_FOUND', 'NAME_MISMATCH', 'FPS_MISMATCH']);
    expect(v.lines[0]?.text).toBe('Шаблон вставлен, но в нём нет поля «Имя». Проверьте шаблон.');
    expect(v.lines.every((l) => l.level === 'warning')).toBe(true);
  });

  it('says that an insert whose answer was lost landed, and that the fields are unknown', () => {
    const lost: InsertOutcome = {
      ok: true,
      result: { placed: clip, fields: [], warnings: [] },
      issues: [warning('TIMEOUT_LANDED')],
    };
    const v = outcomeView(lost, PR);
    expect(v).toMatchObject({ phase: 'done', tone: 'warn', summary: 'Дорожка V2, 12–18 с' });
    expect(v.lines).toEqual([{ code: 'TIMEOUT_LANDED', level: 'warning', text: message(warning('TIMEOUT_LANDED')) }]);
  });

  it('mentions the tracks it had to add: they stay empty if the user undoes the insert', () => {
    expect(outcomeView(inserted(clip, [], { tracksAdded: 1 }), PR).notes).toEqual(['Добавлена новая видеодорожка.']);
    expect(outcomeView(inserted(clip, [], { tracksAdded: 2 }), PR).notes).toEqual(['Добавлено новых видеодорожек: 2.']);
    expect(outcomeView(inserted(clip, [], { tracksAdded: 0 }), PR).notes).toEqual([]);
  });
});

describe('fields that did not read back', () => {
  const mismatch = (fields: FieldResult[], extra: Issue[] = []): InsertOutcome => ({
    ok: true,
    result: result(clip, { fields }),
    issues: [warning('READBACK_MISMATCH', { fields: fields.filter((f) => !f.ok).map((f) => f.egpName).join(', ') }), ...extra],
  });

  it('lists the fields by their names in the form, with the hint to fill them in Properties', () => {
    const v = outcomeView(
      mismatch([
        { egpName: 'Имя', written: 'Иван', back: '', ok: false },
        okField('Должность'),
        { egpName: 'Должность, 2-я строка', written: 'Cloud.ru', back: null, ok: false },
      ]),
      PR,
    );
    expect(v).toMatchObject({
      phase: 'readback',
      busy: false,
      tone: 'warn',
      title: 'Вставлено, но поля не прочитались назад',
      summary: 'Дорожка V2, 12–18 с',
      // the name of a field may hold a comma: the list is kept as a list
      fields: ['Имя', 'Должность, 2-я строка'],
      hint: 'Заполните их в Properties (панель Essential Graphics) или отмените вставку.',
    });
  });

  it('points to Essential Properties in After Effects', () => {
    const v = outcomeView(mismatch([{ egpName: 'Имя', written: 'Иван', back: '', ok: false }]), AE);
    expect(v.hint).toBe('Заполните их в Properties (Essential Properties слоя) или отмените вставку.');
  });

  it('skips a field the adapter doubted but the core read as equal', () => {
    const v = outcomeView(
      {
        ok: true,
        result: result(clip, {
          fields: [
            { egpName: 'Стиль', written: 1, back: '1', ok: false }, // a dropdown read back as the same number: not a mismatch
            { egpName: 'Имя', written: 'Иван', back: '', ok: false },
          ],
        }),
        issues: [warning('READBACK_MISMATCH', { fields: 'Имя' })],
      },
      PR,
    );
    expect(v.fields).toEqual(['Имя']);
  });

  it('falls back to the names of the issue when the result does not tell which field it was', () => {
    const v = outcomeView(
      { ok: true, result: result(clip, { fields: [] }), issues: [warning('READBACK_MISMATCH', { fields: 'Имя, Стиль' })] },
      PR,
    );
    expect(v.phase).toBe('readback');
    expect(v.fields).toEqual(['Имя, Стиль']);
  });

  it('does not repeat the mismatch as a line, and keeps the other warnings', () => {
    const v = outcomeView(
      mismatch([{ egpName: 'Имя', written: 'Иван', back: '', ok: false }], [warning('FIELD_READ_FAILED', { field: 'Имя' }), warning('FPS_MISMATCH', { template: 25, target: 30 })]),
      PR,
    );
    expect(v.lines.map((l) => l.code)).toEqual(['FIELD_READ_FAILED', 'FPS_MISMATCH']);
    expect(v.lines.some((l) => l.code === 'READBACK_MISMATCH')).toBe(false);
  });

  it('uses the name from the host when the library has no such field', () => {
    const v = outcomeView(mismatch([{ egpName: 'Чужое поле', written: 'x', back: 'y', ok: false }]), PR);
    expect(v.fields).toEqual(['Чужое поле']);
  });
});
