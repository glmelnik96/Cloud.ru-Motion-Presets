# Задание локальному агенту: брендовые пресеты и живая проверка вкладки «Экспорт» (панель 0.1.14)

**От кого:** облачная сессия, ветка `claude/determined-cannon-eum3ei`.

**Где:**
- ПК сборки: AE 26.5, Premiere 26.5.2, AME 26.5.2, ffmpeg и ffprobe в PATH.
- Исходные пресеты: `C:/CRBK/archive/2026-10-02/7_Пресеты_Media_Encoder`.
- Шаблон «CR FullHD» из разведки: `docs/research/export/CR-FullHD.aom`.

**Зачем.** Вкладка «Экспорт» сделана в облаке по решениям P18–P23 (план 3, подписаны 2026-10-06 — «согласен»):
- **Premiere:** `.epr` уходит в очередь AME (по умолчанию) или экспортируется сразу (`exportAsMediaDirect`). Диапазон — от In до Out, без меток — вся секвенция.
- **AE:** Render Queue с шаблоном «CR …» по имени; при другом кадре — Resize, при другой частоте — «Use this frame rate». Диапазон — рабочая область. Вариант «В фоне» сохраняет проект и запускает `aerender -project … -rqindex N`.
- **Файл:** `<папка проекта>/Export/<имя>_<пресет>.mp4`; если такой есть — `_2`, `_3`.
- **Список пресетов** — по кадру композиции или секвенции; чужая пропорция не предлагается.

На фейках и в Chromium всё проходит. Нужны настоящие пресеты в 25 к/с, шаблоны AE и живой прогон.

**Код панели не чинить — описывать.** Чинить можно только стенд (`tests/live/*`, `tools/*`), если он врёт; такие правки — отдельным коммитом с объяснением.

## 1. Пресеты Media Encoder в 25 к/с (P18)

Канон каждого пресета — в `tools/library/export-pack.mjs` (`EXPORT_CANON`): кадр, уровень, пара битрейтов. По D2 у всех 25 к/с. Остальное не меняется: High, VBR, AAC 48 кГц стерео 320 кбит/с.

1. Скопируйте 9 `.epr` из архива в `C:/CRBK/work/export/epr/` под именами элементов:

   | Архив | Файл |
   |---|---|
   | `4K.epr` | `AME_4K.epr` |
   | `FullHD.epr` | `AME_FullHD.epr` |
   | `SMM_1440x1080.epr` | `AME_SMM_4x3.epr` |
   | `SMM_16x9.epr` | `AME_SMM_16x9.epr` |
   | `SMM_1x1.epr` | `AME_SMM_1x1.epr` |
   | `SMM_9x16.epr` | `AME_SMM_9x16.epr` |
   | `Webinar_Final render.epr` | `AME_WebinarFinal.epr` |
   | `Webinar_Timer.epr` | `AME_WebinarTimer.epr` |
   | `Webinar_Zastavka.epr` | `AME_WebinarIntro.epr` |

2. Семь пресетов не в 25 к/с — четыре SMM (30) и три вебинарных (24). Откройте каждый в AME (Preset Browser → Import, затем Edit) и поставьте Frame Rate 25. Остальное не трогайте. Сохраните поверх файла из шага 1 (Export Preset).
3. Проверка: `node tools/library/export-pack.mjs --check --epr C:/CRBK/work/export/epr --aom <любой путь>`. Строки `FAIL AME_…` по `.epr` должно не остаться; про `.aom` пока будет FAIL. Если AME при сохранении меняет что-то ещё (уровень, битрейт, звук) — опишите, что именно.

## 2. Шаблоны Output Module в AE (P21)

Собираются вручную, как «CR FullHD» в разведке: Edit → Templates → Output Module → New, основа — «H.264 - Match Render Settings - 15 Mbps».

1. Девять шаблонов с именами `omTemplate` из `EXPORT_CANON`: `CR 4K`, `CR FullHD`, `CR SMM 4x3`, `CR SMM 16x9`, `CR SMM 1x1`, `CR SMM 9x16`, `CR Webinar Final`, `CR Webinar Timer`, `CR Webinar Intro`. В каждом:
   - Format Options: Software Encoding, Profile High, уровень и пара битрейтов (target / max) своего пресета, VBR 1 pass;
   - звук: AAC 320 кбит/с, 48 кГц, стерео;
   - **Resize выключен**: размер задаёт композиция, при другом кадре его выставляет панель.
