import { afterAll, describe, it, expect, vi } from 'vitest';
import {
  APP_CODES, createApp, createTestHook, DIAG_WAIT_MS, hostIssue, type AppWindow, type InsertRequest, type PanelApp, type Services,
  type Versions,
} from '../../panel/src/app';
import type { HostBridge } from '../../panel/src/bridge/host';
import { defaultLen } from '../../panel/src/core/duration';
import { defaults } from '../../panel/src/core/fields';
import { parseLibrary } from '../../panel/src/core/library';
import { createLogger, type LogEntry } from '../../panel/src/core/log';
import type {
  AeInsertArgs, FontStatus, HostContext, HostKey, HostReply, InsertResult, Issue, Item, Library, Placed, PlacedProbe,
  PrInsertArgs,
} from '../../panel/src/core/types';
import { validateCatalog } from '../../panel/src/core/validate-catalog';
import { createSettings, type StorageLike } from '../../panel/src/services/settings';
import { APP_MESSAGES, describeIssue } from '../../panel/src/ui/issues';
import * as fontFixtures from '../helpers/make-font.mjs';
import { aeCtx, catalog, item, prCtx } from './core/fixture';

// The panel tsconfig has no Node types (types: []); the tests run in Node, so the built-ins come in untyped.
const nodeModule = 'node:module';
const { createRequire } = (await import(nodeModule)) as { createRequire(url: string): (id: string) => any };
const req = createRequire(import.meta.url);
const nodeFs = req('fs');
const nodeOs = req('os');
const nodePath = req('path');
const nodeUrl = req('url');
const { sbFont } = fontFixtures as unknown as { sbFont(postScriptName: string, version: string): Uint8Array };

const REAL_LIBRARY = 'C:/CRBK/work/library/library.json';

