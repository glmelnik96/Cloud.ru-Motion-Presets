// tools/library/build-catalog.mjs: library.src.json + the packaged masters -> <root>/library.json and items/<id>/.
// Unit tests run on fixture MOGRTs written with adm-zip and a fake preview maker (no ffmpeg); the last block
// builds the real pack 1 from C:/CRBK/work/build into a temporary root where those builds exist.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertRelease, buildCatalog, calverDate, ffmpegPreview, findFfmpeg, mp4VideoSeconds, nextLibraryVersion, pinFonts,
  runFfmpeg, summary,
} from '../../tools/library/build-catalog.mjs';
import { validateLibrary } from '../../tools/library/validate.mjs';
import { hasBinary, probeMedia } from '../../tools/lib/media-probe.mjs';

const REPO = new URL('../../', import.meta.url);
const CLI = fileURLToPath(new URL('tools/library/build-catalog.mjs', REPO));
const USAGE = 'usage: node tools/library/build-catalog.mjs --root <dir> [--date YYYY.MM.DD] [--work <dir>]';
const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, REPO), 'utf8'));
const SOURCE = readJson('library/library.src.json');
const TOKENS = readJson('brand/tokens.json');
const NOW = new Date('2026-10-05T01:02:03.456Z');
const sha = (data) => createHash('sha256').update(data).digest('hex');
const posix = (p) => p.replace(/\\/g, '/');

// Every entry under a folder: the sha256 of each file, 'dir' for each folder.
function snapshot(dir, rel = '', out = {}) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const name = rel + e.name;
    if (e.isDirectory()) {
      out[name + '/'] = 'dir';
      snapshot(path.join(dir, e.name), name + '/', out);
    } else {
      out[name] = sha(readFileSync(path.join(dir, e.name)));
    }
  }
  return out;
}

// The boxes of an MP4 that mp4VideoSeconds reads: moov/trak/mdia with mdhd (version 0 or 1) and hdlr.
const box = (type, ...parts) => {
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + body.length);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, body]);
};
function track(handler, timescale, units, version = 0) {
  const mdhd = Buffer.alloc(version === 1 ? 36 : 24);
  mdhd[0] = version;
  if (version === 1) {
    mdhd.writeUInt32BE(timescale, 20);
    mdhd.writeBigUInt64BE(BigInt(units), 24);
  } else {
    mdhd.writeUInt32BE(timescale, 12);
    mdhd.writeUInt32BE(units, 16);
  }
  const hdlr = Buffer.alloc(25);
  hdlr.write(handler, 8, 'latin1');
  return box('trak', box('tkhd', Buffer.alloc(84)), box('mdia', box('mdhd', mdhd), box('hdlr', hdlr)));
}
const mp4 = (...traks) => Buffer.concat([box('ftyp', Buffer.from('isom')), box('moov', box('mvhd', Buffer.alloc(100)), ...traks), box('mdat', Buffer.alloc(8))]);

const temps = [];
const tempDir = (prefix) => {
  const d = mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(d);
  return d;
};
afterEach(() => {
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true });
});

const ui = (str) => ({ strDB: [{ localeString: 'en_US', str }] });
const CONTROL_TYPE = { text: 6, dropdown: 13, checkbox: 1, slider: 2, media: 14 };

// definition.json of a variant as AE 26.5 exports it, reduced to what the builder reads.
function definitionFor(item, key) {
  const fields = [...(item.fields || [])].sort((a, b) => a.egpIndex - b.egpIndex);
  return {
    capsuleID: '11111111-2222-3333-4444-555555555555',
    capsuleName: `${item.id}_${key}_v${item.version}`,
    clientControls: fields.map((f, i) => ({
      id: 'c' + i,
      type: CONTROL_TYPE[f.type],
      uiName: ui(f.egpName),
      ...(f.type === 'dropdown' ? { menucontent: f.options.map((o) => ui(o.label_ru)), value: f.default } : {}),
    })),
    usedFileTypes: [],
    usedFontsLocalized: { en_US: (item.requiredFonts || []).map((f) => f.postScriptName).reverse() },
  };
}

function writeMogrt(file, definition, { aegraphic = true, thumb = true } = {}) {
  const zip = new AdmZip();
  zip.addFile('definition.json', Buffer.from(JSON.stringify(definition), 'utf8'));
  if (aegraphic) zip.addFile('project.aegraphic', Buffer.from('aegraphic'));
  if (thumb) zip.addFile('thumb.mp4', Buffer.isBuffer(thumb) ? thumb : Buffer.from('thumb of ' + definition.capsuleName));
  zip.addFile('thumb.png', Buffer.from('png'));
  zip.writeZip(file);
}

