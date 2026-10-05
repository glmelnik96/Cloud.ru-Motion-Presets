// The composition root of the panel (plan 2026-10-05, task 9): the CEP services, the host bridge and the core flow
// wired together, with no DOM. The UI talks to a PanelApp and to nothing else: it loads the library, asks for the
// context, prepares and inserts an item, remembers values and the manual variant, and copies the diagnostics.
// Everything is awaitable and every failure is turned into Issues: nothing here throws to the UI.
import { createBridge, type HostBridge } from './bridge/host';
import { defaultLen } from './core/duration';
import { defaults, merge, type Values } from './core/fields';
import { buildArgs, planInsert, runInsert, type InsertOutcome } from './core/insert';
import { itemsFor, parseLibrary } from './core/library';
import { createLogger, type Logger } from './core/log';
import type {
  FontStatus, HostContext, HostError, HostKey, HostReply, InsertPlan, Issue, Item, Library,
} from './core/types';
import { validateCatalog } from './core/validate-catalog';
import { chooseVariant, type VariantChoice } from './core/variant';
import { createCep, systemInfo, type CepWindow, type HostEnv } from './services/cep';
import { createFiles, type Files } from './services/files';
import { fontDirs, fontStatus, scanFonts, type ScannedFont } from './services/fonts';
import { createLogSink, logDir } from './services/logsink';
import { createSettings, settingsPath, type Settings, type StorageLike } from './services/settings';

type Target = NonNullable<HostContext['target']>;
type RequiredFont = NonNullable<Item['requiredFonts']>[number];

// The codes this file makes itself (the core has the rest); ui/issues.ts has a Russian text for each.
export const APP_CODES = ['PANEL_BOOT_FAILED', 'PANEL_ERROR', 'ITEM_NOT_FOUND', 'INSERT_BUSY'] as const;

export interface AppWindow extends CepWindow {
  localStorage?: StorageLike;
}

export interface Versions {
  plugin: string; // __CRBK_VERSION__, panel/version.json
  build: string; // __CRBK_BUILD__, the stamp of the adapters shipped with this panel
}

// What the flow needs of the world. buildServices makes the real ones from the window; the tests bring fakes.
export interface Services {
  host: HostKey;
  hostEnv: HostEnv;
  files: Pick<Files, 'readText' | 'native'>;
  settings: Settings;
  bridge: HostBridge;
  logger: Logger;
  // The statuses of fonts a template needs: Premiere from the Node scan of the font folders (once, cached), After
  // Effects from the host. null: the check itself failed (FONT_CHECK_FAILED), which is not the same as missing.
  checkFonts(required: readonly RequiredFont[]): Promise<FontStatus[] | null>;
  flushLog(): Promise<void>;
  versions: Versions;
  paths: { settings: string; logs: string; extension: string };
  now: () => Date;
}

export interface AppOptions {
  win: AppWindow;
  now?: () => Date;
  services?: Services; // tests: fakes instead of the services built from win
  versions?: Versions; // tests: instead of the build constants
}

// The library alone: what the catalog screen needs, which a slow or stuck host must not hold up.
export interface CatalogResult {
  ok: boolean; // the library loaded
  issues: Issue[]; // why not
  library: Library | null;
  items: Item[]; // what this host can insert, in the order of the library
  root: string | null;
}

// The library and the adapter.
export interface StartResult extends CatalogResult {
  // ok: nothing is wrong, the adapter answered as well. issues: the adapter's (if any), then the library's.
  adapter: boolean;
  adapterIssue: Issue | null;
}

export interface InsertRequest {
  itemId: string;
  values: Values;
  lenSec: number;
  // A variant to insert whatever the frame; null: none, the frame decides. Absent: what the user picked by hand for
  // the frame of the target as the host reports it for this very insert (never one picked for another frame).
  manualKey?: string | null;
}

