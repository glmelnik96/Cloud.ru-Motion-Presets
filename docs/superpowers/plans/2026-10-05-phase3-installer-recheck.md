# Задание локальному агенту: проверка панели 0.1.2 в After Effects

**От кого:** облачная сессия, ветка `claude/determined-cannon-eum3ei`. Проверка 0.1.1 (`windows-recheck.json`) нашла настоящую причину «Нет композиции» в AE: `esc['-']` в экранировании строк — член-оператор ExtendScript. В 0.1.2 строки экранируются по кодам символов. `icacls` уже исправлен и проверен; здесь главное — AE.

1. `git pull origin claude/determined-cannon-eum3ei`, `npm ci`, `npm test` — всё зелёное (тесты `install.command` на Windows теперь пропускаются).
2. Подписать панель 0.1.2 и собрать пакет:
   ```bash
   node tools/panel/package-zxp.mjs --zxpsign <ZXPSignCmd> --cert <.p12>     # пароль через BRANDKIT_CERT_PASSWORD, как раньше
   node tools/installer/build.mjs --zxp C:/CRBK/work/panel/CloudRuBrandKit-0.1.2.zxp --library C:/CRBK/work/panel-live/library
   ```
3. Закрыть AE и Premiere, установить пакет поверх (`install.cmd`).
4. Проверить:
   - `icacls C:\ProgramData\CloudRuBrandKit` — у `BUILTIN\Пользователи` есть `(OI)(CI)(M)`;
   - AE: **без** подмены `JSON.stringify`, открыт проект с дефисом в пути (`C:/CRBK/work/panel-live/ae/panel_ui.aep`) и активная композиция — чип показывает формат композиции, строка состояния «AE 26.5 · панель 0.1.2 · …», вставка «Подписи спикера» работает;
   - Premiere: строка состояния «панель 0.1.2», вставка работает.
5. Записать в `docs/research/installer/windows-recheck-2.json` (коды выхода, `icacls`, чип и строка состояния в AE и Premiere), закоммитить и запушить в ту же ветку. Код не чинить — описать.
