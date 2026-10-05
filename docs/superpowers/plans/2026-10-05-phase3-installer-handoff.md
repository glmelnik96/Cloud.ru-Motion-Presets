# Задание локальному агенту: установщик BrandKit на Windows

**От кого:** облачная сессия, ветка `claude/determined-cannon-eum3ei`. **Где:** ПК сборки, Windows, `C:/CRBK/work`.
**Зачем:** установщик (spec §8.1) написан в облаке. macOS-версия `install.command` проверена там тестами в «песочнице»; Windows-версию `install.ps1` / `install.cmd` в облаке не запустить — нет PowerShell.

## Что сделано

| Файл | Что делает |
|---|---|
| `tools/installer/build.mjs` (`npm run installer:build`) | собирает пакет `CloudRuBrandKit-<панель>-<библиотека>/` и zip: распакованный подписанный ZXP, библиотека со сверкой sha256, `payload/mogrt.txt`, оба установщика, README |
| `tools/installer/install.ps1`, `install.cmd` | Windows: отказ при открытых AE/Premiere, панель в `%APPDATA%\Adobe\CEP\extensions\ru.cloud.brandkit`, библиотека в `C:\ProgramData\CloudRuBrandKit\library` (при первом создании `icacls` для группы «Пользователи»), MOGRT плоско в Local Templates с удалением своих прошлых версий, `-WithAme`, чистка `cep_cache`, `-Sandbox <папка>` для пробы |
| `tools/installer/install.command` | то же на macOS |

## Шаги

1. `git pull origin claude/determined-cannon-eum3ei`, `npm ci`, `npm test` — всё зелёное.
2. Пакет из подписанной панели и библиотеки части А:
   ```bash
   node tools/installer/build.mjs --zxp C:/CRBK/work/panel/CloudRuBrandKit-0.1.0.zxp --library C:/CRBK/work/panel-live/library
   ```
   Ждём `OK C:/CRBK/work/release/CloudRuBrandKit-0.1.0-<дата>.zip: 10 MOGRT, signed`. Если ZXP устарел — пересоберите его `node tools/panel/package-zxp.mjs` (часть Б прошлого задания).
3. Проба в «песочнице» (ничего настоящего не трогает), из распакованной папки пакета:
   ```bat
   install.cmd -Sandbox C:\CRBK\work\installer-sandbox
   install.cmd -Sandbox C:\CRBK\work\installer-sandbox -WithAme
   ```
   Код выхода 0, в сообщениях кириллица читается (не «кракозябры»), в `C:\CRBK\work\installer-sandbox` — `AppData\Roaming\Adobe\CEP\extensions\ru.cloud.brandkit`, `ProgramData\CloudRuBrandKit\library`, 10 файлов в `AppData\Roaming\Adobe\Common\Motion Graphics Templates`.
4. Отказ при открытом приложении: запустите AE, выполните `install.cmd` без параметров — ждём «Закройте After Effects…» и код 2, ничего не изменилось.
5. Настоящая установка: закройте AE и Premiere, **удалите dev-установку** (`%APPDATA%\Adobe\CEP\extensions\ru.cloud.brandkit` с `.debug` установщик заменит сам), двойной щелчок по `install.cmd`. Затем:
   - AE и Premiere: Window → Extensions → Cloud.ru BrandKit открывается, вставка «Подписи спикера» работает;
   - Premiere: штатная панель Essential Graphics → Browse / Local Templates показывает шаблоны BrandKit;
   - `icacls C:\ProgramData\CloudRuBrandKit` — у группы «Пользователи» (`BUILTIN\Users`) право `(OI)(CI)(M)`.
   Если перед этим панель стояла только как dev-установка и PlayerDebugMode = 1, проверьте ещё раз с PlayerDebugMode = 0 (подписанная панель должна грузиться и без него; верните 1 после проверки — он нужен dev-панели).
6. Обновление: пересоберите пакет с `--library` другой даты (`npm run library:build -- --out C:/CRBK/work/library-v2 --version 2026.10.06`, затем `build.mjs --library C:/CRBK/work/library-v2`) и установите поверх. Ждём «убрано прежних: N», в Local Templates нет дублей.

## Вернуть

Закоммитьте `docs/research/installer/windows.json` (коды выхода и вывод каждого шага, `icacls`, что видно в Essential Graphics, PlayerDebugMode = 0) и запушьте в ту же ветку. Код в `tools/installer/` не чините — опишите; исключение: очевидная опечатка, которая не даёт скрипту запуститься, отдельной строкой в коммите.
