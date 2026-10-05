# Каркас панели: Bolt CEP или свой Vite (A5)

**Статус:** проба задачи 29 проведена 2026-10-05 для своего Vite (ZXPSignCmd 4.1.3 скачан с разрешения пользователя). Решение утверждает пользователь в строке A5 листа решений (`phase0-decisions.md`).

**Критерии** (spec §3.3 п. 6, §6):
- K1 — один `CSXS/manifest.xml`, и панель работает и в AE, и в Premiere;
- K2 — подписанный ZXP: самоподписанный сертификат, метка времени, `ZXPSignCmd -verify` проходит.

Строки N — наблюдения для выбора, если оба варианта проходят оба критерия.

**Как читать ячейки:** «да» или «нет» с коротким пояснением; число — для замеров; «—» — ещё не проверено.

| # | Что | Bolt CEP | Свой Vite | Как проверено |
|---|---|---|---|---|
| K1 | Один манифест, панель в AEFT и PPRO | нет: не проверялся — npm-пакеты пробы (create-bolt-cep) не скачивались | да: `covers AEFT+PPRO: true` | `node tools/panel/inspect.mjs <CSXS/manifest.xml>` → `covers AEFT+PPRO: true` |
| K2 | Подписанный ZXP с меткой времени, `-verify` проходит | нет: не проверялся — npm-пакеты пробы не скачивались | да: подпись с меткой времени DigiCert, `Signature verified successfully`, `signed true` | `ZXPSignCmd -verify <zxp> -certinfo`; `node tools/panel/inspect.mjs <zxp>` → `signed true` |
| N1 | Сборка под Chromium 99 (CEP 12) без ошибок | не проверялось | да: `vite build`, цель `chrome99`, 22 мс | `npm run build`, цель сборки `chrome99` |
| N2 | Preact | не проверялось | да: Preact 10.29.8 с хуками, JSX компилирует Oxc в Vite 8 (в пробе — через совместимую опцию `esbuild`, в панели — `oxc.jsx`); бандл 13,5 КБ (5,7 КБ gzip). Проверено 2026-10-05 после разрешения на npm | Bolt: шаблон React и алиас `react` → `preact/compat`; свой Vite: Preact напрямую |
| N3 | Панель открывается в AE 26.5 | не проверялось | да, на настоящей панели `ru.cloud.brandkit` 2026-10-05: бандл IIFE с `<script defer>`, Preact, `evalScript` (`26.5x89`), Chrome 99, Node `fs` | Window → Extensions, вручную |
| N4 | Панель открывается в Premiere 26.5.2 | не проверялось | да, на настоящей панели 2026-10-05: то же, `evalScript` (`26.5.2`) | Window → Extensions, вручную |
| N5 | Размер ZXP, байт | не проверялось | 15114 с Preact (9839 на чистом DOM) | `node tools/panel/inspect.mjs <zxp>` |
| N6 | Пакетов в `node_modules` | не проверялось | 1 — `preact`; vite берётся из `node_modules` репозитория (зависимость vitest) | `npm ls --all --parseable \| wc -l` |
| N7 | Какой ZXPSignCmd подписывает | не проверялось | 4.1.3 из CEP-Resources, sha256 ffc22231…6c98 | Bolt: встроенный в `vite-cep-plugin`, sha256 против 4.1.3; свой Vite: 4.1.3 из CEP-Resources |
| N8 | `.debug` внутри ZXP | не проверялось | нет: `.debug false` | `node tools/panel/inspect.mjs <zxp>` → `.debug false` |
| N9 | Подписанный ZXP грузится без PlayerDebugMode (необязательно, делает пользователь) | не проверялось | не проверялось (делает пользователь) | ZXP распакован в папку расширений, PlayerDebugMode = 0, перезапуск AE |

**Рекомендация:** свой Vite. Проходит K1 и K2, из своих зависимостей — только Preact. Bolt CEP не проверялся: до закрытия фазы 0 его npm-пакеты скачивать было нельзя. Проверять его потом не нужно: даже при равенстве по K1 и K2 правило выбирает вариант с меньшим числом зависимостей. Решение принято при закрытии фазы 0 («закрываем фазу 0», 2026-10-05). Preact проверен 2026-10-05 (N2); настоящая панель открылась в AE и Premiere (N3, N4). Открыть панель скриптом: `CSInterface.requestOpenExtension` работает только из видимой панели (BrandKit Dev), из невидимого расширения CEP 12 пишет «Unknown Exception»; в AE есть ещё команда меню — `tools/dev/open-panel.mjs`.

**Файлы пробы:**
- Bolt — не создавался;
- свой Vite — `spikes/panel-trial/vite`;
- сертификат и пароль пробы — `C:/CRBK/work/panel-trial/`, в git не попадают.
