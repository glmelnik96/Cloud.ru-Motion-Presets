# Ответ на задание «перенос в Premiere после перезапуска, размытие полей и стиль субтитров» (2026-10-06/07)

Задание: `docs/superpowers/plans/2026-10-06-phase3-premiere-transfer-handoff.md`. ПК сборки, Windows, Premiere 26.5.2, AE 2026. Параллельно в DaVinci Resolve шёл рендер (pid 17348): его и `fuscript` не трогал. Скрипт кликов отказывается работать, если на переднем плане не Premiere. В конце Resolve жив.

## 0. Перед началом

`git pull`, `npm ci`, `npm test`: 764 passed, 18 skipped.

## 1. Перенос проекта после перезапуска

- Полный `npm run panel:checkpoint`: всё зелёное, кроме переноса в Premiere. Сводка — `docs/research/checkpoint/win-2026-10-06.md`, отчёты — `docs/research/panel-live/*`.
  - Набор `ui` Premiere в первом прогоне упал на «status line shows…» (`Pr — · библиотека —`). Это гонка: на скриншоте того же мгновения статус полный. После перезапуска — 20/20.
- Перезапуск Premiere перед переносом был один. Поверх него — `npm run panel:checkpoint -- --host pr --only transfer --skip-tests`.
  - Сначала сохранил все три открытых проекта стенда копиями в `C:/CRBK/work/backup/pr-before-restart-*`.
  - `CloseMainWindow` за 60 с не закрыл Premiere, пришлось `Stop-Process`. Тост «Premiere quit unexpectedly» закрыт.
  - После закрытия висели 35 осиротевших `CEPHtmlEngine`, остановил.
- **EPERM нет**: все три папки (`library`, `Motion Graphics Template Media`, `Cloud.ru BrandKit`) переименованы с первой попытки, `retries` 0. Второй перезапуск по правилу не понадобился.
- **Перенос всё равно не прошёл**: «no missing files after the move (18 listed)». Все 18 клипов копии остались с абсолютными путями к спрятанным оригиналам. Отчёт — `docs/research/panel-live/pr-transfer-report.json`.
  - Причина — в стенде, а не в Premiere. `lvTransferOpen` в `tests/live/jsx/pr-live.jsx` открывает копию через `app.openDocument(f.fsName, true, true, true)`. Третий аргумент `bypassLocateFileDialog=true` отключает поиск по относительным путям, и клипы остаются offline.
  - Проверил на той же копии при спрятанных оригиналах. Открытие через интерфейс и `app.openDocument(path, true, false, true)` перелинковывают всё, 0 offline, включая оба `BG_DotGrid` из библиотеки.
  - Код стенда не правил (по правилам задания). Предлагаемая правка — третий аргумент `false`.
- Оригиналы прятал как `.away-ui` для ручной проверки и вернул обратно. Папок `.away*` не осталось.

## 2. Выемка ещё раз

`npm run materials` — без ошибок.

| Кривые | Всего | С кривой | bezier null |
|---|---|---|---|
| `mask.path` | 202 | 155 | 47 |
| `shape.path` | 46 | 36 | 10 |

- Из 57 null 48 — шумовые скорости в (1e-6, 1e-3]. Ещё 9 — настоящие скорости 0.894/1.186: `Контент_1`, `Подпись_спикера_2`, `Текст на плашке_2` / Cloud.ru. Предлагаю порог 1e-3.
- Первые строки раздела `mask.path` в `summary.md` (200 отрезков, без `_conv`):

| Кривая | Отрезков | Где |
|---|---|---|
| `0.67,0.00,0.11,1.00` | 10 | podcast (Контент_2 / Подкаст 29f…) |
| `0.63,0.00,0.31,1.00` | 10 | webinars PORTAL |
| `0.67,0.00,0.33,1.00` | 8 | podcast Cloud.ru |
| `0.55,0.00,0.41,1.00` | 8 | webinars |
| `0.73,0.00,0.28,1.00` | 8 | webinars Таймер |

- Маски размытий: все 13 одинаковые — кадр 3840x2160, ADD, inverted, feather 0, прямоугольник 105/102/3735/2058. Совпадает с прошлым ответом.
- Пропавшие и выключенные исходники совпадают с разделом 6 прошлого ответа: в «Оверлей со спикером 2» пропавший mov на двух слоях.

## 3. Размытие полей (D11)

### 3.1 Пресет с маской через интерфейс

- Корректирующий слой (File → New → Adjustment Layer; пункт серый, пока фокус не в панели Project).
- На нём Fast Blur: Blurriness 20 (в 4K-секвенции 38), Horizontal and Vertical, Repeat Edge Pixels.
- Маска. В Premiere 26 кнопок маски в Effect Controls нет. Путь: Tools → долгое нажатие на группу инструментов маски → Rectangle Mask Tool, затем рисование в Program Monitor. Маска попадает на эффект, выделенный в Effect Controls. Затем Inverted.
- **Развилка**: нарисовать мышью ровно 52.5/51 px нельзя. Вершины выставил патчем `.prproj` (формат ниже); устаревший `BinaryHash` Premiere принял.
- Проверка кадром (`exportFramePNG`, шахматка 48 клеток):
  - 1080p: центр совпадает с исходником (max diff 0), резкость с x=53 / y=51 — `docs/research/premiere/blur-mask.png`.
  - 4K, тот же пресет и Blurriness 38: центр 0, граница на 105/102.
