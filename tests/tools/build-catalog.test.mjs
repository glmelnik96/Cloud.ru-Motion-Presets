import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { buildCatalog, calver, fontBuilds, itemFiles, parseArgs } from '../../tools/library/build-catalog.mjs';

const REPO = path.resolve(import.meta.dirname, '../..');
const SRC = JSON.parse(readFileSync(path.join(REPO, 'library', 'library.src.json'), 'utf8'));
const TOKENS = JSON.parse(readFileSync(path.join(REPO, 'brand', 'tokens.json'), 'utf8'));
const ui = (str) => ({ strDB: [{ localeString: 'ru_RU', str }] });
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

// A MOGRT whose Essential Graphics controls are the fields of the item (dropdowns with their items).
function mogrtFor(item, file, { drop = null } = {}) {
  const zip = new AdmZip();
  const controls = item.fields.filter((f) => f.egpName !== drop).map((f, i) => ({
    id: String(i),
    type: { text: 6, checkbox: 1, slider: 2, dropdown: 13, media: 14 }[f.type],
    uiName: ui(f.egpName),
    ...(f.type === 'dropdown' ? { items: f.options.map((o) => o.label_ru) } : {}),
  }));
  zip.addFile('definition.json', Buffer.from(JSON.stringify({ capsuleID: 'c-' + path.basename(file), clientControls: controls }), 'utf8'));
  zip.addFile('project.aegraphic', Buffer.from('x'));
  mkdirSync(path.dirname(file), { recursive: true });
  zip.writeZip(file);
}

function fakeBuild(ids, opts = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'bk-catalog-'));
  const build = path.join(root, 'build');
  for (const id of ids) {
    const item = SRC.items.find((i) => i.id === id);
    for (const f of itemFiles(item)) {
      if (f.optional) continue;
      // a file of any extension (T2/T3): the export presets are .epr and .aom, by the variant key; the caption
      // style is .prtextstyle
      const p = path.join(build, f.anyExt ? `${f.from}.${item.textStyle ? 'prtextstyle' : f.key}` : f.from);
      if (f.from.endsWith('.mogrt')) mogrtFor(item, p, opts);
      else {
        mkdirSync(path.dirname(p), { recursive: true });
        writeFileSync(p, 'aep of ' + id);
      }
    }
  }
  return { build, out: path.join(root, 'library') };
}

