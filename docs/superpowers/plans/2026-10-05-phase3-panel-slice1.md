# Фаза 3, срез 1: панель вставляет первый пакет по клику — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CEP-расширение `ru.cloud.brandkit` открывается в AE 26.5 и Premiere 26.5.2. Оно показывает три шаблона первого пакета из `library.json`, сохраняет поля формы и вставляет выбранный шаблон на плейхед: в Premiere — MOGRT, в AE — композицию варианта. Поля пишутся и читаются назад. Всё проверено живыми прогонами в тестовых проектах.

**Architecture** (spec §6–§8):
- **Интерфейс** — Preact 10 + TypeScript, Vite 8 под Chromium 99. Он знает только API ядра.
- **Ядро** — чистый TypeScript без DOM, Node и CEP; сервисы внедряются.
- **Мост** `host.call()`: ASCII-JSON, последовательная очередь, таймауты, повтор только для чтения.
- **Адаптеры** — ES3 в пространстве имён `CRBK`. Панель отправляет их исходник через `evalScript` при старте; к исходнику приложена метка сборки.
- **Библиотека** — `library.json` и файлы `items/<id>/`. Собирает её Node-инструмент из `library/library.src.json` и выходов конвейера мастеров.

**Tech Stack:** TypeScript 7.0.2 (только проверка типов), Vite 8.3.2 (rolldown + Oxc), Preact 10.29.8, vitest 5, ajv 8 (standalone-валидатор генерируется при сборке), ExtendScript ES3, ZXPSignCmd 4.1.3.

**Основа:**
- разведка 2026-10-05: `C:/dev/temp/claude/.../scratchpad/panel/map-{library,premiere,aftereffects,cep}.md` (выжимка — в «Фактах» ниже);
- решения фазы 0: A3 (схема библиотеки), A5 (свой Vite), C27 (длина в AE через time remap), C36 и C44 (размер и скорость).

**Порядок:** задача 1 — основа, её делает исполнитель сам. Волна A (задачи 2–5, 8) и волна B (6, 7, 9) идут параллельно, на непересекающихся файлах. Задача 10 — живые прогоны, задача 11 — ревью. Коммит — после каждой задачи (разрешение пользователя 2026-10-02). В GitHub — только с отдельного разрешения: репозиторий публичный.

---

## Решения среза (по умолчанию, в духе спецификации)