- Save Preset «CR Размытие полей» и «CR Размытие полей 4K», тип Scale. Export Preset → `C:/CRBK/work/materials/premiere/CR Размытие полей.prfpset` (30 275 Б) и `… 4K.prfpset` (30 305 Б). В git их нет.
- XML маски — `docs/research/premiere/blur-preset-mask.xml`, разбор в шапке файла:
  - маска — SubComponent эффекта `AE.ADBE AEMask2` «Mask2», экземпляр «01»;
  - путь — ParameterID 7: двоичный блок с вершинами в долях кадра, поэтому один пресет годится и для 1080p, и для 4K;
  - Inverted — ParameterID 17, Feather — 14, Opacity — 15, Expansion — 16;
  - у двоичных значений в пресете атрибут `Checksum`, алгоритм не установлен (не CRC32/Adler32/CRC32C/FNV).
- Применение: перетащить пресет из Effects на Effect Controls корректирующего слоя — Fast Blur приходит с маской. Двойной щелчок по пресету начинает переименование, а не применение.
- QE: `qe.project.getVideoEffectByName('CR Размытие полей')` возвращает объект с пустым именем. `addVideoEffect` с ним возвращает false и ничего не добавляет. Пресет скриптом не применить.
- Доставка файлом — **не работает ни в одном варианте**. Общий файл: `Documents/Adobe/Premiere Pro/26.0/Profile-Глеб/Effect Presets and Custom Items.prfpset`.
  - (а) Отдельный `.prfpset` в папке профиля — после перезапуска не виден.
  - (б) Экспортированный блок, вставленный в общий файл с перенумерацией ID (`merge-presets.mjs`), — не виден. То же со сгенерированным блоком (60 px, устаревший checksum).
  - Контроль: побайтная копия собственного общего файла Premiere со всеми сохранёнными им пресетами — после перезапуска пресетов тоже нет.
  - Effects → Import Presets работает, но только до конца сессии. После перезапуска пропадают и импортированные пресеты, и тестовый пресет без маски «CR тест без маски», хотя в файле они лежат.
  - Вывод: Premiere 26.5.2 на этом ПК не читает пользовательские пресеты эффектов при запуске. Возможно, из-за кириллицы в пути профиля; в логах ничего не нашёл. Для панели остаётся Import Presets каждую сессию руками или путь из 3.2.
  - Общий файл вернул к исходному: 1181 Б, пустой Presets, хеш совпадает с копией в `C:/CRBK/work/backup/presets/before-insert.prfpset`.

### 3.2 Скриптом через Crop

- Скрипт `C:/CRBK/work/materials/scratch/blur-by-crop.jsx`. Тот же клип на V1 (Fast Blur 20/38, Repeat Edge Pixels) и на V2 (Crop L/R 2.734 %, T/B 4.722 %). Всё ставится через QE `addVideoEffect` и параметры DOM.
- Сравнение с вариантом 3.1:
  - 1080p: RMS 1.604 из 255. Max 106 только на 2663 пикселях (0.13 %) граничных столбцов и строки x=52, x=1867, y=1029 — округление половины пикселя в 52.5.
  - 4K: RMS 0.152, max 12.
  - Оба ≤ 4, так что это кандидат для кнопки панели — `docs/research/premiere/blur-crop.png`.
- Ограничение: размывается только продублированный клип, а не всё, что ниже, как у корректирующего слоя. Клип нужен на таймлайне дважды.

## 4. Стиль субтитров «CR Субтитры» (D25)

- Дорожка из `probe.srt`: `seq.createCaptionTrack(srt, 0, Sequence.CAPTION_FORMAT_SUBTITLE)` → true.
- Properties субтитра:
  - SB Sans Text / Regular, размер 35, трекинг −32;
  - заливка белая, обводки нет, тень снята (по умолчанию была включена), по центру;
  - Background включён: цвет 222222 (hex в Color Picker), непрозрачность 100, Size 10 (отступ по умолчанию), скругление 0.
- **Развилка — интерлиньяж**: оставил 0. В Premiere это сдвиг от автоматического межстрочного, а 36.8 в пакете — абсолютное значение. Если вписать 36.8, расстояние между строками примерно удвоится. На однострочных субтитрах разницы не видно.
- Кадр — `docs/research/premiere/captions-cr-style.png`. Пиксели плашки ровно RGB 34,34,34.
- Track Style + → Create style… → New Text Style: имя «CR Субтитры». Save to Project включён по умолчанию, Save to Local styles выключен — включил.
  - Файл сразу появился в `Documents/Adobe/Common/Assets/Text Styles/CR Субтитры.prtextstyle` (24 753 Б).
  - **Развилка**: не экспортировал через меню, а скопировал этот файл в `C:/CRBK/work/materials/premiere/` (задание это допускает). В git его нет.
