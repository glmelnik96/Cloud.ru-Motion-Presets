# Эффекты, размытия и текстовые стили пакетов (по JSX-дампам)

Пакеты: courses, courses_conv, logo, logo_conv, podcast, smm, titles, titles_conv, webinars.

## Эффекты

| matchName | Имена | Раз | Пакеты |
|---|---|---|---|
| ADBE Fill | Fill | 37 | logo 2, logo_conv 2, podcast 19, smm 2, webinars 12 |
| ADBE Box Blur2 | Fast Box Blur | 13 | podcast 13 |
| ADBE Fractal Noise | Fractal Noise | 4 | smm 3, webinars 1 |
| ADBE Slider Control | Scale From, Scale To, hitbox Inside, hitbox Outside | 4 | smm 4 |
| CC RepeTile | CC RepeTile | 2 | smm 2 |
| CC Threshold RGB | CC Threshold RGB | 1 | smm 1 |
| CS Vignette | CC Vignette | 1 | smm 1 |
| ADBE Lumetri | Lumetri Color | 1 | webinars 1 |

## Размытия — 13

| Пакет / композиция / слой | Эффект | Корр. слой | Параметры |
|---|---|---|---|
| podcast / Контент_1 / Blur | Fast Box Blur | да | Blur Radius: 15; Iterations: 3; Blur Dimensions: 1; Repeat Edge Pixels: 1; Compositing Options / Effect Opacity: 100 |
| podcast / Контент_2 / Blur | Fast Box Blur | да | Blur Radius: 15; Iterations: 3; Blur Dimensions: 1; Repeat Edge Pixels: 1; Compositing Options / Effect Opacity: 100 |
| podcast / Контент_3 / Blur | Fast Box Blur | да | Blur Radius: 15; Iterations: 3; Blur Dimensions: 1; Repeat Edge Pixels: 1; Compositing Options / Effect Opacity: 100 |
| podcast / О_госте / Blur | Fast Box Blur | да | Blur Radius: 15; Iterations: 3; Blur Dimensions: 1; Repeat Edge Pixels: 1; Compositing Options / Effect Opacity: 100 |
| podcast / Подписывайтесь на канал CLOUD.RU / Blur | Fast Box Blur | да | Blur Radius: 15; Iterations: 3; Blur Dimensions: 1; Repeat Edge Pixels: 1; Compositing Options / Effect Opacity: 100 |
| podcast / Подпись_спикера_1 / Blur | Fast Box Blur | да | Blur Radius: 15; Iterations: 3; Blur Dimensions: 1; Repeat Edge Pixels: 1; Compositing Options / Effect Opacity: 100 |
| podcast / Подпись_спикера_2 / Blur | Fast Box Blur | да | Blur Radius: 15; Iterations: 3; Blur Dimensions: 1; Repeat Edge Pixels: 1; Compositing Options / Effect Opacity: 100 |
| podcast / Текст на плашке_1 / Blur | Fast Box Blur | да | Blur Radius: 15; Iterations: 3; Blur Dimensions: 1; Repeat Edge Pixels: 1; Compositing Options / Effect Opacity: 100 |
| podcast / Текст на плашке_2 / Blur | Fast Box Blur | да | Blur Radius: 15; Iterations: 3; Blur Dimensions: 1; Repeat Edge Pixels: 1; Compositing Options / Effect Opacity: 100 |
| podcast / Текст на плашке_3 / Blur | Fast Box Blur | да | Blur Radius: 15; Iterations: 3; Blur Dimensions: 1; Repeat Edge Pixels: 1; Compositing Options / Effect Opacity: 100 |
| podcast / QR_код_1 / Blur | Fast Box Blur | да | Blur Radius: 15; Iterations: 3; Blur Dimensions: 1; Repeat Edge Pixels: 1; Compositing Options / Effect Opacity: 100 |
| podcast / QR_код_2 / Blur | Fast Box Blur | да | Blur Radius: 15; Iterations: 3; Blur Dimensions: 1; Repeat Edge Pixels: 1; Compositing Options / Effect Opacity: 100 |
| podcast / QR_код_3 / Blur | Fast Box Blur | да | Blur Radius: 15; Iterations: 3; Blur Dimensions: 1; Repeat Edge Pixels: 1; Compositing Options / Effect Opacity: 100 |

## Текстовые стили — 34

