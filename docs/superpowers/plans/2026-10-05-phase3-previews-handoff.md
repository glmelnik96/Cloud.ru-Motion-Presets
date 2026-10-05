# Задание локальному агенту: превью карточек панели

**От кого:** облачная сессия, ветка `claude/determined-cannon-eum3ei`. **Где:** ПК сборки, AE 26.5 с панелью BrandKit Dev (CDP 8094), ffmpeg в PATH (тот же, что для ролика ревью), Premiere 26.5.2.
**Зачем:** в каталоге панели вместо превью заглушки. `tools/masters/preview.mjs` рендерит в AE кадры варианта 16:9 (через `render-case.jsx`, как сверка с эталоном) и собирает ffmpeg-ом `preview.mp4` (480 px, H.264, без звука) и `poster.jpg` в `C:/CRBK/work/build/<id>/` — оттуда их забирает сборщик каталога. Что показывает каждый шаблон — блок `preview` в `masters/<id>/ref.json`.

## Шаги

1. `git pull origin claude/determined-cannon-eum3ei`, `npm ci`, `npm test` — всё зелёное.
2. Превью трёх мастеров (AE открыт, его проект сохранён):
   ```bash
   node tools/masters/preview.mjs --item LOGO_Shot
   node tools/masters/preview.mjs --item LOGO_Mark
   node tools/masters/preview.mjs --item TTL_LowerThird
   ```
   Ждём `OK …/preview.mp4 (N frames at 12.5 fps), …/poster.jpg at … s`. Посмотрите все три `poster.jpg` и `preview.mp4` глазами: шаблон читается на фоне, нет чёрных или пустых кадров, видна вся анимация.
3. Каталог с превью и dev-установка панели:
   ```bash
   npm run library:build -- --out C:/CRBK/work/panel-live/library
   node tools/panel/install-dev.mjs
   ```
   (`library:build` берёт `<work>/build`; ждём `OK … 3 items, 19 files` — 13 файлов шаблонов плюс 3 × 2 превью.)
4. Перезапустите AE и Premiere, откройте Cloud.ru BrandKit и BrandKit Dev, затем:
   ```bash
   node tools/panel/ui-check.mjs --host ae
   node tools/panel/ui-check.mjs --host pr
   ```
   Новые проверки: `card previews: H.264 is playable in the panel` и `card previews: the preview under the cursor plays`, скриншот `<host>-ui-1b-preview.png`. Если H.264 в Chromium панели не играет (`canPlayType` пустой) — запишите это; облачная сессия перейдёт на другой кодек.
5. Наведите курсор на карточки сами: постер виден сразу, видео играет только под курсором и останавливается, когда курсор уходит.

## Вернуть

Закоммитьте `docs/research/panel-live/*-ui-report.json`, `*-ui-1-catalog.png`, `*-ui-1b-preview.png` и три постера, скопированные в `docs/research/previews/<id>-poster.jpg` (MP4 в репозиторий не кладите), и запушьте в ту же ветку. В ответе — что видно на постерах и в роликах, проблемы. Код не чинить — описать.

## Повторная проверка панели 0.1.4

Исправлено по отчёту `ee3c5c9`: постер поверх видео, порты DevTools 8101 (AE) и 8102 (Premiere) вместо занятых dev-панелью 8095/8097, копирование без `fs.cpSync`.

1. `git pull`, `npm ci`, `npm test`.
2. Верните установленную dev-панель BrandKit Dev к портам из репозитория (`dev/harness/.debug`: 8094–8097), если они менялись.
3. `node tools/panel/install-dev.mjs` — без `robocopy`; ждём строку `panel 0.1.4 -> … (DevTools: AE http://localhost:8101, Premiere http://localhost:8102)` и `library … -> C:/ProgramData/CloudRuBrandKit/library`.
4. Перезапустите AE и Premiere, откройте обе панели, `node tools/panel/ui-check.mjs --host ae` и `--host pr` — без перестановки портов.
5. Наведите курсор на «Логошот с подписью» и уведите: после ухода курсора снова виден постер, а не пустой кадр. Скриншот каталога после наведения.
6. Если снова появится диалог «Сохранить как» в AE — запишите, после какой команды и какой проект был открыт.

Вернуть: `docs/research/panel-live/*-ui-report.json`, скриншоты, `docs/research/previews/recheck.json` (вывод `install-dev`, наблюдения по пунктам 5–6), коммит и push в ту же ветку.
