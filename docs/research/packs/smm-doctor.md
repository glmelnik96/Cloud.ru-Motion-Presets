# Доктор пакета: smm

Собрано командой `node tools/dump/doctor.mjs --slug smm` 2026-10-02 из `C:/CRBK/work/dumps/smm` (проект `C:\CRBK\packs\smm\smm_relinked.aep`, AE 26.5x89); руками не править.

Карта перелинковки: `C:/CRBK/packs/smm/relink-map.json`, записей 3.

Палитра: C:\Users\Глеб\Documents\Cloud.ru Preset plugin\brand\tokens.json.

| Проверка | Найдено |
|---|---|
| Пропавший футаж | 0 |
| Движок выражений | extendscript (устаревший); выражений 397, с ошибкой 0 |
| Не Classic 3D | 5 комп. |
| Имена в NFD | 0 |
| Безымянные слои / композиции | 16 / 0 |
| Звук в композициях | 1 слоёв |
| Частоты кадров | 24 fps × 8, 25 fps × 13; не 25 fps: композиций 8, вложений с другой частотой 0, видеофутажа 1 |
| Цвета вне палитры | 3 (почти в палитре: 2) |
| Видимые опорные кадры | 0 (скрытых или guide: 0) |
| Футаж вне слотов | файлов 2, слоёв 3 |
| Удержания и стоп-кадры time remap | 2 слоёв |
| Отрицательное растяжение | 0 слоёв |

## Движок выражений

Проект: `extendscript`. Устаревший ExtendScript: шаблоны собираются под JavaScript и проверяются в обоих движках (§4.2).

## Не Classic 3D

Рендереры по композициям: `ADBE Advanced 3d` × 16, `ADBE Calder` × 5.

| Композиция | Рендерер | Слоёв 3D |
|---|---|---|
| BG_pattern_1x1_1 | Advanced 3D (`ADBE Calder`) | 0 |
| BG_pattern_1x1_2 | Advanced 3D (`ADBE Calder`) | 0 |
| Плашки_9x16 | Advanced 3D (`ADBE Calder`) | 0 |
| Оверлей_1x1 | Advanced 3D (`ADBE Calder`) | 0 |
| Shape Layer 5 Comp 1 | Advanced 3D (`ADBE Calder`) | 0 |

## Имена в NFD

Не найдено.

## Безымянные слои и композиции

| Композиция | # | Слой | Тип |
|---|---|---|---|
| Заставка_9x16 | 12 | Dark Gray Solid 3 | av |
| BG_pattern_1x1_2 | 1 | Dark Gray Solid 5 | av |
| BG_pattern_9x16_2 | 1 | Dark Gray Solid 6 | av |
| Плашки_1x1 | 5 | Shape Layer 3 | shape |
| Плашки_1x1 | 6 | Shape Layer 4 | shape |
| Плашки_9x16 | 5 | Shape Layer 7 | shape |
| Плашки_9x16 | 6 | Shape Layer 6 | shape |
| Cloud.ru_BlackMono | 1 | Layer 3 Outlines | shape |
| Cloud.ru_BlackMono | 2 | Layer 4 Outlines | shape |
| Cloud.ru_BlackMono 3 | 1 | Layer 3 Outlines | shape |
| Cloud.ru_BlackMono 3 | 2 | Layer 4 Outlines | shape |
| Pattern_strelki | 4 | White Solid 3 | av |
| PATTERN_EDIT | 2 | Adjustment Layer 1 | adjustment |
| PATTERN_EDIT | 3 | Null 1 | null |
| Shape Layer 2 Comp 1 | 1 | Shape Layer 2 | shape |
| Shape Layer 5 Comp 1 | 1 | Shape Layer 5 | shape |

## Звук в композициях

| Композиция | Слой | Файл | Звук включён | Есть видео |
|---|---|---|---|---|
| Заставка_9x16 | kling_20250925_Image_to_Video_camera_orb_2946_1.mp4 | C:\CRBK\packs\smm\(Footage)\Folder\Video\kling_20250925_Image_to_Video_camera_orb_2946_1.mp4 | нет | да |

## Частоты кадров

Композиции: 24 fps × 8, 25 fps × 13. Канон D2 — 25 fps.

| Композиция | fps |
|---|---|
| Заставка_9x16 | 24 |
| Transition with Logo | 24 |
| Transition_gray | 24 |
| Transition_green | 24 |
| Transition_white | 24 |
| Cloud.ru_BlackMono | 24 |
| Cloud.ru_BlackMono 3 | 24 |
| Pattern_strelki | 24 |

| Футаж | fps | Файл |
|---|---|---|
| kling_20250925_Image_to_Video_camera_orb_2946_1.mp4 | 24 | C:\CRBK\packs\smm\(Footage)\Folder\Video\kling_20250925_Image_to_Video_camera_orb_2946_1.mp4 |

## Цвета

«≈» — ΔE2000 ≤ 2 к цвету палитры. Цвета эффектов, не менявшиеся с создания, пропущены: 0.

### Вне палитры

| Цвет | Ближайший | ΔE00 | Где | Видимых | Скрытых | Примеры |
|---|---|---|---|---|---|---|
| #000000 | #222222 | 8.03 | color, stroke | 2177 | 89 | Заставка_9x16 › Cloud.ru_BlackMono; Заставка_9x16 › Transition_gray; Заставка_9x16 › сотрудников? |
| #FF0000 | #FF4517 | 5.33 | color | 1146 | 72 | Заставка_9x16 › Cloud.ru_BlackMono; Заставка_9x16 › Transition_gray; Заставка_9x16 › сотрудников? |
| #FFFFBE | #CFF500 | 16.98 | color | 866 | 34 | Заставка_9x16 › Cloud.ru_BlackMono; Заставка_9x16 › Transition_gray; Заставка_9x16 › сотрудников? |

### Почти в палитре

| Цвет | Ближайший | ΔE00 | Где | Видимых | Скрытых | Примеры |
|---|---|---|---|---|---|---|
| #FCFCFC | #FFFFFF | 0.6 | solid | 1 | 0 | Pattern_strelki › White Solid 3 |
| #FEFEFE | #FFFFFF | 0.2 | fill | 0 | 1 | Заставка_9x16 › Green_cube_2 |

Фоны композиций: #000000 × 21 (рендерятся только без альфы).

## Видимые опорные кадры

Не найдено.

## Футаж вне слотов

Слоты — слои `SLOT_*` (контракт §4.2); guide-слои не считаются.

| Файл | Слоёв | Композиции |
|---|---|---|
| C:\CRBK\packs\smm\(Footage)\Folder\Solids\Rectangle 34627972.png | 2 | Pattern_strelki |
| C:\CRBK\packs\smm\(Footage)\Folder\Video\kling_20250925_Image_to_Video_camera_orb_2946_1.mp4 | 1 | Заставка_9x16 |

## Удержания time remap и отрицательное растяжение

| Композиция | Слой | Что |
|---|---|---|
| Оверлей_1x1 | Shape Layer 5 Comp 1 | выражение: loopOut() |
| Оверлей_9x16 | Shape Layer 2 Comp 1 | выражение: loopOut() |
