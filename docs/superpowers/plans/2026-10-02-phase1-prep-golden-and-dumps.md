# Подготовка фазы 1: эталоны и JSX-дампы всех пакетов — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заморозить исходный пакет архивом с sha256, сделать для каждого из 9 проектов копию «только перелинковка» с 0 пропавших файлов (кроме продакшн-медиа converted-файла курсов на `G:\`), снять эталонные кадры всех ROOT-композиций и JSX-дампы всех пакетов. Это эталон для сверки и источник чисел для починки и пересборки (спецификация §3.2; §3.3, фаза 1, пп. 1–3).

**Architecture:**
- **Архив.** Node копирует пакет в `C:/CRBK/archive/2026-10-02/`, считает sha256 каждого файла в источнике и в копии, ставит копиям «только чтение» и пишет `manifest.json`. Режим `--verify` пересчитывает хэши. Копия манифеста лежит в git.
- **Рабочие копии.** `C:/CRBK/packs/<slug>/<slug>.aep` рядом со своей папкой `(Footage)`. Имена в NFC, у двух AI-роликов вебинаров короткие имена, рендеров и служебных файлов macOS нет. `relink-map.json` связывает старый относительный путь файла с новым.
- **Перелинковка в живом AE** через раннер плана 1 (`run()` из `tools/host-run.mjs`, CDP 8094). JSX только читает проект и выполняет замены, а какой файл подставить, решает Node (покрыто юнит-тестами). Результат — `<slug>_relinked.aep` (Save As) и отчёт: что заменено, что осталось пропавшим, какие шрифты. Пакет и архив в AE не открываются.
- **ROOT-композиции и моменты времени.** JSX читает все композиции: размер, fps, длительность, маркеры и кто использует композицию слоем. Node даёт каждой композиции `compSlug` и считает ключевые кадры.
- **Эталонные кадры.** `CompItem.saveFrameToPng`, одна композиция за вызов. Запись асинхронная, поэтому Node ждёт готовые PNG, проверяет их размер и считает sha256. PNG лежат в рабочей папке, манифест — в `docs/research/golden/`. Превью H.264 в половинном разрешении делает `aerender` вне GUI, и только если проба нашла шаблон Output Module H.264. Превью есть у каждой ROOT-композиции; у композиции длиннее минуты это первые 60 с.
- **JSX-дампы** (задачи 6 и дальше, следующая часть плана) берут те же копии и те же `compSlug`: файл дампа `<compSlug>.json` и папка эталона `<compSlug>/` одной композиции называются одинаково.

**Tech Stack:** Node 22+ (на машине 24), ESM `.mjs`, vitest, pngjs; ExtendScript (ES3) для AE 26.5 (обновлён на этой машине 2 октября 2026); `aerender` из AE 2026; ffprobe.

**Спецификация:** `docs/superpowers/specs/2026-10-02-cloudru-brandkit-design.md`: §2 (аудит пакета), §3.2 (эталон), §3.3 (фаза 1), §4.2 (ASCII и NFC), §8.4 (риски).

**Перед выполнением:**
- **Порядок с планом 1** (`docs/superpowers/plans/2026-10-02-phase0-foundation-and-spikes.md`). Оба плана выполняются в одной ветке `phase0-foundation` (её создаёт задача 0 плана 1), по очереди:
  1. План 1, задачи 0–7.
  2. План 2, задачи 1–3.
  3. План 1, задачи 8–28.
  4. План 2, задачи 4–9.
  5. План 1, задачи 29–30: каркас панели и закрытие фазы 0.
- **Что этот план берёт из плана 1.**
  - Задачам 1–3 нужны задачи 1–6 плана 1: каркас Node и vitest, ES3-линтер и JSON-пролог, `tools/lib/work.mjs`, dev-панель BrandKit (CDP 8094), раннер `tools/host-run.mjs`. Этот план только пользуется ими.
  - Задачи 4–9 идут после задач 8–28 плана 1 и берут их модули. Сверка цветов (`tools/dump/colors.mjs`) считает ΔE2000 через `tools/color/deltae.mjs` (задача 12 плана 1).
  - Задача 6 проверяет дампер на фикстуре `CRT_fixture.aep` (задача 7 плана 1).
  - Задача 7 берёт палитру из `brand/tokens.json` (задача 26 плана 1) и пишет итог D18 в лист решений `docs/decisions/phase0-decisions.md` (задача 27 плана 1).
- Исходный пакет `C:\Users\Глеб\Documents\Граф пакет Cloud.ru` только читается. Инструменты ничего не удаляют за человека: если результат уже есть, они останавливаются и говорят, что удалить руками.
- На диске C: нужно ~30 ГБ: архив 13,1 ГБ, эталонные PNG до ~10 ГБ.
- Коммиты — по одному на задачу, после отмашки пользователя на план целиком.

---

## Соглашения плана 2

Общие соглашения — как в плане 1: пути, ES3, коммиты. Дополнительно:

- **Корни.** `C:/CRBK` — родитель рабочей папки, поэтому `BRANDKIT_WORK` переносит всё вместе. Архив — `C:/CRBK/archive/2026-10-02`, копии — `C:/CRBK/packs`, эталоны — `C:/CRBK/work/golden`. Путь к пакету можно задать через `BRANDKIT_SOURCE`.
- **ASCII.** Всё, что ExtendScript открывает и пишет (проекты, PNG, MP4), лежит по ASCII-путям. Исключение — имена файлов внутри `(Footage)` рабочих копий: кириллица там остаётся в NFC (§4.2), AE находит эти файлы сам. Если такой путь нужен JSX, он приходит через `PARAMS`, а раннер экранирует его в `\uXXXX`.
- **Вызовы AE.** JSX-файл получает `PARAMS` через `callJsx` (задача 3) и отвечает `{ ok, error, detail, ... }`; ответ с `error` становится исключением. Изменяющий вызов, упавший по `CDP_TIMEOUT`, не повторяется. Человек смотрит в AE, закрывает диалог и запускает ту же команду: команды продолжают с места остановки, готовое пропускают.
- **Проекты.** Открываются только наши копии из `C:/CRBK`. Если в AE открыт другой проект с несохранёнными изменениями, команда останавливается. Свою копию после эталонного рендера инструмент закрывает без сохранения: её единственное изменение — разрешение предпросмотра.
- **Не трогать AE во время прогона.** ExtendScript однопоточный; клик в AE посреди прогона может оставить проект с изменениями или спрятать диалог.
- **Выход CLI.** После сетевых вызовов команды ставят `process.exitCode`, а не зовут `process.exit()`: выход в момент закрытия сокета CDP роняет libuv на Windows (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`, код 127).

## Структура файлов задач 1–5

```text
tools/
  packs/
    paths.mjs              корни: пакет, архив, копии
    fsutil.mjs             walkFiles, sha256File, isRenderPath, isMacJunk
    snapshot.mjs           архив + manifest.json, --verify
    slug.mjs               NFC, транслитерация, slugify, uniqueSlugs, compSlugs
    packs.mjs              9 проектов, переименования, известные пропажи
    make-relink-copy.mjs   рабочие копии + relink-map.json
    jsx-call.mjs           composeJsx, callJsx
    ae-project.mjs         sameProjectFile, openProject, closeDiscard
    jsx/                   project-state.jsx, open-project.jsx, close-project.jsx
    relink.jsx             scan / apply / report в AE
    relink-resolve.mjs     какой файл подставить; приёмка
    relink.mjs             CLI перелинковки
  golden/
    roots.jsx, roots.mjs   ROOT-композиции -> roots.json
    keytimes.mjs           ключевые кадры
    render.jsx             saveFrameToPng одной композиции
    png.mjs                проверка PNG, ожидание записи
    aerender.mjs           aerender под сторожем, ffprobe
    preview-rq.jsx         проба и очередь превью
    render.mjs             CLI: frames, probe-preview, previews, review
tests/packs/*.test.mjs, tests/golden/*.test.mjs
docs/research/packs/       манифест архива, сводка перелинковки
docs/research/golden/      манифесты эталонов, roots/, preview-capability.json
```

---

## Часть 1. Снимок пакета, рабочие копии, эталонные рендеры

### Task 1: Архив пакета только для чтения

**Files:**
- Create: `tools/packs/paths.mjs`, `tools/packs/fsutil.mjs`, `tools/packs/snapshot.mjs`
- Test: `tests/packs/fsutil.test.mjs`, `tests/packs/snapshot.test.mjs`
- Create (результат прогона): `docs/research/packs/archive-2026-10-02.manifest.json`

Пакет живёт в продакшне (§2), поэтому оригиналы замораживаются копией: 123 файла, 13,1 ГБ, из них 18 рендеров `.mov` на 12,9 ГБ. С флагом `--exclude-renders` рендеры (папки `Render`, `Render Overlays`, `Ready mov`) не копируются, но попадают в манифест списком `excluded`.

- [ ] **Step 1: Написать падающий тест `tests/packs/fsutil.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { walkFiles, sha256File, isRenderPath, isMacJunk } from '../../tools/packs/fsutil.mjs';
import { crbkRoot, archiveDir, packDir, sourceRoot } from '../../tools/packs/paths.mjs';

describe('fsutil', () => {
  it('walks a tree into sorted POSIX paths and keeps NFD names as they are', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'bk-walk-'));
    const nfd = 'Оверлей.wav'.normalize('NFD');
    mkdirSync(path.join(root, 'b', 'c'), { recursive: true });
    writeFileSync(path.join(root, 'b', 'c', nfd), 'x');
    writeFileSync(path.join(root, 'a.txt'), 'y');
    expect(walkFiles(root)).toEqual(['a.txt', 'b/c/' + nfd]);
  });
  it('hashes a file with sha256', async () => {
    const f = path.join(mkdtempSync(path.join(os.tmpdir(), 'bk-hash-')), 'f.bin');
    writeFileSync(f, 'brandkit');
    expect(await sha256File(f)).toBe(createHash('sha256').update('brandkit').digest('hex'));
  });
  it('recognises render folders of the package', () => {
    expect(isRenderPath('4_SMM_Pack/Render/BG/BG_pattern_1x1_1.mov')).toBe(true);
    expect(isRenderPath('3_Обучающие_курсы/3_Обучающие курсы/Render Overlays/FullHD/x.mov')).toBe(true);
    expect(isRenderPath('6_Podcast_Cloud.ru_Pack/Ready mov/OUTRO.mov')).toBe(true);
    expect(isRenderPath('6_Podcast_Cloud.ru_Pack/(Footage)/SFX/QR_код_1.wav')).toBe(false);
    expect(isRenderPath('Render.mov')).toBe(false);
  });
  it('recognises macOS metadata files', () => {
    expect(isMacJunk('6_Podcast_Cloud.ru_Pack/(Footage)/QR/._STRDUB.png')).toBe(true);
    expect(isMacJunk('a/.DS_Store')).toBe(true);
    expect(isMacJunk('a/STRDUB.png')).toBe(false);
  });
});

describe('paths', () => {
  it('puts archive and packs next to the work folder', () => {
    expect(crbkRoot({}, 'win32')).toBe('C:/CRBK');
    expect(archiveDir({}, 'win32')).toBe('C:/CRBK/archive/2026-10-02');
    expect(packDir('logo', {}, 'win32')).toBe('C:/CRBK/packs/logo');
    expect(packDir('logo', { BRANDKIT_WORK: 'D:\\bk\\work' }, 'win32')).toBe('D:/bk/packs/logo');
    expect(archiveDir({}, 'darwin')).toBe('/Users/Shared/CRBK/archive/2026-10-02');
  });
  it('reads the source package path from BRANDKIT_SOURCE when set', () => {
    expect(sourceRoot({})).toBe('C:/Users/Глеб/Documents/Граф пакет Cloud.ru');
    expect(sourceRoot({ BRANDKIT_SOURCE: 'E:\\pkg' })).toBe('E:/pkg');
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run tests/packs/fsutil.test.mjs`
Expected: FAIL — `Cannot find module '../../tools/packs/fsutil.mjs'`.

- [ ] **Step 3: Создать `tools/packs/paths.mjs`**

```js
// Fixed places of the phase-1 preparation. Everything ExtendScript sees is ASCII; only the
// source package path has Cyrillic, and only Node reads it.
import path from 'node:path';
import { workDir } from '../lib/work.mjs';

export const SOURCE_ROOT = 'C:/Users/Глеб/Documents/Граф пакет Cloud.ru';
export const ARCHIVE_DATE = '2026-10-02';

export function sourceRoot(env = process.env) {
  return String(env.BRANDKIT_SOURCE || SOURCE_ROOT).replace(/\\/g, '/');
}

// C:/CRBK on Windows: the parent of the work folder, so BRANDKIT_WORK moves all of it together.
export function crbkRoot(env = process.env, platform = process.platform) {
  return path.posix.dirname(workDir(env, platform));
}

export function archiveDir(env = process.env, platform = process.platform) {
  return path.posix.join(crbkRoot(env, platform), 'archive', ARCHIVE_DATE);
}

export function packsDir(env = process.env, platform = process.platform) {
  return path.posix.join(crbkRoot(env, platform), 'packs');
}

export function packDir(slug, env = process.env, platform = process.platform) {
  return path.posix.join(packsDir(env, platform), slug);
}
```

- [ ] **Step 4: Создать `tools/packs/fsutil.mjs`**

```js
// File helpers shared by the pack tools: walk a tree, hash a file, classify package paths.
import { createReadStream, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

// Folders that hold finished renders of the package (spec §2: 18 .mov files, 12.9 GB).
export const RENDER_DIRS = ['render', 'render overlays', 'ready mov'];

// Relative POSIX paths of every regular file under root, sorted. Names are kept exactly as on
// disk (Mac NFD names stay NFD). Symlinks and junctions are skipped.
export function walkFiles(root) {
  const out = [];
  const visit = (rel) => {
    for (const e of readdirSync(rel ? path.join(root, rel) : root, { withFileTypes: true })) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) visit(r);
      else if (e.isFile()) out.push(r);
    }
  };
  visit('');
  return out.sort();
}

export function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(file)
      .on('error', reject)
      .on('data', (chunk) => h.update(chunk))
      .on('end', () => resolve(h.digest('hex')));
  });
}

export function isRenderPath(rel) {
  return rel.split('/').slice(0, -1)
    .some((seg) => RENDER_DIRS.includes(seg.normalize('NFC').toLowerCase()));
}

// macOS metadata: no project references it.
export function isMacJunk(rel) {
  const parts = rel.split('/');
  const name = parts[parts.length - 1];
  return name.startsWith('._') || name === '.DS_Store' || parts.includes('__MACOSX');
}
```

- [ ] **Step 5: Запустить тест**

Run: `npx vitest run tests/packs/fsutil.test.mjs`
Expected: `6 passed`.

- [ ] **Step 6: Написать падающий тест `tests/packs/snapshot.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { snapshot, verifySnapshot, MANIFEST } from '../../tools/packs/snapshot.mjs';
import { walkFiles } from '../../tools/packs/fsutil.mjs';

const NFD = 'Подписывайтесь.wav'.normalize('NFD');

function makeSource() {
  const src = mkdtempSync(path.join(os.tmpdir(), 'bk-src-'));
  const put = (rel, body) => {
    mkdirSync(path.dirname(path.join(src, rel)), { recursive: true });
    writeFileSync(path.join(src, rel), body);
  };
  put('1_Logo/Logo.aep', 'aep-bytes');
  put('6_Pod/(Footage)/SFX/' + NFD, 'wav-bytes');
  put('4_SMM/Render/BG/bg.mov', 'mov-1');
  put('6_Pod/Ready mov/OUTRO.mov', 'mov-2');
  return src;
}
const tmpDest = () => path.join(mkdtempSync(path.join(os.tmpdir(), 'bk-arc-')), 'archive');
const snapshotOf = (src) => walkFiles(src).map((rel) => rel + '=' + readFileSync(path.join(src, rel), 'utf8'));

describe('snapshot', () => {
  it('copies every file, hashes it, keeps NFD names and leaves the source untouched', async () => {
    const src = makeSource();
    const before = snapshotOf(src);
    const dest = tmpDest();
    const m = await snapshot({ src, dest });
    expect(m.totals.files).toBe(4);
    expect(m.excluded).toEqual([]);
    const wav = m.files.find((f) => f.path.endsWith('.wav'));
    expect(wav.path).toBe('6_Pod/(Footage)/SFX/' + NFD);
    expect(wav.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(readFileSync(path.join(dest, '1_Logo/Logo.aep'), 'utf8')).toBe('aep-bytes');
    expect(statSync(path.join(dest, '1_Logo/Logo.aep')).mode & 0o222).toBe(0);
    expect(snapshotOf(src)).toEqual(before);
  });

  it('skips the render folders with --exclude-renders and lists them', async () => {
    const m = await snapshot({ src: makeSource(), dest: tmpDest(), excludeRenders: true });
    expect(m.totals.files).toBe(2);
    expect(m.excluded.map((f) => f.path)).toEqual(['4_SMM/Render/BG/bg.mov', '6_Pod/Ready mov/OUTRO.mov']);
  });

  it('verifies a good archive and catches a changed, a missing and an extra file', async () => {
    const dest = tmpDest();
    await snapshot({ src: makeSource(), dest });
    expect((await verifySnapshot({ dest })).ok).toBe(true);
    const aep = path.join(dest, '1_Logo/Logo.aep');
    chmodSync(aep, 0o644);
    writeFileSync(aep, 'tampered!');
    const wav = path.join(dest, '6_Pod/(Footage)/SFX/' + NFD);
    chmodSync(wav, 0o644);
    rmSync(wav);
    writeFileSync(path.join(dest, 'stray.txt'), 'x');
    const r = await verifySnapshot({ dest });
    expect(r.ok).toBe(false);
    expect(r.problems.map((p) => p.path + ': ' + p.problem).sort()).toEqual([
      '1_Logo/Logo.aep: sha256 mismatch',
      '6_Pod/(Footage)/SFX/' + NFD + ': missing',
      'stray.txt: not in manifest',
    ]);
  });

  it('refuses to overwrite a finished archive', async () => {
    const src = makeSource();
    const dest = tmpDest();
    await snapshot({ src, dest });
    expect(readFileSync(path.join(dest, MANIFEST), 'utf8')).toContain('"excludeRenders": false');
    await expect(snapshot({ src, dest })).rejects.toThrow(/ARCHIVE_EXISTS/);
  });
});
```

- [ ] **Step 7: Убедиться, что тест падает**

Run: `npx vitest run tests/packs/snapshot.test.mjs`
Expected: FAIL — `Cannot find module '../../tools/packs/snapshot.mjs'`.

- [ ] **Step 8: Создать `tools/packs/snapshot.mjs`**

Хэш считается и в источнике, и в копии: так копия проверена сразу, а `--verify` потом ловит любые изменения в архиве. Файлы архива получают атрибут «только чтение».

```js
#!/usr/bin/env node
// Frozen read-only archive of the source package with a sha256 manifest (spec §3.3, phase 1, item 1).
//   node tools/packs/snapshot.mjs [--exclude-renders] [--src DIR] [--dest DIR]
//   node tools/packs/snapshot.mjs --verify [--dest DIR]
// The source is only read. Each archived file is hashed on both sides and made read-only.
// An archive that already has manifest.json is never overwritten: delete it by hand to redo it.
import {
  chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, statSync, statfsSync, utimesSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { walkFiles, sha256File, isRenderPath } from './fsutil.mjs';
import { sourceRoot, archiveDir, ARCHIVE_DATE } from './paths.mjs';

export const MANIFEST = 'manifest.json';
// A copy of the manifest lives in git: the evidence of what was frozen.
export const REPO_COPY = fileURLToPath(new URL('../../docs/research/packs/archive-' + ARCHIVE_DATE + '.manifest.json', import.meta.url));
const GB = 1024 ** 3;

function copyToRepo(dest) {
  mkdirSync(path.dirname(REPO_COPY), { recursive: true });
  writeFileSync(REPO_COPY, readFileSync(path.join(dest, MANIFEST)));
}

export async function snapshot({ src, dest, excludeRenders = false, log = () => {} }) {
  if (existsSync(path.join(dest, MANIFEST))) {
    throw new Error('ARCHIVE_EXISTS: ' + dest + ' already has ' + MANIFEST + '; check it with --verify or delete the folder by hand');
  }
  const all = walkFiles(src);
  const skip = (rel) => excludeRenders && isRenderPath(rel);
  const take = all.filter((rel) => !skip(rel));
  const need = take.reduce((sum, rel) => sum + statSync(path.join(src, rel)).size, 0);
  mkdirSync(dest, { recursive: true });
  const disk = statfsSync(dest);
  const free = disk.bavail * disk.bsize;
  if (free < need + GB) throw new Error(`NO_SPACE: need ${need} bytes + 1 GiB, free ${free}`);

  const files = [];
  for (const rel of take) {
    const from = path.join(src, rel);
    const to = path.join(dest, rel);
    const st = statSync(from);
    mkdirSync(path.dirname(to), { recursive: true });
    if (existsSync(to)) chmodSync(to, 0o644); // left over from an interrupted run
    copyFileSync(from, to);
    utimesSync(to, st.atime, st.mtime);
    const [a, b] = await Promise.all([sha256File(from), sha256File(to)]);
    if (a !== b) throw new Error('HASH_MISMATCH after copy: ' + rel);
    chmodSync(to, 0o444);
    files.push({ path: rel, size: st.size, mtime: st.mtime.toISOString(), sha256: a });
    log(`${files.length}/${take.length} ${rel}`);
  }
  const manifest = {
    source: String(src).replace(/\\/g, '/'),
    createdAt: new Date().toISOString(),
    excludeRenders,
    totals: { files: files.length, bytes: files.reduce((sum, f) => sum + f.size, 0) },
    files,
    excluded: all.filter(skip).map((rel) => ({ path: rel, size: statSync(path.join(src, rel)).size })),
  };
  const mf = path.join(dest, MANIFEST);
  writeFileSync(mf, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  chmodSync(mf, 0o444);
  return manifest;
}

export async function verifySnapshot({ dest, log = () => {} }) {
  const manifest = JSON.parse(readFileSync(path.join(dest, MANIFEST), 'utf8'));
  const problems = [];
  for (const f of manifest.files) {
    const abs = path.join(dest, f.path);
    if (!existsSync(abs)) { problems.push({ path: f.path, problem: 'missing' }); continue; }
    const size = statSync(abs).size;
    if (size !== f.size) { problems.push({ path: f.path, problem: `size ${size} != ${f.size}` }); continue; }
    if ((await sha256File(abs)) !== f.sha256) problems.push({ path: f.path, problem: 'sha256 mismatch' });
    log(f.path);
  }
  const known = new Set(manifest.files.map((f) => f.path).concat([MANIFEST]));
  for (const rel of walkFiles(dest)) {
    if (!known.has(rel)) problems.push({ path: rel, problem: 'not in manifest' });
  }
  return { ok: problems.length === 0, checked: manifest.files.length, problems };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const val = (flag) => { const i = argv.indexOf(flag); return i === -1 ? undefined : argv[i + 1]; };
  const dest = val('--dest') || archiveDir();
  let last = 0;
  const log = (line) => { if (Date.now() - last > 3000) { last = Date.now(); console.log(line); } };
  try {
    if (argv.includes('--verify')) {
      const r = await verifySnapshot({ dest, log });
      for (const p of r.problems) console.error('PROBLEM ' + p.path + ': ' + p.problem);
      console.log(`verify: ${r.checked} files, ${r.problems.length} problem(s)`);
      if (r.ok) copyToRepo(dest);
      process.exit(r.ok ? 0 : 1);
    }
    const src = val('--src') || sourceRoot();
    const m = await snapshot({ src, dest, excludeRenders: argv.includes('--exclude-renders'), log });
    copyToRepo(dest);
    console.log(`snapshot: ${m.totals.files} files, ${m.totals.bytes} bytes, ${m.excluded.length} excluded -> ${dest}`);
    console.log('manifest copy: ' + REPO_COPY);
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
}
```

- [ ] **Step 9: Запустить тесты**

Run: `npx vitest run tests/packs`
Expected: `10 passed`.

- [ ] **Step 10: Снять архив**

Долго: копия плюс два чтения на файл, 5–15 минут. Запускать в фоне.

Run: `node tools/packs/snapshot.mjs`
Expected (последние строки):
```text
snapshot: 123 files, 13084049891 bytes, 0 excluded -> C:/CRBK/archive/2026-10-02
manifest copy: C:\Users\Глеб\Documents\Cloud.ru Preset plugin\docs\research\packs\archive-2026-10-02.manifest.json
```
Числа сняты 2026-10-02; если пакет с тех пор менялся, они другие. Если места не хватает (`NO_SPACE`), запустить `node tools/packs/snapshot.mjs --exclude-renders`: тогда `105 files, 215056073 bytes, 18 excluded`.

- [ ] **Step 11: Проверить архив**

Run: `node tools/packs/snapshot.mjs --verify`
Expected: `verify: 123 files, 0 problem(s)`, код выхода 0.

- [ ] **Step 12: Убедиться, что источник не тронут, а архив только для чтения**

Run (PowerShell): `Get-ChildItem -Name "C:\Users\Глеб\Documents\Граф пакет Cloud.ru"; (Get-Item "C:\CRBK\archive\2026-10-02\5_Titles\Titles (3).aep").IsReadOnly`
Expected: те же 7 папок (`1_Логошоты` … `7_Пресеты_Media_Encoder`), без `manifest.json`; затем `True`.

- [ ] **Step 13: Commit**

```bash
git add tools/packs/paths.mjs tools/packs/fsutil.mjs tools/packs/snapshot.mjs tests/packs/fsutil.test.mjs tests/packs/snapshot.test.mjs docs/research/packs/archive-2026-10-02.manifest.json
git commit -m "feat(packs): read-only archive of the source package with sha256 manifest" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: ASCII-имена и рабочие копии «только перелинковка»

**Files:**
- Create: `tools/packs/slug.mjs`, `tools/packs/packs.mjs`, `tools/packs/make-relink-copy.mjs`
- Test: `tests/packs/slug.test.mjs`, `tests/packs/make-relink-copy.test.mjs`

Копия делается из архива задачи 1: каждый скопированный байт сверяется с его манифестом. Проекты и папки:

| slug | Проект в пакете | Папка `(Footage)` |
|---|---|---|
| `logo` | `1_Логошоты/Логошот.aep` | нет (0 файлов в Collect) |
| `logo_conv` | `1_Логошоты/Логошот (converted).aep` | нет |
| `titles` | `5_Titles/Titles (3).aep` | нет |
| `titles_conv` | `5_Titles/Titles (3) (converted).aep` | нет |
| `webinars` | `2_Вебинары/Вебинары.aep` | `2_Вебинары/(Footage)` |
| `courses` | `3_Обучающие_курсы/3_Обучающие курсы/Обучающие курсы.aep` | `…/3_Обучающие курсы/(Footage)` |
| `courses_conv` | `3_Обучающие_курсы/3_Обучающие курсы/Обучающие курсы (converted).aep` | та же |
| `smm` | `4_SMM_Pack/SMM_pack.aep` | `4_SMM_Pack/(Footage)` |
| `podcast` | `6_Podcast_Cloud.ru_Pack/Podcast_Pack.aep` | `6_Podcast_Cloud.ru_Pack/(Footage)` |

Правила копии:
- `.aep` получает ASCII-имя `<slug>.aep`. Папка `(Footage)` копируется рядом с той же внутренней структурой, поэтому относительные пути проекта остаются верными.
- Имена приводятся к NFC: в подкасте два WAV записаны в NFD и иначе не находятся на Windows.
- AI-ролик с именем ~250 символов (путь 322 символа, больше MAX_PATH) становится `AI_robot_arm_A_1440p24.mp4`, `Seedance.mp4` — `AI_robot_arm_B_1440p24.mp4`. Оба ролика 1440×1440, 24 fps.
- Файлы `._*` и `.DS_Store` не копируются. Рендеры не копируются: их нет ни в одной папке `(Footage)`.
- Путь любого файла копии — не длиннее 240 символов.

`compSlug` — транслитерация имени композиции (её используют задачи 4–5 и JSX-дампы): NFC, транслитерация, нижний регистр, только `[a-z0-9_]`, не длиннее 64 символов. Повторы получают `_2`, `_3` по возрастанию id композиции.

- [ ] **Step 1: Написать падающий тест `tests/packs/slug.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { slugify, uniqueSlugs, compSlugs, translit } from '../../tools/packs/slug.mjs';

describe('slug', () => {
  it('transliterates Russian comp names into ASCII', () => {
    expect(slugify('Логошот_Умное облако')).toBe('logoshot_umnoe_oblako');
    expect(slugify('Подписывайся! Ссылки в описании')).toBe('podpisyvaysya_ssylki_v_opisanii');
    expect(slugify('Щука, ёж и Юля')).toBe('shchuka_ezh_i_yulya');
    expect(translit('Хэштег объём')).toBe('kheshteg obem');
  });
  it('gives the same slug for NFD and NFC names', () => {
    expect(slugify('Оверлей_1x1'.normalize('NFD'))).toBe('overley_1x1');
    expect(slugify('Оверлей_1x1'.normalize('NFC'))).toBe('overley_1x1');
  });
  it('keeps only [a-z0-9_] and trims separators', () => {
    expect(slugify('  QR_1')).toBe('qr_1');
    expect(slugify('Обложка #1')).toBe('oblozhka_1');
    expect(slugify('Cloud.ru_BlackMono 3')).toBe('cloud_ru_blackmono_3');
    expect(slugify('+')).toBe('plus');
    expect(slugify('Café')).toBe('cafe');
  });
  it('falls back for empty names and avoids Windows device names', () => {
    expect(slugify('!!!')).toBe('untitled');
    expect(slugify('CON')).toBe('con_');
  });
  it('caps the length at 64 characters', () => {
    const s = slugify('Очень длинное имя композиции '.repeat(5));
    expect(s.length).toBeLessThanOrEqual(64);
    expect(s.endsWith('_')).toBe(false);
  });
  it('makes repeated names unique in order', () => {
    expect(uniqueSlugs(['Подкаст', 'Подкаст', 'Подкаст_2', 'Pattern_1'])).toEqual(['podkast', 'podkast_2', 'podkast_2_2', 'pattern_1']);
    const long = 'Ж'.repeat(80);
    const [a, b] = uniqueSlugs([long, long]);
    expect(a.length).toBe(64);
    expect(b.length).toBe(64);
    expect(b.endsWith('_2')).toBe(true);
  });
  it('assigns comp slugs by ascending item id, whatever the input order', () => {
    const m = compSlugs([{ id: 40, name: 'Подкаст' }, { id: 7, name: 'Подкаст' }, { id: 12, name: 'Cloud.ru' }]);
    expect(m.get(7)).toBe('podkast');
    expect(m.get(40)).toBe('podkast_2');
    expect(m.get(12)).toBe('cloud_ru');
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run tests/packs/slug.test.mjs`
Expected: FAIL — `Cannot find module '../../tools/packs/slug.mjs'`.

- [ ] **Step 3: Создать `tools/packs/slug.mjs`**

```js
// ASCII slugs for comp and file names. NFC first (Mac NFD names), then Russian transliteration,
// lower case, only [a-z0-9_], at most 64 characters. Deterministic: same name, same slug.
export const MAX_SLUG = 64;

const TABLE = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};
const SYMBOLS = { '+': '_plus_', '&': '_and_', '%': '_pct_', '@': '_at_' };
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/;

export const nfc = (s) => String(s).normalize('NFC');

export function translit(s) {
  let out = '';
  for (const ch of nfc(s).toLowerCase()) out += TABLE[ch] ?? ch;
  return out;
}

export function slugify(name, { maxLen = MAX_SLUG, fallback = 'untitled' } = {}) {
  let s = translit(name)
    .replace(/[+&%@]/g, (c) => SYMBOLS[c])
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // é -> e
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (s.length > maxLen) s = s.slice(0, maxLen).replace(/_+$/, '');
  if (!s) s = fallback;
  if (WINDOWS_RESERVED.test(s)) s += '_';
  return s;
}

// Unique slugs in input order: a repeated "podkast" becomes "podkast_2", then "podkast_3".
export function uniqueSlugs(names, opts = {}) {
  const maxLen = opts.maxLen || MAX_SLUG;
  const used = new Set();
  return names.map((name) => {
    const base = slugify(name, opts);
    let s = base;
    for (let k = 2; used.has(s); k += 1) {
      const suffix = '_' + k;
      s = base.slice(0, maxLen - suffix.length).replace(/_+$/, '') + suffix;
    }
    used.add(s);
    return s;
  });
}

// compSlug of every comp in a project: unique in the project and assigned in ascending item id,
// so golden renders (ROOT comps only) and JSX dumps (all comps) give a comp the same slug.
export function compSlugs(comps) {
  const sorted = [...comps].sort((a, b) => a.id - b.id);
  const slugs = uniqueSlugs(sorted.map((c) => c.name));
  return new Map(sorted.map((c, i) => [c.id, slugs[i]]));
}
```

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/packs/slug.test.mjs`
Expected: `7 passed`.

- [ ] **Step 5: Написать падающий тест `tests/packs/make-relink-copy.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { planCopy, makeRelinkCopy } from '../../tools/packs/make-relink-copy.mjs';
import { RENAMES } from '../../tools/packs/packs.mjs';
import { snapshot } from '../../tools/packs/snapshot.mjs';

const LONG = 'A_robotic_arm_performing_minimal,_precise_technological_movements._The_scene_showcases_a_sleek_' +
  'modern_design_with_smooth_metallic_textures_and_geometric_forms,_conveying_a_photographic_minimalism_' +
  'inspired_by_Carl_Kleiner_and_Jeffrey_Milstei.mp4';
const NFD_IMG = 'Оверлей спикера.png'.normalize('NFD'); // "й" decomposes in NFD
const V = '2_Вебинары/(Footage)/Folder/Video/';

function webinarsSource() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'bk-pkg-'));
  const put = (rel, body) => {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), body);
  };
  put('2_Вебинары/Вебинары.aep', 'aep');
  put(V + LONG, 'clip-a');
  put(V + 'Seedance.mp4', 'clip-b');
  put('2_Вебинары/(Footage)/Folder/Img/' + NFD_IMG, 'png');
  put('2_Вебинары/(Footage)/Folder/Img/._Group.png', 'junk');
  return root;
}

describe('planCopy', () => {
  const files = [V + LONG, V + 'Seedance.mp4', '2_Вебинары/(Footage)/Folder/Img/' + NFD_IMG, '2_Вебинары/(Footage)/._x.png'];
  it('renames the AI clips, normalises names to NFC and skips macOS metadata', () => {
    const { entries, skipped } = planCopy({ slug: 'webinars', aepRel: '2_Вебинары/Вебинары.aep', files, renames: RENAMES.webinars });
    expect(entries.map((e) => e.new)).toEqual([
      'webinars.aep',
      '(Footage)/Folder/Video/AI_robot_arm_A_1440p24.mp4',
      '(Footage)/Folder/Video/AI_robot_arm_B_1440p24.mp4',
      '(Footage)/Folder/Img/' + NFD_IMG.normalize('NFC'),
    ]);
    expect(entries[3].nfcChanged).toBe(true);
    expect(entries[1].old).toBe('(Footage)/Folder/Video/' + LONG);
    expect(skipped).toEqual([{ old: '(Footage)/._x.png', reason: 'macos-metadata' }]);
  });
  it('refuses two files that become one name', () => {
    const clash = ['p/(Footage)/a/Й.wav', 'p/(Footage)/a/' + 'Й.wav'.normalize('NFD')];
    expect(() => planCopy({ slug: 'x', aepRel: 'p/x.aep', files: clash })).toThrow(/NAME_CLASH/);
  });
  it('fails when a required rename finds no file', () => {
    expect(() => planCopy({ slug: 'webinars', aepRel: '2_Вебинары/Вебинары.aep', files: [V + 'Seedance.mp4'], renames: RENAMES.webinars }))
      .toThrow(/RENAME_NOT_FOUND: AI_robot_arm_A_1440p24\.mp4/);
  });
});

describe('makeRelinkCopy', () => {
  it('copies the pack from a verified archive and writes relink-map.json', async () => {
    const pkg = webinarsSource();
    const arc = path.join(mkdtempSync(path.join(os.tmpdir(), 'bk-arc-')), 'a');
    const manifest = await snapshot({ src: pkg, dest: arc });
    const out = path.join(mkdtempSync(path.join(os.tmpdir(), 'bk-packs-')), 'webinars').replace(/\\/g, '/');
    const doc = await makeRelinkCopy({ slug: 'webinars', srcRoot: arc, outDir: out, manifest });
    expect(doc.aep).toBe(out + '/webinars.aep');
    expect(readFileSync(out + '/(Footage)/Folder/Video/AI_robot_arm_A_1440p24.mp4', 'utf8')).toBe('clip-a');
    expect(statSync(out + '/webinars.aep').mode & 0o200).not.toBe(0);
    expect(existsSync(out + '/(Footage)/Folder/Img/._Group.png')).toBe(false);
    expect(doc.map['(Footage)/Folder/Video/' + LONG]).toBe(out + '/(Footage)/Folder/Video/AI_robot_arm_A_1440p24.mp4');
    expect(doc.map['(Footage)/Folder/Img/' + NFD_IMG.normalize('NFC')]).toBe(out + '/(Footage)/Folder/Img/' + NFD_IMG.normalize('NFC'));
    expect(doc.source.verified).toBe(true);
    expect(JSON.parse(readFileSync(out + '/relink-map.json', 'utf8')).slug).toBe('webinars');
    await expect(makeRelinkCopy({ slug: 'webinars', srcRoot: arc, outDir: out, manifest })).rejects.toThrow(/PACK_EXISTS/);
  });
  it('stops on a byte that differs from the archive manifest', async () => {
    const pkg = webinarsSource();
    const arc = path.join(mkdtempSync(path.join(os.tmpdir(), 'bk-arc-')), 'a');
    const manifest = await snapshot({ src: pkg, dest: arc });
    const bad = { ...manifest, files: manifest.files.map((f) => (f.path.endsWith('Seedance.mp4') ? { ...f, sha256: '0'.repeat(64) } : f)) };
    const out = path.join(mkdtempSync(path.join(os.tmpdir(), 'bk-packs-')), 'webinars');
    await expect(makeRelinkCopy({ slug: 'webinars', srcRoot: arc, outDir: out, manifest: bad })).rejects.toThrow(/HASH_MISMATCH/);
  });
});
```

- [ ] **Step 6: Убедиться, что тест падает**

Run: `npx vitest run tests/packs/make-relink-copy.test.mjs`
Expected: FAIL — `Cannot find module '../../tools/packs/make-relink-copy.mjs'`.

- [ ] **Step 7: Создать `tools/packs/packs.mjs`**

```js
// The nine projects of the package (spec §2): slug -> source .aep and its (Footage) folder, relative
// to the package root, in NFC. The courses Auto-Save copy is not a pack. Logo shots and titles have
// no footage files (their Collect reports list 0 files).
export const PACKS = {
  logo: { aep: '1_Логошоты/Логошот.aep', footage: null },
  logo_conv: { aep: '1_Логошоты/Логошот (converted).aep', footage: null },
  titles: { aep: '5_Titles/Titles (3).aep', footage: null },
  titles_conv: { aep: '5_Titles/Titles (3) (converted).aep', footage: null },
  webinars: { aep: '2_Вебинары/Вебинары.aep', footage: '2_Вебинары/(Footage)' },
  courses: {
    aep: '3_Обучающие_курсы/3_Обучающие курсы/Обучающие курсы.aep',
    footage: '3_Обучающие_курсы/3_Обучающие курсы/(Footage)',
  },
  courses_conv: {
    aep: '3_Обучающие_курсы/3_Обучающие курсы/Обучающие курсы (converted).aep',
    footage: '3_Обучающие_курсы/3_Обучающие курсы/(Footage)',
  },
  smm: { aep: '4_SMM_Pack/SMM_pack.aep', footage: '4_SMM_Pack/(Footage)' },
  podcast: { aep: '6_Podcast_Cloud.ru_Pack/Podcast_Pack.aep', footage: '6_Podcast_Cloud.ru_Pack/(Footage)' },
};
export const SLUGS = Object.keys(PACKS);

// Renames in the copies. The AI clip's ~250-character name puts its path at 322 characters, over
// the Windows MAX_PATH of 260 (audit_webinars, problem 0). Both clips are 1440x1440, 24 fps.
export const RENAMES = {
  webinars: [
    { match: /^A_robotic_arm_performing_minimal.*\.mp4$/i, to: 'AI_robot_arm_A_1440p24.mp4' },
    { match: /^Seedance\.mp4$/i, to: 'AI_robot_arm_B_1440p24.mp4' },
  ],
};

// Footage the package cannot provide: the converted courses file is a production job whose media
// sits on G:\ (audit_courses: 4 items, slide_01.png twice). Matched by NFC base name.
export const KNOWN_MISSING = {
  courses_conv: ['Запись экрана 2026-09-01 в 12.42.01.mov', '3D.png', 'slide_01.png'],
};
```

- [ ] **Step 8: Создать `tools/packs/make-relink-copy.mjs`**

```js
#!/usr/bin/env node
// Relink-only working copy of a pack (spec §3.2): <packs>/<slug>/<slug>.aep next to its (Footage)
// tree. Names become NFC, the two AI clips get short names, renders and macOS metadata are not
// copied. relink-map.json maps every old relative path (NFC) to the new absolute path.
//   node tools/packs/make-relink-copy.mjs --all | --slug webinars [--src DIR]
// The default source is the frozen archive (Task 1); its manifest checks every copied byte.
import {
  chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, utimesSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { walkFiles, sha256File, isMacJunk, isRenderPath } from './fsutil.mjs';
import { PACKS, SLUGS, RENAMES } from './packs.mjs';
import { nfc } from './slug.mjs';
import { archiveDir, packDir } from './paths.mjs';

export const MAX_PATH = 240; // Windows MAX_PATH is 260; keep room for AE's own suffixes
export const MAP_FILE = 'relink-map.json';

// files: package-relative paths of the footage files (as on disk). Returns what to copy where.
export function planCopy({ slug, aepRel, files, renames = [] }) {
  const base = path.posix.dirname(aepRel);
  const entries = [{ src: aepRel, old: path.posix.basename(aepRel), new: slug + '.aep', kind: 'aep' }];
  const skipped = [];
  for (const rel of files) {
    const old = path.posix.relative(base, rel);
    if (isMacJunk(old)) { skipped.push({ old, reason: 'macos-metadata' }); continue; }
    if (isRenderPath(old)) { skipped.push({ old, reason: 'render' }); continue; }
    const parts = nfc(old).split('/');
    const name = parts.pop();
    const rule = renames.find((r) => r.match.test(name));
    entries.push({
      src: rel, old, new: parts.concat([rule ? rule.to : name]).join('/'), kind: 'footage',
      renamed: Boolean(rule), nfcChanged: nfc(old) !== old,
    });
  }
  const seen = new Map();
  for (const e of entries) {
    const k = e.new.toLowerCase(); // NTFS and APFS are case-insensitive
    if (seen.has(k)) throw new Error('NAME_CLASH: "' + seen.get(k) + '" and "' + e.old + '" -> ' + e.new);
    seen.set(k, e.old);
  }
  for (const r of renames) {
    if (!entries.some((e) => e.renamed && path.posix.basename(e.new) === r.to)) throw new Error('RENAME_NOT_FOUND: ' + r.to);
  }
  return { entries, skipped };
}

export async function makeRelinkCopy({ slug, srcRoot, outDir, manifest = null }) {
  const pack = PACKS[slug];
  if (!pack) throw new Error('UNKNOWN_SLUG: ' + slug);
  if (existsSync(outDir) && readdirSync(outDir).length) {
    throw new Error('PACK_EXISTS: ' + outDir + ' is not empty; delete it by hand to make a fresh copy');
  }
  const files = pack.footage ? walkFiles(path.join(srcRoot, pack.footage)).map((r) => pack.footage + '/' + r) : [];
  const { entries, skipped } = planCopy({ slug, aepRel: pack.aep, files, renames: RENAMES[slug] || [] });
  for (const e of entries) {
    e.abs = path.posix.join(outDir, e.new);
    if (e.abs.length > MAX_PATH) throw new Error('PATH_TOO_LONG (' + e.abs.length + '): ' + e.abs);
  }
  const hashes = manifest ? new Map(manifest.files.map((f) => [f.path, f.sha256])) : null;
  for (const e of entries) {
    const from = path.join(srcRoot, e.src);
    const st = statSync(from);
    mkdirSync(path.dirname(e.abs), { recursive: true });
    copyFileSync(from, e.abs);
    chmodSync(e.abs, 0o644); // archive files are read-only; the copy must stay writable for AE
    utimesSync(e.abs, st.atime, st.mtime);
    e.size = st.size;
    if (hashes) {
      if (!hashes.has(e.src)) throw new Error('NOT_IN_MANIFEST: ' + e.src);
      e.sha256 = await sha256File(e.abs);
      if (e.sha256 !== hashes.get(e.src)) throw new Error('HASH_MISMATCH: ' + e.src);
    }
  }
  const map = {};
  for (const e of entries) if (e.kind === 'footage') map[nfc(e.old)] = e.abs;
  const doc = {
    slug,
    source: { root: String(srcRoot).replace(/\\/g, '/'), aep: pack.aep, verified: Boolean(hashes) },
    aep: path.posix.join(outDir, slug + '.aep'),
    createdAt: new Date().toISOString(),
    entries, skipped, map,
  };
  writeFileSync(path.posix.join(outDir, MAP_FILE), JSON.stringify(doc, null, 2) + '\n', 'utf8');
  return doc;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const val = (flag) => { const i = argv.indexOf(flag); return i === -1 ? undefined : argv[i + 1]; };
  const slugs = argv.includes('--all') ? SLUGS : [val('--slug')];
  if (!slugs[0]) {
    console.error('usage: node tools/packs/make-relink-copy.mjs --all | --slug <' + SLUGS.join('|') + '> [--src DIR]');
    process.exit(2);
  }
  const srcRoot = String(val('--src') || archiveDir()).replace(/\\/g, '/');
  const mf = path.join(srcRoot, 'manifest.json');
  const manifest = existsSync(mf) ? JSON.parse(readFileSync(mf, 'utf8')) : null;
  if (!manifest) console.log('note: ' + srcRoot + ' has no manifest.json, copies are not hash-checked');
  try {
    for (const slug of slugs) {
      const d = await makeRelinkCopy({ slug, srcRoot, outDir: packDir(slug), manifest });
      const n = (pred) => d.entries.filter(pred).length;
      console.log(`${slug}: ${d.entries.length} files (${n((e) => e.renamed)} renamed, ${n((e) => e.nfcChanged)} NFC), ` +
        `${d.skipped.length} skipped -> ${d.aep}`);
    }
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
}
```

- [ ] **Step 9: Запустить тесты**

Run: `npx vitest run tests/packs`
Expected: `22 passed`.

- [ ] **Step 10: Сделать копии всех пакетов**

Run: `node tools/packs/make-relink-copy.mjs --all`
Expected:
```text
logo: 1 files (0 renamed, 0 NFC), 0 skipped -> C:/CRBK/packs/logo/logo.aep
logo_conv: 1 files (0 renamed, 0 NFC), 0 skipped -> C:/CRBK/packs/logo_conv/logo_conv.aep
titles: 1 files (0 renamed, 0 NFC), 0 skipped -> C:/CRBK/packs/titles/titles.aep
titles_conv: 1 files (0 renamed, 0 NFC), 0 skipped -> C:/CRBK/packs/titles_conv/titles_conv.aep
webinars: 7 files (2 renamed, 0 NFC), 0 skipped -> C:/CRBK/packs/webinars/webinars.aep
courses: 4 files (0 renamed, 0 NFC), 0 skipped -> C:/CRBK/packs/courses/courses.aep
courses_conv: 4 files (0 renamed, 0 NFC), 0 skipped -> C:/CRBK/packs/courses_conv/courses_conv.aep
smm: 3 files (0 renamed, 0 NFC), 0 skipped -> C:/CRBK/packs/smm/smm.aep
podcast: 29 files (0 renamed, 2 NFC), 21 skipped -> C:/CRBK/packs/podcast/podcast.aep
```
`21 skipped` — служебные файлы macOS `._*` подкаста. Если какая-то папка уже есть (`PACK_EXISTS`), её удаляют руками и запускают `--slug <slug>`.

- [ ] **Step 11: Проверить переименования и NFC**

Run: `node -e "const m=require('C:/CRBK/packs/webinars/relink-map.json'); console.log(m.source.verified, m.entries.filter(e => e.renamed).map(e => e.new))"`
Expected: `true [ '(Footage)/Folder/Video/AI_robot_arm_A_1440p24.mp4', '(Footage)/Folder/Video/AI_robot_arm_B_1440p24.mp4' ]`.

Run: `node -e "const m=require('C:/CRBK/packs/podcast/relink-map.json'); console.log(m.entries.filter(e => e.nfcChanged).map(e => e.new))"`
Expected: `[ '(Footage)/SFX/Дисклеймер.wav', '(Footage)/SFX/Подписывайтесь на канал CLOUD.RU.wav' ]`.

- [ ] **Step 12: Commit**

```bash
git add tools/packs/slug.mjs tools/packs/packs.mjs tools/packs/make-relink-copy.mjs tests/packs/slug.test.mjs tests/packs/make-relink-copy.test.mjs
git commit -m "feat(packs): ASCII slugs and relink-only working copies of the packs" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: Перелинковка копий в AE и отчёт о шрифтах

**Files:**
- Create: `tools/packs/jsx-call.mjs`, `tools/packs/ae-project.mjs`, `tools/packs/relink-resolve.mjs`, `tools/packs/relink.mjs`, `tools/packs/jsx/project-state.jsx`, `tools/packs/jsx/open-project.jsx`, `tools/packs/jsx/close-project.jsx`, `tools/packs/relink.jsx`
- Test: `tests/packs/relink-resolve.test.mjs`, `tests/packs/ae-project.test.mjs`
- Create (результат прогона): `docs/research/packs/relink-summary.json`

Что ожидается по аудиту:
- **Проекты с Mac** хранят пути `/Volumes/...`. AE не находит их по абсолютному пути и ищет относительно проекта, то есть в `(Footage)` копии.
- **Вебинары.** Пропадут только два переименованных AI-ролика; их находит `relink-map.json`.
- **Подкаст.** Два NFD-файла теперь называются в NFC и находятся.
- **`courses_conv`** сохранён на этой машине. Его три файла AE найдёт в исходном пакете по абсолютному пути. Это «внешние» ссылки, и инструмент переводит их в копию. Четыре файла с `G:\` (запись экрана, `3D.png`, дважды `slide_01.png`) — продакшн-медиа, которых в пакете нет. Это известная пропажа: перелинковка принята (`relinkOk`), но эталон для этого пакета не снимается (`goldenOk: false`, спец. §3.2).

Решения API (проверены по документации):
- `FootageItem.replace(file)` меняет источник и сохраняет интерпретацию — <https://ae-scripting.docsforadobe.dev/item/footageitem/#footageitemreplace>.
- Путь пропавшего файла — `FileSource.missingFootagePath` — <https://ae-scripting.docsforadobe.dev/sources/filesource/>.
- `app.open()` спрашивает о сохранении, если текущий проект изменён. Поэтому сначала проверяется `Project.dirty` (AE 17.5+) — <https://ae-scripting.docsforadobe.dev/general/application/#appopen>.
- `app.beginSuppressDialogs()` скрывает только ошибки скриптов. Предупреждение о пропавших файлах при открытии может остаться, и тогда вызов падает по таймауту; это ручной шаг ниже.
- Шрифты: `app.fonts.missingOrSubstitutedFonts` (AE 24.0+) и `app.project.usedFonts` (AE 24.5+), у шрифта есть `version`, `location` и `isSubstitute` — <https://ae-scripting.docsforadobe.dev/text/fontsobject/>.
- Ловушка ae-quirks #187: подменённый шрифт выдаёт себя файлом (`times.ttf` вместо своего `.otf`). Такой шрифт SB Sans отчёт помечает как `suspiciousFonts`.

- [ ] **Step 1: Написать падающий тест `tests/packs/relink-resolve.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { footageRel, isInside, resolveFootage, acceptance, nameKey } from '../../tools/packs/relink-resolve.mjs';
import { sameProjectFile } from '../../tools/packs/ae-project.mjs';
import { composeJsx } from '../../tools/packs/jsx-call.mjs';
import { mergeSummary, summarize } from '../../tools/packs/relink.mjs';
import { KNOWN_MISSING } from '../../tools/packs/packs.mjs';

const PACK = 'C:/CRBK/packs/webinars';
const LONG = 'A_robotic_arm_performing_minimal,_precise_technological_movements._x_Jeffrey_Milstei.mp4';
const map = {
  ['(Footage)/Folder/Video/' + LONG]: PACK + '/(Footage)/Folder/Video/AI_robot_arm_A_1440p24.mp4',
  '(Footage)/Folder/Video/Seedance.mp4': PACK + '/(Footage)/Folder/Video/AI_robot_arm_B_1440p24.mp4',
  '(Footage)/Folder/Img/Group 2131327780.png': PACK + '/(Footage)/Folder/Img/Group 2131327780.png',
};
const files = Object.values(map);

describe('relink paths', () => {
  it('cuts the (Footage) part out of Mac and Windows paths', () => {
    expect(footageRel('/Volumes/T7_Black/_Video/2_Вебинары/(Footage)/Folder/Video/Seedance.mp4')).toBe('(Footage)/Folder/Video/Seedance.mp4');
    expect(footageRel('C:\\Users\\Глеб\\Documents\\Граф пакет Cloud.ru\\3_Обучающие_курсы\\3_Обучающие курсы\\(Footage)\\Folder\\Visuals\\Kubernetes.png'))
      .toBe('(Footage)/Folder/Visuals/Kubernetes.png');
    expect(footageRel('G:\\Продвижение Cloud.ru Advanced\\3D.png')).toBe(null);
  });
  it('tests "inside the pack" without caring about slashes or case', () => {
    expect(isInside('C:\\CRBK\\packs\\webinars\\(Footage)\\a.png', PACK)).toBe(true);
    expect(isInside('C:/CRBK/packs/webinars_old/a.png', PACK)).toBe(false);
  });
  it('compares base names in NFC with any space as a plain space', () => {
    expect(nameKey('/x/Дисклеймер.wav'.normalize('NFD'))).toBe(nameKey('C:\\y\\ДИСКЛЕЙМЕР.wav'));
    expect(nameKey('G:\\a\\Запись экрана 2026-09-01 в\u202f12.42.01.mov')).toBe(nameKey('Запись экрана 2026-09-01 в 12.42.01.mov'));
  });
  it('accepts the "(converted)" name AE gives an older project', () => {
    expect(sameProjectFile('C:\\CRBK\\packs\\logo\\logo (converted).aep', 'C:/CRBK/packs/logo/logo.aep')).toBe(true);
    expect(sameProjectFile('C:\\CRBK\\packs\\logo\\logo_relinked.aep', 'C:/CRBK/packs/logo/logo.aep')).toBe(false);
    expect(sameProjectFile(null, 'C:/CRBK/packs/logo/logo.aep')).toBe(false);
  });
});

describe('resolveFootage', () => {
  const row = (id, name, p, missing = true) => ({ id, name, missing, placeholder: false, path: p });
  it('relinks renamed, NFD, external and in-pack items, and reports the rest', () => {
    const footage = [
      row(1, LONG, '/Volumes/T7_Black/_Video/2_Вебинары/(Footage)/Folder/Video/' + LONG),
      row(2, 'Seedance.mp4', '/Users/gm/Downloads/Seedance.mp4'),
      row(3, 'Group 2131327780.png', 'C:\\Users\\Глеб\\Documents\\Граф пакет Cloud.ru\\2_Вебинары\\(Footage)\\Folder\\Img\\Group 2131327780.png', false),
      row(4, 'ok.png', 'C:\\CRBK\\packs\\webinars\\(Footage)\\Folder\\Img\\Group 2131327780.png', false),
      row(5, '3D.png', 'G:\\Продвижение Cloud.ru Advanced\\3D.png'),
      { id: 6, name: 'Placeholder', missing: true, placeholder: true, path: null },
    ];
    const r = resolveFootage(footage, { packDir: PACK, map, files });
    expect(r.replace).toEqual([
      { id: 1, name: LONG, path: PACK + '/(Footage)/Folder/Video/AI_robot_arm_A_1440p24.mp4', via: 'map', was: 'missing' },
      { id: 2, name: 'Seedance.mp4', path: PACK + '/(Footage)/Folder/Video/AI_robot_arm_B_1440p24.mp4', via: 'map-name', was: 'missing' },
      { id: 3, name: 'Group 2131327780.png', path: PACK + '/(Footage)/Folder/Img/Group 2131327780.png', via: 'map', was: 'external' },
    ]);
    expect(r.ok.map((x) => x.id)).toEqual([4]);
    expect(r.unresolved.map((x) => [x.id, x.reason])).toEqual([[5, 'missing: not in pack'], [6, 'placeholder']]);
  });
  it('finds a file by NFC name when the map does not know it, and refuses a name that is not unique', () => {
    const nfd = 'Дисклеймер.wav'.normalize('NFD');
    const pod = 'C:/CRBK/packs/podcast';
    const one = resolveFootage([row(7, nfd, '/Volumes/X/old/' + nfd)], { packDir: pod, map: {}, files: [pod + '/(Footage)/SFX/Дисклеймер.wav'] });
    expect(one.replace[0]).toMatchObject({ id: 7, path: pod + '/(Footage)/SFX/Дисклеймер.wav', via: 'name' });
    const two = resolveFootage([row(8, 'a.wav', '/X/a.wav')], { packDir: pod, map: {}, files: [pod + '/(Footage)/1/a.wav', pod + '/(Footage)/2/a.wav'] });
    expect(two.unresolved[0].reason).toBe('missing: ambiguous');
  });
});

describe('acceptance', () => {
  const font = (ps, extra = {}) => ({ postScriptName: ps, version: '1.002', location: 'C:\\Windows\\Fonts\\' + ps + '.otf', isSubstitute: false, ...extra });
  it('accepts a clean pack for golden renders', () => {
    const a = acceptance({ footage: [{ id: 1, name: 'x', missing: false, path: PACK + '/(Footage)/x.png' }],
      fonts: { used: [font('SBSansDisplay-Regular')], missingOrSubstituted: [] } }, { packDir: PACK });
    expect(a).toMatchObject({ relinkOk: true, goldenOk: true, missing: [], external: [] });
  });
  it('lets the known G: files of courses_conv pass the relink but never the golden gate', () => {
    const footage = ['Запись экрана 2026-09-01 в 12.42.01.mov', '3D.png', 'slide_01.png', 'slide_01.png']
      .map((n, i) => ({ id: i, name: n, missing: true, path: 'G:\\prod\\' + n }));
    const a = acceptance({ footage, fonts: { used: [], missingOrSubstituted: [] } },
      { packDir: 'C:/CRBK/packs/courses_conv', knownMissing: KNOWN_MISSING.courses_conv });
    expect(a.relinkOk).toBe(true);
    expect(a.goldenOk).toBe(false);
    expect(a.missing).toHaveLength(4);
  });
  it('blocks golden renders on a substituted or misplaced brand font', () => {
    const sub = acceptance({ footage: [], fonts: { used: [font('SBSansDisplay-Bold', { isSubstitute: true })], missingOrSubstituted: [] } }, { packDir: PACK });
    expect(sub.usedSubstitutes).toEqual(['SBSansDisplay-Bold']);
    expect(sub.goldenOk).toBe(false);
    const times = acceptance({ footage: [], fonts: { used: [font('SBSansDisplay-SemiBold', { location: 'C:\\Windows\\Fonts\\times.ttf' })], missingOrSubstituted: [] } }, { packDir: PACK });
    expect(times.suspiciousFonts).toEqual(['SBSansDisplay-SemiBold @ C:\\Windows\\Fonts\\times.ttf']);
    expect(times.goldenOk).toBe(false);
  });
});

describe('relink report helpers', () => {
  it('composes JSX with PARAMS first', () => {
    const src = composeJsx(['tools/packs/jsx/project-state.jsx'], { a: 'Глеб' });
    expect(src.startsWith('var PARAMS = {"a":"Глеб"};\n')).toBe(true);
    expect(src).toContain('app.project.dirty');
  });
  it('keeps one summary line per pack, sorted by slug', () => {
    const file = path.join(mkdtempSync(path.join(os.tmpdir(), 'bk-sum-')), 'relink-summary.json');
    mergeSummary(file, 'webinars', { goldenOk: true });
    mergeSummary(file, 'logo', { goldenOk: true });
    mergeSummary(file, 'webinars', { goldenOk: false });
    expect(Object.keys(JSON.parse(readFileSync(file, 'utf8')))).toEqual(['logo', 'webinars']);
    expect(JSON.parse(readFileSync(file, 'utf8')).webinars.goldenOk).toBe(false);
  });
  it('summarises a report for the repo', () => {
    const report = {
      date: '2026-10-05', notes: ['dialog seen'],
      plan: { unresolved: [{ name: '3D.png', reason: 'missing: not in pack' }] },
      replaced: [{ ok: true }, { ok: false }],
      after: { version: '26.5x60', engine: 'extendscript',
        fonts: { used: [{ postScriptName: 'SBSansText-Regular', version: '1.003', isSubstitute: false }], missingOrSubstituted: [] } },
      acceptance: { missing: [{ name: '3D.png' }], external: [], relinkOk: true, goldenOk: false, suspiciousFonts: [] },
    };
    expect(summarize(report)).toMatchObject({
      replaced: 1, unresolvedBefore: ['3D.png (missing: not in pack)'], missingAfter: ['3D.png'],
      usedFonts: ['SBSansText-Regular 1.003'], expressionEngine: 'extendscript', notes: ['dialog seen'],
    });
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run tests/packs/relink-resolve.test.mjs`
Expected: FAIL — `Cannot find module '../../tools/packs/relink-resolve.mjs'`.

- [ ] **Step 3: Создать `tools/packs/jsx-call.mjs`**

```js
// Run our JSX files in the live AE with PARAMS (like runSpike, without the spike check helpers).
// Every JSX here returns JSON.stringify({ ok, error, detail, ... }); a reply with `error` throws.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../host-run.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(here, '../..');

export function composeJsx(files, params = {}) {
  return ['var PARAMS = ' + JSON.stringify(params) + ';']
    .concat(files.map((f) => readFileSync(path.resolve(REPO, f), 'utf8')))
    .join('\n');
}

export async function callJsx(files, params = {}, { timeoutMs = 120000 } = {}) {
  const r = await run('ae', composeJsx([].concat(files), params), { timeoutMs });
  if (r && r.error) {
    const e = new Error(r.error + (r.detail === undefined ? '' : ': ' + JSON.stringify(r.detail)));
    e.result = r;
    throw e;
  }
  return r;
}
```

- [ ] **Step 4: Создать тест `tests/packs/ae-project.test.mjs` и модуль `tools/packs/ae-project.mjs`**

Проект, сохранённый старой версией AE, AE 26.5 открывает как безымянный сконвертированный: у `app.project` нет файла, пока его не сохранят (проверено вживую 2026-10-02). Такой проект принимается только с отпечатком (число элементов и имя первого), и `relink.jsx` сверяет отпечаток перед любой правкой.

`tests/packs/ae-project.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { acceptOpened, sameProjectFile } from '../../tools/packs/ae-project.mjs';

const COPY = 'C:/CRBK/packs/logo/logo.aep';

describe('acceptOpened', () => {
  it('accepts the file itself, also under the old "(converted)" name', () => {
    expect(acceptOpened({ file: 'C:\\CRBK\\packs\\logo\\logo.aep' }, COPY)).toEqual({ converted: false });
    expect(sameProjectFile('C:\\CRBK\\packs\\logo\\logo (converted).aep', COPY)).toBe(true);
  });
  it('accepts an untitled converted project only with a fingerprint (AE 26.5 keeps it untitled)', () => {
    const r = { file: null, converted: true, fingerprint: { items: 20, first: 'Логошоты' } };
    expect(acceptOpened(r, COPY)).toEqual({ converted: true, fingerprint: { items: 20, first: 'Логошоты' } });
  });
  it('rejects another file and an untitled project without a fingerprint', () => {
    expect(() => acceptOpened({ file: 'C:/CRBK/packs/smm/smm.aep' }, COPY)).toThrow(/OPEN_MISMATCH/);
    expect(() => acceptOpened({ file: null, converted: true }, COPY)).toThrow(/OPEN_MISMATCH/);
    expect(() => acceptOpened({ file: null, converted: true, fingerprint: { items: 0, first: null } }, COPY))
      .toThrow(/OPEN_MISMATCH/);
  });
});
```

`tools/packs/ae-project.mjs`:

```js
// Opening and closing our working copies in the live AE without ever losing the user's work.
import { callJsx } from './jsx-call.mjs';
import { crbkRoot } from './paths.mjs';

// AE opens an older-version project as "<name> (converted).aep" next to the original file.
export function sameProjectFile(actual, expected) {
  if (!actual || !expected) return false;
  const norm = (p) => String(p).replace(/\\/g, '/').normalize('NFC').toLowerCase()
    .replace(/ \(converted\)(\.aepx?)$/, '$1');
  return norm(actual) === norm(expected);
}

// What AE has open right after app.open(file): the file itself, or, for a project saved by an older
// AE version, an untitled converted project. AE 26.5 keeps it untitled until it is saved (seen live
// 2026-10-02), so it is accepted only with a fingerprint that later calls check before any change.
export function acceptOpened(r, file) {
  if (sameProjectFile(r.file, file)) return { converted: false };
  const fp = r.fingerprint;
  if (!r.file && r.converted === true && fp && fp.items > 0) return { converted: true, fingerprint: fp };
  throw new Error('OPEN_MISMATCH: AE reports "' + r.file + '" for ' + file);
}

export function projectState() {
  return callJsx(['tools/packs/jsx/project-state.jsx'], {}, { timeoutMs: 30000 });
}

// Opens `file` unless it is already the open project (then it is reused even with unsaved changes:
// it is our own working copy). Any OTHER project with unsaved changes stops the run.
export async function openProject(file, { timeoutMs = 300000 } = {}) {
  const st = await projectState();
  if (sameProjectFile(st.file, file)) return { opened: false, file: st.file, dirty: st.dirty, version: st.version };
  if (st.dirty) {
    const ours = st.file && String(st.file).replace(/\\/g, '/').toLowerCase().startsWith(crbkRoot().toLowerCase() + '/');
    throw new Error('AE_DIRTY: "' + (st.file || 'untitled') + '" has unsaved changes. ' + (ours
      ? 'It is a BrandKit working copy: close it in AE WITHOUT saving (File > Close > Don\'t Save), then run the command again'
      : 'Save or close it in AE, then run the command again'));
  }
  try {
    const r = await callJsx(['tools/packs/jsx/open-project.jsx'], { path: file }, { timeoutMs });
    const how = acceptOpened(r, file);
    return { opened: true, file: r.file, dirty: r.dirty, version: st.version, ...how };
  } catch (e) {
    if (/CDP_TIMEOUT/.test(e.message)) {
      e.message += '\nAE is probably showing a dialog (missing files or fonts). Read it, press OK in AE, ' +
        'then run the same command again: it continues with the project that is now open.';
    }
    throw e;
  }
}

export function closeDiscard(file) {
  return callJsx(['tools/packs/jsx/close-project.jsx'], { expect: file }, { timeoutMs: 60000 });
}
```

- [ ] **Step 5: Создать `tools/packs/relink-resolve.mjs`**

Порядок поиска файла: по относительному пути из `relink-map.json` (часть пути от папки `(Footage)`), затем по старому имени из карты, затем по уникальному NFC-имени среди файлов копии. Если найдено два файла с таким именем, ничего не подставляется: выбор делает человек.

```js
// Pure relink logic for one pack copy: which footage items need a new file, which file, and whether
// the result is acceptable. AE does the replacing (relink.jsx); Node decides (here, unit-tested).
import { nfc } from './slug.mjs';

const norm = (p) => nfc(String(p).replace(/\\/g, '/'));
const lower = (p) => norm(p).toLowerCase();
export const baseName = (p) => {
  const parts = norm(p).split(/[\\/:]+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
};
// Base names compared NFC, case-insensitive, any Unicode space as a plain space (macOS screen
// recordings use U+202F).
export const nameKey = (p) => baseName(p).replace(/\s/g, ' ').toLowerCase();

// "(Footage)/Folder/Video/x.mp4" from any path that runs through a "(Footage)" folder:
// a Mac path "/Volumes/T7_Black/_Video/2_Вебинары/(Footage)/..." or a Windows one.
export function footageRel(p) {
  const segs = norm(p).split(/[\\/:]+/).filter(Boolean);
  const i = segs.findIndex((s) => s.toLowerCase() === '(footage)');
  return i === -1 ? null : segs.slice(i).join('/');
}

export function isInside(p, dir) {
  return lower(p).startsWith(lower(dir).replace(/\/+$/, '') + '/');
}

function group(list, keyOf) {
  const m = new Map();
  for (const x of list) {
    const k = keyOf(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

// footage: rows from relink.jsx scan. map: relink-map.json "map" (old rel NFC -> new abs).
// files: absolute paths of every file under <pack>/(Footage).
export function resolveFootage(footage, { packDir, map, files }) {
  const byRel = new Map(Object.entries(map).map(([k, v]) => [lower(k), norm(v)]));
  const byOldName = group(Object.keys(map), nameKey);
  const byName = group(files.map(norm), nameKey);
  const ok = [];
  const replace = [];
  const unresolved = [];
  for (const it of footage) {
    if (it.placeholder) { unresolved.push({ ...it, reason: 'placeholder' }); continue; }
    if (!it.missing && it.path && isInside(it.path, packDir)) { ok.push(it); continue; }
    const was = it.missing ? 'missing' : 'external';
    if (!it.path) { unresolved.push({ ...it, reason: was + ': no path' }); continue; }
    if (/\[\d+-\d+\]/.test(it.name)) { unresolved.push({ ...it, reason: was + ': image sequence' }); continue; }
    const rel = footageRel(it.path);
    let target = rel ? byRel.get(lower(rel)) : undefined;
    let via = 'map';
    if (!target) {
      const olds = byOldName.get(nameKey(it.path)) || [];
      if (olds.length === 1) { target = norm(map[olds[0]]); via = 'map-name'; }
    }
    if (!target) {
      const hits = byName.get(nameKey(it.path)) || [];
      if (hits.length > 1) { unresolved.push({ ...it, reason: was + ': ambiguous', candidates: hits }); continue; }
      if (hits.length === 1) { target = hits[0]; via = 'name'; }
    }
    if (!target) { unresolved.push({ ...it, reason: was + ': not in pack' }); continue; }
    replace.push({ id: it.id, name: it.name, path: target, via, was });
  }
  return { ok, replace, unresolved };
}

// after: the 'apply' or 'report' reply of relink.jsx.
export function acceptance(after, { packDir, knownMissing = [] }) {
  const missing = after.footage.filter((f) => f.missing);
  const external = after.footage.filter((f) => !f.missing && f.path && !isInside(f.path, packDir));
  const allowed = new Set(knownMissing.map(nameKey));
  const unexpectedMissing = missing.filter((f) => !allowed.has(nameKey(f.path || f.name)));
  const fonts = after.fonts || { used: [], missingOrSubstituted: [] };
  const usedSubstitutes = fonts.used.filter((f) => f.isSubstitute);
  // quirk #187: a brand font whose file is not its own (e.g. times.ttf) is a silent substitute
  const suspicious = fonts.used.filter((f) => /^SBSans/i.test(f.postScriptName || '') && f.location && !/sbsans/i.test(f.location));
  return {
    missing: missing.map((f) => ({ id: f.id, name: f.name, path: f.path })),
    external: external.map((f) => ({ id: f.id, name: f.name, path: f.path })),
    unexpectedMissing: unexpectedMissing.map((f) => f.name),
    usedSubstitutes: usedSubstitutes.map((f) => f.postScriptName),
    suspiciousFonts: suspicious.map((f) => f.postScriptName + ' @ ' + f.location),
    relinkOk: unexpectedMissing.length === 0 && external.length === 0,
    goldenOk: missing.length === 0 && external.length === 0 && usedSubstitutes.length === 0 && suspicious.length === 0,
  };
}
```

- [ ] **Step 6: Создать `tools/packs/relink.mjs`**

```js
#!/usr/bin/env node
// Relink the pack copies in the live AE (Plan 2, Task 3).
//   node tools/packs/relink.mjs --all | --slug webinars [--note "<what you saw in AE>"]
//   node tools/packs/relink.mjs --slug webinars --report-only   (re-read an existing <slug>_relinked.aep)
// Per pack: open <slug>.aep (refused while another project has unsaved changes) -> scan footage ->
// resolve in Node -> replace + Save As <slug>_relinked.aep -> relink-report.json in the pack folder
// and a line in docs/research/packs/relink-summary.json. The archive and the package are never opened.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { walkFiles } from './fsutil.mjs';
import { SLUGS, KNOWN_MISSING } from './packs.mjs';
import { packDir } from './paths.mjs';
import { callJsx, REPO } from './jsx-call.mjs';
import { openProject, sameProjectFile } from './ae-project.mjs';
import { resolveFootage, acceptance } from './relink-resolve.mjs';

export const REPORT = 'relink-report.json';
export const SUMMARY = path.join(REPO, 'docs', 'research', 'packs', 'relink-summary.json');
const JSX = 'tools/packs/relink.jsx';

export const relinkedPath = (slug) => path.posix.join(packDir(slug), slug + '_relinked.aep');

export function summarize(report) {
  const a = report.acceptance;
  return {
    date: report.date,
    aeVersion: report.after.version,
    replaced: report.replaced ? report.replaced.filter((r) => r.ok).length : null,
    unresolvedBefore: report.plan ? report.plan.unresolved.map((u) => u.name + ' (' + u.reason + ')') : null,
    missingAfter: a.missing.map((m) => m.name),
    external: a.external.length,
    relinkOk: a.relinkOk,
    goldenOk: a.goldenOk,
    usedFonts: report.after.fonts.used.map((f) => f.postScriptName + ' ' + f.version + (f.isSubstitute ? ' SUBSTITUTE' : '')),
    missingOrSubstitutedFonts: report.after.fonts.missingOrSubstituted.map((f) => f.postScriptName),
    suspiciousFonts: a.suspiciousFonts,
    expressionEngine: report.after.engine,
    notes: report.notes,
  };
}

async function relinkOne(slug, { reportOnly, note }) {
  const dir = packDir(slug);
  const mapDoc = JSON.parse(readFileSync(path.posix.join(dir, 'relink-map.json'), 'utf8'));
  const target = relinkedPath(slug);
  const reportFile = path.posix.join(dir, REPORT);
  const old = existsSync(reportFile) ? JSON.parse(readFileSync(reportFile, 'utf8')) : null;
  let scan = null;
  let plan = null;
  let after;
  if (reportOnly) {
    if (!existsSync(target)) throw new Error('NO_RELINKED: ' + target);
    await openProject(target);
    after = await callJsx(JSX, { mode: 'report', expect: target });
  } else {
    if (existsSync(target)) {
      throw new Error('RELINKED_EXISTS: ' + target + ' (use --report-only, or delete it by hand to relink again)');
    }
    const opened = await openProject(mapDoc.aep);
    const converted = opened.converted ? opened.fingerprint : null;
    scan = await callJsx(JSX, { mode: 'scan', expect: mapDoc.aep, converted });
    const foot = path.posix.join(dir, '(Footage)');
    const files = existsSync(foot) ? walkFiles(foot).map((r) => path.posix.join(foot, r)) : [];
    plan = resolveFootage(scan.footage, { packDir: dir, map: mapDoc.map, files });
    try {
      after = await callJsx(JSX, { mode: 'apply', expect: mapDoc.aep, converted, replace: plan.replace, saveAs: target },
        { timeoutMs: 600000 });
    } catch (e) {
      if (/CDP_TIMEOUT/.test(e.message)) {
        e.message += '\nDo not run the relink again. Close any dialog in AE; if ' + target +
          ' exists, run: node tools/packs/relink.mjs --slug ' + slug + ' --report-only';
      }
      throw e;
    }
    if (!sameProjectFile(after.saved, target)) throw new Error('SAVE_FAILED: AE reports "' + after.saved + '"');
  }
  const report = {
    slug,
    date: new Date().toISOString().slice(0, 10),
    copy: mapDoc.aep,
    relinked: target,
    before: scan ? scan.footage : (old && old.before) || null,
    plan: plan || (old && old.plan) || null,
    replaced: after.replaced || (old && old.replaced) || null,
    after,
    acceptance: acceptance(after, { packDir: dir, knownMissing: KNOWN_MISSING[slug] || [] }),
    notes: ((old && old.notes) || []).concat(note ? [note] : []),
  };
  writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n', 'utf8');
  return report;
}

export function mergeSummary(file, slug, line) {
  const all = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  all[slug] = line;
  const sorted = Object.fromEntries(Object.keys(all).sort().map((k) => [k, all[k]]));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
  return sorted;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const val = (flag) => { const i = argv.indexOf(flag); return i === -1 ? undefined : argv[i + 1]; };
  const slugs = argv.includes('--all') ? SLUGS : [val('--slug')];
  if (!slugs[0]) {
    console.error('usage: node tools/packs/relink.mjs --all | --slug <' + SLUGS.join('|') + '> [--report-only] [--note "<text>"]');
    process.exit(2);
  }
  // exitCode, not process.exit(): exiting while the CDP socket closes crashes libuv on Windows
  process.exitCode = 0;
  for (const slug of slugs) {
    if (argv.includes('--all') && !existsSync(path.posix.join(packDir(slug), 'relink-map.json'))) {
      console.log(`${slug}: no pack copy yet, skipped (Task 2)`);
      continue;
    }
    if (argv.includes('--all') && !argv.includes('--report-only') && existsSync(relinkedPath(slug))) {
      console.log(`${slug}: already relinked, skipped (use --slug ${slug} --report-only to re-read it)`);
      continue;
    }
    try {
      const r = await relinkOne(slug, { reportOnly: argv.includes('--report-only'), note: val('--note') });
      const line = summarize(r);
      mergeSummary(SUMMARY, slug, line);
      console.log(`${slug}: replaced ${line.replaced ?? '-'}, missing after ${line.missingAfter.length}, ` +
        `external ${line.external}, relinkOk ${line.relinkOk}, goldenOk ${line.goldenOk}, fonts ${line.usedFonts.join('; ') || '-'}`);
      if (!line.relinkOk) process.exitCode = 1;
    } catch (e) {
      console.error(`${slug}: ERROR ${e.message}`);
      process.exitCode = 1;
      break; // stop the batch: the next pack must not open on top of a problem
    }
  }
}
```

- [ ] **Step 7: Создать JSX: состояние, открытие и закрытие проекта**

`tools/packs/jsx/project-state.jsx`:

```js
// Cheap read: which project is open in AE and whether it has unsaved changes.
// Project.dirty: AE 17.5+ (https://ae-scripting.docsforadobe.dev/general/project/#projectdirty)
var state = {
  ok: true,
  file: app.project.file ? app.project.file.fsName : null,
  dirty: app.project.dirty,
  version: String(app.version)
};
JSON.stringify(state);
```

`tools/packs/jsx/open-project.jsx`:

```js
// Open PARAMS.path in AE. Refuses when the open project has unsaved changes: app.open would ask
// to save, and that modal blocks the bridge. Never closes or discards anything itself.
// app.open: https://ae-scripting.docsforadobe.dev/general/application/#appopen
// beginSuppressDialogs only hides SCRIPT error dialogs; a "files are missing" warning may still
// appear on open. Then the call times out and a person closes the dialog (see openProject).
var out = { ok: false };
try {
  if (app.project.dirty) {
    out.error = 'AE_DIRTY';
    out.detail = app.project.file ? app.project.file.fsName : 'untitled';
  } else {
    var f = new File(PARAMS.path);
    if (!f.exists) {
      out.error = 'NO_FILE';
      out.detail = PARAMS.path;
    } else {
      app.beginSuppressDialogs();
      try {
        app.open(f);
      } finally {
        app.endSuppressDialogs(false);
      }
      out.ok = true;
      out.file = app.project.file ? app.project.file.fsName : null;
      out.dirty = app.project.dirty;
      // A project saved by an older AE opens as an untitled converted project (AE 26.5): no file
      // yet, so Node gets a fingerprint to recognise it in the next calls.
      out.converted = out.file === null;
      out.fingerprint = {
        items: app.project.numItems,
        first: app.project.numItems > 0 ? app.project.item(1).name : null
      };
    }
  }
} catch (e) {
  out.error = 'EXC';
  out.detail = String(e) + ' (line ' + e.line + ')';
}
JSON.stringify(out);
```

`tools/packs/jsx/close-project.jsx`:

```js
// Close the open project WITHOUT saving, but only if it is PARAMS.expect: one of our working
// copies under C:/CRBK, whose only edits are our own (preview resolution set by the golden render).
// Project.close: https://ae-scripting.docsforadobe.dev/general/project/#projectclose
var out = { ok: false };
try {
  var cur = app.project.file ? app.project.file.fsName.replace(/\\/g, '/') : '';
  var want = String(PARAMS.expect).replace(/\\/g, '/');
  if (cur.toLowerCase() !== want.toLowerCase()) {
    out.error = 'NOT_EXPECTED_PROJECT';
    out.detail = cur;
  } else {
    app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
    out.ok = true;
  }
} catch (e) {
  out.error = 'EXC';
  out.detail = String(e) + ' (line ' + e.line + ')';
}
JSON.stringify(out);
```

- [ ] **Step 8: Создать `tools/packs/relink.jsx`**

```js
// Relink one pack copy in AE (Plan 2, Task 3). PARAMS:
//   expect  the copy that must be open (AE may call an older-version project "<name> (converted).aep")
//   mode    'scan'   list every file footage item with its current or missing path
//           'apply'  replace PARAMS.replace = [{ id, name, path }], Save As PARAMS.saveAs, then report
//           'report' footage + fonts of the open project, no changes
// Docs: FootageItem.replace  https://ae-scripting.docsforadobe.dev/item/footageitem/#footageitemreplace
//       missingFootagePath   https://ae-scripting.docsforadobe.dev/sources/filesource/#filesourcemissingfootagepath
//       app.fonts (AE 24.0+) https://ae-scripting.docsforadobe.dev/text/fontsobject/
//       usedFonts (AE 24.5+) https://ae-scripting.docsforadobe.dev/general/project/#projectusedfonts
var out = { ok: false, mode: PARAMS.mode, step: 'init' };

function slashes(p) {
  return String(p).replace(/\\/g, '/');
}

function sameProject(cur, want) {
  if (cur === '' && PARAMS.converted) {
    // Untitled converted project that Node has just opened (AE 26.5): recognised by its fingerprint.
    var fp = PARAMS.converted;
    return app.project.numItems === fp.items && app.project.numItems > 0 && app.project.item(1).name === fp.first;
  }
  var a = slashes(cur).toLowerCase().replace(/ \(converted\)(\.aepx?)$/, '$1');
  return a === slashes(want).toLowerCase();
}

// File footage only: solids are skipped, placeholders are listed (AE counts them as missing).
function fileFootage() {
  var list = [];
  for (var i = 1; i <= app.project.numItems; i++) {
    var it = app.project.item(i);
    if (!(it instanceof FootageItem)) {
      continue;
    }
    var src = it.mainSource;
    var placeholder = src instanceof PlaceholderSource;
    if (!placeholder && !(src instanceof FileSource)) {
      continue;
    }
    var row = { id: it.id, name: it.name, missing: it.footageMissing, placeholder: placeholder, path: null };
    if (!placeholder) {
      if (it.footageMissing) {
        row.path = src.missingFootagePath;
      } else if (it.file) {
        row.path = it.file.fsName;
      }
    }
    list.push(row);
  }
  return list;
}

function fontRow(f) {
  return {
    postScriptName: f.postScriptName,
    familyName: f.familyName,
    styleName: f.styleName,
    version: f.version,
    location: f.location,
    isSubstitute: f.isSubstitute
  };
}

function fontReport() {
  var r = { missingOrSubstituted: [], used: [] };
  var i;
  if (app.fonts && app.fonts.missingOrSubstitutedFonts) {
    var ms = app.fonts.missingOrSubstitutedFonts;
    for (i = 0; i < ms.length; i++) {
      r.missingOrSubstituted.push(fontRow(ms[i]));
    }
  }
  var used = app.project.usedFonts;
  if (used) {
    for (i = 0; i < used.length; i++) {
      var row = fontRow(used[i].font);
      row.uses = used[i].usedAt ? used[i].usedAt.length : 0;
      r.used.push(row);
    }
  }
  return r;
}

function replaceAll(jobs) {
  var done = [];
  app.beginUndoGroup('BK relink');
  try {
    for (var k = 0; k < jobs.length; k++) {
      var job = jobs[k];
      var rec = { id: job.id, before: job.name, ok: false };
      try {
        var item = app.project.itemByID(job.id);
        var nf = new File(job.path);
        if (!item || item.name !== job.name) {
          rec.error = 'ITEM_CHANGED';
        } else if (!nf.exists) {
          rec.error = 'NO_FILE';
        } else {
          item.replace(nf);
          rec.ok = !item.footageMissing;
          rec.after = item.name;
          rec.path = item.file ? item.file.fsName : null;
        }
      } catch (e1) {
        rec.error = 'EXC: ' + String(e1);
      }
      done.push(rec);
    }
  } finally {
    app.endUndoGroup();
  }
  return done;
}

function describeProject() {
  out.footage = fileFootage();
  out.fonts = fontReport();
  out.engine = app.project.expressionEngine;
  out.bitsPerChannel = app.project.bitsPerChannel;
  out.workingSpace = app.project.workingSpace;
  out.version = String(app.version);
}

try {
  out.step = 'check project';
  var cur = app.project.file ? app.project.file.fsName : '';
  out.file = cur;
  if (!sameProject(cur, PARAMS.expect)) {
    out.error = 'NOT_EXPECTED_PROJECT';
    out.detail = cur;
  } else if (PARAMS.mode === 'scan') {
    out.step = 'scan';
    out.footage = fileFootage();
    out.ok = true;
  } else if (PARAMS.mode === 'apply') {
    out.step = 'replace';
    out.replaced = replaceAll(PARAMS.replace);
    out.step = 'save';
    app.beginSuppressDialogs();
    try {
      app.project.save(new File(PARAMS.saveAs));
    } finally {
      app.endSuppressDialogs(false);
    }
    out.saved = app.project.file ? app.project.file.fsName : null;
    out.step = 'report';
    describeProject();
    out.ok = true;
  } else if (PARAMS.mode === 'report') {
    out.step = 'report';
    describeProject();
    out.ok = true;
  } else {
    out.error = 'BAD_MODE';
  }
} catch (e) {
  out.error = 'EXC';
  out.detail = String(e) + ' (line ' + e.line + ', step ' + out.step + ')';
}
JSON.stringify(out);
```

- [ ] **Step 9: Запустить тесты и линтер**

Run: `npx vitest run tests/packs && node tools/jsx/lint-jsx.cjs tools/packs/jsx/project-state.jsx tools/packs/jsx/open-project.jsx tools/packs/jsx/close-project.jsx tools/packs/relink.jsx`
Expected: `37 passed`; четыре строки `OK    tools/packs/...jsx`.

- [ ] **Step 10: Подготовить AE**

1. Открыт After Effects 2026 (26.5) и панель BrandKit Dev (план 1, задача 4).
2. В AE нет несохранённых изменений: сохранить или закрыть свой проект.

Run: `node tools/host-run.mjs --host ae "@tools/packs/jsx/project-state.jsx"`
Expected: `{ "ok": true, "file": ..., "dirty": false, "version": "26.5..." }`.

- [ ] **Step 11: Перелинковать первый пакет без футажа**

Run: `node tools/packs/relink.mjs --slug logo`
Expected: `logo: replaced 0, missing after 0, external 0, relinkOk true, goldenOk true, fonts SBSansDisplay-…`. В `fonts` только SB Sans и нет пометки `SUBSTITUTE`. Появился файл `C:/CRBK/packs/logo/logo_relinked.aep`.

- [ ] **Step 12: Перелинковать вебинары**

Run: `node tools/packs/relink.mjs --slug webinars`
Expected: `webinars: replaced 2, missing after 0, external 0, relinkOk true, goldenOk true, fonts …`.

Если AE не нашёл файлы сам, `replaced` будет больше (до 6), но `missing after` всё равно 0. Если команда упала с `CDP_TIMEOUT` на открытии, нужен шаг 13.

- [ ] **Step 13: Диалог при открытии (вручную, только если был `CDP_TIMEOUT`)**

1. Посмотреть в окно AE: обычно это предупреждение о пропавших файлах или шрифтах.
2. Прочитать текст и нажать OK. Не нажимать «Найти» и не открывать файлы: замены сделает скрипт.
3. Запустить ту же команду с заметкой. Она продолжит с уже открытого проекта:

Run: `node tools/packs/relink.mjs --slug webinars --note "AE при открытии: <текст окна>, нажат OK"`
Expected: как в шаге 12; заметка попадает в `notes` отчёта и сводки.

Если таймаут случился на шаге `apply` (сохранение), команду не повторять. Закрыть диалог; если файл `<slug>_relinked.aep` появился, выполнить `node tools/packs/relink.mjs --slug <slug> --report-only`.

- [ ] **Step 14: Перелинковать остальные пакеты**

Run: `node tools/packs/relink.mjs --all`
Expected (порядок `SLUGS`; уже готовые пакеты пропускаются):
```text
logo: already relinked, skipped (use --slug logo --report-only to re-read it)
logo_conv: replaced 0, missing after 0, external 0, relinkOk true, goldenOk true, fonts …
titles: replaced 0, missing after 0, external 0, relinkOk true, goldenOk true, fonts …
titles_conv: replaced 0, missing after 0, external 0, relinkOk true, goldenOk true, fonts …
webinars: already relinked, skipped (use --slug webinars --report-only to re-read it)
courses: replaced 0, missing after 0, external 0, relinkOk true, goldenOk true, fonts …
courses_conv: replaced 3, missing after 4, external 0, relinkOk true, goldenOk false, fonts …
smm: replaced 0, missing after 0, external 0, relinkOk true, goldenOk true, fonts …
podcast: replaced 0, missing after 0, external 0, relinkOk true, goldenOk true, fonts …
```
Код выхода 0. `replaced` у пакетов с Mac может быть больше нуля (см. шаг 12); значимы `missing after` и `relinkOk`. Если у какого-то пакета `relinkOk false`, команда завершится с кодом 1. Тогда в `C:/CRBK/packs/<slug>/relink-report.json` смотреть `plan.unresolved` и `acceptance.unexpectedMissing`. Диалоги при открытии — как в шаге 13.

- [ ] **Step 15: Проверить сводку и шрифты**

Run: `node -e "const s=require('./docs/research/packs/relink-summary.json'); for (const k in s) console.log(k, 'missing', s[k].missingAfter.length, 'golden', s[k].goldenOk, '|', s[k].usedFonts.join('; '))"`
Expected:
- 9 строк;
- `golden false` только у `courses_conv` (`missing 4`);
- в шрифтах SB Sans (`SBSansDisplay-*`, `SBSansText-Regular`) без пометки `SUBSTITUTE`; поле `suspiciousFonts` в сводке пустое. Про `TimesNewRomanPSMT` — ниже.

Версии шрифтов (1.000 / 1.002 / 1.003) нужны для выбора эталонной сборки (§8.1).

Спецификация (§2) спрашивает про Times New Roman в converted-файлах: настоящее это использование или запись запасного шрифта. Ответ — в `usedFonts`:
- `TimesNewRomanPSMT` в `usedFonts` есть — это настоящее использование. Записать: `node tools/packs/relink.mjs --slug <slug> --report-only --note "Times New Roman используется в тексте"`;
- нет — это была только запись запасного шрифта.

- [ ] **Step 16: Проверить одну копию глазами (вручную)**

1. В AE: File → Open Project → `C:\CRBK\packs\webinars\webinars_relinked.aep`. Если AE спросит о сохранении текущего проекта, посмотреть его имя в заголовке окна: копия из `C:\CRBK\packs` — Don't Save, любой другой проект — Cancel и разобраться.
2. В панели Project у `AI_robot_arm_A_1440p24.mp4` и `AI_robot_arm_B_1440p24.mp4` обычные превью, нет цветных полос.
3. Открыть композицию «Заставка с вижуалом», подвигать время: в окне играет ролик с рукой-роботом.
4. Закрыть проект без сохранения: File → Close Project → Don't Save.
5. Записать результат: `node tools/packs/relink.mjs --slug webinars --report-only --note "проверено вручную: превью роликов на месте, ролик играет"`.

- [ ] **Step 17: Commit**

```bash
git add tools/packs/jsx-call.mjs tools/packs/ae-project.mjs tools/packs/relink-resolve.mjs tools/packs/relink.mjs tools/packs/jsx/project-state.jsx tools/packs/jsx/open-project.jsx tools/packs/jsx/close-project.jsx tools/packs/relink.jsx tests/packs/relink-resolve.test.mjs tests/packs/ae-project.test.mjs docs/research/packs/relink-summary.json
git commit -m "feat(packs): relink pack copies in AE and report missing footage and fonts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: ROOT-композиции и ключевые моменты

**Files:**
- Create: `tools/golden/keytimes.mjs`, `tools/golden/roots.jsx`, `tools/golden/roots.mjs`
- Test: `tests/golden/keytimes.test.mjs`, `tests/golden/roots.test.mjs`
- Create (результат прогона): `docs/research/golden/roots/<slug>.json` (9 файлов)

ROOT-композиция — та, которую ни одна композиция не использует слоем: `AVItem.usedIn` пуст (<https://ae-scripting.docsforadobe.dev/item/avitem/#avitemusedin>). Ссылки из выражений (`comp("…")`) использованием не считаются. Сироты прошлых выпусков подкаста тоже ROOT; их эталон не мешает.

Ключевые моменты:
- каждые 0,25 с первые 15 с;
- затем каждые 5 с до 60 с;
- каждый маркер и конец маркера с длительностью;
- последние 2 с с шагом 0,25 с от конца;
- последний кадр.

Все моменты приводятся к кадрам (`round(t × fps)`), повторы убираются, и ни один не выходит за последний кадр: `saveFrameToPng` за концом молча отдаёт последний кадр (ae-quirks #56). Имя файла — `t<ms>.png`, где `ms = round(кадр / fps × 1000)`. Для 25 fps это 41 кадр у 10-секундной композиции, 72 у 30-секундной, 78 у минутной и 79 у любой длиннее минуты (без маркеров).

`compSlug` уникален среди всех композиций проекта по возрастанию id. JSX-дампы (задача 6) считают его тем же `compSlugs()` из `tools/packs/slug.mjs` по всем композициям проекта, поэтому файл дампа `<compSlug>.json` и папка эталона `<compSlug>/` одной композиции называются одинаково (`slugMap` в `roots.json` — та же таблица).

- [ ] **Step 1: Написать падающий тест `tests/golden/keytimes.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { keyFrames } from '../../tools/golden/keytimes.mjs';

const fr = (list) => list.map((k) => k.f);

describe('keyFrames', () => {
  it('samples a 10 s comp at 25 fps every 0.25 s and ends on the last frame', () => {
    const k = keyFrames({ duration: 10, fps: 25 });
    expect(k).toHaveLength(41);
    expect(fr(k).slice(0, 5)).toEqual([0, 6, 13, 19, 25]);
    expect(k[k.length - 1]).toEqual({ f: 249, ms: 9960 });
  });
  it('switches to 5 s steps after 15 s and stops them at 60 s', () => {
    const k = keyFrames({ duration: 60, fps: 25 });
    expect(k).toHaveLength(78);
    expect(fr(k)).toContain(375); // 15 s
    expect(fr(k)).toContain(1375); // 55 s
    expect(fr(k).slice(-9)).toEqual([1450, 1456, 1463, 1469, 1475, 1481, 1488, 1494, 1499]);
  });
  it('covers the first minute and the last 2 s of a one-hour overlay', () => {
    const k = keyFrames({ duration: 3600, fps: 25 });
    expect(k).toHaveLength(79);
    expect(fr(k)).toContain(1500); // 60 s
    expect(k[k.length - 1]).toEqual({ f: 89999, ms: 3599960 });
  });
  it('adds marker times and the ends of marker ranges, frame-aligned and deduplicated', () => {
    const k = keyFrames({ duration: 10, fps: 25, markers: [{ time: 3.3, duration: 0 }, { time: 9, duration: 1 }, { time: 0.5, duration: 0 }] });
    expect(k).toHaveLength(42); // 3.3 s = frame 83 is new; 9 s, 10 s and 0.5 s are already there
    expect(fr(k)).toContain(83);
  });
  it('handles a transition shorter than 2 s at 24 fps', () => {
    expect(fr(keyFrames({ duration: 0.875, fps: 24 }))).toEqual([0, 3, 6, 9, 12, 15, 18, 20]);
  });
  it('names frames in whole milliseconds at 29.97 fps', () => {
    const k = keyFrames({ duration: 1, fps: 30000 / 1001 });
    expect(k[1]).toEqual({ f: 7, ms: 234 });
  });
  it('rejects a comp without timing', () => {
    expect(() => keyFrames({ duration: 0, fps: 25 })).toThrow(/bad comp timing/);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run tests/golden/keytimes.test.mjs`
Expected: FAIL — `Cannot find module '../../tools/golden/keytimes.mjs'`.

- [ ] **Step 3: Создать `tools/golden/keytimes.mjs`**

```js
// Key times of a golden render (Plan 2, Task 4): every 0.25 s for the first 15 s, then every 5 s up
// to 60 s, every marker (and the end of a marker with a duration), and the last 2 s in 0.25 s steps
// counted back from the end, plus the very last frame. Frame-aligned (frame = round(t * fps)),
// deduplicated, sorted, never past the last frame: saveFrameToPng past the end silently returns
// the last frame (ae-quirks #56). ms = round(frame / fps * 1000) names the PNG: t<ms>.png.
export const RULE = '0.25 s to 15 s; 5 s to 60 s; markers; last 2 s by 0.25 s; last frame';

export function keyFrames({ duration, fps, markers = [] }) {
  if (!(fps > 0) || !(duration > 0)) throw new Error(`bad comp timing: ${duration} s at ${fps} fps`);
  const last = Math.max(0, Math.round(duration * fps) - 1);
  const times = [];
  for (let k = 0; k * 0.25 < Math.min(15, duration); k += 1) times.push(k * 0.25);
  for (let s = 15; s <= 60 && s < duration; s += 5) times.push(s);
  for (const m of markers) {
    times.push(m.time);
    if (m.duration > 0) times.push(m.time + m.duration);
  }
  for (let k = 0; k <= 8; k += 1) times.push(duration - 2 + k * 0.25);
  const frames = new Set([last]);
  for (const t of times) {
    if (t < 0 || t > duration + 1e-9) continue;
    frames.add(Math.min(Math.round(t * fps), last));
  }
  return [...frames].sort((a, b) => a - b).map((f) => ({ f, ms: Math.round((f / fps) * 1000) }));
}
```

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/golden/keytimes.test.mjs`
Expected: `7 passed`.

- [ ] **Step 5: Написать падающий тест `tests/golden/roots.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { pickRoots, rootsFile } from '../../tools/golden/roots.mjs';

const comp = (id, name, usedIn = [], extra = {}) => ({
  id, name, usedIn, width: 3840, height: 2160, fps: 25, duration: 10, markers: [], ...extra,
});

describe('pickRoots', () => {
  it('keeps comps nobody uses as a layer source, with slugs unique over all comps', () => {
    const { roots, slugMap } = pickRoots([
      comp(304, 'Pattern_1', [691]),
      comp(691, 'Заставка_ПОДКАСТ_CLOUD.RU'),
      comp(796, 'Pattern_1'),
      comp(459, 'Подкаст'),
    ]);
    expect(roots.map((r) => [r.id, r.compSlug])).toEqual([[796, 'pattern_1_2'], [459, 'podkast'], [691, 'zastavka_podkast_cloud_ru']]);
    expect(roots[0].keyFrames).toBe(41);
    expect(slugMap.map((s) => [s.id, s.compSlug, s.root])).toEqual([
      [304, 'pattern_1', false], [459, 'podkast', true], [691, 'zastavka_podkast_cloud_ru', true], [796, 'pattern_1_2', true],
    ]);
  });
  it('writes roots.json under the ASCII work folder', () => {
    expect(rootsFile('podcast')).toMatch(/\/golden\/podcast\/roots\.json$/);
  });
});
```

- [ ] **Step 6: Убедиться, что тест падает**

Run: `npx vitest run tests/golden/roots.test.mjs`
Expected: FAIL — `Cannot find module '../../tools/golden/roots.mjs'`.

- [ ] **Step 7: Создать `tools/golden/roots.jsx`**

```js
// Read-only inventory of every comp in the open project (Plan 2, Task 4): size, fps, duration,
// markers and the comps that use it as a layer source. ROOT comps are those with usedIn empty.
// AVItem.usedIn: https://ae-scripting.docsforadobe.dev/item/avitem/#avitemusedin
// CompItem.markerProperty (AE 14.0+): https://ae-scripting.docsforadobe.dev/item/compitem/#compitemmarkerproperty
// MarkerValue.protectedRegion (AE 16.0+): https://ae-scripting.docsforadobe.dev/other/markervalue/
// All times are comp times from 0 (displayStartTime is reported, never added).
var out = { ok: false };

function slashes(p) {
  return String(p).replace(/\\/g, '/');
}

function folderPath(it, rootId) {
  var names = [];
  var f = it.parentFolder;
  while (f && f.id !== rootId) {
    names.unshift(f.name);
    f = f.parentFolder;
  }
  return names.join('/');
}

function usedInIds(it) {
  var ids = [];
  var u = it.usedIn;
  for (var i = 0; i < u.length; i++) {
    ids.push(u[i].id);
  }
  return ids;
}

function markers(comp) {
  var list = [];
  var mp = comp.markerProperty;
  if (!mp) {
    return list;
  }
  for (var i = 1; i <= mp.numKeys; i++) {
    var mv = mp.keyValue(i);
    list.push({ time: mp.keyTime(i), duration: mv.duration, comment: mv.comment, protectedRegion: mv.protectedRegion === true });
  }
  return list;
}

try {
  var cur = app.project.file ? app.project.file.fsName : '';
  if (slashes(cur).toLowerCase() !== slashes(PARAMS.expect).toLowerCase()) {
    out.error = 'NOT_EXPECTED_PROJECT';
    out.detail = cur;
  } else {
    var rootId = app.project.rootFolder.id;
    var comps = [];
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      if (!(it instanceof CompItem)) {
        continue;
      }
      comps.push({
        id: it.id,
        name: it.name,
        folder: folderPath(it, rootId),
        width: it.width,
        height: it.height,
        pixelAspect: it.pixelAspect,
        fps: it.frameRate,
        frameDuration: it.frameDuration,
        duration: it.duration,
        displayStartTime: it.displayStartTime,
        workAreaStart: it.workAreaStart,
        workAreaDuration: it.workAreaDuration,
        numLayers: it.numLayers,
        renderer: it.renderer,
        resolutionFactor: [it.resolutionFactor[0], it.resolutionFactor[1]],
        usedIn: usedInIds(it),
        markers: markers(it)
      });
    }
    out.comps = comps;
    out.file = cur;
    out.version = String(app.version);
    out.ok = true;
  }
} catch (e) {
  out.error = 'EXC';
  out.detail = String(e) + ' (line ' + e.line + ')';
}
JSON.stringify(out);
```

- [ ] **Step 8: Создать `tools/golden/roots.mjs`**

```js
#!/usr/bin/env node
// ROOT comps of every relinked pack (Plan 2, Task 4): comps no other comp uses as a layer source.
//   node tools/golden/roots.mjs --all | --slug podcast [--force]
// Writes <work>/golden/<slug>/roots.json and a copy in docs/research/golden/roots/<slug>.json.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workPath, ensureDir } from '../lib/work.mjs';
import { compSlugs } from '../packs/slug.mjs';
import { SLUGS } from '../packs/packs.mjs';
import { callJsx, REPO } from '../packs/jsx-call.mjs';
import { openProject } from '../packs/ae-project.mjs';
import { relinkedPath } from '../packs/relink.mjs';
import { keyFrames } from './keytimes.mjs';

export const rootsFile = (slug) => workPath('golden', slug, 'roots.json');
export const repoRootsFile = (slug) => path.join(REPO, 'docs', 'research', 'golden', 'roots', slug + '.json');

// comps: rows from roots.jsx. Slugs are unique over ALL comps (ascending id), roots sorted by slug.
export function pickRoots(comps) {
  const slugs = compSlugs(comps);
  const slugMap = [...comps].sort((a, b) => a.id - b.id).map((c) => ({
    id: c.id, name: c.name, compSlug: slugs.get(c.id), root: c.usedIn.length === 0, usedIn: c.usedIn,
  }));
  const roots = comps.filter((c) => c.usedIn.length === 0)
    .map((c) => ({ ...c, compSlug: slugs.get(c.id), keyFrames: keyFrames(c).length }))
    .sort((a, b) => (a.compSlug < b.compSlug ? -1 : 1));
  return { roots, slugMap };
}

async function rootsOne(slug) {
  const project = relinkedPath(slug);
  if (!existsSync(project)) throw new Error('NO_RELINKED: ' + project + ' (run tools/packs/relink.mjs first)');
  const opened = await openProject(project);
  const r = await callJsx('tools/golden/roots.jsx', { expect: project }, { timeoutMs: 300000 });
  const { roots, slugMap } = pickRoots(r.comps);
  const doc = { slug, project, aeVersion: r.version || opened.version, date: new Date().toISOString().slice(0, 10), roots, slugMap };
  const body = JSON.stringify(doc, null, 2) + '\n';
  ensureDir(path.posix.dirname(rootsFile(slug)));
  writeFileSync(rootsFile(slug), body, 'utf8');
  mkdirSync(path.dirname(repoRootsFile(slug)), { recursive: true });
  writeFileSync(repoRootsFile(slug), body, 'utf8');
  return doc;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const val = (flag) => { const i = argv.indexOf(flag); return i === -1 ? undefined : argv[i + 1]; };
  const slugs = argv.includes('--all') ? SLUGS : [val('--slug')];
  if (!slugs[0]) {
    console.error('usage: node tools/golden/roots.mjs --all | --slug <' + SLUGS.join('|') + '> [--force]');
    process.exit(2);
  }
  for (const slug of slugs) {
    if (existsSync(rootsFile(slug)) && !argv.includes('--force')) {
      console.log(`${slug}: roots.json exists, skipped (--force to redo)`);
      continue;
    }
    if (argv.includes('--all') && !existsSync(relinkedPath(slug))) {
      console.log(`${slug}: no relinked copy yet, skipped`);
      continue;
    }
    try {
      const d = await rootsOne(slug);
      const frames = d.roots.reduce((s, c) => s + c.keyFrames, 0);
      console.log(`${slug}: ${d.slugMap.length} comps, ${d.roots.length} ROOT, ${frames} key frames -> ${rootsFile(slug)}`);
    } catch (e) {
      console.error(`${slug}: ERROR ${e.message}`);
      process.exitCode = 1; // not process.exit(): see tools/packs/relink.mjs
      break;
    }
  }
}
```

- [ ] **Step 9: Запустить тесты и линтер**

Run: `npx vitest run tests/golden && node tools/jsx/lint-jsx.cjs tools/golden/roots.jsx`
Expected: `9 passed`; `OK    tools/golden/roots.jsx`.

- [ ] **Step 10: Найти ROOT-композиции всех пакетов**

AE подготовлен как в задаче 3, шаг 10.

Run: `node tools/golden/roots.mjs --all`
Expected: 9 строк вида `<slug>: N comps, M ROOT, K key frames -> C:/CRBK/work/golden/<slug>/roots.json`. Сверка с аудитом:
- `webinars: 15 comps, 6 ROOT, 384 key frames` (больше, если в композициях есть маркеры);
- `logo` и `logo_conv` — по 10 композиций, `courses` — 13, `courses_conv` — 19, `smm` — 21.

При открытии `courses_conv` AE может показать окно о четырёх пропавших файлах. Это ожидаемо, действовать как в задаче 3, шаг 13: команда пропускает готовые пакеты.

- [ ] **Step 11: Сверить ROOT вебинаров с аудитом**

Run: `node -e "const r=require('C:/CRBK/work/golden/webinars/roots.json'); for (const c of r.roots) console.log(c.compSlug, c.name, c.width + 'x' + c.height, c.fps, c.duration)"`
Expected: 6 строк — `Анонс_Вебинар_1x1` 1400x1400 25 10, `Анонс_Вебинар_9x16` 1080x1920 25 10, `Заставка с вижуалом` и `Заставка со спикером` 1920x1080 25 30, `Таймер с вижуалом` и `Таймер со спикером` 1920x1080 25 300.

- [ ] **Step 12: Commit**

```bash
git add tools/golden/keytimes.mjs tools/golden/roots.jsx tools/golden/roots.mjs tests/golden/keytimes.test.mjs tests/golden/roots.test.mjs docs/research/golden/roots/logo.json docs/research/golden/roots/logo_conv.json docs/research/golden/roots/titles.json docs/research/golden/roots/titles_conv.json docs/research/golden/roots/webinars.json docs/research/golden/roots/courses.json docs/research/golden/roots/courses_conv.json docs/research/golden/roots/smm.json docs/research/golden/roots/podcast.json
git commit -m "feat(golden): ROOT comps of every pack and frame-aligned key times" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: Эталонные кадры и превью

**Files:**
- Create: `tools/golden/png.mjs`, `tools/golden/aerender.mjs`, `tools/golden/render.jsx`, `tools/golden/preview-rq.jsx`, `tools/golden/render.mjs`
- Test: `tests/golden/png.test.mjs`, `tests/golden/render.test.mjs`
- Create (результат прогона): `docs/research/golden/<slug>.json` (9 файлов), `docs/research/golden/preview-capability.json`

Ловушки и решения:
- **Разрешение кадра.** `saveFrameToPng` (в справочнике его нет, проверен в ae-quirks #27, #34) пишет кадр с разрешением предпросмотра композиции. Поэтому `resolutionFactor` ставится `[1, 1]`. Назад его не возвращают, потому что запись асинхронная; после пакета копия закрывается без сохранения.
- **Асинхронная запись.** Вызов возвращается раньше, чем PNG готов (#27, #40, #50, #99). Node ждёт, пока у каждого файла есть чанк `IEND` и размер не меняется между двумя опросами. Перед рендером старые `t*.png` композиции удаляются: это свои выходы, и чужим остаткам доверять нельзя.
- **Время за концом композиции** — см. задачу 4.
- **Пропавшие файлы.** Пакет рендерится, только если у копии `goldenOk` (0 пропавших и внешних файлов, нет подменённых шрифтов). Перед каждой композицией JSX ещё раз считает пропавшие файлы.
- **Превью.** `renderQueue.render()` по мосту блокирует AE (#33), поэтому превью делает `aerender`. Сторож (#182, #184) считает прогрессом только новый номер кадра; готовые файлы принимаются, даже если процесс завис на финализации; успех определяет ffprobe, а не код выхода.
- **Шаблон Output Module.** Имена шаблонов зависят от языка интерфейса, поэтому шаблон H.264 ищется регулярным выражением. Настройка Render Settings «Resolution: Half» в примерах справочника не показана; проба ставит её и читает назад. Если шаблона H.264 нет или «Half» не встал, превью пропускаются, и причина записывается в `preview-capability.json`.
- **Длинные композиции.** Превью делаются для всех ROOT-композиций (спецификация §3.2). У композиции длиннее 60 с рендерится только первая минута: элемент очереди получает `timeSpanDuration` = 60 с (<https://ae-scripting.docsforadobe.dev/renderqueue/renderqueueitem/#renderqueueitemtimespanduration>). В манифесте у каждого превью есть поле `span` — сколько секунд от начала оно покрывает.
- **Проект для aerender.** Очередь собирается в отдельной копии `<slug>_preview_rq.aep` в рабочей папке. Чужие элементы очереди удаляются только в этой копии; копия `_relinked` не меняется. Справочник: <https://ae-scripting.docsforadobe.dev/renderqueue/outputmodule/>, <https://ae-scripting.docsforadobe.dev/renderqueue/renderqueueitem/>.

- [ ] **Step 1: Написать падающий тест `tests/golden/png.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { pngSize, pngComplete, waitForStableFiles } from '../../tools/golden/png.mjs';

const dir = () => mkdtempSync(path.join(os.tmpdir(), 'bk-png-'));
const pngBytes = (w, h) => PNG.sync.write(new PNG({ width: w, height: h }));

describe('png checks', () => {
  it('reads the size from the IHDR chunk', () => {
    const f = path.join(dir(), 'a.png');
    writeFileSync(f, pngBytes(1920, 1080));
    expect(pngSize(f)).toEqual({ width: 1920, height: 1080 });
  });
  it('rejects a file that is not a PNG', () => {
    const f = path.join(dir(), 'b.png');
    writeFileSync(f, 'not a png at all, just text here');
    expect(() => pngSize(f)).toThrow(/NOT_PNG/);
  });
  it('sees a PNG as complete only with its IEND chunk', () => {
    const d = dir();
    const full = pngBytes(4, 4);
    writeFileSync(path.join(d, 'full.png'), full);
    writeFileSync(path.join(d, 'cut.png'), full.subarray(0, full.length - 6));
    expect(pngComplete(path.join(d, 'full.png'))).toBe(true);
    expect(pngComplete(path.join(d, 'cut.png'))).toBe(false);
    expect(pngComplete(path.join(d, 'none.png'))).toBe(false);
  });
});

describe('waitForStableFiles', () => {
  it('waits until a file that is still being written is complete', async () => {
    const f = path.join(dir(), 'slow.png');
    const bytes = pngBytes(8, 8);
    setTimeout(() => writeFileSync(f, bytes.subarray(0, 20)), 30);
    setTimeout(() => appendFileSync(f, bytes.subarray(20)), 150);
    const sizes = await waitForStableFiles([f], { timeoutMs: 3000, intervalMs: 40 });
    expect(sizes).toEqual([bytes.length]);
  });
  it('times out with the name of a file that never arrives', async () => {
    const f = path.join(dir(), 'never.png');
    await expect(waitForStableFiles([f], { timeoutMs: 200, intervalMs: 40 })).rejects.toThrow(/WAIT_TIMEOUT: 1 of 1 .*never\.png/);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run tests/golden/png.test.mjs`
Expected: FAIL — `Cannot find module '../../tools/golden/png.mjs'`.

- [ ] **Step 3: Создать `tools/golden/png.mjs`**

```js
// PNG checks for golden frames. saveFrameToPng returns before the file is on disk (ae-quirks #27,
// #40, #50, #99): a frame counts only when it ends with the IEND chunk and its size has stopped changing.
import { closeSync, fstatSync, openSync, readSync, statSync } from 'node:fs';

const SIGNATURE = '89504e470d0a1a0a';
const IEND = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

function readAt(file, length, from) {
  const fd = openSync(file, 'r');
  try {
    const size = fstatSync(fd).size;
    const buf = Buffer.alloc(length);
    const pos = from === 'end' ? size - length : from;
    if (pos < 0) return null;
    readSync(fd, buf, 0, length, pos);
    return buf;
  } finally {
    closeSync(fd);
  }
}

export function pngSize(file) {
  const b = readAt(file, 24, 0);
  if (!b || b.subarray(0, 8).toString('hex') !== SIGNATURE || b.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('NOT_PNG: ' + file);
  }
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

export function pngComplete(file) {
  try {
    const tail = readAt(file, 12, 'end');
    return Boolean(tail) && tail.equals(IEND);
  } catch {
    return false; // not there yet, or still locked by the writer
  }
}

const sizeOf = (f) => { try { return statSync(f).size; } catch { return -1; } };

// Resolves when every file is complete and kept its size between two polls. Never re-reads a
// half-written file as done (quirk #50). onProgress(doneCount, total) is called on every poll.
export async function waitForStableFiles(files, { timeoutMs = 600000, intervalMs = 2000, complete = pngComplete, onProgress } = {}) {
  const start = Date.now();
  let prev = null;
  for (;;) {
    const sizes = files.map(sizeOf);
    const done = files.map((f, i) => sizes[i] > 0 && prev !== null && sizes[i] === prev[i] && complete(f));
    const n = done.filter(Boolean).length;
    if (onProgress) onProgress(n, files.length);
    if (n === files.length) return sizes;
    if (Date.now() - start > timeoutMs) {
      const pending = files.filter((f, i) => !done[i]);
      throw new Error(`WAIT_TIMEOUT: ${pending.length} of ${files.length} file(s) not complete after ${timeoutMs} ms, first: ${pending[0]}`);
    }
    prev = sizes;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
```

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/golden/png.test.mjs`
Expected: `5 passed`.

- [ ] **Step 5: Написать падающий тест `tests/golden/render.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { framePlan, compDone, gateReason, previewItems, orderManifest } from '../../tools/golden/render.mjs';
import { lastProgress, previewOk, runWatched, aerenderPath } from '../../tools/golden/aerender.mjs';

const root = { id: 691, name: 'Заставка', compSlug: 'zastavka', width: 3840, height: 2160, fps: 25, duration: 7, markers: [] };

describe('golden plan', () => {
  it('names every key frame t<ms>.png in the comp folder', () => {
    const plan = framePlan('podcast', root);
    expect(plan[1]).toMatchObject({ f: 6, ms: 240 });
    expect(plan[1].file).toMatch(/\/golden\/podcast\/zastavka\/t240\.png$/);
    expect(plan[plan.length - 1]).toMatchObject({ f: 174, ms: 6960 });
  });
  it('treats a comp as done only when every listed PNG is there with its size', () => {
    const d = mkdtempSync(path.join(os.tmpdir(), 'bk-done-'));
    const plan = [{ f: 0, ms: 0, file: path.join(d, 't0.png') }, { f: 6, ms: 240, file: path.join(d, 't240.png') }];
    writeFileSync(plan[0].file, 'aaaa');
    writeFileSync(plan[1].file, 'bbbbbb');
    const entry = { frames: [{ ms: 0, bytes: 4 }, { ms: 240, bytes: 6 }] };
    expect(compDone(entry, plan)).toBe(true);
    expect(compDone({ frames: [{ ms: 0, bytes: 4 }, { ms: 240, bytes: 7 }] }, plan)).toBe(false);
    expect(compDone({ frames: [{ ms: 0, bytes: 4 }] }, plan)).toBe(false);
    expect(compDone(undefined, plan)).toBe(false);
  });
  it('explains why a pack is not rendered', () => {
    expect(gateReason({ goldenOk: true })).toBe(null);
    expect(gateReason({
      goldenOk: false, missing: [{ name: '3D.png' }, { name: 'slide_01.png' }], external: [], usedSubstitutes: [], suspiciousFonts: [],
    })).toBe('missing footage: 3D.png, slide_01.png');
  });
  it('writes manifest keys in a fixed, readable order', () => {
    expect(Object.keys(orderManifest({ comps: [], extra: 1, slug: 'logo', status: 'ok', date: 'd' })))
      .toEqual(['slug', 'status', 'date', 'comps', 'extra']);
  });
  it('queues a preview of every ROOT comp, only the first 60 s of a longer one', () => {
    const items = previewItems('courses', [root, { ...root, id: 5, compSlug: 'overley_16_na_9', duration: 3600 }]);
    expect(items.map((it) => [it.id, it.span])).toEqual([[691, 7], [5, 60]]);
    expect(items[0].out).toMatch(/\/golden\/courses\/zastavka\/preview_half\.mp4$/);
    expect(items[1].out).toMatch(/\/golden\/courses\/overley_16_na_9\/preview_half\.mp4$/);
    expect(previewOk({ width: 1920, height: 1080, duration: 60 }, { ...root, duration: items[1].span })).toBe(true);
  });
});

describe('aerender helpers', () => {
  it('reads the last frame number from aerender progress lines', () => {
    expect(lastProgress('PROGRESS:  0:00:00:05 (6): 0 Seconds\nPROGRESS:  0:00:00:06 (7): 1 Seconds\n')).toBe('0:00:00:06#7');
    expect(lastProgress('PROGRESS: Total Time Elapsed: 2 Seconds')).toBe(null);
  });
  it('accepts a preview at half size and full duration only', () => {
    const comp = { width: 3840, height: 2160, fps: 25, duration: 10 };
    expect(previewOk({ width: 1920, height: 1080, duration: 10.0 }, comp)).toBe(true);
    expect(previewOk({ width: 3840, height: 2160, duration: 10.0 }, comp)).toBe(false);
    expect(previewOk({ width: 1920, height: 1080, duration: 9.5 }, comp)).toBe(false);
    expect(previewOk({ width: 406, height: 40, duration: 2 }, { width: 815, height: 80, fps: 25, duration: 2 })).toBe(true);
    expect(previewOk(null, comp)).toBe(false);
  });
  it('defaults to the AE 2026 aerender', () => {
    expect(aerenderPath({}, 'win32')).toBe('C:/Program Files/Adobe/Adobe After Effects 2026/Support Files/aerender.exe');
    expect(aerenderPath({ BRANDKIT_AERENDER: 'X:/ae/aerender.exe' }, 'win32')).toBe('X:/ae/aerender.exe');
  });
});

describe('runWatched', () => {
  const logFile = () => {
    const d = mkdtempSync(path.join(os.tmpdir(), 'bk-ae-'));
    mkdirSync(d, { recursive: true });
    return path.join(d, 'aerender.log');
  };
  const hang = 'console.log("PROGRESS:  0:00:00:01 (1): 0 Seconds"); setInterval(() => {}, 1000);';
  it('kills a render whose frame number stops moving', async () => {
    const r = await runWatched({ exe: process.execPath, args: ['-e', hang], logFile: logFile(), stallMs: 300, pollMs: 50 });
    expect(r.reason).toBe('stall');
  });
  it('accepts finished files from a process that hangs in finalisation', async () => {
    const r = await runWatched({ exe: process.execPath, args: ['-e', hang], logFile: logFile(), isDone: async () => true, pollMs: 50, graceMs: 100 });
    expect(r.reason).toBe('done-but-hanging');
  });
  it('lets a normal render exit on its own', async () => {
    const r = await runWatched({ exe: process.execPath, args: ['-e', 'console.log("PROGRESS:  0:00:00:01 (1): 0 Seconds")'], logFile: logFile(), pollMs: 50 });
    expect(r).toMatchObject({ code: 0, reason: null });
  });
});
```

- [ ] **Step 6: Убедиться, что тест падает**

Run: `npx vitest run tests/golden/render.test.mjs`
Expected: FAIL — `Cannot find module '../../tools/golden/render.mjs'`.

- [ ] **Step 7: Создать `tools/golden/aerender.mjs`**

```js
// aerender out of process (never renderQueue.render() over the bridge, ae-quirks #33) under a
// watchdog (ae-quirks #182, #184): progress = a NEW frame number; a render whose files are complete
// is accepted even if the process hangs in finalisation; success is judged by ffprobe, not exit code.
import { createWriteStream } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';

export function aerenderPath(env = process.env, platform = process.platform) {
  if (env.BRANDKIT_AERENDER) return env.BRANDKIT_AERENDER;
  return platform === 'win32'
    ? 'C:/Program Files/Adobe/Adobe After Effects 2026/Support Files/aerender.exe'
    : '/Applications/Adobe After Effects 2026/aerender';
}

export function killTree(pid) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
  else { try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ } }
}

// Last "PROGRESS:  0:00:01:05 (31): 0 Seconds" frame in a chunk of aerender output.
export function lastProgress(text) {
  let m;
  let last = null;
  const re = /PROGRESS:\s+([\d:;.]+)\s+\((\d+)\)/g;
  while ((m = re.exec(text))) last = m[1] + '#' + m[2];
  return last;
}

export function runWatched({ exe, args, logFile, isDone = async () => false, stallMs = 600000, maxMs = 6 * 3600000, pollMs = 30000, graceMs = 60000 }) {
  return new Promise((resolve) => {
    const child = spawn(exe, args, { windowsHide: true });
    const log = createWriteStream(logFile, { flags: 'a' });
    let lastKey = null;
    let lastChange = Date.now();
    let doneSince = null;
    let reason = null;
    const start = Date.now();
    const onData = (buf) => {
      const text = buf.toString('utf8');
      log.write(text);
      const k = lastProgress(text);
      if (k && k !== lastKey) { lastKey = k; lastChange = Date.now(); }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    const stop = (why) => { reason = why; clearInterval(timer); killTree(child.pid); };
    const timer = setInterval(async () => {
      if (await isDone()) {
        doneSince = doneSince || Date.now();
        if (Date.now() - doneSince > graceMs) stop('done-but-hanging');
      } else if (Date.now() - lastChange > stallMs) stop('stall');
      else if (Date.now() - start > maxMs) stop('timeout');
    }, pollMs);
    child.on('error', (e) => { reason = 'spawn: ' + e.message; });
    child.on('close', (code) => {
      clearInterval(timer);
      log.end();
      resolve({ code, reason, ms: Date.now() - start });
    });
  });
}

// { width, height, duration } of the first video stream, or null if ffprobe cannot read the file yet.
export function ffprobeVideo(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration',
    '-of', 'json', file], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) return null;
  try {
    const j = JSON.parse(r.stdout);
    const s = j.streams && j.streams[0];
    if (!s || !j.format) return null;
    return { width: s.width, height: s.height, duration: Number(j.format.duration) };
  } catch {
    return null;
  }
}

// A preview is good when it is half the comp size (H.264 rounds odd sizes down to even) and lasts
// comp.duration within two frames. For a comp longer than a minute render.mjs passes its span (60 s).
export function previewOk(info, comp) {
  if (!info) return false;
  const even = (n) => 2 * Math.floor(n / 4);
  const wOk = Math.abs(info.width - comp.width / 2) <= 1 || info.width === even(comp.width);
  const hOk = Math.abs(info.height - comp.height / 2) <= 1 || info.height === even(comp.height);
  return wOk && hOk && Math.abs(info.duration - comp.duration) <= 2 / comp.fps;
}
```

- [ ] **Step 8: Создать `tools/golden/render.jsx`**

```js
// Queue golden PNG frames of one ROOT comp (Plan 2, Task 5). PARAMS:
//   expect  the relinked copy that must be open;  compId / compName  the comp (Item.id is persistent)
//   frames  [{ f, ms }] from keytimes.mjs;  outDir  ASCII folder that already exists
// CompItem.saveFrameToPng is not in the scripting guide; live-verified traps (ae-quirks #27, #34,
// #40, #50): it renders at comp.resolutionFactor, so the factor is set to [1, 1] and NOT restored
// (the write is asynchronous; Node closes this working copy without saving when the pack is done),
// and it returns before the PNG exists, so Node waits for size-stable files.
// Time = frame * frameDuration, comp time from 0, as in ae-quirks #34.
var out = { ok: false, queued: [] };

function slashes(p) {
  return String(p).replace(/\\/g, '/');
}

try {
  var cur = app.project.file ? app.project.file.fsName : '';
  var missing = 0;
  for (var i = 1; i <= app.project.numItems; i++) {
    var it = app.project.item(i);
    if (it instanceof FootageItem && it.footageMissing) {
      missing++;
    }
  }
  var comp = null;
  try {
    comp = app.project.itemByID(PARAMS.compId); // AE 13.0+
  } catch (e0) {
    comp = null;
  }
  if (slashes(cur).toLowerCase() !== slashes(PARAMS.expect).toLowerCase()) {
    out.error = 'NOT_EXPECTED_PROJECT';
    out.detail = cur;
  } else if (missing > 0) {
    out.error = 'MISSING_FOOTAGE';
    out.detail = missing;
  } else if (!comp || !(comp instanceof CompItem) || comp.name !== PARAMS.compName) {
    out.error = 'COMP_NOT_FOUND';
    out.detail = PARAMS.compId;
  } else if (!comp.saveFrameToPng) { // undocumented method: make sure it exists
    out.error = 'NO_SAVE_FRAME_TO_PNG';
  } else {
    out.dirtyBefore = app.project.dirty;
    out.resolutionBefore = [comp.resolutionFactor[0], comp.resolutionFactor[1]];
    app.beginUndoGroup('BK golden frames');
    try {
      if (comp.resolutionFactor[0] !== 1 || comp.resolutionFactor[1] !== 1) {
        comp.resolutionFactor = [1, 1];
      }
      for (var k = 0; k < PARAMS.frames.length; k++) {
        var fr = PARAMS.frames[k];
        comp.saveFrameToPng(fr.f * comp.frameDuration, new File(PARAMS.outDir + '/t' + fr.ms + '.png'));
        out.queued.push(fr.ms);
      }
    } finally {
      app.endUndoGroup();
    }
    out.width = comp.width;
    out.height = comp.height;
    out.version = String(app.version);
    out.ok = true;
  }
} catch (e) {
  out.error = 'EXC';
  out.detail = String(e) + ' (line ' + e.line + ', queued ' + out.queued.length + ')';
}
JSON.stringify(out);
```

- [ ] **Step 9: Создать `tools/golden/preview-rq.jsx`**

```js
// Half-resolution H.264 previews through aerender (Plan 2, Task 5). PARAMS:
//   expect      the relinked copy that must be open
//   mode        'probe'  add one Render Queue item, read the Output Module templates, try Resolution
//                        "Half", then remove the item (the copy is closed without saving afterwards)
//               'queue'  keep only our items in the queue, set them up, Save As PARAMS.savePath
//   items       [{ id, name, out, span }]: comps (persistent Item.id), their .mp4 outputs (ASCII) and
//               the seconds to render from the start (the whole comp, or the first 60 s of a longer one)
//   omPattern / prefer  regex sources: an H.264 template, preferably the 15 Mbps one
//   omTemplate  (queue) the template name the probe found
// Template names follow the AE UI language, hence the regex. Docs:
//   https://ae-scripting.docsforadobe.dev/renderqueue/rqitemcollection/
//   https://ae-scripting.docsforadobe.dev/renderqueue/outputmodule/  (templates, applyTemplate, file)
//   https://ae-scripting.docsforadobe.dev/renderqueue/renderqueueitem/ (setSettings/getSettings, AE 13.0+)
var out = { ok: false, mode: PARAMS.mode };

function slashes(p) {
  return String(p).replace(/\\/g, '/');
}

function compOf(job) {
  var c = null;
  try {
    c = app.project.itemByID(job.id);
  } catch (e0) {
    c = null;
  }
  return (c && c instanceof CompItem && c.name === job.name) ? c : null;
}

function pickTemplate(names) {
  var re = new RegExp(PARAMS.omPattern, 'i');
  var pref = new RegExp(PARAMS.prefer, 'i');
  var best = null;
  for (var i = 0; i < names.length; i++) {
    if (re.test(names[i]) && (best === null || (pref.test(names[i]) && !pref.test(best)))) {
      best = names[i];
    }
  }
  return best;
}

// Resolution "Half" is not in the guide's examples: set it, then read it back as a string.
// Quality "Best" is attempted separately and only recorded.
function setHalf(rq) {
  var r = { keys: [], readBack: null, error: null, quality: null };
  try {
    var settable = rq.getSettings(GetSettingsFormat.STRING_SETTABLE);
    for (var k in settable) {
      r.keys.push(k);
    }
    rq.setSettings({ 'Resolution': 'Half' });
    r.readBack = rq.getSettings(GetSettingsFormat.STRING)['Resolution'];
  } catch (e1) {
    r.error = String(e1);
  }
  try {
    rq.setSettings({ 'Quality': 'Best' });
    r.quality = rq.getSettings(GetSettingsFormat.STRING)['Quality'];
  } catch (e2) {
    r.quality = 'ERROR ' + String(e2);
  }
  return r;
}

// timeSpanStart / timeSpanDuration are read-write (custom start and end in Render Settings).
function setUp(rq, comp, job, template) {
  rq.timeSpanStart = 0;
  rq.timeSpanDuration = Math.min(job.span, comp.duration);
  var half = setHalf(rq);
  var om = rq.outputModule(1);
  om.applyTemplate(template);
  om.file = new File(job.out);
  return { half: half, omName: om.name, file: om.file ? om.file.fsName : null };
}

try {
  var cur = app.project.file ? app.project.file.fsName : '';
  var rqs = app.project.renderQueue;
  if (slashes(cur).toLowerCase() !== slashes(PARAMS.expect).toLowerCase()) {
    out.error = 'NOT_EXPECTED_PROJECT';
    out.detail = cur;
  } else if (PARAMS.mode === 'probe') {
    var pc = compOf(PARAMS.items[0]);
    if (!pc) {
      out.error = 'COMP_NOT_FOUND';
    } else {
      app.beginUndoGroup('BK preview probe');
      try {
        var prq = rqs.items.add(pc);
        try {
          var names = prq.outputModule(1).templates;
          out.templates = [];
          for (var n = 0; n < names.length; n++) {
            out.templates.push(names[n]);
          }
          out.omTemplate = pickTemplate(out.templates);
          if (out.omTemplate) {
            out.setup = setUp(prq, pc, PARAMS.items[0], out.omTemplate);
          }
        } finally {
          prq.remove();
        }
      } finally {
        app.endUndoGroup();
      }
      out.capable = Boolean(out.omTemplate) && Boolean(out.setup) && out.setup.half.readBack === 'Half';
      out.version = String(app.version);
      out.ok = true;
    }
  } else if (PARAMS.mode === 'queue') {
    out.queued = [];
    app.beginUndoGroup('BK preview queue');
    try {
      out.removedExisting = rqs.numItems;
      for (var r = rqs.numItems; r >= 1; r--) {
        rqs.item(r).remove();
      }
      for (var j = 0; j < PARAMS.items.length; j++) {
        var job = PARAMS.items[j];
        var c = compOf(job);
        if (!c) {
          throw new Error('COMP_NOT_FOUND ' + job.id);
        }
        var s = setUp(rqs.items.add(c), c, job, PARAMS.omTemplate);
        if (s.half.readBack !== 'Half') {
          throw new Error('RESOLUTION_NOT_HALF ' + job.id + ': ' + s.half.readBack + ' ' + s.half.error);
        }
        out.queued.push({ id: job.id, index: rqs.numItems, file: s.file });
      }
    } finally {
      app.endUndoGroup();
    }
    app.beginSuppressDialogs();
    try {
      app.project.save(new File(PARAMS.savePath));
    } finally {
      app.endSuppressDialogs(false);
    }
    out.saved = app.project.file ? app.project.file.fsName : null;
    out.ok = true;
  } else {
    out.error = 'BAD_MODE';
  }
} catch (e) {
  out.error = 'EXC';
  out.detail = String(e) + ' (line ' + e.line + ')';
}
JSON.stringify(out);
```

- [ ] **Step 10: Создать `tools/golden/render.mjs`**

```js
#!/usr/bin/env node
// Golden renders of every ROOT comp (Plan 2, Task 5; spec §3.2).
//   node tools/golden/render.mjs frames   --all | --slug s [--force] [--wait-ms 1800000]
//   node tools/golden/render.mjs probe-preview
//   node tools/golden/render.mjs previews --all | --slug s
//   node tools/golden/render.mjs review   --slug s --ok true|false --text "<what was checked>"
// PNGs go to <work>/golden/<slug>/<compSlug>/t<ms>.png and stay out of git; the manifest with times
// and sha256 is docs/research/golden/<slug>.json. A pack renders only when its relinked copy is clean
// (relink-report.json: goldenOk) and AE confirms 0 missing footage again right before each comp.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workPath, ensureDir } from '../lib/work.mjs';
import { SLUGS } from '../packs/packs.mjs';
import { packDir } from '../packs/paths.mjs';
import { sha256File } from '../packs/fsutil.mjs';
import { callJsx, REPO } from '../packs/jsx-call.mjs';
import { openProject, closeDiscard } from '../packs/ae-project.mjs';
import { relinkedPath } from '../packs/relink.mjs';
import { rootsFile } from './roots.mjs';
import { keyFrames, RULE } from './keytimes.mjs';
import { pngSize, waitForStableFiles } from './png.mjs';
import { aerenderPath, runWatched, ffprobeVideo, previewOk } from './aerender.mjs';

export const PREVIEW_MAX_S = 60;
export const CAPABILITY = path.join(REPO, 'docs', 'research', 'golden', 'preview-capability.json');
export const manifestFile = (slug) => path.join(REPO, 'docs', 'research', 'golden', slug + '.json');
export const compDir = (slug, compSlug) => workPath('golden', slug, compSlug);
const KEY_ORDER = ['slug', 'status', 'reason', 'project', 'aeVersion', 'date', 'rule', 'comps', 'preview', 'review'];
const today = () => new Date().toISOString().slice(0, 10);
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const writeJson = (f, v) => {
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify(v, null, 2) + '\n', 'utf8');
};
const native = (p) => (process.platform === 'win32' ? p.replace(/\//g, '\\') : p);
const reportOf = (slug) => path.posix.join(packDir(slug), 'relink-report.json');

export function orderManifest(man) {
  const out = {};
  for (const k of KEY_ORDER) if (man[k] !== undefined) out[k] = man[k];
  for (const k of Object.keys(man)) if (!(k in out)) out[k] = man[k];
  return out;
}
const saveManifest = (slug, man) => writeJson(manifestFile(slug), orderManifest(man));
const loadManifest = (slug) => (existsSync(manifestFile(slug)) ? readJson(manifestFile(slug)) : null);

export function framePlan(slug, root) {
  const dir = compDir(slug, root.compSlug);
  return keyFrames(root).map((k) => ({ ...k, file: dir + '/t' + k.ms + '.png' }));
}

// Done = the manifest lists exactly these frames and every PNG is still there with that size.
export function compDone(entry, plan) {
  if (!entry || !Array.isArray(entry.frames) || entry.frames.length !== plan.length) return false;
  return plan.every((p, i) => entry.frames[i].ms === p.ms && existsSync(p.file) && statSync(p.file).size === entry.frames[i].bytes);
}

export function gateReason(acc) {
  if (acc.goldenOk) return null;
  const parts = [];
  if (acc.missing.length) parts.push('missing footage: ' + acc.missing.map((m) => m.name).join(', '));
  if (acc.external.length) parts.push('footage outside the pack: ' + acc.external.length);
  if (acc.usedSubstitutes.length) parts.push('substituted fonts: ' + acc.usedSubstitutes.join(', '));
  if (acc.suspiciousFonts.length) parts.push('fonts from a wrong file: ' + acc.suspiciousFonts.join(', '));
  return parts.join('; ') || 'not accepted';
}

// Every ROOT comp gets a preview (spec §3.2); a longer comp only its first PREVIEW_MAX_S seconds.
export function previewItems(slug, roots) {
  return roots.map((r) => ({
    id: r.id, name: r.name, out: compDir(slug, r.compSlug) + '/preview_half.mp4', span: Math.min(r.duration, PREVIEW_MAX_S),
  }));
}

function eligible(slug) {
  return existsSync(reportOf(slug)) && readJson(reportOf(slug)).acceptance.goldenOk && existsSync(rootsFile(slug));
}

async function framesOne(slug, { force, waitMs }) {
  const man = loadManifest(slug) || { slug, comps: [] };
  if (!existsSync(reportOf(slug))) throw new Error('NO_RELINK_REPORT: ' + reportOf(slug) + ' (Task 3)');
  const reason = gateReason(readJson(reportOf(slug)).acceptance);
  if (reason) {
    saveManifest(slug, { ...man, slug, status: 'skipped', reason, date: today() });
    return { status: 'skipped', reason };
  }
  if (!existsSync(rootsFile(slug))) throw new Error('NO_ROOTS: ' + rootsFile(slug) + ' (Task 4)');
  const roots = readJson(rootsFile(slug)).roots;
  const project = relinkedPath(slug);
  await openProject(project);
  Object.assign(man, { slug, project: path.posix.basename(project), rule: RULE, status: 'partial' });
  delete man.reason;
  man.comps = (man.comps || []).filter((c) => roots.some((r) => r.id === c.id));
  for (const root of roots) {
    const plan = framePlan(slug, root);
    const at = man.comps.findIndex((c) => c.id === root.id);
    if (!force && at !== -1 && compDone(man.comps[at], plan)) {
      console.log(`  ${root.compSlug}: done, skipped`);
      continue;
    }
    const dir = ensureDir(compDir(slug, root.compSlug));
    for (const n of readdirSync(dir)) if (/^t\d+\.png$/.test(n)) rmSync(path.posix.join(dir, n)); // quirk #27: no leftovers
    console.log(`  ${root.compSlug}: queueing ${plan.length} frames`);
    const r = await callJsx('tools/golden/render.jsx', {
      expect: project, compId: root.id, compName: root.name, outDir: dir, frames: plan.map(({ f, ms }) => ({ f, ms })),
    }, { timeoutMs: 900000 });
    let shown = 0;
    await waitForStableFiles(plan.map((p) => p.file), {
      timeoutMs: waitMs,
      onProgress: (n, total) => {
        if (Date.now() - shown > 30000) { shown = Date.now(); console.log(`  ${root.compSlug}: ${n}/${total} PNG ready`); }
      },
    });
    const frames = [];
    for (const p of plan) {
      const s = pngSize(p.file);
      if (s.width !== root.width || s.height !== root.height) {
        throw new Error(`PNG_SIZE: ${p.file} is ${s.width}x${s.height}, the comp is ${root.width}x${root.height}`);
      }
      frames.push({ f: p.f, ms: p.ms, bytes: statSync(p.file).size, sha256: await sha256File(p.file) });
    }
    const entry = {
      id: root.id, name: root.name, compSlug: root.compSlug, width: root.width, height: root.height,
      fps: root.fps, duration: root.duration, resolutionBefore: r.resolutionBefore, frames,
    };
    if (at === -1) man.comps.push(entry); else man.comps[at] = entry;
    Object.assign(man, { aeVersion: r.version, date: today() });
    saveManifest(slug, man); // after every comp, so a stopped run resumes here
    console.log(`  ${root.compSlug}: ${frames.length} frames`);
  }
  man.comps.sort((a, b) => (a.compSlug < b.compSlug ? -1 : 1));
  man.status = 'ok';
  saveManifest(slug, man);
  await closeDiscard(project); // drops only our resolution changes; the relinked file stays as saved
  return man;
}

async function probePreview() {
  const slug = SLUGS.find((s) => eligible(s) && previewItems(s, readJson(rootsFile(s)).roots).length);
  if (!slug) throw new Error('NO_ELIGIBLE_PACK: run relink (Task 3), roots (Task 4) and frames first');
  const project = relinkedPath(slug);
  const items = previewItems(slug, readJson(rootsFile(slug)).roots).slice(0, 1);
  await openProject(project);
  let r;
  try {
    r = await callJsx('tools/golden/preview-rq.jsx', { expect: project, mode: 'probe', items, omPattern: 'H\\.?264', prefer: '15' });
  } catch (e) {
    if (!/CDP_TIMEOUT/.test(e.message)) await closeDiscard(project);
    throw e;
  }
  await closeDiscard(project); // the probe's queue item is gone and nothing of it is saved
  const cap = {
    date: today(), slug, aeVersion: r.version, capable: r.capable,
    reason: r.capable ? null : (r.omTemplate ? 'RESOLUTION_HALF_NOT_SET' : 'NO_H264_TEMPLATE'),
    omTemplate: r.omTemplate || null, templates: r.templates, setup: r.setup || null,
  };
  writeJson(CAPABILITY, cap);
  return cap;
}

async function previewsOne(slug, cap) {
  const man = loadManifest(slug);
  if (!man || man.status !== 'ok') return { status: 'skipped', reason: 'golden frames are not done' };
  const roots = readJson(rootsFile(slug)).roots;
  const items = previewItems(slug, roots);
  if (!items.length) {
    man.preview = { status: 'none', reason: 'no ROOT comp', date: today() };
    saveManifest(slug, man);
    return man.preview;
  }
  const project = relinkedPath(slug);
  const rq = workPath('golden', slug, slug + '_preview_rq.aep');
  for (const f of [rq, ...items.map((it) => it.out)]) if (existsSync(f)) rmSync(f); // our own outputs of a previous run
  await openProject(project);
  try {
    await callJsx('tools/golden/preview-rq.jsx',
      { expect: project, mode: 'queue', items, omTemplate: cap.omTemplate, savePath: rq }, { timeoutMs: 300000 });
  } catch (e) {
    if (!/CDP_TIMEOUT/.test(e.message)) await closeDiscard(project);
    throw e;
  }
  await closeDiscard(rq); // the GUI lets go of the preview project before aerender reads it
  const byId = new Map(roots.map((r) => [r.id, r]));
  const want = (it) => ({ ...byId.get(it.id), duration: it.span }); // a long comp: its first PREVIEW_MAX_S seconds
  const run = await runWatched({
    exe: aerenderPath(), args: ['-project', native(rq), '-close', 'DO_NOT_SAVE_CHANGES'],
    logFile: workPath('golden', slug, 'aerender.log'),
    isDone: async () => items.every((it) => previewOk(ffprobeVideo(it.out), want(it))),
  });
  const files = [];
  const failed = [];
  for (const it of items) {
    const root = byId.get(it.id);
    const info = ffprobeVideo(it.out);
    const file = path.posix.relative(workPath(), it.out);
    if (previewOk(info, want(it))) files.push({ compSlug: root.compSlug, file, span: it.span, ...info, sha256: await sha256File(it.out) });
    else failed.push({ compSlug: root.compSlug, file, span: it.span, info });
  }
  man.preview = { status: failed.length ? 'failed' : 'ok', omTemplate: cap.omTemplate, aerender: run, files, failed, date: today() };
  saveManifest(slug, man);
  return man.preview;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [cmd, ...argv] = process.argv.slice(2);
  const val = (flag) => { const i = argv.indexOf(flag); return i === -1 ? undefined : argv[i + 1]; };
  const all = argv.includes('--all');
  const slugs = all ? SLUGS : [val('--slug')].filter(Boolean);
  try {
    if (cmd === 'frames' && slugs.length) {
      const waitMs = Number(val('--wait-ms') || 1800000);
      for (const slug of slugs) {
        if (all && !existsSync(reportOf(slug))) { console.log(`${slug}: not relinked yet, skipped`); continue; }
        console.log(slug + ':');
        const m = await framesOne(slug, { force: argv.includes('--force'), waitMs });
        console.log(`${slug}: ${m.status}${m.reason ? ' (' + m.reason + ')' : ''}`);
      }
    } else if (cmd === 'probe-preview') {
      const cap = await probePreview();
      console.log(`preview capability: ${cap.capable} (${cap.reason || cap.omTemplate}) -> ${CAPABILITY}`);
    } else if (cmd === 'previews' && slugs.length) {
      const cap = existsSync(CAPABILITY) ? readJson(CAPABILITY) : null;
      if (!cap || !cap.capable) {
        console.log('previews skipped: ' + (cap ? cap.reason : 'run probe-preview first'));
      } else {
        for (const slug of slugs) {
          const p = await previewsOne(slug, cap);
          console.log(`${slug}: preview ${p.status}${p.reason ? ' (' + p.reason + ')' : ''}`);
        }
      }
    } else if (cmd === 'review' && slugs.length === 1 && ['true', 'false'].includes(val('--ok'))) {
      const man = loadManifest(slugs[0]);
      if (!man) throw new Error('NO_MANIFEST: ' + manifestFile(slugs[0]));
      man.review = (man.review || []).concat([{ date: today(), ok: val('--ok') === 'true', text: val('--text') || '' }]);
      saveManifest(slugs[0], man);
      console.log(`${slugs[0]}: review recorded`);
    } else {
      console.error('usage: node tools/golden/render.mjs frames|previews --all|--slug s | probe-preview | review --slug s --ok true|false --text "..."');
      process.exit(2);
    }
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exitCode = 1; // not process.exit(): see tools/packs/relink.mjs
  }
}
```

- [ ] **Step 11: Запустить все тесты и линтер**

Run: `npx vitest run tests/golden && npm test && node tools/jsx/lint-jsx.cjs tools/golden/render.jsx tools/golden/preview-rq.jsx`
Expected: `25 passed` для `tests/golden`; все тесты репозитория зелёные; две строки `OK`.

- [ ] **Step 12: Эталон первого пакета**

AE подготовлен как в задаче 3, шаг 10. В AE ничего не трогать до конца команды.

Run: `node tools/golden/render.mjs frames --slug logo`
Expected:
```text
logo:
  <compSlug>: queueing N frames
  <compSlug>: K/N PNG ready
  <compSlug>: N frames
  …
logo: ok
```
Затем в `docs/research/golden/logo.json` стоит `"status": "ok"`, у каждой композиции есть `frames` с `sha256`. PNG лежат в `C:/CRBK/work/golden/logo/<compSlug>/t<ms>.png`. Если команда упала с `PNG_SIZE`, кадр записался не в полном разрешении. Команду не повторять: сообщить пользователю и приложить вывод.

- [ ] **Step 13: Посмотреть кадры логотипа (вручную)**

1. Открыть в просмотрщике три PNG одной композиции: `t0.png`, кадр из середины и последний.
2. В AE открыть `C:\CRBK\packs\logo\logo_relinked.aep` и ту же композицию. Поставить время из имени файла (`t1240.png` — это 1,24 с) и сравнить. Должно совпасть: текст набран SB Sans, а не Times; цветных полос нет; размер полный.
3. Закрыть проект без сохранения: File → Close Project → Don't Save.
4. Записать результат: `node tools/golden/render.mjs review --slug logo --ok true --text "t0/середина/конец совпадают с AE, шрифт SB Sans"`. При расхождении — `--ok false` с описанием, и дальше не идти.

- [ ] **Step 14: Эталоны всех пакетов**

Долго: тысячи кадров, до часа и больше; 4K-кадры подкаста весят по несколько мегабайт. Запускать в фоне и в AE не работать.

Run: `node tools/golden/render.mjs frames --all`
Expected:
- готовые композиции `logo` пропускаются (`done, skipped`);
- у пакетов с `goldenOk` в конце строка `<slug>: ok`;
- для `courses_conv` — `courses_conv: skipped (missing footage: Запись экрана 2026-09-01 в 12.42.01.mov, 3D.png, slide_01.png, slide_01.png)`.

После остановки (ошибка, таймаут, диалог) запустить ту же команду: готовые композиции пропускаются. Если AE пишет кадры дольше 30 минут на композицию, команда падает с `WAIT_TIMEOUT`. Тогда посмотреть, нет ли в AE диалога (ошибки выражений), закрыть его и запустить снова.

- [ ] **Step 15: Проба превью**

Run: `node tools/golden/render.mjs probe-preview`
Expected — один из двух вариантов:
- `preview capability: true (H.264 - Match Render Settings - 15 Mbps) -> …\docs\research\golden\preview-capability.json`. В русском интерфейсе имя шаблона другое, но содержит «H.264»;
- `preview capability: false (NO_H264_TEMPLATE)` или `false (RESOLUTION_HALF_NOT_SET)`. Тогда превью не делаются, а причина и список шаблонов записаны в `preview-capability.json`; шаг 16 пропустить.

- [ ] **Step 16: Превью в половинном разрешении**

Долго: `aerender` стартует ~25 с на пакет и рендерит все ROOT-композиции, у длинных — первые 60 с. Запускать в фоне.

Пока команда идёт, других команд для AE не запускать. Для каждого пакета она сначала собирает в открытом AE проект очереди рендера `<slug>_preview_rq.aep` и только потом зовёт `aerender`. Дамп (задача 6), запущенный параллельно 2026-10-02, получил `WRONG_PROJECT` на семи композициях подкаста. Копии не пострадали, но дамп пакета пришлось повторить.

Run: `node tools/golden/render.mjs previews --all`
Expected:
- `<slug>: preview ok` у каждого пакета с эталоном. У превью ROOT-композиции длиннее минуты в манифесте (`preview.files`) стоит `"span": 60`, у остальных `span` равен длительности композиции;
- `courses_conv: preview skipped (golden frames are not done)`.

При `preview failed` смотреть `C:/CRBK/work/golden/<slug>/aerender.log` и `preview.failed` в манифесте. Автоматического повтора нет; повтор — та же команда с `--slug <slug>`.

- [ ] **Step 17: Просмотр эталонов по пакетам (вручную)**

Для каждого из 8 пакетов со статусом `ok`:
1. Открыть 2–3 PNG разных композиций и одно превью `preview_half.mp4`, если оно есть.
2. Сравнить с AE, как в шаге 13. В конце закрыть проект без сохранения.
3. Записать результат: `node tools/golden/render.mjs review --slug <slug> --ok true|false --text "<что проверено>"`.

- [ ] **Step 18: Сводка по эталонам**

Run: `node -e "for (const s of ['logo','logo_conv','titles','titles_conv','webinars','courses','courses_conv','smm','podcast']) { const m=require('./docs/research/golden/' + s + '.json'); const n=(m.comps||[]).reduce((a, c) => a + c.frames.length, 0); console.log(s, m.status, (m.comps||[]).length + ' comps', n + ' frames', m.preview ? m.preview.status : '-', (m.review||[]).length + ' review(s)') }"`
Expected: 9 строк; `ok` у восьми пакетов, `skipped` у `courses_conv`; у каждого `ok`-пакета есть хотя бы одна запись просмотра.

- [ ] **Step 19: Commit**

```bash
git add tools/golden/png.mjs tools/golden/aerender.mjs tools/golden/render.jsx tools/golden/preview-rq.jsx tools/golden/render.mjs tests/golden/png.test.mjs tests/golden/render.test.mjs docs/research/golden/logo.json docs/research/golden/logo_conv.json docs/research/golden/titles.json docs/research/golden/titles_conv.json docs/research/golden/webinars.json docs/research/golden/courses.json docs/research/golden/courses_conv.json docs/research/golden/smm.json docs/research/golden/podcast.json docs/research/golden/preview-capability.json
git commit -m "feat(golden): golden frames of every ROOT comp and optional half-res previews" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Часть 2. JSX-дамп, сверка логотипов, доктор пакета (задачи 6–9)

Эта часть превращает рабочие копии пакетов в данные:
- **JSX-дамп** каждой композиции всех пакетов — источник чисел для пересборки (тайминги, кривые, ширины; спецификация §3.2);
- **сверка копий логотипа** с мастером: геометрия и цвета (D18);
- **«доктор пакета»** — отчёт о гигиене каждого пакета;
- **манифесты** эталонов и дампов и `docs/research/README.md`.

**Опирается на:**
- План 1: линтер и пролог (задача 2), `tools/lib/work.mjs` (задача 3), dev-панель BrandKit Dev (задача 4), `tools/host-run.mjs` (задача 5), фикстура `CRT_fixture.aep` (задача 7), `tools/color/deltae.mjs` (задача 12: sRGB → CIELAB и ΔE2000), черновик `brand/tokens.json` (задача 26; без него сверка идёт по палитре D1), лист решений `docs/decisions/phase0-decisions.md` (задача 27).
- Задачи 1–5 этого плана: `packDir(slug)` из `tools/packs/paths.mjs` (задача 1), `compSlugs(comps)` из `tools/packs/slug.mjs` (задача 2: те же имена, что у папок эталонов), рабочие копии `C:/CRBK/packs/<slug>/<slug>_relinked.aep`, карта перелинковки (по умолчанию `C:/CRBK/packs/<slug>/relink-map.json`), эталонные кадры.

**AE только читает.** Дампер открывает рабочую копию, читает и закрывает её без сохранения. Проект он не меняет, поэтому undo-группы не нужны. С несохранённым проектом пользователя дампер не работает: сначала сохранить или закрыть.

```text
tools/dump/
  dump-project.jsx        JSX (ES3): open / comp / close, только чтение
  dump.mjs                CLI дампа: index.json, project.json, <compSlug>.json
  model.mjs               чтение дампов в Node: слои, свойства, обход дерева
  check-fixture-dump.mjs  живая проверка дампа фикстуры
  colors.mjs              цвета AE в hex, палитра из brand/tokens.json, классы по ΔE2000 (tools/color/deltae.mjs)
  geometry.mjs            контуры: трансформации групп, Безье, нормализация, расстояние
  logo-candidates.json    копии логотипа из аудитов
  logo-diff.mjs           отчёт docs/research/logo-geometry.md
  doctor.mjs              отчёты docs/research/packs/<slug>-doctor.md
  manifest.mjs            манифесты эталонов и дампов
tools/vendor/svgpath.cjs  разбор SVG-путей (из ae-motion-live)
brand/logo/master-ae-motion-live.svg   мастер логотипа (копия из ae-motion-live)
tests/dump/               vitest и фейковый хост AE для дампера
docs/research/            README.md, logo-geometry.md (+ logo-geometry/*.svg), packs/*-doctor.md, manifests/*.json
```

### Task 6: JSX-дамп проектов AE

**Files:**
- Create: `tools/dump/model.mjs`, `tools/dump/check-fixture-dump.mjs`, `tools/dump/dump-project.jsx`, `tools/dump/dump.mjs`
- Test: `tests/dump/model.test.mjs`, `tests/dump/check-fixture-dump.test.mjs`, `tests/dump/fake-ae-host.js`, `tests/dump/dump-project.test.mjs`, `tests/dump/dump.test.mjs`

Дампер — пара «JSX + Node». Node вызывает JSX по шагам: `open` один раз (открыть проект, выписать его элементы), `comp` по разу на композицию (так не нужен один огромный ответ по CDP), `close` один раз (закрыть без сохранения). JSX сам пишет JSON в рабочую папку с ASCII-путём, Node раскладывает файлы по `compSlug`. `compSlug` даёт `compSlugs()` из `tools/packs/slug.mjs` по всем композициям проекта, как у эталонов (задача 4): файл дампа `dumps/<slug>/<compSlug>.json` и папка эталона `golden/<slug>/<compSlug>/` называются одинаково. Своё имя получает только композиция, чей `compSlug` равен `index` или `project`: так называются служебные файлы папки дампа, и её файл — `<compSlug>__<id>.json`.

Что попадает в дамп:
- **композиция:** размер, fps, длительность, рабочая область, фон, рендерер, motion blur, маркеры с защищёнными областями;
- **слой:** индекс, имя, тип (text, shape, av, null, camera, light, adjustment), источник (имя, id, файл), in/out/start/stretch, родитель, матт (`trackMatteLayer` из AE 23+, иначе устаревшие поля), режим наложения, переключатели;
- **эффекты** (matchName, имя, включён, все параметры) и **маски** (режим, инверсия, путь, растушёвка, непрозрачность, расширение);
- **всё дерево свойств:** значение или ключи (время, значение, интерполяция, скорость и влияние по измерениям, пространственные касательные, roving), выражения (текст, включено, ошибка, значение на 0 с), текстовые документы, содержимое фигур.

Выражение вычисляется один раз (`valueAtTime(0, false)`): без этого `expressionError` пуст у композиций, которые после открытия ещё не рендерились. На время чтения композиции диалоги ошибок скриптов подавлены (`app.beginSuppressDialogs`). Флаг `--no-eval` отключает вычисление — на случай, если оно всё же вызовет модальное окно.

Огромные массивы не пишутся: больше 1000 ключей на свойство, 5000 вершин на путь, 20 000 знаков текста и 50 000 знаков выражения — значение пропускается, а путь и число записываются в `truncated`. Мока AE из ae-motion-live здесь нет. Поэтому JSX проверяется тремя способами: ES3-линтер, маленький фейковый хост в vitest (ловит ошибки логики) и живой дамп фикстуры.

- [ ] **Step 1: Написать падающий тест чтения дампов `tests/dump/model.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  child, findLayers, isNfd, layerProp, listDumpDirs, loadDumpDir, loadDumpRoot, nodeValues, propAt, walkLayer,
} from '../../tools/dump/model.mjs';

const prop = (matchName, extra) => ({ matchName, name: matchName, ...extra });
const group = (matchName, children, extra) => ({ matchName, name: matchName, group: 'NAMED_GROUP', children, ...extra });
const key = (time, value) => ({ time, value, inInterp: 'LINEAR', outInterp: 'LINEAR' });

function writeDump(root, slug, comps) {
  const dir = path.join(root, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ slug, comps: comps.map((name, i) => ({ name, file: `c${i}.json` })) }));
  comps.forEach((name, i) => writeFileSync(path.join(dir, `c${i}.json`), JSON.stringify({ comp: { name }, layers: [] })));
}

describe('model', () => {
  it('finds layers and properties by matchName path', () => {
    const dump = { layers: [{ name: 'PROBE_SQ', props: [group('ADBE Transform Group', [prop('ADBE Position', { pvt: 'ThreeD_SPATIAL', keys: [key(0, [1, 2, 0])] })])] }] };
    const probe = findLayers(dump, 'PROBE_SQ')[0];
    expect(layerProp(probe, 'ADBE Transform Group', 'ADBE Position').keys).toHaveLength(1);
    expect(propAt(probe.props, ['ADBE Transform Group', 'ADBE Scale'])).toBeNull();
    expect(child(probe.props[0], 'ADBE Position').pvt).toBe('ThreeD_SPATIAL');
    expect(findLayers(dump, 'nope')).toEqual([]);
  });

  it('walks props, effect params and masks with trails', () => {
    const layer = {
      props: [group('ADBE Transform Group', [prop('ADBE Opacity', { value: 50 })])],
      effects: [{ name: 'Fill', matchName: 'ADBE Fill', params: [prop('ADBE Fill-0002', { pvt: 'COLOR', value: [1, 0, 0, 1] })] }],
      masks: [{ name: 'Mask 1', path: prop('ADBE Mask Shape', { pvt: 'SHAPE' }), other: [] }],
    };
    const seen = [...walkLayer(layer)].map((x) => `${x.area}:${x.trail.join('>')}`);
    expect(seen).toEqual(['props:ADBE Transform Group', 'props:ADBE Transform Group>ADBE Opacity', 'effect:Fill>ADBE Fill-0002', 'mask:Mask 1>ADBE Mask Shape']);
  });

  it('marks nodes under a switched-off group or effect', () => {
    const layer = {
      props: [group('ADBE Vector Group', [prop('ADBE Vector Fill Color', { pvt: 'COLOR' })], { enabled: false })],
      effects: [{ name: 'Fill', matchName: 'ADBE Fill', enabled: false, params: [prop('ADBE Fill-0002', { pvt: 'COLOR' })] }],
      masks: [],
    };
    expect([...walkLayer(layer)].map((x) => x.off)).toEqual([true, true, true]);
  });

  it('returns static or keyed values uniformly', () => {
    expect(nodeValues(prop('x', { value: 3 }))).toEqual([{ time: null, value: 3 }]);
    expect(nodeValues(prop('x', { keys: [key(0, 1), key(1, 2)] }))).toEqual([{ time: 0, value: 1 }, { time: 1, value: 2 }]);
    expect(nodeValues(null)).toEqual([]);
  });

  it('detects NFD names', () => {
    expect(isNfd('Дисклеймер'.normalize('NFD'))).toBe(true);
    expect(isNfd('Дисклеймер')).toBe(false);
    expect(isNfd(null)).toBe(false);
  });

  it('loads a dump folder through index.json, BOM or not', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-model-'));
    writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ slug: 's', comps: [{ name: 'A', file: 'a.json' }] }));
    writeFileSync(path.join(dir, 'a.json'), String.fromCharCode(0xfeff) + JSON.stringify({ comp: { name: 'A' }, layers: [] }));
    const b = loadDumpDir(dir);
    expect(b.project).toBeNull();
    expect(b.comps[0].comp.name).toBe('A');
  });

  it('loads every pack under a root, skipping the fixture and unfinished folders', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'bk-root-'));
    writeDump(root, 'smm', ['A']);
    writeDump(root, 'logo', ['B', 'C']);
    writeDump(root, 'fixture', ['F']);
    writeDump(root, 'podcast.tmp', ['P']);
    expect(listDumpDirs(root).map((d) => path.basename(d))).toEqual(['logo', 'smm']);
    expect(loadDumpRoot(root).map((b) => [b.index.slug, b.comps.length])).toEqual([['logo', 2], ['smm', 1]]);
    expect(loadDumpRoot(path.join(root, 'missing'))).toEqual([]);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run tests/dump/model.test.mjs`
Expected: FAIL — `Cannot find module '../../tools/dump/model.mjs'`.

- [ ] **Step 3: Создать `tools/dump/model.mjs`**

```js
// Reading JSX dumps in Node (schema crbk-dump/1, written by tools/dump/dump-project.jsx).
// A dump folder: index.json (comp list), project.json (items, footage, fonts), <compSlug>.json per comp.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// ExtendScript may write a UTF-8 BOM.
export function stripBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

export function readJson(file) {
  return JSON.parse(stripBom(readFileSync(file, 'utf8')));
}

export function loadDumpDir(dir) {
  const index = readJson(path.join(dir, 'index.json'));
  const projectFile = path.join(dir, 'project.json');
  const project = existsSync(projectFile) ? readJson(projectFile) : null;
  const comps = index.comps.map((c) => readJson(path.join(dir, c.file)));
  return { dir, index, project, comps };
}

// Pack dump folders under a root (<root>/<slug>/index.json), sorted; unfinished *.tmp folders and
// the skipped ones (the phase-0 fixture) are left out.
export function listDumpDirs(root, { skip = ['fixture'] } = {}) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.endsWith('.tmp') && !skip.includes(e.name) && existsSync(path.join(root, e.name, 'index.json')))
    .map((e) => path.join(root, e.name))
    .sort();
}

export function loadDumpRoot(root, opts) {
  return listDumpDirs(root, opts).map(loadDumpDir);
}

export function findLayers(dump, name) {
  return (dump.layers || []).filter((l) => l.name === name);
}

export function child(node, matchName) {
  return ((node && node.children) || []).find((c) => c.matchName === matchName) || null;
}

// Follows a matchName path through property nodes: propAt(layer.props, ['ADBE Transform Group', 'ADBE Position']).
export function propAt(nodes, matchNames) {
  let list = nodes || [];
  let cur = null;
  for (const mn of matchNames) {
    cur = list.find((n) => n.matchName === mn) || null;
    if (!cur) return null;
    list = cur.children || [];
  }
  return cur;
}

export function layerProp(layer, ...matchNames) {
  return propAt(layer && layer.props, matchNames);
}

// Depth-first over property nodes. trail: display names down to the node; off: the node or a parent
// group has its eyeball switched off (enabled === false).
export function* walkNodes(nodes, trail = [], off = false) {
  for (const node of nodes || []) {
    const t = trail.concat(node.name || node.matchName || '?');
    const o = off || node.enabled === false;
    yield { node, trail: t, off: o };
    if (node.children) yield* walkNodes(node.children, t, o);
  }
}

// Every property node of a layer: the props tree, effect parameters and mask properties.
export function* walkLayer(layer) {
  for (const it of walkNodes(layer.props)) yield { ...it, area: 'props', effect: null };
  for (const fx of layer.effects || []) {
    for (const it of walkNodes(fx.params, [fx.name], fx.enabled === false)) yield { ...it, area: 'effect', effect: fx };
  }
  for (const m of layer.masks || []) {
    const nodes = ['path', 'feather', 'opacity', 'expansion'].map((k) => m[k]).filter(Boolean).concat(m.other || []);
    for (const it of walkNodes(nodes, [m.name])) yield { ...it, area: 'mask', effect: null };
  }
}

// Static value or keyframe values of a property node as [{ time, value }]; time is null for a static value.
export function nodeValues(node) {
  if (!node) return [];
  if (Array.isArray(node.keys) && node.keys.length) {
    return node.keys.filter((k) => k && 'value' in k).map((k) => ({ time: k.time, value: k.value }));
  }
  return 'value' in node ? [{ time: null, value: node.value }] : [];
}

export function isNfd(s) {
  return typeof s === 'string' && s !== s.normalize('NFC');
}
```

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/dump/model.test.mjs`
Expected: `7 passed`.

- [ ] **Step 5: Написать падающий тест проверки фикстуры `tests/dump/check-fixture-dump.test.mjs`**

Проверки повторяют контракт фикстуры (План 1, задача 7): четыре линейных ключа PROBE_SQ, шрифт TXT_NAME, защищённые области, контролы CTRL, выражение TXT_ROLE.

```js
import { describe, it, expect } from 'vitest';
import { checkFixtureDump } from '../../tools/dump/check-fixture-dump.mjs';

const prop = (matchName, extra) => ({ matchName, name: matchName, ...extra });
const group = (matchName, children) => ({ matchName, name: matchName, group: 'NAMED_GROUP', children });
const key = (time, value, interp = 'LINEAR') => ({ time, value, inInterp: interp, outInterp: interp });

// A dump of CRT_LowerThird_v1 that satisfies the fixture contract (Plan 1, Task 7).
function fixtureDump() {
  return {
    schema: 'crbk-dump/1',
    comp: {
      name: 'CRT_LowerThird_v1', width: 1920, height: 1080, frameRate: 25, duration: 10, renderer: 'ADBE Advanced 3d',
      markers: [{ time: 0, duration: 1, comment: 'in', protectedRegion: true }, { time: 9, duration: 1, comment: 'out', protectedRegion: true }],
    },
    layers: [
      { index: 1, name: 'CTRL', type: 'null', props: [], masks: [], effects: [
        ['ShowRole', 'ADBE Checkbox Control'], ['Duration', 'ADBE Slider Control'], ['Accent', 'ADBE Color Control'],
        ['Style', 'ADBE Dropdown Control'], ['QA', 'ADBE Checkbox Control']].map(([name, matchName], i) => ({ index: i + 1, name, matchName, params: [] })) },
      { index: 2, name: 'TXT_NAME', type: 'text', effects: [], masks: [], props: [
        group('ADBE Text Properties', [prop('ADBE Text Document', { pvt: 'TEXT_DOCUMENT', value: { text: 'Имя Фамилия', font: 'SBSansDisplay-Semibold', fontSize: 60 } })])] },
      { index: 3, name: 'TXT_ROLE', type: 'text', effects: [], masks: [], props: [
        group('ADBE Transform Group', [prop('ADBE Opacity', { pvt: 'OneD', value: 100,
          expression: { text: 'thisComp.layer("CTRL").effect("ShowRole")(1) * 100', enabled: true, valueAt0: 100, error: '' } })])] },
      { index: 4, name: 'PROBE_SQ', type: 'av', effects: [], masks: [], props: [
        group('ADBE Transform Group', [prop('ADBE Position', { pvt: 'ThreeD_SPATIAL',
          keys: [key(0, [100, 100, 0]), key(1, [200, 100, 0]), key(9, [200, 100, 0]), key(10, [300, 100, 0])] })])] },
    ],
  };
}

const failed = (d) => checkFixtureDump(d).filter((c) => !c.pass).map((c) => c.name);

describe('checkFixtureDump', () => {
  it('passes on a dump that matches the fixture contract', () => {
    expect(failed(fixtureDump())).toEqual([]);
    expect(checkFixtureDump(fixtureDump())).toHaveLength(9);
  });

  it('catches a wrong font name (SemiBold with a capital B, ae-quirks #187)', () => {
    const d = fixtureDump();
    d.layers[1].props[0].children[0].value.font = 'SBSansDisplay-SemiBold';
    expect(failed(d)).toEqual(['TXT_NAME font is SBSansDisplay-Semibold']);
  });

  it('catches a bezier key and a missing key', () => {
    const d = fixtureDump();
    const keys = d.layers[3].props[0].children[0].keys;
    keys[0].outInterp = 'BEZIER';
    expect(failed(d)).toEqual(['PROBE_SQ keys are linear']);
    keys.pop();
    expect(failed(d)).toEqual([
      'PROBE_SQ Position has 4 keys', 'PROBE_SQ keys at 0/1/9/10 s = (100,100) (200,100) (200,100) (300,100)', 'PROBE_SQ keys are linear']);
  });

  it('catches an expression that does not give 100', () => {
    const d = fixtureDump();
    d.layers[2].props[0].children[0].expression.valueAt0 = 0;
    expect(failed(d)).toEqual(['TXT_ROLE Opacity expression reads ShowRole and gives 100']);
  });

  it('accepts the dropdown as AE 26.5 dumps it: a pseudo effect whose first parameter is Menu', () => {
    const d = fixtureDump();
    d.layers[0].effects[3].matchName = 'Pseudo/@@H9+Z0L1YQfegdADzjPemfg';
    d.layers[0].effects[3].params = [{ matchName: 'Pseudo/@@H9+Z0L1YQfegdADzjPemfg-0001', name: 'Menu', index: 1 }];
    expect(failed(d)).toEqual([]);
    d.layers[0].effects[3].params = [{ matchName: 'Pseudo/@@x-0001', name: 'Slider', index: 1 }];
    expect(failed(d)).toEqual(['CTRL effects by name and matchName']);
  });

  it('catches a lost protected region and a renamed control', () => {
    const d = fixtureDump();
    d.comp.markers[1].protectedRegion = false;
    d.layers[0].effects[3].matchName = 'ADBE Slider Control';
    expect(failed(d)).toEqual(['comp markers: protected 0-1 s "in", 9-10 s "out"', 'CTRL effects by name and matchName']);
  });
});
```

- [ ] **Step 6: Убедиться, что тест падает**

Run: `npx vitest run tests/dump/check-fixture-dump.test.mjs`
Expected: FAIL — `Cannot find module '../../tools/dump/check-fixture-dump.mjs'`.

- [ ] **Step 7: Создать `tools/dump/check-fixture-dump.mjs`**

```js
#!/usr/bin/env node
// Live check of the dumper against the phase-0 fixture (Plan 1, Task 7: CRT_fixture.aep).
//   node tools/dump/dump.mjs --slug fixture --project C:/CRBK/work/fixtures/CRT_fixture.aep
//   node tools/dump/check-fixture-dump.mjs [--dir C:/CRBK/work/dumps/fixture]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workPath } from '../lib/work.mjs';
import { findLayers, layerProp, readJson } from './model.mjs';

const near = (a, b, eps = 1e-3) => typeof a === 'number' && Math.abs(a - b) <= eps;

// Contract of CRT_LowerThird_v1 (fixture contract, Plan 1 Task 7).
const PROBE_KEYS = [[0, 100, 100], [1, 200, 100], [9, 200, 100], [10, 300, 100]];
const CTRL_EFFECTS = [
  ['ShowRole', 'ADBE Checkbox Control'], ['Duration', 'ADBE Slider Control'], ['Accent', 'ADBE Color Control'],
  ['Style', 'ADBE Dropdown Control'], ['QA', 'ADBE Checkbox Control'],
];

export function checkFixtureDump(dump) {
  const checks = [];
  const add = (name, pass, detail = '') => checks.push({ name, pass: Boolean(pass), detail: String(detail) });
  const c = dump.comp || {};
  add('comp 1920x1080, 25 fps, 10 s', c.width === 1920 && c.height === 1080 && near(c.frameRate, 25) && near(c.duration, 10),
    `${c.width}x${c.height}, ${c.frameRate} fps, ${c.duration} s`);

  const probe = findLayers(dump, 'PROBE_SQ')[0];
  const keys = ((probe && layerProp(probe, 'ADBE Transform Group', 'ADBE Position')) || {}).keys || [];
  add('PROBE_SQ Position has 4 keys', keys.length === 4, `${keys.length} keys`);
  add('PROBE_SQ keys at 0/1/9/10 s = (100,100) (200,100) (200,100) (300,100)',
    keys.length === 4 && PROBE_KEYS.every(([t, x, y], i) => near(keys[i].time, t) && Array.isArray(keys[i].value) &&
      near(keys[i].value[0], x) && near(keys[i].value[1], y)),
    keys.map((k) => `${k.time}s:(${Array.isArray(k.value) ? k.value.slice(0, 2).join(',') : '?'})`).join(' '));
  add('PROBE_SQ keys are linear', keys.length === 4 && keys.every((k) => k.inInterp === 'LINEAR' && k.outInterp === 'LINEAR'),
    keys.map((k) => `${k.inInterp}/${k.outInterp}`).join(' '));

  const name = findLayers(dump, 'TXT_NAME')[0];
  const st = name && layerProp(name, 'ADBE Text Properties', 'ADBE Text Document');
  const doc = st ? (st.value || (st.keys && st.keys[0] && st.keys[0].value)) : null;
  add('TXT_NAME font is SBSansDisplay-Semibold', doc && doc.font === 'SBSansDisplay-Semibold', doc ? doc.font : 'no Source Text');
  add('TXT_NAME is "Имя Фамилия", 60 px', doc && doc.text === 'Имя Фамилия' && near(doc.fontSize, 60),
    doc ? `"${doc.text}", ${doc.fontSize} px` : '');

  const marks = c.markers || [];
  const want = [[0, 1, 'in'], [9, 1, 'out']];
  add('comp markers: protected 0-1 s "in", 9-10 s "out"',
    marks.length === 2 && want.every(([t, d, cm], i) => near(marks[i].time, t) && near(marks[i].duration, d) &&
      marks[i].comment === cm && marks[i].protectedRegion === true),
    marks.map((m) => `${m.time}+${m.duration} "${m.comment}" protected=${m.protectedRegion}`).join('; '));

  const ctrl = findLayers(dump, 'CTRL')[0];
  const fx = ctrl ? ctrl.effects : [];
  // AE 26.5 dumps a Dropdown Menu Control as a per-instance pseudo effect "Pseudo/@@<id>" whose first
  // parameter is "Menu" (seen live 2026-10-02); that counts as 'ADBE Dropdown Control'.
  const isDropdown = (e) => /^Pseudo\/@@/.test(e.matchName) && Array.isArray(e.params) && e.params.length > 0 &&
    e.params[0].name === 'Menu' && e.params[0].matchName === e.matchName + '-0001';
  const matches = (e, mn) => e.matchName === mn || (mn === 'ADBE Dropdown Control' && isDropdown(e));
  add('CTRL effects by name and matchName', CTRL_EFFECTS.every(([n, mn]) => fx.some((e) => e.name === n && matches(e, mn))),
    fx.map((e) => `${e.name}=${e.matchName}`).join(', '));

  const role = findLayers(dump, 'TXT_ROLE')[0];
  const op = role && layerProp(role, 'ADBE Transform Group', 'ADBE Opacity');
  const ex = op && op.expression;
  add('TXT_ROLE Opacity expression reads ShowRole and gives 100',
    ex && /ShowRole/.test(ex.text) && ex.error === '' && near(ex.valueAt0, 100),
    ex ? `${ex.text.replace(/\s+/g, ' ').slice(0, 80)} = ${ex.valueAt0}` : 'no expression');
  return checks;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--dir');
  const dir = i === -1 ? workPath('dumps', 'fixture') : argv[i + 1];
  const index = readJson(path.join(dir, 'index.json'));
  const entry = index.comps.find((c) => c.name === 'CRT_LowerThird_v1');
  if (!entry) { console.error('CRT_LowerThird_v1 is not in ' + dir + '/index.json'); process.exit(1); }
  const dump = readJson(path.join(dir, entry.file));
  const checks = checkFixtureDump(dump);
  for (const ch of checks) console.log(`${ch.pass ? 'PASS' : 'FAIL'}  ${ch.name}  | ${ch.detail}`);
  console.log(`renderer: ${dump.comp.renderer}; available: ${(dump.comp.renderers || []).join(', ')}`);
  const failed = checks.filter((ch) => !ch.pass).length;
  console.log(failed ? `${failed} of ${checks.length} checks failed` : `all ${checks.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
```

- [ ] **Step 8: Запустить тест**

Run: `npx vitest run tests/dump/check-fixture-dump.test.mjs`
Expected: `6 passed`.

- [ ] **Step 9: Написать фейковый хост AE и падающие тесты дампера**

Фейковый хост исполняется внутри `node:vm` в одном контексте с JSX, иначе `instanceof Array` в JSX не узнаёт массивы. Он моделирует только то, что читает дампер.

`tests/dump/fake-ae-host.js`:

```js
// A tiny fake of the After Effects object model, enough to run tools/dump/dump-project.jsx in node:vm.
// It is evaluated INSIDE the vm context, so arrays and classes belong to the same realm as the JSX.
// Only the API surface the dumper reads is modelled; enum numbers are arbitrary but distinct.
var PropertyValueType = { NO_VALUE: 6412, ThreeD_SPATIAL: 6413, ThreeD: 6414, TwoD_SPATIAL: 6415, TwoD: 6416, OneD: 6417,
  COLOR: 6418, CUSTOM_VALUE: 6419, MARKER: 6420, LAYER_INDEX: 6421, MASK_INDEX: 6422, SHAPE: 6423, TEXT_DOCUMENT: 6424 };
var PropertyType = { PROPERTY: 6212, INDEXED_GROUP: 6213, NAMED_GROUP: 6214 };
var KeyframeInterpolationType = { LINEAR: 6612, BEZIER: 6613, HOLD: 6614 };
var BlendingMode = { NORMAL: 5212, ADD: 5220, SCREEN: 5222, MULTIPLY: 5216 };
var TrackMatteType = { ALPHA: 5012, ALPHA_INVERTED: 5013, LUMA: 5014, LUMA_INVERTED: 5015, NO_TRACK_MATTE: 5016 };
var MaskMode = { NONE: 6812, ADD: 6813, SUBTRACT: 6814, INTERSECT: 6815 };
var LayerQuality = { BEST: 4614, DRAFT: 4613, WIREFRAME: 4612 };
var ParagraphJustification = { LEFT_JUSTIFY: 7413, RIGHT_JUSTIFY: 7414, CENTER_JUSTIFY: 7415 };
var CloseOptions = { DO_NOT_SAVE_CHANGES: 1212, PROMPT_TO_SAVE_CHANGES: 1213, SAVE_CHANGES: 1214 };
var $ = { os: 'Windows/64 10.0' };

var __files = {};
var __calls = [];
var __existing = {};

function File(p) {
  this._path = p;
  this.fsName = String(p).replace(/\//g, '\\');
  this.encoding = '';
  this.lineFeed = '';
  this.error = '';
  this.exists = __existing[p] === true;
}
File.prototype.open = function () { this._buf = ''; return true; };
File.prototype.write = function (s) { this._buf += s; return true; };
File.prototype.close = function () { __files[this._path] = this._buf; return true; };

function Prop(o) {
  this.matchName = o.matchName;
  this.name = o.name || o.matchName;
  this.propertyIndex = 0;
  this.propertyType = PropertyType.PROPERTY;
  this.propertyValueType = PropertyValueType[o.pvt || 'OneD'];
  this.isModified = o.modified !== false;
  this.canSetExpression = o.pvt !== 'NO_VALUE' && o.pvt !== 'CUSTOM_VALUE';
  this.expression = o.expression || '';
  this.expressionEnabled = !!o.expression;
  this.expressionError = o.expressionError || '';
  this.isSeparationLeader = !!o.leader;
  this.dimensionsSeparated = false;
  this.isSeparationFollower = false;
  this.isSpatial = !!o.spatial;
  this._value = o.value;
  this._keys = o.keys || [];
  if (o.canSetEnabled) { this.canSetEnabled = true; this.enabled = o.enabled !== false; }
}
Prop.prototype = {
  get numKeys() { return this._keys.length; },
  valueAtTime: function () { if (this.propertyValueType === PropertyValueType.CUSTOM_VALUE) { throw new Error('custom'); } return this._value; },
  keyTime: function (k) { return this._keys[k - 1].time; },
  keyValue: function (k) { return this._keys[k - 1].value; },
  keyInInterpolationType: function (k) { return KeyframeInterpolationType[this._keys[k - 1].interp || 'LINEAR']; },
  keyOutInterpolationType: function (k) { return KeyframeInterpolationType[this._keys[k - 1].interp || 'LINEAR']; },
  keyInTemporalEase: function () { return [{ speed: 0, influence: 16.666666666 }]; },
  keyOutTemporalEase: function () { return [{ speed: 0, influence: 33.3333333 }]; },
  keyTemporalContinuous: function () { return false; },
  keyTemporalAutoBezier: function () { return false; },
  keyInSpatialTangent: function () { this._spatialOnly(); return [0, 0, 0]; },
  keyOutSpatialTangent: function () { this._spatialOnly(); return [0, 0, 0]; },
  keySpatialContinuous: function () { this._spatialOnly(); return false; },
  keySpatialAutoBezier: function () { this._spatialOnly(); return false; },
  keyRoving: function () { this._spatialOnly(); return false; },
  keyLabel: function () { return 0; },
  _spatialOnly: function () { if (!this.isSpatial) { throw new Error('not a spatial property'); } }
};

function Group(o) {
  var i;
  this.matchName = o.matchName;
  this.name = o.name || o.matchName;
  this.propertyIndex = 0;
  this.propertyType = PropertyType[o.type || 'NAMED_GROUP'];
  this._children = o.children || [];
  for (i = 0; i < this._children.length; i++) { this._children[i].propertyIndex = i + 1; }
  if (o.canSetEnabled) { this.canSetEnabled = true; this.enabled = o.enabled !== false; }
  if (o.extra) { for (i in o.extra) { this[i] = o.extra[i]; } }
}
Group.prototype = {
  get numProperties() { return this._children.length; },
  property: function (key) {
    var i;
    if (typeof key === 'number') { return this._children[key - 1]; }
    for (i = 0; i < this._children.length; i++) {
      if (this._children[i].matchName === key || this._children[i].name === key) { return this._children[i]; }
    }
    return null;
  }
};

function MarkerProp(list) { this._list = list; }
MarkerProp.prototype = {
  get numKeys() { return this._list.length; },
  keyTime: function (k) { return this._list[k - 1].time; },
  keyValue: function (k) { return this._list[k - 1].value; }
};

function TextDocument(o) { var k; for (k in o) { this[k] = o[k]; } }
Object.defineProperty(TextDocument.prototype, 'strokeColor', {
  get: function () { if (!this.applyStroke) { throw new Error('strokeColor: applyStroke is false'); } return this._strokeColor; }
});

function CompItem() {}
function FolderItem() {}
function FootageItem() {}
function SolidSource() {}
function FileSource() {}
function PlaceholderSource() {}
function AVLayer() {}
function ShapeLayer() {}
function TextLayer() {}
function CameraLayer() {}
function LightLayer() {}

function make(Cls, o) { var x = new Cls(), k; for (k in o) { x[k] = o[k]; } return x; }

function makeLayer(Cls, o, groups) {
  var L = make(Cls, o);
  var g = new Group({ matchName: o.matchName || 'ADBE AV Layer', children: groups });
  L._group = g;
  L.numProperties = groups.length;
  L.property = function (key) { return g.property(key); };
  return L;
}

function transformGroup(pos, posKeys) {
  return new Group({ matchName: 'ADBE Transform Group', name: 'Transform', children: [
    new Prop({ matchName: 'ADBE Anchor Point', pvt: 'ThreeD_SPATIAL', spatial: true, value: [0, 0, 0] }),
    new Prop({ matchName: 'ADBE Position', pvt: 'ThreeD_SPATIAL', spatial: true, leader: true, value: pos, keys: posKeys }),
    new Prop({ matchName: 'ADBE Scale', pvt: 'ThreeD', value: [100, 100, 100] }),
    new Prop({ matchName: 'ADBE Opacity', pvt: 'OneD', value: 100 })
  ] });
}
```

`tests/dump/dump-project.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { composeDumpJsx } from '../../tools/dump/dump.mjs';
import { lintOrThrow } from '../../tools/host-run.mjs';

const FAKE = readFileSync(new URL('./fake-ae-host.js', import.meta.url), 'utf8');

// One project with one comp; the layer set covers every branch the dumper takes.
const SCENE = `
var root = make(FolderItem, { id: 1, name: 'Root' });
var folder = make(FolderItem, { id: 2, name: 'Comps', parentFolder: root });
var solid = make(FootageItem, { id: 3, name: 'Magenta Solid 1', parentFolder: root, width: 40, height: 40, pixelAspect: 1,
  frameRate: 0, duration: 0, hasVideo: true, hasAudio: false, footageMissing: false,
  mainSource: make(SolidSource, { color: [1, 0, 1] }), usedIn: [] });
var comp = make(CompItem, { id: 10, name: 'CRT_Test', parentFolder: folder, width: 1920, height: 1080, pixelAspect: 1,
  frameRate: 25, frameDuration: 0.04, duration: 10, displayStartTime: 0, workAreaStart: 0, workAreaDuration: 10,
  bgColor: [0, 0, 0], renderer: 'ADBE Advanced 3d', renderers: ['ADBE Advanced 3d'], motionBlur: false, shutterAngle: 180,
  shutterPhase: -90, numLayers: 4, usedIn: [],
  markerProperty: new MarkerProp([
    { time: 0, value: { comment: 'in', duration: 1, protectedRegion: true, label: 0, getParameters: function () { return {}; } } },
    { time: 9, value: { comment: 'out', duration: 1, protectedRegion: true, label: 0, getParameters: function () { return {}; } } }
  ]) });
solid.usedIn = [comp];
var probe = makeLayer(AVLayer, { index: 1, id: 101, name: 'PROBE_SQ', isNameSet: true, inPoint: 0, outPoint: 10, startTime: 0,
  stretch: 100, parent: null, blendingMode: BlendingMode.NORMAL, trackMatteType: TrackMatteType.NO_TRACK_MATTE,
  trackMatteLayer: null, enabled: true, threeDLayer: false, nullLayer: false, adjustmentLayer: false, source: solid,
  quality: LayerQuality.BEST }, [
  new MarkerProp([]),
  transformGroup([100, 100, 0], [
    { time: 0, value: [100, 100, 0] }, { time: 1, value: [200, 100, 0] },
    { time: 9, value: [200, 100, 0] }, { time: 10, value: [300, 100, 0] }])
]);
probe._group._children[0].matchName = 'ADBE Marker';
var doc = new TextDocument({ text: 'Имя', font: 'SBSansDisplay-Semibold', fontSize: 60, applyFill: true,
  applyStroke: false, fillColor: [1, 1, 1], tracking: 0, autoLeading: true, leading: 0,
  justification: ParagraphJustification.LEFT_JUSTIFY, boxText: false, pointText: true,
  fontObject: { postScriptName: 'SBSansDisplay-Semibold', version: '1.002', location: 'C:/Windows/Fonts/x.otf', isSubstitute: false } });
var txt = makeLayer(TextLayer, { index: 2, id: 102, name: 'TXT_NAME', isNameSet: true, inPoint: 0, outPoint: 10, startTime: 0,
  stretch: 100, parent: probe, blendingMode: BlendingMode.NORMAL, trackMatteType: TrackMatteType.ALPHA, trackMatteLayer: null,
  enabled: true, source: null, matchName: 'ADBE Text Layer' }, [
  new Group({ matchName: 'ADBE Text Properties', name: 'Text', children: [
    new Prop({ matchName: 'ADBE Text Document', name: 'Source Text', pvt: 'TEXT_DOCUMENT', value: doc })] }),
  transformGroup([200, 800, 0], [])
]);
var shape = makeLayer(ShapeLayer, { index: 3, id: 103, name: 'PL_NAME', isNameSet: true, inPoint: 0, outPoint: 10, startTime: 0,
  stretch: 100, parent: null, blendingMode: BlendingMode.NORMAL, trackMatteType: TrackMatteType.NO_TRACK_MATTE,
  trackMatteLayer: null, enabled: true, source: null, matchName: 'ADBE Vector Layer' }, [
  new Group({ matchName: 'ADBE Root Vectors Group', name: 'Contents', type: 'INDEXED_GROUP', children: [
    new Group({ matchName: 'ADBE Vector Group', name: 'Plate', canSetEnabled: true, children: [
      new Group({ matchName: 'ADBE Vectors Group', name: 'Contents', type: 'INDEXED_GROUP', children: [
        new Group({ matchName: 'ADBE Vector Shape - Group', name: 'Path 1', canSetEnabled: true, children: [
          new Prop({ matchName: 'ADBE Vector Shape', name: 'Path', pvt: 'SHAPE', value: { closed: true,
            vertices: [[0, 0], [10, 0], [10, 10], [0, 10]], inTangents: [[0, 0], [0, 0], [0, 0], [0, 0]],
            outTangents: [[0, 0], [0, 0], [0, 0], [0, 0]] } })] }),
        new Group({ matchName: 'ADBE Vector Graphic - Fill', name: 'Fill 1', canSetEnabled: true, children: [
          new Prop({ matchName: 'ADBE Vector Fill Color', name: 'Color', pvt: 'COLOR', value: [0.133333, 0.133333, 0.133333, 1],
            expression: 'thisComp.layer("CTRL").effect("Style")(1) == 1 ? [0.13,0.13,0.13,1] : [0.95,0.95,0.95,1]' })] })
      ] })] })] }),
  transformGroup([960, 540, 0], [])
]);
var ctrl = makeLayer(AVLayer, { index: 4, id: 104, name: 'CTRL', isNameSet: true, inPoint: 0, outPoint: 10, startTime: 0,
  stretch: 100, parent: null, blendingMode: BlendingMode.NORMAL, trackMatteType: TrackMatteType.NO_TRACK_MATTE,
  trackMatteLayer: null, enabled: false, nullLayer: true, source: solid }, [
  new Group({ matchName: 'ADBE Effect Parade', name: 'Effects', type: 'INDEXED_GROUP', children: [
    new Group({ matchName: 'ADBE Slider Control', name: 'Duration', canSetEnabled: true, children: [
      new Prop({ matchName: 'ADBE Slider Control-0001', name: 'Slider', value: 10 })] }),
    new Group({ matchName: 'ADBE Dropdown Control', name: 'Style', canSetEnabled: true, children: [
      new Prop({ matchName: 'ADBE Dropdown Control-0001', name: 'Menu', value: 1 })] })] }),
  new Group({ matchName: 'ADBE Mask Parade', name: 'Masks', type: 'INDEXED_GROUP', children: [
    new Group({ matchName: 'ADBE Mask Atom', name: 'Mask 1', extra: { maskMode: MaskMode.ADD, inverted: false, locked: false, color: [1, 0, 0] },
      children: [
        new Prop({ matchName: 'ADBE Mask Shape', name: 'Mask Path', pvt: 'SHAPE', value: { closed: true, vertices: [[0, 0], [5, 0], [5, 5]],
          inTangents: [[0, 0], [0, 0], [0, 0]], outTangents: [[0, 0], [0, 0], [0, 0]] } }),
        new Prop({ matchName: 'ADBE Mask Feather', name: 'Mask Feather', pvt: 'TwoD', value: [0, 0] }),
        new Prop({ matchName: 'ADBE Mask Opacity', name: 'Mask Opacity', value: 100 }),
        new Prop({ matchName: 'ADBE Mask Offset', name: 'Mask Expansion', value: 0 })] })] }),
  transformGroup([0, 0, 0], [])
]);
txt.trackMatteLayer = shape;
var layers = [probe, txt, shape, ctrl];
comp.layer = function (i) { return layers[i - 1]; };
var items = [folder, solid, comp];
var project = { file: { fsName: 'C:\\\\CRBK\\\\work\\\\fixtures\\\\t.aep' }, dirty: false, rootFolder: root, numItems: 3,
  expressionEngine: 'javascript-1.0', bitsPerChannel: 8, item: function (i) { return items[i - 1]; },
  itemByID: function (id) { for (var i = 0; i < items.length; i++) { if (items[i].id === id) { return items[i]; } } return null; },
  close: function (opt) { __calls.push('close:' + opt); } };
var app = { version: '26.5x50', isoLanguage: 'ru_RU', project: project,
  beginSuppressDialogs: function () { __calls.push('suppress'); }, endSuppressDialogs: function () { __calls.push('unsuppress'); },
  open: function (f) { __calls.push('open:' + f._path); project.file = { fsName: f.fsName }; return project; } };
`;

function runOp(params, tweak = '') {
  const ctx = vm.createContext({});
  vm.runInContext(FAKE + SCENE + tweak, ctx);
  const reply = JSON.parse(vm.runInContext(composeDumpJsx(params), ctx));
  const files = vm.runInContext('__files', ctx);
  const calls = vm.runInContext('__calls', ctx);
  return { reply, files, calls };
}

const PROJECT = 'C:/CRBK/work/fixtures/t.aep';
const OUT = 'C:/CRBK/work/dumps/t/_raw/c10.json';

describe('dump-project.jsx', () => {
  it('passes the ES3 lint used by host-run', () => {
    expect(() => lintOrThrow(composeDumpJsx({ op: 'comp', project: PROJECT, compId: 10, out: OUT }))).not.toThrow();
  });

  it('dumps comp settings and protected-region markers', () => {
    const { reply, files } = runOp({ op: 'comp', project: PROJECT, compId: 10, out: OUT });
    expect(reply.ok).toBe(true);
    const d = JSON.parse(files[OUT]);
    expect(d.schema).toBe('crbk-dump/1');
    expect(d.comp).toMatchObject({ name: 'CRT_Test', folder: 'Comps', width: 1920, frameRate: 25, renderer: 'ADBE Advanced 3d' });
    expect(d.comp.markers.map((m) => [m.time, m.comment, m.duration, m.protectedRegion]))
      .toEqual([[0, 'in', 1, true], [9, 'out', 1, true]]);
    expect(d.layers.map((l) => [l.name, l.type])).toEqual([['PROBE_SQ', 'av'], ['TXT_NAME', 'text'], ['PL_NAME', 'shape'], ['CTRL', 'null']]);
  });

  it('records keyframes with interpolation, eases and spatial tangents', () => {
    const d = JSON.parse(runOp({ op: 'comp', project: PROJECT, compId: 10, out: OUT }).files[OUT]);
    const pos = d.layers[0].props.find((p) => p.matchName === 'ADBE Transform Group').children.find((p) => p.matchName === 'ADBE Position');
    expect(pos.keys.map((k) => [k.time, k.value])).toEqual([[0, [100, 100, 0]], [1, [200, 100, 0]], [9, [200, 100, 0]], [10, [300, 100, 0]]]);
    expect(pos.keys[1]).toMatchObject({ inInterp: 'LINEAR', outInterp: 'LINEAR', inSpatial: [0, 0, 0], roving: false });
    expect(pos.keys[1].inEase).toEqual([{ speed: 0, influence: 16.666667 }]);
    expect(pos.dimensionsSeparated).toBe(false);
    expect(d.layers[0].source).toMatchObject({ kind: 'solid', color: [1, 0, 1] });
    expect(d.layers[0].markers).toEqual([]);
  });

  it('reads text documents without touching strokeColor when there is no stroke', () => {
    const d = JSON.parse(runOp({ op: 'comp', project: PROJECT, compId: 10, out: OUT }).files[OUT]);
    const st = d.layers[1].props[0].children[0];
    expect(st.pvt).toBe('TEXT_DOCUMENT');
    expect(st.value).toMatchObject({ font: 'SBSansDisplay-Semibold', fontSize: 60, fillColor: [1, 1, 1], justification: 'LEFT_JUSTIFY' });
    expect(st.value.strokeColor).toBeUndefined();
    expect(st.value.fontObject).toMatchObject({ version: '1.002', isSubstitute: false });
    expect(d.layers[1].parent).toBe(1);
    expect(d.layers[1].trackMatte).toEqual({ type: 'ALPHA', hasTrackMatte: undefined, isTrackMatte: undefined, layer: 3, api: 'trackMatteLayer' });
  });

  it('walks shape contents, expressions, effects and masks', () => {
    const d = JSON.parse(runOp({ op: 'comp', project: PROJECT, compId: 10, out: OUT }).files[OUT]);
    const group = d.layers[2].props[0].children[0];
    expect(group).toMatchObject({ matchName: 'ADBE Vector Group', name: 'Plate', enabled: true, group: 'NAMED_GROUP' });
    const [pathGroup, fill] = group.children[0].children;
    expect(pathGroup.children[0].value).toMatchObject({ closed: true, count: 4, vertices: [[0, 0], [10, 0], [10, 10], [0, 10]] });
    expect(fill.children[0].expression).toMatchObject({ enabled: true, error: '', valueAt0: [0.133333, 0.133333, 0.133333, 1] });
    expect(d.layers[3].effects.map((e) => [e.matchName, e.name, e.params[0].value]))
      .toEqual([['ADBE Slider Control', 'Duration', 10], ['ADBE Dropdown Control', 'Style', 1]]);
    expect(d.layers[3].masks[0]).toMatchObject({ mode: 'ADD', inverted: false, path: { value: { count: 3 } }, opacity: { value: 100 } });
    expect(d.layers[3].props.map((p) => p.matchName)).toEqual(['ADBE Transform Group']);
    expect(d.layers[3].switches.enabled).toBe(false);
    expect(d.stats).toMatchObject({ layers: 4, keys: 4, expressions: 1, expressionErrors: 0 });
  });

  it('evaluates expressions unless told not to', () => {
    const fillColor = (d) => d.layers[2].props[0].children[0].children[0].children[1].children[0];
    const on = JSON.parse(runOp({ op: 'comp', project: PROJECT, compId: 10, out: OUT }).files[OUT]);
    expect(fillColor(on).expression.valueAt0).toEqual([0.133333, 0.133333, 0.133333, 1]);
    const off = JSON.parse(runOp({ op: 'comp', project: PROJECT, compId: 10, out: OUT, caps: { evalExpressions: 0 } }).files[OUT]);
    expect(fillColor(off).expression.valueAt0).toBeUndefined();
    expect(fillColor(off).expression.text).toContain('Style');
  });

  it('suppresses dialogs while it reads a comp', () => {
    expect(runOp({ op: 'comp', project: PROJECT, compId: 10, out: OUT }).calls).toEqual(['suppress', 'unsuppress']);
  });

  it('caps huge arrays and records what it skipped', () => {
    const caps = { maxKeys: 2, maxVertices: 3 };
    const d = JSON.parse(runOp({ op: 'comp', project: PROJECT, compId: 10, out: OUT, caps }).files[OUT]);
    const pos = d.layers[0].props[0].children.find((p) => p.matchName === 'ADBE Position');
    expect(pos.keys).toHaveLength(2);
    expect(pos.keysTotal).toBe(4);
    expect(d.truncated).toEqual([
      { path: 'L1/ADBE Transform Group/ADBE Position', what: 'keys', count: 4 },
      { path: 'L3/ADBE Root Vectors Group/ADBE Vector Group/ADBE Vectors Group/ADBE Vector Shape - Group/ADBE Vector Shape', what: 'vertices', count: 4 },
    ]);
  });

  it('refuses a project with unsaved changes and a comp of another project', () => {
    expect(runOp({ op: 'open', project: 'C:/CRBK/packs/a/a.aep', out: 'C:/x.json' }, 'project.dirty = true;').reply.error.code).toBe('PROJECT_DIRTY');
    expect(runOp({ op: 'comp', project: 'C:/CRBK/packs/a/a.aep', compId: 10, out: OUT }).reply.error.code).toBe('WRONG_PROJECT');
  });

  it('opens another project with dialogs suppressed and writes the inventory', () => {
    const { reply, files, calls } = runOp({ op: 'open', project: 'C:/CRBK/packs/a/a.aep', out: 'C:/x.json' },
      "__existing['C:/CRBK/packs/a/a.aep'] = true;");
    expect(calls).toEqual(['suppress', 'open:C:/CRBK/packs/a/a.aep', 'unsuppress']);
    expect(reply.data.comps).toEqual([{ id: 10, name: 'CRT_Test', folder: 'Comps', numLayers: 4 }]);
    const inv = JSON.parse(files['C:/x.json']);
    expect(inv.items.map((i) => i.kind)).toEqual(['folder', 'footage', 'comp']);
    expect(inv.items[1].source).toMatchObject({ kind: 'solid' });
    expect(inv.expressionEngine).toBe('javascript-1.0');
  });

  it('closes only the project it was asked about, without saving', () => {
    expect(runOp({ op: 'close', project: 'C:/other.aep' }).reply.data.closed).toBe(false);
    const { reply, calls } = runOp({ op: 'close', project: PROJECT });
    expect(reply.data.closed).toBe(true);
    expect(calls).toEqual(['close:1212']);
  });
});
```

`tests/dump/dump.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compFiles, dumpProject, packProject, parseArgs, composeDumpJsx } from '../../tools/dump/dump.mjs';
import { compSlugs } from '../../tools/packs/slug.mjs';

// A fake host that answers the three ops the way dump-project.jsx does and writes the files it is asked to.
function fakeHost(comps, { failId = null } = {}) {
  const calls = [];
  const host = async (params) => {
    calls.push(params.op + (params.compId ? ':' + params.compId : ''));
    if (params.op === 'open') {
      writeFileSync(params.out, JSON.stringify({ schema: 'crbk-dump/1', items: [], comps }));
      return { ok: true, data: { file: 'C:\\x.aep', aeVersion: '26.5', expressionEngine: 'extendscript', numItems: 3, missingFootage: 0, comps, bytes: 10, ms: 1 } };
    }
    if (params.op === 'comp') {
      if (params.compId === failId) return { ok: false, error: { code: 'HOST_EXCEPTION', message: 'boom' } };
      const c = comps.find((x) => x.id === params.compId);
      writeFileSync(params.out, JSON.stringify({ schema: 'crbk-dump/1', comp: { id: c.id, name: c.name }, layers: [{ index: 1 }], truncated: [], stats: {} }));
      return { ok: true, data: { compId: c.id, bytes: 99, truncated: 0, stats: { ms: 5, expressions: 2, expressionErrors: 0 } } };
    }
    return { ok: true, data: { closed: true } };
  };
  return { host, calls };
}

describe('dump.mjs', () => {
  it('derives the relinked copy path from the packs folder (tools/packs/paths.mjs)', () => {
    expect(packProject('logo', {}, 'win32')).toBe('C:/CRBK/packs/logo/logo_relinked.aep');
    expect(packProject('smm', { BRANDKIT_WORK: 'D:\\bk\\work' }, 'win32')).toBe('D:/bk/packs/smm/smm_relinked.aep');
    expect(packProject('podcast', {}, 'darwin')).toBe('/Users/Shared/CRBK/packs/podcast/podcast_relinked.aep');
  });

  it('names comp files by the golden compSlug and moves only index and project aside', () => {
    const comps = [{ id: 796, name: 'Pattern_1' }, { id: 304, name: 'Pattern_1' }, { id: 9, name: 'Project' }, { id: 4, name: 'Index' }, { id: 5, name: 'Pre-comp 1' }];
    const files = compFiles(comps);
    expect([...files.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [4, { compSlug: 'index', file: 'index__4.json' }],
      [5, { compSlug: 'pre_comp_1', file: 'pre_comp_1.json' }],
      [9, { compSlug: 'project', file: 'project__9.json' }],
      [304, { compSlug: 'pattern_1', file: 'pattern_1.json' }],
      [796, { compSlug: 'pattern_1_2', file: 'pattern_1_2.json' }],
    ]);
    const golden = compSlugs(comps); // the names of the golden folders (Task 4)
    for (const [id, f] of files) expect(f.compSlug).toBe(golden.get(id));
  });

  it('parses the CLI', () => {
    expect(parseArgs(['--slug', 'logo'])).toEqual({ slug: 'logo', all: false, project: null, out: null, noEval: false });
    expect(parseArgs(['--slug', 'logo', '--no-eval'])).toMatchObject({ noEval: true });
    expect(parseArgs(['--all'])).toMatchObject({ all: true });
    expect(() => parseArgs([])).toThrow(/usage/);
    expect(() => parseArgs(['--all', '--slug', 'x'])).toThrow(/usage/);
    expect(() => parseArgs(['--slug', 'x', '--bogus'])).toThrow(/unknown argument/);
  });

  it('prepends PARAMS to the JSX', () => {
    expect(composeDumpJsx({ op: 'close', project: 'C:/a.aep' }).split('\n')[0]).toBe('var PARAMS = {"op":"close","project":"C:/a.aep"};');
  });

  it('writes one file per comp, index.json and project.json, then swaps the folder in', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'bk-dump-'));
    const comps = [{ id: 10, name: 'Logo', folder: 'A', numLayers: 1 }, { id: 11, name: 'Logo', folder: 'B', numLayers: 1 }, { id: 12, name: 'Index', folder: 'B', numLayers: 1 }];
    const { host, calls } = fakeHost(comps);
    const index = await dumpProject({ slug: 'logo', project: 'C:/p.aep', outRoot: root.replace(/\\/g, '/'), host, log: () => {} });
    expect(calls).toEqual(['open', 'comp:10', 'comp:11', 'comp:12', 'close']);
    expect(readdirSync(path.join(root, 'logo')).sort()).toEqual(['index.json', 'index__12.json', 'logo.json', 'logo_2.json', 'project.json']);
    expect(existsSync(path.join(root, 'logo.tmp'))).toBe(false);
    expect(index.comps.map((c) => [c.name, c.compSlug, c.file])).toEqual([
      ['Logo', 'logo', 'logo.json'], ['Logo', 'logo_2', 'logo_2.json'], ['Index', 'index', 'index__12.json']]);
    expect(JSON.parse(readFileSync(path.join(root, 'logo', 'index.json'), 'utf8')).schema).toBe('crbk-dump-index/1');
    const one = JSON.parse(readFileSync(path.join(root, 'logo', 'logo_2.json'), 'utf8'));
    expect(one).toMatchObject({ slug: 'logo', compSlug: 'logo_2', comp: { id: 11 } });
  });

  it('records a failed comp and keeps going', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'bk-dump-'));
    const comps = [{ id: 1, name: 'A', numLayers: 1 }, { id: 2, name: 'B', numLayers: 1 }];
    const { host } = fakeHost(comps, { failId: 1 });
    const index = await dumpProject({ slug: 's', project: 'C:/p.aep', outRoot: root.replace(/\\/g, '/'), host, log: () => {} });
    expect(index.errors).toEqual([{ id: 1, name: 'A', error: { code: 'HOST_EXCEPTION', message: 'boom' } }]);
    expect(index.comps.map((c) => c.name)).toEqual(['B']);
  });

  it('stops on a refused open and leaves the previous dump alone', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'bk-dump-'));
    const host = async () => ({ ok: false, error: { code: 'PROJECT_DIRTY', message: 'unsaved' } });
    await expect(dumpProject({ slug: 's', project: 'C:/p.aep', outRoot: root.replace(/\\/g, '/'), host, log: () => {} }))
      .rejects.toThrow(/PROJECT_DIRTY/);
    expect(existsSync(path.join(root, 's'))).toBe(false);
  });
});
```

- [ ] **Step 10: Убедиться, что тесты падают**

Run: `npx vitest run tests/dump/dump-project.test.mjs tests/dump/dump.test.mjs`
Expected: FAIL — `Cannot find module '../../tools/dump/dump.mjs'`.

- [ ] **Step 11: Создать `tools/dump/dump-project.jsx`**

Перед правкой этого файла сверяться с документацией (<https://ae-scripting.docsforadobe.dev/>), ссылки — в комментариях. Опорные факты оттуда:
- `TextDocument.fillColor` и `strokeColor` бросают исключение, если нет заливки или обводки; `boxTextSize` и `boxTextPos` — если текст не абзацный;
- `keyTime` возвращает время композиции; пространственные касательные и `keyRoving` бросают исключение у непространственных свойств;
- `Property.value` применяет выражение, `valueAtTime(t, true)` — нет, `valueAtTime(t, false)` — да;
- `Project.dirty` есть с AE 17.5;
- `trackMatteLayer` — с AE 23.0.

```js
// Read-only JSX dump of an After Effects project (ES3). Spec 3.2 "JSX-dump".
// tools/dump/dump.mjs prepends `var PARAMS = {...};` and runs one op per call:
//   { op: 'open', project, out }               open the project (refused when the current one has
//                                              unsaved changes), write the item inventory to `out`,
//                                              return the comp list
//   { op: 'comp', project, compId, out, caps } dump one comp of the open project into `out`;
//                                              caps: maxKeys, maxVertices, maxText, maxExpr, evalExpressions (1/0)
//   { op: 'close', project }                   close that project without saving
// Never renders, never saves. Every host read is guarded: a failed read is recorded, never thrown.
// Everything lives in one closure: only PARAMS and CRBK_DUMP become globals of the shared engine.
// API reference: https://ae-scripting.docsforadobe.dev/

var CRBK_DUMP = (function () {
  var DUMP_SCHEMA = 'crbk-dump/1';
  var DEFAULT_CAPS = { maxKeys: 1000, maxVertices: 5000, maxText: 20000, maxExpr: 50000, evalExpressions: 1 };

  function rd(obj, key) {
    try {
      return obj[key];
    } catch (e) {
      return undefined;
    }
  }

  function num(x) {
    if (typeof x !== 'number' || !isFinite(x)) { return x; }
    return Math.round(x * 1000000) / 1000000;
  }

  function nums(a) {
    var out = [], i;
    if (!(a instanceof Array)) { return num(a); }
    for (i = 0; i < a.length; i++) { out.push(a[i] instanceof Array ? nums(a[i]) : num(a[i])); }
    return out;
  }

  // Enum value -> name. The enums are AE globals; typeof keeps a missing one from throwing.
  function enumMap(en, names) {
    var m = {}, i, v;
    if (en === undefined || en === null) { return m; }
    for (i = 0; i < names.length; i++) {
      try { v = en[names[i]]; } catch (e) { v = undefined; }
      if (v !== undefined) { m[String(v)] = names[i]; }
    }
    return m;
  }

  function enumName(map, v) {
    var s;
    if (v === undefined || v === null) { return v; }
    s = map[String(v)];
    return s === undefined ? String(v) : s;
  }

  var E = {
    // https://ae-scripting.docsforadobe.dev/property/property/#propertypropertyvaluetype
    pvt: enumMap(typeof PropertyValueType === 'undefined' ? undefined : PropertyValueType,
      ['NO_VALUE', 'ThreeD_SPATIAL', 'ThreeD', 'TwoD_SPATIAL', 'TwoD', 'OneD', 'COLOR', 'CUSTOM_VALUE',
        'MARKER', 'LAYER_INDEX', 'MASK_INDEX', 'SHAPE', 'TEXT_DOCUMENT']),
    ptype: enumMap(typeof PropertyType === 'undefined' ? undefined : PropertyType,
      ['PROPERTY', 'INDEXED_GROUP', 'NAMED_GROUP']),
    kit: enumMap(typeof KeyframeInterpolationType === 'undefined' ? undefined : KeyframeInterpolationType,
      ['LINEAR', 'BEZIER', 'HOLD']),
    // https://ae-scripting.docsforadobe.dev/layer/avlayer/#avlayerblendingmode
    blend: enumMap(typeof BlendingMode === 'undefined' ? undefined : BlendingMode,
      ['NORMAL', 'DISSOLVE', 'DANCING_DISSOLVE', 'DARKEN', 'MULTIPLY', 'COLOR_BURN', 'CLASSIC_COLOR_BURN',
        'LINEAR_BURN', 'DARKER_COLOR', 'ADD', 'LIGHTEN', 'SCREEN', 'COLOR_DODGE', 'CLASSIC_COLOR_DODGE',
        'LINEAR_DODGE', 'LIGHTER_COLOR', 'OVERLAY', 'SOFT_LIGHT', 'HARD_LIGHT', 'LINEAR_LIGHT', 'VIVID_LIGHT',
        'PIN_LIGHT', 'HARD_MIX', 'DIFFERENCE', 'CLASSIC_DIFFERENCE', 'EXCLUSION', 'SUBTRACT', 'DIVIDE', 'HUE',
        'SATURATION', 'COLOR', 'LUMINOSITY', 'STENCIL_ALPHA', 'STENCIL_LUMA', 'SILHOUETE_ALPHA',
        'SILHOUETTE_LUMA', 'ALPHA_ADD', 'LUMINESCENT_PREMUL']),
    matte: enumMap(typeof TrackMatteType === 'undefined' ? undefined : TrackMatteType,
      ['ALPHA', 'ALPHA_INVERTED', 'LUMA', 'LUMA_INVERTED', 'NO_TRACK_MATTE']),
    maskMode: enumMap(typeof MaskMode === 'undefined' ? undefined : MaskMode,
      ['NONE', 'ADD', 'SUBTRACT', 'INTERSECT', 'LIGHTEN', 'DARKEN', 'DIFFERENCE']),
    maskFalloff: enumMap(typeof MaskFeatherFalloff === 'undefined' ? undefined : MaskFeatherFalloff,
      ['FFO_LINEAR', 'FFO_SMOOTH']),
    maskBlur: enumMap(typeof MaskMotionBlur === 'undefined' ? undefined : MaskMotionBlur,
      ['SAME_AS_LAYER', 'ON', 'OFF']),
    quality: enumMap(typeof LayerQuality === 'undefined' ? undefined : LayerQuality,
      ['BEST', 'DRAFT', 'WIREFRAME']),
    sampling: enumMap(typeof LayerSamplingQuality === 'undefined' ? undefined : LayerSamplingQuality,
      ['BICUBIC', 'BILINEAR']),
    fbt: enumMap(typeof FrameBlendingType === 'undefined' ? undefined : FrameBlendingType,
      ['FRAME_MIX', 'NO_FRAME_BLEND', 'PIXEL_MOTION']),
    orient: enumMap(typeof AutoOrientType === 'undefined' ? undefined : AutoOrientType,
      ['ALONG_PATH', 'CAMERA_OR_POINT_OF_INTEREST', 'CHARACTERS_TOWARD_CAMERA', 'NO_AUTO_ORIENT']),
    // https://ae-scripting.docsforadobe.dev/text/textdocument/#textdocumentjustification
    just: enumMap(typeof ParagraphJustification === 'undefined' ? undefined : ParagraphJustification,
      ['LEFT_JUSTIFY', 'RIGHT_JUSTIFY', 'CENTER_JUSTIFY', 'FULL_JUSTIFY_LASTLINE_LEFT',
        'FULL_JUSTIFY_LASTLINE_RIGHT', 'FULL_JUSTIFY_LASTLINE_CENTER', 'FULL_JUSTIFY_LASTLINE_FULL',
        'MULTIPLE_JUSTIFICATIONS'])
  };

  function capText(s, max, path, ctx) {
    if (typeof s !== 'string' || s.length <= max) { return s; }
    ctx.truncated.push({ path: path, what: 'text', count: s.length });
    return s.substring(0, max);
  }

  function mergeCaps(caps) {
    var out = {}, k;
    for (k in DEFAULT_CAPS) {
      if (DEFAULT_CAPS.hasOwnProperty(k)) {
        out[k] = (caps && typeof caps[k] === 'number') ? caps[k] : DEFAULT_CAPS[k];
      }
    }
    return out;
  }

  function normPath(p) {
    var s = String(p || '').replace(/\\/g, '/');
    if (String($.os).toLowerCase().search('windows') !== -1) { s = s.toLowerCase(); }
    return s;
  }

  function projectPath() {
    var f = null;
    try { f = app.project ? app.project.file : null; } catch (e) { f = null; }
    return f ? f.fsName : '';
  }

  function folderPath(item) {
    var parts = [], f = rd(item, 'parentFolder'), root = app.project.rootFolder, guard = 0;
    while (f && f.id !== root.id && guard < 100) {
      parts.unshift(f.name);
      f = rd(f, 'parentFolder');
      guard += 1;
    }
    return parts.join('/');
  }

  function writeText(path, text) {
    var f = new File(path), ok;
    f.encoding = 'UTF-8';
    f.lineFeed = 'Unix';
    if (!f.open('w')) { throw new Error('cannot write ' + path + ': ' + f.error); }
    ok = f.write(text);
    f.close();
    if (!ok) { throw new Error('write failed ' + path + ': ' + f.error); }
    return text.length;
  }

  // https://ae-scripting.docsforadobe.dev/other/markervalue/ (label, protectedRegion: AE 16.0+)
  function markerList(mp) {
    var out = [], k, mv, m;
    if (!mp) { return out; }
    for (k = 1; k <= mp.numKeys; k++) {
      mv = mp.keyValue(k);
      m = {
        time: num(mp.keyTime(k)), comment: rd(mv, 'comment'), duration: num(rd(mv, 'duration')),
        chapter: rd(mv, 'chapter'), url: rd(mv, 'url'), frameTarget: rd(mv, 'frameTarget'),
        cuePointName: rd(mv, 'cuePointName'), eventCuePoint: rd(mv, 'eventCuePoint'),
        label: rd(mv, 'label'), protectedRegion: rd(mv, 'protectedRegion')
      };
      try { m.params = mv.getParameters(); } catch (e) { m.params = null; }
      out.push(m);
    }
    return out;
  }

  // https://ae-scripting.docsforadobe.dev/text/textdocument/ : fillColor and strokeColor throw unless
  // applyFill / applyStroke; boxTextSize and boxTextPos throw unless boxText.
  function textDoc(d, path, ctx) {
    var o = {}, fo;
    if (!d) { return null; }
    o.text = capText(rd(d, 'text'), ctx.caps.maxText, path, ctx);
    o.font = rd(d, 'font');
    o.fontSize = num(rd(d, 'fontSize'));
    o.applyFill = rd(d, 'applyFill');
    o.applyStroke = rd(d, 'applyStroke');
    if (o.applyFill === true) { o.fillColor = nums(rd(d, 'fillColor')); }
    if (o.applyStroke === true) {
      o.strokeColor = nums(rd(d, 'strokeColor'));
      o.strokeWidth = num(rd(d, 'strokeWidth'));
      o.strokeOverFill = rd(d, 'strokeOverFill');
    }
    o.tracking = num(rd(d, 'tracking'));
    o.autoLeading = rd(d, 'autoLeading');
    o.leading = num(rd(d, 'leading'));
    o.justification = enumName(E.just, rd(d, 'justification'));
    o.boxText = rd(d, 'boxText');
    o.pointText = rd(d, 'pointText');
    if (o.boxText === true) {
      o.boxTextSize = nums(rd(d, 'boxTextSize'));
      o.boxTextPos = nums(rd(d, 'boxTextPos'));
    }
    o.baselineShift = num(rd(d, 'baselineShift'));
    o.fauxBold = rd(d, 'fauxBold');
    o.fauxItalic = rd(d, 'fauxItalic');
    o.allCaps = rd(d, 'allCaps');
    o.smallCaps = rd(d, 'smallCaps');
    o.horizontalScale = num(rd(d, 'horizontalScale'));
    o.verticalScale = num(rd(d, 'verticalScale'));
    o.fontFamily = rd(d, 'fontFamily');
    o.fontStyle = rd(d, 'fontStyle');
    o.fontLocation = rd(d, 'fontLocation');
    // https://ae-scripting.docsforadobe.dev/text/fontobject/ (AE 24.0+)
    fo = rd(d, 'fontObject');
    if (fo) {
      o.fontObject = {
        postScriptName: rd(fo, 'postScriptName'), familyName: rd(fo, 'familyName'), styleName: rd(fo, 'styleName'),
        version: rd(fo, 'version'), location: rd(fo, 'location'), isSubstitute: rd(fo, 'isSubstitute')
      };
    }
    return o;
  }

  // https://ae-scripting.docsforadobe.dev/other/shape/ : tangents are relative to their vertex.
  function shapeVal(s, path, ctx) {
    var o = {}, n, fsl;
    if (!s) { return null; }
    o.closed = rd(s, 'closed');
    n = s.vertices ? s.vertices.length : 0;
    o.count = n;
    if (n > ctx.caps.maxVertices) {
      ctx.truncated.push({ path: path, what: 'vertices', count: n });
      o.skipped = true;
      return o;
    }
    o.vertices = nums(s.vertices);
    o.inTangents = nums(s.inTangents);
    o.outTangents = nums(s.outTangents);
    fsl = rd(s, 'featherSegLocs');
    if (fsl && fsl.length) {
      o.feather = {
        segLocs: nums(fsl), relSegLocs: nums(rd(s, 'featherRelSegLocs')), radii: nums(rd(s, 'featherRadii')),
        interps: nums(rd(s, 'featherInterps')), tensions: nums(rd(s, 'featherTensions')),
        types: nums(rd(s, 'featherTypes')), relCornerAngles: nums(rd(s, 'featherRelCornerAngles'))
      };
    }
    return o;
  }

  function serValue(v, pvt, path, ctx) {
    if (v === undefined || v === null) { return null; }
    if (pvt === 'TEXT_DOCUMENT') { return textDoc(v, path, ctx); }
    if (pvt === 'SHAPE') { return shapeVal(v, path, ctx); }
    if (v instanceof Array) { return nums(v); }
    if (typeof v === 'number') { return num(v); }
    if (typeof v === 'boolean' || typeof v === 'string') { return v; }
    return String(v);
  }

  function easeList(list) {
    var out = [], i;
    if (!list) { return out; }
    for (i = 0; i < list.length; i++) {
      out.push({ speed: num(list[i].speed), influence: num(list[i].influence) });
    }
    return out;
  }

  // https://ae-scripting.docsforadobe.dev/property/property/ : keyTime is in comp time; spatial
  // tangents, spatial continuity and roving throw unless the property is TwoD_SPATIAL/ThreeD_SPATIAL.
  function keyInfo(p, k, pvt, path, ctx) {
    var key = { time: num(p.keyTime(k)) };
    var spatial = (pvt === 'TwoD_SPATIAL' || pvt === 'ThreeD_SPATIAL');
    if (pvt !== 'CUSTOM_VALUE') {
      try { key.value = serValue(p.keyValue(k), pvt, path + '@' + k, ctx); } catch (e0) { key.valueError = String(e0); }
    }
    try { key.inInterp = enumName(E.kit, p.keyInInterpolationType(k)); } catch (e1) { key.inInterp = null; }
    try { key.outInterp = enumName(E.kit, p.keyOutInterpolationType(k)); } catch (e2) { key.outInterp = null; }
    try { key.inEase = easeList(p.keyInTemporalEase(k)); } catch (e3) { key.inEase = null; }
    try { key.outEase = easeList(p.keyOutTemporalEase(k)); } catch (e4) { key.outEase = null; }
    try { key.temporalContinuous = p.keyTemporalContinuous(k); } catch (e5) { key.temporalContinuous = null; }
    try { key.temporalAutoBezier = p.keyTemporalAutoBezier(k); } catch (e6) { key.temporalAutoBezier = null; }
    if (spatial) {
      try { key.inSpatial = nums(p.keyInSpatialTangent(k)); } catch (e7) { key.inSpatial = null; }
      try { key.outSpatial = nums(p.keyOutSpatialTangent(k)); } catch (e8) { key.outSpatial = null; }
      try { key.spatialContinuous = p.keySpatialContinuous(k); } catch (e9) { key.spatialContinuous = null; }
      try { key.spatialAutoBezier = p.keySpatialAutoBezier(k); } catch (e10) { key.spatialAutoBezier = null; }
      try { key.roving = p.keyRoving(k); } catch (e11) { key.roving = null; }
    }
    try { key.label = p.keyLabel(k); } catch (e12) { key.label = null; }
    return key;
  }

  // One node of the property tree: groups carry children, properties carry value or keys.
  function propNode(p, path, ctx) {
    var node = { matchName: rd(p, 'matchName'), name: rd(p, 'name') };
    var kind, pvt, i, n, child, nk, k, last, expr;
    ctx.stats.props += 1;
    node.index = rd(p, 'propertyIndex');
    kind = enumName(E.ptype, rd(p, 'propertyType'));
    if (rd(p, 'canSetEnabled') === true) { node.enabled = rd(p, 'enabled'); }
    if (kind === 'INDEXED_GROUP' || kind === 'NAMED_GROUP') {
      node.group = kind;
      node.children = [];
      n = rd(p, 'numProperties') || 0;
      for (i = 1; i <= n; i++) {
        try {
          child = p.property(i);
          node.children.push(propNode(child, path + '/' + child.matchName, ctx));
        } catch (e0) {
          node.children.push({ index: i, error: String(e0) });
        }
      }
      return node;
    }
    pvt = enumName(E.pvt, rd(p, 'propertyValueType'));
    node.pvt = pvt;
    if (pvt === 'NO_VALUE') { return node; }
    node.modified = rd(p, 'isModified');
    if (rd(p, 'isSeparationLeader') === true) { node.dimensionsSeparated = rd(p, 'dimensionsSeparated'); }
    if (rd(p, 'isSeparationFollower') === true) { node.separationDimension = rd(p, 'separationDimension'); }
    if (rd(p, 'canSetExpression') === true) {
      expr = rd(p, 'expression');
      if (typeof expr === 'string' && expr !== '') {
        ctx.stats.expressions += 1;
        node.expression = { text: capText(expr, ctx.caps.maxExpr, path, ctx), enabled: rd(p, 'expressionEnabled') };
        if (node.expression.enabled === true && ctx.caps.evalExpressions !== 0) {
          // One evaluation fills expressionError even if nothing has rendered this comp since the open.
          // valueAtTime(t, false) applies the expression; AE 16+ no longer disables an expression that fails.
          try {
            node.expression.valueAt0 = serValue(p.valueAtTime(0, false), pvt, path + '#expr', ctx);
          } catch (eX) {
            node.expression.evalError = String(eX);
          }
        }
        node.expression.error = rd(p, 'expressionError') || '';
        if (node.expression.error !== '') { ctx.stats.expressionErrors += 1; }
      }
    }
    if (pvt === 'CUSTOM_VALUE') { node.custom = true; }
    nk = rd(p, 'numKeys') || 0;
    if (nk > 0) {
      last = nk;
      if (nk > ctx.caps.maxKeys) {
        last = ctx.caps.maxKeys;
        node.keysTotal = nk;
        ctx.truncated.push({ path: path, what: 'keys', count: nk });
      }
      node.keys = [];
      for (k = 1; k <= last; k++) {
        try { node.keys.push(keyInfo(p, k, pvt, path, ctx)); } catch (e1) { node.keys.push({ error: String(e1) }); }
      }
      ctx.stats.keys += node.keys.length;
    } else if (pvt !== 'CUSTOM_VALUE') {
      // Pre-expression static value: valueAtTime(t, true) does not apply the expression.
      try { node.value = serValue(p.valueAtTime(0, true), pvt, path, ctx); } catch (e2) { node.valueError = String(e2); }
    }
    return node;
  }

  function effectList(L, ctx) {
    var parade = null, out = [], i, fx, node;
    try { parade = L.property('ADBE Effect Parade'); } catch (e0) { parade = null; }
    if (!parade) { return out; }
    for (i = 1; i <= parade.numProperties; i++) {
      try {
        fx = parade.property(i);
        node = propNode(fx, 'L' + L.index + '/fx' + i, ctx);
        out.push({ index: i, matchName: node.matchName, name: node.name, enabled: rd(fx, 'enabled'), params: node.children || [] });
      } catch (e1) {
        out.push({ index: i, error: String(e1), params: [] });
      }
    }
    return out;
  }

  var MASK_FIELDS = { 'ADBE Mask Shape': 'path', 'ADBE Mask Feather': 'feather', 'ADBE Mask Opacity': 'opacity', 'ADBE Mask Offset': 'expansion' };

  // https://ae-scripting.docsforadobe.dev/property/maskpropertygroup/
  function maskList(L, ctx) {
    var parade = null, out = [], i, j, m, node, rec, c, field;
    try { parade = L.property('ADBE Mask Parade'); } catch (e0) { parade = null; }
    if (!parade) { return out; }
    for (i = 1; i <= parade.numProperties; i++) {
      try {
        m = parade.property(i);
        node = propNode(m, 'L' + L.index + '/mask' + i, ctx);
      } catch (e1) {
        out.push({ index: i, error: String(e1), other: [] });
        continue;
      }
      rec = {
        index: i, name: node.name, mode: enumName(E.maskMode, rd(m, 'maskMode')), inverted: rd(m, 'inverted'),
        locked: rd(m, 'locked'), rotoBezier: rd(m, 'rotoBezier'),
        featherFalloff: enumName(E.maskFalloff, rd(m, 'maskFeatherFalloff')),
        motionBlur: enumName(E.maskBlur, rd(m, 'maskMotionBlur')), color: nums(rd(m, 'color')), other: []
      };
      for (j = 0; node.children && j < node.children.length; j++) {
        c = node.children[j];
        field = MASK_FIELDS[c.matchName];
        if (field) { rec[field] = c; } else { rec.other.push(c); }
      }
      out.push(rec);
    }
    return out;
  }

  // AE 23.0+: trackMatteLayer can be any layer; before that the matte is the layer directly above.
  // https://ae-scripting.docsforadobe.dev/layer/avlayer/#avlayertrackmattelayer
  function trackMatte(L) {
    var t = rd(L, 'trackMatteType'), o, ml, modern = false;
    if (t === undefined || t === null) { return null; }
    o = { type: enumName(E.matte, t), hasTrackMatte: rd(L, 'hasTrackMatte'), isTrackMatte: rd(L, 'isTrackMatte') };
    try { modern = (typeof L.trackMatteLayer !== 'undefined'); } catch (e0) { modern = false; }
    if (modern) {
      ml = rd(L, 'trackMatteLayer');
      o.layer = ml ? ml.index : null;
      o.api = 'trackMatteLayer';
    } else {
      o.layer = (o.type !== 'NO_TRACK_MATTE' && L.index > 1) ? L.index - 1 : null;
      o.api = 'legacy';
    }
    return o;
  }

  // https://ae-scripting.docsforadobe.dev/sources/filesource/ : a missing file reports missingFootagePath.
  function sourceInfo(src) {
    var o, ms;
    if (!src) { return null; }
    o = {
      id: rd(src, 'id'), name: rd(src, 'name'), width: rd(src, 'width'), height: rd(src, 'height'),
      pixelAspect: num(rd(src, 'pixelAspect')), frameRate: num(rd(src, 'frameRate')), duration: num(rd(src, 'duration')),
      hasVideo: rd(src, 'hasVideo'), hasAudio: rd(src, 'hasAudio'), missing: rd(src, 'footageMissing')
    };
    if (src instanceof CompItem) { o.kind = 'comp'; return o; }
    ms = rd(src, 'mainSource');
    if (!ms) { o.kind = 'other'; return o; }
    if (typeof SolidSource !== 'undefined' && ms instanceof SolidSource) {
      o.kind = 'solid';
      o.color = nums(rd(ms, 'color'));
      return o;
    }
    if (typeof PlaceholderSource !== 'undefined' && ms instanceof PlaceholderSource) { o.kind = 'placeholder'; return o; }
    o.kind = 'file';
    o.isStill = rd(ms, 'isStill');
    o.loop = rd(ms, 'loop');
    o.hasAlpha = rd(ms, 'hasAlpha');
    o.nativeFrameRate = num(rd(ms, 'nativeFrameRate'));
    o.conformFrameRate = num(rd(ms, 'conformFrameRate'));
    if (o.missing === true) {
      o.file = rd(ms, 'missingFootagePath');
    } else {
      try { o.file = ms.file ? ms.file.fsName : null; } catch (e0) { o.file = null; }
    }
    return o;
  }

  function layerType(L) {
    if (typeof CameraLayer !== 'undefined' && L instanceof CameraLayer) { return 'camera'; }
    if (typeof LightLayer !== 'undefined' && L instanceof LightLayer) { return 'light'; }
    if (typeof TextLayer !== 'undefined' && L instanceof TextLayer) { return 'text'; }
    if (typeof ShapeLayer !== 'undefined' && L instanceof ShapeLayer) { return 'shape'; }
    if (rd(L, 'nullLayer') === true) { return 'null'; }
    if (rd(L, 'adjustmentLayer') === true) { return 'adjustment'; }
    return 'av';
  }

  var TOP_SKIP = { 'ADBE Marker': true, 'ADBE Effect Parade': true, 'ADBE Mask Parade': true };

  function layerNode(L, ctx) {
    var par = rd(L, 'parent'), o, i, n, child, mn;
    o = {
      index: L.index, id: rd(L, 'id'), name: rd(L, 'name'), isNameSet: rd(L, 'isNameSet'), type: layerType(L),
      matchName: rd(L, 'matchName'), comment: rd(L, 'comment'), label: rd(L, 'label'),
      inPoint: num(rd(L, 'inPoint')), outPoint: num(rd(L, 'outPoint')), startTime: num(rd(L, 'startTime')),
      stretch: num(rd(L, 'stretch')), parent: par ? par.index : null,
      blendingMode: enumName(E.blend, rd(L, 'blendingMode')), trackMatte: trackMatte(L),
      source: sourceInfo(rd(L, 'source'))
    };
    o.switches = {
      enabled: rd(L, 'enabled'), solo: rd(L, 'solo'), shy: rd(L, 'shy'), locked: rd(L, 'locked'),
      threeDLayer: rd(L, 'threeDLayer'), threeDPerChar: rd(L, 'threeDPerChar'), motionBlur: rd(L, 'motionBlur'),
      collapseTransformation: rd(L, 'collapseTransformation'), adjustmentLayer: rd(L, 'adjustmentLayer'),
      guideLayer: rd(L, 'guideLayer'), effectsActive: rd(L, 'effectsActive'), frameBlending: rd(L, 'frameBlending'),
      frameBlendingType: enumName(E.fbt, rd(L, 'frameBlendingType')), timeRemapEnabled: rd(L, 'timeRemapEnabled'),
      audioEnabled: rd(L, 'audioEnabled'), hasVideo: rd(L, 'hasVideo'), hasAudio: rd(L, 'hasAudio'),
      environmentLayer: rd(L, 'environmentLayer'), preserveTransparency: rd(L, 'preserveTransparency'),
      quality: enumName(E.quality, rd(L, 'quality')), samplingQuality: enumName(E.sampling, rd(L, 'samplingQuality')),
      autoOrient: enumName(E.orient, rd(L, 'autoOrient'))
    };
    try { o.markers = markerList(L.property('ADBE Marker')); } catch (e0) { o.markers = []; }
    o.effects = effectList(L, ctx);
    o.masks = maskList(L, ctx);
    o.props = [];
    n = rd(L, 'numProperties') || 0;
    for (i = 1; i <= n; i++) {
      try {
        child = L.property(i);
        mn = child.matchName;
        if (TOP_SKIP[mn] !== true) { o.props.push(propNode(child, 'L' + L.index + '/' + mn, ctx)); }
      } catch (e1) {
        o.props.push({ index: i, error: String(e1) });
      }
    }
    return o;
  }

  // https://ae-scripting.docsforadobe.dev/item/compitem/
  function compNode(c) {
    var o, used, j;
    o = {
      id: c.id, name: c.name, folder: folderPath(c), comment: rd(c, 'comment'), label: rd(c, 'label'),
      width: rd(c, 'width'), height: rd(c, 'height'), pixelAspect: num(rd(c, 'pixelAspect')),
      frameRate: num(rd(c, 'frameRate')), frameDuration: num(rd(c, 'frameDuration')), duration: num(rd(c, 'duration')),
      displayStartTime: num(rd(c, 'displayStartTime')), workAreaStart: num(rd(c, 'workAreaStart')),
      workAreaDuration: num(rd(c, 'workAreaDuration')), bgColor: nums(rd(c, 'bgColor')),
      renderer: rd(c, 'renderer'), renderers: rd(c, 'renderers'),
      motionBlur: rd(c, 'motionBlur'), shutterAngle: rd(c, 'shutterAngle'), shutterPhase: rd(c, 'shutterPhase'),
      motionBlurSamplesPerFrame: rd(c, 'motionBlurSamplesPerFrame'),
      motionBlurAdaptiveSampleLimit: rd(c, 'motionBlurAdaptiveSampleLimit'),
      frameBlending: rd(c, 'frameBlending'), preserveNestedFrameRate: rd(c, 'preserveNestedFrameRate'),
      preserveNestedResolution: rd(c, 'preserveNestedResolution'), draft3d: rd(c, 'draft3d'),
      hideShyLayers: rd(c, 'hideShyLayers'), dropFrame: rd(c, 'dropFrame'),
      resolutionFactor: nums(rd(c, 'resolutionFactor')), numLayers: rd(c, 'numLayers'),
      mgtName: rd(c, 'motionGraphicsTemplateName'), mgtControllerCount: rd(c, 'motionGraphicsTemplateControllerCount'),
      usedIn: []
    };
    used = rd(c, 'usedIn');
    for (j = 0; used && j < used.length; j++) { o.usedIn.push(used[j].id); }
    o.markers = markerList(rd(c, 'markerProperty'));
    return o;
  }

  function itemKind(it) {
    if (it instanceof CompItem) { return 'comp'; }
    if (it instanceof FolderItem) { return 'folder'; }
    if (it instanceof FootageItem) { return 'footage'; }
    return 'other';
  }

  // https://ae-scripting.docsforadobe.dev/general/project/#projectusedfonts (AE 24.5+)
  function usedFonts() {
    var list = null, out = [], i, f;
    try { list = app.project.usedFonts; } catch (e0) { list = null; }
    if (!list) { return null; }
    for (i = 0; i < list.length; i++) {
      f = list[i].font;
      out.push({
        postScriptName: rd(f, 'postScriptName'), familyName: rd(f, 'familyName'), styleName: rd(f, 'styleName'),
        version: rd(f, 'version'), location: rd(f, 'location'), isSubstitute: rd(f, 'isSubstitute'),
        uses: list[i].usedAt ? list[i].usedAt.length : 0
      });
    }
    return out;
  }

  function projectInventory() {
    var p = app.project, items = [], comps = [], missing = 0, i, it, kind, rec, used;
    for (i = 1; i <= p.numItems; i++) {
      it = p.item(i);
      kind = itemKind(it);
      rec = { id: it.id, name: it.name, kind: kind, folder: folderPath(it), comment: rd(it, 'comment'), label: rd(it, 'label') };
      if (kind === 'footage') {
        rec.source = sourceInfo(it);
        used = rd(it, 'usedIn');
        rec.usedInCount = used ? used.length : 0;
        if (rec.source && rec.source.missing === true) { missing += 1; }
      }
      if (kind === 'comp') {
        rec.width = rd(it, 'width');
        rec.height = rd(it, 'height');
        rec.frameRate = num(rd(it, 'frameRate'));
        rec.duration = num(rd(it, 'duration'));
        rec.numLayers = rd(it, 'numLayers');
        rec.renderer = rd(it, 'renderer');
        used = rd(it, 'usedIn');
        rec.usedInCount = used ? used.length : 0;
        comps.push({ id: it.id, name: it.name, folder: rec.folder, numLayers: rec.numLayers });
      }
      items.push(rec);
    }
    return {
      schema: DUMP_SCHEMA, file: projectPath(), aeVersion: String(app.version), language: rd(app, 'isoLanguage'),
      expressionEngine: rd(p, 'expressionEngine'), bitsPerChannel: rd(p, 'bitsPerChannel'),
      linearBlending: rd(p, 'linearBlending'), linearizeWorkingSpace: rd(p, 'linearizeWorkingSpace'),
      workingSpace: rd(p, 'workingSpace'), workingGamma: rd(p, 'workingGamma'),
      numItems: p.numItems, missingFootage: missing, comps: comps, items: items, fonts: usedFonts()
    };
  }

  // app.open with unsaved changes would raise a Save dialog (a modal blocks the bridge, quirk #25),
  // so a dirty project is refused. https://ae-scripting.docsforadobe.dev/general/project/#projectdirty
  function opOpen(P) {
    var t0 = new Date().getTime(), cur = projectPath(), f, proj = null, inv, bytes;
    if (app.project && rd(app.project, 'dirty') === true) {
      return { ok: false, error: { code: 'PROJECT_DIRTY', message: 'the open project has unsaved changes (' + cur + '); save or close it first' } };
    }
    if (normPath(cur) !== normPath(P.project)) {
      f = new File(P.project);
      if (!f.exists) { return { ok: false, error: { code: 'NO_PROJECT', message: 'not found: ' + P.project } }; }
      app.beginSuppressDialogs();
      try {
        proj = app.open(f);
      } finally {
        app.endSuppressDialogs(false);
      }
      if (!proj) { return { ok: false, error: { code: 'OPEN_FAILED', message: 'app.open returned null: ' + P.project } }; }
    }
    inv = projectInventory();
    bytes = writeText(P.out, JSON.stringify(inv));
    return {
      ok: true,
      data: {
        file: inv.file, aeVersion: inv.aeVersion, expressionEngine: inv.expressionEngine, numItems: inv.numItems,
        missingFootage: inv.missingFootage, comps: inv.comps, bytes: bytes, ms: new Date().getTime() - t0
      }
    };
  }

  function opComp(P) {
    var t0 = new Date().getTime(), c, ctx, out, i, bytes;
    if (normPath(projectPath()) !== normPath(P.project)) {
      return { ok: false, error: { code: 'WRONG_PROJECT', message: 'open project is ' + projectPath() + ', expected ' + P.project } };
    }
    c = app.project.itemByID(P.compId);
    if (!c || !(c instanceof CompItem)) {
      return { ok: false, error: { code: 'NO_COMP', message: 'no comp with id ' + P.compId } };
    }
    ctx = { caps: mergeCaps(P.caps), truncated: [], stats: { layers: 0, props: 0, keys: 0, expressions: 0, expressionErrors: 0 } };
    out = {
      schema: DUMP_SCHEMA,
      project: { file: projectPath(), aeVersion: String(app.version), expressionEngine: rd(app.project, 'expressionEngine') },
      comp: compNode(c),
      layers: []
    };
    // Evaluating expressions may raise script errors: keep their dialogs from blocking the bridge.
    app.beginSuppressDialogs();
    try {
      for (i = 1; i <= c.numLayers; i++) {
        try {
          out.layers.push(layerNode(c.layer(i), ctx));
        } catch (e0) {
          out.layers.push({ index: i, error: String(e0) });
        }
        ctx.stats.layers += 1;
      }
    } finally {
      app.endSuppressDialogs(false);
    }
    ctx.stats.ms = new Date().getTime() - t0;
    out.truncated = ctx.truncated;
    out.stats = ctx.stats;
    bytes = writeText(P.out, JSON.stringify(out));
    return { ok: true, data: { compId: c.id, name: c.name, bytes: bytes, stats: ctx.stats, truncated: ctx.truncated.length } };
  }

  function opClose(P) {
    if (normPath(projectPath()) !== normPath(P.project)) {
      return { ok: true, data: { closed: false, reason: 'not open: ' + P.project } };
    }
    // https://ae-scripting.docsforadobe.dev/general/project/#projectclose
    app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
    return { ok: true, data: { closed: true } };
  }

  function dumpMain(P) {
    try {
      if (!P || !P.op) { return { ok: false, error: { code: 'BAD_PARAMS', message: 'PARAMS.op is required' } }; }
      if (P.op === 'open') { return opOpen(P); }
      if (P.op === 'comp') { return opComp(P); }
      if (P.op === 'close') { return opClose(P); }
      return { ok: false, error: { code: 'BAD_OP', message: 'unknown op: ' + P.op } };
    } catch (e) {
      return { ok: false, error: { code: 'HOST_EXCEPTION', message: String(e) + ((e && e.line) ? ' (line ' + e.line + ')' : '') } };
    }
  }

  return { main: dumpMain };
}());

JSON.stringify(CRBK_DUMP.main(PARAMS));
```

- [ ] **Step 12: Создать `tools/dump/dump.mjs`**

```js
#!/usr/bin/env node
// JSX dumps of AE projects (spec 3.2): <work>/dumps/<slug>/<compSlug>.json per comp, plus
// index.json (comp list) and project.json (items, footage, fonts, project settings).
//   node tools/dump/dump.mjs --slug logo        # <packs>/logo/logo_relinked.aep
//   node tools/dump/dump.mjs --all              # every pack, one after another
//   node tools/dump/dump.mjs --slug fixture --project C:/CRBK/work/fixtures/CRT_fixture.aep
//   --no-eval: do not evaluate expressions (if an evaluation ever raises a modal dialog in AE)
// AE is only read: open, read, close without saving. A host call is never retried (spec 6):
// on a CDP timeout the run stops; check AE for a modal dialog first (ae-quirks #25).
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../host-run.mjs';
import { assertAscii, workPath } from '../lib/work.mjs';
import { packDir } from '../packs/paths.mjs';
import { compSlugs } from '../packs/slug.mjs';
import { readJson } from './model.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const JSX_FILE = path.join(here, 'dump-project.jsx');
export const PACK_SLUGS = ['logo', 'logo_conv', 'titles', 'titles_conv', 'webinars', 'courses', 'courses_conv', 'smm', 'podcast'];
export const DEFAULT_CAPS = { maxKeys: 1000, maxVertices: 5000, maxText: 20000, maxExpr: 50000, evalExpressions: 1 };
export const TIMEOUTS = { open: 300000, comp: 1200000, close: 120000 };

// The relinked working copy of a pack (Task 3): <packs>/<slug>/<slug>_relinked.aep, C:/CRBK/packs on Windows.
export function packProject(slug, env = process.env, platform = process.platform) {
  return path.posix.join(packDir(slug, env, platform), slug + '_relinked.aep');
}

export function composeDumpJsx(params) {
  return 'var PARAMS = ' + JSON.stringify(params) + ';\n' + readFileSync(JSX_FILE, 'utf8');
}

// Dump file of every comp: compSlug from compSlugs() (Task 2) over all comps of the project, so the
// file is named like the comp's golden folder (Task 4). index and project are the folder's own files:
// only a comp slugged that way gets the file <compSlug>__<id>.json (compSlugs never make "__").
const RESERVED = new Set(['index', 'project']);
export function compFiles(comps) {
  const out = new Map();
  for (const [id, compSlug] of compSlugs(comps)) {
    out.set(id, { compSlug, file: (RESERVED.has(compSlug) ? compSlug + '__' + id : compSlug) + '.json' });
  }
  return out;
}

// The real host. Every path the JSX sees must be ASCII (spec 4.4; AE 26.1+ mangles non-ASCII paths).
export function aeHost(params, timeoutMs) {
  for (const k of ['project', 'out']) if (params[k]) assertAscii(params[k]);
  return run('ae', composeDumpJsx(params), { timeoutMs });
}

export async function dumpProject({
  slug, project, outRoot, host = aeHost, caps = DEFAULT_CAPS, log = console.log, now = () => new Date(),
}) {
  const finalDir = path.posix.join(outRoot, slug);
  const tmpDir = finalDir + '.tmp';
  const rawDir = path.posix.join(tmpDir, '_raw');
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(rawDir, { recursive: true });

  const opened = await host({ op: 'open', project, out: rawDir + '/project.json' }, TIMEOUTS.open);
  if (!opened.ok) throw new Error(slug + ': ' + opened.error.code + ': ' + opened.error.message);
  const info = opened.data;
  log(`${slug}: ${info.file} | AE ${info.aeVersion} | engine ${info.expressionEngine} | ${info.comps.length} comps | missing footage ${info.missingFootage}`);

  const files = compFiles(info.comps);
  const index = {
    schema: 'crbk-dump-index/1', slug, project, file: info.file, aeVersion: info.aeVersion,
    expressionEngine: info.expressionEngine, missingFootage: info.missingFootage,
    dumpedAt: now().toISOString(), comps: [], errors: [],
  };
  let n = 0;
  for (const c of info.comps) {
    n += 1;
    const raw = `${rawDir}/c${c.id}.json`;
    const r = await host({ op: 'comp', project, compId: c.id, out: raw, caps }, TIMEOUTS.comp);
    if (!r.ok) {
      index.errors.push({ id: c.id, name: c.name, error: r.error });
      log(`  [${n}/${info.comps.length}] ${c.name}: ERROR ${r.error.code}: ${r.error.message}`);
      continue;
    }
    const dump = readJson(raw);
    const { compSlug, file } = files.get(c.id);
    dump.slug = slug;
    dump.compSlug = compSlug;
    writeFileSync(path.posix.join(tmpDir, file), JSON.stringify(dump, null, 1) + '\n', 'utf8');
    index.comps.push({
      id: c.id, name: c.name, folder: c.folder, compSlug, file, layers: dump.layers.length,
      bytes: r.data.bytes, ms: r.data.stats.ms, truncated: r.data.truncated,
      expressions: r.data.stats.expressions, expressionErrors: r.data.stats.expressionErrors,
    });
    log(`  [${n}/${info.comps.length}] ${c.name} -> ${file} (${dump.layers.length} layers, ${r.data.stats.ms} ms` +
      (r.data.truncated ? `, ${r.data.truncated} truncated` : '') + ')');
  }

  const closed = await host({ op: 'close', project }, TIMEOUTS.close);
  if (!closed.ok) log(`${slug}: close failed: ${closed.error.code}: ${closed.error.message}`);

  writeFileSync(path.posix.join(tmpDir, 'project.json'), JSON.stringify(readJson(rawDir + '/project.json'), null, 1) + '\n', 'utf8');
  writeFileSync(path.posix.join(tmpDir, 'index.json'), JSON.stringify(index, null, 1) + '\n', 'utf8');
  rmSync(rawDir, { recursive: true, force: true });
  rmSync(finalDir, { recursive: true, force: true });
  renameSync(tmpDir, finalDir);
  return index;
}

export function parseArgs(argv) {
  const o = { slug: null, all: false, project: null, out: null, noEval: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--slug') { o.slug = argv[i + 1]; i += 1; }
    else if (a === '--project') { o.project = argv[i + 1]; i += 1; }
    else if (a === '--out') { o.out = argv[i + 1]; i += 1; }
    else if (a === '--all') o.all = true;
    else if (a === '--no-eval') o.noEval = true;
    else throw new Error('unknown argument: ' + a);
  }
  if (o.all ? (o.slug || o.project) : !o.slug) {
    throw new Error('usage: node tools/dump/dump.mjs --slug <slug> [--project <file.aep>] | --all; options: --out <dir>, --no-eval');
  }
  return o;
}

const STOP = /CDP_TIMEOUT|CDP_UNREACHABLE|CDP_NO_PAGE|CDP_CLOSED|HOST_EMPTY|HOST_EVAL_ERROR|PROJECT_DIRTY/;

// Exit code of a run: 0 all dumped, 1 a pack failed, 2 stopped (look at AE before anything else).
async function main(o) {
  const outRoot = o.out ? o.out.replace(/\\/g, '/') : workPath('dumps');
  const caps = { ...DEFAULT_CAPS, evalExpressions: o.noEval ? 0 : 1 };
  const jobs = o.all
    ? PACK_SLUGS.map((slug) => ({ slug, project: packProject(slug) }))
    : [{ slug: o.slug, project: (o.project || packProject(o.slug)).replace(/\\/g, '/') }];
  let failed = 0;
  for (const job of jobs) {
    if (!existsSync(job.project)) { console.error(`${job.slug}: no project ${job.project}`); failed += 1; continue; }
    try {
      const index = await dumpProject({ ...job, outRoot, caps });
      console.log(`${job.slug}: ${index.comps.length} comps -> ${outRoot}/${job.slug} (${index.errors.length} errors)`);
      if (index.errors.length) failed += 1;
    } catch (e) {
      console.error(`${job.slug}: ${e.message}`);
      if (STOP.test(e.message)) {
        console.error('Stopped: look at After Effects first (a modal dialog, an unsaved project); do not re-run blindly (ae-quirks #25).');
        return 2;
      }
      failed += 1;
    }
  }
  return failed ? 1 : 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let o = null;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); }
  // exitCode, not process.exit(): exiting while the CDP socket closes crashes libuv on Windows (plan 2 conventions)
  process.exitCode = o ? await main(o) : 2;
}
```

- [ ] **Step 13: Запустить тесты и линтер**

Run: `npx vitest run tests/dump && node tools/jsx/lint-jsx.cjs tools/dump/dump-project.jsx`
Expected: `31 passed` (4 файла); `OK    tools/dump/dump-project.jsx`.

- [ ] **Step 14: Проверить CLI в чистом Node**

vitest не проверяет именованные импорты: модуль с несуществующим импортом проходит тесты и падает только при запуске. Поэтому CLI запускается без аргументов. AE не нужен: без аргументов команда печатает подсказку и к хосту не обращается.

Run: `node tools/dump/dump.mjs; echo "exit $?"`
Expected:
```text
usage: node tools/dump/dump.mjs --slug <slug> [--project <file.aep>] | --all; options: --out <dir>, --no-eval
exit 2
```
`SyntaxError: The requested module … does not provide an export named …` значит, что импорт в `dump.mjs` не совпадает с экспортом модуля (`tools/packs/slug.mjs`, `tools/packs/paths.mjs`, `tools/lib/work.mjs`, `tools/host-run.mjs`).

- [ ] **Step 15: Дамп фикстуры (вручную, AE)**

1. Запустить After Effects 2026, открыть Window → Extensions → BrandKit Dev. Run: `curl -s http://localhost:8094/json` — в ответе объект с `"type": "page"`.
2. Проверить, что фикстура есть: `ls C:/CRBK/work/fixtures/CRT_fixture.aep`.
3. Свой проект в AE сохранить (File → Save) или закрыть (File → Close Project). Иначе дампер ответит `PROJECT_DIRTY` и остановится.

Run: `node tools/dump/dump.mjs --slug fixture --project C:/CRBK/work/fixtures/CRT_fixture.aep`
Expected (порядок композиций может быть другим, имя файла — по `compSlug`):
```text
fixture: C:\CRBK\work\fixtures\CRT_fixture.aep | AE 26.5x… | engine javascript-1.0 | 2 comps | missing footage 0
  [1/2] CRT_Hatch_v1 -> crt_hatch_v1.json (4 layers, … ms)
  [2/2] CRT_LowerThird_v1 -> crt_lowerthird_v1.json (7 layers, … ms)
fixture: 2 comps -> C:/CRBK/work/dumps/fixture (0 errors)
```
После прогона в AE пустой проект: фикстура закрыта без сохранения.

Если команда упала по таймауту `CDP_TIMEOUT`, ничего не перезапускать: посмотреть в AE, нет ли модального окна (ae-quirks #25), закрыть его и только потом повторить. Если окно — ошибка выражения, повторять с `--no-eval`.

- [ ] **Step 16: Проверить дамп фикстуры**

Run: `node tools/dump/check-fixture-dump.mjs`
Expected:
```text
PASS  comp 1920x1080, 25 fps, 10 s  | 1920x1080, 25 fps, 10 s
PASS  PROBE_SQ Position has 4 keys  | 4 keys
PASS  PROBE_SQ keys at 0/1/9/10 s = (100,100) (200,100) (200,100) (300,100)  | 0s:(100,100) 1s:(200,100) 9s:(200,100) 10s:(300,100)
PASS  PROBE_SQ keys are linear  | LINEAR/LINEAR LINEAR/LINEAR LINEAR/LINEAR LINEAR/LINEAR
PASS  TXT_NAME font is SBSansDisplay-Semibold  | SBSansDisplay-Semibold
PASS  TXT_NAME is "Имя Фамилия", 60 px  | "Имя Фамилия", 60 px
PASS  comp markers: protected 0-1 s "in", 9-10 s "out"  | 0+1 "in" protected=true; 9+1 "out" protected=true
PASS  CTRL effects by name and matchName  | ShowRole=ADBE Checkbox Control, Duration=ADBE Slider Control, Accent=ADBE Color Control, Style=ADBE Dropdown Control, QA=ADBE Checkbox Control
PASS  TXT_ROLE Opacity expression reads ShowRole and gives 100  | <текст выражения> = 100
renderer: <id>; available: <id>, <id>, …
all 9 checks passed
```

Если проверка не прошла, сначала открыть фикстуру в AE и сверить её с контрактом (План 1, задача 7), потом искать ошибку в дампере.

- [ ] **Step 17: Записать id рендерера Classic 3D (вручную, AE)**

Строка `available` — рендереры этого AE. Classic 3D — это `ADBE Advanced 3d` (так его называл скриптинг) или `ADBE Escher` (так он записан в `.aep`, по аудиту подкаста). Доктор (задача 8) считает Classic 3D именно эти два id.

Если ни одного из них в `available` нет:
1. В AE открыть `CRT_fixture.aep` и композицию CRT_LowerThird_v1.
2. Composition → Composition Settings → вкладка 3D Renderer → Renderer: Classic 3D → OK.
3. Run: `node tools/host-run.mjs --host ae "JSON.stringify(app.project.activeItem.renderer)"` — это id Classic 3D.
4. File → Close Project → Don't Save.
5. В задаче 8, шаг 3, дописать этот id в `CLASSIC_RENDERERS` в `tools/dump/doctor.mjs`.

- [ ] **Step 18: Дамп всех пакетов (AE, только чтение)**

Рабочие копии не должны измениться: их хэши записываются до прогона и сверяются после. Свой проект в AE перед прогоном снова сохранить или закрыть.

Run:
```bash
sha256sum C:/CRBK/packs/*/*_relinked.aep > C:/CRBK/work/relinked-before.sha256
node tools/dump/dump.mjs --all
sha256sum -c C:/CRBK/work/relinked-before.sha256
du -sh C:/CRBK/work/dumps/*
```
Expected:
- для каждого из 9 пакетов строка `<slug>: C:\CRBK\packs\<slug>\<slug>_relinked.aep | AE 26.5x… | engine extendscript | N comps | missing footage 0`, строки по композициям и итог `<slug>: N comps -> C:/CRBK/work/dumps/<slug> (0 errors)`;
- `sha256sum -c` печатает `…_relinked.aep: OK` девять раз;
- `du` показывает 10 папок: 9 пакетов и fixture.

Прогон занимает минуты на пакет, AE в это время занят. `missing footage` должно быть 0 — это условие рабочих копий (задачи 1–5). Если не 0, дамп годится, но число нужно указать в сообщении коммита. Если у пакета есть ошибки (`N errors`), причина — в `C:/CRBK/work/dumps/<slug>/index.json`, поле `errors`. После исправления пакет пересобирается отдельно: `node tools/dump/dump.mjs --slug <slug>`.

- [ ] **Step 19: Commit**

```bash
git add tools/dump/model.mjs tools/dump/check-fixture-dump.mjs tools/dump/dump-project.jsx tools/dump/dump.mjs tests/dump/model.test.mjs tests/dump/check-fixture-dump.test.mjs tests/dump/fake-ae-host.js tests/dump/dump-project.test.mjs tests/dump/dump.test.mjs
git commit -m "feat(dump): read-only JSX dump of AE projects, one JSON per comp" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: Сверка копий логотипа с мастером (D18)

**Files:**
- Create: `tools/vendor/svgpath.cjs` (копия из ae-motion-live с одной строкой происхождения), `brand/logo/master-ae-motion-live.svg` (копия), `tools/dump/colors.mjs`, `tools/dump/geometry.mjs`, `tools/dump/logo-candidates.json`, `tools/dump/logo-diff.mjs`
- Test: `tests/dump/colors.test.mjs`, `tests/dump/geometry.test.mjs`, `tests/dump/logo-diff.test.mjs`
- Create (пишет `logo-diff.mjs`, коммит в задаче 9): `docs/research/logo-geometry.md`, `docs/research/logo-geometry/*.svg`
- Modify (шаг 14): `docs/decisions/phase0-decisions.md` — строка D18 листа решений (План 1, задача 27)

Копии логотипа берутся из дампов: композиции и слои из аудитов (`tools/dump/logo-candidates.json`) плюс похожие слои, найденные эвристикой (зелёная фигура из трёх контуров — куб; фигура из 9–12 контуров рядом с ним — надпись). Мастер — SVG из ae-motion-live: Figma BAZIS недоступна без авторизации коннектора, а D18 разрешает SVG после сверки.

Итог задачи нужен для закрытия фазы 0 (План 1, задача 30): решение D18 подписывается по отчёту `docs/research/logo-geometry.md` и сводке в строке D18 листа решений (шаг 14). Без них фаза 0 не закрывается.

Метод:
1. Контуры копии берутся в пространстве слоя: пути фигур с трансформациями их групп.
2. Контур нормализуется: сдвиг к началу габарита, масштаб к ширине 1.
3. Отклонение — расстояние от точек одного контура до другого контура: max (хаусдорфово) и mean, в ‰ ширины детали.
4. Одинаковая геометрия объединяется в группы. Группы сравниваются с мастером и попарно.

- [ ] **Step 1: Перенести разбор SVG и мастер логотипа**

Мастер в ae-motion-live лежит не в `assets/`, а в `html/templates/cn-assets/logo_color.svg`: его же берёт `scripts/gfx-build.js` (константа `LOGO_SVG`).

```bash
mkdir -p tools/vendor brand/logo
{ echo "// Vendored from ~/.claude/skills/ae-motion-live/scripts/lib/svgpath.js (2026-10-02), unchanged."; cat "C:/Users/Глеб/.claude/skills/ae-motion-live/scripts/lib/svgpath.js"; } > tools/vendor/svgpath.cjs
cp "C:/Users/Глеб/.claude/skills/ae-motion-live/html/templates/cn-assets/logo_color.svg" brand/logo/master-ae-motion-live.svg
node --check tools/vendor/svgpath.cjs && sha256sum brand/logo/master-ae-motion-live.svg
node -e "const { parseSvg } = require('./tools/vendor/svgpath.cjs'); const s = parseSvg(require('fs').readFileSync('brand/logo/master-ae-motion-live.svg', 'utf8')); console.log(s.viewBox.join(' '), s.paths.map((p) => p.fill + ':' + p.subpaths.length).join(' '))"
```
Expected: `96bee7d1caf77460af9b65d3b6fc7ccab28f0a323be2879fa62110c70d3d7d35 *brand/logo/master-ae-motion-live.svg` и `0 0 340.5 63 #26D07C:3 white:10` (куб — 3 контура, надпись «cloud.ru» — 10). Другой хэш значит, что файл в ae-motion-live менялся: открыть его и убедиться, что это тот же логотип. Отчёт сам запишет новый хэш.

- [ ] **Step 2: Написать падающие тесты цветов и геометрии**

ΔE2000 и перевод sRGB → CIELAB даёт `tools/color/deltae.mjs` (План 1, задача 12); его тест сверяется со всеми 34 парами Sharma, Wu, Dalal (2005). Тест `colors.mjs` проверяет только то, что добавляет этот модуль: цвета AE, имена и короткие hex, палитру, классы и цвета слоя.

`tests/dump/colors.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deltaE2000Hex } from '../../tools/color/deltae.mjs';
import { aeColorToHex, classify, layerColors, loadPalette, normalizeHex } from '../../tools/dump/colors.mjs';

describe('colors', () => {
  it('converts AE floats and SVG names to hex', () => {
    expect(aeColorToHex([1, 0.5, 0, 1])).toBe('#FF8000');
    expect(aeColorToHex([0.149, 0.816, 0.486])).toBe('#26D07C');
    expect(normalizeHex('white')).toBe('#FFFFFF');
    expect(normalizeHex('#abc')).toBe('#AABBCC');
    expect(normalizeHex('nope')).toBeNull();
  });

  it('measures ΔE2000 with tools/color/deltae.mjs after normalizing names and short hex', () => {
    const pal = loadPalette(null);
    expect(classify('white', pal)).toEqual({ hex: '#FFFFFF', status: 'palette', nearest: '#FFFFFF', dE: 0 });
    const k = classify('#2d8', pal);
    expect(k).toMatchObject({ hex: '#22DD88', status: 'off', nearest: '#26D07C' });
    expect(k.dE).toBe(Math.round(deltaE2000Hex('#22DD88', '#26D07C') * 100) / 100);
    expect(() => classify('nope', pal)).toThrow(/bad hex/);
  });

  it('falls back to the D1 palette and reads any #RRGGBB in tokens.json', () => {
    expect(loadPalette(null)).toMatchObject({ fallback: true, colors: ['#26D07C', '#222222', '#FFFFFF', '#F2F2F2', '#CFF500', '#A068FF', '#C0E0FC'] });
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-tok-'));
    const f = path.join(dir, 'tokens.json');
    writeFileSync(f, JSON.stringify({ color: { green: { value: '#26d07c' }, list: ['#222222', 'not a colour'] }, font: 'SB Sans' }));
    expect(loadPalette(f)).toEqual({ source: f, colors: ['#222222', '#26D07C'], fallback: false });
  });

  it('classifies colours against the palette', () => {
    const pal = loadPalette(null);
    expect(classify('#26D07C', pal)).toEqual({ hex: '#26D07C', status: 'palette', nearest: '#26D07C', dE: 0 });
    expect(classify('#31D383', pal)).toMatchObject({ status: 'near', nearest: '#26D07C', dE: 1.15 });
    expect(classify('#8EE7BB', pal)).toMatchObject({ status: 'off', nearest: '#26D07C' });
  });

  it('lists the colours a layer paints with', () => {
    const layer = {
      type: 'shape', switches: { enabled: true },
      props: [{ matchName: 'ADBE Root Vectors Group', name: 'Contents', children: [
        { matchName: 'ADBE Vector Group', name: 'g', enabled: true, children: [
          { matchName: 'ADBE Vector Graphic - Fill', name: 'Fill 1', enabled: true, children: [
            { matchName: 'ADBE Vector Fill Color', name: 'Color', pvt: 'COLOR', value: [0.192157, 0.827451, 0.513725, 1] }] },
          { matchName: 'ADBE Vector Graphic - Stroke', name: 'Stroke 1', enabled: false, children: [
            { matchName: 'ADBE Vector Stroke Color', name: 'Color', pvt: 'COLOR', keys: [{ time: 0, value: [1, 1, 1, 1] }, { time: 1, value: [0, 0, 0, 1] }] }] },
          { matchName: 'ADBE Vector Graphic - G-Fill', name: 'Gradient Fill 1', children: [] }] }] }],
      effects: [{ name: 'Fill', matchName: 'ADBE Fill', params: [
        { matchName: 'ADBE Fill-0002', name: 'Color', pvt: 'COLOR', modified: true, value: [0.968627, 0.968627, 0.968627, 1] }] },
      { name: 'Drop Shadow', matchName: 'ADBE Drop Shadow', params: [
        { matchName: 'ADBE Drop Shadow-0001', name: 'Shadow Color', pvt: 'COLOR', modified: false, value: [0, 0, 0, 1] }] }],
      masks: [],
    };
    const { colors, skippedDefaults } = layerColors(layer);
    expect(colors.map((c) => [c.hex, c.kind, c.animated, c.off])).toEqual([
      ['#31D383', 'fill', false, false],
      ['#FFFFFF', 'stroke', true, true],
      ['#000000', 'stroke', true, true],
      [null, 'gradient', false, false],
      ['#F7F7F7', 'effect', false, false],
    ]);
    expect(colors[4].label).toBe('ADBE Fill › Color');
    expect(skippedDefaults).toBe(1);
  });

  it('treats a track matte, a guide and a switched-off layer as not painting', () => {
    const shape = (extra) => ({ type: 'shape', effects: [], masks: [], switches: { enabled: true }, ...extra,
      props: [{ matchName: 'ADBE Vector Fill Color', name: 'Color', pvt: 'COLOR', value: [0.811765, 0.960784, 0, 1] }] });
    expect(layerColors(shape({ trackMatte: { type: 'NO_TRACK_MATTE', isTrackMatte: true } })).colors[0]).toMatchObject({ hex: '#CFF500', off: true });
    expect(layerColors(shape({ switches: { enabled: true, guideLayer: true } })).colors[0].off).toBe(true);
    expect(layerColors(shape({ switches: { enabled: false } })).colors[0].off).toBe(true);
    expect(layerColors(shape({})).colors[0].off).toBe(false);
  });

  it('reads text fill and solid sources', () => {
    const text = { type: 'text', props: [{ matchName: 'ADBE Text Properties', name: 'Text', children: [
      { matchName: 'ADBE Text Document', name: 'Source Text', pvt: 'TEXT_DOCUMENT', value: { applyFill: true, fillColor: [0.133333, 0.133333, 0.133333], applyStroke: false } }] }],
    effects: [], masks: [] };
    expect(layerColors(text).colors.map((c) => [c.hex, c.kind])).toEqual([['#222222', 'text-fill']]);
    const solid = { type: 'av', props: [], effects: [], masks: [], source: { kind: 'solid', name: 'Dark Gray Solid 1', color: [0.133333, 0.133333, 0.133333] } };
    expect(layerColors(solid).colors.map((c) => [c.hex, c.kind, c.label])).toEqual([['#222222', 'solid', 'Dark Gray Solid 1']]);
  });
});
```

`tests/dump/geometry.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import {
  applyPoint, bbox, compareOutlines, dropPlate, fingerprint, groupMatrix, multiply, normalize, pathData, samplePolyline, transformSubpath,
} from '../../tools/dump/geometry.mjs';

const poly = (pts, closed = true) => ({
  closed, vertices: pts, inTangents: pts.map(() => [0, 0]), outTangents: pts.map(() => [0, 0]),
});
const square = () => poly([[0, 0], [1, 0], [1, 1], [0, 1]]);
const K = 0.5522847498; // cubic Bezier circle constant
const circle = (r) => ({
  closed: true,
  vertices: [[r, 0], [0, r], [-r, 0], [0, -r]],
  inTangents: [[0, -K * r], [K * r, 0], [0, K * r], [-K * r, 0]],
  outTangents: [[0, K * r], [-K * r, 0], [0, -K * r], [K * r, 0]],
});

describe('geometry', () => {
  it('builds AE group transforms: position + rotation * scale * (p - anchor)', () => {
    const m = groupMatrix({ anchor: [10, 0], position: [100, 50], scale: [200, 100], rotation: 90 });
    const p = applyPoint(m, [11, 0]);
    expect(p[0]).toBeCloseTo(100, 9);
    expect(p[1]).toBeCloseTo(52, 9);
  });

  it('composes outer after inner', () => {
    const inner = groupMatrix({ position: [5, 0] });
    const outer = groupMatrix({ scale: [200, 200] });
    expect(applyPoint(multiply(outer, inner), [1, 1])).toEqual([12, 2]);
  });

  it('moves tangents with the linear part only', () => {
    const sp = transformSubpath({ closed: false, vertices: [[1, 1]], inTangents: [[2, 0]], outTangents: [[0, 3]] },
      groupMatrix({ position: [100, 100], scale: [50, 50] }));
    expect(sp).toEqual({ closed: false, vertices: [[100.5, 100.5]], inTangents: [[1, 0]], outTangents: [[0, 1.5]] });
  });

  it('samples Bezier outlines (a 4-arc circle stays on its radius)', () => {
    const pts = samplePolyline(circle(10), 16);
    expect(pts).toHaveLength(65);
    for (const [x, y] of pts) expect(Math.abs(Math.hypot(x, y) - 10)).toBeLessThan(0.005);
  });

  it('normalizes to the box origin and unit width', () => {
    const n = normalize([transformSubpath(square(), groupMatrix({ position: [500, 20], scale: [300, 150] }))]);
    const b = bbox(n.subpaths.flatMap((sp) => samplePolyline(sp)));
    expect(b.x0).toBeCloseTo(0, 12);
    expect(b.y0).toBeCloseTo(0, 12);
    expect(b.x1).toBeCloseTo(1, 12);
    expect(n.aspect).toBeCloseTo(0.5, 12);
  });

  it('measures zero for the same outline at another scale and place', () => {
    const a = normalize([square()]).subpaths;
    const b = normalize([transformSubpath(square(), groupMatrix({ position: [300, -40], scale: [250, 250] }))]).subpaths;
    expect(compareOutlines(a, b).max).toBeLessThan(1e-9);
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it('measures the Hausdorff distance between different outlines', () => {
    const a = normalize([square()]).subpaths;
    const b = normalize([poly([[0, 0], [1, 0], [1, 1.05], [0, 1.05]])]).subpaths;
    const d = compareOutlines(a, b);
    expect(d.max).toBeCloseTo(0.05, 6);
    expect(d.mean).toBeGreaterThan(0);
    expect(d.mean).toBeLessThan(d.max);
  });

  it('catches an extra contour', () => {
    const a = normalize([square()]).subpaths;
    const b = normalize([square(), poly([[0.4, 0.4], [0.6, 0.4], [0.6, 0.6], [0.4, 0.6]])]).subpaths;
    expect(compareOutlines(a, b).max).toBeCloseTo(0.4, 6);
  });

  it('fingerprints ignore subpath order', () => {
    const s1 = poly([[0, 0], [1, 0], [1, 1]]);
    const s2 = poly([[2, 2], [3, 2], [3, 3]]);
    expect(fingerprint([s1, s2])).toBe(fingerprint([s2, s1]));
    expect(fingerprint([s1, s2])).not.toBe(fingerprint([s1, poly([[2, 2], [3, 2], [3, 3.1]])]));
  });

  it('drops a plate: an axis-aligned rectangle around all other contours (AE 26.5 dumps, logo D18)', () => {
    const glyph = poly([[2, 2], [3, 2], [3, 4]]);
    const plate = poly([[0, 0], [10, 0], [10, 6], [0, 6]]);
    expect(dropPlate([plate, glyph])).toEqual({ subpaths: [glyph], dropped: true });
    const touching = poly([[2, 0.005], [3, 0.005], [3, 4]]); // ends 0.005 above the plate top: within 0.2 %
    expect(dropPlate([plate, touching]).dropped).toBe(true);
    const inner = poly([[2.5, 2.5], [2.8, 2.5], [2.8, 2.8], [2.5, 2.8]]);
    expect(dropPlate([glyph, inner]).dropped).toBe(false);
    expect(dropPlate([plate]).dropped).toBe(false);
    const tilted = poly([[0, 0], [10, 1], [10, 6], [0, 6]]);
    expect(dropPlate([tilted, glyph]).dropped).toBe(false);
  });

  it('writes SVG path data', () => {
    expect(pathData([poly([[0, 0], [1, 0], [1, 1]])], 10)).toBe('M0 0C0 0 10 0 10 0C10 0 10 10 10 10C10 10 0 0 0 0Z');
  });
});
```

- [ ] **Step 3: Убедиться, что тесты падают**

Run: `npx vitest run tests/dump/colors.test.mjs tests/dump/geometry.test.mjs`
Expected: FAIL — `Cannot find module '../../tools/dump/colors.mjs'` и `Cannot find module '../../tools/dump/geometry.mjs'`.

- [ ] **Step 4: Создать `tools/dump/colors.mjs`**

Палитра читается из `brand/tokens.json` без опоры на его структуру (это черновик Плана 1): берётся каждая строка вида `#RRGGBB`. Нет файла — палитра D1 из спецификации. ΔE2000 и перевод в CIELAB берутся из `tools/color/deltae.mjs` (План 1, задача 12). Здесь только то, чего там нет: цвет AE (доли 0…1) в hex, имена SVG и короткие hex, палитра, классы и цвета слоя.

```js
// Colours in dumps: AE 0..1 floats to hex, the brand palette from brand/tokens.json, palette classes.
// sRGB -> CIELAB and CIEDE2000 come from tools/color/deltae.mjs (Plan 1, Task 12).
import { existsSync } from 'node:fs';
import { deltaE2000Hex, rgbToHex } from '../color/deltae.mjs';
import { nodeValues, readJson, walkLayer } from './model.mjs';

// D1 (spec 9): the canon when brand/tokens.json is missing or has no colours.
export const D1_PALETTE = ['#26D07C', '#222222', '#FFFFFF', '#F2F2F2', '#CFF500', '#A068FF', '#C0E0FC'];
export const NEAR_DE = 2; // spec 4.4: ΔE2000 <= 2 counts as the same colour in QA
const NAMED = { white: '#FFFFFF', black: '#000000' };

// An AE colour ([r, g, b] or [r, g, b, a], channels 0..1; alpha ignored) as "#RRGGBB".
export function aeColorToHex(rgb) {
  return rgbToHex({ r: Number(rgb[0]) * 255, g: Number(rgb[1]) * 255, b: Number(rgb[2]) * 255 });
}

// "#RRGGBB" from "#rrggbb", "#rgb" (with or without #) or an SVG colour name; null for anything else.
export function normalizeHex(s) {
  const t = String(s).trim().toLowerCase();
  if (NAMED[t]) return NAMED[t];
  const m6 = /^#?([0-9a-f]{6})$/.exec(t);
  if (m6) return '#' + m6[1].toUpperCase();
  const m3 = /^#?([0-9a-f]{3})$/.exec(t);
  if (m3) return '#' + m3[1].split('').map((ch) => ch + ch).join('').toUpperCase();
  return null;
}

// Every "#RRGGBB" string anywhere in tokens.json counts as a palette colour: the file is a draft
// (Plan 1), so its shape is not relied on. Missing file or no colours: the D1 palette.
export function loadPalette(file) {
  if (file && existsSync(file)) {
    const found = new Set();
    const walk = (v) => {
      if (typeof v === 'string') {
        if (/^#[0-9a-f]{6}$/i.test(v.trim())) found.add(v.trim().toUpperCase());
      } else if (Array.isArray(v)) {
        v.forEach(walk);
      } else if (v && typeof v === 'object') {
        Object.values(v).forEach(walk);
      }
    };
    walk(readJson(file));
    if (found.size) return { source: file, colors: [...found].sort(), fallback: false };
  }
  return { source: 'палитра D1 из спецификации (§9)', colors: D1_PALETTE.slice(), fallback: true };
}

// Nearest palette colour by ΔE2000. A name or a short hex is normalized first (deltae.mjs reads only
// #RRGGBB); anything else throws "bad hex colour".
export function classify(hex, palette) {
  const h = normalizeHex(hex);
  let nearest = null;
  let dE = Infinity;
  for (const p of palette.colors) {
    const d = deltaE2000Hex(h, p);
    if (d < dE) { dE = d; nearest = p; }
  }
  const status = palette.colors.includes(h) ? 'palette' : dE <= NEAR_DE ? 'near' : 'off';
  return { hex: h, status, nearest, dE: Math.round(dE * 100) / 100 };
}

function kindOf(node, area) {
  if (area === 'effect') return 'effect';
  if (node.matchName === 'ADBE Vector Fill Color') return 'fill';
  if (node.matchName === 'ADBE Vector Stroke Color') return 'stroke';
  return 'color';
}

// Colours one layer paints with. Unmodified effect colours are effect defaults the designer never
// chose (Drop Shadow black and the like): they are counted in `skippedDefaults`, not listed.
export function layerColors(layer) {
  const out = [];
  let skippedDefaults = 0;
  // Switched off, a guide or used as a track matte: the layer's own colours never reach the frame.
  const sw = layer.switches || {};
  const layerOff = sw.enabled === false || sw.guideLayer === true || Boolean(layer.trackMatte && layer.trackMatte.isTrackMatte === true);
  const push = (hex, kind, label, node, off) => {
    if (out.some((e) => e.hex === hex && e.kind === kind && e.label === label)) return;
    out.push({ hex, kind, label, animated: Boolean(node && node.keys && node.keys.length),
      expression: Boolean(node && node.expression), off: Boolean(off || layerOff) });
  };
  for (const { node, trail, off, area, effect } of walkLayer(layer)) {
    if (area === 'mask') continue;
    if (/^ADBE Vector Graphic - G-(Fill|Stroke)$/.test(node.matchName || '')) {
      push(null, 'gradient', trail.join(' › '), node, off);
      continue;
    }
    if (node.pvt === 'COLOR') {
      if (area === 'effect' && node.modified === false) { skippedDefaults += 1; continue; }
      const label = area === 'effect' ? `${effect.matchName} › ${node.name}` : trail.join(' › ');
      for (const { value } of nodeValues(node)) {
        if (Array.isArray(value)) push(aeColorToHex(value), kindOf(node, area), label, node, off);
      }
    } else if (node.pvt === 'TEXT_DOCUMENT') {
      for (const { value } of nodeValues(node)) {
        if (!value) continue;
        if (value.applyFill && Array.isArray(value.fillColor)) push(aeColorToHex(value.fillColor), 'text-fill', trail.join(' › '), node, off);
        if (value.applyStroke && Array.isArray(value.strokeColor)) push(aeColorToHex(value.strokeColor), 'text-stroke', trail.join(' › '), node, off);
      }
    }
  }
  if (layer.type === 'av' && layer.source && layer.source.kind === 'solid' && Array.isArray(layer.source.color)) {
    push(aeColorToHex(layer.source.color), 'solid', layer.source.name, null, false);
  }
  return { colors: out, skippedDefaults };
}
```

- [ ] **Step 5: Создать `tools/dump/geometry.mjs`**

```js
// Planar geometry for the logo comparison (spec D18). A subpath is AE shape data:
// { vertices: [[x,y]], inTangents, outTangents (relative to their vertex), closed }.
// An affine matrix is [a, b, c, d, e, f]: x' = a*x + c*y + e, y' = b*x + d*y + f.
import { createHash } from 'node:crypto';

export const IDENTITY = [1, 0, 0, 1, 0, 0];

export function multiply(m1, m2) {
  // m1 after m2
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2, b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2, b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1, b1 * e2 + d1 * f2 + f1,
  ];
}

export function applyPoint(m, [x, y]) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function applyVector(m, [x, y]) {
  return [m[0] * x + m[2] * y, m[1] * x + m[3] * y];
}

// AE shape-group transform: p' = position + R(rotation) * S(scale) * (p - anchor). Rotation in degrees,
// clockwise on screen (y down); scale in percent.
export function groupMatrix({ anchor = [0, 0], position = [0, 0], scale = [100, 100], rotation = 0 } = {}) {
  const r = (rotation * Math.PI) / 180;
  const sx = scale[0] / 100;
  const sy = scale[1] / 100;
  const a = Math.cos(r) * sx;
  const b = Math.sin(r) * sx;
  const c = -Math.sin(r) * sy;
  const d = Math.cos(r) * sy;
  return [a, b, c, d, position[0] - (a * anchor[0] + c * anchor[1]), position[1] - (b * anchor[0] + d * anchor[1])];
}

export function transformSubpath(sp, m) {
  return {
    closed: sp.closed,
    vertices: sp.vertices.map((p) => applyPoint(m, p)),
    inTangents: sp.inTangents.map((t) => applyVector(m, t)),
    outTangents: sp.outTangents.map((t) => applyVector(m, t)),
  };
}

function cubic(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}

// The outline as a polyline: `steps` points per Bezier segment, closing segment included.
export function samplePolyline(sp, steps = 16) {
  const v = sp.vertices;
  const n = v.length;
  if (n === 0) return [];
  const pts = [];
  const segs = sp.closed ? n : n - 1;
  for (let i = 0; i < segs; i += 1) {
    const j = (i + 1) % n;
    const p0 = v[i];
    const p3 = v[j];
    const p1 = [p0[0] + sp.outTangents[i][0], p0[1] + sp.outTangents[i][1]];
    const p2 = [p3[0] + sp.inTangents[j][0], p3[1] + sp.inTangents[j][1]];
    for (let s = 0; s < steps; s += 1) pts.push(cubic(p0, p1, p2, p3, s / steps));
  }
  pts.push(sp.closed ? v[0] : v[n - 1]);
  return pts;
}

export function bbox(points) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of points) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

// A plate in the same shape layer: a closed, straight-edged, axis-aligned rectangle whose box holds every
// other contour. Several wordmark copies carry one (11 contours instead of 10, "Merge Paths: 2"); left in,
// it sets the normalized box and the letters look 9 % off. It is not part of the logo, so it is dropped.
function isPlateFor(sp, others) {
  if (!sp.closed || sp.vertices.length !== 4) return false;
  const flat = (t) => t.every(([x, y]) => Math.abs(x) < 1e-6 && Math.abs(y) < 1e-6);
  if (!flat(sp.inTangents) || !flat(sp.outTangents)) return false;
  const v = sp.vertices;
  for (let i = 0; i < 4; i += 1) {
    const a = v[i];
    const b = v[(i + 1) % 4];
    if (Math.abs(a[0] - b[0]) > 1e-6 && Math.abs(a[1] - b[1]) > 1e-6) return false;
  }
  const box = bbox(v);
  const inner = bbox(others.flatMap((o) => samplePolyline(o)));
  // The letters may touch the plate edge (seen: a wordmark whose "l" ends on the plate top), so the box
  // test allows 0.2 % of the plate size.
  const eps = 0.002 * Math.max(box.w, box.h);
  return box.w > 0 && box.h > 0 && inner.x0 >= box.x0 - eps && inner.y0 >= box.y0 - eps &&
    inner.x1 <= box.x1 + eps && inner.y1 <= box.y1 + eps;
}

export function dropPlate(subpaths) {
  if (subpaths.length < 2) return { subpaths, dropped: false };
  for (let i = 0; i < subpaths.length; i += 1) {
    const others = subpaths.filter((_, j) => j !== i);
    if (isPlateFor(subpaths[i], others)) return { subpaths: others, dropped: true };
  }
  return { subpaths, dropped: false };
}

// Translate the outline box to the origin and scale it to unit width (aspect kept).
export function normalize(subpaths, steps = 16) {
  const box = bbox(subpaths.flatMap((sp) => samplePolyline(sp, steps)));
  if (!(box.w > 0)) throw new Error('normalize: empty or zero-width shape');
  const k = 1 / box.w;
  const m = [k, 0, 0, k, -box.x0 * k, -box.y0 * k];
  return { subpaths: subpaths.map((sp) => transformSubpath(sp, m)), box, aspect: box.h / box.w };
}

function segments(subpaths, steps) {
  const out = [];
  for (const sp of subpaths) {
    const pts = samplePolyline(sp, steps);
    for (let i = 0; i + 1 < pts.length; i += 1) out.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]]);
  }
  return out;
}

function segDist([px, py], [x1, y1, x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// Uniform grid over segments; nearest() scans rings of cells until no closer segment can exist.
function gridIndex(segs, cell) {
  const grid = new Map();
  segs.forEach((s, i) => {
    const gx0 = Math.floor(Math.min(s[0], s[2]) / cell);
    const gx1 = Math.floor(Math.max(s[0], s[2]) / cell);
    const gy0 = Math.floor(Math.min(s[1], s[3]) / cell);
    const gy1 = Math.floor(Math.max(s[1], s[3]) / cell);
    for (let gx = gx0; gx <= gx1; gx += 1) {
      for (let gy = gy0; gy <= gy1; gy += 1) {
        const k = gx + ',' + gy;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(i);
      }
    }
  });
  return { grid, cell, segs };
}

function nearest({ grid, cell, segs }, p, maxRing) {
  const cx = Math.floor(p[0] / cell);
  const cy = Math.floor(p[1] / cell);
  let best = Infinity;
  for (let r = 0; r <= maxRing; r += 1) {
    for (let gx = cx - r; gx <= cx + r; gx += 1) {
      for (let gy = cy - r; gy <= cy + r; gy += 1) {
        if (Math.max(Math.abs(gx - cx), Math.abs(gy - cy)) !== r) continue;
        const ids = grid.get(gx + ',' + gy);
        if (!ids) continue;
        for (const i of ids) best = Math.min(best, segDist(p, segs[i]));
      }
    }
    if (best <= r * cell) break;
  }
  return best;
}

function directed(fromSubpaths, toIndex, steps, maxRing) {
  let max = 0;
  let sum = 0;
  let n = 0;
  for (const sp of fromSubpaths) {
    for (const p of samplePolyline(sp, steps)) {
      const d = nearest(toIndex, p, maxRing);
      if (d > max) max = d;
      sum += d;
      n += 1;
    }
  }
  return { max, mean: n ? sum / n : 0 };
}

// Symmetric outline distance between two normalized shapes, in units of the shape width:
// max is the Hausdorff distance, mean averages both directions.
export function compareOutlines(a, b, { steps = 16, cell = 0.01 } = {}) {
  const maxRing = Math.ceil(4 / cell);
  const ab = directed(a, gridIndex(segments(b, steps), cell), steps, maxRing);
  const ba = directed(b, gridIndex(segments(a, steps), cell), steps, maxRing);
  return { max: Math.max(ab.max, ba.max), mean: (ab.mean + ba.mean) / 2 };
}

// Equal fingerprints = the same normalized geometry up to 1e-4 of the width, in any subpath order.
export function fingerprint(subpaths) {
  const r = (v) => Math.round(v * 1e4) / 1e4;
  const parts = subpaths.map((sp) => JSON.stringify([sp.closed, sp.vertices.map((p) => p.map(r)),
    sp.inTangents.map((p) => p.map(r)), sp.outTangents.map((p) => p.map(r))])).sort();
  return createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 10);
}

// SVG path data of subpaths, scaled by k (for overlays).
export function pathData(subpaths, k = 1) {
  const f = (v) => (Math.round(v * k * 100) / 100).toString();
  return subpaths.map((sp) => {
    const v = sp.vertices;
    if (!v.length) return '';
    let d = `M${f(v[0][0])} ${f(v[0][1])}`;
    const segs = sp.closed ? v.length : v.length - 1;
    for (let i = 0; i < segs; i += 1) {
      const j = (i + 1) % v.length;
      const c1 = [v[i][0] + sp.outTangents[i][0], v[i][1] + sp.outTangents[i][1]];
      const c2 = [v[j][0] + sp.inTangents[j][0], v[j][1] + sp.inTangents[j][1]];
      d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(v[j][0])} ${f(v[j][1])}`;
    }
    return d + (sp.closed ? 'Z' : '');
  }).join('');
}
```

- [ ] **Step 6: Запустить тесты**

Run: `npx vitest run tests/dump/colors.test.mjs tests/dump/geometry.test.mjs`
Expected: `18 passed`.

- [ ] **Step 7: Написать падающий тест сверки `tests/dump/logo-diff.test.mjs`**

Мастер в тесте синтетический: куб из трёх квадратов, надпись из десяти. Одна копия куба «погнута» (вершина сдвинута на 1 по обеим осям при ширине 22), поэтому ждём max = √2/22.

```js
import { describe, it, expect } from 'vitest';
import { analyse, extractShape, findCopies, masterParts, overlaySvg, renderReport, verdict } from '../../tools/dump/logo-diff.mjs';
import { loadPalette } from '../../tools/dump/colors.mjs';

const sq = (x, y, s) => `M${x} ${y}H${x + s}V${y + s}H${x}Z`;
const CUBE_D = [sq(0, 0, 10), sq(12, 0, 10), sq(0, 12, 10)].join('');
const WORD_D = Array.from({ length: 10 }, (_, i) => sq(30 + i * 7, 0, 5)).join('');
const SVG = `<svg viewBox="0 0 100 22" xmlns="http://www.w3.org/2000/svg"><g>
<path d="${CUBE_D}" fill="#26D07C"/>
<path d="${WORD_D}" fill="white"/>
</g></svg>`;

const GREEN = [0.14902, 0.815686, 0.486275, 1];
const NEAR_GREEN = [0.192157, 0.827451, 0.513725, 1];
const WHITE = [1, 1, 1, 1];

function shapeLayer(index, name, subpaths, { fill = GREEN, position = [0, 0], scale = [100, 100], extra = [] } = {}) {
  const paths = subpaths.map((sp, i) => ({ matchName: 'ADBE Vector Shape - Group', name: 'Path ' + (i + 1), enabled: true,
    children: [{ matchName: 'ADBE Vector Shape', name: 'Path', pvt: 'SHAPE', value: { ...sp, count: sp.vertices.length } }] }));
  const fillNode = { matchName: 'ADBE Vector Graphic - Fill', name: 'Fill 1', enabled: true,
    children: [{ matchName: 'ADBE Vector Fill Color', name: 'Color', pvt: 'COLOR', value: fill }] };
  const tr = { matchName: 'ADBE Vector Transform Group', name: 'Transform', children: [
    { matchName: 'ADBE Vector Anchor', name: 'Anchor Point', value: [0, 0] },
    { matchName: 'ADBE Vector Position', name: 'Position', value: position },
    { matchName: 'ADBE Vector Scale', name: 'Scale', value: scale },
    { matchName: 'ADBE Vector Rotation', name: 'Rotation', value: 0 }] };
  return {
    index, name, type: 'shape', switches: { enabled: true }, effects: [], masks: [],
    props: [
      { matchName: 'ADBE Root Vectors Group', name: 'Contents', children: [
        { matchName: 'ADBE Vector Group', name: 'Group 1', enabled: true, children: [
          { matchName: 'ADBE Vectors Group', name: 'Contents', children: [...paths, ...extra, fillNode] }, tr] }] },
      { matchName: 'ADBE Transform Group', name: 'Transform', children: [{ matchName: 'ADBE Scale', name: 'Scale', value: [100, 100, 100] }] },
    ],
  };
}

const bundle = (slug, comps) => ({ index: { slug }, comps: comps.map(([id, name, layers]) => ({ comp: { id, name }, compSlug: 'c' + id, layers })) });

function scene() {
  const master = masterParts(SVG);
  const cube = master.parts.cube;
  const word = master.parts.wordmark;
  const bent = cube.map((sp, i) => (i === 0 ? { ...sp, vertices: sp.vertices.map((v) => (v[0] === 10 && v[1] === 10 ? [11, 11] : v)) } : sp));
  const bundles = [
    bundle('logo', [[5, 'Умное облако', [shapeLayer(1, 'LOGO', cube, { position: [50, 0], scale: [200, 200] }), shapeLayer(2, 'Cloud.ru', word, { fill: WHITE })]]]),
    bundle('smm', [[9, 'Cloud.ru_BlackMono', [shapeLayer(1, 'Layer 4 Outlines', bent, { fill: NEAR_GREEN }), shapeLayer(2, 'Layer 3 Outlines', word, { fill: WHITE })]]]),
    bundle('webinars', [[3, 'Logo', [shapeLayer(1, 'Layer 3 Outlines 3', word, { fill: WHITE }), shapeLayer(2, 'Layer 4 Outlines 3', cube)]]]),
  ];
  const candidates = [
    { slug: 'logo', comp: 'Умное облако', cube: 'LOGO', wordmark: 'Cloud.ru' },
    { slug: 'smm', comp: 'Cloud.ru_BlackMono', cube: 'Layer 4 Outlines', wordmark: 'Layer 3 Outlines X' },
    { slug: 'podcast', comp: 'Cloud.ru_WhiteColour', cube: 'Layer 4 Outlines', wordmark: 'Layer 3 Outlines' },
  ];
  return { master, bundles, candidates };
}

describe('logo-diff', () => {
  it('splits the master SVG into cube and wordmark by fill', () => {
    const m = masterParts(SVG);
    expect([m.parts.cube.length, m.parts.wordmark.length]).toEqual([3, 10]);
    expect(m.fills).toEqual({ cube: ['#26D07C'], wordmark: ['#FFFFFF'] });
  });

  it('extracts layer-space outlines with group transforms, skipping switched-off and primitive shapes', () => {
    const rect = { matchName: 'ADBE Vector Shape - Rect', name: 'Rectangle 1', enabled: true, children: [] };
    const merge = { matchName: 'ADBE Vector Filter - Merge', name: 'Merge Paths 1', enabled: true, children: [] };
    const off = { matchName: 'ADBE Vector Shape - Group', name: 'Hidden', enabled: false, children: [] };
    const layer = shapeLayer(1, 'L', masterParts(SVG).parts.cube.slice(0, 1), { position: [100, 0], scale: [200, 200], extra: [rect, merge, off] });
    const s = extractShape(layer);
    expect(s.pathCount).toBe(1);
    expect(s.subpaths[0].vertices).toEqual([[100, 0], [120, 0], [120, 20], [100, 20]]);
    expect(s.ignored).toEqual(['Group 1 › Rectangle 1']);
    expect([s.merges, s.offSkipped]).toEqual([1, 1]);
    expect(s.layerScale).toEqual([100, 100]);
  });

  it('finds the audit copies, reports what is missing and discovers look-alikes', () => {
    const { bundles, candidates } = scene();
    const { copies, missing } = findCopies(bundles, candidates);
    expect(copies.map((c) => `${c.slug}/${c.layer}/${c.part}/${c.source}`)).toEqual([
      'logo/LOGO/cube/аудит', 'logo/Cloud.ru/wordmark/аудит', 'smm/Layer 4 Outlines/cube/аудит',
      'smm/Layer 3 Outlines/wordmark/эвристика', 'webinars/Layer 4 Outlines 3/cube/эвристика', 'webinars/Layer 3 Outlines 3/wordmark/эвристика',
    ]);
    expect(missing.map((m) => `${m.slug}/${m.reason}`)).toEqual(['smm/нет слоя', 'podcast/нет дампа пакета']);
  });

  it('groups equal geometry and compares it with the master and pairwise', () => {
    const { master, bundles, candidates } = scene();
    const a = analyse(findCopies(bundles, candidates).copies, master);
    expect(a.cube.groups.map((g) => [g.label, g.members.length, g.verdict])).toEqual([['C1', 2, 'совпадает'], ['C2', 1, 'отличается']]);
    expect(a.cube.groups[0].toMaster.max).toBeLessThan(1e-9);
    expect(a.cube.groups[1].toMaster.max).toBeCloseTo(Math.SQRT2 / 22, 4);
    expect(a.cube.pairs).toHaveLength(1);
    expect(a.wordmark.groups.map((g) => [g.label, g.members.length, g.verdict])).toEqual([['W1', 3, 'совпадает']]);
  });

  it('renders the report with copies, groups, colours and misses', () => {
    const { master, bundles, candidates } = scene();
    const { copies, missing } = findCopies(bundles, candidates);
    const a = analyse(copies, master);
    const md = renderReport(a, { missing, palette: loadPalette(null), master, meta: { date: '2026-10-05', dumps: 'C:/CRBK/work/dumps', masterFile: 'brand/logo/m.svg', masterSha: 'abc' } });
    expect(md).toContain('# Геометрия копий логотипа (D18)');
    expect(md).toContain('| C2 | 1 | 1.0000 | 64.28 |');
    expect(md).toContain('| C1 | — | 64.28 (');
    expect(md).toContain('#31D383 fill (≈ #26D07C, ΔE 1.15)');
    expect(md).toContain('- podcast / Cloud.ru_WhiteColour (обе детали): нет дампа пакета');
    expect(md).toContain('- куб: копий 3, групп 2; совпадают с мастером 2, близко 0, отличаются 1.');
  });

  it('tells apart two comps with the same name by id', () => {
    const { master } = scene();
    const pair = () => [shapeLayer(1, 'Layer 4 Outlines 3', master.parts.cube), shapeLayer(2, 'Layer 3 Outlines 3', master.parts.wordmark, { fill: WHITE })];
    const bundles = [bundle('courses', [[3, 'Logo', pair()], [4, 'Logo', pair()]])];
    const { copies, missing } = findCopies(bundles, [{ slug: 'courses', comp: 'Logo', cube: 'Layer 4 Outlines 3', wordmark: 'Layer 3 Outlines 3' }]);
    const md = renderReport(analyse(copies, master), { missing, palette: loadPalette(null), master });
    expect(copies).toHaveLength(4);
    expect(md).toContain('| C1 | courses | Logo (id 3) | Layer 4 Outlines 3 | аудит |');
    expect(md).toContain('| C1 | courses | Logo (id 4) | Layer 4 Outlines 3 | аудит |');
  });

  it('draws an overlay of master and copy', () => {
    const { master, bundles, candidates } = scene();
    const a = analyse(findCopies(bundles, candidates).copies, master);
    const svg = overlaySvg(a.cube.master, a.cube.groups[1].norm);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.match(/<path /g)).toHaveLength(2);
  });

  it('turns distances into verdicts', () => {
    expect([verdict(0.0005), verdict(0.003), verdict(0.02)]).toEqual(['совпадает', 'близко', 'отличается']);
  });
});
```

- [ ] **Step 8: Убедиться, что тест падает**

Run: `npx vitest run tests/dump/logo-diff.test.mjs`
Expected: FAIL — `Cannot find module '../../tools/dump/logo-diff.mjs'`.

- [ ] **Step 9: Создать `tools/dump/logo-candidates.json`**

Имена — из `docs/research/2026-10-02/audit_*.json` (`brand_elements`, `templates[].build_notes`): логошоты (precomp «Умное облако», «Есть где развернуться», «Логошот без саблайна», вертикальный «Умное облако»), вебинары и курсы (`Logo`), SMM (`Cloud.ru_BlackMono` и его копия), подкаст (`Cloud.ru_WhiteColour`, `Cloud.ru_BlackColour` и копия «Есть где развернуться»).

```json
{
  "source": "docs/research/2026-10-02/audit_*.json: brand_elements and templates[].build_notes",
  "copies": [
    { "slug": "logo", "comp": "Умное облако", "cube": "LOGO", "wordmark": "Cloud.ru" },
    { "slug": "logo", "comp": "Есть где развернуться", "cube": "LOGO 2", "wordmark": "Cloud.ru 2" },
    { "slug": "logo", "comp": "Логошот без саблайна", "cube": "Layer 3 Outlines 2", "wordmark": "Layer 2 Outlines 2" },
    { "slug": "logo", "comp": "Логошоты вертикальный_Умное облако", "cube": "LOGO", "wordmark": "Cloud.ru" },
    { "slug": "logo_conv", "comp": "Умное облако", "cube": "LOGO", "wordmark": "Cloud.ru" },
    { "slug": "logo_conv", "comp": "Есть где развернуться", "cube": "LOGO 2", "wordmark": "Cloud.ru 2" },
    { "slug": "logo_conv", "comp": "Логошот без саблайна", "cube": "Layer 3 Outlines 2", "wordmark": "Layer 2 Outlines 2" },
    { "slug": "logo_conv", "comp": "Логошоты вертикальный_Умное облако", "cube": "LOGO", "wordmark": "Cloud.ru" },
    { "slug": "webinars", "comp": "Logo", "cube": "Layer 4 Outlines 3", "wordmark": "Layer 3 Outlines 3" },
    { "slug": "courses", "comp": "Logo", "cube": "Layer 4 Outlines 3", "wordmark": "Layer 3 Outlines 3" },
    { "slug": "courses_conv", "comp": "Logo", "cube": "Layer 4 Outlines 3", "wordmark": "Layer 3 Outlines 3" },
    { "slug": "smm", "comp": "Cloud.ru_BlackMono", "cube": "Layer 4 Outlines", "wordmark": "Layer 3 Outlines" },
    { "slug": "smm", "comp": "Cloud.ru_BlackMono 3", "cube": "Layer 4 Outlines", "wordmark": "Layer 3 Outlines" },
    { "slug": "podcast", "comp": "Cloud.ru_WhiteColour", "cube": "Layer 4 Outlines", "wordmark": "Layer 3 Outlines" },
    { "slug": "podcast", "comp": "Cloud.ru_BlackColour", "cube": "Layer 4 Outlines", "wordmark": "Layer 3 Outlines" },
    { "slug": "podcast", "comp": "Есть где развернуться", "cube": "LOGO 2", "wordmark": "Cloud.ru 2" }
  ]
}
```

- [ ] **Step 10: Создать `tools/dump/logo-diff.mjs`**

```js
#!/usr/bin/env node
// Logo geometry diff (spec D18): the cube and the "cloud.ru" wordmark of every logo copy in the pack
// dumps, normalized and compared pairwise and with the master SVG; colours of each copy.
//   node tools/dump/logo-diff.mjs [--dumps C:/CRBK/work/dumps] [--master brand/logo/master-ae-motion-live.svg]
//                                 [--tokens brand/tokens.json] [--out docs/research/logo-geometry.md] [--no-discover]
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workPath } from '../lib/work.mjs';
import { deltaE2000Hex } from '../color/deltae.mjs';
import { classify, layerColors, loadPalette, normalizeHex } from './colors.mjs';
import { compareOutlines, dropPlate, fingerprint, groupMatrix, IDENTITY, multiply, normalize, pathData, transformSubpath } from './geometry.mjs';
import { child, layerProp, loadDumpRoot } from './model.mjs';

const require = createRequire(import.meta.url);
const { parseSvg } = require('../vendor/svgpath.cjs');
const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');

export const PARTS = { cube: 'куб', wordmark: 'надпись «cloud.ru»' };
export const LIMITS = { same: 0.001, close: 0.005 }; // in units of the part width
const PREFIX = { cube: 'C', wordmark: 'W' };

export function verdict(max) {
  if (max <= LIMITS.same) return 'совпадает';
  if (max <= LIMITS.close) return 'близко';
  return 'отличается';
}

// Master: the path filled with the brand green is the cube, every other path is the wordmark.
export function masterParts(svgText) {
  const svg = parseSvg(svgText);
  const parts = { cube: [], wordmark: [] };
  const fills = { cube: new Set(), wordmark: new Set() };
  for (const p of svg.paths) {
    const hex = normalizeHex(p.fill) || p.fill;
    const part = hex === '#26D07C' ? 'cube' : 'wordmark';
    parts[part].push(...p.subpaths);
    fills[part].add(hex);
  }
  return { parts, fills: { cube: [...fills.cube], wordmark: [...fills.wordmark] } };
}

function restValue(node) {
  if (!node) return { value: undefined, animated: false };
  if (Array.isArray(node.keys) && node.keys.length) return { value: node.keys[node.keys.length - 1].value, animated: true };
  return { value: node.value, animated: false };
}

function groupTransform(tr, notes, trail) {
  const get = (mn, fallback) => {
    const { value, animated } = restValue(child(tr, mn));
    if (animated) notes.push(`${trail}: ${mn} анимировано, взято значение последнего ключа`);
    return value === undefined || value === null ? fallback : value;
  };
  const skew = get('ADBE Vector Skew', 0);
  if (Math.abs(skew) > 1e-6) notes.push(`${trail}: скос ${skew}° не учтён`);
  return {
    anchor: get('ADBE Vector Anchor', [0, 0]), position: get('ADBE Vector Position', [0, 0]),
    scale: get('ADBE Vector Scale', [100, 100]), rotation: get('ADBE Vector Rotation', 0),
  };
}

// Outline of a shape layer in layer space: enabled path shapes with their group transforms applied.
// Rectangles, ellipses and stars are listed, not drawn; Merge Paths is counted.
export function extractShape(layer) {
  const out = { subpaths: [], pathCount: 0, ignored: [], merges: 0, offSkipped: 0, notes: [], layerScale: null };
  const root = (layer.props || []).find((n) => n.matchName === 'ADBE Root Vectors Group');
  if (!root) { out.notes.push('не слой-фигура'); return out; }
  const visit = (nodes, m, trail) => {
    for (const n of nodes || []) {
      if (n.enabled === false) { out.offSkipped += 1; continue; }
      const t = trail ? trail + ' › ' + n.name : n.name;
      if (n.matchName === 'ADBE Vector Group') {
        const tr = child(n, 'ADBE Vector Transform Group');
        const gm = tr ? groupMatrix(groupTransform(tr, out.notes, t)) : IDENTITY;
        visit((child(n, 'ADBE Vectors Group') || {}).children, multiply(m, gm), t);
      } else if (n.matchName === 'ADBE Vector Shape - Group') {
        const { value, animated } = restValue(child(n, 'ADBE Vector Shape'));
        if (animated) out.notes.push(`${t}: путь анимирован, взят последний ключ`);
        if (value && Array.isArray(value.vertices)) {
          out.subpaths.push(transformSubpath(value, m));
          out.pathCount += 1;
        } else {
          out.notes.push(`${t}: нет вершин${value && value.skipped ? ' (пропущены по лимиту дампа)' : ''}`);
        }
      } else if (/^ADBE Vector Shape - (Rect|Ellipse|Star)$/.test(n.matchName || '')) {
        out.ignored.push(t);
      } else if (n.matchName === 'ADBE Vector Filter - Merge') {
        out.merges += 1;
      }
    }
  };
  visit(root.children, IDENTITY, '');
  const sc = restValue(layerProp(layer, 'ADBE Transform Group', 'ADBE Scale')).value;
  out.layerScale = Array.isArray(sc) ? sc.slice(0, 2) : null;
  return out;
}

function looksLikeCube(layer) {
  if (layer.type !== 'shape' || extractShape(layer).pathCount !== 3) return false;
  return layerColors(layer).colors.some((c) => c.hex && c.kind !== 'stroke' && deltaE2000Hex(c.hex, '#26D07C') <= 10);
}

function looksLikeWordmark(layer) {
  if (layer.type !== 'shape') return false;
  const n = extractShape(layer).pathCount;
  return n >= 9 && n <= 12;
}

// Copies named in the audits, plus (discover) look-alikes: a 3-path green shape layer is a cube,
// a 9-12-path shape layer next to it is a wordmark.
export function findCopies(bundles, candidates, { discover = true } = {}) {
  const copies = [];
  const missing = [];
  const taken = new Set();
  const add = (b, d, layer, part, source) => {
    const key = `${b.index.slug}|${d.comp.id}|${layer.index}`;
    if (taken.has(key)) return;
    taken.add(key);
    copies.push({ slug: b.index.slug, comp: d.comp.name, compId: d.comp.id, compSlug: d.compSlug, layer: layer.name,
      layerIndex: layer.index, part, source, layerData: layer });
  };
  for (const c of candidates) {
    const b = bundles.find((x) => x.index.slug === c.slug);
    if (!b) { missing.push({ ...c, part: '—', reason: 'нет дампа пакета' }); continue; }
    const dumps = b.comps.filter((d) => d.comp.name === c.comp);
    if (!dumps.length) { missing.push({ ...c, part: '—', reason: 'нет композиции' }); continue; }
    for (const d of dumps) {
      for (const part of ['cube', 'wordmark']) {
        const layers = d.layers.filter((l) => l.name === c[part]);
        if (!layers.length) missing.push({ slug: c.slug, comp: c.comp, layer: c[part], part, reason: 'нет слоя' });
        for (const l of layers) add(b, d, l, part, 'аудит');
      }
    }
  }
  if (discover) {
    for (const b of bundles) {
      for (const d of b.comps) {
        const cubes = d.layers.filter(looksLikeCube);
        if (!cubes.length) continue;
        for (const l of cubes) add(b, d, l, 'cube', 'эвристика');
        for (const l of d.layers.filter(looksLikeWordmark)) add(b, d, l, 'wordmark', 'эвристика');
      }
    }
  }
  return { copies, missing };
}

function analysePart(part, copies, masterSubpaths) {
  const master = normalize(masterSubpaths);
  const groups = new Map();
  for (const c of copies) {
    c.shape = extractShape(c.layerData);
    if (!c.shape.subpaths.length) { c.error = 'нет контуров'; continue; }
    try {
      const plate = dropPlate(c.shape.subpaths); // a plate in the same shape is not part of the logo
      c.plateDropped = plate.dropped;
      c.norm = normalize(plate.subpaths);
    } catch (e) {
      c.error = e.message;
      continue;
    }
    c.fp = fingerprint(c.norm.subpaths);
    if (!groups.has(c.fp)) groups.set(c.fp, { fp: c.fp, norm: c.norm, members: [] });
    groups.get(c.fp).members.push(c);
  }
  const list = [...groups.values()];
  list.forEach((g, i) => {
    g.label = PREFIX[part] + (i + 1);
    g.members.forEach((c) => { c.group = g.label; });
    g.toMaster = compareOutlines(g.norm.subpaths, master.subpaths);
    g.verdict = verdict(g.toMaster.max);
  });
  const pairs = [];
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      pairs.push({ a: list[i].label, b: list[j].label, ...compareOutlines(list[i].norm.subpaths, list[j].norm.subpaths) });
    }
  }
  return { part, master, groups: list, pairs, copies };
}

export function analyse(copies, master) {
  const out = {};
  for (const part of Object.keys(PARTS)) {
    out[part] = analysePart(part, copies.filter((c) => c.part === part), master.parts[part]);
  }
  return out;
}

export function overlaySvg(masterNorm, groupNorm) {
  const k = 1000;
  const h = Math.ceil(Math.max(masterNorm.aspect, groupNorm.aspect) * k);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 ${k + 40} ${h + 40}" width="${k + 40}" height="${h + 40}">`,
    `<rect x="-20" y="-20" width="${k + 40}" height="${h + 40}" fill="#FFFFFF"/>`,
    `<path d="${pathData(masterNorm.subpaths, k)}" fill="#26D07C" fill-opacity="0.25" stroke="#222222" stroke-width="1"/>`,
    `<path d="${pathData(groupNorm.subpaths, k)}" fill="none" stroke="#FF00FF" stroke-width="1"/>`,
    '</svg>',
    '',
  ].join('\n');
}

const pm = (v) => (v * 1000).toFixed(2);
const esc = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|');

function colourCell(layer, palette) {
  const { colors, skippedDefaults } = layerColors(layer);
  const parts = colors.map((c) => {
    if (!c.hex) return `${c.kind}: цвета не читаются`;
    const k = classify(c.hex, palette);
    const where = k.status === 'palette' ? 'палитра' : k.status === 'near' ? `≈ ${k.nearest}, ΔE ${k.dE}` : `вне палитры, ближе всего ${k.nearest}, ΔE ${k.dE}`;
    const flags = [c.animated ? 'ключи' : '', c.expression ? 'выражение' : '', c.off ? 'выключен' : ''].filter(Boolean).join(', ');
    return `${c.hex} ${c.kind} (${where}${flags ? '; ' + flags : ''})`;
  });
  if (skippedDefaults) parts.push(`${skippedDefaults} цвет(а) эффектов по умолчанию пропущено`);
  return parts.join('; ') || '—';
}

export function renderReport(analysis, { missing = [], palette, master, meta = {} }) {
  const L = [];
  L.push('# Геометрия копий логотипа (D18)', '');
  L.push(`Собрано командой \`node tools/dump/logo-diff.mjs\` ${meta.date || ''} из дампов \`${meta.dumps || ''}\`; руками не править.`, '');
  L.push(`**Мастер:** \`${meta.masterFile || ''}\` (sha256 \`${meta.masterSha || ''}\`), копия \`html/templates/cn-assets/logo_color.svg\` из ae-motion-live. Сверка с Figma BAZIS (D18) — отдельно, когда будет доступ к коннектору.`, '');
  L.push('**Метод.** Контуры копии берутся из дампа слоя: пути фигур с трансформациями их групп, без трансформации самого слоя. ' +
    'Контур сдвигается к началу габарита и масштабируется к ширине 1. Отклонение — расстояние от точек одного контура до другого: ' +
    'max (хаусдорфово) и mean, в ‰ ширины детали (1 ‰ = 1 px при ширине 1000 px). ' +
    `«Совпадает» — max ≤ ${LIMITS.same * 1000} ‰, «близко» — ≤ ${LIMITS.close * 1000} ‰, иначе «отличается». ` +
    'Копии с одинаковой геометрией (до 0,1 ‰) объединены в группу. Взаимное положение куба и надписи здесь не сверяется: его видно на эталонных кадрах.', '');
  // The same comp name twice in one pack: tell the copies apart by comp id.
  const ids = new Map();
  for (const part of Object.keys(PARTS)) {
    for (const c of analysis[part].copies) {
      const k = c.slug + '|' + c.comp;
      if (!ids.has(k)) ids.set(k, new Set());
      ids.get(k).add(c.compId);
    }
  }
  const compCell = (c) => (ids.get(c.slug + '|' + c.comp).size > 1 ? `${c.comp} (id ${c.compId})` : c.comp);
  for (const part of Object.keys(PARTS)) {
    const a = analysis[part];
    L.push(`## ${PARTS[part][0].toUpperCase() + PARTS[part].slice(1)}`, '');
    L.push('| Группа | Пакет | Композиция | Слой | Найдено | Контуров | Масштаб слоя | Замечания |', '|---|---|---|---|---|---|---|---|');
    for (const c of a.copies) {
      const s = c.shape || { pathCount: 0, notes: [], ignored: [], merges: 0, offSkipped: 0 };
      const notes = [...s.notes];
      if (c.error) notes.push(c.error);
      if (s.ignored.length) notes.push(`без учёта: ${s.ignored.join(', ')}`);
      if (s.merges) notes.push(`Merge Paths: ${s.merges}`);
      if (c.plateDropped) notes.push('плашка-прямоугольник в той же фигуре не сравнивается');
      if (s.offSkipped) notes.push(`выключено: ${s.offSkipped}`);
      const sc = s.layerScale ? `${s.layerScale[0]} × ${s.layerScale[1]} %` + (Math.abs(s.layerScale[0] - s.layerScale[1]) > 1e-6 ? ' (неравномерно)' : '') : '—';
      L.push(`| ${c.group || '—'} | ${esc(c.slug)} | ${esc(compCell(c))} | ${esc(c.layer)} | ${c.source} | ${s.pathCount} | ${sc} | ${esc(notes.join('; ') || '—')} |`);
    }
    L.push('', `Мастер: контуров ${a.master.subpaths.length}, пропорция ${a.master.aspect.toFixed(4)}.`, '');
    L.push('| Группа | Копий | Пропорция (в/ш) | max к мастеру, ‰ | mean, ‰ | Вывод | Наложение |', '|---|---|---|---|---|---|---|');
    for (const g of a.groups) {
      L.push(`| ${g.label} | ${g.members.length} | ${g.norm.aspect.toFixed(4)} | ${pm(g.toMaster.max)} | ${pm(g.toMaster.mean)} | ${g.verdict} | [${part}-${g.label}.svg](logo-geometry/${part}-${g.label}.svg) |`);
    }
    if (a.groups.length > 1) {
      L.push('', 'Попарно, max ‰ (mean ‰):', '');
      L.push('| | ' + a.groups.map((g) => g.label).join(' | ') + ' |', '|---|' + a.groups.map(() => '---|').join(''));
      for (const g of a.groups) {
        const cells = a.groups.map((h) => {
          if (h === g) return '—';
          const p = a.pairs.find((x) => (x.a === g.label && x.b === h.label) || (x.a === h.label && x.b === g.label));
          return `${pm(p.max)} (${pm(p.mean)})`;
        });
        L.push(`| ${g.label} | ${cells.join(' | ')} |`);
      }
    }
    L.push('');
  }
  L.push('## Цвета копий', '');
  L.push(`Палитра: ${palette.source}${palette.fallback ? ' (brand/tokens.json не найден или без цветов)' : ''}. ` +
    `Мастер: куб ${master.fills.cube.join(', ')}, надпись ${master.fills.wordmark.join(', ')}. ` +
    '«≈» — ΔE2000 ≤ 2 к цвету палитры.', '');
  L.push('| Пакет | Композиция | Слой | Деталь | Цвета |', '|---|---|---|---|---|');
  for (const part of Object.keys(PARTS)) {
    for (const c of analysis[part].copies) {
      L.push(`| ${esc(c.slug)} | ${esc(compCell(c))} | ${esc(c.layer)} | ${PARTS[part]} | ${esc(colourCell(c.layerData, palette))} |`);
    }
  }
  L.push('');
  if (missing.length) {
    L.push('## Не найдено', '');
    for (const m of missing) L.push(`- ${m.slug} / ${m.comp}${m.layer ? ' / ' + m.layer : ''} (${m.part === '—' ? 'обе детали' : PARTS[m.part]}): ${m.reason}`);
    L.push('');
  }
  L.push('## Сводка', '');
  for (const part of Object.keys(PARTS)) {
    const a = analysis[part];
    const count = (v) => a.groups.filter((g) => g.verdict === v).reduce((s, g) => s + g.members.length, 0);
    L.push(`- ${PARTS[part]}: копий ${a.copies.length}, групп ${a.groups.length}; совпадают с мастером ${count('совпадает')}, близко ${count('близко')}, отличаются ${count('отличается')}.`);
  }
  L.push('');
  return L.join('\n');
}

function parseArgs(argv) {
  const val = (f, d) => { const i = argv.indexOf(f); return i === -1 ? d : argv[i + 1]; };
  return {
    dumps: val('--dumps', workPath('dumps')),
    master: val('--master', path.join(REPO, 'brand', 'logo', 'master-ae-motion-live.svg')),
    tokens: val('--tokens', path.join(REPO, 'brand', 'tokens.json')),
    out: val('--out', path.join(REPO, 'docs', 'research', 'logo-geometry.md')),
    discover: !argv.includes('--no-discover'),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const o = parseArgs(process.argv.slice(2));
  const svgText = readFileSync(o.master, 'utf8');
  const master = masterParts(svgText);
  const bundles = loadDumpRoot(o.dumps);
  if (!bundles.length) { console.error('no dumps under ' + o.dumps + ' (run node tools/dump/dump.mjs --all first)'); process.exit(1); }
  const candidates = JSON.parse(readFileSync(path.join(here, 'logo-candidates.json'), 'utf8')).copies;
  const { copies, missing } = findCopies(bundles, candidates, { discover: o.discover });
  const analysis = analyse(copies, master);
  const palette = loadPalette(o.tokens);
  const md = renderReport(analysis, {
    missing, palette, master,
    meta: {
      date: new Date().toISOString().slice(0, 10), dumps: o.dumps,
      masterFile: path.relative(REPO, o.master).replace(/\\/g, '/'),
      masterSha: createHash('sha256').update(readFileSync(o.master)).digest('hex'),
    },
  });
  const svgDir = path.join(path.dirname(o.out), 'logo-geometry');
  rmSync(svgDir, { recursive: true, force: true });
  mkdirSync(svgDir, { recursive: true });
  for (const part of Object.keys(PARTS)) {
    for (const g of analysis[part].groups) {
      writeFileSync(path.join(svgDir, `${part}-${g.label}.svg`), overlaySvg(analysis[part].master, g.norm), 'utf8');
    }
  }
  writeFileSync(o.out, md, 'utf8');
  for (const part of Object.keys(PARTS)) {
    const a = analysis[part];
    console.log(`${part}: ${a.copies.length} copies, ${a.groups.length} groups: ` +
      a.groups.map((g) => `${g.label} x${g.members.length} max ${pm(g.toMaster.max)} permille ${g.verdict}`).join('; '));
  }
  console.log(`missing: ${missing.length}; written ${o.out} and ${svgDir}`);
}
```

- [ ] **Step 11: Запустить тесты**

Run: `npx vitest run tests/dump/colors.test.mjs tests/dump/geometry.test.mjs tests/dump/logo-diff.test.mjs`
Expected: `26 passed`.

- [ ] **Step 12: Собрать отчёт по дампам задачи 6**

Run: `node tools/dump/logo-diff.mjs`
Expected: две строки сводки и путь отчёта, например:
```text
cube: N copies, K groups: C1 xA max 0.12 permille совпадает; C2 xB max 7.40 permille отличается
wordmark: N copies, K groups: W1 xA max … permille …
missing: M; written …\docs\research\logo-geometry.md and …\docs\research\logo-geometry
```
Если все композиции из аудитов нашлись, копий каждой детали не меньше 16 (по `logo-candidates.json`). Плюс то, что нашла эвристика.

- [ ] **Step 13: Разобрать «Не найдено» (вручную)**

Открыть `docs/research/logo-geometry.md`, раздел «Не найдено». Для каждой строки найти настоящее имя композиции или слоя:

```bash
node -e "import('./tools/dump/model.mjs').then(({ loadDumpRoot }) => { for (const b of loadDumpRoot('C:/CRBK/work/dumps')) for (const d of b.comps) for (const l of d.layers) if (/LOGO|Cloud\.ru|Outlines/.test(l.name)) console.log([b.index.slug, d.comp.name, l.index, l.name, l.type].join(' | ')); })"
```

Если копия есть под другим именем, поправить имя в `tools/dump/logo-candidates.json` и повторить шаг 12. Если композиции в пакете нет, строку из кандидатов не удалять: «Не найдено» — тоже результат.

- [ ] **Step 14: Показать результат дизайнеру и записать D18 (вручную)**

1. Открыть наложения групп «близко» и «отличается» из `docs/research/logo-geometry/` в браузере. Мастер — тёмный контур с зелёной заливкой, копия — пурпурный контур.
2. Вместе с дизайнером решить по D18, какие копии заменяются мастером.
3. Открыть лист решений `docs/decisions/phase0-decisions.md` (План 1, задача 27), строка D18. Ссылка `../research/logo-geometry.md` в «Доказательствах» уже есть: второй раз её не добавлять. Рядом с ней, в той же ячейке, дописать сводку из раздела «Сводка» отчёта — сколько копий куба и надписи совпадают с мастером, близко и отличаются. Например: `сводка 2026-10-05: куб — совпадают 12, близко 2, отличаются 2; надпись — совпадают 16, близко 0, отличаются 0`.
4. Пользователь вписывает в «Решение пользователя» вариант D18 и какие копии заменяются мастером, в «Дата» — дату.

Run: `grep "^| D18 " docs/decisions/phase0-decisions.md | grep -o "logo-geometry.md" | wc -l`
Expected: `1` — ссылка в строке D18 одна.

Без отчёта и этой записи фаза 0 не закрывается: проверка закрытия (План 1, задача 30) требует файл `docs/research/logo-geometry.md` и подписанную строку D18. Отчёт коммитится в задаче 9, лист решений — здесь.

- [ ] **Step 15: Commit**

```bash
git add tools/vendor/svgpath.cjs brand/logo/master-ae-motion-live.svg tools/dump/colors.mjs tools/dump/geometry.mjs tools/dump/logo-candidates.json tools/dump/logo-diff.mjs tests/dump/colors.test.mjs tests/dump/geometry.test.mjs tests/dump/logo-diff.test.mjs docs/decisions/phase0-decisions.md
git commit -m "feat(dump): logo geometry and colour diff against the master SVG" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: Доктор пакета

**Files:**
- Create: `tools/dump/doctor.mjs`
- Test: `tests/dump/doctor.test.mjs`
- Create (пишет `doctor.mjs`, коммит в задаче 9): `docs/research/packs/<slug>-doctor.md`

Доктор читает дамп пакета и карту перелинковки и пишет `docs/research/packs/<slug>-doctor.md`. Проверки:
- пропавший футаж (в рабочей копии должно быть 0);
- движок выражений и выражения с ошибкой;
- композиции не на Classic 3D;
- имена в NFD: элементы проекта, слои, пути футажа, исходные пути из карты перелинковки (в рабочей копии файлы уже переименованы, поэтому NFD видно только по карте);
- безымянные слои и композиции (`Shape Layer N`, `Pre-comp N`, `Layer N Outlines`, `… Solid N`);
- звук в композициях;
- смешанные fps: композиции, вложения с другой частотой, видеофутаж не 25 fps (D2);
- цвета вне палитры `brand/tokens.json` (нет файла — палитра D1);
- видимые опорные кадры (слои футажа `Still …` и `slide_…`, не guide);
- футаж вне слотов (`SLOT_*`);
- удержания и стоп-кадры time remap, обратный ход, отрицательное растяжение.

Карта перелинковки — из задач 1–5 этого плана. Доктор читает её терпимо: массив `{from, to}`, объект с массивом `entries`/`items`/`files` или просто `{старый путь: новый}`. Другой путь задаётся флагом `--relink`.

- [ ] **Step 1: Написать падающий тест `tests/dump/doctor.test.mjs`**

Синтетический пакет собран так, чтобы каждая проверка нашла ровно одну-две вещи.

```js
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { diagnose, loadRelinkMap, nfdMarks, renderDoctor } from '../../tools/dump/doctor.mjs';
import { loadPalette } from '../../tools/dump/colors.mjs';

const NFD = 'Дисклеймер.wav'.normalize('NFD');
const sw = (extra) => ({ enabled: true, guideLayer: false, ...extra });
const layer = (index, name, type, extra = {}) => ({ index, name, type, stretch: 100, switches: sw(), props: [], effects: [], masks: [], ...extra });
const fill = (rgb) => ({ matchName: 'ADBE Root Vectors Group', name: 'Contents', children: [
  { matchName: 'ADBE Vector Graphic - Fill', name: 'Fill 1', enabled: true, children: [
    { matchName: 'ADBE Vector Fill Color', name: 'Color', pvt: 'COLOR', value: rgb }] }] });

function podcast() {
  return {
    dir: 'C:/CRBK/work/dumps/podcast',
    index: { slug: 'podcast', file: 'C:\\CRBK\\packs\\podcast\\podcast_relinked.aep', aeVersion: '26.5x50', expressionEngine: 'extendscript', comps: [] },
    project: {
      expressionEngine: 'extendscript',
      items: [
        { id: 1, name: 'Pre-comp 3', kind: 'comp', folder: 'Precomp' },
        { id: 2, name: NFD, kind: 'footage', folder: 'SFX', source: { kind: 'file', file: 'C:/CRBK/packs/podcast/media/disclaimer.wav', hasVideo: false, hasAudio: true } },
        { id: 3, name: 'clip.mp4', kind: 'footage', folder: '', source: { kind: 'file', file: 'C:/CRBK/packs/podcast/media/clip.mp4', hasVideo: true, isStill: false, frameRate: 24 } },
        { id: 4, name: 'slide_01.png', kind: 'footage', folder: '', source: { kind: 'file', file: 'G:/Курсы/slide_01.png', missing: true, hasVideo: true, isStill: true } },
      ],
    },
    comps: [
      { comp: { id: 10, name: 'Overlay', frameRate: 25, renderer: 'ADBE Calder', bgColor: [0, 0, 0] }, layers: [
        layer(1, 'Still 2025-12-10 132207_1.1.1.png', 'av', { source: { kind: 'file', name: 'Still 2025-12-10 132207_1.1.1.png', file: 'C:/CRBK/packs/podcast/media/still.png', hasVideo: true, isStill: true } }),
        layer(2, 'Shape Layer 1', 'shape', { switches: sw({ threeDLayer: true }), props: [fill([0.827451, 0.827451, 0.827451, 1])] }),
        layer(3, 'SFX', 'av', { source: { kind: 'file', name: NFD, file: 'C:/CRBK/packs/podcast/media/disclaimer.wav', hasVideo: false, hasAudio: true } }),
        layer(4, 'Pre-comp 3', 'av', { stretch: -100, switches: sw({ timeRemapEnabled: true }), source: { kind: 'comp', name: 'Pre-comp 3', frameRate: 24 },
          props: [{ matchName: 'ADBE Time Remapping', name: 'Time Remap', pvt: 'OneD', keys: [
            { time: 0, value: 0, outInterp: 'LINEAR' }, { time: 1, value: 1, outInterp: 'LINEAR' },
            { time: 5, value: 1, outInterp: 'LINEAR' }, { time: 6, value: 0.5, outInterp: 'LINEAR' }] }] }),
        layer(5, 'TXT_TITLE', 'text', { props: [{ matchName: 'ADBE Transform Group', name: 'Transform', children: [
          { matchName: 'ADBE Opacity', name: 'Opacity', pvt: 'OneD', value: 100, expression: { text: 'thisComp.layer("X").opacity', enabled: true, error: 'Layer named X is missing\r\nline 1' } }] }] }),
        layer(6, 'SLOT_PHOTO', 'av', { source: { kind: 'file', name: 'photo.png', file: 'C:/CRBK/packs/podcast/media/photo.png', hasVideo: true, isStill: true } }),
        layer(7, 'Still guide', 'av', { switches: sw({ guideLayer: true }), source: { kind: 'file', name: 'Still 2.png', file: 'C:/CRBK/packs/podcast/media/still2.png', hasVideo: true, isStill: true } }),
      ] },
      { comp: { id: 11, name: 'Pre-comp 3', frameRate: 24, renderer: 'ADBE Escher', bgColor: [0.133333, 0.133333, 0.133333] }, layers: [] },
    ],
  };
}

const RELINK = { file: 'C:/CRBK/packs/podcast/relink-map.json', found: true, entries: [
  { from: 'C:/orig/(Footage)/SFX/' + NFD, to: 'C:/CRBK/packs/podcast/media/disclaimer.wav' }] };

describe('doctor', () => {
  it('reads relink maps in several shapes', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-doc-'));
    const write = (name, v) => { const f = path.join(dir, name); writeFileSync(f, JSON.stringify(v)); return f; };
    expect(loadRelinkMap(write('a.json', [{ from: 'a', to: 'b' }])).entries).toEqual([{ from: 'a', to: 'b' }]);
    expect(loadRelinkMap(write('b.json', { entries: [{ original: 'a', relinked: 'b' }] })).entries).toEqual([{ from: 'a', to: 'b' }]);
    expect(loadRelinkMap(write('c.json', { 'C:/a.wav': 'C:/b.wav' })).entries).toEqual([{ from: 'C:/a.wav', to: 'C:/b.wav' }]);
    expect(loadRelinkMap(path.join(dir, 'none.json'))).toMatchObject({ found: false, entries: [] });
  });

  it('names the combining marks of an NFD string', () => {
    expect(nfdMarks(NFD)).toBe('U+0306');
  });

  it('finds every hygiene problem of the synthetic pack', () => {
    const f = diagnose(podcast(), { palette: loadPalette(null), relink: RELINK });
    expect(f.engine).toMatchObject({ value: 'extendscript', legacy: true, expressions: 1 });
    expect(f.engine.errors).toEqual([{ comp: 'Overlay', layer: 'TXT_TITLE', where: 'Transform › Opacity', error: 'Layer named X is missing' }]);
    expect(f.advanced3d).toEqual([{ comp: 'Overlay', renderer: 'ADBE Calder', rendererName: 'Advanced 3D', threeDLayers: 1 }]);
    expect(f.renderers).toEqual({ 'ADBE Calder': 1, 'ADBE Escher': 1 });
    expect(f.nfd.map((n) => n.where)).toEqual(['элемент проекта', 'карта перелинковки, было']);
    expect(f.unnamed.map((u) => u.name)).toEqual(['Shape Layer 1', 'Pre-comp 3']);
    expect(f.unnamedComps).toEqual([{ name: 'Pre-comp 3', folder: 'Precomp' }]);
    expect(f.audio).toEqual([{ comp: 'Overlay', layer: 'SFX', file: 'C:/CRBK/packs/podcast/media/disclaimer.wav', audioEnabled: true, video: false }]);
    expect(f.fps.comps).toEqual({ 25: 1, 24: 1 });
    expect(f.fps.offCanon).toEqual([{ comp: 'Pre-comp 3', fps: 24 }]);
    expect(f.fps.nested).toEqual([{ comp: 'Overlay', fps: 25, layer: 'Pre-comp 3', sourceFps: 24 }]);
    expect(f.fps.footage).toEqual([{ name: 'clip.mp4', fps: 24, file: 'C:/CRBK/packs/podcast/media/clip.mp4' }]);
    expect(f.colors.list.map((c) => [c.hex, c.status, c.nearest])).toEqual([['#D3D3D3', 'off', '#F2F2F2']]);
    expect(f.colors.bg).toEqual({ '#000000': 1, '#222222': 1 });
    expect(f.stills).toEqual([{ comp: 'Overlay', layer: 'Still 2025-12-10 132207_1.1.1.png', file: 'C:/CRBK/packs/podcast/media/still.png' }]);
    expect(f.stillsHidden).toBe(1);
    expect(f.outsideSlots).toEqual([{ file: 'C:/CRBK/packs/podcast/media/still.png', layers: 1, comps: ['Overlay'] }]);
    expect(f.timeRemap).toEqual([{ comp: 'Overlay', layer: 'Pre-comp 3', issues: ['удержание 1–5 с (кадр 1 с)', 'обратный ход 5–6 с'] }]);
    expect(f.negativeStretch).toEqual([{ comp: 'Overlay', layer: 'Pre-comp 3', stretch: -100 }]);
    expect(f.missing).toEqual([{ name: 'slide_01.png', file: 'G:/Курсы/slide_01.png' }]);
  });

  it('reports a freeze frame and a hold key', () => {
    const b = podcast();
    b.comps[0].layers[3].props[0].keys = [{ time: 0, value: 2, outInterp: 'HOLD' }, { time: 3, value: 4, outInterp: 'LINEAR' }];
    expect(diagnose(b).timeRemap[0].issues).toEqual(['удержание ключом HOLD 0–3 с']);
    b.comps[0].layers[3].props[0] = { matchName: 'ADBE Time Remapping', name: 'Time Remap', pvt: 'OneD', value: 1.5 };
    expect(diagnose(b).timeRemap[0].issues).toEqual(['без ключей: стоп-кадр 1.5 с']);
  });

  it('renders the report with a summary table and sections', () => {
    const md = renderDoctor(diagnose(podcast(), { palette: loadPalette(null), relink: RELINK }), { date: '2026-10-05', dumpDir: 'C:/CRBK/work/dumps/podcast' });
    expect(md).toContain('# Доктор пакета: podcast');
    expect(md).toContain('| Движок выражений | extendscript (устаревший); выражений 1, с ошибкой 1 |');
    expect(md).toContain('| Пропавший футаж | 1 |');
    expect(md).toContain('| slide_01.png | G:/Курсы/slide_01.png |');
    expect(md).toContain('| Не Classic 3D | 1 комп. |');
    expect(md).toContain('| Имена в NFD | 2 |');
    expect(md).toContain('| Частоты кадров | 24 fps × 1, 25 fps × 1; не 25 fps: композиций 1, вложений с другой частотой 1, видеофутажа 1 |');
    expect(md).toContain('| #D3D3D3 | #F2F2F2 | 6.85 | fill | 1 | 0 | Overlay › Shape Layer 1 |');
    expect(md).toContain('| Overlay | Pre-comp 3 | удержание 1–5 с (кадр 1 с); обратный ход 5–6 с |');
    expect(md).toContain('Карта перелинковки: `C:/CRBK/packs/podcast/relink-map.json`, записей 1.');
    expect(md).not.toContain('\r');
  });

  it('says when the relink map is missing', () => {
    const md = renderDoctor(diagnose(podcast()), { dumpDir: 'x' });
    expect(md).toContain('Карта перелинковки не найдена');
    expect(md).toContain('Палитра: палитра D1 из спецификации (§9).');
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run tests/dump/doctor.test.mjs`
Expected: FAIL — `Cannot find module '../../tools/dump/doctor.mjs'`.

- [ ] **Step 3: Создать `tools/dump/doctor.mjs`**

Если в задаче 6 (шаг 17) нашёлся другой id Classic 3D, дописать его в `CLASSIC_RENDERERS`.

```js
#!/usr/bin/env node
// Pack doctor (spec 3.2): hygiene problems of one pack, from its JSX dump and the relink map.
//   node tools/dump/doctor.mjs --slug podcast [--dumps C:/CRBK/work/dumps] [--relink <relink-map.json>]
//                              [--tokens brand/tokens.json] [--out docs/research/packs]
//   node tools/dump/doctor.mjs --all
// Writes docs/research/packs/<slug>-doctor.md. Read-only: AE is not involved.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workPath } from '../lib/work.mjs';
import { packDir } from '../packs/paths.mjs';
import { aeColorToHex, classify, layerColors, loadPalette } from './colors.mjs';
import { isNfd, layerProp, listDumpDirs, loadDumpDir, readJson, walkLayer } from './model.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');

export const CANON_FPS = 25; // D2
// Classic 3D: CompItem.renderer has long returned 'ADBE Advanced 3d' for it; audit_podcast.json decoded
// 'ADBE Escher' (Classic 3D) and 'ADBE Calder' (Advanced 3D) from the .aep files. The live fixture
// check (Task 6) prints the ids this AE reports.
export const CLASSIC_RENDERERS = ['ADBE Advanced 3d', 'ADBE Escher'];
export const RENDERER_NAMES = {
  'ADBE Advanced 3d': 'Classic 3D', 'ADBE Escher': 'Classic 3D', 'ADBE Calder': 'Advanced 3D',
  'ADBE Ernst': 'Cinema 4D', 'ADBE Picasso': 'Ray-traced 3D',
};
// Names AE gives by itself. The packs were built in the English UI; the Russian-UI names are a best guess.
export const UNNAMED_LAYER = [
  /^Shape Layer \d+$/, /^Pre-comp \d+$/, /^Precomp \d+$/, /^Comp \d+$/, /^Null \d+$/, /^Adjustment Layer \d+$/,
  /^Camera \d+$/, /^Light \d+$/, /^Layer \d+ Outlines( \d+)?$/, / Solid \d+$/,
  /^Слой-фигура \d+$/, /^Композиция \d+$/, /^Пред\S* композиция \d+$/, /^Нуль \d+$/, /^Корректирующий слой \d+$/,
];
export const UNNAMED_COMP = [/^Pre-comp \d+$/, /^Precomp \d+$/, /^Comp \d+$/, /^Composition \d+$/, /^Композиция \d+$/, /^Пред\S* композиция \d+$/];
export const STILL_NAME = /^(still\b|slide_)/i;
export const SLOT_NAME = /^SLOT_/;
const ROWS = 200;

// Tolerant reader: the relink map comes from Plan 2 (relinked copies); accepts [{from,to}], {entries|items|files: [...]}
// with from/src/source/original/old and to/dst/target/relinked/new keys, or a plain {from: to} object.
export function loadRelinkMap(file) {
  if (!file || !existsSync(file)) return { file, found: false, entries: [] };
  const raw = readJson(file);
  const list = Array.isArray(raw) ? raw : ['entries', 'items', 'files'].map((k) => raw[k]).find(Array.isArray);
  const pick = (e, keys) => { for (const k of keys) if (typeof e[k] === 'string') return e[k]; return null; };
  const entries = [];
  if (list) {
    for (const e of list) {
      if (!e || typeof e !== 'object') continue;
      const from = pick(e, ['from', 'src', 'source', 'original', 'old']);
      const to = pick(e, ['to', 'dst', 'target', 'relinked', 'new']);
      if (from || to) entries.push({ from, to });
    }
  } else if (raw && typeof raw === 'object') {
    for (const [from, to] of Object.entries(raw)) if (typeof to === 'string') entries.push({ from, to });
  }
  return { file, found: true, entries };
}

// "й" in NFD is "и" + U+0306: name the combining marks so the report shows why a name is NFD.
export function nfdMarks(s) {
  const marks = [...new Set([...String(s)].filter((ch) => /\p{M}/u.test(ch)).map((ch) => 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')))];
  return marks.join(', ');
}

const fpsKey = (v) => (typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : '?');
const firstLine = (s) => String(s || '').split(/\r\n|\r|\n/)[0].slice(0, 160);

function timeRemapIssues(node) {
  const issues = [];
  if (!node) return issues;
  if (node.expression) issues.push(`выражение: ${firstLine(node.expression.text).slice(0, 80)}`);
  const keys = (node.keys || []).filter((k) => typeof k.value === 'number');
  if (!keys.length) {
    if (!node.expression) issues.push(`без ключей: стоп-кадр ${node.value} с`);
    return issues;
  }
  if (keys.length === 1) issues.push(`один ключ: стоп-кадр ${keys[0].value} с`);
  for (let i = 0; i + 1 < keys.length; i += 1) {
    const a = keys[i];
    const b = keys[i + 1];
    if (a.outInterp === 'HOLD') issues.push(`удержание ключом HOLD ${a.time}–${b.time} с`);
    else if (Math.abs(b.value - a.value) < 1e-6) issues.push(`удержание ${a.time}–${b.time} с (кадр ${a.value} с)`);
    else if (b.value < a.value) issues.push(`обратный ход ${a.time}–${b.time} с`);
  }
  return issues;
}

export function diagnose(bundle, { palette = loadPalette(null), relink = { found: false, entries: [] }, canonFps = CANON_FPS } = {}) {
  const items = (bundle.project && bundle.project.items) || [];
  const f = {
    slug: bundle.index.slug,
    project: bundle.index.file || (bundle.project && bundle.project.file) || '',
    aeVersion: bundle.index.aeVersion || '',
    engine: { value: (bundle.project && bundle.project.expressionEngine) || bundle.index.expressionEngine || null, expressions: 0, errors: [] },
    renderers: {}, advanced3d: [], nfd: [], unnamed: [], unnamedComps: [], audio: [], missing: [],
    fps: { comps: {}, offCanon: [], nested: [], footage: [] },
    colors: { list: [], bg: {}, gradients: [], skippedDefaults: 0 },
    stills: [], stillsHidden: 0, outsideSlots: [], timeRemap: [], negativeStretch: [], relink,
  };
  f.engine.legacy = f.engine.value === 'extendscript';

  for (const it of items) {
    if (it.source && it.source.missing === true) f.missing.push({ name: it.name, file: it.source.file || '' });
    if (isNfd(it.name)) f.nfd.push({ where: 'элемент проекта', name: it.name, detail: it.folder || '' });
    if (it.source && isNfd(it.source.file)) f.nfd.push({ where: 'путь футажа', name: it.source.file, detail: it.name });
    if (it.kind === 'comp' && UNNAMED_COMP.some((re) => re.test(it.name))) f.unnamedComps.push({ name: it.name, folder: it.folder || '' });
    const s = it.source;
    if (it.kind === 'footage' && s && s.kind === 'file' && s.hasVideo && !s.isStill && typeof s.frameRate === 'number' &&
        Math.abs(s.frameRate - canonFps) > 1e-3) {
      f.fps.footage.push({ name: it.name, fps: s.frameRate, file: s.file });
    }
  }
  for (const e of relink.entries) {
    if (isNfd(e.from)) f.nfd.push({ where: 'карта перелинковки, было', name: e.from, detail: e.to || '' });
    if (isNfd(e.to)) f.nfd.push({ where: 'карта перелинковки, стало', name: e.to, detail: e.from || '' });
  }

  const colorMap = new Map();
  const slotFiles = new Map();
  for (const d of bundle.comps) {
    const c = d.comp;
    const ren = c.renderer || '?';
    f.renderers[ren] = (f.renderers[ren] || 0) + 1;
    if (c.renderer && !CLASSIC_RENDERERS.includes(c.renderer)) {
      f.advanced3d.push({ comp: c.name, renderer: c.renderer, rendererName: RENDERER_NAMES[c.renderer] || 'не Classic 3D',
        threeDLayers: d.layers.filter((l) => l.switches && l.switches.threeDLayer).length });
    }
    const k = fpsKey(c.frameRate);
    f.fps.comps[k] = (f.fps.comps[k] || 0) + 1;
    if (typeof c.frameRate === 'number' && Math.abs(c.frameRate - canonFps) > 1e-3) f.fps.offCanon.push({ comp: c.name, fps: c.frameRate });
    if (Array.isArray(c.bgColor)) {
      const bg = aeColorToHex(c.bgColor);
      f.colors.bg[bg] = (f.colors.bg[bg] || 0) + 1;
    }
    for (const l of d.layers) {
      const sw = l.switches || {};
      const src = l.source || null;
      const where = `${c.name} › ${l.name}`;
      if (isNfd(l.name)) f.nfd.push({ where: 'слой', name: l.name, detail: c.name });
      if (UNNAMED_LAYER.some((re) => re.test(l.name || ''))) f.unnamed.push({ comp: c.name, index: l.index, name: l.name, type: l.type });
      if (src && src.kind === 'comp' && typeof src.frameRate === 'number' && typeof c.frameRate === 'number' &&
          Math.abs(src.frameRate - c.frameRate) > 1e-3) {
        f.fps.nested.push({ comp: c.name, fps: c.frameRate, layer: l.name, sourceFps: src.frameRate });
      }
      if (src && src.kind === 'file') {
        if (src.hasAudio === true) {
          f.audio.push({ comp: c.name, layer: l.name, file: src.file || src.name, audioEnabled: sw.audioEnabled !== false, video: src.hasVideo === true });
        }
        if (STILL_NAME.test(l.name || '') || STILL_NAME.test(src.name || '')) {
          if (sw.enabled !== false && sw.guideLayer !== true) f.stills.push({ comp: c.name, layer: l.name, file: src.file || src.name });
          else f.stillsHidden += 1;
        }
        if (src.hasVideo !== false && !SLOT_NAME.test(l.name || '') && sw.guideLayer !== true) {
          const key = src.file || src.name;
          if (!slotFiles.has(key)) slotFiles.set(key, { file: key, layers: 0, comps: new Set() });
          const e = slotFiles.get(key);
          e.layers += 1;
          e.comps.add(c.name);
        }
      }
      if (typeof l.stretch === 'number' && l.stretch < 0) f.negativeStretch.push({ comp: c.name, layer: l.name, stretch: l.stretch });
      if (sw.timeRemapEnabled === true) {
        const issues = timeRemapIssues(layerProp(l, 'ADBE Time Remapping'));
        if (issues.length) f.timeRemap.push({ comp: c.name, layer: l.name, issues });
      }
      for (const { node, trail } of walkLayer(l)) {
        if (!node.expression) continue;
        f.engine.expressions += 1;
        if (node.expression.error) f.engine.errors.push({ comp: c.name, layer: l.name, where: trail.join(' › '), error: firstLine(node.expression.error) });
      }
      const { colors, skippedDefaults } = layerColors(l);
      f.colors.skippedDefaults += skippedDefaults;
      for (const col of colors) {
        if (!col.hex) { f.colors.gradients.push({ where, label: col.label }); continue; }
        if (!colorMap.has(col.hex)) colorMap.set(col.hex, { hex: col.hex, uses: 0, hidden: 0, kinds: new Set(), examples: [] });
        const e = colorMap.get(col.hex);
        if (col.off) e.hidden += 1; else e.uses += 1;
        e.kinds.add(col.kind);
        if (e.examples.length < 3 && !e.examples.includes(where)) e.examples.push(where);
      }
    }
  }
  f.colors.list = [...colorMap.values()]
    .map((e) => ({ ...e, kinds: [...e.kinds].sort(), ...classify(e.hex, palette) }))
    .sort((a, b) => b.uses - a.uses || a.hex.localeCompare(b.hex));
  f.outsideSlots = [...slotFiles.values()].map((e) => ({ file: e.file, layers: e.layers, comps: [...e.comps] }))
    .sort((a, b) => b.layers - a.layers || String(a.file).localeCompare(String(b.file)));
  f.palette = palette;
  return f;
}

const esc = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

function table(L, head, rows) {
  L.push('| ' + head.join(' | ') + ' |', '|' + head.map(() => '---|').join(''));
  for (const r of rows.slice(0, ROWS)) L.push('| ' + r.map(esc).join(' | ') + ' |');
  if (rows.length > ROWS) L.push('', `… и ещё ${rows.length - ROWS}.`);
  L.push('');
}

export function renderDoctor(f, { date = new Date().toISOString().slice(0, 10), dumpDir = '' } = {}) {
  const off = f.colors.list.filter((c) => c.status === 'off');
  const near = f.colors.list.filter((c) => c.status === 'near');
  const fpsList = Object.entries(f.fps.comps).sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([k, n]) => `${k} fps × ${n}`).join(', ') || '—';
  const L = [`# Доктор пакета: ${f.slug}`, ''];
  L.push(`Собрано командой \`node tools/dump/doctor.mjs --slug ${f.slug}\` ${date} из \`${dumpDir}\` (проект \`${f.project}\`, AE ${f.aeVersion}); руками не править.`, '');
  L.push(f.relink.found
    ? `Карта перелинковки: \`${f.relink.file}\`, записей ${f.relink.entries.length}.`
    : `Карта перелинковки не найдена (\`${f.relink.file || '—'}\`): NFD в исходных путях не проверены.`, '');
  L.push(`Палитра: ${f.palette.source}.`, '');
  L.push('| Проверка | Найдено |', '|---|---|');
  L.push(`| Пропавший футаж | ${f.missing.length} |`);
  L.push(`| Движок выражений | ${f.engine.value || '?'}${f.engine.legacy ? ' (устаревший)' : ''}; выражений ${f.engine.expressions}, с ошибкой ${f.engine.errors.length} |`);
  L.push(`| Не Classic 3D | ${f.advanced3d.length} комп. |`);
  L.push(`| Имена в NFD | ${f.nfd.length} |`);
  L.push(`| Безымянные слои / композиции | ${f.unnamed.length} / ${f.unnamedComps.length} |`);
  L.push(`| Звук в композициях | ${f.audio.length} слоёв |`);
  L.push(`| Частоты кадров | ${fpsList}; не ${CANON_FPS} fps: композиций ${f.fps.offCanon.length}, вложений с другой частотой ${f.fps.nested.length}, видеофутажа ${f.fps.footage.length} |`);
  L.push(`| Цвета вне палитры | ${off.length} (почти в палитре: ${near.length}) |`);
  L.push(`| Видимые опорные кадры | ${f.stills.length} (скрытых или guide: ${f.stillsHidden}) |`);
  L.push(`| Футаж вне слотов | файлов ${f.outsideSlots.length}, слоёв ${f.outsideSlots.reduce((s, e) => s + e.layers, 0)} |`);
  L.push(`| Удержания и стоп-кадры time remap | ${f.timeRemap.length} слоёв |`);
  L.push(`| Отрицательное растяжение | ${f.negativeStretch.length} слоёв |`, '');

  if (f.missing.length) {
    L.push('## Пропавший футаж', '', 'В рабочей копии пропавших файлов быть не должно (задачи 1–5).', '');
    table(L, ['Элемент', 'Путь'], f.missing.map((m) => [m.name, m.file]));
  }

  L.push('## Движок выражений', '');
  L.push(`Проект: \`${f.engine.value}\`. ${f.engine.legacy ? 'Устаревший ExtendScript: шаблоны собираются под JavaScript и проверяются в обоих движках (§4.2).' : ''}`, '');
  if (f.engine.errors.length) table(L, ['Композиция', 'Слой', 'Свойство', 'Ошибка'], f.engine.errors.map((e) => [e.comp, e.layer, e.where, e.error]));

  L.push('## Не Classic 3D', '');
  L.push(`Рендереры по композициям: ${Object.entries(f.renderers).map(([k, n]) => `\`${k}\` × ${n}`).join(', ') || '—'}.`, '');
  if (f.advanced3d.length && f.advanced3d.length === Object.values(f.renderers).reduce((s, n) => s + n, 0)) {
    L.push('Внимание: не Classic 3D оказались все композиции — проверьте `CLASSIC_RENDERERS` в `tools/dump/doctor.mjs` по выводу задачи 6.', '');
  }
  if (f.advanced3d.length) table(L, ['Композиция', 'Рендерер', 'Слоёв 3D'], f.advanced3d.map((a) => [a.comp, `${a.rendererName} (\`${a.renderer}\`)`, a.threeDLayers]));

  L.push('## Имена в NFD', '');
  if (f.nfd.length) table(L, ['Где', 'Имя', 'Знаки', 'Контекст'], f.nfd.map((n) => [n.where, n.name, nfdMarks(n.name), n.detail]));
  else L.push('Не найдено.', '');

  L.push('## Безымянные слои и композиции', '');
  if (f.unnamedComps.length) table(L, ['Композиция', 'Папка'], f.unnamedComps.map((u) => [u.name, u.folder]));
  if (f.unnamed.length) table(L, ['Композиция', '#', 'Слой', 'Тип'], f.unnamed.map((u) => [u.comp, u.index, u.name, u.type]));
  if (!f.unnamed.length && !f.unnamedComps.length) L.push('Не найдено.', '');

  L.push('## Звук в композициях', '');
  if (f.audio.length) table(L, ['Композиция', 'Слой', 'Файл', 'Звук включён', 'Есть видео'], f.audio.map((a) => [a.comp, a.layer, a.file, a.audioEnabled ? 'да' : 'нет', a.video ? 'да' : 'нет']));
  else L.push('Не найдено.', '');

  L.push('## Частоты кадров', '');
  L.push(`Композиции: ${fpsList}. Канон D2 — ${CANON_FPS} fps.`, '');
  if (f.fps.offCanon.length) table(L, ['Композиция', 'fps'], f.fps.offCanon.map((x) => [x.comp, x.fps]));
  if (f.fps.nested.length) table(L, ['Композиция', 'fps', 'Вложенная', 'Её fps'], f.fps.nested.map((x) => [x.comp, x.fps, x.layer, x.sourceFps]));
  if (f.fps.footage.length) table(L, ['Футаж', 'fps', 'Файл'], f.fps.footage.map((x) => [x.name, x.fps, x.file]));

  L.push('## Цвета', '');
  L.push(`«≈» — ΔE2000 ≤ 2 к цвету палитры. Цвета эффектов, не менявшиеся с создания, пропущены: ${f.colors.skippedDefaults}.`, '');
  const colorRows = (list) => list.map((c) => [c.hex, c.nearest, c.dE, c.kinds.join(', '), c.uses, c.hidden, c.examples.join('; ')]);
  if (off.length) { L.push('### Вне палитры', ''); table(L, ['Цвет', 'Ближайший', 'ΔE00', 'Где', 'Видимых', 'Скрытых', 'Примеры'], colorRows(off)); }
  if (near.length) { L.push('### Почти в палитре', ''); table(L, ['Цвет', 'Ближайший', 'ΔE00', 'Где', 'Видимых', 'Скрытых', 'Примеры'], colorRows(near)); }
  if (!off.length && !near.length) L.push('Все цвета из палитры.', '');
  L.push(`Фоны композиций: ${Object.entries(f.colors.bg).map(([h, n]) => `${h} × ${n}`).join(', ') || '—'} (рендерятся только без альфы).`, '');
  if (f.colors.gradients.length) {
    L.push(`Градиенты (цвета скриптом не читаются, сверить вручную): ${f.colors.gradients.slice(0, 20).map((g) => `${g.where} (${g.label})`).join('; ')}.`, '');
  }

  L.push('## Видимые опорные кадры', '');
  if (f.stills.length) table(L, ['Композиция', 'Слой', 'Файл'], f.stills.map((s) => [s.comp, s.layer, s.file]));
  else L.push('Не найдено.', '');

  L.push('## Футаж вне слотов', '');
  L.push('Слоты — слои `SLOT_*` (контракт §4.2); guide-слои не считаются.', '');
  if (f.outsideSlots.length) table(L, ['Файл', 'Слоёв', 'Композиции'], f.outsideSlots.map((s) => [s.file, s.layers, s.comps.slice(0, 5).join('; ') + (s.comps.length > 5 ? ` и ещё ${s.comps.length - 5}` : '')]));
  else L.push('Не найдено.', '');

  L.push('## Удержания time remap и отрицательное растяжение', '');
  if (f.timeRemap.length) table(L, ['Композиция', 'Слой', 'Что'], f.timeRemap.map((t) => [t.comp, t.layer, t.issues.join('; ')]));
  if (f.negativeStretch.length) table(L, ['Композиция', 'Слой', 'Растяжение, %'], f.negativeStretch.map((n) => [n.comp, n.layer, n.stretch]));
  if (!f.timeRemap.length && !f.negativeStretch.length) L.push('Не найдено.', '');
  return L.join('\n');
}

function parseArgs(argv) {
  const val = (flag, d) => { const i = argv.indexOf(flag); return i === -1 ? d : argv[i + 1]; };
  return {
    slug: val('--slug', null), all: argv.includes('--all'),
    dumps: val('--dumps', workPath('dumps')), relink: val('--relink', null),
    tokens: val('--tokens', path.join(REPO, 'brand', 'tokens.json')),
    out: val('--out', path.join(REPO, 'docs', 'research', 'packs')),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const o = parseArgs(process.argv.slice(2));
  if (!o.all && !o.slug) { console.error('usage: node tools/dump/doctor.mjs --slug <slug> | --all [--dumps dir] [--relink file] [--tokens file] [--out dir]'); process.exit(2); }
  const dirs = o.all ? listDumpDirs(o.dumps) : [path.join(o.dumps, o.slug)];
  const palette = loadPalette(o.tokens);
  mkdirSync(o.out, { recursive: true });
  for (const dir of dirs) {
    const b = loadDumpDir(dir); // one pack in memory at a time
    const slug = b.index.slug;
    const relinkFile = o.relink && !o.all ? o.relink : path.posix.join(packDir(slug), 'relink-map.json');
    const f = diagnose(b, { palette, relink: loadRelinkMap(relinkFile) });
    const file = path.join(o.out, `${slug}-doctor.md`);
    writeFileSync(file, renderDoctor(f, { dumpDir: b.dir.replace(/\\/g, '/') }), 'utf8');
    console.log(`${slug}: engine ${f.engine.value}, not classic ${f.advanced3d.length}, nfd ${f.nfd.length}, unnamed ${f.unnamed.length}, ` +
      `audio ${f.audio.length}, off-canon fps ${f.fps.offCanon.length}, off-palette ${f.colors.list.filter((c) => c.status === 'off').length}, ` +
      `stills ${f.stills.length}, footage files ${f.outsideSlots.length}, time remap ${f.timeRemap.length}, negative stretch ${f.negativeStretch.length} -> ${file}`);
  }
}
```

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/dump/doctor.test.mjs`
Expected: `6 passed`.

- [ ] **Step 5: Собрать отчёты по всем пакетам**

Run: `node tools/dump/doctor.mjs --all`
Expected: девять строк вида
```text
podcast: engine extendscript, not classic 3, nfd 4, unnamed 57, audio 15, off-canon fps 0, off-palette 6, stills 14, footage files 31, time remap 1, negative stretch 0 -> …\docs\research\packs\podcast-doctor.md
```
(числа здесь для примера) и девять файлов `docs/research/packs/<slug>-doctor.md`. Если у пакета нет карты перелинковки, в начале его отчёта будет строка «Карта перелинковки не найдена».

- [ ] **Step 6: Сверить отчёты с аудитом (вручную)**

Аудит был эвристическим (спецификация §3.2), поэтому расхождение не обязательно ошибка доктора. Ориентиры из аудитов и спецификации:
- движок выражений `extendscript` во всех девяти пакетах (§2);
- podcast: не Classic 3D — 3 композиции («Подписывайся! Ссылки в описании», Cloud.ru_WhiteColour, Cloud.ru_BlackColour); видимый опорный кадр `Still 2025-12-10 132207_1.x.1.png` — в 14 композициях (отчёт считает слои, композиции видны в таблице);
- smm: не Classic 3D — 5 композиций (BG_pattern_1x1_1, BG_pattern_1x1_2, Плашки_9x16, Оверлей_1x1, Shape Layer 5 Comp 1); fps 24 и 25 вперемешку;
- NFD по картам перелинковки — не больше 10 имён на все пакеты (§2: 10 NFD-имён во всём пакете, часть из них — рендеры, на которые проекты не ссылаются).

Если число сильно расходится, проверить одну-две такие композиции в AE: открыть рабочую копию, посмотреть и закрыть без сохранения (File → Close Project → Don't Save). Если ошибся доктор, поправить правило в `tools/dump/doctor.mjs` (`UNNAMED_LAYER`, `STILL_NAME`, `CLASSIC_RENDERERS`), добавить случай в тест и повторить шаги 4–5.

- [ ] **Step 7: Commit**

```bash
git add tools/dump/doctor.mjs tests/dump/doctor.test.mjs
git commit -m "feat(dump): pack doctor reports from JSX dumps" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: Манифесты, README и отчёты в репозиторий

**Files:**
- Create: `tools/dump/manifest.mjs`, `docs/research/README.md`
- Create (пишет `manifest.mjs`): `docs/research/manifests/golden.json`, `docs/research/manifests/dumps.json`
- Test: `tests/dump/manifest.test.mjs`
- Commit (собраны в задачах 7–8): `docs/research/logo-geometry.md`, `docs/research/logo-geometry/*.svg`, `docs/research/packs/*-doctor.md`

Эталонные кадры и дампы остаются в рабочей папке: они большие и пересобираются. В репозиторий идут их манифесты (путь, размер, sha256), отчёты задач 7–8 и `docs/research/README.md` — где что лежит и как пересобрать.

- [ ] **Step 1: Написать падающий тест `tests/dump/manifest.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildManifest, listFiles } from '../../tools/dump/manifest.mjs';

function tree() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'bk-man-'));
  const put = (rel, text) => {
    const p = path.join(root, ...rel.split('/'));
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, text);
  };
  put('smm/bg/t0.png', 'b');
  put('logo/shot/t500.png', 'a2');
  put('logo/shot/t0.png', 'a1');
  put('logo/shot/notes.txt', 'x');
  put('logo.tmp/shot/t0.png', 'half-written');
  return root;
}

describe('manifest', () => {
  it('lists matching files with POSIX paths, sorted, without *.tmp folders', () => {
    expect(listFiles(tree(), (n) => n.endsWith('.png'))).toEqual(['logo/shot/t0.png', 'logo/shot/t500.png', 'smm/bg/t0.png']);
    expect(listFiles(path.join(os.tmpdir(), 'bk-no-such-dir'))).toEqual([]);
  });

  it('records size and sha256 per file and totals per slug', () => {
    const m = buildManifest(tree(), { filter: (n) => n.endsWith('.png'), now: () => new Date('2026-10-05T10:00:00Z') });
    expect(m).toMatchObject({ generated: '2026-10-05T10:00:00.000Z', count: 3, bytes: 5, bySlug: { logo: { files: 2, bytes: 4 }, smm: { files: 1, bytes: 1 } } });
    expect(m.files[0]).toEqual({ path: 'logo/shot/t0.png', bytes: 2, sha256: createHash('sha256').update('a1').digest('hex') });
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run tests/dump/manifest.test.mjs`
Expected: FAIL — `Cannot find module '../../tools/dump/manifest.mjs'`.

- [ ] **Step 3: Создать `tools/dump/manifest.mjs`**

```js
#!/usr/bin/env node
// sha256 manifests of the work outputs that stay out of git: golden frames and JSX dumps.
//   node tools/dump/manifest.mjs [--work C:/CRBK/work] [--out docs/research/manifests]
// Writes golden.json (*.png under <work>/golden) and dumps.json (*.json under <work>/dumps).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workDir } from '../lib/work.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');

// Relative POSIX paths of matching files, sorted; unfinished *.tmp folders are skipped.
export function listFiles(root, filter = () => true) {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!e.name.endsWith('.tmp')) walk(p);
      } else if (filter(e.name)) {
        out.push(path.relative(root, p).split(path.sep).join('/'));
      }
    }
  };
  if (existsSync(root)) walk(root);
  return out.sort();
}

export function buildManifest(root, { filter, now = () => new Date() } = {}) {
  const files = listFiles(root, filter).map((rel) => {
    const buf = readFileSync(path.join(root, rel));
    return { path: rel, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') };
  });
  const bySlug = {};
  for (const f of files) {
    const slug = f.path.split('/')[0];
    if (!bySlug[slug]) bySlug[slug] = { files: 0, bytes: 0 };
    bySlug[slug].files += 1;
    bySlug[slug].bytes += f.bytes;
  }
  return {
    root: String(root).replace(/\\/g, '/'), generated: now().toISOString(), count: files.length,
    bytes: files.reduce((s, f) => s + f.bytes, 0), bySlug, files,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const val = (flag, d) => { const i = argv.indexOf(flag); return i === -1 ? d : argv[i + 1]; };
  const work = val('--work', workDir());
  const out = val('--out', path.join(REPO, 'docs', 'research', 'manifests'));
  mkdirSync(out, { recursive: true });
  const jobs = [
    ['golden.json', path.join(work, 'golden'), (n) => n.toLowerCase().endsWith('.png')],
    ['dumps.json', path.join(work, 'dumps'), (n) => n.toLowerCase().endsWith('.json')],
  ];
  let empty = 0;
  for (const [name, root, filter] of jobs) {
    const m = buildManifest(root, { filter });
    writeFileSync(path.join(out, name), JSON.stringify(m, null, 1) + '\n', 'utf8');
    console.log(`${name}: ${m.count} files, ${(m.bytes / 1048576).toFixed(1)} MB, ` +
      Object.entries(m.bySlug).map(([s, v]) => `${s} ${v.files}`).join(', '));
    if (!m.count) empty += 1;
  }
  process.exit(empty ? 1 : 0);
}
```

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/dump/manifest.test.mjs`
Expected: `2 passed`.

- [ ] **Step 5: Собрать манифесты**

Run: `node tools/dump/manifest.mjs`
Expected (числа — по факту):
```text
golden.json: N files, X MB, courses …, courses_conv …, logo …, …
dumps.json: M files, Y MB, courses …, courses_conv …, fixture …, logo …, …
```
Код выхода 0. Если одна из папок пуста, код 1: сначала собрать эталоны (задачи 1–5) и дампы (задача 6).

- [ ] **Step 6: Создать `docs/research/README.md`**

```markdown
# docs/research — доказательная база и отчёты

Здесь лежат проверенные факты, на которых стоят спецификация и планы. Большие файлы (эталонные кадры, JSX-дампы) в git не хранятся: они лежат в рабочей папке с ASCII-путём (`C:/CRBK/…` на Windows, `/Users/Shared/CRBK/…` на Mac, или по переменной `BRANDKIT_WORK`), а в репозитории — их манифесты с sha256.

## Что где

| Что | Где | Чем собирается |
|---|---|---|
| Аудиты пакетов, ресёрч, проверки платформ (2026-10-02) | `2026-10-02/` | вручную; `verify_*.json` важнее `research_*.json` |
| Снимок оригиналов только для чтения | `C:/CRBK/archive/2026-10-02/` и его манифест sha256 | План 2, задачи 1–5 |
| Рабочие копии «только перелинковка» | `C:/CRBK/packs/<slug>/<slug>_relinked.aep` | План 2, задачи 1–5 |
| Эталонные кадры | `C:/CRBK/work/golden/<slug>/<compSlug>/t<ms>.png` | План 2, задачи 1–5 |
| JSX-дампы | `C:/CRBK/work/dumps/<slug>/` | `node tools/dump/dump.mjs --all` |
| Геометрия и цвета копий логотипа (D18) | `logo-geometry.md`, `logo-geometry/*.svg` | `node tools/dump/logo-diff.mjs` |
| Доктор пакетов | `packs/<slug>-doctor.md` | `node tools/dump/doctor.mjs --all` |
| Манифесты эталонов и дампов | `manifests/golden.json`, `manifests/dumps.json` | `node tools/dump/manifest.mjs` |

План 2 — `docs/superpowers/plans/2026-10-02-phase1-prep-golden-and-dumps.md`.

`<slug>` — logo, logo_conv, titles, titles_conv, webinars, courses, courses_conv, smm, podcast. `<compSlug>` — ASCII-транслитерация имени композиции, `compSlugs()` из `tools/packs/slug.mjs`: уникальна в проекте, повторы имени по возрастанию id получают `_2`, `_3`. Эталон и дамп одной композиции называются одинаково: папка `golden/<slug>/<compSlug>/` и файл `dumps/<slug>/<compSlug>.json`. Исключение — композиция, чей `compSlug` равен `index` или `project` (так называются служебные файлы папки дампа): её файл — `<compSlug>__<id>.json`, а `compSlug` в `index.json` прежний.

## JSX-дамп

Папка пакета `C:/CRBK/work/dumps/<slug>/`:

- `index.json` — список композиций: имя, папка в проекте, `compSlug`, файл, число слоёв, время дампа, сколько значений пропущено по лимиту, ошибки;
- `project.json` — настройки проекта (движок выражений, глубина цвета, рабочее пространство), все элементы проекта с папками, футаж с путями и признаком «пропал», шрифты (`usedFonts`);
- `<compSlug>.json` — композиция (размер, fps, длительность, рабочая область, фон, рендерер, motion blur, маркеры с защищёнными областями) и её слои: тип, источник, тайминг, родитель, матт, режим наложения, переключатели, эффекты, маски и всё дерево свойств с ключами (интерполяция, скорость и влияние по измерениям, пространственные касательные, roving), выражениями (текст, включено, ошибка, значение на 0 с), текстовыми документами и содержимым фигур.

Схема `crbk-dump/1`. Время — секунды композиции, числа округлены до 1e-6, цвета — доли 0…1, как в AE. Лимиты: 1000 ключей на свойство, 5000 вершин на путь, 20 000 знаков текста, 50 000 знаков выражения; что пропущено, перечислено в поле `truncated` дампа.

Числа для пересборки (тайминги, кривые, ширины) берутся только из дампов (спецификация §3.2).

## Как пересобрать

1. Открыть After Effects 2026 с панелью BrandKit Dev (Window → Extensions → BrandKit Dev, порт 8094). Свой проект сохранить или закрыть: с несохранённым проектом дампер не работает.
2. `node tools/dump/dump.mjs --all` — дампы всех пакетов. AE только читает: открывает рабочую копию, читает, закрывает без сохранения. Один пакет: `--slug <slug>`.
3. `node tools/dump/logo-diff.mjs` и `node tools/dump/doctor.mjs --all` — отчёты.
4. `node tools/dump/manifest.mjs` — манифесты. `git diff docs/research/manifests` покажет, какие эталоны и дампы изменились.

Если вызов AE завершился по таймауту, его не повторяют: сначала смотрят, нет ли в AE модального окна (ae-quirks #25).
```

- [ ] **Step 7: Прогнать все тесты и линтер**

Run: `npm test && node tools/jsx/lint-jsx.cjs tools/dump/dump-project.jsx`
Expected: все тесты зелёные (в `tests/dump` — 65 тестов в 9 файлах); `OK    tools/dump/dump-project.jsx`.

- [ ] **Step 8: Проверить, что в коммит не попадут кадры и дампы**

Run: `git status --short docs/research tools/dump tests/dump`
Expected: новые только `docs/research/README.md`, `docs/research/manifests/`, `docs/research/logo-geometry.md`, `docs/research/logo-geometry/`, `docs/research/packs/`, `tools/dump/manifest.mjs`, `tests/dump/manifest.test.mjs`. Ни одного `.png` и ни одного дампа `.json` вне `manifests/`.

- [ ] **Step 9: Commit**

```bash
git add tools/dump/manifest.mjs tests/dump/manifest.test.mjs docs/research/README.md docs/research/manifests/golden.json docs/research/manifests/dumps.json docs/research/logo-geometry.md docs/research/logo-geometry docs/research/packs
git commit -m "docs(research): golden and dump manifests, logo geometry and pack doctor reports" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
