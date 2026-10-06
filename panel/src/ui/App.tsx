// The panel UI (spec 7): header with the format chip, catalog (search, categories, cards with previews),
// the form of an item with «Вставить на плейхед», and the status line. It renders PanelApp state only.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { PanelApp } from '../app/controller';
import { palette, TARGETS } from '../core/colors';
import { fitLabel, type ExportMode } from '../core/export';
import { isActive } from '../core/fields';
import type { Problem } from '../core/problems';
import { messages, sec } from '../core/problems';
import type { PreviewMedia } from '../core/previews';
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
      {app.tabs().length > 0 && s.phase === 'ready' && (
        <nav class="tabs">
          {app.tabs().map((t) => <button key={t.key} class={'tab' + (s.tab === t.key ? ' on' : '')} onClick={() => app.setTab(t.key)}>{t.label_ru}</button>)}
        </nav>
      )}
      <main class="main">
        {s.phase === 'loading' && <div class="empty">Загрузка библиотеки…</div>}
        {s.phase === 'error' && <Fatal problems={s.libraryProblems} />}
        {s.phase === 'ready' && s.tab === 'colors' && <Colors app={app} ui={ui} />}
        {s.phase === 'ready' && s.tab === 'export' && <Export app={app} />}
        {s.phase === 'ready' && s.tab === 'catalog' && (s.view === 'catalog' ? <Catalog app={app} ui={ui} /> : <Form app={app} ui={ui} />)}
      </main>
      <Status app={app} ui={ui} />
    </div>
  );
}

// «Цвета» (AE): what to repaint, then a swatch of the base palette repaints the selected layers; its HEX
// copies (as in the old brandcolors panel, D23).
function Colors({ app, ui }: { app: PanelApp; ui: UiServices }) {
  const s = app.state;
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <div class="colors">
      <p class="hint">Выделите слои в композиции, выберите, что перекрасить, и нажмите цвет. «Эффект Fill» — как в старой панели Brand Colors: на любой слой.</p>
      <div class="seg" role="group" aria-label="Что перекрасить">
        {TARGETS.map((t) => <button key={t.key} class={s.colorTarget === t.key ? 'on' : ''} onClick={() => app.setColorTarget(t.key)}>{t.label_ru}</button>)}
      </div>
      <div class="swatches">
        {palette().map((c) => (
          <div key={c.key} class="swatch">
            <button class="swatch-apply" disabled={s.busy} title={`${c.role} — перекрасить`} style={{ background: c.hex }} onClick={() => void app.paint(c.key)} />
            <button class="swatch-hex" title="Скопировать HEX" onClick={() => { ui.copy?.(c.hex); setCopied(c.key); setTimeout(() => setCopied(null), 1200); }}>
              {copied === c.key ? 'Скопировано' : c.hex}
            </button>
          </div>
        ))}
      </div>
      <div class="actions">
        <Problems list={s.outcome?.problems ?? []} />
        {s.outcome?.ok && <div class="done">{s.outcome.note}</div>}
      </div>
    </div>
  );
}

const MODE_HINT: Record<ExportMode, string> = {
  queue: 'Premiere сразу свободен: файл закодирует Media Encoder.',
  direct: 'Быстрее для коротких роликов, но Premiere занят до конца экспорта.',
  render: 'After Effects занят до конца рендера и показывает его ход.',
  background: 'Панель сохранит проект и запустит aerender: можно работать дальше. Рендерится сохранённый проект.',
};

const EXPORT_BUTTON: Record<ExportMode, string> = {
  queue: 'В очередь Media Encoder',
  direct: 'Экспортировать',
  render: 'Рендерить',
  background: 'Сохранить проект и рендерить в фоне',
};