- Формат текстовый — UTF-8 XML `<PremiereData Version="3">`, по сути мини-проект с шаблонными настройками.
  - Внутри `StyleProjectItem` → `VideoFilterComponent AE.ADBE Text` с 22 параметрами.
  - Всё оформление — base64-блок 464 Б в параметре «Source Text» (похоже на FlatBuffers).
  - Шрифт записан только PostScript-именем `SBSansText-Regular`, бинарей шрифта нет. На машине монтажёра SB Sans Text должен быть установлен.
  - Найдены float32: 35 (смещение 420), −32 (408), 10 (156); байты `22 22 22` — цвет фона.
  - Образец — `docs/research/premiere/captions-style-sample.txt`.
- Импорт скриптом в новый scratch-проект (`C:/CRBK/work/materials/premiere/captions/cap_import.prproj`):
  - `app.project.importFiles([… .prtextstyle], true, rootItem, false)` → true за 407 мс, без зависания. Перезапуск и перетаскивание не понадобились.
  - Появился элемент «CR Субтитры» (type 5).
  - У новой дорожки из `probe.srt` в списке Track Style есть None и «CR Субтитры».
- Назначить стиль без интерфейса — три попытки, ни одна не дала пути через API:
  1. `seq.getSelection()` при выделенном в интерфейсе субтитре возвращает «SyntheticCaption» без компонентов и без `projectItem`. Методы — только `move/remove/setSelected/getMGTComponent/…`, стиль не задать.
  2. Метаданные:
     - у элемента стиля `getProjectMetadata` — только имя, метка и MediaType Non-Media; `getXMPMetadata` пустой; `videoComponents()` → null;
     - у `probe.srt` и секвенции полей стиля нет;
     - в QE-секвенции и QE-проекте нет методов для дорожек субтитров;
     - в DOM `Sequence` нет `captionTracks`.
  3. Файл проекта. В `.prproj` у `CaptionDataClipTrack` есть `CaptionDataTemplateStyle` (base64) и `<ParentStyle ObjectURef=UID StyleProjectItem>`.
     - Если вписать только их (закрыл свой scratch-проект, пропатчил, открыл), субтитры остаются Lucida с тенью. У каждого субтитра свой `FormattedTextData` — текст вместе с оформлением.
     - Если дополнительно перенести `FormattedTextData` из оформленного проекта с теми же текстами, субтитры рисуются в стиле CR, а в Track Style стоит «CR Субтитры».
     - Для произвольного SRT панели пришлось бы кодировать этот блок под каждый субтитр. Это не делал.
  - Итог: монтажёр выбирает стиль в списке Track Style — один клик на дорожку. Панель может принести стиль в проект через `importFiles`.

## Что ещё странного

- CEP-панель не поднимается, пока Premiere на стартовом экране или его окно за другими окнами. Хост отвечает через 5 с после открытия любого проекта и вывода Premiere вперёд.
- `MainWindowHandle` у Premiere иногда указывает на всплывающее окно. Окно для кликов искал как самое большое видимое окно процесса.
- Плавающая панель Properties однажды оказалась за краем экрана (x 1943…3354), вернул через `MoveWindow`.
- Поля Premiere не принимают Ctrl+A / Ctrl+V из SendKeys (Ctrl+A печатает «a»). **Развилка**: очищал через `{END}{BS N}`, кириллицу вводил юникод-событиями SendInput.
- Диалог Export Preset подставляет «Untitled Preset.prfpset», и набранное имя дописывалось к нему — стирал.
- В прошлом ответе `app.newProject` оставлял `app.project` на старом проекте до конца eval. В этот раз новый проект стал активным сразу.
- **Развилка — перезапуски**: проверки доставки пресетов объединял по нескольку на один перезапуск. Всего за сессию около 8 запусков Premiere; принудительно (`Stop-Process`) — только первый, остальные закрывались за 1–2 с после сохранения проектов.
- **Развилка — проверочный пресет**: сгенерированный пресет (60 px, устаревший checksum) делал только как контроль доставки файлом. В Effects он не появился, как и все остальные.

## Где что лежит

- В git: `docs/research/premiere/{blur-mask.png, blur-crop.png, blur-preset-mask.xml, captions-cr-style.png, captions-style-sample.txt}`, дополнение `addendum_2026_10_07` в `docs/research/premiere/blur-and-captions.json`, отчёты checkpoint и материалов (коммит `6c711ee`).
- Не в git (файлы бренда): `C:/CRBK/work/materials/premiere/{CR Размытие полей.prfpset, CR Размытие полей 4K.prfpset, CR Субтитры.prtextstyle}`.
- Scratch: `C:/CRBK/work/materials/premiere/blur/`, `…/captions/`, скрипты — `C:/CRBK/work/materials/scratch/`. Резервные копии — `C:/CRBK/work/backup/`.
