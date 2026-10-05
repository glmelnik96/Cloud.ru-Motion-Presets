// The release package and the macOS installer (spec 8.1), run for real in a sandbox folder: install, update
// over the previous version, refusals. install.ps1 does the same steps on Windows and is checked on the PC.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { build } from 'vite';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildCatalog, itemFiles } from '../../tools/library/build-catalog.mjs';
import { buildPackage, checkLibrary, pluginVersion } from '../../tools/installer/build.mjs';

const REPO = path.resolve(import.meta.dirname, '../..');
const SRC = JSON.parse(readFileSync(path.join(REPO, 'library', 'library.src.json'), 'utf8'));
const TOKENS = JSON.parse(readFileSync(path.join(REPO, 'brand', 'tokens.json'), 'utf8'));
const tmp = (p) => mkdtempSync(path.join(os.tmpdir(), p));

// A library root built the way the pipeline does it, from fake masters of the given items and version.
async function library({ ids, version = 1, libraryVersion = '2026.10.05', extra = {} }) {
  const root = tmp('bk-inst-lib-');
  const buildDir = path.join(root, 'build');
  const src = { ...SRC, items: SRC.items.filter((i) => ids.includes(i.id)).map((i) => ({ ...i, version })) };
  for (const item of src.items) {
    for (const f of itemFiles(item)) {
      if (f.optional) continue;
      const p = path.join(buildDir, f.from);
      mkdirSync(path.dirname(p), { recursive: true });
      if (!f.from.endsWith('.mogrt')) {
        writeFileSync(p, 'aep ' + item.id);
        continue;
      }
      const zip = new AdmZip();
      const controls = item.fields.map((x, n) => ({ id: String(n), type: x.type === 'text' ? 6 : x.type === 'checkbox' ? 1 : 13, uiName: { strDB: [{ str: x.egpName }] }, items: (x.options ?? []).map((o) => o.label_ru) }));
      zip.addFile('definition.json', Buffer.from(JSON.stringify({ capsuleID: f.from, clientControls: controls })));
      zip.addFile('project.aegraphic', Buffer.from('x'));
      zip.writeZip(p);
    }
  }
  const out = path.join(root, 'library');
  const r = await buildCatalog({ src, buildDir, outDir: out, tokens: TOKENS, libraryVersion });
  if (!r.ok) throw new Error(r.problems.join('\n'));
  for (const [rel, text] of Object.entries(extra)) {
    mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
    writeFileSync(path.join(out, rel), text);
  }
  return out;
}

let zxp;

beforeAll(async () => {
  // The panel as a signed ZXP: the real build plus a signature entry (ZXPSignCmd signs on the PC).
  const dist = tmp('bk-inst-dist-');
  await build({ configFile: path.join(REPO, 'panel', 'vite.config.mjs'), logLevel: 'silent', build: { outDir: dist, emptyOutDir: true } });
  const z = new AdmZip();
  z.addLocalFolder(dist);
  z.addFile('META-INF/signatures.xml', Buffer.from('<signatures/>'));
  zxp = path.join(tmp('bk-inst-zxp-'), 'CloudRuBrandKit.zxp');
  z.writeZip(zxp);
}, 60000);

const install = (pkg, sandbox, ...args) => spawnSync('bash', [path.join(pkg, 'install.command'), '--sandbox', sandbox, ...args], { encoding: 'utf8' });

function where(sb) {
  const support = path.join(sb, 'home', 'Library', 'Application Support');
  return {
    cep: path.join(support, 'Adobe', 'CEP', 'extensions', 'ru.cloud.brandkit'),
    templates: path.join(support, 'Adobe', 'Common', 'Motion Graphics Templates'),
    state: path.join(support, 'CloudRuBrandKit'),
    library: path.join(sb, 'Users', 'Shared', 'CloudRuBrandKit', 'library'),
    cache: path.join(sb, 'home', 'Library', 'Caches', 'CSXS', 'cep_cache'),
    ame: path.join(sb, 'home', 'Documents', 'Adobe', 'Adobe Media Encoder'),
  };
}