describe('validateCatalog', () => {
  it('accepts a catalog the pipeline would write', () => {
    expect(validateCatalog(catalog())).toEqual({ ok: true, errors: [] });
  });

  it('accepts the real library built on this machine', ({ skip }) => {
    if (!nodeFs.existsSync(REAL_LIBRARY)) skip();
    const doc: unknown = JSON.parse(nodeFs.readFileSync(REAL_LIBRARY, 'utf8'));
    expect(validateCatalog(doc)).toEqual({ ok: true, errors: [] });
  });

  it('says what is wrong with a broken copy, schema errors and cross-field rules alike', () => {
    const broken = catalog();
    (broken.items[0] as unknown as Record<string, unknown>).colour = 'green'; // a schema error
    const schema = validateCatalog(broken);
    expect(schema.ok).toBe(false);
    expect(schema.errors).toContain('schema: /items/0 unknown property "colour"');

    const twice = catalog();
    const lower = twice.items[2]!;
    lower.fields![1]!.egpName = lower.fields![0]!.egpName; // a cross-field rule: egpName used twice
    const cross = validateCatalog(twice);
    expect(cross.ok).toBe(false);
    expect(cross.errors.join('\n')).toMatch(/egp-name.*used twice/);
  });

  it('refuses anything that is not a catalog without throwing', () => {
    for (const doc of [null, undefined, 42, 'library', [], {}]) {
      const r = validateCatalog(doc);
      expect(r.ok).toBe(false);
      expect(r.errors.length).toBeGreaterThan(0);
    }
  });

  it('is what parseLibrary needs: a broken file becomes LIBRARY_INVALID, a good one a library', () => {
    const broken = catalog();
    (broken as unknown as Record<string, unknown>).libraryVersion = 'today';
    const bad = parseLibrary(JSON.stringify(broken), validateCatalog, '0.1.0');
    expect(bad.ok).toBe(false);
    expect(bad.issues[0]?.code).toBe('LIBRARY_INVALID');
    const good = parseLibrary(JSON.stringify(catalog()), validateCatalog, '0.1.0');
    expect(good.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The flow of the app on fake services: a scripted bridge, the real settings over a memory storage, and the real core.
// ---------------------------------------------------------------------------------------------------------------

const BUILD = 'a1b2c3d4e5f6';
const VERSIONS: Versions = { plugin: '0.1.0', build: BUILD };
const NOW = () => new Date('2026-10-05T12:00:00Z');
const ROOT = 'C:/ProgramData/CloudRuBrandKit/library';
const LIBRARY_FILE = ROOT + '/library.json';
const ENV = { LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local', ProgramData: 'C:\\ProgramData' };
const SETTINGS_FILE = 'C:/Users/u/AppData/Local/CloudRuBrandKit/settings.json';
const SHA = 'c'.repeat(64);

const ttl = (): Item => item('TTL_LowerThird');

type Reply<T> = HostReply<T> | Promise<HostReply<T>>;

interface Script {
  ensure?: () => Reply<{ build: string }>;
  context?: () => Reply<HostContext>;
  insert?: (args: PrInsertArgs | AeInsertArgs) => Reply<InsertResult>;
  find?: (probe: PlacedProbe) => Reply<Placed | null>;
  checkFonts?: (names: string[]) => Reply<FontStatus[]>;
  diag?: () => Reply<Record<string, unknown>>;
}

interface Call {
  fn: string;
  args?: unknown;
}

const placedClip: Placed = { kind: 'clip', id: 'c1', name: 'TTL_LowerThird_16x9_v1', track: 1, startSec: 12, endSec: 18 };
const placedLayer: Placed = { kind: 'layer', id: '5', name: 'CR_TTL_LowerThird_16x9_v1', startSec: 2, endSec: 8 };

// What a healthy adapter answers to an insert: the place, and every field read back as written.
function landed(args: PrInsertArgs | AeInsertArgs): HostReply<InsertResult> {
  return {
    ok: true,
    data: {
      placed: 'seqId' in args ? placedClip : placedLayer,
      fields: args.fields.map((f) => ({ egpName: f.egpName, written: f.value, back: f.value, ok: true })),
      warnings: [],
    },
  };
}

function fakeBridge(script: Script, defaultContext: HostContext) {
  const calls: Call[] = [];
  const note = (fn: string, args?: unknown) => void calls.push(args === undefined ? { fn } : { fn, args });
  const bridge: HostBridge = {
    ensureAdapter: async () => (note('ensureAdapter'), script.ensure ? script.ensure() : { ok: true, data: { build: BUILD } }),
    getContext: async () => (note('getContext'), script.context ? script.context() : { ok: true, data: defaultContext }),
    insertItem: async (args) => (note('insertItem', args), script.insert ? script.insert(args) : landed(args)),
    findPlaced: async (probe) => (note('findPlaced', probe), script.find ? script.find(probe) : { ok: true, data: null }),
    checkFonts: async (names) => (note('checkFonts', names), script.checkFonts ? script.checkFonts(names) : { ok: true, data: [] }),
    diag: async () => (note('diag'), script.diag ? script.diag() : { ok: true, data: { app: '26.5', build: BUILD } }),
  };
  return { bridge, calls, of: (fn: string) => calls.filter((c) => c.fn === fn) };
}

function memoryStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
  };
}

const brokenStorage: StorageLike = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
  removeItem: () => {
    throw new Error('SecurityError');
  },
};

const noFile = (path: string) => Object.assign(new Error('ENOENT: no such file or directory, open ' + path), { code: 'ENOENT' });

interface WorldOptions extends Script {
  host?: HostKey;
  ctx?: HostContext;
  library?: string | null; // the text of library.json; null: there is no such file
  readError?: Error; // library.json is there but cannot be read
  fonts?: (required: readonly { postScriptName: string; build: string }[]) => FontStatus[] | null;
  versions?: Versions;
  storage?: StorageLike | null;
}

function world(o: WorldOptions = {}) {
  const host = o.host ?? 'pr';
  const ctx = o.ctx ?? (host === 'pr' ? prCtx() : aeCtx());
  const fake = fakeBridge(o, ctx);
  const logs: LogEntry[] = [];
  const logger = createLogger((e) => void logs.push(e), NOW);
  const storage = memoryStorage();
  const text = o.library === undefined ? JSON.stringify(catalog()) : o.library;
  const files = {
    readText: async (path: string): Promise<string> => {
      if (path === LIBRARY_FILE) {
        if (o.readError) throw o.readError;
        if (text !== null) return text;
      }
      throw noFile(path);
    },
    native: (p: string) => p.replace(/\//g, '\\'),
  };
  const settings = createSettings({
    files, storage: o.storage === undefined ? storage : o.storage, env: ENV, platform: 'win32', home: 'C:/Users/u',
  });
  const fontCalls: (readonly { postScriptName: string; build: string }[])[] = [];
  const services: Services = {
    host,
    hostEnv: { appName: host === 'pr' ? 'PPRO' : 'AEFT', appVersion: host === 'pr' ? '26.5.2' : '26.5.0' },
    files,
    settings,
    bridge: fake.bridge,
    logger,
    checkFonts: async (required) => {
      fontCalls.push(required);
      if (o.fonts) return o.fonts(required);
      return required.map((f) => ({ postScriptName: f.postScriptName, found: true, build: f.build, substitute: false }));
    },
    flushLog: async () => undefined,
    versions: o.versions ?? VERSIONS,
    paths: { settings: SETTINGS_FILE, logs: 'C:/Users/u/AppData/Local/CloudRuBrandKit/logs', extension: 'C:/ext' },
    now: NOW,
  };
  const app = createApp({ win: {}, services, now: NOW });
  return { app, services, settings, storage, logs, fontCalls, ctx, ...fake };
}

const request = (it: Item, over: Partial<InsertRequest> = {}): InsertRequest => ({
  itemId: it.id, values: defaults(it), lenSec: defaultLen(it), ...over,
});
const codes = (issues: Issue[]) => issues.map((i) => i.code);

describe('start: the adapter and the library', () => {
  it('checks the adapter, reads library.json from the library root and keeps the items of this host', async () => {
    const w = world();
    const r = await w.app.start();
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
    expect(r.adapter).toBe(true);
    expect(r.root).toBe(ROOT);
    expect(r.library?.libraryVersion).toBe('2026.10.05');
    expect(r.items.map((i) => i.id)).toEqual(['LOGO_Shot', 'LOGO_Mark', 'TTL_LowerThird']);
    expect(w.of('ensureAdapter')).toHaveLength(1);
    expect(w.app.items()).toEqual(r.items);
    expect(w.app.library()).toEqual(r.library);
    expect(w.app.info()).toMatchObject({ host: 'pr', hostVersion: '26.5.2', plugin: '0.1.0', build: BUILD, library: '2026.10.05', libraryRoot: ROOT });
  });

  it('reads the library from the root in settings.json when there is one', async () => {
    const root = 'D:/Бренд/library';
    const w = world();
    const seen: string[] = [];
    const readText = w.services.files.readText;
    w.services.files.readText = async (path) => {
      seen.push(path);
      if (path === SETTINGS_FILE) return JSON.stringify({ libraryRoot: root });
      if (path === root + '/library.json') return JSON.stringify(catalog());
      return readText(path);
    };
    const r = await createApp({ win: {}, services: w.services, now: NOW }).start();
    expect(r.ok).toBe(true);
    expect(r.root).toBe(root);
    expect(seen).toContain(root + '/library.json');
  });

  it('hides the items another host inserts and the file items of the later tiers', async () => {
    const mark = item('LOGO_Mark');
    const only = (id: string, hosts: HostKey[]): Item => ({ ...mark, id, hosts });
    const bg: Item = {
      id: 'BG_Loop', title_ru: 'Фоновая петля', category: 'backgrounds', tier: 'T2', hosts: ['ae', 'pr'], version: 1,
      variants: [{
        key: '16x9', aspect: '16x9', w: 1920, h: 1080, fps: 25, minHostVersion: { ae: '26.0', pr: '26.0' },
        file: 'items/BG_Loop/BG_Loop_16x9_v1.mov', sha256: SHA, bytes: 10,
      }],
    };
    const lib: Library = { ...catalog(), items: [...catalog().items, only('LOGO_AeOnly', ['ae']), only('LOGO_PrOnly', ['pr']), bg] };
    expect(validateCatalog(lib)).toEqual({ ok: true, errors: [] });
    const text = JSON.stringify(lib);
    const pr = await world({ host: 'pr', library: text }).app.start();
    expect(pr.items.map((i) => i.id)).toEqual(['LOGO_Shot', 'LOGO_Mark', 'TTL_LowerThird', 'LOGO_PrOnly']);
    const ae = await world({ host: 'ae', library: text }).app.start();
    expect(ae.items.map((i) => i.id)).toEqual(['LOGO_Shot', 'LOGO_Mark', 'TTL_LowerThird', 'LOGO_AeOnly']);
    expect(pr.library?.items.map((i) => i.id)).toContain('BG_Loop'); // the library keeps it, the panel does not offer it
  });

  it('reads a library.json that starts with a byte order mark', async () => {
    expect((await world({ library: '\uFEFF' + JSON.stringify(catalog()) }).app.start()).ok).toBe(true);
  });

  it('says the library is missing, with the path as a person writes it', async () => {
    const w = world({ library: null });
    const r = await w.app.start();
    expect(r.ok).toBe(false);
    expect(r.library).toBeNull();
    expect(r.items).toEqual([]);
    expect(r.adapter).toBe(true);
    expect(r.issues).toEqual([{ code: 'LIBRARY_MISSING', level: 'error', params: { path: 'C:\\ProgramData\\CloudRuBrandKit\\library\\library.json' } }]);
    expect(w.logs.some((l) => l.code === 'LIBRARY_MISSING')).toBe(true);
  });

  it('says the same for a library.json that cannot be read', async () => {
    const r = await world({ readError: Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }) }).app.start();
    expect(codes(r.issues)).toEqual(['LIBRARY_MISSING']);
  });

  it('refuses a library that does not pass the schema or the rules of the pipeline', async () => {
    const broken = catalog();
    (broken.items[0] as unknown as Record<string, unknown>).colour = 'green';
    const w = world({ library: JSON.stringify(broken) });
    const r = await w.app.start();
    expect(r.ok).toBe(false);
    expect(r.library).toBeNull();
    expect(r.issues[0]).toMatchObject({ code: 'LIBRARY_INVALID', level: 'error' });
    expect(String(r.issues[0]?.params?.details)).toContain('colour');
    expect(w.logs.some((l) => l.code === 'LIBRARY_INVALID' && l.level === 'error')).toBe(true);
    expect(codes((await world({ library: '{"items": [' }).app.start()).issues)).toEqual(['LIBRARY_INVALID']);
  });

  it('refuses a library that wants a newer panel', async () => {
    const newer = { ...catalog(), minPluginVersion: '9.0.0' };
    const r = await world({ library: JSON.stringify(newer) }).app.start();
    expect(r.issues).toEqual([{ code: 'PLUGIN_TOO_OLD', level: 'error', params: { need: '9.0.0', have: '0.1.0' } }]);
    expect(r.library).toBeNull();
  });

  it('shows the library even when the adapter does not load, and says why', async () => {
    const w = world({ ensure: () => ({ ok: false, error: { code: 'ADAPTER_LOAD', message: 'cannot read the adapter source' } }) });
    const r = await w.app.start();
    expect(r.ok).toBe(false);
    expect(r.adapter).toBe(false);
    expect(r.items).toHaveLength(3);
    expect(r.issues).toEqual([{ code: 'ADAPTER_LOAD', level: 'error', params: { detail: 'cannot read the adapter source' } }]);
  });

  it('reports both when neither the adapter nor the library is there', async () => {
    const r = await world({ library: null, ensure: () => ({ ok: false, error: { code: 'HOST_EMPTY' } }) }).app.start();
    expect(codes(r.issues)).toEqual(['HOST_EMPTY', 'LIBRARY_MISSING']);
  });

  it('turns a bridge that rejects into an issue instead of throwing', async () => {
    const w = world();
    w.services.bridge.ensureAdapter = () => Promise.reject(new Error('queue broke'));
    const r = await createApp({ win: {}, services: w.services, now: NOW }).start();
    expect(r.issues).toEqual([{ code: 'HOST_BRIDGE_ERROR', level: 'error', params: { detail: 'queue broke' } }]);
    expect(r.items).toHaveLength(3);
  });

  it('starts once for every caller, and again on reload', async () => {
    const w = world();
    const [a, b] = await Promise.all([w.app.start(), w.app.start()]);
    expect(a).toBe(b);
    expect(w.of('ensureAdapter')).toHaveLength(1);
    await w.app.reload();
    expect(w.of('ensureAdapter')).toHaveLength(2);
    expect(w.app.items()).toHaveLength(3);
  });

  it('logs the start and the library it loaded', async () => {
    const w = world();
    await w.app.start();
    expect(w.logs.map((l) => l.code)).toEqual(['APP_START', 'LIBRARY_LOADED']);
    expect(w.logs[0]).toMatchObject({ level: 'info', data: { plugin: '0.1.0', build: BUILD, host: 'pr', hostVersion: '26.5.2' } });
    expect(w.logs[1]).toMatchObject({ data: { root: ROOT, items: 3, host: 'pr' } });
  });
});

describe('catalog: the library without waiting for the adapter', () => {
  it('is there while a host that does not answer is still being asked', async () => {
    const w = world({ ensure: () => new Promise(() => undefined) });
    const cat = await w.app.catalog();
    expect(cat).toMatchObject({ ok: true, issues: [], root: ROOT });
    expect(cat.items.map((i) => i.id)).toEqual(['LOGO_Shot', 'LOGO_Mark', 'TTL_LowerThird']);
    // start() is the one that waits for the adapter
    let settled = false;
    void w.app.start().then(() => void (settled = true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).toBe(false);
    expect(w.of('ensureAdapter')).toHaveLength(1);
  });

  it('has the issues of the library only; start() adds the adapter, which it also names apart', async () => {
    const w = world({ library: null, ensure: () => ({ ok: false, error: { code: 'HOST_EMPTY' } }) });
    expect(await w.app.catalog()).toEqual({
      ok: false,
      issues: [{ code: 'LIBRARY_MISSING', level: 'error', params: { path: 'C:\\ProgramData\\CloudRuBrandKit\\library\\library.json' } }],
      library: null,
      items: [],
      root: null,
    });
    const started = await w.app.start();
    expect(codes(started.issues)).toEqual(['HOST_EMPTY', 'LIBRARY_MISSING']);
    expect(started.adapterIssue).toEqual({ code: 'HOST_EMPTY', level: 'error' });
    expect(started.adapter).toBe(false);
    const healthy = await world().app.start();
    expect(healthy.adapterIssue).toBeNull();
  });

  it('reads the library once for every caller and again on reload', async () => {
    const w = world();
    const reads: string[] = [];
    const readText = w.services.files.readText;
    w.services.files.readText = async (path) => {
      reads.push(path);
      return readText(path);
    };
    const app = createApp({ win: {}, services: w.services, now: NOW });
    const [a, b] = await Promise.all([app.catalog(), app.catalog()]);
    expect(a).toBe(b);
    await app.start();
    expect(reads.filter((p) => p === LIBRARY_FILE)).toHaveLength(1);
    await app.reload();
    expect(reads.filter((p) => p === LIBRARY_FILE)).toHaveLength(2);
  });

  it('lets an insert be planned, and the fonts be checked, without the adapter having answered', async () => {
    const w = world({ ensure: () => new Promise(() => undefined) });
    expect((await w.app.prepare(request(ttl()))).ok).toBe(true);
    expect(await w.app.fonts()).toHaveLength(4);
  });
});

describe('context and fonts', () => {
  it('asks the host for the context', async () => {
    const w = world();
    expect(await w.app.context()).toEqual({ ok: true, data: w.ctx });
    expect(w.of('getContext')).toHaveLength(1);
  });

  it('turns a bridge that rejects into a failed reply', async () => {
    const w = world();
    w.services.bridge.getContext = () => Promise.reject(new Error('gone'));
    expect(await createApp({ win: {}, services: w.services, now: NOW }).context()).toEqual({
      ok: false, error: { code: 'HOST_BRIDGE_ERROR', message: 'gone' },
    });
  });

  it('checks the fonts of the whole library, each once, in the order the library meets them', async () => {
    const w = world();
    const statuses = await w.app.fonts();
    expect(w.fontCalls).toHaveLength(1);
    expect(w.fontCalls[0]).toEqual([
      { postScriptName: 'SBSansDisplay-Semibold', build: '1.002' },
      { postScriptName: 'SBSansText-Regular', build: '1.003' },
      { postScriptName: 'SBSansDisplay-Bold', build: '1.002' },
      { postScriptName: 'SBSansDisplay-Regular', build: '1.002' },
    ]);
    expect(statuses).toHaveLength(4);
  });

  it('answers null for a font check that failed', async () => {
    expect(await world({ fonts: () => null }).app.fonts()).toBeNull();
  });
});

describe('prepare', () => {
  it('plans an item for the exact frame of the target', async () => {
    const w = world();
    const p = await w.app.prepare(request(ttl()));
    expect(p.ok).toBe(true);
    expect(p.issues).toEqual([]);
    expect(p.choice).toMatchObject({ match: 'exact', variant: { key: '16x9' } });
    expect(p.plan).toMatchObject({ lenSec: 6, lenFrames: 150, variant: { key: '16x9' } });
    expect(p.ctx?.target?.name).toBe('Секвенция 1');
    expect(w.fontCalls[0]?.map((f) => f.postScriptName)).toEqual(ttl().requiredFonts!.map((f) => f.postScriptName));
  });

  it('asks the host for a fresh context each time', async () => {
    const w = world();
    await w.app.prepare(request(ttl()));
    await w.app.prepare(request(ttl()));
    expect(w.of('getContext')).toHaveLength(2);
  });

  it('uses a variant picked by hand only for the frame it was picked for, judged on the context of this very plan', async () => {
    const qhd = prCtx({ w: 2560, h: 1440 });
    let current = qhd;
    const w = world({ context: () => ({ ok: true, data: current }) });
    w.app.setManualVariant(ttl(), qhd.target, '16x9_4K');
    // the same frame: the choice stands
    expect((await w.app.prepare(request(ttl()))).choice).toMatchObject({ match: 'manual', variant: { key: '16x9_4K' } });
    // the user moved to an HD sequence since the form was drawn: the old choice does not follow
    current = prCtx();
    expect((await w.app.prepare(request(ttl()))).choice).toMatchObject({ match: 'exact', variant: { key: '16x9' } });
    // null is "no choice", whatever is stored
    current = qhd;
    expect((await w.app.prepare(request(ttl(), { manualKey: null }))).choice?.match).toBe('none');
    // a key given by the caller is used as it is
    expect((await w.app.prepare(request(ttl(), { manualKey: '9x16' }))).choice).toMatchObject({ match: 'manual', variant: { key: '9x16' } });
  });

  it('refuses a frame without a variant, offering the nearest', async () => {
    const w = world({ ctx: prCtx({ w: 2560, h: 1440 }) });
    const p = await w.app.prepare(request(ttl()));
    expect(p.ok).toBe(false);
    expect(p.issues).toEqual([{ code: 'NO_VARIANT', level: 'error', params: { frame: '2560×1440', nearest: '16x9' } }]);
    expect(p.choice).toMatchObject({ match: 'none', nearest: { key: '16x9' } });
  });

  it('takes the variant picked by hand over the frame', async () => {
    const w = world({ ctx: prCtx({ w: 2560, h: 1440 }) });
    const p = await w.app.prepare(request(ttl(), { manualKey: '16x9_4K' }));
    expect(p.ok).toBe(true);
    expect(p.choice).toMatchObject({ match: 'manual', variant: { key: '16x9_4K' } });
    expect(p.plan?.variant.key).toBe('16x9_4K');
    // a key the item does not have is no choice at all
    const gone = await w.app.prepare(request(ttl(), { manualKey: 'nope' }));
    expect(gone.choice?.match).toBe('none');
  });

  it('refuses when there is no active comp or sequence', async () => {
    const p = await world({ ctx: prCtx(null) }).app.prepare(request(ttl()));
    expect(p.ok).toBe(false);
    expect(codes(p.issues)).toContain('NO_TARGET');
  });

  it('refuses when a font is missing, and when the font check itself failed', async () => {
    const missing = world({
      fonts: (req) => req.map((f, i) => ({ postScriptName: f.postScriptName, found: i !== 1, build: i !== 1 ? f.build : null, substitute: false })),
    });
    const p = await missing.app.prepare(request(ttl()));
    expect(p.ok).toBe(false);
    expect(p.issues).toEqual([{ code: 'FONT_MISSING', level: 'error', params: { font: 'SBSansDisplay-Bold' } }]);
    const failed = await world({ fonts: () => null }).app.prepare(request(ttl()));
    expect(codes(failed.issues)).toEqual(['FONT_CHECK_FAILED']);
    // an item that needs no font does not care
    expect((await world({ fonts: () => null }).app.prepare(request(item('LOGO_Mark')))).ok).toBe(true);
  });

  it('lets a warning through and lists it', async () => {
    const p = await world({ ctx: prCtx({ fps: 30 }) }).app.prepare(request(ttl()));
    expect(p.ok).toBe(true);
    expect(p.issues).toEqual([{ code: 'FPS_MISMATCH', level: 'warning', params: { template: 25, target: 30 } }]);
  });

  it('refuses a length under the minimum and a value the field cannot hold', async () => {
    const w = world();
    const short = await w.app.prepare(request(ttl(), { lenSec: 3 }));
    expect(short.issues).toEqual([{ code: 'LENGTH_TOO_SHORT', level: 'error', params: { min: 4.2 } }]);
    const long = await w.app.prepare(request(ttl(), { values: { ...defaults(ttl()), name: 'я'.repeat(41) } }));
    expect(codes(long.issues)).toEqual(['FIELD_TOO_LONG']);
  });

  it('refuses an item the library does not have, without asking the host anything', async () => {
    const w = world();
    expect(await w.app.prepare({ itemId: 'TTL_Gone', values: {}, lenSec: 5 })).toEqual({
      ok: false, issues: [{ code: 'ITEM_NOT_FOUND', level: 'error', params: { id: 'TTL_Gone' } }],
    });
    expect(w.of('getContext')).toHaveLength(0);
  });

  it('says why when the host does not give a context', async () => {
    const w = world({ context: () => ({ ok: false, error: { code: 'HOST_EMPTY', message: 'cold engine' } }) });
    expect(await w.app.prepare(request(ttl()))).toEqual({
      ok: false, issues: [{ code: 'HOST_EMPTY', level: 'error', params: { detail: 'cold engine' } }],
    });
  });

  it('gives the issues of the library when there is none', async () => {
    const p = await world({ library: null }).app.prepare(request(ttl()));
    expect(p.ok).toBe(false);
    expect(codes(p.issues)).toEqual(['LIBRARY_MISSING']);
  });

  it('turns a failure of its own into PANEL_ERROR', async () => {
    const w = world({
      fonts: () => {
        throw new Error('scan exploded');
      },
    });
    expect(await w.app.prepare(request(ttl()))).toEqual({
      ok: false, issues: [{ code: 'PANEL_ERROR', level: 'error', params: { detail: 'scan exploded' } }],
    });
  });
});

describe('insert', () => {
  it('sends one insert with the arguments of a Premiere clip and remembers what was typed', async () => {
    const w = world();
    const values = { ...defaults(ttl()), name: 'Анна-Мария Ёлкина', style: 2 };
    const phases: string[] = [];
    const outcome = await w.app.insert(request(ttl(), { values }), (p) => void phases.push(p));
    expect(outcome).toEqual({
      ok: true,
      result: { placed: placedClip, fields: expect.any(Array), warnings: [] },
      issues: [],
    });
    expect(phases).toEqual(['checking', 'inserting']);
    expect(w.of('insertItem')).toHaveLength(1);
    const args = w.of('insertItem')[0]!.args as PrInsertArgs;
    expect(args).toMatchObject({
      seqId: 'seq-0001',
      mogrtPath: ROOT + '/items/TTL_LowerThird/TTL_LowerThird_16x9_v1.mogrt',
      startTicks: '3048192000000',
      lenFrames: 150,
      defaultLenFrames: 150,
      expectName: 'TTL_LowerThird_16x9_v1',
      label: 'Cloud.ru BrandKit: Подпись спикера',
    });
    // fields in Essential Graphics order, dropdowns 0-based for Premiere
    expect(args.fields[0]).toEqual({ egpName: 'Имя', type: 'text', value: 'Анна-Мария Ёлкина' });
    expect(args.fields.find((f) => f.egpName === 'Стиль')).toEqual({ egpName: 'Стиль', type: 'dropdown', value: 1 });
    expect(w.app.initialValues(ttl())).toMatchObject({ name: 'Анна-Мария Ёлкина', style: 2 });
    expect(w.logs.some((l) => l.code === 'INSERT_OK')).toBe(true);
  });

  it('sends the arguments of a layer to After Effects', async () => {
    const w = world({ host: 'ae' });
    expect((await w.app.insert(request(ttl()))).ok).toBe(true);
    expect(w.of('insertItem')[0]!.args).toMatchObject({
      compId: '17',
      aepPath: ROOT + '/items/TTL_LowerThird/TTL_LowerThird_v1.aep',
      itemKey: 'TTL_LowerThird@1',
      aeComp: 'CR_TTL_LowerThird_16x9_v1',
      timeSec: 2,
      lenSec: 6,
      durSec: 6,
      inSec: 2.2,
      outSec: 4,
    });
  });

  it('inserts a longer clip by the length the user typed', async () => {
    const w = world();
    expect((await w.app.insert(request(ttl(), { lenSec: 8 }))).ok).toBe(true);
    expect(w.of('insertItem')[0]!.args).toMatchObject({ lenFrames: 200, defaultLenFrames: 150 });
  });

  it('refuses before the host is asked, and remembers nothing', async () => {
    const w = world({ ctx: prCtx({ w: 2560, h: 1440 }) });
    const phases: string[] = [];
    const outcome = await w.app.insert(request(ttl(), { values: { ...defaults(ttl()), name: 'Не запомнить' } }), (p) => void phases.push(p));
    expect(outcome).toEqual({
      ok: false, issues: [{ code: 'NO_VARIANT', level: 'error', params: { frame: '2560×1440', nearest: '16x9' } }],
    });
    expect(phases).toEqual(['checking']);
    expect(w.of('insertItem')).toHaveLength(0);
    expect(w.app.initialValues(ttl()).name).toBe('Имя Фамилия');
    expect(w.logs.some((l) => l.code === 'INSERT_REFUSED')).toBe(true);
  });

  it('does not run an insert on a context it could not get', async () => {
    const w = world({ context: () => ({ ok: false, error: { code: 'HOST_EMPTY' } }) });
    const phases: string[] = [];
    expect(await w.app.insert(request(ttl()), (p) => void phases.push(p))).toEqual({ ok: false, issues: [{ code: 'HOST_EMPTY', level: 'error' }] });
    expect(phases).toEqual(['checking']);
    expect(w.of('insertItem')).toHaveLength(0);
  });

  it('passes on a refusal of the host and remembers nothing', async () => {
    const w = world({ insert: () => ({ ok: false, error: { code: 'TARGET_CHANGED', message: 'the active sequence is seq-0002' } }) });
    const outcome = await w.app.insert(request(ttl(), { values: { ...defaults(ttl()), name: 'Не запомнить' } }));
    expect(outcome).toEqual({
      ok: false, issues: [{ code: 'TARGET_CHANGED', level: 'error', params: { detail: 'the active sequence is seq-0002' } }],
    });
    expect(w.app.initialValues(ttl()).name).toBe('Имя Фамилия');
  });

  it('keeps an insert whose fields did not read back, says which, and remembers the values', async () => {
    const w = world({
      insert: (args) => ({
        ok: true,
        data: {
          placed: placedClip,
          fields: args.fields.map((f) => ({ egpName: f.egpName, written: f.value, back: f.egpName === 'Имя' ? '' : f.value, ok: f.egpName !== 'Имя' })),
          warnings: [],
        },
      }),
    });
    const outcome = await w.app.insert(request(ttl(), { values: { ...defaults(ttl()), name: 'Иван' } }));
    expect(outcome.ok).toBe(true);
    expect(outcome.issues).toEqual([{ code: 'READBACK_MISMATCH', level: 'warning', params: { fields: 'Имя' } }]);
    expect(w.app.initialValues(ttl()).name).toBe('Иван');
  });

  it('asks where an insert that timed out went, and says it landed', async () => {
    const w = world({
      insert: () => ({ ok: false, error: { code: 'TIMEOUT', message: 'insertItem: no reply in 120000 ms' } }),
      find: () => ({ ok: true, data: placedClip }),
    });
    const outcome = await w.app.insert(request(ttl(), { values: { ...defaults(ttl()), name: 'Иван' } }));
    expect(outcome).toEqual({
      ok: true, result: { placed: placedClip, fields: [], warnings: [] }, issues: [{ code: 'TIMEOUT_LANDED', level: 'warning' }],
    });
    expect(w.of('insertItem')).toHaveLength(1); // never sent again
    expect(w.of('findPlaced')[0]!.args).toEqual({ kind: 'clip', targetId: 'seq-0001', startSec: 12, name: 'TTL_LowerThird_16x9_v1' });
    expect(w.app.initialValues(ttl()).name).toBe('Иван');
  });

  it('says it failed when the answer was lost and nothing landed, and remembers nothing', async () => {
    const w = world({ insert: () => ({ ok: false, error: { code: 'TIMEOUT' } }), find: () => ({ ok: true, data: null }) });
    const outcome = await w.app.insert(request(ttl(), { values: { ...defaults(ttl()), name: 'Не запомнить' } }));
    expect(outcome).toEqual({ ok: false, issues: [{ code: 'INSERT_FAILED', level: 'error' }] });
    expect(w.app.initialValues(ttl()).name).toBe('Имя Фамилия');
  });

  it('takes one insert at a time: a second click is refused while the first is running', async () => {
    let release: () => void = () => undefined;
    const w = world({
      insert: (args) => new Promise((resolve) => {
        release = () => resolve(landed(args));
      }),
    });
    const first = w.app.insert(request(ttl()));
    await vi.waitFor(() => expect(w.of('insertItem')).toHaveLength(1));
    const second = await w.app.insert(request(ttl()));
    expect(second).toEqual({ ok: false, issues: [{ code: 'INSERT_BUSY', level: 'error' }] });
    release();
    expect((await first).ok).toBe(true);
    expect(w.of('insertItem')).toHaveLength(1);
    // and the next one goes through once the first is done
    release = () => undefined;
    w.services.bridge.insertItem = async (args) => landed(args);
    expect((await w.app.insert(request(ttl()))).ok).toBe(true);
  });

  it('is not stopped by a view that throws on a phase', async () => {
    const w = world();
    const outcome = await w.app.insert(request(ttl()), () => {
      throw new Error('render broke');
    });
    expect(outcome.ok).toBe(true);
  });

  it('inserts even when the storage refuses to remember', async () => {
    const w = world({ storage: brokenStorage });
    expect((await w.app.insert(request(ttl()))).ok).toBe(true);
    expect(w.app.initialValues(ttl())).toEqual(defaults(ttl()));
  });

  it('turns a failure of its own into PANEL_ERROR and takes the next insert', async () => {
    let boom = true;
    const w = world({
      fonts: () => {
        if (boom) throw new Error('scan exploded');
        return [];
      },
    });
    expect(await w.app.insert(request(ttl()))).toEqual({
      ok: false, issues: [{ code: 'PANEL_ERROR', level: 'error', params: { detail: 'scan exploded' } }],
    });
    boom = false;
    expect(codes((await w.app.insert(request(item('LOGO_Mark')))).issues)).toEqual([]);
  });
});

describe('remembered values and the manual variant', () => {
  it('shows the defaults for an item that was never inserted, and drops what no longer fits', () => {
    const w = world();
    expect(w.app.initialValues(ttl())).toEqual(defaults(ttl()));
    w.settings.remember('TTL_LowerThird@1', { name: 'Пётр', style: 9, gone: 'x', size: 4 });
    expect(w.app.initialValues(ttl())).toEqual({ ...defaults(ttl()), name: 'Пётр', size: 4 });
    // another version of the template has its own memory
    w.settings.remember('TTL_LowerThird@2', { name: 'Из другой версии' });
    expect(w.app.initialValues(ttl()).name).toBe('Пётр');
  });

  const QHD = prCtx({ w: 2560, h: 1440 }).target!;
  const FHD = prCtx().target!;

  it('keeps a variant picked by hand for the frame it was picked for', () => {
    const w = world();
    expect(w.app.manualVariant(ttl(), QHD)).toBeNull();
    expect(w.app.setManualVariant(ttl(), QHD, '16x9_4K')).toBe(true);
    expect(w.app.manualVariant(ttl(), QHD)).toBe('16x9_4K');
    // another frame, another sequence: the choice does not follow the user (it would put the wrong size there)
    expect(w.app.manualVariant(ttl(), FHD)).toBeNull();
    expect(w.app.manualVariant(ttl(), prCtx({ w: 2560, h: 1600 }).target!)).toBeNull();
    // another item has its own
    expect(w.app.manualVariant(item('LOGO_Mark'), QHD)).toBeNull();
  });

  it('forgets the choice on «Авто»', () => {
    const w = world();
    w.app.setManualVariant(ttl(), QHD, '9x16');
    expect(w.app.setManualVariant(ttl(), QHD, null)).toBe(true);
    expect(w.app.manualVariant(ttl(), QHD)).toBeNull();
  });

  it('refuses a variant the item does not have, and a choice with no target', () => {
    const w = world();
    expect(w.app.setManualVariant(ttl(), QHD, 'nope')).toBe(false);
    expect(w.app.setManualVariant(ttl(), null, '16x9')).toBe(false);
    expect(w.app.manualVariant(ttl(), null)).toBeNull();
    expect(w.storage.map.size).toBe(0);
  });

  it('never uses a stored value that carries no frame, or a variant that is gone', () => {
    const w = world();
    w.settings.setManualVariant('TTL_LowerThird', '16x9_4K'); // as the plain settings service would store it
    expect(w.app.manualVariant(ttl(), QHD)).toBeNull();
    w.settings.setManualVariant('TTL_LowerThird', 'gone@2560x1440');
    expect(w.app.manualVariant(ttl(), QHD)).toBeNull();
  });

  it('says so when the storage refuses', () => {
    const w = world({ storage: brokenStorage });
    expect(w.app.setManualVariant(ttl(), QHD, '16x9_4K')).toBe(false);
    expect(w.app.manualVariant(ttl(), QHD)).toBeNull();
  });
});

describe('diagnostics', () => {
  it('has the versions, the paths, the context, the adapter report and the fonts in one plain object', async () => {
    const w = world({ diag: () => ({ ok: true, data: { app: '26.5.2', qe: true, json: 'native' } }) });
    const d = await w.app.diagnostics();
    expect(d).toEqual({
      generatedAt: '2026-10-05T12:00:00.000Z',
      versions: { plugin: '0.1.0', build: BUILD, library: '2026.10.05', host: 'pr', hostVersion: '26.5.2' },
      paths: {
        libraryRoot: ROOT,
        settings: SETTINGS_FILE,
        logs: 'C:/Users/u/AppData/Local/CloudRuBrandKit/logs',
        extension: 'C:/ext',
      },
      context: { ok: true, data: w.ctx },
      adapter: { ok: true, data: { app: '26.5.2', qe: true, json: 'native' } },
      fonts: {
        required: ['SBSansDisplay-Semibold', 'SBSansText-Regular', 'SBSansDisplay-Bold', 'SBSansDisplay-Regular'],
        statuses: expect.any(Array),
      },
    });
    expect(d.fonts.statuses).toHaveLength(4);
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
  });

  it('still reports when the host does not answer, with what failed', async () => {
    const w = world({
      library: null,
      context: () => ({ ok: false, error: { code: 'HOST_EMPTY' } }),
      diag: () => ({ ok: false, error: { code: 'TIMEOUT', message: 'diag: no reply in 30000 ms' } }),
    });
    const d = await w.app.diagnostics();
    expect(d.context).toEqual({ ok: false, error: { code: 'HOST_EMPTY' } });
    expect(d.adapter).toEqual({ ok: false, error: { code: 'TIMEOUT', message: 'diag: no reply in 30000 ms' } });
    expect(d.versions).toEqual({ plugin: '0.1.0', build: BUILD, library: null, host: 'pr', hostVersion: '26.5.2' });
    expect(d.paths.libraryRoot).toBeNull();
    expect(d.fonts).toEqual({ required: [], statuses: [] });
  });

  it('takes the host version from the context when there is one (After Effects says 26.5x89)', async () => {
    const d = await world({ host: 'ae' }).app.diagnostics();
    expect(d.versions.hostVersion).toBe('26.5x89');
  });

  it('does not wait for a host that never answers: each part has its time, side by side', async () => {
    vi.useFakeTimers();
    try {
      const w = world({ context: () => new Promise(() => undefined), diag: () => new Promise(() => undefined) });
      const done = w.app.diagnostics();
      await vi.advanceTimersByTimeAsync(DIAG_WAIT_MS + 1);
      const d = await done;
      expect(d.context).toEqual({ ok: false, error: { code: 'TIMEOUT', message: expect.stringContaining('getContext') } });
      expect(d.adapter).toEqual({ ok: false, error: { code: 'TIMEOUT', message: expect.stringContaining('diag') } });
      expect(d.versions).toMatchObject({ library: '2026.10.05', hostVersion: '26.5.2' }); // from the host environment
      expect(d.fonts.statuses).toHaveLength(4); // what did come is in
      expect(vi.getTimerCount()).toBe(0); // and no timer is left waiting
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the dev test hook', () => {
  it('is ready when the adapter and the library are, and gives the library', async () => {
    const hook = createTestHook(world().app);
    expect(hook.library()).toBeNull();
    expect(await hook.ready()).toEqual({ ok: true, issues: [] });
    expect(hook.library()).toEqual(catalog());
  });

  it('says why it is not ready', async () => {
    const hook = createTestHook(world({ library: null }).app);
    expect(await hook.ready()).toEqual({
      ok: false,
      issues: [{ code: 'LIBRARY_MISSING', level: 'error', params: { path: 'C:\\ProgramData\\CloudRuBrandKit\\library\\library.json' } }],
    });
  });

  it('gives the context the way the host does', async () => {
    const w = world();
    expect(await createTestHook(w.app).context()).toEqual({ ok: true, data: w.ctx });
  });

  it('prepares with the library values, the length of the template and the frame of the target', async () => {
    const hook = createTestHook(world().app);
    const p = await hook.prepare('TTL_LowerThird');
    expect(p.ok).toBe(true);
    expect(p.plan).toMatchObject({ lenFrames: 150, variant: { key: '16x9' } });
    expect(p.plan?.fieldWrites[0]).toEqual({ egpName: 'Имя', type: 'text', value: 'Имя Фамилия' });
  });

  it('lays the values it is given over the library values, and takes the length and the variant from the options', async () => {
    const w = world({ ctx: prCtx({ w: 2560, h: 1440 }) });
    const hook = createTestHook(w.app);
    const outcome = await hook.insert('TTL_LowerThird', { name: 'Иван' }, { lenSec: 8, variantKey: '16x9_4K' });
    expect(outcome.ok).toBe(true);
    const args = w.of('insertItem')[0]!.args as PrInsertArgs;
    expect(args).toMatchObject({ lenFrames: 200, expectName: 'TTL_LowerThird_16x9_4K_v1' });
    expect(args.fields.find((f) => f.egpName === 'Имя')?.value).toBe('Иван');
    expect(args.fields.find((f) => f.egpName === 'Должность')?.value).toBe('Должность'); // the library default
  });

  it('is not bent by a manual choice made in the panel: no variantKey means the frame decides', async () => {
    const w = world({ ctx: prCtx({ w: 2560, h: 1440 }) });
    w.app.setManualVariant(ttl(), w.ctx.target, '16x9_4K');
    const outcome = await createTestHook(w.app).insert('TTL_LowerThird');
    expect(outcome.ok).toBe(false);
    expect(codes(outcome.issues)).toEqual(['NO_VARIANT']);
  });

  it('returns plain JSON, the same after a round trip', async () => {
    const hook = createTestHook(world().app);
    const outcome = await hook.insert('LOGO_Mark');
    expect(JSON.parse(JSON.stringify(outcome))).toEqual(outcome);
    const prepared = await hook.prepare('LOGO_Mark');
    expect(JSON.parse(JSON.stringify(prepared))).toEqual(prepared);
    const d = await hook.diagnostics();
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
  });

  it('refuses an item the library does not have', async () => {
    const outcome = await createTestHook(world().app).insert('TTL_Gone');
    expect(outcome).toEqual({ ok: false, issues: [{ code: 'ITEM_NOT_FOUND', level: 'error', params: { id: 'TTL_Gone' } }] });
  });
});

describe('a panel that cannot start', () => {
  it('says so to every call and never throws (no CEP runtime in the window)', async () => {
    const app = createApp({ win: {}, versions: VERSIONS, now: NOW });
    const boot = { code: 'PANEL_BOOT_FAILED', level: 'error', params: { detail: expect.stringContaining('__adobe_cep__') } };
    expect(await app.start()).toMatchObject({ ok: false, library: null, items: [], issues: [boot] });
    expect(await app.reload()).toMatchObject({ ok: false });
    expect(await app.prepare({ itemId: 'X', values: {}, lenSec: 1 })).toMatchObject({ ok: false, issues: [boot] });
    expect(await app.insert({ itemId: 'X', values: {}, lenSec: 1 })).toMatchObject({ ok: false, issues: [boot] });
    expect(await app.context()).toMatchObject({ ok: false, error: { code: 'PANEL_BOOT_FAILED' } });
    expect(await app.fonts()).toBeNull();
    expect(app.info()).toEqual({ host: null, hostVersion: null, plugin: '0.1.0', build: BUILD, library: null, libraryRoot: null });
    expect(app.library()).toBeNull();
    expect(app.items()).toEqual([]);
    expect(app.initialValues(ttl())).toEqual({});
    expect(app.manualVariant(ttl(), null)).toBeNull();
    expect(app.setManualVariant(ttl(), null, '16x9')).toBe(false);
    const d = await app.diagnostics();
    expect(d.versions).toMatchObject({ plugin: '0.1.0', host: null });
    expect(await createTestHook(app).ready()).toMatchObject({ ok: false });
    await app.flushLog();
  });

  it('says why Node is off when it is', async () => {
    const win: AppWindow = {
      __adobe_cep__: {
        evalScript: () => undefined,
        getHostEnvironment: () => '{"appName":"PPRO","appVersion":"26.5.2"}',
        getSystemPath: () => 'file:///C:/ext',
        requestOpenExtension: () => undefined,
      },
    };
    const r = await createApp({ win, versions: VERSIONS, now: NOW }).start();
    expect(r.issues[0]).toMatchObject({ code: 'PANEL_BOOT_FAILED', params: { detail: expect.stringContaining('Node.js is off') } });
  });
});

describe('the codes of the app itself', () => {
  it('each have a Russian text for the user', () => {
    expect([...APP_CODES].sort()).toEqual(Object.keys(APP_MESSAGES).sort());
    for (const code of APP_CODES) expect(describeIssue({ code, level: 'error' }).text).toMatch(/[а-яё]/i);
  });

  it('turns a host failure into an issue with the detail and the line', () => {
    expect(hostIssue({ code: 'HOST_EXCEPTION', message: 'bad thing', line: 42 })).toEqual({
      code: 'HOST_EXCEPTION', level: 'error', params: { detail: 'bad thing', line: 42 },
    });
    expect(hostIssue({ code: 'TIMEOUT' })).toEqual({ code: 'TIMEOUT', level: 'error' });
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The real services in a profile on disk: createApp({ win }) with a window that has a CEP runtime, Node (the real
// one, but for process.env), a localStorage, a library in a folder with Cyrillic and a space in its name, and an
// engine that answers like the host does.
// ---------------------------------------------------------------------------------------------------------------

const made: string[] = [];
const opened: PanelApp[] = [];
afterAll(async () => {
  // A log line still on its way to the disk would make its folder again after it is gone.
  await Promise.all(opened.map((app) => app.flushLog()));
  for (const dir of made) nodeFs.rmSync(dir, { recursive: true, force: true });
});

const posix = (p: string): string => p.replace(/\\/g, '/');
const mkdirp = (dir: string): void => nodeFs.mkdirSync(dir, { recursive: true });
const write = (file: string, data: string | Uint8Array): void => nodeFs.writeFileSync(file, data);

interface Profile {
  win: AppWindow;
  tmp: string;
  local: string;
  winFonts: string;
  libraryRoot: string;
  scripts: string[];
  calls: { fn: string; args: any }[];
  storage: ReturnType<typeof memoryStorage>;
}

// otherFonts: false leaves the font folder empty, as a machine whose folders cannot be read looks to the scan.
function profile(host: HostKey, o: { ctx?: HostContext; library?: boolean; otherFonts?: boolean } = {}): Profile {
  const tmp = posix(nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'crbk-app-')));
  made.push(tmp);
  const local = tmp + '/local';
  const windows = tmp + '/windows';
  const libraryRoot = tmp + '/Библиотека BrandKit';
  const extension = tmp + '/расширение';
  for (const dir of [local + '/CloudRuBrandKit', windows + '/Fonts', tmp + '/common', libraryRoot, extension + '/host']) mkdirp(dir);
  write(local + '/CloudRuBrandKit/settings.json', JSON.stringify({ libraryRoot }));
  if (o.library !== false) write(libraryRoot + '/library.json', JSON.stringify(catalog()));
  write(extension + '/host/' + host + '.jsx', '/* the adapter of ' + host + ', ASCII only */\nvar loadedByTest = true;\n');
  if (o.otherFonts !== false) write(windows + '/Fonts/ArialMT.otf', sbFont('ArialMT', '7.00')); // some font, not SB Sans

  const ctx = o.ctx ?? (host === 'pr' ? prCtx() : aeCtx());
  const scripts: string[] = [];
  const calls: { fn: string; args: any }[] = [];
  let loaded = false;
  const answer = (fn: string, args: any): unknown => {
    switch (fn) {
      case 'ping': return { ok: true, data: { build: BUILD, app: '26.5', host } };
      case 'getContext': return { ok: true, data: ctx };
      case 'checkFonts': return { ok: true, data: (args as string[]).map((n) => ({ postScriptName: n, found: true, build: '1.002', substitute: false })) };
      case 'insertItem': return landed(args);
      case 'findPlaced': return { ok: true, data: null };
      case 'diag': return { ok: true, data: { app: '26.5', build: BUILD } };
      default: return { ok: false, error: { code: 'UNKNOWN_FN', message: fn } };
    }
  };
  // The engine: a script that is not CRBK.call is the adapter source; before it, CRBK is not there.
  const evalScript = (script: string, cb: (r: string) => void): void => {
    scripts.push(script);
    const m = /^CRBK\.call\("(\w+)", ("(?:[^"\\]|\\.)*")\)$/.exec(script);
    if (!m) {
      loaded = true;
      cb('undefined');
      return;
    }
    if (!loaded) {
      cb('EvalScript error.');
      return;
    }
    const args: unknown = JSON.parse(JSON.parse(m[2] as string));
    calls.push({ fn: m[1] as string, args });
    cb(JSON.stringify(answer(m[1] as string, args)));
  };

  const fakeProcess = {
    env: { LOCALAPPDATA: local, ProgramData: tmp + '/pd', WINDIR: windows, CommonProgramFiles: tmp + '/common' },
    platform: 'win32',
  };
  const storage = memoryStorage();
  const win: AppWindow = {
    __adobe_cep__: {
      evalScript,
      getHostEnvironment: () => JSON.stringify({ appName: host === 'pr' ? 'PPRO' : 'AEFT', appVersion: host === 'pr' ? '26.5.2' : '26.5.0' }),
      getSystemPath: (type) => (type === 'extension' ? nodeUrl.pathToFileURL(extension).href : ''),
      requestOpenExtension: () => undefined,
    },
    cep_node: { require: (id: string) => (id === 'process' ? fakeProcess : req(id)) },
    localStorage: storage,
  };
  return { win, tmp, local, winFonts: windows + '/Fonts', libraryRoot, scripts, calls, storage };
}

// A panel on the window of a profile; its log is flushed before the profile is deleted.
function open(p: Profile): PanelApp {
  const app = createApp({ win: p.win, versions: VERSIONS, now: NOW });
  opened.push(app);
  return app;
}

const REQUIRED_FONTS = [['SBSansText-Regular', '1.003'], ['SBSansDisplay-Bold', '1.002'], ['SBSansDisplay-Semibold', '1.002'], ['SBSansDisplay-Regular', '1.002']] as const;
const installFonts = (dir: string) => {
  for (const [name, build] of REQUIRED_FONTS) write(dir + '/' + name + '.otf', sbFont(name, build));
};

describe('createApp on the real services', () => {
  it('loads the adapter from the extension folder, reads the library from the root of settings.json and lists the items', async () => {
    const p = profile('pr');
    const app = open(p);
    const r = await app.start();
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.root).toBe(p.libraryRoot);
    expect(r.items.map((i) => i.id)).toEqual(['LOGO_Shot', 'LOGO_Mark', 'TTL_LowerThird']);
    // the engine did not know CRBK: the panel sent the adapter it read from <extension>/host/pr.jsx, then called it
    expect(p.scripts[0]).toBe('CRBK.call("ping", "{}")');
    expect(p.scripts[1]).toBe('/* the adapter of pr, ASCII only */\nvar loadedByTest = true;\n');
    expect(p.scripts[2]).toBe('CRBK.call("ping", "{}")');
    expect(app.info()).toMatchObject({ host: 'pr', hostVersion: '26.5.2', build: BUILD, library: '2026.10.05', libraryRoot: p.libraryRoot });
  });

  it('inserts a Premiere template over the bridge, with the path of the library as it is on disk, and remembers the values', async () => {
    const p = profile('pr');
    const app = open(p);
    await app.start();
    const mark = item('LOGO_Mark');
    const outcome = await app.insert(request(mark, { values: { ...defaults(mark), theme: 1, plate: false } }));
    expect(outcome.ok).toBe(true);
    const insert = p.calls.find((c) => c.fn === 'insertItem')!;
    expect(insert.args.mogrtPath).toBe(p.libraryRoot + '/items/LOGO_Mark/LOGO_Mark_16x9_v1.mogrt'); // Cyrillic and a space survive the bridge
    expect(insert.args.fields.map((f: { egpName: string }) => f.egpName)).toEqual(['Подложка', 'Тема', 'Фон', 'Скорость']);
    expect(app.initialValues(mark)).toMatchObject({ theme: 1, plate: false });
    expect(JSON.parse(p.storage.map.get('crbk.fields.LOGO_Mark@1') ?? '{}')).toMatchObject({ theme: 1, plate: false });
  });

  it('checks the fonts of a Premiere template in the font folders of the profile, once', async () => {
    const p = profile('pr');
    const app = open(p);
    await app.start();
    const missing = await app.prepare(request(ttl()));
    expect(missing.ok).toBe(false);
    expect(missing.issues.map((i) => [i.code, i.params?.font])).toEqual([
      ['FONT_MISSING', 'SBSansText-Regular'],
      ['FONT_MISSING', 'SBSansDisplay-Bold'],
      ['FONT_MISSING', 'SBSansDisplay-Semibold'],
      ['FONT_MISSING', 'SBSansDisplay-Regular'],
    ]);
    expect(p.calls.filter((c) => c.fn === 'insertItem')).toHaveLength(0);
    expect(p.calls.filter((c) => c.fn === 'checkFonts')).toHaveLength(0); // Premiere asks no host
    // installing them later does not change the scan until the panel is opened again: the host would not see
    // them before a restart either, which is what FONT_MISSING tells the user
    installFonts(p.winFonts);
    expect((await app.prepare(request(ttl()))).ok).toBe(false);
    const again = open(p);
    expect((await again.prepare(request(ttl()))).ok).toBe(true);
    expect((await again.insert(request(ttl()))).ok).toBe(true);
  });

  it('says the check failed, not that SB Sans is missing, when the font folders cannot be read', async () => {
    const p = profile('pr', { otherFonts: false });
    const app = open(p);
    await app.start();
    expect((await app.prepare(request(ttl()))).issues).toEqual([{ code: 'FONT_CHECK_FAILED', level: 'error' }]);
    expect(await app.fonts()).toBeNull();
    // an item that needs no font is not held up by it
    expect((await app.insert(request(item('LOGO_Mark')))).ok).toBe(true);
    // a failed scan is not kept: when the folders can be read, the next look finds what is there
    write(p.winFonts + '/ArialMT.otf', sbFont('ArialMT', '7.00'));
    installFonts(p.winFonts);
    expect((await app.prepare(request(ttl()))).ok).toBe(true);
  });

  it('shows the fonts of the library for the status bar', async () => {
    const p = profile('pr');
    installFonts(p.winFonts);
    const statuses = await open(p).fonts();
    expect(statuses?.map((s) => [s.postScriptName, s.found, s.build])).toEqual([
      ['SBSansDisplay-Semibold', true, '1.002'],
      ['SBSansText-Regular', true, '1.003'],
      ['SBSansDisplay-Bold', true, '1.002'],
      ['SBSansDisplay-Regular', true, '1.002'],
    ]);
  });

  it('asks After Effects for the fonts and inserts a layer', async () => {
    const p = profile('ae');
    const app = open(p);
    await app.start();
    const outcome = await app.insert(request(ttl()));
    expect(outcome.ok).toBe(true);
    expect(p.calls.find((c) => c.fn === 'checkFonts')?.args).toEqual([
      'SBSansText-Regular', 'SBSansDisplay-Bold', 'SBSansDisplay-Semibold', 'SBSansDisplay-Regular',
    ]);
    const insert = p.calls.find((c) => c.fn === 'insertItem')!;
    expect(insert.args).toMatchObject({ aepPath: p.libraryRoot + '/items/TTL_LowerThird/TTL_LowerThird_v1.aep', aeComp: 'CR_TTL_LowerThird_16x9_v1' });
  });

  it('writes the log of the day beside the settings, and no word of it needs the disk to be ready first', async () => {
    const p = profile('pr');
    const app = open(p);
    await app.start();
    await app.insert(request(item('LOGO_Mark')));
    await app.flushLog();
    const dir = p.local + '/CloudRuBrandKit/logs';
    const names: string[] = nodeFs.readdirSync(dir);
    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(/^brandkit-\d{4}-\d{2}-\d{2}\.jsonl$/);
    const raw: string = nodeFs.readFileSync(dir + '/' + names[0], 'utf8');
    const lines: LogEntry[] = raw.trim().split('\n').map((l) => JSON.parse(l) as LogEntry);
    expect(lines.map((l) => l.code)).toEqual(expect.arrayContaining(['APP_START', 'LIBRARY_LOADED', 'ADAPTER_LOADED', 'INSERT_START', 'INSERT_OK']));
    expect(lines.every((l) => typeof l.ts === 'string' && l.ts !== '')).toBe(true);
  });

  it('says the library is missing when the folder has none, with the path of the file', async () => {
    const p = profile('pr', { library: false });
    const r = await open(p).start();
    expect(r.ok).toBe(false);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({ code: 'LIBRARY_MISSING' });
    expect(String(r.issues[0]?.params?.path)).toContain('library.json');
    expect(r.adapter).toBe(true);
  });

  it('refuses the library of a pipeline newer than the panel: the real validator speaks', async () => {
    const p = profile('pr');
    write(p.libraryRoot + '/library.json', JSON.stringify({ ...catalog(), minPluginVersion: '3.0.0' }));
    const r = await open(p).start();
    expect(r.issues).toEqual([{ code: 'PLUGIN_TOO_OLD', level: 'error', params: { need: '3.0.0', have: '0.1.0' } }]);
  });

  it('reads the real library of this machine and finds it valid, when it is there', async ({ skip }) => {
    if (!nodeFs.existsSync(REAL_LIBRARY)) skip();
    const p = profile('pr', { library: false });
    write(p.libraryRoot + '/library.json', nodeFs.readFileSync(REAL_LIBRARY, 'utf8'));
    const r = await open(p).start();
    expect(r.issues).toEqual([]);
    expect(r.items.length).toBeGreaterThan(0);
  });
});
