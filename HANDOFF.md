# HANDOFF — Cloud.ru Motion Presets

> **Цель документа:** дать новому агенту / разработчику достаточный контекст за 10 минут чтения,
> чтобы безопасно вносить изменения без поломки существующего pipeline.

---

## 1. Что это (60 секунд)

Adobe CEP-панель для After Effects 2021+, делает три вещи:

| Блок | Где живёт логика | Сеть? |
|---|---|---|
| **Motion Presets** — fade/pop/slide на выделенные слои | `host/index.jsx` (motion section) | нет |
| **Brand Presets** — Cloud.ru logo/lower-third/text-card в композиции | `host/index.jsx` (brand section) | нет |
| **Subtitles** — Whisper-транскрибация → редактируемые AE text-слои | `client/*.js` + `host/subtitles.jsx` | да (Cloud.ru API) |

Все мутации обёрнуты в `app.beginUndoGroup` — один Cmd+Z откатывает целиком.

---

## 2. С чего начать (порядок чтения)

| # | Файл | Зачем |
|---|---|---|
| 1 | `README.md` | Общий обзор, troubleshooting, dev workflow |
| 2 | `CSXS/manifest.xml` | Ограничения runtime: AE 18+, `--enable-nodejs`, `--mixed-context` |
| 3 | `index.html` | Карта UI-секций (Motion / Brand / Subtitles / Tool Log / Footer) |
| 4 | `main.js` (полностью, ~600 строк) | Все handlers, состояние, event binding |
| 5 | `hostBridge.js` | Как panel вызывает host (load двух .jsx + ES-literal сериализация + 9 case-веток) |
| 6 | `host/index.jsx` (1462 строки — читать секциями) | Helpers + 6 preset функций + brand-utils |
| 7 | `host/subtitles.jsx` | 2 функции: getAudioSourceForLayer, createSubtitleLayers |
| 8 | `client/subtitle-pipeline.js` | Orchestrator subtitle-пайплайна (короткий, начать отсюда) |
| 9 | `client/timeline-transcribe.js` | ffmpeg-чанкинг + promisePool(20) — сердце параллельного pipeline |
| 10 | `client/cloudru-client.js` | Cloud.ru API клиент: retry/abort/timeout |
| 11 | `docs/brand-presets-spec.md` | Эталонные числовые параметры brand-анимаций (если правите brand) |
| 12 | `docs/manual-test.md` | Что тестировать перед коммитом |

---

## 3. Mental model: CEP / ExtendScript split

```
┌─────────────────────────────────────────────────────────────────┐
│  CEP Panel (CEF browser, Node.js available)                     │
│  ─────────────────────────────────────────                      │
│  • Современный JS, fetch, FormData, Promise, async/await        │
│  • Node.js: require('fs'), require('child_process')             │
│  • Доступа к AE DOM НЕТ — только через CSInterface.evalScript   │
│                                                                  │
│         │                                                        │
│         │ evalScript('motionPresets_xxx(...)')                  │
│         │ (строка JS-литерала, возвращает строку)               │
│         ▼                                                        │
│  ExtendScript Engine (внутри AE)                                │
│  ──────────────────────────                                     │
│  • ES3-ish JavaScript (НЕТ let/const/async/Promise/fetch)       │
│  • НЕТ Node, НЕТ DOM, НЕТ современных API                       │
│  • ЕСТЬ доступ к AE DOM: app.project, comp, layer, props, kf    │
│  • ЕСТЬ File/Folder для FS, нет HTTP                            │
│  • Возврат — строка (JSON-encoded через resultToJson)           │
└─────────────────────────────────────────────────────────────────┘
```

**Правило:** всё, что требует современного JS / сети / Node — в panel-слой (`main.js`, `client/`). Всё, что трогает AE DOM — в ExtendScript (`host/*.jsx`).

---

## 4. Code map — кто что делает

### Panel-side (CEF / browser)

| Файл | Ответственность |
|---|---|
| `index.html` | DOM-разметка 3 секций + Tool Log + Footer; подключает 8 скриптов в строгом порядке |
| `main.js` | `state` объект, DOM refs, busy-flags, event binding, лог. **Точка входа** — `init()` в конце файла |
| `styles.css` | Тёмная тема AE-like; классы `.preset-*`, `.brand-*`, `.subtitles-*`, `.tool-log-*` |
| `brandPresets.js` | Static config: colors RGB, fonts, labels, defaults для brand presets |
| `hostBridge.js` | `loadHostFile` (resilient evalFile с fallback), `executeToolCall` switch, `toESLiteral` сериализатор |

### Host-side (ExtendScript)

