# Доктор пакета: podcast

Собрано командой `node tools/dump/doctor.mjs --slug podcast` 2026-10-02 из `C:/CRBK/work/dumps/podcast` (проект `C:\CRBK\packs\podcast\podcast_relinked.aep`, AE 26.5x89); руками не править.

Карта перелинковки: `C:/CRBK/packs/podcast/relink-map.json`, записей 29.

Палитра: C:\Users\Глеб\Documents\Cloud.ru Preset plugin\brand\tokens.json.

| Проверка | Найдено |
|---|---|
| Пропавший футаж | 0 |
| Движок выражений | extendscript (устаревший); выражений 0, с ошибкой 0 |
| Не Classic 3D | 3 комп. |
| Имена в NFD | 2 |
| Безымянные слои / композиции | 25 / 3 |
| Звук в композициях | 15 слоёв |
| Частоты кадров | 25 fps × 47; не 25 fps: композиций 0, вложений с другой частотой 0, видеофутажа 0 |
| Цвета вне палитры | 7 (почти в палитре: 3) |
| Видимые опорные кадры | 14 (скрытых или guide: 1) |
| Футаж вне слотов | файлов 7, слоёв 19 |
| Удержания и стоп-кадры time remap | 1 слоёв |
| Отрицательное растяжение | 0 слоёв |

## Движок выражений

Проект: `extendscript`. Устаревший ExtendScript: шаблоны собираются под JavaScript и проверяются в обоих движках (§4.2).

## Не Classic 3D

Рендереры по композициям: `ADBE Advanced 3d` × 44, `ADBE Calder` × 3.

| Композиция | Рендерер | Слоёв 3D |
|---|---|---|
| Cloud.ru_BlackColour | Advanced 3D (`ADBE Calder`) | 0 |
| Cloud.ru_WhiteColour | Advanced 3D (`ADBE Calder`) | 0 |
| Подписывайся! Ссылки в описании | Advanced 3D (`ADBE Calder`) | 2 |

## Имена в NFD

| Где | Имя | Знаки | Контекст |
|---|---|---|---|
| карта перелинковки, было | 6_Podcast_Cloud.ru_Pack/(Footage)/SFX/Дисклеймер.wav | U+0306 | (Footage)/SFX/Дисклеймер.wav |
| карта перелинковки, было | 6_Podcast_Cloud.ru_Pack/(Footage)/SFX/Подписывайтесь на канал CLOUD.RU.wav | U+0306 | (Footage)/SFX/Подписывайтесь на канал CLOUD.RU.wav |

## Безымянные слои и композиции

| Композиция | Папка |
|---|---|
| Pre-comp 3 | Precomp |
| Pre-comp 4 | Precomp |
| Pre-comp 4 | Precomp |

| Композиция | # | Слой | Тип |
|---|---|---|---|
| Подпись_QR_1 | 2 | Shape Layer 1 | shape |
| Подпись_QR_1 | 2 | Shape Layer 1 | shape |
| Подпись_QR_2 | 2 | Shape Layer 1 | shape |
| Подпись_QR_2 | 2 | Shape Layer 1 | shape |
|   QR_3 | 2 | Shape Layer 1 | shape |
|   QR_3 | 3 | Shape Layer 1 | shape |
| Cloud.ru_BlackColour | 1 | Layer 3 Outlines | shape |
| Cloud.ru_BlackColour | 2 | Layer 4 Outlines | shape |
| Cloud.ru_WhiteColour | 1 | Layer 3 Outlines | shape |
| Cloud.ru_WhiteColour | 2 | Layer 4 Outlines | shape |
| Pattern_1 | 5 | Null 3 | null |
| Pattern_1 | 6 | Null 2 | null |
| Pattern_1 | 7 | Null 1 | null |
| Pattern_1 | 5 | Null 3 | null |
| Pattern_1 | 6 | Null 2 | null |
| Pattern_1 | 7 | Null 1 | null |
| Дисклеймер | 3 | Shape Layer 2 | shape |
| Дисклеймер | 4 | Shape Layer 1 | shape |
| Дисклеймер | 5 | Shape Layer 3 | shape |
| Дисклеймер | 6 | Shape Layer 4 | shape |
| Дисклеймер | 7 | Shape Layer 5 | shape |
| Дисклеймер | 21 | Light Gray Solid 4 | av |
| Заставка_ПОДКАСТ_CLOUD.RU | 33 | Light Gray Solid 4 | av |
| О_госте | 2 | Shape Layer 1 | shape |
| OUTRO | 3 | Dark Gray Solid 1 | av |

## Звук в композициях

