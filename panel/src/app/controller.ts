// State and actions of the panel (spec 7) on top of the core. The UI renders this state and calls these
// actions; it never talks to CSInterface or Node itself (spec 6: «Интерфейс знает только API ядра»).
import { formFields } from '../core/fields';
import type { HostCaller } from '../core/host';
import { planInsert, runInsert, type InsertPlan } from '../core/insert';
import { filterItems, itemsForHost, parseCatalog, usedCategories, CATEGORIES } from '../core/library';
import type { Logger } from '../core/log';
import { FieldMemory, type KeyValueStore } from '../core/memory';
import type { Platform } from '../core/paths';
import { error, messages, type Problem } from '../core/problems';
import { defaultLengthSec } from '../core/timing';
import type { Catalog, Category, FieldValue, FontStatus, Host, HostContext, Item, Values } from '../core/types';
import { pickVariant, variantLabel, type VariantPick } from '../core/variant';
import { shortVersion } from '../core/version';

export interface Services {
  host: HostCaller;
  hostKey: Host;
  pluginVersion: string;
  platform: Platform;
  libraryRoot: string;
  readLibrary(): Promise<string | null>;
  store: KeyValueStore;
  logger?: Logger | null;
  // AE asks the host (FontObject); Premiere scans the font folders with Node.
  fonts?(names: string[]): Promise<Record<string, FontStatus>>;
}

export type View = 'catalog' | 'form';

export interface Outcome {
  ok: boolean;
  problems: Problem[];
  at: number;
}

export interface AppState {
  phase: 'loading' | 'ready' | 'error';
  view: View;
  host: Host;
  context: HostContext | null;
  catalog: Catalog | null;
  items: Item[];
  libraryProblems: Problem[];
  query: string;
  category: Category | 'favorites' | null;
  favorites: Set<string>;
  selectedId: string | null;
  values: Values;
  lengthSec: number | null;
  manualVariant: string | null;
  sound: { music: boolean; sfx: boolean };
  fonts: Record<string, FontStatus> | null;
  plan: InsertPlan | null;
  busy: boolean;
  outcome: Outcome | null;
  // The nearest variant waits for the user's consent (spec 4.3).
  consent: { key: string; label: string } | null;
}

type Listener = (s: AppState) => void;

export class PanelApp {
  state: AppState;
  private readonly memory: FieldMemory;
  private readonly listeners = new Set<Listener>();