| # | Решение | Почему |
|---|---|---|
| P1 | Вариант выбирается автоматически только при точном совпадении w×h кадра. Иначе — отказ «нет варианта под формат» с предложением ближайшего варианта той же пропорции; вставить его можно ручным выбором в чипе формата | §4.3 и §8.2: MOGRT из AE не подстраивается под секвенцию. Молча вставить FHD в QHD — неверный размер графики |
| P2 | fps шаблона ≠ fps цели — предупреждение, не отказ | §6.1 шаг 2 требует только проверки; RDT играет и на другом fps |
| P3 | Длина вставки: по умолчанию D = intro + hold + outro. В форме есть поле «Длительность, с» для T1 `rdt`; минимум — intro + outro, потому что защищённые области C44 рассчитаны на 0,75×. Premiere обрезает клип (`trimClip`), AE подгоняет time remap по C27 | Требование пользователя 2026-10-05 «менять длительность»; без минимума ключи C27 не монотонны |
| P4 | Адаптеры грузятся исходником через `evalScript` при старте панели; к исходнику приложена метка сборки `CRBK.build`. Без `ScriptPath` и `$.evalFile` | Путь расширения кириллический (`C:\Users\Глеб\...`), а `$.fileName` в ScriptPath ненадёжен. Инлайн 30–60 КБ проверен в обоих хостах. После перезагрузки панели код хоста обновляется |
| P5 | Порты отладки панели — 8101 (AEFT) и 8102 (PPRO), только в dev-сборке (`.debug`). 8094/8096 остаются за невидимым dev-расширением: оно служит наблюдателем E2E | В §8.3 E2E названы 8094/8096, но эти порты заняты; §8.3 правится |
| P6 | Корень библиотеки: `settings.json` в `%LOCALAPPDATA%\CloudRuBrandKit\` (`libraryRoot`), иначе `C:\ProgramData\CloudRuBrandKit\library` (Mac `/Users/Shared/CloudRuBrandKit/library`). Dev-скрипт ссылки пишет `libraryRoot = C:/CRBK/work/library` | §8.1 задаёт путь установщика; переопределение через настройки не трогает подписанную папку расширения |
| P7 | Превью делается из `thumb.mp4` внутри MOGRT 16:9: `preview.mp4` шириной 480 px и `poster.jpg` из середины удержания. AE не нужен | В каждом MOGRT пакета 1 есть полный `thumb.mp4` 640×360; §7 просит 480 px MP4 |
| P8 | Схема проверяется одним кодом в конвейере и в панели. Cross-правила выносятся из `validate.mjs` в чистый `tools/library/rules.mjs`, схема компилируется ajv standalone в модуль при сборке панели | Иначе панель и конвейер разойдутся (риск из разведки) |
| P9 | Одна вставка — один вызов хоста: вставка, длина, поля с чтением назад и выделение. При таймауте изменяющего вызова — опрос состояния, повтора нет | §6: один шаг отмены на клик; S5 показал один шаг для вставки и трёх записей |
| P10 | Дорожка в Premiere — первая свободная и незаблокированная видеодорожка выше самой верхней занятой на интервале [плейхед, плейхед + max(L, D)). Если таких нет — `qe…addTracks` с проверкой; не вышло — отказ `NO_FREE_TRACK` | §6.1 шаг 3; `importMGT` только перезаписывает (S5) |

Вне среза: компаньоны и звуки (в пакете 1 их нет), футаж шаблонов (в пакете 1 нет, S3 доказал механизм), `.ffx`, «Цвета», «Экспорт», установщик и рабочий сертификат (срез 2), Mac.

## Факты, на которые опирается план (из разведки)

- **Premiere 26.5.2:**
  - `seq.importMGT(fsName, ticksString, vIdx, aIdx)`: индексы с 0, вставка только перезаписью.
  - Клип ищется по стартовому кадру на дорожке, `inPoint` не 0.
  - Длина: сначала `outPoint`, потом `end`, целыми `Time` (`trimClip`).
  - Текст пишется JSON-ом `textEditValue` + `fontTextRunLength`. Списки — с 0, флажок пишется 1/0, а читается как boolean.
  - `getParamForDisplayName` с запасным перебором.
  - Undo-групп нет, но один вызов «вставка + 3 записи» отменяется одним шагом.
  - Первая вставка нового MOGRT в проект занимает до 18 с.
  - `TICKS_PER_SECOND = 254016000000`.
- **AE 26.5:**
  - Импорт `.aep` как проекта (`ImportAsType.PROJECT`) даёт `FolderItem`. Папку кладут в бин `Cloud.ru BrandKit`, в комментарий пишут `<id>@<version>`.
  - Слой добавляется через `layers.add(comp)` и явный `startTime`.
  - Essential Properties: `layer.essentialProperty`, поиск по имени EGP; списки с 1.
  - Длина по C27: включить `timeRemapEnabled`, затем `outPoint`, затем ключи, затем удалить чужие ключи, затем `LINEAR`.
  - Шрифты: `app.fonts.getFontsByPostScriptName`, `.version`.
  - Модальные окна блокируют мост. `beginSuppressDialogs` закрывает не все.
- **Мост:**
  - `evalScript` на Windows портит кириллицу — всё ≥ U+0080 уходит как `\uXXXX`.
  - Ответы `''`, `'undefined'`, `'EvalScript error.'` означают холодный старт или ошибку.
  - Глобалы ExtendScript общие для всех расширений.
- **Сборка:**
  - Vite 8 собирает IIFE и подключает его как `<script defer>` (модули с `file://` требуют CORS).
  - Vite добавляет `crossorigin` в `<link rel=stylesheet>` — его нужно снять.
  - Vite копирует dot-файлы из `public/`, поэтому `.debug` туда класть нельзя.
  - `emptyOutDir` чистит `dist`, но сама папка остаётся — джанкшн на неё живёт.
  - JSX компилирует Oxc: `oxc.jsx`, а не `esbuild`.
- **Машина:**
  - Папка расширений лежит в `C:\Users\Глеб\AppData\Roaming\Adobe\CEP\extensions` (там джанкшены).
  - PlayerDebugMode = 1 для CSXS.11 и .12.
  - Новое расширение видно только после перезапуска хоста.
  - TEMP = `C:\dev\temp`, там же логи CEP и `cep_cache`.
  - Premiere запускает безголовый AE (Dynamic Link). Он тоже стартует StartOn-расширения, поэтому реальная панель — без StartOn.
- **Пакет 1 в библиотеке:**
  - 3 элемента T1 `rdt`, поля только text, dropdown и checkbox.
  - Варианты 16x9, 16x9_4K, 9x16 и у TTL ещё 1x1, все 25p.
  - Файлы: `C:/CRBK/work/build/<id>/<id>_v1.aep` и `mogrt/<id>_<key>_v1.mogrt`. Файлы `*.prev.*` и `*_work.aep` не брать, байты брать с диска, а не из `package-report.json`.

## Карта файлов