| Композиция | Слой | Файл | Звук включён | Есть видео |
|---|---|---|---|---|
| Дисклеймер | Дисклеймер.wav | C:\CRBK\packs\podcast\(Footage)\SFX\Дисклеймер.wav | да | нет |
| Заставка_ПОДКАСТ_CLOUD.RU | Заставка_ПОДКАСТ_CLOUD.RU.wav | C:\CRBK\packs\podcast\(Footage)\SFX\Заставка_ПОДКАСТ_CLOUD.RU.wav | да | нет |
| Контент_1 | Контент_1.wav | C:\CRBK\packs\podcast\(Footage)\SFX\Контент_1.wav | да | нет |
| Контент_2 | Контент_2.wav | C:\CRBK\packs\podcast\(Footage)\SFX\Контент_2.wav | да | нет |
| Контент_3 | Контент_3.wav | C:\CRBK\packs\podcast\(Footage)\SFX\Контент_3.wav | да | нет |
| О_госте | О_госте.wav | C:\CRBK\packs\podcast\(Footage)\SFX\О_госте.wav | да | нет |
| Подписывайтесь на канал CLOUD.RU | Подписывайтесь на канал CLOUD.RU.wav | C:\CRBK\packs\podcast\(Footage)\SFX\Подписывайтесь на канал CLOUD.RU.wav | да | нет |
| Подпись_спикера_1 | Подпись_спикера_1.wav | C:\CRBK\packs\podcast\(Footage)\SFX\Подпись_спикера_1.wav | да | нет |
| Подпись_спикера_2 | Подпись_спикера_2.wav | C:\CRBK\packs\podcast\(Footage)\SFX\Подпись_спикера_1.wav | да | нет |
| Текст на плашке_1 | Текст на плашке_1.wav | C:\CRBK\packs\podcast\(Footage)\SFX\Текст на плашке_1.wav | да | нет |
| Текст на плашке_2 | Текст на плашке_2.wav | C:\CRBK\packs\podcast\(Footage)\SFX\Текст на плашке_2.wav | да | нет |
| Текст на плашке_3 | Текст на плашке_3.wav | C:\CRBK\packs\podcast\(Footage)\SFX\Текст на плашке_3.wav | да | нет |
| QR_код_1 | QR_код_1.wav | C:\CRBK\packs\podcast\(Footage)\SFX\QR_код_1.wav | да | нет |
| QR_код_2 | QR_код_2.wav | C:\CRBK\packs\podcast\(Footage)\SFX\QR_код_2.wav | да | нет |
| QR_код_3 | QR_код_3.wav | C:\CRBK\packs\podcast\(Footage)\SFX\QR_код_3.wav | да | нет |

## Частоты кадров

Композиции: 25 fps × 47. Канон D2 — 25 fps.

## Цвета

«≈» — ΔE2000 ≤ 2 к цвету палитры. Цвета эффектов, не менявшиеся с создания, пропущены: 0.

### Вне палитры

| Цвет | Ближайший | ΔE00 | Где | Видимых | Скрытых | Примеры |
|---|---|---|---|---|---|---|
| #FF0000 | #FF4517 | 5.33 | color, fill | 1598 | 267 | Есть где развернуться › умное облако 2; Есть где развернуться › Cloud.ru 2; Есть где развернуться › LOGO 2 |
| #000000 | #222222 | 8.03 | color, fill, stroke | 1343 | 85 | Есть где развернуться › умное облако 2; Есть где развернуться › Cloud.ru 2; Есть где развернуться › LOGO 2 |
| #FFFFBE | #CFF500 | 16.98 | color | 530 | 34 | Есть где развернуться › умное облако 2; Есть где развернуться › Cloud.ru 2; Есть где развернуться › LOGO 2 |
| #D3D3D3 | #F2F2F2 | 6.85 | fill, solid, stroke | 22 | 61 | Подкаст › Cube_2; Подпись_QR_1 › Shape Layer 1; Подпись_QR_2 › Shape Layer 1 |
| #2D2D2D | #222222 | 3.48 | fill | 1 | 0 | Cloud.ru_BlackColour › Layer 3 Outlines |
| #B3B3B3 | #C9D9F2 | 14.11 | text-fill | 1 | 0 | Дисклеймер › ВСЕ МНЕНИЯ И ВЫСКАЗЫВАНИЯ В ЭТОМ ВИДЕО ПРИНАДЛЕЖАТ ИСКЛЮЧИТЕЛЬНО НАШЕМУ ГОСТЮ, ВЫСТУПАЮЩЕМУ КАК ЧАСТНОЕ ЛИЦО. ВИДЕО НЕ СВЯЗАНО С КОМПАНИЕЙ И НЕ ОТРАЖАЕТ ЕЁ ОФИЦИАЛЬНУЮ ПОЗИЦИЮ. |
| #CECECE | #F2F2F2 | 8.04 | fill | 1 | 0 | Контент_3 › Контент |

### Почти в палитре

