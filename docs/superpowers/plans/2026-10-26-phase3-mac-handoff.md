# Задание: контрольная точка фазы 3 на Mac (панель 0.1.30, библиотека 2026.10.26.3)

**Кому:** агент Cursor на Mac пользователя.
**От кого:** сессия Claude Code на ПК сборки (Windows), 2026-10-26. Ветка `claude/determined-cannon-eum3ei`.
**Что закрывает:** часть B задания `2026-10-06-phase3-checkpoint-handoff.md`. Тогда она не запускалась: не было Mac.

**Контрольная точка фазы 3** (spec §3):
1. Сквозные сценарии зелёные в AE и Premiere на Windows и Mac.
2. Чистая установка с нуля, на Mac — с файлом в карантине.
3. Проект со вставками из AE и Premiere открывается на другой ОС без пропавших файлов.

Windows прогоняется на ПК сборки тем же днём (`docs/research/checkpoint/win-2026-10-26.md`).

## Правила

- **Код панели не чинить — описывать.** Если упала проверка панели, запишите шаг, текст ошибки и отчёт.
- **Правки стенда** (`tools/`, `tests/live/`) — только если стенд упал на своём шаге, отдельным коммитом с объяснением.
- **Работать только в тестовых проектах** в `/Users/Shared/CRBK/work`. Проекты пользователя не открывать и не сохранять. Тестовые проекты закрывать без сохранения.
- **Коммиты** — в ветку `claude/determined-cannon-eum3ei`, только правки стенда. **Push — только с разрешения пользователя.**
- **Отчёты в репозиторий не коммитятся** (решение пользователя 2026-10-26: в них пути машины). `docs/research/panel-live`, `checkpoint` и `installer` закрыты `.gitignore`; что нужно вернуть — в конце задания.

## Что нужно на Mac

- **Программы:** After Effects 2026 (26.5) и Premiere Pro 2026 (26.5.x); Media Encoder — для `--with-ame`.
- **Шрифты:** SB Sans Display и SB Sans Text, те же сборки, что на ПК сборки: Display 1.002, Text 1.003.
- **Инструменты:** Node 24, git, ffmpeg (`brew install node@24 ffmpeg`).
- **Файлы от пользователя** (папка `mac-2026-10-26` с ПК сборки):
  1. `CloudRuBrandKit-0.1.30-2026.10.26.3.zip` — подписанный релиз. **На Mac он должен прийти через браузер или мессенджер, чтобы у него был карантин.** Флешка и сеть карантина не дают.
  2. `build-mac-2026-10-26.zip` — 65 папок сборки мастеров (2,9 ГБ), из них живые прогоны собирают свою библиотеку. Этот архив можно перенести как угодно.
  3. `windows-projects-2026-10-26.zip` (0,4 ГБ) — проекты со вставками, сделанные на Windows контрольной точкой 2026-10-26: `ae-moved-20261026T080812/` и `pr-moved-20261026T082943/`, у каждого рядом его папки. Перенести как угодно.

## Шаги

### 0. Репозиторий
```bash
git clone https://github.com/glmelnik96/Cloud.ru-Motion-Presets.git && cd Cloud.ru-Motion-Presets
git checkout claude/determined-cannon-eum3ei
npm ci
npm test
```
Ожидаемо всё зелёное. Браузерные тесты `tests/panel/ui-dom.test.mjs` пропускаются, пока не задан `BRANDKIT_CHROMIUM`. Их можно прогнать так: `BRANDKIT_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npx vitest run tests/panel/ui-dom.test.mjs`, ожидается 19/19.

### 1. Чистая установка с карантином (критерий 2)

AE, Premiere и Media Encoder закрыты.
```bash
xattr -l ~/Downloads/CloudRuBrandKit-0.1.30-2026.10.26.3.zip    # есть com.apple.quarantine
cd ~/Downloads && unzip -q CloudRuBrandKit-0.1.30-2026.10.26.3.zip
cd CloudRuBrandKit-0.1.30-2026.10.26.3
bash install.command --with-ame; echo "exit $?"
```
- Ждём код 0 и строку о шаблонах `.aom`.
- Отдельно проверьте двойной щелчок по `install.command`. Ожидаемо macOS его не откроет: README говорит запускать через `bash`.
- Запустите AE и Premiere и откройте Window > Extensions > Cloud.ru BrandKit. В Premiere панели видны только при открытом проекте: создайте пустой тестовый в `/Users/Shared/CRBK/work/pr/`.
- В строке статуса внизу панели должно быть «панель 0.1.30 · библиотека 2026.10.26.3», и в каталоге — карточки.
- В Media Encoder должны появиться девять пресетов «CR …», без дублей.
- **Запишите** `docs/research/installer/mac-0.1.30.json`:
  - карантин до установки (вывод `xattr -l`);
  - код выхода и полный вывод установщика;
  - что дал двойной щелчок;
  - что видно в AE, Premiere и AME (строка статуса, число карточек, пресеты).

