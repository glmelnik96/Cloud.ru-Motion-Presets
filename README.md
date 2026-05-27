# Cloud.ru Motion Presets — CEP Panel for After Effects

Изолированная CEP-панель для Adobe After Effects 2021+ (CSXS 11). Три блока функциональности:

1. **Motion Presets** — детерминированные fade/pop/slide пресеты на выделенные слои (offline, без сети).
2. **Brand Presets** — Cloud.ru brand-templates (logo reveal, lower third, text card) в активной композиции (offline).
3. **Subtitles** — транскрибация выделенного аудио/видео через Cloud.ru Whisper Large v3 с параллельным chunk-pipeline; результат — редактируемые AE text-слои (требует сети + API-ключа).

> **Новому агенту:** начните с `HANDOFF.md` — там карта проекта, ключевые файлы, точки расширения и подводные камни.

---

## Возможности

### Motion Presets (применяются к выделенным слоям)

| Preset | Свойства | Параметры |
|--------|----------|-----------|
| Fade In / Out | Opacity | duration, delay |
| Pop In / Out | Scale + Opacity | duration, delay, intensity |
| Slide Left / Right / Up / Down | Position + Opacity | duration, delay, amplitude (px) |

Все пресеты ставятся через `_setKeyAtTimeAndGetIndex` + `_setKeyEaseBezier`, оборачиваются в `beginUndoGroup`. Параметр `_MOTION_PRESET_RECIPES` в `host/index.jsx` описывает easing-кривые.

### Brand Presets (Cloud.ru, создаются в активной композиции)

| Preset | Что создаётся | Параметры |
|--------|---------------|-----------|
| Logo Reveal | Cloud.ru cube-icon (3 shape-paths) + текст "Cloud.ru" с overshoot | duration, optional subline |
| Lower Third | Тёмные плашки с overshoot + 2 white-flash + name + title | name, title, display duration |
| Text Card | Bar-подложки с staggered scaleX + 2–4 строки текста | line1, line2, display duration |

Точные параметры анимаций: `docs/brand-presets-spec.md`. SVG-исходники иконки: `docs/brand-figma-assets.md`.

### Subtitles (Cloud.ru Whisper)

Транскрибирует выделенный AVLayer (footage source — аудио/видео файл на диске) и создаёт **редактируемые text-слои** в активной композиции — каждый cue = отдельный слой с inPoint/outPoint, шрифтом, цветом, fade/char-reveal анимацией. Слои паренятся к null-контроллеру (`Subtitles Controller`), один Cmd+Z откатывает весь импорт.

| Параметр | Что значит |
|--------|------|
| Lang | `ru` / `en` / `auto` для Whisper |
| Max chars | Максимум символов в одном cue (длинные сегменты режутся по словам) |
| Min cue (s) | Минимальная длительность cue, чтобы избежать мерцания |
| Font (px) | Размер шрифта text-слоя |
| Animation | `Fade` (opacity in/out keyframes), `Char reveal` (Range Selector animator), `None` |

**Pipeline (3 фазы):**
1. **Resolve source** — host script резолвит `layer.source.mainSource.file.fsName` + inPoint/outPoint/sourceStartInLayer
2. **Extract + transcribe** — ffmpeg режет диапазон на 16 kHz mono PCM WAV-чанки по 90 сек → `promisePool(tasks, 20)` параллельно шлёт каждый чанк в `POST {baseUrl}/v1/audio/transcriptions` → Whisper Large v3 возвращает verbose_json с per-segment timing → сегменты нормализуются с timeline-offset и сортируются
3. **Create layers** — `splitLongCues` режет длинные сегменты по словам с учётом max_chars и min_dur → host создаёт N text-слоёв одной undo-группой

**Требования:**
- ffmpeg в PATH или в `/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin`, или Windows-стандартных путях
- API-ключ Cloud.ru Foundation Models: `cp client/fm-secrets.example.js client/fm-secrets.local.js` и вписать `apiKey` (файл gitignored)
- Сетевой доступ к `https://foundation-models.api.cloud.ru`

### Tool Call Log
Журнал последних 200 операций (имя tool, status, message, время). Прокручиваемый, последние 100 рендерятся в UI.

### Footer
- **Undo** — вызывает `app.executeCommand(16)` N раз по числу мутаций последнего apply (для batch-операций — несколько undo за один цикл Cmd+Z, AE сам схлопывает)
- **Clear** — очистка лога

---

## Архитектура