// <work>/build/<id>/ as tools/masters/package.mjs leaves it, with the older copies it keeps next to the release.
function makeWork(items, edit) {
  const work = tempDir('crbk-work-');
  for (const it of items) {
    const dir = path.join(work, 'build', it.id);
    mkdirSync(path.join(dir, 'mogrt'), { recursive: true });
    writeFileSync(path.join(dir, `${it.id}_v${it.version}.aep`), 'aep of ' + it.id);
    writeFileSync(path.join(dir, `${it.id}_v${it.version}.prev.aep`), 'previous aep');
    writeFileSync(path.join(dir, `${it.id}_work.aep`), 'working project');
    for (const v of it.variants) {
      const file = path.join(dir, 'mogrt', `${it.id}_${v.key}_v${it.version}.mogrt`);
      const def = definitionFor(it, v.key);
      const opts = (edit && edit(def, it, v)) || {};
      writeMogrt(file, def, opts);
      writeFileSync(file.replace(/\.mogrt$/, '.prev.mogrt'), 'previous mogrt');
    }
  }
  return work;
}

function fakePreview(calls) {
  return async ({ mogrt, posterSec, dir }) => {
    calls.push({ mogrt: path.basename(mogrt), posterSec });
    writeFileSync(path.join(dir, 'preview.mp4'), 'preview of ' + path.basename(mogrt));
    writeFileSync(path.join(dir, 'poster.jpg'), 'poster at ' + posterSec);
  };
}

function setup({ ids = ['LOGO_Mark', 'TTL_LowerThird'], edit } = {}) {
  const source = { schemaVersion: 1, items: ids.map((id) => structuredClone(SOURCE.items.find((i) => i.id === id))) };
  const work = makeWork(source.items, edit);
  const root = tempDir('crbk-lib-');
  const calls = [];
  const opts = {
    root, work, source, tokens: TOKENS, pluginVersion: '0.1.0', date: '2026.10.05', now: NOW,
    makePreview: fakePreview(calls), log: () => {},
  };
  return { opts, calls, root, work, source };
}

const failure = async (promise) => {
  try {
    await promise;
  } catch (e) {
    return e;
  }
  throw new Error('expected a refusal');
};

