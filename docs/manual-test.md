# Manual Test — Cloud.ru Motion Presets

> Тесты проверяют техническую работоспособность панели: keyframes ставятся, слои создаются, undo откатывает за один шаг, лог корректен.

---

## Подготовка

1. Открыть After Effects
2. Создать композицию 1920×1080, 10 сек, CTI на 0
3. `Window → Extensions → Cloud.ru Motion Presets`
4. Шрифты SBSansDisplay-Semibold, SBSansText-Regular (если нет — тест 14 проверяет fallback)

---

## Motion Presets

### 1. Dropdown переключение пресета

**Действие:** Открыть dropdown Motion Presets, выбирать варианты
**Ожидание:** Подпись Strength меняется:
- Fade In/Out → поле disabled
- Pop In/Out → "Intensity", дефолт 1
- Slide Left/Right/Up/Down → "Amplitude (px)", дефолт 120

### 2. Apply без выделенного слоя

**Действие:** Снять выделение со слоёв, нажать Apply preset
**Ожидание:** В Tool Log запись `error` с текстом "Select at least one layer in the active composition."

### 3. Fade In

**Действие:** Создать solid, выделить, dropdown=Fade In, duration=0.45, delay=0, Apply
**Ожидание:** На Opacity 2 keyframes (0→100). Cmd+Z откатывает за один шаг.

### 4. Pop In

**Действие:** Solid, dropdown=Pop In, duration=0.6, intensity=1.2, Apply
**Ожидание:** На Scale keyframes с overshoot, на Opacity 0→100. Undo откатывает.

### 5. Slide Left

**Действие:** Solid, dropdown=Slide Left, duration=0.5, amplitude=200, Apply
**Ожидание:** На Position 2 keyframes (стартовая позиция смещена влево на 200px), на Opacity 0→100. Undo откатывает.

### 6. Apply на нескольких выделенных слоях

**Действие:** Выделить 3 слоя, Apply preset
**Ожидание:** Keyframes ставятся на все три. В Tool Log: `Applied: 3 ok, 0 failed`. Undo откатывает все три за один цикл (kept в одной undo group для каждого слоя; Footer Undo вызовет столько раз, сколько было успешных применений).

---

## Brand Presets

### 7. Brand dropdown переключение полей

**Действие:** Открыть Brand dropdown
**Ожидание:**
- Logo Reveal: скрыто Name, показан Subline, duration=2.2
- Lower Third: Name + Title, duration=5
- Text Card: Line 1 + Line 2, duration=7

### 8. Apply без открытой композиции

**Действие:** Закрыть все композиции, нажать Apply (brand)
**Ожидание:** В Tool Log запись `error`, панель стабильна.

### 9. Logo Reveal — дефолт

**Действие:** Apply Logo Reveal (duration=2.2, без subline)
**Ожидание:** Создаётся 3+ слоёв: контроллер null (opacity=0), shape с иконкой Cloud.ru, текст "Cloud.ru". Все parented к null. Icon: Position 4 keyframes (overshoot), Scale 4 keyframes, Opacity 0→100.

### 10. Logo Reveal с subline

**Действие:** Ввести текст в поле Subline, Apply
**Ожидание:** +слой Subline с fade+slide-in после logo. Parented к null.

### 11. Lower Third

**Действие:** Apply Lower Third (name="Иван Иванов", title="Директор", duration=5)
**Ожидание:** 7 слоёв: null + 2 dark bars + flash bars + name + title. Bars растут от левого края. Bar 2 stagger 240ms. Текст inPoint: name +240ms, title +560ms.

### 12. Text Card — 2 строки

**Действие:** Apply Text Card (line1="Облачные", line2="Технологии", duration=7)
**Ожидание:** 4 слоя: null + bar + 2 строки. fontSize=100, цвет Brand Light Green [0.812, 0.961, 0]. Bar scaleX: 0→102→hold→0.

### 13. Undo brand preset

**Действие:** После любого brand preset — нажать Undo в footer
**Ожидание:** Все слои brand preset удалены одним undo.

---

## Edge Cases

### 14. Без шрифтов SB Sans

**Действие:** Apply brand preset без установленных SB Sans
**Ожидание:** Текст создаётся с fallback шрифтом, без ошибок.

### 15. CTI у конца композиции

**Действие:** CTI=8s в 10-секундной композиции, Apply motion preset
**Ожидание:** Keyframes выходят за duration. Анимация создаётся, ошибок нет.

### 16. Parent Null — Scale через контроллер

**Действие:** Создать любой brand preset, выбрать null, Scale → [150,150]
**Ожидание:** Все дочерние элементы масштабируются пропорционально.

### 17. Tool Log пагинация