```
panel/                      расширение (dist/ — корень расширения, в git не идёт)
  index.html, vite.config.mjs, tsconfig.json
  public/CSXS/manifest.xml  ru.cloud.brandkit / ru.cloud.brandkit.panel, AEFT+PPRO [26.0,99.9], CSXS 11.0
  src/main.tsx              сборка сервисов → ядро → UI; тест-хук window.__crbkTest только в dev
  src/core/                 ЧИСТОЕ ядро (задача 3); types.ts (задача 1)
  src/bridge/               host.call, ASCII, очередь, загрузка адаптеров (задача 4)
  src/services/             CEP: evalScript/env, файлы (Node), лог JSONL, шрифты, настройки (задача 8)
  src/ui/                   Preact-компоненты и tokens.css (задача 9)
  src/generated/            catalog-validate.mjs (ajv standalone, генерируется; в git — да, с проверкой свежести)
  host/common.jsx           CRBK: _wrap, call, build (задача 5)
  host/ae.jsx, host/pr.jsx  адаптеры (задачи 7, 6)
tools/library/rules.mjs     cross-правила каталога (вынос из validate.mjs, задача 2)
tools/library/build-catalog.mjs, gen-standalone.mjs (задача 2)
tools/panel/build.mjs       адаптеры (prelude+common+host, линт, ASCII, метка) → vite build → dist/host/*.jsx; --dev пишет .debug
tools/panel/e2e.mjs         живые прогоны через CDP (задача 10)
tools/dev/link-panel.ps1    джанкшн в папку расширений + settings.json (задача 1)
tests/panel/**.test.ts      юнит-тесты панели; tests/library/*, tests/panel-host/* (vm-моки ES3)
```

## Интерфейсы (общие для всех задач; `panel/src/core/types.ts` пишет задача 1)

```ts
export type HostKey = 'ae' | 'pr';
export interface Stored { file: string; sha256: string; bytes: number }
export interface FieldOption { index: number; label_ru: string }
export interface Field {
  key: string; label_ru: string; type: 'text' | 'dropdown' | 'checkbox' | 'slider' | 'media';
  egpName?: string; egpIndex?: number; default?: string | number | boolean; maxLen?: number;
  options?: FieldOption[]; min?: number; max?: number; drivesDuration?: boolean; unitSec?: number;
  enabledBy?: string; service?: boolean; editable?: boolean; hosts?: HostKey[];
}
export interface Variant {
  key: string; aspect?: string; w?: number; h?: number; fps?: number;
  minHostVersion: Partial<Record<HostKey, string>>; options?: Record<string, number | boolean>;
  file?: string; sha256?: string; bytes?: number; aeComp?: string;
}
export interface Item {
  id: string; title_ru: string; category: string; tier: 'T1' | 'T2' | 'T3'; hosts: HostKey[]; version: number;
  fit?: 'rdt' | 'trim'; duration?: { introSec: number; holdSec: number; outroSec: number };
  fields?: Field[]; requiredFonts?: { postScriptName: string; build: string }[];
  variants: Variant[]; aep?: Stored; preview?: Stored; poster?: Stored;
}
export interface Library { schemaVersion: 1; libraryVersion: string; minPluginVersion: string; generatedAt?: string; items: Item[] }

export interface HostContext {
  host: HostKey; hostVersion: string;                       // '26.5x89' | '26.5.2'
  project: { path: string | null; saved: boolean };
  target: null | { kind: 'comp' | 'sequence'; id: string; name: string; w: number; h: number; fps: number;
                   timeSec: number; ticks?: string };        // ticks — только Premiere (плейхед)
  colour?: { workingSpace: string; linearize: boolean; bpc: number };   // AE
  expressionEngine?: string;                                // AE
}
export type FieldValue = string | number | boolean;
export interface FieldWrite { egpName: string; type: Field['type']; value: FieldValue }   // уже в базе хоста
export interface PrInsertArgs { seqId: string; mogrtPath: string; startTicks: string; lenFrames: number;
  defaultLenFrames: number; expectName: string; fields: FieldWrite[]; label: string }
export interface AeInsertArgs { compId: string; aepPath: string; itemKey: string; aeComp: string; timeSec: number;
  lenSec: number; durSec: number; inSec: number; outSec: number; fields: FieldWrite[]; label: string }
export interface FieldResult { egpName: string; written: FieldValue; back: FieldValue | null; ok: boolean }
export interface InsertResult {
  placed: { kind: 'clip' | 'layer'; id: string; name: string; track?: number; startSec: number; endSec: number };
  fields: FieldResult[]; tracksAdded?: number; remapKeys?: [number, number][]; warnings: string[];
}
export interface FontStatus { postScriptName: string; found: boolean; build: string | null; substitute: boolean }
export type HostReply<T> = { ok: true; data: T } | { ok: false; error: { code: string; message?: string; line?: number } };
export interface HostApi {
  getContext(): Promise<HostReply<HostContext>>;
  insertItem(args: PrInsertArgs | AeInsertArgs): Promise<HostReply<InsertResult>>;   // изменяющий
  findPlaced(probe: { kind: 'clip' | 'layer'; targetId: string; startSec: number; name: string }): Promise<HostReply<InsertResult['placed'] | null>>;
  checkFonts(psNames: string[]): Promise<HostReply<FontStatus[]>>;                    // AE; в Premiere — Node-сервис
  diag(): Promise<HostReply<Record<string, unknown>>>;
}
export interface Issue { code: string; level: 'error' | 'warning'; params?: Record<string, string | number> }
export interface InsertPlan { item: Item; variant: Variant; lenSec: number; lenFrames: number; fieldWrites: FieldWrite[]; issues: Issue[] }
```