| Шрифт | Кегль | Трекинг | Интерлиньяж | Заливка | Обводка | Caps | Раз | Где |
|---|---|---|---|---|---|---|---|---|
| SBSansDisplay-Regular | 125 | -16 | 132.9 | 255,255,255 | — |  | 15 | courses / Обложка #1 / третья последняя: третья последняя; courses / Обложка #1 / вторая строчка: вторая строчка; courses / Обложка #1 / Первая строчка: Первая строчка; courses / Обложка #2 / третья последняя: третья последняя |
| SBSansDisplay-Bold | 100 | -28 | 100 | 34,34,34 | — | да | 14 | podcast / Булит_1 / Text_2: Это лучший пользователь ИИ; podcast / Булит_1 / Text_1: Лучший разработчик будущего; podcast / Контент_3 / Text_3: И тут, и так далее; podcast / Контент_3 / Text_2: Затем появляется тут |
| SBSansDisplay-Bold | 190 | -28 | 190 | 34,34,34 | — |  | 10 | podcast / Подкаст / ПОДКАСТ:  ПОДКАСТ; podcast / Подкаст / ПОДКАСТ:  ПОДКАСТ; podcast / Cloud.ru / CLOUD.RU: CLOUD.RU; podcast / Cloud.ru / CLOUD.RU: CLOUD.RU |
| SBSansDisplay-Semibold | 39.6 | -18 | 41 | 255,255,255 | — |  | 8 | courses / Обложка #1 / облачные и ИИ-сервисы: облачные и ИИ-сервисы; courses / Обложка #2 / облачные и ИИ-сервисы: облачные и ИИ-сервисы; courses / Обложка #3 / облачные и ИИ-сервисы: облачные и ИИ-сервисы; courses_conv / Обложка #2 / облачные и ИИ-сервисы: облачные и ИИ-сервисы |
| SBSansText-Regular | 35 | -32 | 36.8 | 255,255,255 | — |  | 8 | courses / Оверлей 3 на 2 / SUBTITLES_1 строка: Пишем текстр, много текста, ооочень мног; courses / Оверлей 3 на 2 / SUBTITLES_2 строка: Ававававававава; courses / Оверлей 16 на 9 / SUBTITLES_1 строка: Пишем текстр, много текста, ооочень мног; courses / Оверлей 16 на 9 / SUBTITLES_2 строка: 2 слова |
| SBSansDisplay-Semibold | 100 | -50 | 89 | 207,245,0 | — |  | 8 | smm / Плашки_1x1 /  Cloud.ru Evolution:  Cloud.ru Evolution; smm / Плашки_1x1 / На виртуальной машине: На виртуальной машине; smm / Плашки_1x1 /  блог на Word Press:  блог на Word Press; smm / Плашки_1x1 / Разверните свой личный: Разверните свой личный |
| SBSansDisplay-Regular | 125 | -16 | 132.9 | 34,34,34 | — |  | 6 | courses / Обложка #3 / третья последняя 2: третья последняя; courses / Обложка #3 / вторая строчка 3: вторая строчка; courses / Обложка #3 / Первая строчка 3: Первая строчка; courses_conv / Обложка #3 / третья последняя 2: третья последняя |
| SBSansDisplay-Regular | 30 | 5 | 48 | 204,204,204 | — |  | 5 | courses / Обложка #1 / Cloud.ru Advanced : Cloud.ru Advanced; courses / Обложка #2 / Cloud.ru Advanced 2: Cloud.ru Advanced; courses_conv / Обложка #2 / Cloud.ru Advanced 2: Cloud.ru Advanced; courses_conv / Pre-comp 3 / Cloud.ru: Cloud.ru |
| SBSansDisplay-Semibold | 60 | 0 | 60 | 34,34,34 | — |  | 5 | smm / Заставка_9x16 / сотрудников?: сотрудников?; smm / Заставка_9x16 / под обучение: под обучение; smm / Заставка_9x16 / Telegram-бота с AI: Telegram-бота с AI; smm / Заставка_9x16 / Как быстро создать : Как быстро создать |
| SBSansDisplay-Bold | 190 | -34 | 190 | 34,34,34 | — |  | 4 | podcast / Заставка_ПОДКАСТ_CLOUD.RU / ПОДКАСТ 2:  ПОДКАСТ; podcast / Заставка_ПОДКАСТ_CLOUD.RU / ПОДКАСТ:  ПОДКАСТ; podcast / Заставка_ПОДКАСТ_CLOUD.RU / CLOUD.RU 2: CLOUD.RU; podcast / Заставка_ПОДКАСТ_CLOUD.RU / CLOUD.RU: CLOUD.RU |
| SBSansText-Regular | 40 | 0 | 45 | 255,255,255 | — |  | 4 | titles / Подпись_спикеров / Александр Стародубцев 2: Александр Стародубцев; titles / Подпись_спикеров / Александр Стародубцев: Александр Стародубцев; titles_conv / Pre-comp 1 / Никита Грехов: Никита Грехов; titles_conv / Pre-comp 2 / Роман Путилов: Роман Путилов |
| SBSansText-Regular | 40 | 0 | 35 | 255,255,255 | — |  | 4 | titles / Подпись_спикеров /  Технический лидер Cloud.ru 2:  Технический лидер Cloud.ru; titles / Подпись_спикеров /  Технический лидер Cloud.ru:  Технический лидер Cloud.ru; titles_conv / Pre-comp 1 /  Руководитель направления по работе с партнерами:  Руководитель направления по работе с па; titles_conv / Pre-comp 2 /  Руководитель направления позиционирования продукта:  Руководитель направления позиционирован |
| SBSansDisplay-Regular | 60 | 0 | 67 | 34,34,34 | — |  | 4 | webinars / Заставка с вижуалом / Чек-лист от юриста: как выбрать безопасное облако: Чек-лист от юриста: как выбрать безопасн; webinars / Заставка со спикером / Собираем корпоративный AI-чат: от выбора модели до работающего прототипа: Собираем корпоративный AI-чат: от выбора; webinars / Таймер с вижуалом / Чек-лист от юриста: как выбрать безопасное облако: Чек-лист от юриста: как выбрать безопасн; webinars / Таймер со спикером / Собираем корпоративный AI-чат: от выбора модели до работающего прототипа: Собираем корпоративный AI-чат: от выбора |
| SBSansDisplay-Bold | 100 | -28 | 100 | 34,34,34 | — |  | 3 | podcast / Подпись_QR_1 / @STRDUB: @STRDUB; podcast / Подпись_QR_1 / @STRDUB: @STRDUB; podcast / Подпись_QR_2 / @ULBI_TV: @ULBI_TV |
| SBSansDisplay-Regular | 30 | 5 | 48 | 34,34,34 | — |  | 2 | courses / Обложка #3 / Cloud.ru Advanced 3: Cloud.ru Advanced; courses_conv / Обложка #3 / Cloud.ru Advanced 3: Cloud.ru Advanced |
| SBSansDisplay-Semibold | 30.7 | 8 | 31.4 | 255,255,255 | — |  | 2 | logo / Логошоты вертикальный_Умное облако / облачные и ИИ-сервисы: облачные и ИИ-сервисы; logo_conv / Логошоты вертикальный_Умное облако / облачные и ИИ-сервисы: облачные и ИИ-сервисы |
| SBSansDisplay-Semibold | 30.7 | 8 | 31.4 | 255,255,255 | — |  | 2 | logo / Логошоты вертикальный_Умное облако_запасной вариант / облачные и ИИ-сервисы: облачные и ИИ-сервисы; logo_conv / Логошоты вертикальный_Умное облако_запасной вариант / облачные и ИИ-сервисы: облачные и ИИ-сервисы |
| SBSansDisplay-Semibold | 100 | 0 | 39 | 34,34,34 | — |  | 2 | logo / Умное облако / облачные и ИИ-сервисы: облачные и ИИ-сервисы; logo_conv / Умное облако / облачные и ИИ-сервисы: облачные и ИИ-сервисы |
| SBSansDisplay-Bold | 91.2 | -28 | 100 | 34,34,34 | — |  | 2 | podcast /   QR_3 / @CLOUDRUPROVIDER: @CLOUDRUPROVIDER; podcast /   QR_3 / @CLOUDRUPROVIDER: @CLOUDRUPROVIDER |
| SBSansDisplay-Bold | 100 | -28 | 100 | 34,34,34 | — | да | 2 | podcast / Булит / Text_2: Перестанет быть нужным; podcast / Булит / Text_1: Через несколько лет знание синтаксиса |
| SBSansDisplay-Semibold | 97.8 | -10 | 95 | 34,34,34 | — | да | 2 | podcast / Подпись_спикера_1 / Технический лидер CLOUd.ru: Технический лидер CLOUd.ru; podcast / Подпись_спикера_2 / Основатель balun.Courses: Основатель balun.Courses |
| SBSansDisplay-Bold | 180 | -33 | 95 | 34,34,34 | — | да | 2 | podcast / Подпись_спикера_1 / Surname: Александр Стародубцев; podcast / Подпись_спикера_2 /  Name/Surname: Владимир Балун |
| SBSansDisplay-Regular | 60 | 0 | 95 | 38,208,124 | — |  | 2 | webinars / Анонс_Вебинар_1x1 / 25 ноября в 11:00: 25 ноября в 11:00; webinars / Анонс_Вебинар_9x16 / 25.11 в 11:00: 25.11 в 11:00 |
| SBSansDisplay-Regular | 60 | 0 | 95 | 194,194,194 | — |  | 2 | webinars / Анонс_Вебинар_1x1 / Вебинар 2: Вебинар; webinars / Анонс_Вебинар_9x16 / Вебинар 3: Вебинар |
| SBSansDisplay-Regular | 35 | 19 | 47 | 255,255,255 | — |  | 2 | webinars / Заставка со спикером / Александр Константинов, Технический эксперт по облачным технологиям 2: Александр Константинов, Технический эксп; webinars / Таймер со спикером / Александр Константинов, Технический эксперт по облачным технологиям: Александр Константинов, Технический эксп |
| SBSansDisplay-Bold | 100 | -28 | 100 | 34,34,34 | — |  | 1 | podcast / Подпись_QR_2 / @VLADIMIR_BALUN_PROGRAMMING: @VLADIMIR_BALUN_PROGRAMMING |
| SBSansDisplay-Bold | 40 | -24 | 47 | 179,179,179 | — |  | 1 | podcast / Дисклеймер / ВСЕ МНЕНИЯ И ВЫСКАЗЫВАНИЯ В ЭТОМ ВИДЕО ПРИНАДЛЕЖАТ ИСКЛЮЧИТЕЛЬНО НАШЕМУ ГОСТЮ, ВЫСТУПАЮЩЕМУ КАК ЧАСТНОЕ ЛИЦО. ВИДЕО НЕ СВЯЗАНО С КОМПАНИЕЙ И НЕ ОТРАЖАЕТ ЕЁ ОФИЦИАЛЬНУЮ ПОЗИЦИЮ.: ВСЕ МНЕНИЯ И ВЫСКАЗЫВАНИЯ В ЭТОМ ВИДЕО П |
| SBSansDisplay-Bold | 53 | -22 | 47 | 34,34,34 | — |  | 1 | podcast / Дисклеймер / ДИСКЛЕЙМЕР: ДИСКЛЕЙМЕР |
| SBSansDisplay-Semibold | 70 | -10 | 75 | 34,34,34 | — |  | 1 | podcast / О_госте / Владимир Балун -  Основатель Balun. Courses  - Руководил инфраструктурной командой в Яндексе по разработке системы трейсинга (11ГБ/с трафик) - Разрабатывал системы трейсинга (7ГБ/с трафик) и непрерывного профилирования в Ozon, корпоративный мессенджер в Mail.ru и высоконагруженные сервисы рекламной платформы в Тинькофф. - Сейчас занимается развитием своих проектов it-interview.io и balun.courses: Владимир Балун - Основатель Balun. Cours |
| SBSansDisplay-Regular | 83.3 | 0 | 95 | 255,255,255 | — |  | 1 | webinars / Анонс_Вебинар_1x1 / Чек-лист от юриста: как выбрать безопасное облако: Чек-лист от юриста: как выбрать безопасн |
| SBSansDisplay-Regular | 70 | 16 | 79 | 34,34,34 | — |  | 1 | webinars / Анонс_Вебинар_9x16 / Чек-лист от юриста: как выбрать безопасное облако: Чек-лист от юриста: как выбрать безопасн |
| SBSansDisplay-Regular | 39.6 | 0 | auto | 34,34,34 | — |  | 1 | webinars / Таймер с вижуалом / начало через: начало через |
| SBSansDisplay-Regular | 35 | 0 | auto | 34,34,34 | — |  | 1 | webinars / Таймер со спикером / начало через: начало через |
| SBSansDisplay-Regular | 155 | 0 | auto | 34,34,34 | — |  | 1 | webinars / Timer precomp / TIMER: 0:00 |

## Шрифты по пакетам

- courses: SBSansDisplay-Regular, SBSansDisplay-Semibold, SBSansText-Regular
- courses_conv: SBSansDisplay-Regular, SBSansDisplay-Semibold, SBSansText-Regular
- logo: SBSansDisplay-Semibold
- logo_conv: SBSansDisplay-Semibold
- podcast: SBSansDisplay-Regular, SBSansDisplay-Semibold, SBSansDisplay-Bold
- smm: SBSansDisplay-Semibold
- titles: SBSansText-Regular
- titles_conv: SBSansText-Regular
- webinars: SBSansDisplay-Regular, SBSansDisplay-Semibold
