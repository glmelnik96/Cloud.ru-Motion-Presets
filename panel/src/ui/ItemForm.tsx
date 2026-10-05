// The form of one item (spec 7): the big preview, a control per field, the length, and the «Вставить на плейхед»
// button with what came of the click. The button is off while a click is being served: an insert is not idempotent,
// so a second click must not queue a second one (the app refuses it as well).
import { useRef, useState } from 'preact/hooks';
import type { PanelApp } from '../app';
import { defaultLen } from '../core/duration';
import type { FieldValue, HostKey, Item } from '../core/types';
import type { Values } from '../core/fields';
import { cardOf } from './catalog';
import { Thumb } from './CatalogGrid';
import { DurationRow, FieldRow } from './Controls';
import { buildForm, clampSeconds, formatSeconds, parseSeconds, stepSeconds } from './form';
import { checkingView, idleView, insertingView, outcomeView, type InsertView } from './insert-state';
import { IssueList } from './IssueList';

export interface ItemFormProps {
  app: PanelApp;
  item: Item;
  host: HostKey;
  root: string;
  onBack(): void;
  onInserted(): void;
}

function Result({ view }: { view: InsertView }) {
  if (view.phase === 'idle') return null;
  return (
    <div class={'result ' + view.tone} role="status" aria-live="polite" aria-busy={view.busy}>
      <p class="result-title">{view.title}</p>
      {view.summary ? <p class="result-summary">{view.summary}</p> : null}
      {view.fields.length > 0 ? (
        <ul class="result-fields">
          {view.fields.map((f) => <li key={f}>{f}</li>)}
        </ul>
      ) : null}
      {view.hint ? <p class="result-hint">{view.hint}</p> : null}
      <IssueList lines={view.lines} />
      {view.notes.map((n) => <p class="result-note" key={n}>{n}</p>)}
    </div>
  );
}

export function ItemForm({ app, item, host, root, onBack, onInserted }: ItemFormProps) {
  const [values, setValues] = useState<Values>(() => app.initialValues(item));
  const [lenText, setLenText] = useState(() => formatSeconds(defaultLen(item)));
  const [view, setView] = useState<InsertView>(idleView);
  const busy = useRef(false); // set at the click itself: a state update would come too late for a double click

  const card = cardOf(item, root);
  const typed = parseSeconds(lenText);
  const form = buildForm(item, host, values, typed ?? Number.NaN);
  const afterEdit = () => setView((v) => (v.busy ? v : idleView()));

  const change = (key: string, value: FieldValue) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    afterEdit();
  };

  // What is in the length field becomes a length the moment it is left or the button is pressed: under the minimum
  // it is the minimum, and what is not a number is the length of the template.
  const commitLen = (): number => {
    const n = parseSeconds(lenText);
    const len = n === null ? defaultLen(item) : clampSeconds(item, n);
    setLenText(formatSeconds(len));
    return len;
  };

  // From the latest text, not the one this render saw: two quick clicks are two steps.
  const stepLen = (dir: 1 | -1) => {
    setLenText((text) => formatSeconds(stepSeconds(item, parseSeconds(text) ?? Number.NaN, dir)));
    afterEdit();
  };

  const insert = async () => {
    if (busy.current) return;
    busy.current = true;
    setView(checkingView());
    try {
      const lenSec = form.duration ? commitLen() : defaultLen(item);
      // No manualKey: the app applies the variant picked by hand for the frame the host reports at this moment.
      const outcome = await app.insert(
        { itemId: item.id, values, lenSec },
        (phase) => setView(phase === 'checking' ? checkingView() : insertingView(host)),
      );
      setView(outcomeView(outcome, { host, item }));
      onInserted();
    } catch (e) {
      // The app never throws; a view that does must not leave the button off for good.
      const detail = e instanceof Error ? e.message : String(e);
      setView(outcomeView({ ok: false, issues: [{ code: 'PANEL_ERROR', level: 'error', params: { detail } }] }, { host, item }));
    } finally {
      busy.current = false;
    }
  };

  return (
    <section class="form">
      <div class="scroll">
        <div class="form-head">
          <button type="button" class="back" onClick={onBack} disabled={view.busy} aria-label="Назад к каталогу">← Каталог</button>
          <h2 class="form-title">{item.title_ru}</h2>
        </div>
        <div class="preview"><Thumb card={card} playing /></div>
        <div class="fields">
          {form.controls.map((c) => <FieldRow key={c.key} control={c} onChange={change} />)}
          {form.duration ? (
            <DurationRow
              duration={form.duration}
              text={lenText}
              onText={(t) => {
                setLenText(t);
                afterEdit();
              }}
              onStep={stepLen}
              onCommit={commitLen}
            />
          ) : null}
        </div>
      </div>
      <div class="actions">
        <Result view={view} />
        <button type="button" class="primary" disabled={view.busy} onClick={() => void insert()}>
          Вставить на плейхед
        </button>
      </div>
    </section>
  );
}
