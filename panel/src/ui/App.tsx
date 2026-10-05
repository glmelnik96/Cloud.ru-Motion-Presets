// The panel UI (spec 7): header with the format chip, catalog (search, categories, cards with previews),
// the form of an item with «Вставить на плейхед», and the status line. It renders PanelApp state only.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { PanelApp } from '../app/controller';
import { isActive } from '../core/fields';
import type { Problem } from '../core/problems';
import { sec } from '../core/problems';
import type { Field, FieldValue, Item } from '../core/types';
import { variantLabel } from '../core/variant';
import { useAppState } from './hooks';

export interface UiServices {
  // A library file (path from library.json) as a URL the panel page can load.
  fileUrl(file: string): string;
  pickFile?(accepts: string[]): Promise<string | null>;
  copy?(text: string): void;
}

export function App({ app, ui }: { app: PanelApp; ui: UiServices }) {
  const s = useAppState(app);
  const refresh = () => {
    if (!s.busy) void app.refreshContext();
  };
  return (
    <div class="shell" onMouseEnter={refresh}>
      <header class="top">
        <span class="brand"><b>Cloud.ru</b> BrandKit</span>
        <span class="chip-format" title="Формат по активной композиции или секвенции">{app.formatChip()}</span>
      </header>
      <main class="main">
        {s.phase === 'loading' && <div class="empty">Загрузка библиотеки…</div>}
        {s.phase === 'error' && <Fatal problems={s.libraryProblems} />}
        {s.phase === 'ready' && (s.view === 'catalog' ? <Catalog app={app} ui={ui} /> : <Form app={app} ui={ui} />)}
      </main>
      <Status app={app} ui={ui} />
    </div>
  );
}

function Fatal({ problems }: { problems: Problem[] }) {
  return (
    <div class="fatal">
      {problems.map((p) => <p key={p.code}>{p.message}</p>)}
    </div>
  );
}

function Catalog({ app, ui }: { app: PanelApp; ui: UiServices }) {
  const s = app.state;
  const items = app.visibleItems();
  return (
    <>
      <input class="search" type="text" placeholder="Поиск" value={s.query} onInput={(e) => app.setQuery((e.target as HTMLInputElement).value)} />
      <div class="chips">
        {app.categories().map((c) => (
          <button key={c.key} class={'chip' + (s.category === c.key ? ' on' : '')} onClick={() => app.setCategory(c.key)}>{c.label_ru}</button>
        ))}
      </div>
      {items.length ? (
        <div class="grid">
          {items.map((it) => <Card key={it.id} app={app} ui={ui} item={it} />)}
        </div>
      ) : (
        <div class="empty">{s.category === 'favorites' ? 'В избранном пока ничего нет' : 'Ничего не найдено'}</div>
      )}
    </>
  );
}

function Preview({ item, ui, playing }: { item: Item; ui: UiServices; playing: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (playing) void v.play().catch(() => undefined);
    else {
      v.pause();
      v.currentTime = 0;
    }
  }, [playing]);
  const poster = item.poster ? ui.fileUrl(item.poster.file) : undefined;
  return (
    <div class="thumb">
      {item.preview ? (
        <video ref={video} src={ui.fileUrl(item.preview.file)} poster={poster} muted loop playsInline preload="none" />
      ) : poster ? (
        <img src={poster} alt="" />
      ) : (
        <div class="mark" />
      )}
    </div>
  );
}

function Card({ app, ui, item }: { app: PanelApp; ui: UiServices; item: Item }) {
  const [hover, setHover] = useState(false);
  const fav = app.state.favorites.has(item.id);
  const formats = item.variants.map((v) => v.aspect?.replace('x', ':')).filter((a, i, all) => a && all.indexOf(a) === i).join(' · ');
  return (
    <div class="card" role="button" tabIndex={0} onClick={() => app.open(item.id)} onKeyDown={(e) => e.key === 'Enter' && app.open(item.id)}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <Preview item={item} ui={ui} playing={hover} />
      <div class="title">{item.title_ru}</div>
      <div class="meta">{formats}</div>
      <button class={'star' + (fav ? ' on' : '')} title={fav ? 'Убрать из избранного' : 'В избранное'}
        onClick={(e) => { e.stopPropagation(); app.toggleFavorite(item.id); }}>★</button>
    </div>
  );
}

function FieldInput({ app, ui, field, mode }: { app: PanelApp; ui: UiServices; field: Field; mode: 'panel' | 'properties' | 'hidden' }) {
  const s = app.state;
  const v = s.values[field.key];
  const off = mode !== 'panel' || !isActive(field, s.values);
  const set = (x: FieldValue) => app.setValue(field.key, x);
  const id = `f-${field.key}`;
  const hint = mode === 'properties' ? (field.type === 'media' ? 'Перетащите файл в Properties после вставки' : 'Заполните в Properties после вставки') : null;

  if (field.type === 'checkbox') {
    return (
      <div class={'field' + (off ? ' off' : '')}>
        <label class="check"><input type="checkbox" disabled={off} checked={v === true} onChange={(e) => set((e.target as HTMLInputElement).checked)} />{field.label_ru}</label>
        {hint && <span class="hint">{hint}</span>}
      </div>
    );
  }
  let control;
  if (field.type === 'text') {
    const text = typeof v === 'string' ? v : '';
    control = (
      <>
        <input id={id} type="text" disabled={off} value={text} maxLength={field.maxLen} onInput={(e) => set((e.target as HTMLInputElement).value)} />
        {field.maxLen ? <span class="count">{[...text].length} / {field.maxLen}</span> : null}
      </>
    );
  } else if (field.type === 'dropdown') {
    const opts = field.options ?? [];
    control = opts.length <= 3 ? (
      <div class="seg">
        {opts.map((o) => <button key={o.index} disabled={off} class={v === o.index ? 'on' : ''} onClick={() => set(o.index)}>{o.label_ru}</button>)}
      </div>
    ) : (
      <select id={id} disabled={off} value={String(v)} onChange={(e) => set(Number((e.target as HTMLSelectElement).value))}>
        {opts.map((o) => <option key={o.index} value={String(o.index)}>{o.label_ru}</option>)}
      </select>
    );
  } else if (field.type === 'slider') {
    control = <input id={id} type="number" disabled={off} min={field.min} max={field.max} step="any" value={typeof v === 'number' ? v : ''}
      onInput={(e) => set(Number((e.target as HTMLInputElement).value))} />;
  } else {
    const path = typeof v === 'string' ? v : '';
    control = (
      <div class="media">
        <input id={id} type="text" disabled={off} value={path} placeholder="Файл не выбран" onInput={(e) => set((e.target as HTMLInputElement).value || null)} />
        {ui.pickFile && !off && <button onClick={async () => { const p = await ui.pickFile!(field.accepts ?? []); if (p) set(p); }}>Выбрать…</button>}
      </div>
    );
  }
  return (
    <div class={'field' + (off ? ' off' : '')}>
      <label for={id}>{field.label_ru}</label>
      {control}
      {hint && <span class="hint">{hint}</span>}
    </div>
  );
}