**Адаптер (ES3), протокол:** `CRBK.call("<fn>", "<json>")`. Второй аргумент — JSON аргументов, где всё ≥ U+0080 записано как `\uXXXX`; в литерал JS он упакован через `JSON.stringify`. Ответ — строка JSON `HostReply`. Функции: `ping` → `{build}`, `getContext`, `insertItem`, `findPlaced`, `checkFonts` (только AE), `diag`. Исключение внутри даёт `{ok:false,error:{code:'HOST_EXCEPTION',message,line}}`. Свои ошибки — `{code}` из каталога; русских строк в JSX нет.

**Коды ошибок** (`panel/src/core/errors.ts`, русский текст — там же):
- до вставки: `NO_TARGET`, `PROJECT_NOT_SAVED`, `FONT_MISSING`, `FONT_BUILD` (предупреждение), `HOST_TOO_OLD`, `PLUGIN_TOO_OLD`, `NO_VARIANT`, `FPS_MISMATCH` (предупреждение), `PATH_TOO_LONG`, `LENGTH_TOO_SHORT`;
- при вставке: `NO_FREE_TRACK`, `TARGET_CHANGED`, `TEMPLATE_NOT_FOUND`, `TEMPLATE_DUPLICATE`, `INSERT_FAILED`, `READBACK_MISMATCH`;
- мост и библиотека: `TIMEOUT`, `ADAPTER_LOAD`, `HOST_EXCEPTION`, `LIBRARY_MISSING`, `LIBRARY_INVALID`, `FILE_MISSING`.

---

### Задача 1: инструменты, каркас и первое открытие панели в обоих хостах

**Файлы:** `package.json`, `vitest.config.mjs`, `panel/*` (каркас), `panel/src/core/types.ts`, `tools/panel/build.mjs` (каркас), `tools/dev/link-panel.ps1`, `.gitignore` (`*.p12`, `*password*`, `panel/dist/`).

- [x] `npm install --save-exact preact@10.29.8` и `npm install --save-dev --save-exact typescript@7.0.2 vite@8.3.2`. Проверить: `npx tsc -v`, vite не задвоился.
- [x] Каркас `panel/`:
  - `vite.config.mjs` с `root: panel`, `base: './'`, target `chrome99`, IIFE, `modulePreload: false`, `oxc.jsx { runtime:'automatic', importSource:'preact' }`;
  - плагин снимает `type="module" crossorigin` у скрипта и `crossorigin` у CSS;
  - `tsconfig.json`: strict, `jsxImportSource: preact`, `moduleResolution: bundler`, `noEmit`, lib ES2021 и DOM;
  - `main.tsx` показывает хост, версию и Chrome.
- [x] Манифест: id `ru.cloud.brandkit`, расширение `ru.cloud.brandkit.panel`, меню «Cloud.ru BrandKit», размер 420×720, минимум 320×400. Флаги CEF: `--enable-nodejs --mixed-context --allow-file-access-from-files --allow-file-access --disable-application-cache`. StartOn не нужен.
- [x] `tools/panel/build.mjs`: склейка адаптеров (пока заглушка `CRBK.ping`), линт в lib-режиме, проверка ASCII, метка сборки → `vite build` с `define __CRBK_BUILD__` → `dist/host/{ae,pr}.jsx`. С `--dev` ещё `dist/.debug` (8101/8102). Команды: `npm run panel:build`, `npm run panel:dev`, `npm run panel:typecheck`.
- [x] `vitest.config.mjs` берёт ещё `tests/**/*.test.ts` и `tests/**/*.test.tsx`.
- [x] `tools/dev/link-panel.ps1`: джанкшн `%APPDATA%\Adobe\CEP\extensions\ru.cloud.brandkit` → `panel\dist`. Старую ссылку снимает `cmd /c rmdir` (не-джанкшн не трогает). Пишет `%LOCALAPPDATA%\CloudRuBrandKit\settings.json` с `libraryRoot`.
- [x] Живая проверка:
  1. Перезапустить AE и Premiere: новое расширение видно только после старта. Перед этим проверить, что открыты только наши проекты и AE пуст; иначе спросить пользователя.
  2. Открыть панель через `CSInterface.requestOpenExtension('ru.cloud.brandkit.panel','')` со страницы dev-расширения (CDP 8094/8096).
  3. Через CDP 8101/8102 прочитать DOM: видны хост и `Chrome/99`. Это N3 и N4 в `panel-framework.md`.
- [x] `npm test`, `npm run panel:typecheck` — зелёные. Коммит.

### Задача 2 (волна A): библиотека — сборщик каталога и превью

**Файлы:** `tools/library/rules.mjs` (новый, вынос из `validate.mjs`), `tools/library/validate.mjs` (импортирует rules), `tools/library/build-catalog.mjs`, `tools/library/gen-standalone.mjs`, `panel/src/generated/catalog-validate.mjs`, тесты `tests/library/*.test.mjs`.