| Файл | Ответственность |
|---|---|
| `host/index.jsx` | Core helpers (`_resolveLayer`, `_setKeyAtTime*`, `_setTextDoc`, `resultToJson`, `_beginToolUndo`); brand-utils (`_addBrandPath`, `_BRAND_COLORS`, `_BRAND_LOGO_PATHS`); 6 публичных preset функций |
| `host/subtitles.jsx` | Использует helpers из index.jsx; 2 публичные функции: `motionPresets_getAudioSourceForLayer`, `motionPresets_createSubtitleLayers` |

### Subtitle pipeline (panel-side)

| Файл | Ответственность |
|---|---|
| `client/fm-defaults.js` | Cloud.ru config: baseUrl, model, chunk=90s, concurrency=20, language, subtitle defaults |
| `client/fm-secrets.local.js` | apiKey (gitignored, copy from `fm-secrets.example.js`) |
| `client/cloudru-client.js` | `CloudRuClient.transcribeAudio` (multipart) с retry(3×) + per-attempt AbortController + 120s timeout |
| `client/timeline-transcribe.js` | `extractAudioChunksWithFfmpeg` (ffmpeg → 16kHz mono PCM WAV chunks); `transcribeRange` (orchestrator с promisePool); `splitLongCues` (split по max_chars) |
| `client/subtitle-pipeline.js` | `SubtitlePipeline.transcribeAndCreate` — связывает host bridge ↔ TimelineTranscribe |

---

## 5. Common task playbooks

### Добавить новый motion preset
```
host/index.jsx:
  + запись в _MOTION_PRESET_RECIPES
  + функция motionPresets_apply<Name>Preset(layerIndex, layerId, options) → resultToJson
hostBridge.js:
  + case 'apply_<name>_preset' в executeToolCall switch
index.html:
  + <button data-preset="<key>"> внутри #preset-dropdown-menu
main.js:
  + запись в PRESET_LABELS
  + ветка в buildPresetCallFromUi
docs/manual-test.md:
  + новый тест
```

### Добавить новый brand preset
```
host/index.jsx:
  + motionPresets_applyBrand<Name>(options) — используйте существующие
    _addBrandPath, _addBrandFill, _addBrandRect, _createBrandWipeBar,
    _setTextDoc, _addTextRevealAnimator, _BRAND_COLORS
hostBridge.js:
  + case 'apply_brand_<name>'
brandPresets.js:
  + entry в BRAND_PRESET_LABELS и BRAND_PRESET_DEFAULTS
index.html:
  + <button data-brand-preset="<key>"> в #brand-dropdown-menu
main.js:
  + ветка в updateBrandFieldsUi (динамические поля под preset)
  + ветка в buildBrandPresetCall
docs/brand-presets-spec.md:
  + новая секция с эталонными параметрами
```

### Изменить subtitle pipeline
- **Поменять модель / endpoint:** `client/fm-defaults.js` (`whisperModel`, `baseUrl`)
- **Поменять параллелизм:** `cloudConcurrency` в `fm-defaults.js` (по умолчанию 20 — лимит Cloud.ru)
- **Поменять размер чанка:** `transcribeExportChunkSec` в `fm-defaults.js` (90s = ~2.88 МБ при 16kHz mono PCM, безопасно под 20МБ лимит)
- **Добавить опции в UI:** новый input в `index.html` → `els.<name>` в `cacheDomRefs` → читать в `handleApplySubtitles` → передать в `SubtitlePipeline.transcribeAndCreate`
- **Добавить локальный backend (whisper.cpp):** см. `Extensions-LLM-Chat_Pr/client/shared/whisper-cpp-client.js` как образец, добавить ветку в `transcribeRange`

### Отладка
- **Panel JS errors:** Chrome DevTools на `localhost:8088` (порт из `.debug`), вкладка панели
- **ExtendScript errors:** возвращаются в `main.js` как `EvalScript error...`, логируются как `error` в Tool Log
- **HTTP errors (Cloud.ru):** видны в Tool Log через progress callback; full trace в DevTools Network tab

---

## 6. Gotchas / подводные камни

### CEP / Panel
- `cs.evalScript` всегда строковый I/O. Возврат `undefined`/`null`/`''` означает host упал — проверьте Console.
- `--mixed-context` в `manifest.xml` даёт shared global scope в одном CEF process. Не полагайтесь на отдельные iframes.
- `.debug` файл должен совпадать по Extension Id с `manifest.xml` — иначе DevTools port не откроется.

### ExtendScript
- Никаких `let/const/Promise/async/arrow/template-literals/destructuring/Object.assign/.includes/.startsWith`. Только ES3-ish.
- `JSON.parse/stringify` доступен, но не `Array.prototype.find/.some/.every` в старых версиях AE — проверяйте через `for` цикл.
- Try/catch обязателен вокруг каждого AE-call — exceptions ломают весь host scope, не только текущий вызов.
- Числа keyframe values: AE Opacity — 0..100, не 0..1. Scale — 0..100 проценты, не 0..1.
- `layer.parent = nullLayer` падает, если layer ещё не добавлен в comp или nullLayer уже удалён.
- `app.executeCommand(16)` — это Edit > Undo. Несколько вызовов AE схлопывает в один Cmd+Z цикл (используется в `handleUndo`).

