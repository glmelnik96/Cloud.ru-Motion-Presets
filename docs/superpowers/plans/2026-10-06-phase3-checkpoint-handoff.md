# Задание: прогон контрольной точки фазы 3 (Windows, затем Mac)

**От кого:** облачная сессия, ветка `claude/determined-cannon-eum3ei`.

**Порядок.** Разведка пресетов AME закрыта (`4ccc4ac`). Это задание — следующее, на панели 0.1.18.

**Что изменилось после разведки:**
- Установщик с `-WithAme` / `--with-ame` откладывает `Presets\PresetTree.xml` каждой папки версии в `PresetTree.xml.brandkit-<время>.bak`. Файл не удаляется. При следующем запуске Media Encoder перестраивает список из папки, со всеми «CR …».
- При открытом Media Encoder установщик с этим ключом отказывает с кодом 2.
- В пакете есть `guide.md` — руководство монтажёра (`docs/guide/panel.md`).
- `ui-check` проверяет и вкладку «Экспорт» настоящей панели:
  - список под 1920×1080;
  - экспорт из интерфейса: AE — Render Queue с «CR FullHD», Premiere — «Сразу, без AME»;
  - файл в `Export`.
- Прогон контрольной точки запускает `ui-check` четвёртым набором.
- **Перенос проекта.** «Внутри копии» проверяются только файлы, которые положила панель (`Cloud.ru BrandKit`, медиа MOGRT). Свои файлы стенда (кадр склейки Premiere `cut-clip.png`) копируются вместе с проектом, но могут найтись на старом месте — это не ошибка панели.

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

0. **Установщик 0.1.18 и пресеты AME.**
   1. Уберите итоги разведки: в `26.0\Presets` — `CR Webinar Timer_1.epr`, `CR Webinar Timer B.epr` и `PresetTree.xml.aside`, предварительно скопировав их в `ame-backup`.
   2. Соберите подписанный пакет 0.1.18 (`package-zxp`, затем `build.mjs` с `--library C:/CRBK/work/library`).
   3. Установите `install.cmd -WithAme` при открытом Media Encoder — ждём код 2. Затем при закрытом — ждём код 0 и строки «Список пресетов Media Encoder перестроится…» по папкам 25.0 и 26.0.
   4. Запустите Media Encoder: в «Пользовательские стили и группы» девять «CR …», без дублей и без старых имён. Скриншот.
   5. Перезапустите AME: список тот же.
   6. Запишите итог в `docs/research/installer/windows-0.1.18.json`.
1. Подготовка:
   ```bash
   git pull origin claude/determined-cannon-eum3ei
   npm ci
   npm run library:build
   node tools/panel/install-dev.mjs
   ```
   AE и Premiere открыты, BrandKit Dev работает, шаблоны «CR …» загружены в AE.
2. `npm run panel:checkpoint`. Идёт долго: восемь наборов, по четыре в каждом хосте — base, media, export, ui. Перед ним откройте настоящую панель BrandKit в обоих хостах (DevTools 8101 и 8102 нужны для ui).
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
   - копии с Windows — архив `C:\CRBK\archive\2026-10-07-panel-live-moved.zip` (задание `2026-10-07-phase3-edit-handoff.md`, шаг 4). С 2026-10-06 копия Premiere лежит в `pr-moved-<время>`, а не в `pr-moved`. Откройте их так:
     ```bash
     node tools/panel/live.mjs --host ae --open <путь>/ae-moved/media_live.aep
     node tools/panel/live.mjs --host pr --open <путь>/pr-moved-<время>/media_live.prproj
     ```
   - Стенд открывает проект с поиском файлов по относительным путям, как интерфейс (`9e5e839`). До этого Premiere оставлял клипы у старых путей.
   - Если на Mac Premiere держит медиа так же, как на Windows, перенос там проверяется после перезапуска Premiere: `--only transfer`, как на Windows.
   - обратно: `ae-moved` и `pr-moved-*` после прогона на Mac — на Windows тем же `--open`.
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