- [x] Вынести `checkItem`/`crossCheck` в `rules.mjs` без `fs`. `validate.mjs` и его 26 тестов не меняют поведения. Дописать правила, которых нет:
  - `egpIndex` 0..n−1 без дыр и повторов у T1;
  - у вариантов нет повторов w×h;
  - fps одинаковый у всех вариантов, если у элемента нет `loop`.
- [x] `gen-standalone.mjs`: ajv standalone (ESM) из обеих схем → `panel/src/generated/catalog-validate.mjs`. Тест сверяет, что сгенерированный файл совпадает с тем, что даёт генератор (свежесть).
- [x] `build-catalog.mjs --root <dir> [--date YYYY.MM.DD]`:
  - каждый элемент источника копируется как есть;
  - `requiredFonts[].build` берётся из `brand/tokens.json`;
  - `aeComp += '_v'+version`;
  - файлы `<work>/build/<id>/<id>_v<N>.aep` и `mogrt/<id>_<key>_v<N>.mogrt` копируются в `<root>/items/<id>/`, sha256 и bytes считаются с диска; `*.prev.*` и `*_work.aep` отвергаются;
  - превью по P7 (ffmpeg из `C:/ffmpeg/bin`);
  - `libraryVersion` — calver с `.N` для второй сборки за день, `minPluginVersion` — из `panel/package` (0.1.0), `generatedAt`;
  - проверка `validateLibrary(…, 'catalog')`, затем запись `library.json`.
- [x] Сверка каталога с MOGRT: `checkMogrt` (метки по egpIndex, пункты списков), `usedFontsLocalized` = `requiredFonts`, `usedFileTypes` = []. Расхождение — отказ.
- [x] Тесты: временный корень, фикстуры MOGRT собираются adm-zip (без настоящих сборок). Отдельный тест, пропускаемый без `C:/CRBK/work/build`, собирает настоящий каталог и проверяет его.
- [x] Прогон: `node tools/library/build-catalog.mjs --root C:/CRBK/work/library` → `OK library.json: 3 items` и 10 MOGRT, 3 AEP, 3 превью, 3 постера на диске.

### Задача 3 (волна A): ядро

**Файлы:** `panel/src/core/{library,variant,fields,duration,versions,checks,errors,insert,log}.ts`, тесты `tests/panel/core/*.test.ts`. Фикстура — `library.json`, собранный из `library/library.src.json` (без файлов на диске).

- [x] `library.ts`: `parseLibrary(text)` → `{ok, library | issues}`. Проверка — сгенерированный валидатор и `rules.mjs`. Если `minPluginVersion` выше версии панели — `PLUGIN_TOO_OLD`.
- [x] `variant.ts`: `chooseVariant(item, target, manualKey?)` → `{variant, match:'exact'|'manual'|'none', nearest?}` по P1. Ближайший — та же пропорция с точностью 1 % и минимальная разница площадей.
- [x] `fields.ts`:
  - `defaults(item)`, `merge(remembered, item)`, `validate(values)` (maxLen, пункт списка в 1..n);
  - `toWrites(item, values, host)`: Premiere — список −1, флажок 1/0; AE — как есть; текст как есть;
  - `sameValue(host, type, written, back)` нормализует чтение назад (boolean ↔ 0/1, число ↔ строка).
- [x] `duration.ts`:
  - `defaultLen(item)`, `minLen(item)` = intro + outro;
  - `toFrames(sec, fps)` с округлением к сетке (2,2·25 = 55,000…01);
  - `c27Keys(D, inSec, outSec, L)` = [[0,0],[in,in],[L−(D−out),out],[L,D]] (порт `spikes/s3-instance/analyze.mjs` с его тестами);
  - Premiere: `startTicks`, `lenFrames`.
- [x] `versions.ts`: разбор `'26.5x89'`, `'26.5.2'`, `'26.0'`, сравнение semver/calver.
- [x] `checks.ts`: `preflight(ctx, item, values, lenSec, fonts, pluginVersion)` → `Issue[]` по всем отказам и предупреждениям §8.2. Путь длиннее 260 символов (Premiere: путь проекта + `Motion Graphics Template Media` + имя) — `PATH_TOO_LONG`.
- [x] `insert.ts`: `planInsert(...)` → `InsertPlan`. `runInsert(host, plan, ctx, deps)`:
  1. preflight;
  2. `insertItem`;
  3. при `TIMEOUT` — `findPlaced`, без повтора;
  4. при `READBACK_MISMATCH` — результат со списком несовпавших полей, без отката.
- [x] `errors.ts`: код → русский текст с параметрами; у каждого кода из списка выше есть текст (тест).
- [x] `log.ts`: структура записи `{ts, level, code, msg, data}`; запись делает внедрённый приёмник.
- [x] Покрытие: все функции, крайние случаи P1–P3, обе базы индексов, кириллица и `×`.

### Задача 4 (волна A): мост

**Файлы:** `panel/src/bridge/{ascii,reply,host}.ts`, `tests/panel/bridge/*.test.ts`.