describe('build-catalog', () => {
  it('reads the reference font builds from the tokens', () => {
    expect(fontBuilds(TOKENS)).toMatchObject({ 'SBSansDisplay-Semibold': '1.002', 'SBSansText-Regular': '1.003' });
  });

  it('writes calver of the day', () => {
    expect(calver(new Date(2026, 9, 5))).toBe('2026.10.05');
  });

  it('lists the files of a T1 item: one .aep and one MOGRT per variant', () => {
    const files = itemFiles(SRC.items.find((i) => i.id === 'TTL_LowerThird'));
    expect(files.filter((f) => !f.optional).map((f) => f.to)).toEqual([
      'items/TTL_LowerThird/TTL_LowerThird_v1.aep',
      'items/TTL_LowerThird/TTL_LowerThird_16x9_v1.mogrt',
      'items/TTL_LowerThird/TTL_LowerThird_16x9_4K_v1.mogrt',
      'items/TTL_LowerThird/TTL_LowerThird_9x16_v1.mogrt',
      'items/TTL_LowerThird/TTL_LowerThird_1x1_v1.mogrt',
    ]);
  });

  it('builds a valid catalog of the first pack and copies the files', async () => {
    const ids = SRC.items.map((i) => i.id);
    expect(ids.slice(0, 3)).toEqual(['LOGO_Shot', 'LOGO_Mark', 'TTL_LowerThird']);
    const { build, out } = fakeBuild(ids);
    const r = await buildCatalog({ src: SRC, buildDir: build, outDir: out, libraryVersion: '2026.10.05', tokens: TOKENS, now: new Date('2026-10-05T10:00:00.123Z') });
    expect(r.problems).toEqual([]);
    const lib = JSON.parse(readFileSync(path.join(out, 'library.json'), 'utf8'));
    expect(lib).toMatchObject({ schemaVersion: 1, libraryVersion: '2026.10.05', minPluginVersion: '0.1.0', generatedAt: '2026-10-05T10:00:00Z' });
    expect(lib.items.map((i) => i.id)).toEqual(ids);
    const ttl = lib.items[2];
    expect(ttl.aep.file).toBe('items/TTL_LowerThird/TTL_LowerThird_v1.aep');
    expect(ttl.aep.sha256).toBe(sha(Buffer.from('aep of TTL_LowerThird')));
    expect(ttl.variants[0]).toMatchObject({ key: '16x9', aeComp: 'CR_TTL_LowerThird_16x9_v1', file: 'items/TTL_LowerThird/TTL_LowerThird_16x9_v1.mogrt' });
    expect(ttl.variants[0].sha256).toBe(sha(readFileSync(path.join(out, ttl.variants[0].file))));
    expect(ttl.requiredFonts).toContainEqual({ postScriptName: 'SBSansText-Regular', build: '1.003' });
    expect(existsSync(path.join(out, 'items/LOGO_Mark/LOGO_Mark_9x16_v1.mogrt'))).toBe(true);
  });

  it('leaves a file of the same content in place on the next build, replaces a changed one', async () => {
    // A host may hold an imported library file open; rewriting it failed with EBUSY (Premiere, 2026-10-05).
    const { build, out } = fakeBuild(['LOGO_Mark']);
    const opts = { src: SRC, buildDir: build, outDir: out, only: ['LOGO_Mark'], tokens: TOKENS };
    await buildCatalog(opts);
    const aep = path.join(out, 'items/LOGO_Mark/LOGO_Mark_v1.aep');
    const old = new Date('2026-01-01T00:00:00Z');
    utimesSync(aep, old, old);
    await buildCatalog(opts);
    expect(statSync(aep).mtimeMs).toBe(old.getTime());
    writeFileSync(path.join(build, 'LOGO_Mark/LOGO_Mark_v1.aep'), 'aep of LOGO_Mark, v2');
    await buildCatalog(opts);
    expect(readFileSync(aep, 'utf8')).toBe('aep of LOGO_Mark, v2');
  });

  it('adds the previews per format and look, with their conditions', async () => {
    const { build, out } = fakeBuild(['TTL_LowerThird']);
    const dir = path.join(build, 'TTL_LowerThird');
    for (const stem of ['16x9_style-1', '9x16_style-2', '1x1_style-3']) {
      writeFileSync(path.join(dir, `preview_${stem}.mp4`), 'mp4 ' + stem);
      writeFileSync(path.join(dir, `poster_${stem}.jpg`), 'jpg ' + stem);
    }
    const r = await buildCatalog({ src: SRC, buildDir: build, outDir: out, only: ['TTL_LowerThird'], tokens: TOKENS });
    expect(r.problems).toEqual([]);
    const ttl = JSON.parse(readFileSync(path.join(out, 'library.json'), 'utf8')).items[0];
    expect(ttl.previews.map((p) => [p.variant, p.when, p.video.file, p.poster.file])).toEqual([
      ['16x9', { style: 1 }, 'items/TTL_LowerThird/preview_16x9_style-1.mp4', 'items/TTL_LowerThird/poster_16x9_style-1.jpg'],
      ['1x1', { style: 3 }, 'items/TTL_LowerThird/preview_1x1_style-3.mp4', 'items/TTL_LowerThird/poster_1x1_style-3.jpg'],
      ['9x16', { style: 2 }, 'items/TTL_LowerThird/preview_9x16_style-2.mp4', 'items/TTL_LowerThird/poster_9x16_style-2.jpg'],
    ]);
    expect(ttl.previews[2].video.sha256).toBe(sha(Buffer.from('mp4 9x16_style-2')));
    expect(existsSync(path.join(out, 'items/TTL_LowerThird/poster_1x1_style-3.jpg'))).toBe(true);
  });

  it('refuses a preview that names no field, or has no poster', async () => {
    const { build, out } = fakeBuild(['TTL_LowerThird']);
    const dir = path.join(build, 'TTL_LowerThird');
    writeFileSync(path.join(dir, 'preview_16x9_colour-2.mp4'), 'x');
    writeFileSync(path.join(dir, 'poster_16x9_colour-2.jpg'), 'x');
    writeFileSync(path.join(dir, 'preview_9x16_style-1.mp4'), 'x');
    const r = await buildCatalog({ src: SRC, buildDir: build, outDir: out, only: ['TTL_LowerThird'], tokens: TOKENS });
    expect(r.problems).toEqual([
      'TTL_LowerThird: preview_16x9_colour-2.mp4 names no variant or field of the item',
      'TTL_LowerThird: preview_9x16_style-1.mp4 has no poster_9x16_style-1.jpg',
    ]);
  });

  it('writes nothing when a file is missing', async () => {
    const { build, out } = fakeBuild(['LOGO_Mark']);
    const r = await buildCatalog({ src: SRC, buildDir: build, outDir: out, only: ['LOGO_Mark', 'TTL_LowerThird'], tokens: TOKENS });
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/TTL_LowerThird: missing TTL_LowerThird\/TTL_LowerThird_v1\.aep/);
    expect(existsSync(path.join(out, 'library.json'))).toBe(false);
  });

  it('flags a MOGRT that lost an Essential Graphics control of the source', async () => {
    const { build, out } = fakeBuild(['LOGO_Mark'], { drop: 'Скорость' });
    const r = await buildCatalog({ src: SRC, buildDir: build, outDir: out, only: ['LOGO_Mark'], tokens: TOKENS });
    expect(r.problems.join('\n')).toMatch(/LOGO_Mark: LOGO_Mark_16x9_v1\.mogrt: missing control Скорость/);
  });

  it('takes the work folder by default', () => {
    const a = parseArgs(['--only', 'LOGO_Shot']);
    expect(a.only).toEqual(['LOGO_Shot']);
    expect(a.outDir.endsWith('/library')).toBe(true);
  });
});