```
┌──────────────────────────────────────────────────────────────────────┐
│                       Adobe After Effects                            │
│                                                                       │
│  ┌────────────────────────────┐    ┌─────────────────────────────┐  │
│  │  CEP Panel (CEF browser)   │    │  ExtendScript Engine (AE)   │  │
│  │                            │    │                              │  │
│  │  index.html ─ UI           │    │  host/index.jsx ─ presets   │  │
│  │  main.js ─ runtime         │    │  host/subtitles.jsx ─ subs  │  │
│  │  brandPresets.js ─ config  │    │                              │  │
│  │                            │    │  Доступ: AE DOM (comp,      │  │
│  │  hostBridge.js  ◀──────────┼────┤  layer, props, keyframes)   │  │
│  │  (CSInterface.evalScript)  │    │                              │  │
│  │                            │    └─────────────────────────────┘  │
│  │  client/ (Subtitles)       │                                      │
│  │    ├─ fm-defaults.js       │     Загрузка host-скриптов:         │
│  │    ├─ fm-secrets.local.js  │     hostBridge.ensureHostScriptLoad │
│  │    ├─ cloudru-client.js    │     evalFile(index.jsx; subtitles)  │
│  │    ├─ timeline-transcribe  │                                      │
│  │    └─ subtitle-pipeline.js │                                      │
│  └──────────┬─────────────────┘                                      │
│             │ Node.js (--enable-nodejs)                              │
│             ▼                                                         │
│      ┌──────────────┐         ┌──────────────────────────────────┐  │
│      │   ffmpeg     │         │  fetch → Cloud.ru Whisper API    │  │
│      │ (extract WAV │         │  POST /v1/audio/transcriptions   │  │
│      │  chunks)     │         │  (multipart, ≤20 параллельных)   │  │
│      └──────────────┘         └──────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### Поток данных Motion/Brand preset
```
UI click → main.js собирает payload →
window.HOST_BRIDGE.executeToolCall(toolName, args) →
hostBridge.js serialize JS→ES literal →
cs.evalScript('motionPresets_xxx(...)') →
ExtendScript исполняет в AE →
resultToJson возвращает строку →
JSON.parse в main.js → addToolLogEntry
```

### Поток данных Subtitles pipeline
```
UI Apply →
get_host_context → selected layer info →
SubtitlePipeline.transcribeAndCreate {
  → get_audio_source [host] → {fsPath, inPoint, outPoint, sourceStartInLayer}
  → TimelineTranscribe.transcribeRange {
      → extractAudioChunksWithFfmpeg → [chunk0..chunkN]
      → promisePool(transcribeTasks, 20) → CloudRuClient.transcribeAudio per chunk
      → normalize + merge + sort segments
    }
  → splitLongCues (max_chars, min_dur)
  → create_subtitle_layers [host] → N text layers + null controller
}
```

---

## Структура проекта

```
.
├── HANDOFF.md                   ← Входная точка для будущих агентов/разработчиков
├── README.md                    ← Этот файл
├── CSXS/
│   └── manifest.xml             ← CEP манифест (ExtensionBundleId, AE 2021+, --enable-nodejs)
├── .debug                       ← CEP debug config (gitignored, fixed Extension Id)
│
├── index.html                   ← Panel UI: Motion + Brand + Subtitles + Tool Log
├── main.js                      ← Panel runtime: handlers, state, DOM refs, event binding
├── styles.css                   ← Стили панели (.preset-*, .brand-*, .subtitles-*, .tool-log)
├── brandPresets.js              ← Brand colors / fonts / labels конфиг (panel-side)
├── hostBridge.js                ← CSInterface bridge — загружает оба .jsx, ES-literal serializer
│
├── host/
│   ├── index.jsx                ← ExtendScript: 6 preset functions + getHostContext + helpers
│   └── subtitles.jsx            ← ExtendScript: getAudioSourceForLayer + createSubtitleLayers
│
├── client/                      ← Browser-side модули для subtitle pipeline
│   ├── fm-defaults.js           ← Config: baseUrl, model, chunk size, concurrency
│   ├── fm-secrets.example.js    ← Template для apiKey (committed)
│   ├── fm-secrets.local.js      ← Реальный apiKey (gitignored)
│   ├── cloudru-client.js        ← Cloud.ru API клиент: transcribeAudio + retry/abort/timeout
│   ├── timeline-transcribe.js   ← ffmpeg chunking + promisePool(20) + segment merge
│   └── subtitle-pipeline.js     ← Orchestrator: host bridge ↔ TimelineTranscribe
│
├── lib/
│   └── CSInterface.js           ← Adobe CEP library (стандартный, не модифицировать)
│
└── docs/
    ├── brand-presets-spec.md    ← Эталонные параметры brand-анимаций (extraction)
    ├── brand-figma-assets.md    ← Cloud.ru cube SVG + Figma-tokens
    └── manual-test.md           ← Manual test plan (30 тестов: motion + brand + subs + edge)