describe('buildCatalog', () => {
  it('writes library.json and items/<id>/ from the source and the build folder', async () => {
    const { opts, calls, root, work, source } = setup();
    const r = await buildCatalog(opts);
    const doc = JSON.parse(readFileSync(path.join(root, 'library.json'), 'utf8'));
    expect(doc).toEqual(r.doc);
    expect(validateLibrary(doc, 'catalog')).toEqual({ ok: true, kind: 'catalog', errors: [] });
    expect(Object.keys(doc)).toEqual(['schemaVersion', 'libraryVersion', 'minPluginVersion', 'generatedAt', 'items']);
    expect(doc).toMatchObject({ schemaVersion: 1, libraryVersion: '2026.10.05', minPluginVersion: '0.1.0', generatedAt: '2026-10-05T01:02:03Z' });

    const [mark, ttl] = doc.items;
    const src = source.items[1];
    // Every source key is copied as is; the pipeline completes fonts and variants and adds the stored files.
    for (const k of Object.keys(src)) if (k !== 'requiredFonts' && k !== 'variants') expect(ttl[k]).toEqual(src[k]);
    expect(Object.keys(ttl)).toEqual([...Object.keys(src), 'aep', 'preview', 'poster']);
    expect(ttl.requiredFonts).toEqual([
      { postScriptName: 'SBSansText-Regular', build: '1.003' },
      { postScriptName: 'SBSansDisplay-Bold', build: '1.002' },
      { postScriptName: 'SBSansDisplay-Semibold', build: '1.002' },
      { postScriptName: 'SBSansDisplay-Regular', build: '1.002' },
    ]);
    expect('requiredFonts' in mark).toBe(false);

    ttl.variants.forEach((v, i) => {
      const { aeComp, ...rest } = src.variants[i];
      expect(v).toMatchObject(rest);
      expect(v.aeComp).toBe(aeComp + '_v1');
      expect(v.file).toBe(`items/TTL_LowerThird/TTL_LowerThird_${v.key}_v1.mogrt`);
      const copied = readFileSync(path.join(root, v.file));
      expect(copied.equals(readFileSync(path.join(work, 'build', 'TTL_LowerThird', 'mogrt', `TTL_LowerThird_${v.key}_v1.mogrt`)))).toBe(true);
      expect([v.sha256, v.bytes]).toEqual([sha(copied), copied.length]);
    });
    const aep = 'aep of TTL_LowerThird';
    expect(ttl.aep).toEqual({ file: 'items/TTL_LowerThird/TTL_LowerThird_v1.aep', sha256: sha(aep), bytes: aep.length });
    const preview = 'preview of TTL_LowerThird_16x9_v1.mogrt';
    expect(ttl.preview).toEqual({ file: 'items/TTL_LowerThird/preview.mp4', sha256: sha(preview), bytes: preview.length });
    expect(ttl.poster).toEqual({ file: 'items/TTL_LowerThird/poster.jpg', sha256: sha('poster at 3.1'), bytes: 13 });
    // The poster is cut from the middle of the hold: introSec + holdSec / 2.
    expect(calls).toEqual([
      { mogrt: 'LOGO_Mark_16x9_v1.mogrt', posterSec: 3.08 },
      { mogrt: 'TTL_LowerThird_16x9_v1.mogrt', posterSec: 3.1 },
    ]);

    expect(readdirSync(root).sort()).toEqual(['items', 'library.json']);
    expect(readdirSync(path.join(root, 'items', 'TTL_LowerThird')).sort()).toEqual([
      'TTL_LowerThird_16x9_4K_v1.mogrt', 'TTL_LowerThird_16x9_v1.mogrt', 'TTL_LowerThird_1x1_v1.mogrt',
      'TTL_LowerThird_9x16_v1.mogrt', 'TTL_LowerThird_v1.aep', 'poster.jpg', 'preview.mp4',
    ]);
    expect(r.files).toHaveLength(7 + 6);
    expect(r.files.find((f) => f.file === 'items/TTL_LowerThird/TTL_LowerThird_v1.aep')).toEqual({ id: 'TTL_LowerThird', kind: 'aep', file: 'items/TTL_LowerThird/TTL_LowerThird_v1.aep', bytes: aep.length });
    expect(r.stale).toEqual([]);
  });

  it('numbers more builds of one day and starts over on the next day', async () => {
    const { opts } = setup({ ids: ['LOGO_Mark'] });
    const versions = [];
    for (const date of ['2026.10.05', '2026.10.05', '2026.10.05', '2026.10.06']) {
      versions.push((await buildCatalog({ ...opts, date })).doc.libraryVersion);
    }
    expect(versions).toEqual(['2026.10.05', '2026.10.05.1', '2026.10.05.2', '2026.10.06']);
  });

  it('dates the build by the local calendar when no date is given', async () => {
    const { opts } = setup({ ids: ['LOGO_Mark'] });
    const now = new Date(2026, 9, 7, 23, 59);
    const r = await buildCatalog({ ...opts, date: undefined, now });
    expect(r.doc.libraryVersion).toBe('2026.10.07');
    expect(r.doc.generatedAt).toBe(now.toISOString().replace(/\.\d+Z$/, 'Z'));
  });

  it('lists files of the root that the catalog no longer names, and keeps them', async () => {
    const { opts, root } = setup({ ids: ['LOGO_Mark'] });
    mkdirSync(path.join(root, 'items', 'LOGO_Mark'), { recursive: true });
    mkdirSync(path.join(root, 'items', 'LOGO_Old'), { recursive: true });
    writeFileSync(path.join(root, 'items', 'LOGO_Mark', 'LOGO_Mark_16x9_v0.mogrt'), 'old');
    const r = await buildCatalog(opts);
    expect(r.stale).toEqual(['items/LOGO_Mark/LOGO_Mark_16x9_v0.mogrt', 'items/LOGO_Old']);
    expect(existsSync(path.join(root, 'items', 'LOGO_Mark', 'LOGO_Mark_16x9_v0.mogrt'))).toBe(true);
  });

  const qa = [
    ['the control order', (d) => { d.clientControls.reverse(); }, /TTL_LowerThird 9x16: TTL_LowerThird_9x16_v1\.mogrt: controls \[Размер текста, .*\], expected \[Имя, /],
    ['a missing control', (d) => { d.clientControls.pop(); }, /controls \[.*\], expected \[.*Размер текста\]/],
    ['a control kind', (d) => { d.clientControls[3].type = 2; }, /control "Стиль" is a slider, the field is a dropdown/],
    ['a dropdown item', (d) => { d.clientControls[4].menucontent[1] = ui('Справа '); }, /dropdown "Сторона" items \[Слева, Справа \], expected \[Слева, Справа\]/],
    ['a missing dropdown item', (d) => { d.clientControls[5].menucontent.pop(); }, /dropdown "Скорость" items/],
    ['the fonts', (d) => { d.usedFontsLocalized.en_US.pop(); }, /fonts en_US \[SBSansDisplay-Bold, SBSansDisplay-Regular, SBSansDisplay-Semibold\], expected \[.*SBSansText-Regular\]/],
    ['footage', (d) => { d.usedFileTypes = ['png']; }, /usedFileTypes \["png"\], expected \[\]/],
    ['the capsule name', (d) => { d.capsuleName = 'TTL_LowerThird_16x9_v1'; }, /capsuleName "TTL_LowerThird_16x9_v1", expected "TTL_LowerThird_9x16_v1"/],
    ['project.aegraphic', () => ({ aegraphic: false }), /no project\.aegraphic/],
  ];
  it.each(qa)('refuses a MOGRT that differs from the catalog: %s', async (_, change, message) => {
    const { opts, root } = setup({ ids: ['TTL_LowerThird'], edit: (d, it, v) => (v.key === '9x16' ? change(d) : undefined) });
    const e = await failure(buildCatalog(opts));
    expect(e.message).toMatch(message);
    expect(e.problems.every((p) => p.startsWith('TTL_LowerThird 9x16: '))).toBe(true);
    expect(readdirSync(root)).toEqual([]);
  });

  it('refuses a MOGRT it cannot read', async () => {
    const { opts, root, work } = setup({ ids: ['LOGO_Mark'] });
    writeFileSync(path.join(work, 'build', 'LOGO_Mark', 'mogrt', 'LOGO_Mark_9x16_v1.mogrt'), 'not a zip');
    const e = await failure(buildCatalog(opts));
    expect(e.problems).toHaveLength(1);
    expect(e.problems[0]).toMatch(/^LOGO_Mark 9x16: LOGO_Mark_9x16_v1\.mogrt: unreadable \(.+\)$/);
    expect(readdirSync(root)).toEqual([]);
  });

  it('refuses missing files and names each of them', async () => {
    const { opts, root, work } = setup({ ids: ['LOGO_Mark'] });
    rmSync(path.join(work, 'build', 'LOGO_Mark', 'LOGO_Mark_v1.aep'));
    rmSync(path.join(work, 'build', 'LOGO_Mark', 'mogrt', 'LOGO_Mark_9x16_v1.mogrt'));
    const e = await failure(buildCatalog(opts));
    expect(e.problems).toEqual([
      `LOGO_Mark: missing ${path.posix.join(work.replace(/\\/g, '/'), 'build/LOGO_Mark/LOGO_Mark_v1.aep')}`,
      `LOGO_Mark: missing ${path.posix.join(work.replace(/\\/g, '/'), 'build/LOGO_Mark/mogrt/LOGO_Mark_9x16_v1.mogrt')}`,
    ]);
    expect(readdirSync(root)).toEqual([]);
  });

  it('refuses an invalid source, an unknown font and items other than T1', async () => {
    const bad = setup({ ids: ['LOGO_Mark'] });
    bad.opts.source.items[0].colour = 'green';
    expect((await failure(buildCatalog(bad.opts))).message).toMatch(/source: schema: \/items\/0 unknown property "colour"/);

    const font = setup({ ids: ['TTL_LowerThird'] });
    font.opts.source.items[0].requiredFonts.push({ postScriptName: 'ArialMT' });
    expect((await failure(buildCatalog(font.opts))).problems).toEqual(['TTL_LowerThird: font ArialMT is not in brand/tokens.json type.fonts']);

    const tier = setup({ ids: ['LOGO_Mark'] });
    tier.opts.source.items.push({ id: 'SFX_WhooshIn', title_ru: 'Звук', category: 'sounds', tier: 'T3', hosts: ['pr'], version: 1, variants: [{ key: 'wav' }] });
    expect((await failure(buildCatalog(tier.opts))).problems).toEqual(['SFX_WhooshIn: tier T3: build-catalog builds T1 items only']);
    for (const s of [bad, font, tier]) expect(readdirSync(s.root)).toEqual([]);
  });

  it('refuses a catalog that fails validation and leaves the previous library as it was', async () => {
    const { opts, root, work } = setup({ ids: ['LOGO_Mark'] });
    await buildCatalog(opts);
    const before = readFileSync(path.join(root, 'library.json'), 'utf8');
    writeFileSync(path.join(work, 'build', 'LOGO_Mark', 'LOGO_Mark_v1.aep'), 'rebuilt aep');
    const e = await failure(buildCatalog({ ...opts, pluginVersion: 'dev' }));
    expect(e.problems).toEqual(['catalog: schema: /minPluginVersion must match pattern "^[0-9]+\\.[0-9]+\\.[0-9]+$"']);
    expect(readFileSync(path.join(root, 'library.json'), 'utf8')).toBe(before);
    expect(readFileSync(path.join(root, 'items', 'LOGO_Mark', 'LOGO_Mark_v1.aep'), 'utf8')).toBe('aep of LOGO_Mark');
    expect(readdirSync(root).sort()).toEqual(['items', 'library.json']);
  });

  it('refuses a bad --date in one line, and so does the command line', async () => {
    const { opts, root } = setup({ ids: ['LOGO_Mark'] });
    const e = await failure(buildCatalog({ ...opts, date: '2026-10-05' }));
    expect(e.problems).toEqual(['date must be YYYY.MM.DD, got 2026-10-05']);
    const r = spawnSync(process.execPath, [CLI, '--root', root, '--work', opts.work, '--date', '2026-10-05'], { encoding: 'utf8' });
    expect([r.status, r.stderr.trim().split(/\r?\n/)]).toEqual([2, ['date must be YYYY.MM.DD, got 2026-10-05', USAGE]]);
    expect(readdirSync(root)).toEqual([]);
  });

  it('warns when the poster comes from before the middle of the hold', async () => {
    const { opts } = setup({ ids: ['LOGO_Mark'] });
    const logs = [];
    const fake = fakePreview([]);
    const makePreview = async (a) => {
      await fake(a);
      return { posterSec: 1.9 };
    };
    await buildCatalog({ ...opts, makePreview, log: (line) => logs.push(line) });
    expect(logs).toEqual(['warn LOGO_Mark: thumb.mp4 of LOGO_Mark_16x9_v1.mogrt ends before 3.08 s, the middle of the hold; the poster is its frame at 1.9 s']);
  });
});

// The moves into <root> come after every check: an I/O error there must leave the previous library whole.
describe('buildCatalog moving files into place', () => {
  const placed = (root, id, name) => path.join(root, 'items', id, name);
  const busy = (file) => Object.assign(new Error(`EBUSY: resource busy or locked, rename '${posix(file)}'`), { code: 'EBUSY' });

  // LOGO_Mark and TTL_LowerThird built into a library, then both .aep rebuilt in the work folder, so that a second
  // build replaces files with other bytes.
  async function rebuilt() {
    const s = setup();
    await buildCatalog(s.opts);
    for (const id of ['LOGO_Mark', 'TTL_LowerThird']) writeFileSync(path.join(s.work, 'build', id, `${id}_v1.aep`), 'rebuilt aep of ' + id);
    return { ...s, before: snapshot(s.root) };
  }

  it.each([
    ['the previous poster of the second item cannot move aside', (root) => (from) => from === placed(root, 'TTL_LowerThird', 'poster.jpg')],
    ['the new poster of the second item cannot move in', (root) => (from, to) => to === placed(root, 'TTL_LowerThird', 'poster.jpg')],
    ['library.json cannot be replaced', (root) => (from, to) => to === path.join(root, 'library.json')],
  ])('puts every file back when a move fails: %s', async (_, failing) => {
    const { opts, root, before } = await rebuilt();
    const fails = failing(root);
    // The move fails once; moving the previous file back to the same place later succeeds.
    let failed = false;
    const rename = (from, to) => {
      if (!failed && fails(from, to)) {
        failed = true;
        throw busy(from);
      }
      renameSync(from, to);
    };
    const e = await failure(buildCatalog({ ...opts, rename }));
    expect(e.message).toMatch(/^could not move the new files into .+: EBUSY: resource busy or locked/);
    expect(e.message.split('\n').slice(1)).toEqual(['every file is back as it was; library.json is unchanged']);
    expect(e.kept).toBeNull();
    expect(snapshot(root)).toEqual(before);
  });

  // libuv's UV_FS_O_EXLOCK opens a file without sharing on Windows, as a player or a preview pane may hold it.
  const EXLOCK = 0x10000000;
  it.skipIf(process.platform !== 'win32')('puts every file back when a file of the library is open without sharing', async () => {
    const { opts, root, before } = await rebuilt();
    const fd = openSync(placed(root, 'TTL_LowerThird', 'preview.mp4'), EXLOCK);
    let e;
    try {
      e = await failure(buildCatalog(opts));
    } finally {
      closeSync(fd);
    }
    expect(e.message).toMatch(/^could not move the new files into .+: E(BUSY|PERM)\b/);
    expect(e.message).toMatch(/\nevery file is back as it was; library\.json is unchanged$/);
    expect(snapshot(root)).toEqual(before);
  });

  it('keeps the stage with a previous file it could not put back, and says where', async () => {
    const { opts, root, before } = await rebuilt();
    const aep = placed(root, 'LOGO_Mark', 'LOGO_Mark_v1.aep');
    let failed = false;
    const rename = (from, to) => {
      if (from === placed(root, 'TTL_LowerThird', 'poster.jpg')) {
        failed = true;
        throw busy(from);
      }
      // Once the moves have failed, the previous LOGO_Mark aep cannot go back either.
      if (failed && to === aep) throw busy(to);
      renameSync(from, to);
    };
    const e = await failure(buildCatalog({ ...opts, rename }));
    const stages = readdirSync(root).filter((n) => n.startsWith('.staging-'));
    expect(stages).toHaveLength(1);
    const stage = path.join(root, stages[0]);
    const aside = path.join(stage, 'previous', 'LOGO_Mark', 'LOGO_Mark_v1.aep');
    expect(e.kept).toBe(stage);
    expect(e.message.split('\n').slice(1)).toEqual([
      `not put back: items/LOGO_Mark/LOGO_Mark_v1.aep (EBUSY); the previous file is ${posix(aside)}`,
      `library.json is unchanged; ${posix(stage)} is kept`,
    ]);
    expect(readFileSync(aside, 'utf8')).toBe('aep of LOGO_Mark');
    // Apart from the stage, only that aep differs from before.
    const after = Object.fromEntries(Object.entries(snapshot(root)).filter(([k]) => !k.startsWith(stages[0])));
    expect(after).toEqual({ ...before, 'items/LOGO_Mark/LOGO_Mark_v1.aep': sha('rebuilt aep of LOGO_Mark') });
  });

  it('takes the files of a new item out again, folder and all, when the move fails', async () => {
    const { opts, root } = setup();
    await buildCatalog({ ...opts, source: { ...opts.source, items: opts.source.items.filter((i) => i.id === 'LOGO_Mark') } });
    const before = snapshot(root);
    const library = path.join(root, 'library.json');
    const aep = placed(root, 'TTL_LowerThird', 'TTL_LowerThird_v1.aep');
    const failing = (stuck) => {
      let failed = false;
      return (from, to) => {
        if (!failed && to === library) {
          failed = true;
          throw busy(from);
        }
        if (failed && stuck && from === aep) throw busy(from);
        renameSync(from, to);
      };
    };
    const e = await failure(buildCatalog({ ...opts, rename: failing(false) }));
    expect(e.message.split('\n').slice(1)).toEqual(['every file is back as it was; library.json is unchanged']);
    expect(snapshot(root)).toEqual(before);

    // A new file that cannot leave stays, with its folder and the stage.
    const e2 = await failure(buildCatalog({ ...opts, rename: failing(true) }));
    const stage = readdirSync(root).find((n) => n.startsWith('.staging-'));
    expect(e2.message.split('\n').slice(1)).toEqual([
      'not taken out: items/TTL_LowerThird/TTL_LowerThird_v1.aep (EBUSY); it was not there before',
      `library.json is unchanged; ${posix(path.join(root, stage))} is kept`,
    ]);
    expect(readdirSync(path.join(root, 'items', 'TTL_LowerThird'))).toEqual(['TTL_LowerThird_v1.aep']);
  });

  it('refuses a folder where a file of the library goes, before anything moves', async () => {
    const { opts, root } = await rebuilt();
    const poster = placed(root, 'TTL_LowerThird', 'poster.jpg');
    rmSync(poster);
    mkdirSync(poster);
    writeFileSync(path.join(poster, 'note.txt'), 'kept');
    const before = snapshot(root);
    const e = await failure(buildCatalog(opts));
    expect(e.problems).toEqual(['items/TTL_LowerThird/poster.jpg is a folder, not a file']);
    expect(snapshot(root)).toEqual(before);
  });
});

describe('helpers', () => {
  it('nextLibraryVersion appends .N on the same day only', () => {
    expect(nextLibraryVersion('2026.10.05', null)).toBe('2026.10.05');
    expect(nextLibraryVersion('2026.10.05', '2026.10.04.7')).toBe('2026.10.05');
    expect(nextLibraryVersion('2026.10.05', '2026.10.05')).toBe('2026.10.05.1');
    expect(nextLibraryVersion('2026.10.05', '2026.10.05.9')).toBe('2026.10.05.10');
    expect(nextLibraryVersion('2026.10.05', 'nonsense')).toBe('2026.10.05');
  });

  it('calverDate reads the local calendar', () => {
    expect(calverDate(new Date(2026, 0, 2, 0, 1))).toBe('2026.01.02');
    expect(calverDate(new Date(2026, 11, 31, 23, 59))).toBe('2026.12.31');
  });

  it('assertRelease refuses previous copies and working projects', () => {
    expect(() => assertRelease('C:/CRBK/work/build/LOGO_Mark/LOGO_Mark_v1.prev.aep')).toThrow(/LOGO_Mark_v1\.prev\.aep/);
    expect(() => assertRelease('C:/CRBK/work/build/LOGO_Mark/mogrt/LOGO_Mark_16x9_v1.prev.mogrt')).toThrow(/prev/);
    expect(() => assertRelease('C:/CRBK/work/build/LOGO_Mark/LOGO_Mark_work.aep')).toThrow(/_work\.aep/);
    expect(assertRelease('C:/CRBK/work/build/LOGO_Mark/LOGO_Mark_v1.aep')).toBe('C:/CRBK/work/build/LOGO_Mark/LOGO_Mark_v1.aep');
  });

  it('pinFonts takes the build from the tokens and refuses a source build that disagrees', () => {
    expect(pinFonts([{ postScriptName: 'SBSansText-Regular' }, { postScriptName: 'SBSansDisplay-Bold', build: '1.002' }], TOKENS)).toEqual({
      fonts: [{ postScriptName: 'SBSansText-Regular', build: '1.003' }, { postScriptName: 'SBSansDisplay-Bold', build: '1.002' }],
      problems: [],
    });
    expect(pinFonts([{ postScriptName: 'SBSansText-Regular', build: '1.002' }], TOKENS).problems).toEqual([
      'font SBSansText-Regular: the source pins build 1.002, brand/tokens.json has 1.003',
    ]);
  });

  it('summary sizes each item and the whole library', () => {
    const f = (kind, bytes) => ({ id: 'LOGO_Mark', kind, file: `items/LOGO_Mark/${kind}`, bytes });
    const r = {
      file: 'C:/CRBK/work/library/library.json',
      doc: { libraryVersion: '2026.10.05.1', items: [{ id: 'LOGO_Mark', version: 1 }] },
      files: [f('aep', 2048), f('mogrt', 1024), f('mogrt', 1024), f('preview', 512), f('poster', 100)],
      stale: ['items/LOGO_Mark/LOGO_Mark_16x9_v0.mogrt'],
    };
    expect(summary(r)).toEqual([
      'LOGO_Mark v1: aep 2 KB, 2 mogrt 2 KB, preview 1 KB, poster 1 KB',
      'stale, kept: items/LOGO_Mark/LOGO_Mark_16x9_v0.mogrt',
      'OK C:/CRBK/work/library/library.json: 1 item, libraryVersion 2026.10.05.1, 5 files (1 aep, 2 mogrt, 1 preview, 1 poster), 5 KB',
    ]);
  });

  it('findFfmpeg takes FFMPEG, then C:/ffmpeg/bin, then PATH', () => {
    expect(findFfmpeg({ FFMPEG: 'D:/tools/ffmpeg.exe' }, () => true)).toBe('D:/tools/ffmpeg.exe');
    expect(findFfmpeg({}, (p) => p === 'C:/ffmpeg/bin/ffmpeg.exe')).toBe('C:/ffmpeg/bin/ffmpeg.exe');
    expect(findFfmpeg({}, () => false)).toBe('ffmpeg');
  });

  it('ffmpegPreview cuts preview.mp4 and poster.jpg from thumb.mp4', async () => {
    const dir = tempDir('crbk-preview-');
    const mogrt = path.join(dir, 'LOGO_Mark_16x9_v1.mogrt');
    writeMogrt(mogrt, definitionFor(SOURCE.items[1], '16x9'));
    const out = path.join(dir, 'out');
    mkdirSync(out);
    const runs = [];
    const run = (bin, args) => {
      const input = args[args.indexOf('-i') + 1];
      runs.push({ bin, args, input, thumb: readFileSync(input, 'utf8') });
      writeFileSync(args[args.length - 1], 'x');
    };
    expect(await ffmpegPreview({ ffmpeg: 'ffmpeg-bin', run })({ mogrt, posterSec: 3.08, dir: out })).toEqual({ posterSec: 3.08 });
    expect(runs).toHaveLength(2);
    const [preview, poster] = runs;
    // ffmpeg never waits for a key press on stdin.
    for (const r of runs) expect(r.args).toContain('-nostdin');
    expect(preview.bin).toBe('ffmpeg-bin');
    expect(preview.thumb).toBe('thumb of LOGO_Mark_16x9_v1');
    const p = preview.args.join(' ');
    for (const part of ['-an', '-vf scale=480:-2', '-c:v libx264', '-pix_fmt yuv420p', '-movflags +faststart']) expect(p).toContain(part);
    expect(preview.args.at(-1)).toBe(path.join(out, 'preview.mp4'));
    const a = poster.args;
    expect(a.slice(a.indexOf('-ss'), a.indexOf('-ss') + 2)).toEqual(['-ss', '3.080']);
    expect(a.indexOf('-ss')).toBeLessThan(a.indexOf('-i'));
    expect(a.join(' ')).toContain('-frames:v 1');
    expect(a.join(' ')).toContain('-vf scale=480:-2');
    expect(a.at(-1)).toBe(path.join(out, 'poster.jpg'));
    // The extracted thumb.mp4 lived in a temporary folder that is gone.
    expect(existsSync(path.dirname(preview.input))).toBe(false);
  });

  it('ffmpegPreview refuses a MOGRT without thumb.mp4 and an ffmpeg that writes nothing', async () => {
    const dir = tempDir('crbk-preview-');
    const bare = path.join(dir, 'bare.mogrt');
    writeMogrt(bare, definitionFor(SOURCE.items[1], '16x9'), { thumb: false });
    const run = () => {};
    await expect(ffmpegPreview({ ffmpeg: 'x', run })({ mogrt: bare, posterSec: 1, dir })).rejects.toThrow(/bare\.mogrt has no thumb\.mp4/);
    const good = path.join(dir, 'good.mogrt');
    writeMogrt(good, definitionFor(SOURCE.items[1], '16x9'));
    await expect(ffmpegPreview({ ffmpeg: 'x', run })({ mogrt: good, posterSec: 1, dir })).rejects.toThrow(/ffmpeg wrote no preview\.mp4/);
  });

  it('ffmpegPreview keeps the poster seek inside a thumb.mp4 shorter than it', async () => {
    const dir = tempDir('crbk-preview-');
    const mogrt = path.join(dir, 'LOGO_Mark_16x9_v1.mogrt');
    // A 2 s thumb: a seek to 3.08 s would decode no frame and ffmpeg would write no poster.
    writeMogrt(mogrt, definitionFor(SOURCE.items[1], '16x9'), { thumb: mp4(track('vide', 30000, 60000)) });
    const seeks = [];
    const run = (bin, args) => {
      if (args.includes('-ss')) seeks.push(args[args.indexOf('-ss') + 1]);
      writeFileSync(args.at(-1), 'x');
    };
    const make = ffmpegPreview({ ffmpeg: 'ffmpeg-bin', run });
    expect(await make({ mogrt, posterSec: 3.08, dir })).toEqual({ posterSec: 1.9 });
    expect(await make({ mogrt, posterSec: 1.5, dir })).toEqual({ posterSec: 1.5 });
    expect(seeks).toEqual(['1.900', '1.500']);
  });

  it('mp4VideoSeconds reads the length of the video track from the MP4 boxes', () => {
    expect(mp4VideoSeconds(mp4(track('vide', 30000, 120000)))).toBe(4);
    // As in AE's thumb.mp4 the audio track runs longer; here it also comes first, and the video mdhd is version 1.
    expect(mp4VideoSeconds(mp4(track('soun', 48000, 241920), track('vide', 90000, 450000, 1)))).toBe(5);
    expect(mp4VideoSeconds(mp4(track('soun', 48000, 241920)))).toBeNull();
    expect(mp4VideoSeconds(Buffer.from('thumb of LOGO_Mark_16x9_v1'))).toBeNull();
    expect(mp4VideoSeconds(Buffer.alloc(0))).toBeNull();
  });

  it('runFfmpeg stops a hung ffmpeg and reports one that fails', () => {
    const cwd = tempDir('crbk-ffmpeg-');
    // node stands in for ffmpeg.
    expect(() => runFfmpeg(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], cwd, 500)).toThrow(/^ffmpeg \(.+\) timed out after 0\.5 s$/);
    expect(() => runFfmpeg(process.execPath, ['-e', 'process.stderr.write("bad input"); process.exit(3)'], cwd)).toThrow(/^ffmpeg exited with 3: bad input$/);
    expect(() => runFfmpeg(path.join(cwd, 'no-ffmpeg.exe'), [], cwd)).toThrow(/^ffmpeg \(.+\) did not run: /);
  });
});