- [x] `ascii.ts`: `asciiJson(value)` экранирует ≥ U+007F как `\uXXXX`; `jsxCall(fn, args)` собирает строку `CRBK.call("fn", "<ascii json>")`. Проверка: строка чистый ASCII, и обратный разбор даёт исходный объект с кириллицей и `×`.
- [x] `reply.ts`: разбор ответа:
  - `''`, `'undefined'`, `'null'` → `HOST_EMPTY`;
  - `EvalScript error` → `HOST_EVAL_ERROR`;
  - не JSON → `HOST_BAD_REPLY`;
  - JSON без `ok` → `HOST_BAD_REPLY`.
- [x] `host.ts`: `createBridge({ evalScript, readAdapterSource, build, clock })` → `HostApi`:
  - очередь: следующий вызов только после ответа предыдущего;
  - таймауты: 30 с чтение, 120 с вставка (S8: первая вставка до 18 с);
  - при старте и при `HOST_EMPTY`/`HOST_EVAL_ERROR` — `ping`; если нет `CRBK` или метка не та, адаптер загружается заново исходником;
  - повтор: только для читающих вызовов, на 0/300/900 мс;
  - изменяющий вызов не повторяется никогда; по таймауту — `{ok:false, error:{code:'TIMEOUT'}}`;
  - поздний ответ после таймаута пишется в лог.
- [x] Тесты с поддельным `evalScript` (таймеры vitest): порядок очереди, холодный старт, загрузка адаптера, отсутствие повтора у изменяющего вызова, поздний ответ.

### Задача 5 (волна A): общий код хоста и сборка адаптеров

**Файлы:** `panel/host/common.jsx`, `tools/panel/build-host.mjs` (используется из `build.mjs`), `tests/panel-host/common.test.mjs`.

- [x] `common.jsx`:
  - `$.global.CRBK` с охраной: если `CRBK` уже есть с той же меткой, файл ничего не меняет;
  - `CRBK.build = '__CRBK_BUILD__'`;
  - `CRBK.call(fn, json)` разбирает JSON и вызывает `CRBK.fns[fn]` внутри `_wrap`;
  - `_wrap` превращает исключение в `{ok:false,error:{code:'HOST_EXCEPTION',message,line}}`;
  - `CRBK.ok(data)`, `CRBK.fail(code, message)`;
  - `CRBK.fns.ping`;
  - только ASCII, без глобалов кроме `CRBK`.
- [x] `build-host.mjs`:
  - склейка `tools/jsx/prelude-json.jsx` + `common.jsx` + `<host>.jsx`;
  - подстановка метки (sha256 склейки, 12 знаков);
  - `lint(src, {lib:true})` — ошибка при любой ошибке линта и при не-ASCII;
  - отдаёт `{ae, pr, build}`.
- [x] Тесты в `node:vm`: вызов `ping`, неизвестная функция → `UNKNOWN_FN`, исключение → `HOST_EXCEPTION` с номером строки, повторная загрузка не ломает состояние, JSON-аргумент с `\u0410` даёт «А».

### Задача 6 (волна B): адаптер Premiere

**Файлы:** `panel/host/pr.jsx`, `tests/panel-host/pr.test.mjs` (vm-мок на основе `tests/spikes/pr-helpers.test.mjs`).

- [ ] Перенести под `CRBK.pr` проверенные помощники из `spikes/lib/pr-helpers.jsx`: время и тики, дорожки, `trackFreeAt`, `clipStartingAt`, `trimClip`, `importMogrt` (с ожиданием), `mgtParam`, `setMgtText`/`readMgtText`, `ensureQE`. Без project/sequence-scaffolding и без `PARAMS`/`check`.
- [ ] `getContext`:
  - `app.version`;
  - путь проекта (`app.project.path`);
  - активная секвенция: id, имя, размер, fps = 254016000000 / timebase, плейхед (тики и секунды);
  - `target:null`, если секвенции нет.
- [ ] `insertItem(PrInsertArgs)`:
  1. проверить, что активна та же секвенция (иначе `TARGET_CHANGED`);
  2. дорожка по P10 (QE `addTracks` с проверкой числа дорожек);
  3. `importMGT` и ожидание клипа; если клипа нет — одна повторная вставка, иначе `INSERT_FAILED`;
  4. проверить имя клипа (`expectName`);
  5. `trimClip`, если `lenFrames ≠ defaultLenFrames`;
  6. поля с чтением назад через свежий поиск клипа;
  7. `setSelected`;
  8. `InsertResult`.

  Всё в одном вызове (P9).
- [ ] `findPlaced` — клип по секвенции, стартовому кадру и имени на любой видеодорожке.
- [ ] `diag` — версия, наличие QE, число дорожек, JSON родной или полифил, имена параметров последнего клипа.
- [ ] Юнит-тесты: выбор дорожки (заблокированная, занятая, края), повтор вставки, база списков, флажок boolean, пустой текст, `TARGET_CHANGED`.

### Задача 7 (волна B): адаптер AE

**Файлы:** `panel/host/ae.jsx`, `tests/panel-host/ae.test.mjs` (vm-мок на основе `tests/dump/fake-ae-host.js` и `tests/spikes/ae-project.test.mjs`).