**Действие:** Применить >100 пресетов подряд
**Ожидание:** В логе видны последние ~100 записей, прокрутка работает, панель стабильна.

### 18. Clear log

**Действие:** В footer нажать Clear
**Ожидание:** Лог очищен, состояние пресетов и полей не затронуто.

---

## Subtitles (Cloud.ru Whisper)

Подготовка: `cp client/fm-secrets.example.js client/fm-secrets.local.js` и заполнить `apiKey`. Должен быть установлен ffmpeg.

### 19. Apply без выделения слоя

**Действие:** Снять выделение, нажать Transcribe & create
**Ожидание:** В Tool Log запись `error` с текстом про необходимость выделить аудио или видео слой.

### 20. Apply без apiKey

**Действие:** Очистить `apiKey` в fm-secrets.local.js, перезагрузить панель, выделить слой, Apply
**Ожидание:** Tool Log error: "API ключ не задан в client/fm-secrets.local.js". Никаких сетевых вызовов.

### 21. Apply без ffmpeg

**Действие:** Удалить ffmpeg из PATH (или переименовать), Apply
**Ожидание:** Tool Log error с подсказкой `brew install ffmpeg`.

### 22. Транскрибация короткого аудио

**Действие:** Импортировать в проект 30-секундный mp3 с речью на русском, добавить в композицию, выделить слой, Apply (lang=ru, animation=fade)
**Ожидание:**
- Прогресс показывает: "Извлечение аудио" → "Транскрибация: 1/1 готово" → "Создаю N текстовых слоёв"
- В композиции появляется null `Subtitles Controller` (метка зелёная) + N text-слоёв `Sub 1`, `Sub 2`, …
- inPoint / outPoint каждого слоя совпадают с речевыми сегментами
- Текст центрирован, fillColor=белый, fontSize=64
- На opacity 4 keyframes (fade in/out)
- Все text-слои паренятся к Subtitles Controller

### 23. Транскрибация длинного видео (parallel chunks)

**Действие:** Импортировать .mp4 длиной 5+ минут, выделить, Apply
**Ожидание:**
- Прогресс: "Транскрибация: отправляю N фрагментов параллельно (×20)"
- Чанки 90с создаются ffmpeg-ом и параллельно шлются в Cloud.ru
- Время ≪ длительности файла (~30s на 5-минутное видео при стабильной сети)
- Все cues корректно расположены на таймлайне (sort + dedup)

### 24. Длинный сегмент режется по max chars

**Действие:** Whisper-сегмент на 100+ символов с max_chars=42
**Ожидание:** Сегмент разбит на 2-3 cues по словам, каждый ≤42 символа, длительности пропорционально распределены, между cues нет overlap

### 25. Animation: char_reveal

**Действие:** Apply с animation=Char reveal
**Ожидание:** На каждом text-слое создан Range Selector с keyframes Start 0→100, символы появляются слева направо

### 26. Animation: none

**Действие:** Apply с animation=None
**Ожидание:** Text-слои без opacity-keyframes и без Range Selector. Видимость задаётся inPoint/outPoint.

### 27. Cancel mid-flight

**Действие:** Запустить транскрибацию длинного видео, через 2-3 секунды нажать Cancel
**Ожидание:** Tool Log warn "Прервано пользователем", UI разблокирован, текущие in-flight HTTP-запросы прерваны через AbortController

### 28. Слой без файлового source

**Действие:** Создать solid или text layer (не AVLayer), выделить, Apply
**Ожидание:** Tool Log error: "Слой не AVLayer …" или "У footage нет файла на диске".

### 29. Кириллица в транскрипции

**Действие:** Транскрибировать русскоязычный аудио (lang=ru)
**Ожидание:** Кириллица корректно отображается в text-слое (без вопросов или зашифрованных байтов)

### 30. Undo всего импорта

**Действие:** После создания N субтитров — нажать Undo в footer
**Ожидание:** Все N + 1 (контроллер) слои удалены за один Cmd+Z цикл

---

## Результаты

| # | Тест | Статус | Заметки |
|---|------|--------|---------|
| 1 | Motion dropdown переключение | | |
| 2 | Apply без выделения | | |
| 3 | Fade In | | |
| 4 | Pop In | | |
| 5 | Slide Left | | |
| 6 | Apply multi-select | | |
| 7 | Brand dropdown переключение | | |
| 8 | Apply без композиции | | |
| 9 | Logo Reveal дефолт | | |
| 10 | Logo Reveal + subline | | |
| 11 | Lower Third | | |
| 12 | Text Card 2 строки | | |
| 13 | Undo brand preset | | |
| 14 | Без шрифтов SB Sans | | |
| 15 | CTI у конца композиции | | |
| 16 | Scale через null | | |
| 17 | Tool Log пагинация | | |
| 18 | Clear log | | |
