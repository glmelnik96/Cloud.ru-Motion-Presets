# Доктор пакета: webinars

Собрано командой `node tools/dump/doctor.mjs --slug webinars` 2026-10-02 из `C:/CRBK/work/dumps/webinars` (проект `C:\CRBK\packs\webinars\webinars_relinked.aep`, AE 26.5x89); руками не править.

Карта перелинковки: `C:/CRBK/packs/webinars/relink-map.json`, записей 7.

Палитра: C:\Users\Глеб\Documents\Cloud.ru Preset plugin\brand\tokens.json.

| Проверка | Найдено |
|---|---|
| Пропавший футаж | 0 |
| Движок выражений | extendscript (устаревший); выражений 9, с ошибкой 0 |
| Не Classic 3D | 0 комп. |
| Имена в NFD | 0 |
| Безымянные слои / композиции | 23 / 0 |
| Звук в композициях | 5 слоёв |
| Частоты кадров | 25 fps × 15; не 25 fps: композиций 0, вложений с другой частотой 0, видеофутажа 2 |
| Цвета вне палитры | 10 (почти в палитре: 3) |
| Видимые опорные кадры | 0 (скрытых или guide: 0) |
| Футаж вне слотов | файлов 4, слоёв 10 |
| Удержания и стоп-кадры time remap | 5 слоёв |
| Отрицательное растяжение | 2 слоёв |

## Движок выражений

Проект: `extendscript`. Устаревший ExtendScript: шаблоны собираются под JavaScript и проверяются в обоих движках (§4.2).

## Не Classic 3D

Рендереры по композициям: `ADBE Advanced 3d` × 15.

## Имена в NFD

Не найдено.

## Безымянные слои и композиции

| Композиция | # | Слой | Тип |
|---|---|---|---|
| Анонс_Вебинар_1x1 | 6 | Light Gray Solid 2 | av |
| Анонс_Вебинар_1x1 | 13 | Dark Gray Solid 2 | av |
| Анонс_Вебинар_9x16 | 16 | Dark Gray Solid 15 | av |
| Заставка с вижуалом | 2 | Layer 7 Outlines 2 | shape |
| Заставка с вижуалом | 4 | Shape Layer 1 | shape |
| Заставка с вижуалом | 9 | Dark Gray Solid 1 | av |
| Заставка со спикером | 2 | Layer 4 Outlines 4 | shape |
| Заставка со спикером | 3 | Layer 4 Outlines 3 | shape |
| Заставка со спикером | 4 | Layer 5 Outlines 2 | shape |
| Заставка со спикером | 10 | Layer 7 Outlines 2 | shape |
| Заставка со спикером | 14 | Dark Gray Solid 1 | av |
| Таймер с вижуалом | 3 | Shape Layer 2 | shape |
| Таймер с вижуалом | 10 | Layer 7 Outlines | shape |
| Таймер с вижуалом | 12 | Dark Gray Solid 1 | av |
| Таймер со спикером | 5 | Layer 7 Outlines 2 | shape |
| Таймер со спикером | 13 | Dark Gray Solid 1 | av |
| Логоблок с челкой | 3 | Shape Layer 4 | shape |
| Логоблок с челкой | 4 | Shape Layer 5 | shape |
| AI_анимация precomp | 3 | White Solid 1 | av |
| AI_анимация precomp_2 | 2 | Light Gray Solid 1 | av |
| Logo | 1 | Layer 3 Outlines 3 | shape |
| Logo | 2 | Layer 4 Outlines 3 | shape |
| PATTERN RACK_Animation | 3 | Dark Gray Solid 2 | av |

## Звук в композициях

| Композиция | Слой | Файл | Звук включён | Есть видео |
|---|---|---|---|---|
| Заставка с вижуалом | Music vebinar.mp3 | C:\CRBK\packs\webinars\(Footage)\Folder\Music\Music vebinar.mp3 | да | нет |
| Заставка со спикером | Music vebinar.mp3 | C:\CRBK\packs\webinars\(Footage)\Folder\Music\Music vebinar.mp3 | да | нет |
| Таймер с вижуалом | Музыка вебинар 5 минут.mp3 | C:\CRBK\packs\webinars\(Footage)\Folder\Music\Музыка вебинар 5 минут.mp3 | да | нет |
| Таймер с вижуалом | Музыка вебинар 5 минут.mp3 | C:\CRBK\packs\webinars\(Footage)\Folder\Music\Музыка вебинар 5 минут.mp3 | нет | нет |
| Таймер со спикером | Музыка вебинар 5 минут.mp3 | C:\CRBK\packs\webinars\(Footage)\Folder\Music\Музыка вебинар 5 минут.mp3 | да | нет |

## Частоты кадров

Композиции: 25 fps × 15. Канон D2 — 25 fps.

| Футаж | fps | Файл |
|---|---|---|
| AI_robot_arm_A_1440p24.mp4 | 24 | C:\CRBK\packs\webinars\(Footage)\Folder\Video\AI_robot_arm_A_1440p24.mp4 |
| AI_robot_arm_B_1440p24.mp4 | 24 | C:\CRBK\packs\webinars\(Footage)\Folder\Video\AI_robot_arm_B_1440p24.mp4 |