  constructor(private readonly svc: Services) {
    this.memory = new FieldMemory(svc.store);
    this.state = {
      phase: 'loading',
      view: 'catalog',
      host: svc.hostKey,
      context: null,
      catalog: null,
      items: [],
      libraryProblems: [],
      query: '',
      category: null,
      favorites: this.memory.favorites(),
      selectedId: null,
      values: {},
      lengthSec: null,
      manualVariant: null,
      sound: this.memory.sound(),
      fonts: null,
      plan: null,
      busy: false,
      outcome: null,
      consent: null,
    };
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  private log(level: 'info' | 'warn' | 'error', event: string, data?: Record<string, unknown>): void {
    this.svc.logger?.log(level, event, data);
  }

  // ---- Start-up ----

  async init(): Promise<void> {
    const text = await this.svc.readLibrary().catch(() => null);
    if (text === null) {
      this.set({ phase: 'error', libraryProblems: [error('LIBRARY', messages.library(`нет файла ${this.svc.libraryRoot}/library.json`))] });
      this.log('error', 'library.missing', { root: this.svc.libraryRoot });
      return;
    }
    const loaded = parseCatalog(text, this.svc.pluginVersion);
    if (!loaded.catalog) {
      this.set({ phase: 'error', libraryProblems: loaded.problems });
      this.log('error', 'library.refused', { problems: loaded.problems.map((p) => p.code) });
      return;
    }
    this.set({ phase: 'ready', catalog: loaded.catalog, items: itemsForHost(loaded.catalog, this.svc.hostKey), libraryProblems: loaded.problems });
    this.log('info', 'start', { host: this.svc.hostKey, plugin: this.svc.pluginVersion, library: loaded.catalog.libraryVersion });
    await this.refreshContext();
    await this.refreshFonts();
  }

  async refreshContext(): Promise<HostContext | null> {
    const r = await this.svc.host.call<HostContext>('getContext');
    const context = r.ok && r.data ? r.data : null;
    this.set({ context });
    this.replan();
    return context;
  }

  async refreshFonts(): Promise<void> {
    if (!this.svc.fonts || !this.state.catalog) return;
    const names = [...new Set(this.state.items.flatMap((i) => (i.requiredFonts ?? []).map((f) => f.postScriptName)))];
    if (!names.length) return;
    try {
      this.set({ fonts: await this.svc.fonts(names) });
    } catch (e) {
      this.log('warn', 'fonts.failed', { error: String(e) });
    }
    this.replan();
  }

  // ---- Catalog ----

  visibleItems(): Item[] {
    return filterItems(this.state.items, { query: this.state.query, category: this.state.category, favorites: this.state.favorites });
  }

  categories(): Array<{ key: Category | 'favorites'; label_ru: string }> {
    const used = usedCategories(this.state.items);
    return [{ key: 'favorites' as const, label_ru: 'Избранное' }, ...used];
  }

  setQuery(query: string): void {
    this.set({ query });
  }

  setCategory(category: Category | 'favorites' | null): void {
    this.set({ category: this.state.category === category ? null : category });
  }

  toggleFavorite(id: string): void {
    this.set({ favorites: this.memory.toggleFavorite(id) });
  }

  // ---- Form ----

  selected(): Item | null {
    return this.state.items.find((i) => i.id === this.state.selectedId) ?? null;
  }

  open(id: string): void {
    const item = this.state.items.find((i) => i.id === id);
    if (!item) return;
    this.set({ view: 'form', selectedId: id, values: this.memory.load(item), lengthSec: null, manualVariant: null, outcome: null, consent: null });
    this.replan();
  }

  back(): void {
    this.set({ view: 'catalog', outcome: null, consent: null });
  }

  setValue(key: string, value: FieldValue): void {
    this.set({ values: { ...this.state.values, [key]: value }, consent: null });
    this.replan();
  }

  setLength(sec: number | null): void {
    this.set({ lengthSec: sec !== null && Number.isFinite(sec) ? sec : null, consent: null });
    this.replan();
  }

  setVariant(key: string | null): void {
    this.set({ manualVariant: key, consent: null });
    this.replan();
  }

  setSound(sound: { music: boolean; sfx: boolean }): void {
    this.memory.setSound(sound);
    this.set({ sound });
  }

  // The length shown in the form: what the user typed, else the one the item proposes.
  lengthFor(item: Item): number {
    return this.state.lengthSec ?? defaultLengthSec(item, this.state.values);
  }

  // The variant for the format chip: manual or by the frame of the active comp or sequence.
  pick(item: Item | null = this.selected()): VariantPick | null {
    const t = this.state.context?.target;
    if (!item || !t) return null;
    return pickVariant(item, t, this.state.values, this.state.manualVariant);
  }

  formatChip(): string {
    const t = this.state.context?.target;
    const item = this.selected();
    if (!t) return this.state.host === 'ae' ? 'Нет композиции' : 'Нет секвенции';
    const fps = `${Math.round(t.fps * 100) / 100}p`;
    const p = item ? this.pick(item) : null;
    const v = p?.variant;
    if (v) return `${this.state.manualVariant ? 'Вручную' : 'Авто'} ${variantLabel(v)}`;
    return `Авто ${t.w}×${t.h} · ${fps}`;
  }

  fields(item: Item) {
    return formFields(item, this.state.host);
  }

  private replan(): void {
    const item = this.selected();
    const ctx = this.state.context;
    if (!item || !ctx) {
      this.set({ plan: null });
      return;
    }
    const plan = planInsert({
      item,
      ctx,
      values: this.state.values,
      fonts: this.state.fonts,
      options: { lengthSec: this.state.lengthSec, variantKey: this.state.manualVariant, acceptNearest: true },
      env: { platform: this.svc.platform, libraryRoot: this.svc.libraryRoot },
    });
    this.state = { ...this.state, plan };
    for (const fn of this.listeners) fn(this.state);
  }

  // ---- Insert on click (spec 6.1) ----

  async insert(acceptNearest = false): Promise<Outcome> {
    const item = this.selected();
    if (!item || this.state.busy) return { ok: false, problems: [], at: Date.now() };
    this.set({ busy: true, outcome: null });
    try {
      // The playhead and the active comp or sequence of this very moment.
      const ctx = await this.refreshContext();
      if (!ctx) return this.finish({ ok: false, problems: [error('NO_TARGET', messages.noTarget(this.state.host))], at: Date.now() });
      const plan = planInsert({
        item,
        ctx,
        values: this.state.values,
        fonts: this.state.fonts,
        options: { lengthSec: this.state.lengthSec, variantKey: this.state.manualVariant, acceptNearest },
        env: { platform: this.svc.platform, libraryRoot: this.svc.libraryRoot },
      });
      if (!plan.ok || !plan.request) {
        const nearest = plan.problems.find((p) => p.code === 'NO_VARIANT' && (p.detail as { key?: string } | undefined)?.key);
        const key = nearest ? (nearest.detail as { key: string }).key : null;
        const v = key ? item.variants.find((x) => x.key === key) : null;
        this.set({ consent: !acceptNearest && v && plan.problems.filter((p) => p.severity === 'error').length === 1 ? { key: v.key, label: variantLabel(v) } : null });
        this.log('warn', 'insert.refused', { id: item.id, problems: plan.problems.map((p) => p.code) });
        return this.finish({ ok: false, problems: plan.problems, at: Date.now() });
      }
      const labels = Object.fromEntries((item.fields ?? []).map((f) => [f.key, f.label_ru]));
      const out = await runInsert(this.svc.host, this.state.host, plan.request, labels);
      const problems = [...plan.problems, ...out.problems];
      if (out.ok) this.memory.save(item, this.state.values);
      this.log(out.ok ? 'info' : 'error', out.ok ? 'insert.done' : 'insert.failed', {
        id: item.id,
        variant: plan.request.variant.key,
        lengthSec: plan.request.lengthSec,
        problems: problems.map((p) => p.code),
        reply: out.reply ? { name: out.reply.name, track: out.reply.track, retried: out.reply.retried, notes: out.reply.notes } : null,
      });
      return this.finish({ ok: out.ok, problems, at: Date.now() });
    } catch (e) {
      this.log('error', 'insert.exception', { error: String(e) });
      return this.finish({ ok: false, problems: [error('HOST_ERROR', messages.hostError(this.state.host, String(e)))], at: Date.now() });
    }
  }

  private finish(outcome: Outcome): Outcome {
    this.set({ busy: false, outcome, consent: outcome.ok ? null : this.state.consent });
    return outcome;
  }

  // ---- Status line and diagnostics (spec 7, 8.2) ----

  fontSummary(): { ok: boolean; text: string } {
    const f = this.state.fonts;
    if (!f) return { ok: true, text: 'Шрифты не проверены' };
    const missing = Object.entries(f).filter(([, s]) => !s.found || s.substitute).map(([n]) => n);
    return missing.length ? { ok: false, text: `Нет шрифтов: ${missing.join(', ')}` } : { ok: true, text: 'Шрифты SB Sans на месте' };
  }

  versions(): string {
    const app = this.state.host === 'ae' ? 'AE' : 'Pr';
    const v = this.state.context ? shortVersion(this.state.context.version) : '—';
    const lib = this.state.catalog?.libraryVersion ?? '—';
    return `${app} ${v} · панель ${this.svc.pluginVersion} · библиотека ${lib}`;
  }

  async diagnostics(): Promise<string> {
    const d = await this.svc.host.call('diag');
    return JSON.stringify({
      plugin: this.svc.pluginVersion,
      platform: this.svc.platform,
      libraryRoot: this.svc.libraryRoot,
      libraryVersion: this.state.catalog?.libraryVersion ?? null,
      items: this.state.items.map((i) => `${i.id}@${i.version}`),
      libraryProblems: this.state.libraryProblems,
      host: d.ok ? d.data : d.error,
      context: this.state.context,
      fonts: this.state.fonts,
      lastOutcome: this.state.outcome,
    }, null, 2);
  }
}

export { CATEGORIES };