export interface Prepared {
  ok: boolean; // no error among the issues: the insert may go ahead
  issues: Issue[]; // errors first, as the core gives them
  plan?: InsertPlan; // absent when the item or the context could not be had
  choice?: VariantChoice;
  ctx?: HostContext;
}

export type InsertPhase = 'checking' | 'inserting';

export interface Diagnostics {
  generatedAt: string;
  versions: { plugin: string; build: string; library: string | null; host: HostKey | null; hostVersion: string | null };
  paths: { libraryRoot: string | null; settings: string; logs: string; extension: string };
  context: HostReply<HostContext>;
  adapter: HostReply<Record<string, unknown>>;
  fonts: { required: string[]; statuses: FontStatus[] | null };
}

export interface AppInfo {
  host: HostKey | null;
  hostVersion: string | null;
  plugin: string;
  build: string;
  library: string | null;
  libraryRoot: string | null;
}

export interface PanelApp {
  catalog(): Promise<CatalogResult>; // the library only; once, the same answer for every caller
  start(): Promise<StartResult>; // the adapter and the library; once, the same answer for every caller
  reload(): Promise<StartResult>; // start again (the «Повторить» button)
  info(): AppInfo;
  library(): Library | null;
  items(): Item[];
  context(): Promise<HostReply<HostContext>>;
  fonts(): Promise<FontStatus[] | null>; // the fonts of the whole library, for the status bar
  initialValues(item: Item): Values; // the defaults under what was remembered for the item
  manualVariant(item: Item, target: Target | null): string | null;
  setManualVariant(item: Item, target: Target | null, key: string | null): boolean;
  prepare(req: InsertRequest): Promise<Prepared>;
  insert(req: InsertRequest, onPhase?: (phase: InsertPhase) => void): Promise<InsertOutcome>;
  diagnostics(): Promise<Diagnostics>;
  flushLog(): Promise<void>;
}

const reason = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const error = (code: string, params?: Issue['params']): Issue => (params ? { code, level: 'error', params } : { code, level: 'error' });
const panelError = (e: unknown): Issue => error('PANEL_ERROR', { detail: reason(e) });
const isMissing = (e: unknown): boolean => {
  const code = e && typeof e === 'object' ? (e as { code?: unknown }).code : undefined;
  return code === 'ENOENT' || code === 'ENOTDIR';
};

// A host or bridge failure as the issue the user sees.
export function hostIssue(e: HostError): Issue {
  const params: Record<string, string | number> = {};
  if (e.message) params.detail = e.message;
  if (typeof e.line === 'number') params.line = e.line;
  return Object.keys(params).length ? { code: e.code, level: 'error', params } : { code: e.code, level: 'error' };
}

// The first slice inserts T1 templates (a MOGRT in Premiere, a template comp in AE); the file items of T2 and T3 come
// later, and a host hides what it cannot insert (spec 6, 7).
const insertable = (item: Item): boolean => item.tier === 'T1';

const itemKey = (item: Item): string => item.id + '@' + item.version;
const frameKey = (t: Target): string => t.w + 'x' + t.h;

// window.localStorage may throw even to be read (storage denied); settings.ts catches every call on the object it
// gets, so the wrapper only has to keep that first read out of the construction.
function storageOf(win: AppWindow): StorageLike | null {
  try {
    if (!win.localStorage) return null;
  } catch {
    return null;
  }
  return {
    getItem: (k) => (win.localStorage as StorageLike).getItem(k),
    setItem: (k, v) => (win.localStorage as StorageLike).setItem(k, v),
    removeItem: (k) => (win.localStorage as StorageLike).removeItem(k),
  };
}