## Цвета

«≈» — ΔE2000 ≤ 2 к цвету палитры. Цвета эффектов, не менявшиеся с создания, пропущены: 9.

### Вне палитры

| Цвет | Ближайший | ΔE00 | Где | Видимых | Скрытых | Примеры |
|---|---|---|---|---|---|---|
| #FF0000 | #FF4517 | 5.33 | color, fill, stroke | 1492 | 99 | Анонс_Вебинар_1x1 › Logo; Анонс_Вебинар_1x1 › save zone; Анонс_Вебинар_1x1 › AI_анимация precomp_2 |
| #000000 | #222222 | 8.03 | color | 420 | 65 | Анонс_Вебинар_1x1 › Logo; Анонс_Вебинар_1x1 › save zone; Анонс_Вебинар_1x1 › AI_анимация precomp_2 |
| #FFFFBE | #CFF500 | 16.98 | color | 168 | 26 | Анонс_Вебинар_1x1 › Logo; Анонс_Вебинар_1x1 › save zone; Анонс_Вебинар_1x1 › AI_анимация precomp_2 |
| #C2C2C2 | #F2F2F2 | 11 | stroke, text-fill | 10 | 0 | Анонс_Вебинар_1x1 › Strelka 2; Анонс_Вебинар_1x1 › Strelka; Анонс_Вебинар_1x1 › Вебинар 2 |
| #8EE7BB | #18F4CF | 8.91 | fill | 4 | 0 | Заставка с вижуалом › PORTAL; Заставка со спикером › PORTAL; Таймер с вижуалом › PORTAL |
| #D4D4D4 | #F2F2F2 | 6.62 | solid | 2 | 0 | Анонс_Вебинар_1x1 › Light Gray Solid 2; AI_анимация precomp_2 › Light Gray Solid 1 |
| #6CDFA6 | #26D07C | 7.41 | fill | 1 | 1 | Анонс_Вебинар_9x16 › portal2; Анонс_Вебинар_9x16 › portal1 |
| #E5E4E5 | #F2F2F2 | 3.04 | solid | 1 | 0 | AI_анимация precomp › White Solid 1 |
| #2D2D2D | #222222 | 3.48 | fill | 0 | 4 | Заставка с вижуалом › Layer 7 Outlines 2; Заставка со спикером › Layer 7 Outlines 2; Таймер с вижуалом › Layer 7 Outlines |
| #FF7AD8 | #C067C0 | 12.27 | fill | 0 | 2 | Заставка с вижуалом › Shape Layer 1; Таймер с вижуалом › Shape Layer 2 |

### Почти в палитре

| Цвет | Ближайший | ΔE00 | Где | Видимых | Скрытых | Примеры |
|---|---|---|---|---|---|---|
| #ECECEC | #F2F2F2 | 1.26 | effect | 2 | 0 | Анонс_Вебинар_1x1 › Light Gray Solid 2; AI_анимация precomp_2 › Light Gray Solid 1 |
| #EEEEEE | #F2F2F2 | 0.84 | effect | 1 | 0 | AI_анимация precomp › White Solid 1 |
| #F8F8F8 | #F2F2F2 | 1.23 | fill | 1 | 0 | Logo › Layer 3 Outlines 3 |

Фоны композиций: #000000 × 15 (рендерятся только без альфы).

## Видимые опорные кадры

Не найдено.

## Футаж вне слотов

Слоты — слои `SLOT_*` (контракт §4.2); guide-слои не считаются.

| Файл | Слоёв | Композиции |
|---|---|---|
| C:\CRBK\packs\webinars\(Footage)\Folder\Img\Group 2131327780.png | 6 | Анонс_Вебинар_9x16; Заставка со спикером |
| C:\CRBK\packs\webinars\(Footage)\Folder\Video\AI_robot_arm_A_1440p24.mp4 | 2 | AI_анимация precomp_1; AI_анимация precomp_2 |
| C:\CRBK\packs\webinars\(Footage)\Folder\Img\Смирнов Илья_v1_20.03 1.png | 1 | Спикер |
| C:\CRBK\packs\webinars\(Footage)\Folder\Video\AI_robot_arm_B_1440p24.mp4 | 1 | AI_анимация precomp_1 |

## Удержания time remap и отрицательное растяжение

| Композиция | Слой | Что |
|---|---|---|
| Заставка с вижуалом | Логоблок с челкой | выражение: loopOut() |
| Заставка со спикером | Логоблок с челкой | выражение: loopOut() |
| Таймер с вижуалом | Логоблок с челкой | выражение: loopOut() |
| Таймер с вижуалом | CONTENT | выражение: loopOut() |
| Таймер со спикером | Логоблок с челкой | выражение: loopOut() |

| Композиция | Слой | Растяжение, % |
|---|---|---|
| Таймер с вижуалом | Timer precomp | -100 |
| Таймер со спикером | Timer precomp | -100 |
