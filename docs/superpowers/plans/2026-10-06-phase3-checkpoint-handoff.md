# Задание: прогон контрольной точки фазы 3 (Windows, затем Mac)

**От кого:** облачная сессия, ветка `claude/determined-cannon-eum3ei`.

**Порядок.** Сначала закончите разведку пресетов AME (`2026-10-06-phase3-ame-presets-handoff.md`). Это задание — следующее.

**Контрольная точка** (spec §3, фаза 3):
1. Сквозные сценарии зелёные в обоих приложениях на Windows и Mac.
2. Чистая установка с нуля, на Mac — включая файл с карантином.
3. Проект со вставками из AE и Premiere открывается на другой ОС без пропавших файлов.

**Что появилось для этого:**
- **`npm run panel:checkpoint`** (`tools/panel/checkpoint.mjs`). Одной командой: `npm test` и в каждом хосте три живых набора — base, media, export (base — каждый элемент библиотеки в каждом формате). Итог — `docs/research/checkpoint/<win|mac>-<дата>.json` и `.md`. Набор без свежего отчёта считается проваленным. Установка и открытие на другой ОС проверяются вручную; сводка только называет их отчёты.
- **Перенос проекта в прогоне media**, сразу после вставок (`tests/live/transfer.mjs`):
  1. проект сохраняется и отпускается (AE открывает пустой проект, Premiere закрывает проект);
  2. проект и его папки (`Cloud.ru BrandKit`, в Premiere ещё `Motion Graphics Template Media`) копируются в `<work>/panel-live/<host>-moved`;
  3. оригиналы этих папок **и сама библиотека** временно переименовываются в `*.away`;
  4. копия открывается без диалогов: каждый файл должен найтись, и только внутри копии; потом всё переименовывается обратно.
- **`node tools/panel/live.mjs --host ae|pr --open <проект>`** открывает проект, сделанный в другом месте, и перечисляет пропавшие файлы. Отчёт — `docs/research/panel-live/<host>-open-<win|mac>-report.json`.

**Код панели не чинить — описывать.** Если стенд упал на своём шаге (переименование занятой папки, диалог при открытии), опишите шаг и текст ошибки. Правки стенда — отдельным коммитом с объяснением.

## A. Windows (ПК сборки)

1. Подготовка:
   ```bash
   git pull origin claude/determined-cannon-eum3ei
   npm ci
   npm run library:build
   node tools/panel/install-dev.mjs
   ```
   AE и Premiere открыты, BrandKit Dev работает, шаблоны «CR …» загружены в AE.
2. `npm run panel:checkpoint`. Идёт долго: шесть живых наборов.
   - Если упал перенос: что осталось с суффиксом `.away`? Верните вручную и опишите.
   - Важно: занятой ли оказалась папка при переименовании (EBUSY/EPERM) после того, как хост отпустил проект.
3. Сохраните копии для Mac: `C:\CRBK\work\panel-live\ae-moved` и `pr-moved` целиком, вместе с папками рядом с проектом. Положите архивом туда, откуда их заберёт Mac.
4. Закоммитьте:
   - `docs/research/checkpoint/win-*.json` и `.md`;
   - отчёты наборов из `docs/research/panel-live/`.

## B. Mac (когда будет машина с AE и Premiere 26.5)

1. **Установка с карантином.**
   - Скачайте релизный zip (`node tools/installer/build.mjs …` на Windows, подписанный) через браузер или мессенджер, чтобы у него был карантин.
   - Проверьте его: `xattr -l <zip>` — есть `com.apple.quarantine`.
   - Распакуйте, `bash install.command --with-ame`. Ждём код 0, панель в AE и Premiere, строку о шаблонах `.aom`.
   - Отдельно: что делает двойной щелчок по `install.command` (ожидаемо macOS не откроет; README это говорит).
2. **Стенд на Mac:**
   - репозиторий, Node 24, `npm ci`, `npm test`;
   - `node tools/panel/install-dev.mjs`, PlayerDebugMode для CSXS.11 и .12.
   - Пути `<work>` на Mac — как в `tools/lib/work.mjs`. Если для Mac нужен `BRANDKIT_WORK`, задайте его.
3. **Контрольная точка на Mac:**
   - пресеты: `node tools/library/export-pack.mjs` с копиями `.epr` и `.aom` из `C:\CRBK\work\export`;
   - `npm run library:build`, шаблоны «CR …» загружены в AE на Mac;
   - `npm run panel:checkpoint`.
4. **Открытие на другой ОС:**
   - копии с Windows (`ae-moved`, `pr-moved`) откройте так:
     ```bash
     node tools/panel/live.mjs --host ae --open <путь>/ae-moved/media_live.aep
     node tools/panel/live.mjs --host pr --open <путь>/pr-moved/media_live.prproj
     ```
   - обратно: `ae-moved` и `pr-moved` после прогона на Mac — на Windows тем же `--open`.
5. Закоммитьте:
   - `docs/research/checkpoint/mac-*.json` и `.md`;
   - `docs/research/panel-live/*-open-*-report.json`;
   - `docs/research/installer/mac-<версия>.json` (коды выхода, вывод установщика, карантин, что видно в хостах и AME).

## Вернуть

В ответе:
- итог контрольной точки на каждой ОС: таблица из `.md`;
- что упало и на каком шаге;
- открылись ли проекты на другой ОС без пропавших файлов;
- как прошла установка на Mac с карантином.