- [ ] Перенести под `CRBK.ae` помощники:
  - `bkQuiet`;
  - поиск ровно одного элемента;
  - импорт S3 (`s3ImportTemplate`), `s3EpGroup`/`s3FindEp`;
  - запись с чтением назад (`s3WriteText`/`s3WriteNumber` без `check`);
  - remap из `probe-6-remap.jsx`;
  - шрифты из `build-spec.jsx` и `relink.jsx`.
- [ ] `getContext`:
  - `app.version`;
  - `app.project.file` (путь или `null`);
  - активная композиция с охраной `instanceof CompItem`: id, имя, w, h, fps, время;
  - цвет: `workingSpace`, `linearizeWorkingSpace`, `bitsPerChannel`;
  - `expressionEngine`.
- [ ] `insertItem(AeInsertArgs)`:
  1. проверить, что активна та же композиция (иначе `TARGET_CHANGED`);
  2. бин `Cloud.ru BrandKit` и папка с комментарием `itemKey`: найти, иначе импортировать `.aep`; две папки — `TEMPLATE_DUPLICATE`;
  3. ровно одна композиция `aeComp` в папке, иначе `TEMPLATE_NOT_FOUND` или `TEMPLATE_DUPLICATE`;
  4. отказ, если активная композиция лежит в бине BrandKit (вложение в себя);
  5. в одной undo-группе `label`:
     - `layers.add`, `startTime`;
     - поля EP с чтением назад;
     - если `lenSec ≠ durSec` — remap C27 (ключи от ядра);
     - выделить только новый слой.
- [ ] `findPlaced` — слой по композиции, имени и `startTime`.
- [ ] `checkFonts(psNames)` — по каждому: найден, сборка, подмена (`isSubstitute` или чужой `location`).
- [ ] `diag` — версия, язык, проект, цвет, движок выражений, состав бина BrandKit.
- [ ] Юнит-тесты: импорт один раз (второй вызов не импортирует), дубликаты, ключи remap, база списков с 1, отказ при вложении в себя, `TARGET_CHANGED`.

### Задача 8 (волна A): сервисы CEP

**Файлы:** `panel/src/services/{cep,files,logsink,fonts,settings}.ts`, `panel/src/types/cep.d.ts`, `tests/panel/services/*.test.ts`.

- [x] `cep.ts`:
  - `evalScript` через `window.__adobe_cep__.evalScript`;
  - `hostEnv()` (appName `AEFT`/`PPRO`, appVersion);
  - путь расширения;
  - `nodeRequire()` — `window.cep_node?.require ?? window.require`.
- [x] `files.ts` (Node fs через `nodeRequire`): `readText`, `exists`, `stat`, `readDir`, `sha256(file)` (поток), `mkdirp`, `append`. Пути внутри — POSIX, наружу — родные.
- [x] `logsink.ts`: JSONL по дням в `%LOCALAPPDATA%\CloudRuBrandKit\logs` (Mac `~/Library/Logs/CloudRuBrandKit`). Ротация: старше 7 дней или больше 5 МБ.
- [x] `fonts.ts`: порт `tools/fonts/opentype-name.mjs` и `scan-fonts.mjs`. Папки Windows: `C:\Windows\Fonts`, `%LOCALAPPDATA%\Microsoft\Windows\Fonts`; Mac — три стандартные. Результат — `FontStatus[]` для Premiere.
- [x] `settings.ts`:
  - корень библиотеки по P6;
  - запомненные значения полей по `itemId@version` (`localStorage`, с try/catch);
  - ручной вариант по элементу.
- [x] Тесты: временные папки, шрифт-фикстура (если в репо есть мини-OTF, иначе синтетический name-table), ротация лога.

### Задача 9 (волна B): интерфейс

**Файлы:** `panel/src/ui/*.tsx`, `panel/src/ui/tokens.css` (генерирует `tools/panel/tokens-css.mjs` из `brand/tokens.json`), `panel/src/main.tsx`.

- [ ] Шапка: «Cloud.ru BrandKit» и чип формата «Авто 16:9 · 25p». По клику — ручной выбор варианта; без варианта — «Нет варианта: 2560×1440» и ближайший.
- [ ] Поиск по `title_ru`, чипы категорий — только непустые («Логотипы», «Титры»). Сетка карточек: постер, превью играет только под курсором.
- [ ] Форма элемента:
  - крупное превью;
  - поля по типам: текст с `maxLen`, сегменты или список, флажок;
  - «Длительность, с» с минимумом по P3;
  - значения запоминаются;
  - кнопка «Вставить на плейхед».
