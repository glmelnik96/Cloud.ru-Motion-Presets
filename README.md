# Cloud.ru Motion Presets — CEP Panel for After Effects

Изолированная CEP-панель для Adobe After Effects: применяет детерминированные motion-пресеты к выделенным слоям и создаёт Cloud.ru brand-пресеты в активной композиции. Без чата, без сетевых вызовов.

---

## Возможности

### Motion Presets (применяются к выделенным слоям)

| Preset | Свойства | Параметры |
|--------|----------|-----------|
| Fade In / Out | Opacity | duration, delay |
| Pop In / Out | Scale + Opacity | duration, delay, intensity |
| Slide Left / Right / Up / Down | Position + Opacity | duration, delay, amplitude (px) |

### Brand Presets (Cloud.ru, создаются в активной композиции)

| Preset | Что создаётся | Параметры |
|--------|---------------|-----------|
| Logo Reveal | Cloud.ru icon + текст с overshoot | duration, optional subline |
| Lower Third | Тёмные плашки + имя + должность | name, title, display duration |
| Text Card | 2–4 строки на staggered плашках | line1, line2, display duration |

### Tool Call Log
Журнал последних 200 операций (имя, статус, сообщение, время).

### Footer
- **Undo** — откат всех keyframes последнего apply за один Cmd+Z цикл
- **Clear** — очистка лога

---

## Установка

1. Скопируйте папку в `~/Library/Application Support/Adobe/CEP/extensions/`
2. Включите unsigned extensions: `defaults write com.adobe.CSXS.11 PlayerDebugMode 1`
3. Перезапустите After Effects → `Window → Extensions → Cloud.ru Motion Presets`

---

## Структура

```
CSXS/manifest.xml          ← CEP манифест
index.html                 ← UI: Presets + Brand Presets + Tool Log
main.js                    ← Panel runtime
styles.css                 ← Стили панели
brandPresets.js            ← Brand colors / fonts / labels конфиг
hostBridge.js              ← CSInterface → ExtendScript bridge
host/index.jsx             ← ExtendScript: 6 preset функций + helpers
lib/CSInterface.js         ← Adobe CEP library
docs/                      ← Brand-presets спецификация и manual-test
```

---

## Verification

1. AE → Window → Extensions → Cloud.ru Motion Presets — панель открывается
2. Видны секции Motion Presets и Brand Presets (Cloud.ru) + Tool Call Log
3. Apply preset на выделенном слое — keyframes ставятся, Undo откатывает
4. Brand preset на активной композиции — слои создаются, Undo откатывает

---

## Документация

- `docs/brand-presets-spec.md` — спецификация brand-пресетов
- `docs/brand-figma-assets.md` — figma-ссылки и asset-карта
- `docs/manual-test.md` — manual test plan
