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
| N2 | Preact | не проверялось | не проверялось: preact не скачивали, проба на чистом DOM | Bolt: шаблон React и алиас `react` → `preact/compat`; свой Vite: Preact напрямую |
| N3 | Панель открывается в AE 26.5 | не проверялось | не проверялось (необязательно, вручную) | Window → Extensions, вручную |
| N4 | Панель открывается в Premiere 26.5.2 | не проверялось | не проверялось (необязательно, вручную) | Window → Extensions, вручную |
| N5 | Размер ZXP, байт | не проверялось | 9839 | `node tools/panel/inspect.mjs <zxp>` |
| N6 | Пакетов в `node_modules` | не проверялось | 0 своих: vite из `node_modules` репозитория (зависимость vitest) | `npm ls --all --parseable \| wc -l` |
| N7 | Какой ZXPSignCmd подписывает | не проверялось | 4.1.3 из CEP-Resources, sha256 ffc22231…6c98 | Bolt: встроенный в `vite-cep-plugin`, sha256 против 4.1.3; свой Vite: 4.1.3 из CEP-Resources |
| N8 | `.debug` внутри ZXP | не проверялось | нет: `.debug false` | `node tools/panel/inspect.mjs <zxp>` → `.debug false` |
| N9 | Подписанный ZXP грузится без PlayerDebugMode (необязательно, делает пользователь) | не проверялось | не проверялось (делает пользователь) | ZXP распакован в папку расширений, PlayerDebugMode = 0, перезапуск AE |

**Рекомендация:** свой Vite. Проходит K1 и K2, своих зависимостей нет; Bolt CEP не проверялся, потому что скачивание его npm-пакетов не разрешено. Решение принято при закрытии фазы 0 («закрываем фазу 0», 2026-10-05). Preact и открытие панели в AE и Premiere проверяются при сборке настоящей панели.

**Файлы пробы:**
- Bolt — `C:/CRBK/work/panel-trial/bolt` (вне репозитория);
- свой Vite — `spikes/panel-trial/vite`;
- сертификат и пароль пробы — `C:/CRBK/work/panel-trial/`, в git не попадают.