export function buildServices(win: AppWindow, now: () => Date, versions: Versions): Services {
  const cep = createCep(win);
  const nodeRequire = cep.nodeRequire();
  const files = createFiles(nodeRequire);
  const system = systemInfo(nodeRequire);
  const hostEnv = cep.hostEnv();
  const host = cep.host();
  const extension = cep.extensionPath();
  const settings = createSettings({
    files, storage: storageOf(win), env: system.env, platform: system.platform, home: system.home,
  });
  const logs = logDir(system.env, system.platform, system.home);
  const sink = createLogSink({ files, dir: logs, now });
  const logger = createLogger(sink.write, now);
  const bridge = createBridge({
    evalScript: cep.evalScript,
    readAdapterSource: () => files.readText(extension + '/host/' + host + '.jsx'),
    build: versions.build,
    log: (level, code, msg, data) => logger[level](code, msg, data),
  });

  // Premiere: the Windows font folder alone is some 450 MB, so it is scanned once (headers only) and kept.
  let scan: Promise<Map<string, ScannedFont>> | null = null;
  const scanned = () => (scan ??= scanFonts(files, fontDirs(system.env, system.platform, system.home)));

  async function checkFonts(required: readonly RequiredFont[]): Promise<FontStatus[] | null> {
    if (required.length === 0) return [];
    try {
      if (host === 'pr') {
        const found = await scanned();
        if (found.size === 0) {
          // No machine has no font at all: the folders could not be read, and "SB Sans is missing" would be a lie.
          scan = null;
          logger.warn('FONT_CHECK_FAILED', 'the scan of the font folders found no font at all', {});
          return null;
        }
        return fontStatus([...required], found);
      }
      const reply = await bridge.checkFonts(required.map((f) => f.postScriptName));
      if (reply.ok && Array.isArray(reply.data)) return reply.data;
      logger.warn('FONT_CHECK_FAILED', 'the host could not check fonts', reply.ok ? { reply: 'not a list' } : { error: reply.error });
      return null;
    } catch (e) {
      if (host === 'pr') scan = null; // a scan that failed is tried again next time
      logger.warn('FONT_CHECK_FAILED', 'font check threw', { reason: reason(e) });
      return null;
    }
  }

  return {
    host,
    hostEnv,
    files,
    settings,
    bridge,
    logger,
    checkFonts,
    flushLog: () => sink.flush(),
    versions,
    paths: { settings: settingsPath(system.env, system.platform, system.home), logs, extension },
    now,
  };
}

export const DIAG_WAIT_MS = 10000;

// Settles as p does, or with fallback after ms (the timer is dropped as soon as p settles).
function within<T, F>(p: Promise<T>, ms: number, fallback: F): Promise<T | F> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    void p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

const unanswered = (fn: string): HostReply<never> => ({
  ok: false,
  error: { code: 'TIMEOUT', message: fn + ': no answer in ' + DIAG_WAIT_MS + ' ms (diagnostics)' },
});

const settle = async <T>(call: () => Promise<HostReply<T>>): Promise<HostReply<T>> => {
  try {
    return await call();
  } catch (e) {
    return { ok: false, error: { code: 'HOST_BRIDGE_ERROR', message: reason(e) } };
  }
};

// The app of a panel that could not even start (no CEP runtime, Node off): every call says so.
function failedApp(issue: Issue, versions: Versions): PanelApp {
  const failedCatalog: CatalogResult = { ok: false, issues: [issue], library: null, items: [], root: null };
  const failed: StartResult = { ...failedCatalog, adapter: false, adapterIssue: issue };
  const lost: HostReply<never> = { ok: false, error: { code: 'PANEL_BOOT_FAILED', message: String(issue.params?.detail ?? '') } };
  return {
    catalog: async () => failedCatalog,
    start: async () => failed,
    reload: async () => failed,
    info: () => ({ host: null, hostVersion: null, plugin: versions.plugin, build: versions.build, library: null, libraryRoot: null }),
    library: () => null,
    items: () => [],
    context: async () => lost,
    fonts: async () => null,
    initialValues: () => ({}),
    manualVariant: () => null,
    setManualVariant: () => false,
    prepare: async () => ({ ok: false, issues: [issue] }),
    insert: async () => ({ ok: false, issues: [issue] }),
    diagnostics: async () => ({
      generatedAt: new Date().toISOString(),
      versions: { plugin: versions.plugin, build: versions.build, library: null, host: null, hostVersion: null },
      paths: { libraryRoot: null, settings: '', logs: '', extension: '' },
      context: lost,
      adapter: lost,
      fonts: { required: [], statuses: null },
    }),
    flushLog: async () => undefined,
  };
}

