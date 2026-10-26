# Отчёты живых прогонов

Сюда пишут отчёты живые прогоны панели:
- `node tools/panel/live.mjs --host ae|pr [--media | --export | --rigs | --transfer | --open <проект>]` — `<host>-*-report.json`;
- `node tools/panel/ui-check.mjs --host ae|pr` — `<host>-ui-report.json` и снимки панели.

В репозиторий они не попадают (`.gitignore`): в них пути машины, на которой шёл прогон (решение пользователя 2026-10-26). Итоги прогонов записываются в план фазы (`docs/superpowers/plans/`).
