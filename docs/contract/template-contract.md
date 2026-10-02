# Контракт шаблона BrandKit

**Статус:** черновик от 2026-10-02, утверждается в фазе 0 (лист решений, A2). Источник — spec §4.2; пороги — spec §4.4; правила бренда — `docs/decisions/brandbook-rules.md`.

**Режимы проверки:**
- `авто: tplProblems` — скрипт в AE читает мастер и его варианты. Это расширенный `G.tplProblems` из ae-motion-live; пишется в фазах 1–2. Сейчас он умеет C21 и C34 и половину C07.
- `авто: QA-гейт` — шаг конвейера (spec §4.4, п. 6): настройки проекта, рендер, файлы. Сюда же входит валидатор библиотеки `tools/library/validate.mjs`, он уже готов.
- `просмотр` — проверяет человек: дизайнер или ревьюер мастера.

Слои и контролы называются так же, как в фикстуре пробных сборок: `TXT_<ПОЛЕ>`, `CTRL`, `SLOT_<ПОЛЕ>`, `QA_PATCH`. Внутренние имена эффектов на `CTRL` — ASCII (`Duration`, `QA`, `Style`).

| № | Правило | Проверка | Как проверяем | Источник |
|---|---|---|---|---|
| C01 | Мастер-композиция называется `CR_<КОД>_<Элемент>`, код — LOGO, TTL, WEB, CRS, SMM, POD, TRN или BG; пресеты — `CR_FX_<Имя>` | авто: tplProblems | имя мастера соответствует `^CR_(LOGO\|TTL\|WEB\|CRS\|SMM\|POD\|TRN\|BG)_[A-Za-z0-9]+$`; имена `.ffx` — шаблону `CR_FX_<Имя>` | §4.2 «Имена» |
| C02 | Вложенные композиции называются от мастера: `CR_<КОД>_<Элемент>_<Часть>` | авто: tplProblems | каждая композиция, до которой можно дойти от мастера через `layer.source`, начинается с имени мастера и `_` | §4.2 «Имена» |
| C03 | У вариантов и зависящих от формата вложенных композиций — суффикс формата (`_16x9`, `_16x9_4K`, `_9x16`, `_1x1`), у всех композиций шаблона — суффикс версии `_v<N>`; ставит конвейер | авто: QA-гейт | после нарезки (шаг 2): все композиции `<id>_v<N>.aep` оканчиваются на `_v<N>`; композиции вариантов — на `_<формат>_v<N>`; в `library.json` `aeComp` оканчивается на `_v<version>` (validate.mjs, правило `ae-comp`) | §4.2, §4.4 шаги 1–2 |
| C04 | Имена всех элементов проекта уникальны | авто: tplProblems | нет двух элементов проекта с одним именем и двух слоёв с одним именем в одной композиции | §4.2 «Имена» |
| C05 | Слои `TXT_` и `CTRL` лежат на верхнем уровне мастера | авто: tplProblems | `TXT_*` и `CTRL` есть в мастере и не встречаются во вложенных композициях | §4.2 «Структура» |
| C06 | Мастер плоский: раскладочные слои наверху, прекомпы только для частей, не зависящих от формата | просмотр | ревью мастера по JSX-дампу: прекомп с выражениями от `thisComp.width/height` — повод разобрать | §4.2 «Структура» |
| C07 | Каждому полю `library.src.json` типа text соответствует слой `TXT_<ПОЛЕ>`, и наоборот | авто: tplProblems | ключи полей в верхнем регистре против имён слоёв `TXT_*`; нынешний `G.tplProblems` ловит только пропавшие слои, обратную сторону добавить | §4.2 «Тексты» |
| C08 | Один стиль на поле | авто: tplProblems | `TextDocument.characterRange(0, длина)` (AE 24.3+): `font`, `fontSize`, `fillColor` не `undefined` (смешанное значение читается как `undefined`) | §4.2 «Тексты» |
| C09 | Point-текст, без пустых абзацев для отступа | авто: tplProblems | `TextDocument.pointText === true`; текст не начинается и не кончается переносом и не содержит двух переносов подряд | §4.2 «Тексты» |
| C10 | Если у каждой строки своя плашка, строки — отдельные поля и слои `TXT_LINE1…TXT_LINE3`, без переносов внутри | авто: tplProblems | в тексте слоёв `TXT_LINE<n>` нет переносов строки | §4.2 «Тексты» |
| C11 | Пустая строка скрывает свою плашку; явные переносы внутри поля — только там, где у строк нет своих плашек | просмотр | случай с пустой строкой в `<id>.ref.json`, рендер и просмотр бок о бок | §4.2 «Тексты», §3.2 |
| C12 | Слой `CTRL`, не больше 8 контролов: dropdown, checkbox, slider. Текстовые поля, слоты, флажок `QA` и слайдер `Duration` в лимит не входят | авто: tplProblems | на `CTRL` эффектов-списков (`property(1).isDropdownEffect === true`: в AE 26.5 match name списка — `Pseudo/@@<id>`, свой у каждого экземпляра) и эффектов с match name `ADBE Checkbox Control`, `ADBE Slider Control`, кроме `QA` и `Duration`, не больше 8 | §4.2 «Контролы» |
| C13 | У каждого слайдера есть границы | авто: QA-гейт | в `library.src.json` у поля slider есть `min` и `max`, `min < max` (validate.mjs: схема и правило `field-default`) | §4.2, §4.4 |
| C14 | Внутренние имена контролов ASCII; в Essential Graphics — русские имена из `egpName` | авто: tplProblems | имена эффектов на `CTRL` соответствуют `^[A-Za-z0-9_]+$`; множество `comp.getMotionGraphicsTemplateControllerName(i)` (AE 16.1+; индексы с 1, новейший контроллер первым — S1 на AE 26.5) равно множеству `egpName` элемента | §4.2 «Контролы», §4.4 |
| C15 | Point- и angle-контролы не используются | авто: tplProblems | на `CTRL` нет `ADBE Point Control`, `ADBE Point3D Control`, `ADBE Angle Control` | §4.2 «Контролы» |
| C16 | Цвет — только выпадающим списком палитры, без color picker | авто: tplProblems | на `CTRL` нет `ADBE Color Control` | §4.2 «Контролы» |
| C17 | Source Text без управления шрифтом: шрифт закреплён за стилем | просмотр | в панели Essential Graphics у свойств Source Text выключены переключатели шрифта (скриптом не задаются, spec §1.1) | §4.2 «Контролы» |
| C18 | Плашки и окна подстраиваются под текст через `sourceRectAtTime`, замер в момент покоя или по скрытой копии `MEASURE_<ПОЛЕ>` | авто: tplProblems | вызов `sourceRectAtTime` с текущим временем (`time` или без аргумента) идёт только к слою `MEASURE_*` без аниматоров; у остальных вызовов время — константа | §4.2 «Вёрстка» |
| C19 | Отступы — выражениями от размера кадра; размеры кратны 2 px, отступы от края кратны 10 px | просмотр | ревью выражений вёрстки по JSX-дампу варианта; сетка брендбука, с. 24 | §4.2 «Вёрстка», `brandbook-rules.md` G1 |
| C20 | Кегли под формат ставит конвейер: кегль варианта = кегль мастера × k, k = min(ширина, высота) / 1080 | авто: QA-гейт | после шага 1 `TextDocument.fontSize` каждого `TXT_` в варианте равен значению мастера × k с точностью 0,5 px | §4.2, §4.4 шаг 1 |
| C21 | Маркеры `in` и `out` на мастере: 0 < in < out ≤ длительность | авто: tplProblems | есть в нынешнем `G.tplProblems` | §4.2 «Время» |
| C22 | `fit: rdt` — только со статичной серединой: защищённые интро и аутро, середина растягивается | авто: tplProblems | маркеры с `MarkerValue.protectedRegion === true` (AE 16.0+) покрывают [0, in] и [out, конец]; QA-гейт сравнивает кадры in+1 и out−1 (SSIM ≥ 0,999 — середина статична) | §4.2 «Время» |
| C23 | `fit: trim` — у шаблонов с движением в середине и со слотом, принимающим видео; композиция максимальной длины, панель обрезает клип | авто: tplProblems | у `trim`-мастера нет защищённых областей, длительность не меньше максимальной длины вставки; слот с видео требует `trim` (validate.mjs, правило `media-fit`) | §4.2 «Время» |
| C24 | Служебный слайдер `Duration` («Длительность (служебное, не менять)») выведен в Essential Graphics, в форме панели скрыт; выражения считают время от него | авто: tplProblems | на `CTRL` есть `ADBE Slider Control` с именем `Duration`, в EGP есть контроллер с его `egpName`; в `library.src.json` поле `service: true`, `editable: false` (validate.mjs, `service-field`) | §4.2 «Время», §4.4 |
| C25 | Поле с `drivesDuration` (минуты таймера) задаёт и контрол, и длину вставки; такое поле одно | авто: QA-гейт | validate.mjs, правило `drives-duration` | §4.2 «Время», §6.1 |
| C26 | Внутри мастера нет удержаний через time remap и обратного воспроизведения; у слоёв нулевой старт и растяжение 100 % | авто: tplProblems | у всех слоёв мастера и его вложенных композиций `timeRemapEnabled === false`, `stretch === 100`, `startTime === 0` | §4.2 «Время» |
| C27 | Длина на слое экземпляра в композиции пользователя подгоняется одним механизмом по `fit`; механизм выбирает S3 | авто: QA-гейт | приёмочная часть: каждый вариант вставляется в тестовую композицию длиннее и короче шаблона, кадры на in и out совпадают с мастером (SSIM ≥ 0,98). Механизм (растяжение слоя, сдвиг out point или time remap) берётся из поля `mechanism` в `spikes/results/S3.data.json` (S3, часть C) и вписывается сюда при закрытии фазы 0 | §4.2 «Время», S3 |
| C28 | Фото, QR и видео — только через слоты Media Replacement; футажа вне слотов нет | авто: tplProblems | каждый слой с файловым футажом называется `SLOT_<ПОЛЕ>` и соответствует полю type media; число таких слоёв равно числу полей media | §4.2 «Медиа» |
| C29 | Опорные кадры — только guide-слоями в рабочих копиях; в файлах библиотеки их нет | авто: QA-гейт | в `<id>_v<N>.aep` нет слоёв с `guideLayer === true` и футажом | §4.2 «Медиа» |
| C30 | Classic 3D | авто: QA-гейт | `comp.renderer` у всех композиций элемента равен идентификатору Classic 3D: по сообществу Adobe это `ADBE Advanced 3d`, значение подтвердить по `comp.renderers` на AE 26.x | §4.2 «Техника» |
| C31 | Только встроенные эффекты, поддерживаемые в MOGRT: без Camera-Shake Deblur, Synthetic Aperture Color Finesse, Maxon CINEWARE, Puppet, Warp Stabilizer; без футажа через Dynamic Link и FLV | авто: QA-гейт | match name каждого эффекта входит в список встроенных (дамп `app.effects` на AE 26.x без сторонних плагинов; на машине разработки стоит ReelSmart Motion Blur — в список не берётся) и не входит в пять запрещённых; у футажа нет расширения `.flv` и ссылок Dynamic Link | §4.2, §1.1 п. 5 |
| C32 | Выражения пишутся под JavaScript-движок и проверяются в обоих движках | авто: QA-гейт | `app.project.expressionEngine` по очереди `javascript-1.0` и `extendscript` (AE 16.0+): `Property.expressionError` пуст везде, ключевые кадры рендерятся в обоих | §4.2, §4.4 шаг 6 |
| C33 | Эффекты в выражениях — по своему ASCII-имени или match name, параметры — по индексу; локализованные имена запрещены | авто: tplProblems | в тексте выражений нет `effect("…")("…")` (параметр по имени) и стандартных имён вроде `"Slider Control"`, `"Ползунок"`; пример правильного обращения: `effect("Duration")(1)` | §4.2 «Техника» |
| C34 | Без звука внутри | авто: tplProblems | есть в нынешнем `G.tplProblems`: нет слоёв с `hasAudio && audioEnabled` | §4.2 «Техника» |
| C35 | Motion blur выключен по умолчанию | авто: tplProblems | `comp.motionBlur === false` и `layer.motionBlur === false` у всех слоёв | §4.2 «Техника» |
| C36 | Нативные размеры: текст 100 %, реальные кегли, без масштабирующих нулей | авто: tplProblems | масштаб слоёв `TXT_` — 100 %; ни один нуль-родитель слоёв `TXT_` не масштабирован | §4.2 «Техника» |
| C37 | Шрифты по PostScript-именам: `SBSansDisplay-Semibold` (строчная b), `SBSansDisplay-Regular`, `SBSansDisplay-Bold`, `SBSansText-Regular`; сборка — эталонная из `brand/tokens.json` | авто: QA-гейт | `app.project.usedFonts` (AE 24.5+) входит в `requiredFonts` элемента; `FontObject.version` совпадает со сборкой; `isSubstitute === false` (AE 24.0+) | §4.2 «Шрифты», §8.1 |
| C38 | Цветовой патч `QA_PATCH` в каждом мастере — обычный слой, не guide; включается скрытым флажком `QA` на `CTRL`, который не выводится в Essential Graphics и не входит в лимит; в релизных файлах выключен | авто: tplProblems | `QA_PATCH` есть, `guideLayer === false`, его выражение непрозрачности ссылается на `QA`; среди контроллеров EGP нет `QA`; QA-гейт: в релизных `.aep` и MOGRT флажок `QA` выключен | §4.2 «Цветовой патч» |
| C39 | Имена файлов библиотеки и шаблонов — ASCII (латиница, цифры, `_`, `-`), не длиннее 64 символов | авто: QA-гейт | validate.mjs, правило `file-name`, и обход папки релиза | §4.2 «Файлы» |
| C40 | Один элемент на `.aep` со всеми форматами; сохранение в AE 26 | авто: QA-гейт | все композиции `<id>_v<N>.aep` начинаются с имени мастера элемента; при сохранении `app.version` начинается с `26.` | §4.2 «Файлы» |
| C41 | NFC — в рабочих копиях пакетов, где остаётся кириллица | авто: QA-гейт | «доктор пакета» (spec §3.2): у каждого имени файла `name === name.normalize('NFC')` | §4.2 «Файлы» |
| C42 | Логотип — только из мастера (D18); охранное поле X = половина высоты знака; высота знака не меньше 20 px в каждом формате | просмотр | ревью мастера; правила `brandbook-rules.md` L1–L4 (с. 7) | D22 |
| C43 | Прямые углы и квадратные окончания: обводки без скруглений, прямоугольники без радиуса | авто: tplProblems | у обводок `ADBE Vector Stroke Line Cap` и `ADBE Vector Stroke Line Join` не «Round» (номер пункта снять с эталонного слоя на AE 26.x); у прямоугольников `ADBE Vector Rect Roundness` = 0 | `brandbook-rules.md` G2 (с. 4) |