export function createApp(options: AppOptions): PanelApp {
  const now = options.now ?? (() => new Date());
  const versions = options.versions ?? { plugin: __CRBK_VERSION__, build: __CRBK_BUILD__ };
  let services: Services;
  try {
    services = options.services ?? buildServices(options.win, now, versions);
  } catch (e) {
    return failedApp(error('PANEL_BOOT_FAILED', { detail: reason(e) }), versions);
  }
  return createPanelApp(services);
}

function createPanelApp(s: Services): PanelApp {
  const { bridge, logger, settings } = s;
  let library: Library | null = null;
  let items: Item[] = [];
  let root: string | null = null;
  let cataloging: Promise<CatalogResult> | null = null;
  let adapting: Promise<HostReply<{ build: string }>> | null = null;
  let starting: Promise<StartResult> | null = null;
  let announced = false;
  let inserting = false;

  async function loadLibrary(): Promise<Issue[]> {
    let base: string;
    try {
      base = await settings.libraryRoot();
    } catch (e) {
      return [panelError(e)];
    }
    const file = base + '/library.json';
    let text: string;
    try {
      text = await s.files.readText(file);
    } catch (e) {
      // Not found or not readable: either way the panel has no library, and the cure is the same.
      logger.warn('LIBRARY_MISSING', 'cannot read ' + file, { reason: reason(e), missing: isMissing(e) });
      return [error('LIBRARY_MISSING', { path: s.files.native(file) })];
    }
    const parsed = parseLibrary(text, validateCatalog, s.versions.plugin);
    if (!parsed.ok) {
      logger.error(parsed.issues[0]?.code ?? 'LIBRARY_INVALID', 'library.json refused', { file, issues: parsed.issues });
      return parsed.issues;
    }
    library = parsed.library;
    items = itemsFor(parsed.library, s.host).filter(insertable);
    root = base;
    logger.info('LIBRARY_LOADED', 'library ' + library.libraryVersion, { root: base, items: items.length, host: s.host });
    return [];
  }

  const announce = () => {
    if (announced) return;
    announced = true;
    logger.info('APP_START', 'panel start', {
      plugin: s.versions.plugin, build: s.versions.build, host: s.host, hostVersion: s.hostEnv.appVersion,
    });
  };

  async function loadCatalog(): Promise<CatalogResult> {
    announce();
    const issues = await loadLibrary().catch((e) => [panelError(e)]);
    return { ok: issues.length === 0, issues, library, items, root };
  }

  // The library is the panel's own file and the adapter check queues in the bridge: they run side by side, and the
  // catalog does not wait for a host that is slow to answer.
  const catalog = (): Promise<CatalogResult> => (cataloging ??= loadCatalog());
  const adapter = (): Promise<HostReply<{ build: string }>> => (adapting ??= settle(() => bridge.ensureAdapter()));

  async function doStart(): Promise<StartResult> {
    announce();
    const [answer, cat] = await Promise.all([adapter(), catalog()]);
    const adapterIssue = answer.ok ? null : hostIssue(answer.error);
    const issues = adapterIssue ? [adapterIssue, ...cat.issues] : cat.issues;
    return { ok: issues.length === 0, issues, library: cat.library, items: cat.items, root: cat.root, adapter: answer.ok, adapterIssue };
  }

  const start = (): Promise<StartResult> => (starting ??= doStart());

  async function fonts(): Promise<FontStatus[] | null> {
    await catalog();
    const wanted = new Map<string, RequiredFont>();
    for (const item of items) for (const f of item.requiredFonts ?? []) if (!wanted.has(f.postScriptName)) wanted.set(f.postScriptName, f);
    return s.checkFonts([...wanted.values()]);
  }

  // Bound to the frame it was chosen for: a choice made for a QHD sequence must not follow the user to the next one
  // and silently put the wrong size into it (plan P1). A stored value that carries no frame is not used.
  function manualFor(item: Item, target: Target | null): string | null {
    const stored = target ? settings.manualVariant(item.id) : null;
    if (!stored || !target) return null;
    const at = stored.lastIndexOf('@');
    if (at < 0 || stored.slice(at + 1) !== frameKey(target)) return null;
    const key = stored.slice(0, at);
    return item.variants.some((v) => v.key === key) ? key : null;
  }

  async function prepare(req: InsertRequest): Promise<Prepared> {
    try {
      const cat = await catalog();
      if (!library || root === null) return { ok: false, issues: cat.issues.length ? cat.issues : [panelError('no library')] };
      const item = items.find((i) => i.id === req.itemId);
      if (!item) return { ok: false, issues: [error('ITEM_NOT_FOUND', { id: req.itemId })] };
      // A fresh context for every plan: the active comp or sequence and the playhead are the user's to move.
      const reply = await settle(() => bridge.getContext());
      if (!reply.ok) return { ok: false, issues: [hostIssue(reply.error)] };
      const ctx = reply.data;
      const statuses = await s.checkFonts(item.requiredFonts ?? []);
      // Judged on this context, not on the one the form was drawn from: the user may have changed sequences since.
      const manualKey = req.manualKey === undefined ? manualFor(item, ctx.target) : req.manualKey;
      const choice = chooseVariant(item, ctx.target, manualKey ?? undefined);
      const plan = planInsert({
        item, choice, values: req.values, lenSec: req.lenSec, ctx, fonts: statuses,
        pluginVersion: s.versions.plugin, minPluginVersion: library.minPluginVersion,
      });
      return { ok: !plan.issues.some((i) => i.level === 'error'), issues: plan.issues, plan, choice, ctx };
    } catch (e) {
      logger.error('PANEL_ERROR', 'prepare threw', { reason: reason(e) });
      return { ok: false, issues: [panelError(e)] };
    }
  }

  async function insert(req: InsertRequest, onPhase?: (phase: InsertPhase) => void): Promise<InsertOutcome> {
    // The host call is not idempotent: a second click while one runs must not queue a second insert.
    if (inserting) return { ok: false, issues: [error('INSERT_BUSY')] };
    inserting = true;
    const phase = (p: InsertPhase) => {
      try {
        onPhase?.(p);
      } catch {
        // a view that throws must not stop an insert
      }
    };
    try {
      phase('checking');
      const prepared = await prepare(req);
      const { plan, ctx } = prepared;
      if (!plan || !ctx || root === null) return { ok: false, issues: prepared.issues };
      if (prepared.ok) phase('inserting');
      // runInsert refuses a blocked plan itself (and logs it), so a refusal takes the same road as an insert.
      const outcome = await runInsert(bridge, plan, ctx, buildArgs(plan, ctx, root), logger);
      if (outcome.ok) {
        // It is in the project, whatever the read-back said: remember what the user typed.
        try {
          settings.remember(itemKey(plan.item), req.values);
        } catch (e) {
          logger.warn('REMEMBER_FAILED', 'values not remembered', { reason: reason(e) });
        }
      }
      return outcome;
    } catch (e) {
      logger.error('PANEL_ERROR', 'insert threw', { reason: reason(e) });
      return { ok: false, issues: [panelError(e)] };
    } finally {
      inserting = false;
    }
  }

  // The report is asked for when something is wrong, often a host that does not answer: it waits for each part at
  // most DIAG_WAIT_MS, side by side, and says which part did not come.
  async function diagnostics(): Promise<Diagnostics> {
    await within(catalog(), DIAG_WAIT_MS, null);
    const [context, report, statuses] = await Promise.all([
      within(settle(() => bridge.getContext()), DIAG_WAIT_MS, unanswered('getContext')),
      within(settle(() => bridge.diag()), DIAG_WAIT_MS, unanswered('diag')),
      within(fonts().catch(() => null), DIAG_WAIT_MS, null),
    ]);
    const required = new Set<string>();
    for (const item of items) for (const f of item.requiredFonts ?? []) required.add(f.postScriptName);
    return {
      generatedAt: s.now().toISOString(),
      versions: {
        plugin: s.versions.plugin,
        build: s.versions.build,
        library: library?.libraryVersion ?? null,
        host: s.host,
        hostVersion: context.ok ? context.data.hostVersion : s.hostEnv.appVersion,
      },
      paths: { libraryRoot: root, ...s.paths },
      context,
      adapter: report,
      fonts: { required: [...required], statuses },
    };
  }

  return {
    catalog,
    start,
    reload() {
      starting = null;
      cataloging = null;
      adapting = null;
      library = null;
      items = [];
      root = null;
      return start();
    },
    info: () => ({
      host: s.host,
      hostVersion: s.hostEnv.appVersion || null,
      plugin: s.versions.plugin,
      build: s.versions.build,
      library: library?.libraryVersion ?? null,
      libraryRoot: root,
    }),
    library: () => library,
    items: () => items,
    context: () => settle(() => bridge.getContext()),
    fonts,
    initialValues: (item) => merge(settings.remembered(itemKey(item)), item),
    manualVariant: manualFor,
    setManualVariant(item, target, key) {
      if (key === null) return settings.setManualVariant(item.id, null);
      if (!target || !item.variants.some((v) => v.key === key)) return false;
      return settings.setManualVariant(item.id, key + '@' + frameKey(target));
    },
    prepare,
    insert,
    diagnostics,
    flushLog: s.flushLog,
  };
}

