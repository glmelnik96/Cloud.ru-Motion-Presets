// State and actions of the panel (spec 7) on top of the core. The UI renders this state and calls these
// actions; it never talks to CSInterface or Node itself (spec 6: «Интерфейс знает только API ядра»).
import { isPreset, planPreset, runPreset } from '../core/effects';
import { formFields } from '../core/fields';
import { previewFor, type PreviewMedia } from '../core/previews';
import type { HostCaller } from '../core/host';
import { planItem, runInsert, runMedia, type InsertOptions, type InsertPlan } from '../core/insert';
import { filterItems, itemsForHost, parseCatalog, usedCategories, CATEGORIES } from '../core/library';
import type { Logger } from '../core/log';
import { backdropDefault, CUT_WINDOW_SEC, defaultMediaLengthSec, mediaKind, pickMediaVariant, placeable, type Prepare } from '../core/media';
import { FieldMemory, type KeyValueStore } from '../core/memory';
import type { Platform } from '../core/paths';
import { error, messages, type Problem } from '../core/problems';
import { defaultLengthSec } from '../core/timing';
import type { Catalog, Category, FieldValue, FontStatus, Host, HostContext, Item, Values, Variant } from '../core/types';
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
  // Copies library files next to the project and writes the backdrop still before the host call (P11).
  prepareFiles?(prepare: Prepare): Promise<{ copied: string[]; reused: string[]; written: string[] }>;
}

export type View = 'catalog' | 'form';