function Problems({ list }: { list: Problem[] }) {
  if (!list.length) return null;
  return (
    <ul class="problems">
      {list.map((p, i) => <li key={p.code + i} class={p.severity}>{p.message}</li>)}
    </ul>
  );
}

function Form({ app, ui }: { app: PanelApp; ui: UiServices }) {
  const s = app.state;
  const item = app.selected();
  if (!item) return null;
  const fav = s.favorites.has(item.id);
  const pick = app.pick(item);
  const planProblems = s.plan?.problems ?? [];
  const blocking = planProblems.some((p) => p.severity === 'error');
  const companions = item.companions ?? [];
  const hasMusic = companions.some((c) => c.kind === 'music');
  const hasSfx = companions.some((c) => c.kind === 'sfx');
  const shown = s.outcome ? s.outcome.problems : planProblems;
  return (
    <>
      <div class="form-head">
        <button class="back" onClick={() => app.back()} title="К каталогу">←</button>
        <h2>{item.title_ru}</h2>
        <button class={'star' + (fav ? ' on' : '')} style={{ position: 'static' }} onClick={() => app.toggleFavorite(item.id)}>★</button>
      </div>
      <div class="hero"><Preview item={item} ui={ui} playing /></div>

      <div class="row">
        <div class="field">
          <label for="f-format">Формат</label>
          <select id="f-format" value={s.manualVariant ?? ''} onChange={(e) => app.setVariant((e.target as HTMLSelectElement).value || null)}>
            <option value="">Авто{pick?.variant && !s.manualVariant ? ` (${pick.variant.aspect?.replace('x', ':') ?? pick.variant.key})` : ''}</option>
            {item.variants.map((v) => <option key={v.key} value={v.key}>{variantLabel(v)}</option>)}
          </select>
        </div>
        {item.duration && (
          <div class="field">
            <label for="f-length">Длительность, с</label>
            <input id="f-length" type="number" min="0" step="0.04" value={s.lengthSec ?? ''} placeholder={sec(app.lengthFor(item))}
              onInput={(e) => { const t = (e.target as HTMLInputElement).value; app.setLength(t === '' ? null : Number(t.replace(',', '.'))); }} />
          </div>
        )}
      </div>

      {app.fields(item).map(({ field, mode }) => <FieldInput key={field.key} app={app} ui={ui} field={field} mode={mode} />)}

      {(hasMusic || hasSfx) && (
        <div class="field">
          {hasMusic && <label class="check"><input type="checkbox" checked={s.sound.music} onChange={(e) => app.setSound({ ...s.sound, music: (e.target as HTMLInputElement).checked })} />Музыка</label>}
          {hasSfx && <label class="check"><input type="checkbox" checked={s.sound.sfx} onChange={(e) => app.setSound({ ...s.sound, sfx: (e.target as HTMLInputElement).checked })} />Звуковые эффекты</label>}
        </div>
      )}

      {/* Problems, consent, the button and the result stay in sight at the bottom of the panel (live UI check
          2026-10-05: «Вставлено» was below the fold). */}
      <div class="actions">
        <Problems list={shown} />
        {s.consent && (
          <div class="consent">
            Нет варианта под этот кадр. Вставить ближайший — {s.consent.label}? Он будет вписан в кадр.
            <div><button class="secondary" onClick={() => void app.insert(true)}>Вставить ближайший</button></div>
          </div>
        )}
        <button class="insert" disabled={s.busy || (blocking && !s.outcome)} onClick={() => void app.insert(false)}>
          {s.busy ? 'Вставка…' : 'Вставить на плейхед'}
        </button>
        {s.outcome?.ok && <div class="done">Вставлено{s.host === 'pr' ? ': клип выделен на таймлайне' : ': слой выделен в композиции'}.</div>}
      </div>
    </>
  );
}

function Status({ app, ui }: { app: PanelApp; ui: UiServices }) {
  const fonts = app.fontSummary();
  const [copied, setCopied] = useState(false);
  return (
    <footer class="status">
      <span class={fonts.ok ? '' : 'bad'}>{fonts.text}</span>
      <span>{app.versions()}</span>
      {ui.copy && (
        <button onClick={async () => { ui.copy!(await app.diagnostics()); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? 'Скопировано' : 'Скопировать диагностику'}
        </button>
      )}
    </footer>
  );
}