### 2. Стенд
```bash
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
bash tools/dev/link-harness.sh             # фоновый dev-мост: CDP 8094 (AE), 8096 (Premiere)
node tools/panel/install-dev.mjs --no-library   # та же панель 0.1.30 с .debug: DevTools на 8101/8102 для набора ui
mkdir -p /Users/Shared/CRBK/work/build && unzip -q build-mac-2026-10-26.zip -d /Users/Shared/CRBK/work/build
```
- `--no-library` обязателен: без него `install-dev` заменит установленную библиотеку.
- Перезапустите AE и Premiere: CEP читает расширения при старте.
- Мост жив, если `curl -s http://localhost:8094/json` и `curl -s http://localhost:8096/json` показывают по странице.
- Из Mac `install-dev` и стенд на этой машине ещё не запускались. Если что-то из них упадёт — это правка стенда, см. правила.
- В AE один раз загрузите шаблоны вывода «CR …»: Edit > Templates > Output Module > Load… файл `/Users/Shared/CloudRuBrandKit/library/items/AME_Templates/AME_Templates_aom_v1.aom`. Без них набор export в AE упадёт на первом шаблоне.

### 3. Контрольная точка (критерий 1)

AE и Premiere открыты, в каждом — тестовый проект. Затем:
```bash
npm run panel:checkpoint
```
- Что входит: `npm test` и в каждом хосте наборы base, media, export, ui. Итог пишется в `docs/research/checkpoint/mac-<дата>.json` и `.md`.
- Сводка дня дописывается: повторный запуск одного набора (`--host ae --only media --skip-tests`) обновляет только его строку.
- **Перенос проекта в Premiere** проверяется после перезапуска Premiere. Premiere на Windows держит импортированные медиа до выхода; на Mac проверьте, так ли это. После выхода и нового запуска:
  ```bash
  node tools/panel/checkpoint.mjs --host pr --only transfer --skip-tests
  ```

### 4. Открытие на другой ОС (критерий 3)

**Проекты с Windows → Mac.** Распакуйте `windows-projects-2026-10-26.zip` в любую папку, например `~/CRBK-from-win/`, и откройте:
```bash
node tools/panel/live.mjs --host ae --open ~/CRBK-from-win/ae-moved-20261026T080812/media_live.aep
node tools/panel/live.mjs --host pr --open ~/CRBK-from-win/pr-moved-20261026T082943/media_live.prproj
```
Отчёты: `docs/research/panel-live/<host>-open-mac-report.json`. Ожидаем ноль пропавших файлов.

**Проекты с Mac → Windows.** После медиапрогона шага 3 на Mac есть свежие копии:
- последняя `/Users/Shared/CRBK/work/panel-live/ae-moved-<время>`;
- последняя `/Users/Shared/CRBK/work/panel-live/pr-moved-<время>`.

Упакуйте обе папки в `mac-projects-<дата>.zip` и отдайте пользователю: на Windows их откроют тем же `--open`.

## Что знать заранее (найдено на Windows)

- **Живые прогоны — по одному.** Два прогона, запущенные одновременно, собирают одну тестовую библиотеку и падают.
- **Сохранение при выходе.** Premiere при выходе может спросить, сохранить ли тестовый проект. Ответ — «Don't Save».
- **Команда панели в AE переключает её.** Если после Window > Extensions панели не видно, вызовите команду ещё раз: она могла открыться плавающим окном.
- **Звуки.** Медиапрогон ставит под «О госте» его звуки появления и ухода. В «Экране вебинара» с таймером проверяется затухание музыки: −13,4 дБ на середине в обоих хостах.

## Что осталось после первого прогона (2026-10-26)

Первый прогон прошёл всё, кроме экспорта AE. Он упал вместе с двумя проверками экспорта в ui: шаблоны вывода «CR …» не были загружены в AE.

`npm test` на Mac падал по трём причинам, все три исправлены в ветке (`844951c`, `27f0c0d`, `8da0773`):
- тесты мастеров без дампов не пропускались;
- фикстура установщика писала не то содержимое;
- `refs` не рисовал листы без шрифта.

Порядок:
1. `git pull`, затем `npm test` — ожидается зелёный.
2. Загрузить в AE шаблоны вывода (шаг 2, последний пункт).
3. Перепрогнать экспорт и ui в AE:
   ```bash
   node tools/panel/checkpoint.mjs --host ae --only export,ui --skip-tests
   ```
4. Упаковать проекты, сделанные на Mac, для открытия на Windows: последние `/Users/Shared/CRBK/work/panel-live/ae-moved-<время>` и `pr-moved-<время>` вместе, в один `mac-projects-<дата>.zip`.

## Вернуть пользователю

- таблицу итога из `docs/research/checkpoint/mac-<дата>.md` (сам файл — копией на флешку, не в git);
- что упало и на каком шаге, с текстом ошибки;
- открылись ли проекты с Windows без пропавших файлов;
- как прошла установка с карантином: код выхода, двойной щелчок, что видно в программах;
- архив `mac-projects-<дата>.zip` для обратной проверки на Windows.