// The dev test hook (window.__crbkTest, only in a dev build): what the live E2E drives the panel through over CDP
// (tools/panel/e2e.mjs). Everything it returns is plain JSON. Values default to the library's and a partial set
// is laid over them, so a test names only the fields it cares about; the variant is by the frame of the target
// unless opts.variantKey says otherwise, and the length is the template's unless opts.lenSec does.
export interface TestOptions {
  variantKey?: string;
  lenSec?: number;
}

export interface TestHook {
  ready(): Promise<{ ok: boolean; issues: Issue[] }>;
  library(): Library | null;
  context(): Promise<HostReply<HostContext>>;
  prepare(itemId: string, values?: Values, opts?: TestOptions): Promise<Prepared>;
  insert(itemId: string, values?: Values, opts?: TestOptions): Promise<InsertOutcome>;
  diagnostics(): Promise<Diagnostics>;
}

const plain = <T>(v: T): T => (v === undefined ? (null as T) : (JSON.parse(JSON.stringify(v)) as T));

export function createTestHook(app: PanelApp): TestHook {
  async function request(itemId: string, values?: Values, opts?: TestOptions): Promise<InsertRequest> {
    await app.catalog();
    const item = app.items().find((i) => i.id === itemId);
    return {
      itemId,
      values: item ? { ...defaults(item), ...(values ?? {}) } : { ...(values ?? {}) },
      lenSec: opts?.lenSec ?? (item ? defaultLen(item) : 0),
      manualKey: opts?.variantKey ?? null,
    };
  }
  return {
    ready: async () => {
      const r = await app.start();
      return plain({ ok: r.ok, issues: r.issues });
    },
    library: () => plain(app.library()),
    context: async () => plain(await app.context()),
    prepare: async (itemId, values, opts) => plain(await app.prepare(await request(itemId, values, opts))),
    insert: async (itemId, values, opts) => plain(await app.insert(await request(itemId, values, opts))),
    diagnostics: async () => plain(await app.diagnostics()),
  };
}
