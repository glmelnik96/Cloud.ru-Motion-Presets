# Cloud.ru BrandKit

Панель для After Effects и Premiere: бренд-элементы Cloud.ru, шаблоны и пресеты анимации по кнопке.

- Спецификация: `docs/superpowers/specs/2026-10-02-cloudru-brandkit-design.md`
- Планы: `docs/superpowers/plans/`
- Тесты: `npm test`
- Итоги пробных сборок: `spikes/RESULTS.md` (`npm run spike:report`)
- Панель (фаза 3): `panel/`, план — `docs/superpowers/plans/2026-10-05-phase3-panel.md`
  - `npm run panel:build` — расширение CEP в `panel/dist`; `npm run panel:dev` — интерфейс в браузере на демо-хосте
  - `npm run typecheck` — типы ядра и интерфейса
  - на ПК сборки: `node tools/panel/live.mjs --host ae|pr [--media]` (живые проверки; `--media` — T2/T3 и компаньоны на синтетическом наборе), `node tools/panel/install-dev.mjs`, `node tools/panel/ui-check.mjs --host ae|pr`, `node tools/panel/package-zxp.mjs`
- Установочный пакет: `npm run installer:build -- --zxp <подписанный.zxp> --library <корень>` (`install.cmd` / `install.command` внутри)
- Каталог библиотеки: `npm run library:build` (`library.src.json` + выходы конвейера → `library.json`)

## История репозитория

До октября 2026 здесь жила панель Cloud.ru Motion Presets. Её код остаётся в истории и в ветке `legacy/motion-presets` (последний коммит `54ba96e`). По решению D23 она выводится из работы после v1 BrandKit.