2. Edit → Templates → Output Module → **Save All** → `C:/CRBK/work/export/CR_BrandKit.aom`. В файл попадут и заводские шаблоны — это нормально.
3. Проверка и раскладка в сборку:
   ```bash
   node tools/library/export-pack.mjs --epr C:/CRBK/work/export/epr --aom C:/CRBK/work/export/CR_BrandKit.aom
   ```
   Ждём `OK: 9 presets and the .aom match the canon`. Файлы лягут в `C:/CRBK/work/build/AME_*/` и `AME_Templates/`. В git `.epr` и `.aom` не коммитим, как остальную сборку; сохраните копию `C:/CRBK/work/export/`.

## 3. Живой прогон

Панель 0.1.14: `npm test`, затем `node tools/panel/install-dev.mjs`. AE и Premiere открыты, BrandKit Dev работает.

```bash
node tools/panel/live.mjs --host ae --export
node tools/panel/live.mjs --host pr --export
```

Отчёты — `docs/research/panel-live/ae-export-report.json` и `pr-export-report.json`; файлы — в `C:/CRBK/work/panel-live/<host>/Export/`. Каждый файл проверяется ffprobe: кадр пресета, 25 к/с, H.264 High нужного уровня, AAC 48 кГц стерео, длительность диапазона.

**AE (11 случаев):**
- FullHD, таймер, повтор с `_2`;
- 4K, а также 4K-композиция в FullHD (Resize), 30-к/с композиция в FullHD (25 к/с и предупреждение);
- SMM 1:1 и 9:16;
- отказ по пропорции; отказ без шаблона с инструкцией;
- фон: aerender при открытом AE.

Очередь рендера пользователя должна остаться как была.

**Premiere (10 случаев):**
- FullHD сразу и повтор `_2`, SMM 16:9;
- вебинар через очередь AME;
- вся секвенция без меток (3 с);
- 4K, 4K-секвенция в FullHD, FullHD-секвенция в 4K (предупреждение);
- SMM 9:16; отказ по пропорции.

Если прогон AE остановился на «every «CR …» template is loaded» — загрузите `.aom` (Edit → Templates → Output Module → Load) и повторите.

Самое важное:
- **aerender при открытом AE.** В разведке он запускался при закрытом AE. Если не работает — текст из отчёта (`aerender finished while AE is open`, поле `tail`).
- **Битрейт** ffprobe на тестовом клипе не покажет (однотонная картинка не добирает VBR) — его не проверяем.

## 4. Вкладка в настоящей панели

1. Поставьте панель с библиотекой пресетов:
   ```bash
   node tools/panel/install-dev.mjs --library C:/CRBK/work/panel-live/export/library
   ```
   Перезапустите хосты.
2. **Premiere**, вкладка «Экспорт» на секвенции 1920×1080 25p с клипом:
   - список: Full HD, SMM 16:9, три вебинарных, 4K с пометкой «увеличение»;
   - «В очередь Media Encoder» → «В очереди Media Encoder: …», AME кодирует, Premiere свободен;
   - «Показать в папке» открывает Проводник;
   - повтор — файл `_2`;
   - «Сразу, без AME» — файл готов, Premiere на время занят.
3. **AE**, композиция 1920×1080:
   - «Рендерить» — AE показывает ход, файл готов, своя очередь пользователя не тронута;
   - «В фоне (aerender)» → кнопка «Сохранить проект и рендерить в фоне»; панель свободна, строка «В фоне: …» сменяется на «Готово: …».
4. **AE без шаблонов** — удалите один «CR …» в Edit → Templates → Output Module. Ждём инструкцию с путём к `.aom` вместо экспорта. Загрузите `.aom` обратно.
5. Скриншоты вкладки в обоих хостах — в `docs/research/panel-live/`.
6. Верните обычную библиотеку: `node tools/panel/install-dev.mjs --no-build`.

## Вернуть

Закоммитьте в ту же ветку:
- отчёты `*-export-report.json`;
- скриншоты;
- вывод `export-pack.mjs` (текстом в ответе или файлом `docs/research/export/stage.txt`);
- правки стенда, если были.

В ответе:
- что AME поменял при пересохранении, кроме fps;
- прошли ли оба прогона, и если нет — что упало;
- работает ли aerender при открытом AE и сколько он шёл;
- как вели себя AE и Premiere во время рендера и экспорта;
- замечания по вкладке.