```

---

## Установка

1. Скопируйте папку проекта в `~/Library/Application Support/Adobe/CEP/extensions/`
2. Включите unsigned extensions (один раз на машину):
   ```bash
   defaults write com.adobe.CSXS.11 PlayerDebugMode 1
   ```
3. (Опционально, для Subtitles) установите ffmpeg:
   ```bash
   brew install ffmpeg
   ```
4. (Опционально, для Subtitles) пропишите Cloud.ru API key:
   ```bash
   cp client/fm-secrets.example.js client/fm-secrets.local.js
   # отредактируйте apiKey
   ```
5. Перезапустите After Effects → `Window → Extensions → Cloud.ru Motion Presets`

---

## Dev workflow

### Внести изменение
1. Открыть файл, отредактировать.
2. Если правка в `.jsx` (host) — закрыть и снова открыть панель в AE (или Cmd+R, если включён `--remote-debugging-port` для CEF).
3. Если правка в `.html` / `.js` / `.css` (panel) — Cmd+R в DevTools или переоткрыть панель.

### Отладка
- **Panel DevTools:** в `.debug` уже прописан Extension ID. Откройте `http://localhost:8088/` в Chrome → выберите панель → Console + Sources.
- **ExtendScript errors:** возвращаются через `hostBridge.evalHostFunction` как `EvalScript error...` строки и логируются в Tool Log как `error`.
- **ffmpeg / network errors (Subtitles):** прогресс-callback пишет в Tool Log с status `info`/`error`.

### Добавить новый motion preset
1. В `host/index.jsx` добавить запись в `_MOTION_PRESET_RECIPES` и новую функцию `motionPresets_apply<Name>Preset`.
2. В `hostBridge.js` добавить case в `executeToolCall` switch.
3. В `index.html` — option в `#preset-dropdown-menu` с `data-preset="<key>"`.
4. В `main.js` — обновить `PRESET_LABELS` и расширить `buildPresetCallFromUi`.
5. Добавить тест в `docs/manual-test.md`.

### Добавить новый brand preset
1. В `host/index.jsx` добавить `motionPresets_applyBrand<Name>` (используйте `_addBrandPath`, `_addBrandFill`, `_addBrandRect`, `_createBrandWipeBar`, `_setTextDoc`, `_addTextRevealAnimator`).
2. В `hostBridge.js` — case `apply_brand_<name>`.
3. В `brandPresets.js` — `BRAND_PRESET_LABELS` и `BRAND_PRESET_DEFAULTS`.
4. В `index.html` — option в `#brand-dropdown-menu`.
5. В `main.js` — обновить `updateBrandFieldsUi` и `buildBrandPresetCall`.

### Расширить subtitle pipeline
- **Локальный бэкенд** (без сети): добавить ветку в `TimelineTranscribe.transcribeRange` по аналогии с whisper.cpp в Pr-extension (`client/shared/whisper-cpp-client.js` там — образец).
- **Постпроцесс (silencedetect, loudnorm):** в Pr-extension есть `client/shared/audio-preprocess.js` — портировать как опциональный пред-/постфильтр.
- **SRT-импорт без транскрибации:** новый `parseSrt` + переиспользовать `createSubtitleLayers`.

---

## Verification

1. AE → Window → Extensions → Cloud.ru Motion Presets — панель открывается, видны 3 секции + Tool Log + Footer.
2. Motion: выделить layer, выбрать preset, Apply → keyframes ставятся, Undo откатывает.
3. Brand: открыть композицию, Apply → слои + null controller создаются, Undo откатывает.
4. Subtitles: выделить аудио/видео layer с файловым source, Apply → ffmpeg чанкует, прогресс идёт, появляются Sub 1..N + Subtitles Controller. Cmd+Z откатывает.

Полный план: `docs/manual-test.md` (30 тестов).

---

## Troubleshooting

| Симптом | Причина / fix |
|---|---|
| Панель не открывается в меню AE | Не включён `PlayerDebugMode 1` или AE не перезапущен после копирования |
| `Host returned empty result` в Tool Log | Host скрипт упал на загрузке — открыть DevTools → Console для трассы |
| `Layer not resolved` при apply preset | Слой выделен в Project panel, не в Timeline. Выделять надо в comp. |
| `Слой не AVLayer` при Subtitles | Выделен text/solid/precomp. Для транскрибации нужен AVLayer с footage-источником (файл на диске) |
| `ffmpeg не найден` | Установите `brew install ffmpeg` (macOS) или `apt install ffmpeg` (Linux). Путь должен быть в `/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin` или Windows-стандартных |
| `API ключ не задан` | `cp client/fm-secrets.example.js client/fm-secrets.local.js`, заполнить `apiKey`, перезагрузить панель |
| `413 Payload Too Large` от Cloud.ru | Уменьшите `transcribeExportChunkSec` в `client/fm-defaults.js` (например, с 90 до 60 сек) |
| `Таймаут запроса (120с)` | Сеть нестабильна. Cloud.ru retry уже даёт 3 попытки с exp backoff. Если хронически — поднимите `fetchTimeoutMs` в `fm-defaults.js` |
| Кириллица субтитров вопросами | Маловероятно (Whisper и AE TextDocument поддерживают UTF-8). Проверьте, что шрифт `SBSansDisplay-Semibold` установлен; иначе fallback может терять глифы |

---

## Документация

- **`HANDOFF.md`** — карта проекта для нового агента/разработчика (читать первым)
- `docs/brand-presets-spec.md` — эталонные параметры brand-анимаций
- `docs/brand-figma-assets.md` — Cloud.ru cube SVG + Figma color tokens
- `docs/manual-test.md` — 30 manual-тестов