export interface Outcome {
  ok: boolean;
  problems: Problem[];
  at: number;
  // What the result line says instead of «Вставлено…» (effects: the layers the preset went on).
  note?: string;
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
  // The #222222 backdrop under an alpha loop or still; null: the default of the item.
  backdrop: boolean | null;
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
      backdrop: null,
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
    this.set({ view: 'form', selectedId: id, values: this.memory.load(item), lengthSec: null, manualVariant: null, backdrop: null, outcome: null, consent: null });
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
    this.replan();
  }

  setBackdrop(on: boolean): void {
    this.set({ backdrop: on });
    this.replan();
  }

  // The length shown in the form: what the user typed, else the one the item proposes.
  lengthFor(item: Item): number {
    if (this.state.lengthSec !== null) return this.state.lengthSec;
    if (item.tier === 'T1') return defaultLengthSec(item, this.state.values);
    return defaultMediaLengthSec(item, this.pick(item)?.variant ?? null, this.state.context?.target ?? null) ?? 0;
  }

  // A brand .ffx for the selected layers (AE): no format, length or fields, the button applies it.
  isPreset(item: Item): boolean {
    return isPreset(item);
  }

  // Templates, loops and stills take a length; a transition, a clip or a sound keeps its own.
  lengthEditable(item: Item): boolean {
    if (isPreset(item)) return false;
    if (item.tier === 'T1') return true;
    const v = this.pick(item)?.variant;
    const kind = v ? mediaKind(item, v) : null;
    return kind === 'loop' || kind === 'still';
  }

  // The #222222 backdrop checkbox: alpha loops and stills.
  backdropOffered(item: Item): boolean {
    return item.alpha === true && this.lengthEditable(item) && item.tier !== 'T1';
  }

  backdropOn(item: Item): boolean {
    return this.state.backdrop ?? backdropDefault(item);
  }

  // Variants of the format switch: for files only the ones the panel places (a .png, not its .svg twin).
  formatVariants(item: Item): Variant[] {
    return item.tier === 'T1' ? item.variants : item.variants.filter(placeable);
  }

  // The variant for the format chip: manual or by the frame of the active comp or sequence.
  pick(item: Item | null = this.selected()): VariantPick | null {
    const t = this.state.context?.target;
    if (!item || !t) return null;
    if (item.tier !== 'T1') return pickMediaVariant(item, t, this.state.manualVariant);
    return pickVariant(item, t, this.state.values, this.state.manualVariant);
  }

  private lookup = (id: string): Item | undefined => this.state.catalog?.items.find((i) => i.id === id);

  private options(acceptNearest: boolean, cuts: number[] | null = null): InsertOptions {
    return { lengthSec: this.state.lengthSec, variantKey: this.state.manualVariant, acceptNearest, sound: this.state.sound, backdrop: this.state.backdrop, cuts };
  }

  // The preview of the form: the format in use and the values of the form.
  previewMedia(item: Item): PreviewMedia {
    return previewFor(item, this.pick(item)?.variant?.key ?? null, this.state.values);
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
    if (isPreset(item)) {
      // The selection is checked at the click: AE does not tell the panel when it changes.
      const p = planPreset(item, { ...ctx, selection: Math.max(1, ctx.selection ?? 0) }, this.svc.libraryRoot);
      this.state = { ...this.state, plan: { ok: p.ok, problems: p.problems, pick: null, request: null } };
      for (const fn of this.listeners) fn(this.state);
      return;
    }
    const plan = planItem({
      item,
      ctx,
      values: this.state.values,
      fonts: this.state.fonts,
      options: this.options(true),
      env: { platform: this.svc.platform, libraryRoot: this.svc.libraryRoot },
      lookup: this.lookup,
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
      if (isPreset(item)) return this.finish(await this.applyPreset(item, ctx));
      const cuts = await this.cutsFor(item, ctx);
      const plan = planItem({
        item,
        ctx,
        values: this.state.values,
        fonts: this.state.fonts,
        options: this.options(acceptNearest, cuts),
        env: { platform: this.svc.platform, libraryRoot: this.svc.libraryRoot },
        lookup: this.lookup,
      });
      if (!plan.ok || (!plan.request && !plan.media)) {
        const nearest = plan.problems.find((p) => p.code === 'NO_VARIANT' && (p.detail as { key?: string } | undefined)?.key);
        const key = nearest ? (nearest.detail as { key: string }).key : null;
        const v = key ? item.variants.find((x) => x.key === key) : null;
        this.set({ consent: !acceptNearest && v && plan.problems.filter((p) => p.severity === 'error').length === 1 ? { key: v.key, label: variantLabel(v) } : null });
        this.log('warn', 'insert.refused', { id: item.id, problems: plan.problems.map((p) => p.code) });
        return this.finish({ ok: false, problems: plan.problems, at: Date.now() });
      }
      const prepare = plan.media ? plan.media.prepare : plan.request!.prepare;
      const files = await this.prepareFiles(prepare);
      if (files) return this.finish({ ok: false, problems: [...plan.problems, files], at: Date.now() });
      if (plan.media) {
        const m = await runMedia(this.svc.host, this.state.host, plan.media);
        const problems = [...plan.problems, ...m.problems];
        this.log(m.ok ? 'info' : 'error', m.ok ? 'insert.done' : 'insert.failed', {
          id: item.id,
          variant: plan.media.variant.key,
          kind: plan.media.kind,
          lengthSec: plan.media.lengthSec,
          problems: problems.map((p) => p.code),
          reply: m.reply ? { placed: m.reply.placed, imported: m.reply.imported, addedTracks: m.reply.addedTracks } : null,
        });
        return this.finish({ ok: m.ok, problems, at: Date.now() });
      }
      const request = plan.request!;
      const labels = Object.fromEntries((item.fields ?? []).map((f) => [f.key, f.label_ru]));
      const out = await runInsert(this.svc.host, this.state.host, request, labels);
      const problems = [...plan.problems, ...out.problems];
      if (out.ok) this.memory.save(item, this.state.values);
      this.log(out.ok ? 'info' : 'error', out.ok ? 'insert.done' : 'insert.failed', {
        id: item.id,
        variant: request.variant.key,
        lengthSec: request.lengthSec,
        problems: problems.map((p) => p.code),
        reply: out.reply ? { name: out.reply.name, track: out.reply.track, retried: out.reply.retried, notes: out.reply.notes, companions: out.reply.companions } : null,
      });
      return this.finish({ ok: out.ok, problems, at: Date.now() });
    } catch (e) {
      this.log('error', 'insert.exception', { error: String(e) });
      return this.finish({ ok: false, problems: [error('HOST_ERROR', messages.hostError(this.state.host, String(e)))], at: Date.now() });
    }
  }

  private async applyPreset(item: Item, ctx: HostContext): Promise<Outcome> {
    const plan = planPreset(item, ctx, this.svc.libraryRoot);
    if (!plan.ok || !plan.request) {
      this.log('warn', 'preset.refused', { id: item.id, problems: plan.problems.map((p) => p.code) });
      return { ok: false, problems: plan.problems, at: Date.now() };
    }
    const out = await runPreset(this.svc.host, plan.request);
    this.log(out.ok ? 'info' : 'error', out.ok ? 'preset.done' : 'preset.failed', { id: item.id, problems: out.problems.map((p) => p.code), reply: out.reply });
    const on = out.reply?.layers.filter((l) => l.changed).map((l) => l.name) ?? [];
    return { ok: out.ok, problems: out.problems, at: Date.now(), note: out.ok ? `Применено к слоям: ${on.join(', ')}.` : undefined };
  }

  // Premiere: the edges of the clips around the playhead, for a transition (decision P13).
  private async cutsFor(item: Item, ctx: HostContext): Promise<number[] | null> {
    if (ctx.host !== 'pr' || item.cutFrame === undefined || !ctx.target) return null;
    const r = await this.svc.host.call<{ cuts: number[] }>('getCuts', { targetId: ctx.target.id, aroundSec: ctx.target.timeSec, windowSec: CUT_WINDOW_SEC });
    return r.ok && r.data ? r.data.cuts : [];
  }

  // The copies and the backdrop still; a problem when they could not be made (nothing in the host changed).
  private async prepareFiles(prepare: Prepare): Promise<Problem | null> {
    if (!prepare.copies.length && !prepare.solids.length) return null;
    if (!this.svc.prepareFiles) return error('FILES', messages.files('нет доступа к файлам'));
    try {
      const r = await this.svc.prepareFiles(prepare);
      this.log('info', 'files.prepared', { copied: r.copied.length, reused: r.reused.length, written: r.written.length });
      return null;
    } catch (e) {
      this.log('error', 'files.failed', { error: String(e) });
      return error('FILES', messages.files(String((e as Error)?.message ?? e)));
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
