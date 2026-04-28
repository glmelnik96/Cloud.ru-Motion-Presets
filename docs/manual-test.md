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