// The real pack 1: the packaged masters on the build machine, real ffmpeg and ffprobe.
const BUILD = 'C:/CRBK/work/build';
const FFMPEG = findFfmpeg();
const FFPROBE = existsSync('C:/ffmpeg/bin/ffprobe.exe') ? 'C:/ffmpeg/bin/ffprobe.exe' : 'ffprobe';
// Without the build folder this is not the build machine; without ffmpeg or ffprobe nothing can cut or check previews.
const realSkip = !existsSync(`${BUILD}/TTL_LowerThird`) ? `no ${BUILD}` : !hasBinary(FFMPEG) ? `no ${FFMPEG}` : !hasBinary(FFPROBE) ? `no ${FFPROBE}` : '';

function topBoxes(buf) {
  const boxes = [];
  for (let i = 0; i + 8 <= buf.length;) {
    let size = buf.readUInt32BE(i);
    if (size === 1) size = Number(buf.readBigUInt64BE(i + 8));
    if (size < 8) break;
    boxes.push(buf.toString('latin1', i + 4, i + 8));
    i += size;
  }
  return boxes;
}

describe.skipIf(realSkip)(`the real pack-1 build${realSkip && ` (skipped: ${realSkip})`}`, () => {
  it('builds the catalog of C:/CRBK/work/build with ffmpeg previews', async () => {
    const root = tempDir('crbk-lib-real-');
    const thumbs = tempDir('crbk-thumbs-');
    const { version } = readJson('panel/version.json');
    const r = await buildCatalog({ root, work: 'C:/CRBK/work', source: SOURCE, tokens: TOKENS, pluginVersion: version, now: NOW, log: () => {} });
    const doc = JSON.parse(readFileSync(path.join(root, 'library.json'), 'utf8'));
    expect(validateLibrary(doc, 'catalog').errors).toEqual([]);
    expect(doc.items.map((i) => i.id)).toEqual(['LOGO_Shot', 'LOGO_Mark', 'TTL_LowerThird']);
    expect(doc.minPluginVersion).toBe(version);
    const count = (kind) => r.files.filter((f) => f.kind === kind).length;
    expect([count('mogrt'), count('aep'), count('preview'), count('poster')]).toEqual([10, 3, 3, 3]);

    for (const it of doc.items) {
      const stored = [it.aep, it.preview, it.poster, ...it.variants];
      for (const s of stored) {
        const data = readFileSync(path.join(root, s.file));
        expect([s.sha256, s.bytes], s.file).toEqual([sha(data), data.length]);
      }
      // The copies are the release files of the build folder, byte for byte.
      expect(it.aep.sha256).toBe(sha(readFileSync(`${BUILD}/${it.id}/${it.id}_v1.aep`)));
      for (const v of it.variants) expect(v.sha256).toBe(sha(readFileSync(`${BUILD}/${it.id}/mogrt/${it.id}_${v.key}_v1.mogrt`)));

      const preview = path.join(root, it.preview.file);
      const media = probeMedia(preview, FFPROBE);
      expect(media.video).toMatchObject({ codec: 'h264', width: 480, pixFmt: 'yuv420p' });
      expect(media.audio).toBeNull();
      const boxes = topBoxes(readFileSync(preview));
      expect(boxes.indexOf('moov')).toBeGreaterThan(-1);
      expect(boxes.indexOf('moov')).toBeLessThan(boxes.indexOf('mdat'));
      const poster = path.join(root, it.poster.file);
      expect(readFileSync(poster).subarray(0, 3).toString('hex')).toBe('ffd8ff');
      expect(probeMedia(poster, FFPROBE).video.width).toBe(480);

      // The poster seek stays inside thumb.mp4 by the video length read from its boxes; ffprobe agrees with it.
      const thumb = new AdmZip(path.join(root, it.variants.find((v) => v.key === '16x9').file)).getEntry('thumb.mp4').getData();
      writeFileSync(path.join(thumbs, `${it.id}.mp4`), thumb);
      const video = probeMedia(path.join(thumbs, `${it.id}.mp4`), FFPROBE).video;
      expect(mp4VideoSeconds(thumb)).toBeCloseTo(video.frames / video.fps, 3);
    }
  }, 180000);
});