// «Экспорт» (decisions P18–P23): the brand presets for the frame of the active comp or sequence, the way to
// export, the folder; then the result with «Показать в папке» and the renders in the background.
function Export({ app }: { app: PanelApp }) {
  const s = app.state;
  const t = s.context?.target;
  if (!t) return <div class="empty">{messages.noTarget(s.host)}</div>;
  const choices = app.exportChoices();
  const choice = app.exportChoice();
  const plan = app.exportPlan();
  const planProblems = plan?.problems ?? [];
  const blocking = planProblems.some((p) => p.severity === 'error');
  const shown = s.outcome ? s.outcome.problems : planProblems;
  const what = s.host === 'ae' ? 'Композиция' : 'Секвенция';
  const range = s.host === 'ae' ? 'рабочая область' : 'от In до Out, без меток — вся секвенция';
  return (
    <div class="export">
      <p class="hint">{what} «{t.name}», {t.w}×{t.h} · {sec(t.fps)} к/с. Диапазон — {range}.</p>
      {choices.length ? (
        <div class="presets" role="listbox" aria-label="Пресет">
          {choices.map(({ preset, fit }) => (
            <button key={preset.id} role="option" aria-selected={choice?.id === preset.id} class={'preset' + (choice?.id === preset.id ? ' on' : '')}
              onClick={() => app.setExportPreset(preset.id)}>
              <span class="preset-title">{preset.title}</span>
              <span class="preset-meta">{preset.w}×{preset.h} · {sec(preset.fps)} к/с{fit !== 'same' ? ` · ${fitLabel(fit)}` : ''}</span>
            </button>
          ))}
        </div>
      ) : <div class="empty">{messages.exportNone(t.w, t.h)}</div>}
      <div class="seg" role="group" aria-label="Как экспортировать">
        {app.exportModes().map((m) => <button key={m.key} class={s.exportMode === m.key ? 'on' : ''} onClick={() => app.setExportMode(m.key)}>{m.label_ru}</button>)}
      </div>
      <p class="hint">{MODE_HINT[s.exportMode]}</p>
      <p class="hint path" title="Папка экспорта">{app.exportFolder()}</p>
      <div class="actions">
        <Problems list={shown} />
        <button class="insert" disabled={s.busy || !choice || (blocking && !s.outcome)} onClick={() => void app.exportNow()}>
          {s.busy ? (s.host === 'ae' ? 'Рендер…' : 'Экспорт…') : EXPORT_BUTTON[s.exportMode]}
        </button>
        {s.outcome?.ok && (
          <div class="done">
            {s.outcome.note}
            {s.outcome.file && <button class="link" onClick={() => app.reveal(s.outcome!.file!)}>Показать в папке</button>}
          </div>
        )}
        {app.backgroundJobs().length > 0 && (
          <ul class="jobs">
            {app.backgroundJobs().map((b) => (
              <li key={b.file} class={b.status}>
                <span>{b.status === 'running' ? 'В фоне' : b.status === 'done' ? 'Готово' : 'Ошибка'}: {b.file.split('/').pop()}</span>
                {b.status === 'done' && <button class="link" onClick={() => app.reveal(b.file)}>Показать в папке</button>}
                {b.message && <div class="error">{b.message}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>
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

// The poster is a picture of its own on top of the video and comes back as soon as the cursor leaves: a
// rewound <video> shows its first frame instead of the poster, which for a logo is an almost empty dark
// frame (preview check 2026-10-05).
function Preview({ item, ui, playing, media }: { item: Item; ui: UiServices; playing: boolean; media?: PreviewMedia }) {
  const video = useRef<HTMLVideoElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (playing) {
      void v.play().then(() => setShown(true)).catch(() => undefined);
    } else {
      setShown(false);
      v.pause();
      v.currentTime = 0;
    }
  }, [playing]);
  const clip = media ? media.video : item.preview;
  const still = media ? media.poster : item.poster;
  const poster = still ? ui.fileUrl(still.file) : undefined;
  return (
    <div class="thumb">
      {clip && <video ref={video} src={ui.fileUrl(clip.file)} muted loop playsInline preload="none" />}
      {poster ? <img class={'poster' + (clip && shown ? ' off' : '')} src={poster} alt="" /> : !clip && <div class="mark" />}
    </div>
  );
}

// The file of a sound item to listen to: its .wav variant.
export function soundFile(item: Item): string | null {
  return item.variants.find((v) => /\.wav$/i.test(v.file ?? ''))?.file ?? null;
}

// One sound plays at a time across the panel (spec 7 «Звуки: прослушивание и вставка»).
let playingAudio: HTMLAudioElement | null = null;

function SoundPlayer({ src }: { src: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [length, setLength] = useState<number | null>(null);
  const toggle = (e: Event) => {
    e.stopPropagation();
    const a = audio.current;
    if (!a) return;
    if (!a.paused) {
      a.pause();
      a.currentTime = 0;
      return;
    }
    if (playingAudio && playingAudio !== a) {
      playingAudio.pause();
      playingAudio.currentTime = 0;
    }
    playingAudio = a;
    void a.play().catch(() => setPlaying(false));
  };
  return (
    <div class="sound">
      <audio ref={audio} src={src} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
        onLoadedMetadata={(e) => setLength((e.target as HTMLAudioElement).duration)} />
      <button class={'sound-play' + (playing ? ' on' : '')} title={playing ? 'Остановить' : 'Прослушать'} onClick={toggle}>{playing ? '■' : '▶'}</button>
      {length !== null && Number.isFinite(length) && <span class="sound-length">{sec(length)} с</span>}
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
      {soundFile(item) && !item.preview ? <SoundPlayer src={ui.fileUrl(soundFile(item)!)} /> : <Preview item={item} ui={ui} playing={hover} />}
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
  const preset = app.isPreset(item);
  return (
    <>
      <div class="form-head">
        <button class="back" onClick={() => app.back()} title="К каталогу">←</button>
        <h2>{item.title_ru}</h2>
        <button class={'star' + (fav ? ' on' : '')} style={{ position: 'static' }} onClick={() => app.toggleFavorite(item.id)}>★</button>
      </div>
      {/* keyed by the file: another format or style loads its own preview (user 2026-10-05) */}
      <div class="hero">{soundFile(item) && !item.preview
        ? <SoundPlayer src={ui.fileUrl(soundFile(item)!)} />
        : (() => { const m = app.previewMedia(item); return <Preview key={m.video?.file ?? m.poster?.file ?? item.id} item={item} ui={ui} media={m} playing />; })()}</div>

      {preset && <p class="hint">Выделите в композиции слои: эффект ляжет на каждый из них, ключи — на текущее время.</p>}

      {!preset && <div class="row">
        <div class="field">
          <label for="f-format">Формат</label>
          <select id="f-format" value={s.manualVariant ?? ''} onChange={(e) => app.setVariant((e.target as HTMLSelectElement).value || null)}>
            <option value="">Авто{pick?.variant && !s.manualVariant ? ` (${pick.variant.aspect?.replace('x', ':') ?? pick.variant.key})` : ''}</option>
            {app.formatVariants(item).map((v) => <option key={v.key} value={v.key}>{variantLabel(v)}</option>)}
          </select>
        </div>
        {app.lengthEditable(item) && (
          <div class="field">
            <label for="f-length">Длительность, с</label>
            <input id="f-length" type="number" min="0" step="0.04" value={s.lengthSec ?? ''} placeholder={sec(app.lengthFor(item))}
              onInput={(e) => { const t = (e.target as HTMLInputElement).value; app.setLength(t === '' ? null : Number(t.replace(',', '.'))); }} />
          </div>
        )}
      </div>}

      {app.fields(item).map(({ field, mode }) => <FieldInput key={field.key} app={app} ui={ui} field={field} mode={mode} />)}

      {app.backdropOffered(item) && (
        <div class="field">
          <label class="check"><input type="checkbox" checked={app.backdropOn(item)} onChange={(e) => app.setBackdrop((e.target as HTMLInputElement).checked)} />Подложка #222222</label>
        </div>
      )}

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
          {s.busy ? (preset ? 'Применение…' : 'Вставка…') : preset ? 'Применить к выделенным' : 'Вставить на плейхед'}
        </button>
        {s.outcome?.ok && <div class="done">{s.outcome.note ?? `Вставлено${s.host === 'pr' ? ': клип выделен на таймлайне' : ': слой выделен в композиции'}.`}</div>}
      </div>
    </>
  );
}

function Status({ app, ui }: { app: PanelApp; ui: UiServices }) {
  const fonts = app.fontSummary();
  const [copied, setCopied] = useState(false);
  return (
    <footer class="status">
      {/* One line of text with its own separator: the gap of the flex row is not in the text itself, and the
          live checks read «на местеAE 26.5» (recheck 2026-10-05). */}
      <span class="facts"><span class={fonts.ok ? '' : 'bad'}>{fonts.text}</span>{' · '}{app.versions()}</span>
      {ui.copy && (
        <button onClick={async () => { ui.copy!(await app.diagnostics()); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? 'Скопировано' : 'Скопировать диагностику'}
        </button>
      )}
    </footer>
  );
}