| Цвет | Ближайший | ΔE00 | Где | Видимых | Скрытых | Примеры |
|---|---|---|---|---|---|---|
| #FEFEFE | #FFFFFF | 0.2 | fill | 5 | 0 | Дисклеймер › Shape Layer 2; Дисклеймер › Shape Layer 1; Дисклеймер › Shape Layer 3 |
| #31D383 | #26D07C | 1.15 | fill | 2 | 0 | Cloud.ru_BlackColour › Layer 4 Outlines; Cloud.ru_WhiteColour › Layer 4 Outlines |
| #F8F8F8 | #F2F2F2 | 1.23 | fill | 1 | 0 | Cloud.ru_WhiteColour › Layer 3 Outlines |

Фоны композиций: #000000 × 47 (рендерятся только без альфы).

## Видимые опорные кадры

| Композиция | Слой | Файл |
|---|---|---|
| Дисклеймер | Still 2025-12-10 132207_1.2.1.png | C:\CRBK\packs\podcast\(Footage)\Still\Still 2025-12-10 132207_1.2.1.png |
| Контент_1 | Still 2025-12-10 132207_1.3.1.png | C:\CRBK\packs\podcast\(Footage)\Still\Still 2025-12-10 132207_1.3.1.png |
| Контент_2 | Still 2025-12-10 132207_1.1.1.png | C:\CRBK\packs\podcast\(Footage)\Still\Still 2025-12-10 132207_1.1.1.png |
| Контент_3 | Still 2025-12-10 132207_1.2.1.png | C:\CRBK\packs\podcast\(Footage)\Still\Still 2025-12-10 132207_1.2.1.png |
| О_госте | Still 2025-12-10 132207_1.1.1.png | C:\CRBK\packs\podcast\(Footage)\Still\Still 2025-12-10 132207_1.1.1.png |
| Подписывайтесь на канал CLOUD.RU | Still 2025-12-10 132207_1.2.1.png | C:\CRBK\packs\podcast\(Footage)\Still\Still 2025-12-10 132207_1.2.1.png |
| Подпись_спикера_1 | Still 2025-12-10 132207_1.3.1.png | C:\CRBK\packs\podcast\(Footage)\Still\Still 2025-12-10 132207_1.3.1.png |
| Подпись_спикера_2 | Still 2025-12-10 132207_1.1.1.png | C:\CRBK\packs\podcast\(Footage)\Still\Still 2025-12-10 132207_1.1.1.png |
| Текст на плашке_1 | Still 2025-12-10 132207_1.3.1.png | C:\CRBK\packs\podcast\(Footage)\Still\Still 2025-12-10 132207_1.3.1.png |
| Текст на плашке_2 | Still 2025-12-10 132207_1.1.1.png | C:\CRBK\packs\podcast\(Footage)\Still\Still 2025-12-10 132207_1.1.1.png |
| Текст на плашке_3 | Still 2025-12-10 132207_1.2.1.png | C:\CRBK\packs\podcast\(Footage)\Still\Still 2025-12-10 132207_1.2.1.png |
| QR_код_1 | Still 2025-12-10 132207_1.3.1.png | C:\CRBK\packs\podcast\(Footage)\Still\Still 2025-12-10 132207_1.3.1.png |
| QR_код_2 | Still 2025-12-10 132207_1.1.1.png | C:\CRBK\packs\podcast\(Footage)\Still\Still 2025-12-10 132207_1.1.1.png |
| QR_код_3 | Still 2025-12-10 132207_1.2.1.png | C:\CRBK\packs\podcast\(Footage)\Still\Still 2025-12-10 132207_1.2.1.png |

## Футаж вне слотов

Слоты — слои `SLOT_*` (контракт §4.2); guide-слои не считаются.

| Файл | Слоёв | Композиции |
|---|---|---|
| C:\CRBK\packs\podcast\(Footage)\Still\Still 2025-12-10 132207_1.2.1.png | 6 | Дисклеймер; Заставка_ПОДКАСТ_CLOUD.RU; Контент_3; Подписывайтесь на канал CLOUD.RU; Текст на плашке_3 и ещё 1 |
| C:\CRBK\packs\podcast\(Footage)\Still\Still 2025-12-10 132207_1.1.1.png | 5 | Контент_2; О_госте; Подпись_спикера_2; Текст на плашке_2; QR_код_2 |
| C:\CRBK\packs\podcast\(Footage)\Still\Still 2025-12-10 132207_1.3.1.png | 4 | Контент_1; Подпись_спикера_1; Текст на плашке_1; QR_код_1 |
| C:\CRBK\packs\podcast\(Footage)\QR\Балун.png | 1 |   QR_2 |
| C:\CRBK\packs\podcast\(Footage)\QR\ТК канал Cloud.ru.png | 1 |   QR_3 |
| C:\CRBK\packs\podcast\(Footage)\QR\QR Code_Тимур_1.png | 1 |   QR_1 |
| C:\CRBK\packs\podcast\(Footage)\QR\STRDUB.png | 1 |   QR_1 |

## Удержания time remap и отрицательное растяжение

| Композиция | Слой | Что |
|---|---|---|
| OUTRO | Есть где развернуться | один ключ: стоп-кадр 2.88 с |