## Пороги QA

Утверждаются вместе с контрактом (A4), исходные значения — spec §4.4.

| Порог | Значение | Где проверяется |
|---|---|---|
| ΔE2000 цветового патча: рендер AE против T2-рендера и MOGRT в Premiere | ≤ 2 | QA-гейт (автоматическая и приёмочная части) |
| SSIM с эталоном на неизменённых областях | ≥ 0,98 | QA-гейт, сверка по spec §3.2 |
| Бесшовность петли: кадр N против кадра 0 | SSIM ≥ 0,999 (предложение; в spec «≈ 1») | QA-гейт, шаг 5 |
| Бюджет производительности | число после повтора S8 на первых мастерах | приёмочная часть |
| Вес установки по умолчанию | бюджет D24 | приёмочная часть |

## API, на которые опираются проверки

Сверено с документацией 2026-10-02. Версия в скобках — с какой версии AE есть вызов.

- `TextDocument.characterRange()` (24.3), смешанное значение — `undefined`: <https://ae-scripting.docsforadobe.dev/text/characterrange/> — C08.
- `TextDocument.pointText`, `fontSize`: <https://ae-scripting.docsforadobe.dev/text/textdocument/> — C09, C20.
- `CompItem.renderer`, `motionBlur`, `getMotionGraphicsTemplateControllerName()` (16.1): <https://ae-scripting.docsforadobe.dev/item/compitem/> — C14, C30, C35.
- Идентификатор Classic 3D `ADBE Advanced 3d` — ответ сообщества, не документация: <https://community.adobe.com/t5/after-effects-discussions/is-it-possible-to-modify-render-engine-with-script/m-p/10498490> — C30.
- `MarkerValue.protectedRegion` (16.0): <https://ae-scripting.docsforadobe.dev/other/markervalue/> — C22.
- `Layer.startTime`, `stretch`: <https://ae-scripting.docsforadobe.dev/layer/layer/> — C26.
- `AVLayer.timeRemapEnabled`, `guideLayer`, `hasAudio`, `audioEnabled`, `motionBlur`: <https://ae-scripting.docsforadobe.dev/layer/avlayer/> — C26, C29, C34, C35.
- `Project.expressionEngine` (16.0), `usedFonts` (24.5): <https://ae-scripting.docsforadobe.dev/general/project/> — C32, C37.
- `FontObject.version`, `isSubstitute` (24.0): <https://ae-scripting.docsforadobe.dev/text/fontobject/> — C37.
- `app.effects`, `app.version`: <https://ae-scripting.docsforadobe.dev/general/application/> — C31, C40.
- `Property.expressionError`: <https://ae-scripting.docsforadobe.dev/property/property/> — C32.
- Match names обводки и прямоугольника: <https://ae-scripting.docsforadobe.dev/matchnames/layer/shapelayer/> — C43.