### Subtitle pipeline
- **ffmpeg path:** CEP Node.js НЕ наследует PATH пользователя — приходится явно искать в `/opt/homebrew/bin`, `/usr/local/bin`, etc. См. `findFfmpegPath`.
- **Размер чанка vs limit:** 90s × 32KB/s (16kHz mono PCM) ≈ 2.88 МБ. Cloud.ru лимит ~20 МБ — большой запас. Не повышайте без проверки.
- **Concurrency 20:** проверено эмпирически в Pr-extension. Выше — риск 429 (rate limit). retry это терпит, но шторм 50+ параллельных — нет.
- **Whisper segment.start/end** — секунды от начала отправленного чанка. Чтобы получить timeline-координаты, прибавляется `timelineOffsetSec + chunk.offsetInSpanSec` (см. `normalizeWhisperResponse`).
- **AbortController в CEF:** работает, но `signal.addEventListener('abort', ...)` не сработает если signal УЖЕ aborted — Pr-extension добавил pre-check (HIGH#3). Если будете portировать новые фиксы оттуда — заберите этот патч.
- **Файловый source layer.source.mainSource.file.fsName:** работает только для AVLayer с FootageItem source. Solid/text/precomp — `null`. Проверяется в `getAudioSourceForLayer`.

### Brand presets
- Шрифты `SBSansDisplay-*` / `SBSansText-*` НЕ бандлятся — если у пользователя их нет, fallback на дефолт AE. Внешний вид ломается. Документировать как требование.
- Эталонные числа в `docs/brand-presets-spec.md` извлечены из конкретных AE-проектов (Логошот.aep, Titles.aep, SMM_pack.aep) — это **референс**, упрощённая модель в коде специально без silhouetteAlpha track mattes (см. секцию "Упрощённая модель" в spec).

---

## 7. Где лежит «правда» о состоянии

- **Что реализовано:** код в `host/*.jsx` + `client/*.js` (всегда смотреть код, не док)
- **Какие пресеты есть в UI:** `index.html` (`data-preset`, `data-brand-preset`)
- **Какие toolNames принимает host bridge:** switch в `hostBridge.js` (9 кейсов на момент handoff)
- **Конфиг Cloud.ru:** `client/fm-defaults.js`
- **Тесты:** `docs/manual-test.md` (30 тестов; нумерация не строгая — 19+ = subtitles)
- **История проекта:** `git log` (важные вехи: split из Extensions-LLM-Chat → cleanup → subtitle integration)

---

## 8. Suggested next improvements (не реализовано, но логично)

| Идея | Сложность | Польза |
|---|---|---|
| SRT/VTT import (без транскрибации) — переиспользует `createSubtitleLayers` | низкая | даёт offline-режим для subtitle creation |
| Whisper.cpp локальный backend (offline транскрибация) | средняя | убирает зависимость от Cloud.ru API |
| `silencedetect` пред-сплит для умной разбивки cues по паузам | средняя | улучшает читабельность субтитров |
| Опция "сохранить в .srt" после транскрибации | низкая | удобство экспорта |
| API-key через UI input + localStorage вместо файла | низкая | UX, но снижает безопасность |
| Бандлить ffmpeg-static (~80МБ) для zero-install | средняя | убирает требование `brew install ffmpeg` |
| Whisper word-level timestamps для karaoke-эффекта | средняя | визуальная фича |
| Progress bar (визуальный) вместо текстового | низкая | UX |
| Pre-flight check (ffmpeg + apiKey + comp + layer) перед запуском, единым окном | низкая | меньше "тыка" пользователя |
| Кэш транскрибаций на основе хеша файла (избегать повторных платных вызовов) | средняя | экономия |

---

## 9. Не делать (антипаттерны)

- ❌ Добавлять зависимости от npm (нет package.json, нет bundler — все скрипты грузятся напрямую через `<script src>`)
- ❌ Использовать `localStorage` для секретов (API key хранить только в `fm-secrets.local.js`, gitignored)
- ❌ Делать сетевые вызовы из Motion/Brand presets (offline-инвариант секций 1 и 2)
- ❌ Складывать новые .md без необходимости — расширять существующие
- ❌ Использовать `Object.assign({}, a, b)` и подобные ES6+ в `host/*.jsx` (ExtendScript ES3)
- ❌ Менять `lib/CSInterface.js` (стандартная Adobe lib)
- ❌ Коммитить `client/fm-secrets.local.js` (gitignored, но проверять перед каждым commit)
- ❌ Создавать новый `*.sync-conflict-*.md` руками — Syncthing сам это делает при race condition