- [ ] Состояния вставки: проверка → вставка → готово. Отказ показывается русским текстом и кодом. «Значение не прочиталось назад» — со списком полей.
- [ ] Строка состояния: хост и версия, версии панели и библиотеки, шрифты, «Скопировать диагностику» (JSON `diag` + контекст + версии в буфер).
- [ ] Тест-хук (только dev): `window.__crbkTest = { ready(), library(), context(), insert(itemId, values, opts) }`.
- [ ] Тёмная тема CEP (фон #232323 — как у хостов), шрифт интерфейса — системный. SB Sans в панель не встраиваем: шрифты не поставляются (§8.1).

### Задача 10: живые прогоны и документы

**Файлы:** `tools/panel/e2e.mjs`, `docs/superpowers/specs/...` (§8.3 порты), `panel/README.md`, `docs/decisions/panel-framework.md` (N3, N4).

- [ ] Тестовые проекты (создаёт `e2e.mjs`, если их нет):
  - AE — `C:/CRBK/work/panel/CRT_panel_ae.aep` с композициями 1920×1080, 3840×2160, 1080×1920, 1080×1080 и 2560×1440 (25p);
  - Premiere — `C:/CRBK/work/pr/CRT_panel_pr.prproj` с теми же форматами секвенций (1080p25 + `setSettings`).

  Перед прогоном проверить, что в хостах только наши проекты.
- [ ] `e2e.mjs --host ae|pr [--item id] [--variant key]`:
  1. жёсткая перезагрузка панели (CDP: `Network.clearBrowserCache` + `Page.reload ignoreCache`);
  2. `__crbkTest.ready()`;
  3. активировать тестовую цель через dev-расширение (8094/8096);
  4. `insert(...)` из панели;
  5. проверить хостом через dev-расширение: клип или слой на месте, длина, значения полей;
  6. отчёт в `C:/CRBK/work/panel/e2e-<host>.json`.
- [ ] Матрица: 3 элемента × все форматы × 2 хоста. Плюс:
  - длина 8 с (Premiere — `trimClip`, AE — C27);
  - кириллица и «Ё» в TTL;
  - отказ на 2560×1440 (`NO_VARIANT` + ближайший);
  - отказ без активной цели;
  - повторная вставка того же элемента в AE (без второго импорта).
- [ ] Отмена: одна вставка — одно Ctrl+Z (Premiere — `qe.project.undo()`, AE — `app.executeCommand(16)`). Результат записать.
- [ ] §8.3 спецификации: порты E2E по P5. `panel-framework.md`: N3 и N4 — по живому открытию.
- [ ] `panel/README.md`: сборка, ссылка, отладка, E2E, известные ограничения.

### Задача 11: ревью и правки

- [ ] Ревью всего диффа среза по направлениям:
  - корректность ядра и моста;
  - ES3-адаптеры и квирки хостов;
  - безопасность проекта пользователя (ничего не сохраняет, не открывает, не действует на «первую попавшуюся»);
  - соответствие спецификации §6–§8.

  Каждая находка проверяется отдельно.
- [ ] Исправить подтверждённое, прогнать тесты и E2E, коммит. Отчёт пользователю: что работает, что вне среза, решения P1–P10.

---

## Ход работ

**Контрольная точка 2026-10-05: задачи 1–5 и 8 сделаны** (ветка `panel-v1`).
- Каждую задачу волны A проверил независимый рецензент, подтверждённые находки исправлены.
- Тесты: все зелёные. Проверка типов чистая, dev-сборка собирается.

Решения и находки по ходу (дополняют P1–P10):
- **Открытие панели скриптом.** `requestOpenExtension` работает только из видимой панели; из невидимого расширения CEP 12 пишет «Unknown Exception». Меню Premiere из скрипта не открыть. Поэтому:
  - `tools/dev/open-panel.mjs` открывает панель через видимую панель BrandKit Dev, а в AE — командой меню;
  - в Premiere пользователь открывает её один раз, хост запоминает её в рабочем пространстве.
- **Операторы в AE.** У объектов AE 26.5 есть унаследованные члены `*`, `+`, `-` и `/`. Из-за этого старый полифил JSON ломался на путях и именах через дефис. Исправлено в `tools/jsx/prelude-json.jsx` (`35b9993`). Поиск по произвольным ключам в адаптерах — только через `hasOwnProperty`.
- **Окна ошибок в AE.** Неперехваченная ошибка dev-скрипта оставляет в AE модальное окно. Закрывать его — `tools/dev/close-host-dialog.ps1` (`WM_CLOSE`, без фокуса). Ручные пробы — только через линтер.
- **Минимальная длина в AE (P3).** При длине, равной минимуму, ключи C27 совпадают по времени, и AE заменяет ключ. Поэтому в AE остаётся хотя бы один кадр удержания.
- **Помощник общего кода хоста.** `CRBK.isArray` → `CRBK.isList`: линтер ES3 принимает `.isArray(` за ES5-функцию. Общее состояние между вызовами хранится в `CRBK.state.<host>`.
- **Тестовые проекты E2E** (`tools/panel/fixtures.mjs`):
  - `C:/CRBK/work/panel/CRT_panel_ae.aep` — 6 композиций: форматы пакета 1, QHD без варианта и 1080p 30 fps;
  - `C:/CRBK/work/pr/CRT_panel_pr.prproj` — 5 секвенций.