describe('release package', () => {
  it('packs the signed panel, the checked library, both installers and a zip', async () => {
    const lib = await library({ ids: ['LOGO_Shot', 'TTL_LowerThird'] });
    const r = await buildPackage({ zxp, library: lib, out: tmp('bk-inst-out-') });
    expect(r.problems).toEqual([]);
    expect(r.name).toBe(`CloudRuBrandKit-${pluginVersion()}-2026.10.05`);
    const p = (f) => path.join(r.dir, f);
    expect(readFileSync(p('payload/VERSION'), 'utf8')).toBe(`plugin=${pluginVersion()}\nlibrary=2026.10.05\nsigned=1\n`);
    expect(readFileSync(p('payload/mogrt.txt'), 'utf8').trim().split('\n')).toHaveLength(7);
    expect(existsSync(p('payload/extension/META-INF/signatures.xml'))).toBe(true);
    expect(existsSync(p('payload/library/items/TTL_LowerThird/TTL_LowerThird_v1.aep'))).toBe(true);
    const ps1 = readFileSync(p('install.ps1'), 'utf8');
    expect(ps1.charCodeAt(0)).toBe(0xfeff);
    expect(ps1).toContain('\r\n');
    expect(ps1).toContain('Закройте');
    expect(readFileSync(p('install.cmd'), 'utf8')).toMatch(/install\.ps1" %\*\r\n/);
    expect(statSync(p('install.command')).mode & 0o777).toBe(0o755);
    expect(readFileSync(p('install.command'), 'utf8')).not.toContain('\r');
    const entry = new AdmZip(r.zip).getEntries().find((e) => e.entryName.endsWith('/install.command'));
    expect((entry.attr >>> 16) & 0o777).toBe(0o755);
    expect(readFileSync(p('README.txt'), 'utf8')).toContain(`Cloud.ru BrandKit ${pluginVersion()}, библиотека 2026.10.05`);
  }, 60000);

  it('refuses a library that differs from its library.json, an unsigned ZXP and no panel at all', async () => {
    const lib = await library({ ids: ['LOGO_Mark'] });
    writeFileSync(path.join(lib, 'items', 'LOGO_Mark', 'LOGO_Mark_9x16_v1.mogrt'), 'changed');
    expect((await checkLibrary(lib)).problems).toEqual(['items/LOGO_Mark/LOGO_Mark_9x16_v1.mogrt differs from library.json']);
    const unsignedZxp = path.join(tmp('bk-inst-u-'), 'u.zxp');
    const z = new AdmZip(zxp);
    z.deleteFile('META-INF/signatures.xml');
    z.writeZip(unsignedZxp);
    const good = await library({ ids: ['LOGO_Mark'] });
    expect((await buildPackage({ zxp: unsignedZxp, library: good, out: tmp('bk-inst-out-') })).problems.join('\n')).toMatch(/is not signed/);
    expect((await buildPackage({ library: good, out: tmp('bk-inst-out-') })).problems).toEqual(['give --zxp <signed.zxp>, or --unsigned for a check build']);
  }, 60000);
});

describe('install.command', () => {
  it('installs the panel, the library and flat MOGRTs, cleans the CEP cache, records what it put', async () => {
    const lib = await library({ ids: ['LOGO_Shot', 'TTL_LowerThird'], extra: { 'ame/CloudRu_FullHD_25.epr': '<preset/>' } });
    const pkg = (await buildPackage({ zxp, library: lib, out: tmp('bk-inst-out-') })).dir;
    const sb = tmp('bk-inst-sb-');
    const w = where(sb);
    mkdirSync(path.join(w.cache, 'AEFT_26.5_ru.cloud.brandkit.panel'), { recursive: true });
    mkdirSync(path.join(w.cache, 'AEFT_26.5_com.other.panel'), { recursive: true });
    mkdirSync(path.join(w.ame, '26.0'), { recursive: true });
    const r = install(pkg, sb, '--with-ame');
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/Шаблоны MOGRT: 7 в .*, убрано прежних: 0/);
    expect(readFileSync(path.join(w.cep, 'CSXS', 'manifest.xml'), 'utf8')).toContain('ExtensionBundleId="ru.cloud.brandkit"');
    expect(existsSync(path.join(w.library, 'library.json'))).toBe(true);
    expect(readdirSync(w.templates).sort()).toEqual(readFileSync(path.join(pkg, 'payload', 'mogrt.txt'), 'utf8').trim().split('\n').map((m) => m.split('/').pop()).sort());
    expect(readdirSync(w.cache)).toEqual(['AEFT_26.5_com.other.panel']);
    expect(existsSync(path.join(w.ame, '26.0', 'Presets', 'CloudRu_FullHD_25.epr'))).toBe(true);
    expect(readFileSync(path.join(w.state, 'installed.txt'), 'utf8')).toMatch(/^plugin=0\.1\.0\nlibrary=2026\.10\.05\ninstalled=/);
    expect(r.stdout).not.toMatch(/без подписи/);
  }, 60000);

  it('updates: removes its own MOGRTs of the previous version, keeps the files of others', async () => {
    const v1 = (await buildPackage({ zxp, library: await library({ ids: ['LOGO_Mark', 'TTL_LowerThird'] }), out: tmp('bk-inst-out-') })).dir;
    const v2 = (await buildPackage({ zxp, library: await library({ ids: ['TTL_LowerThird'], version: 2, libraryVersion: '2026.10.20' }), out: tmp('bk-inst-out-') })).dir;
    const sb = tmp('bk-inst-sb-');
    const w = where(sb);
    expect(install(v1, sb).status).toBe(0);
    writeFileSync(path.join(w.templates, 'Someone_Else.mogrt'), 'not ours');
    const r = install(v2, sb);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/Шаблоны MOGRT: 4 в .*, убрано прежних: 7/);
    expect(readdirSync(w.templates).sort()).toEqual([
      'Someone_Else.mogrt', 'TTL_LowerThird_16x9_4K_v2.mogrt', 'TTL_LowerThird_16x9_v2.mogrt', 'TTL_LowerThird_1x1_v2.mogrt', 'TTL_LowerThird_9x16_v2.mogrt',
    ]);
    expect(JSON.parse(readFileSync(path.join(w.library, 'library.json'), 'utf8')).libraryVersion).toBe('2026.10.20');
    expect(existsSync(path.join(w.library, 'items', 'LOGO_Mark'))).toBe(false);
  }, 60000);

  it('leaves a foreign extension folder alone and says the panel is unsigned when it is', async () => {
    const lib = await library({ ids: ['LOGO_Mark'] });
    const pkg = (await buildPackage({ unsigned: true, dist: (await (async () => {
      const d = tmp('bk-inst-d-');
      await build({ configFile: path.join(REPO, 'panel', 'vite.config.mjs'), logLevel: 'silent', build: { outDir: d, emptyOutDir: true } });
      return d;
    })()), library: lib, out: tmp('bk-inst-out-') })).dir;
    const sb = tmp('bk-inst-sb-');
    const w = where(sb);
    mkdirSync(path.join(w.cep, 'CSXS'), { recursive: true });
    writeFileSync(path.join(w.cep, 'CSXS', 'manifest.xml'), '<ExtensionManifest ExtensionBundleId="com.other">');
    const refused = install(pkg, sb);
    expect(refused.status).toBe(1);
    expect(refused.stdout).toMatch(/занята другим расширением/);
    expect(readFileSync(path.join(w.cep, 'CSXS', 'manifest.xml'), 'utf8')).toContain('com.other');
    spawnSync('rm', ['-rf', w.cep]);
    const ok = install(pkg, sb);
    expect(ok.status).toBe(0);
    expect(ok.stdout).toMatch(/панель без подписи/);
  }, 60000);
});
