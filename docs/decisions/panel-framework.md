# Каркас панели: Bolt CEP или свой Vite (A5)

**Статус:** проба задачи 29 плана фазы 0. Решение утверждает пользователь в строке A5 листа решений (`phase0-decisions.md`).

**Критерии** (spec §3.3 п. 6, §6):
- K1 — один `CSXS/manifest.xml`, и панель работает и в AE, и в Premiere;
- K2 — подписанный ZXP: самоподписанный сертификат, метка времени, `ZXPSignCmd -verify` проходит.

Строки N — наблюдения для выбора, если оба варианта проходят оба критерия.

**Как читать ячейки:** «да» или «нет» с коротким пояснением; число — для замеров; «—» — ещё не проверено.

| # | Что | Bolt CEP | Свой Vite | Как проверено |
|---|---|---|---|---|
| K1 | Один манифест, панель в AEFT и PPRO | — | — | `node tools/panel/inspect.mjs <CSXS/manifest.xml>` → `covers AEFT+PPRO: true` |
| K2 | Подписанный ZXP с меткой времени, `-verify` проходит | — | — | `ZXPSignCmd -verify <zxp> -certinfo`; `node tools/panel/inspect.mjs <zxp>` → `signed true` |
| N1 | Сборка под Chromium 99 (CEP 12) без ошибок | — | — | `npm run build`, цель сборки `chrome99` |
| N2 | Preact | — | — | Bolt: шаблон React и алиас `react` → `preact/compat`; свой Vite: Preact напрямую |
| N3 | Панель открывается в AE 26.5 | — | — | Window → Extensions, вручную |
| N4 | Панель открывается в Premiere 26.5.2 | — | — | Window → Extensions, вручную |
| N5 | Размер ZXP, байт | — | — | `node tools/panel/inspect.mjs <zxp>` |
| N6 | Пакетов в `node_modules` | — | — | `npm ls --all --parseable \| wc -l` |
| N7 | Какой ZXPSignCmd подписывает | — | — | Bolt: встроенный в `vite-cep-plugin`, sha256 против 4.1.3; свой Vite: 4.1.3 из CEP-Resources |
| N8 | `.debug` внутри ZXP | — | — | `node tools/panel/inspect.mjs <zxp>` → `.debug false` |
| N9 | Подписанный ZXP грузится без PlayerDebugMode (необязательно, делает пользователь) | — | — | ZXP распакован в папку расширений, PlayerDebugMode = 0, перезапуск AE |

**Рекомендация:** — (вписывается по итогам: при равенстве по K1 и K2 выбирается вариант с меньшим числом зависимостей и без лишних шагов сборки — spec §1, «облегчить плагин»).

**Файлы пробы:**
- Bolt — `C:/CRBK/work/panel-trial/bolt` (вне репозитория);
- свой Vite — `spikes/panel-trial/vite`;
- сертификат и пароль пробы — `C:/CRBK/work/panel-trial/`, в git не попадают.
