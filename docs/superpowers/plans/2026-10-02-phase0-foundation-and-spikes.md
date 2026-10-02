# Фаза 0: фундамент и пробные сборки — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Подготовить репозиторий и инструменты, провести пробные сборки S1–S11 с записанными итогами, зафиксировать схему библиотеки, инвентаризацию и лист решений D1–D25. Всё это нужно, чтобы план первого пакета опирался на проверенные факты, а не на догадки.

**Architecture:**
- **Dev-панель BrandKit.** Минимальное CEP-расширение `ru.cloud.brandkit.dev` для AE и Premiere: видимая панель и невидимое фоновое расширение. Фоновое стартует вместе с программой, поэтому раннер работает без ручного открытия панели. Порты CDP: фоновое — 8094 в AE и 8096 в Premiere, панель — 8095 и 8097.
- **Раннер.** Node-скрипт `tools/host-run.mjs` отправляет ES3-код (JSX) в живой хост через `CSInterface.evalScript` этой панели. Перед отправкой — линтер ES3, JSON-полифил и экранирование не-ASCII.
- **Пробные сборки.** Каждая сборка — пара «JSX-проверки + Node-раннер». Итог пишется в `spikes/results/Sn.json`, общий отчёт — в `spikes/RESULTS.md`.
- **Схема и утилиты.** Схема `library.json`, оценка веса, чтение версий шрифтов и инвентаризация — обычные Node-модули с юнит-тестами.

**Tech Stack:** Node 22+ (на машине 24), ESM `.mjs`, vitest, ajv, pngjs, adm-zip, ffmpeg/ffprobe; ExtendScript (ES3) для AE 26.5 и Premiere 26.5.2 (обновлены на этой машине 2 октября 2026); CEP 12.

**Спецификация:** `docs/superpowers/specs/2026-10-02-cloudru-brandkit-design.md`. Особенно §3.1 (S1–S11), §3.3 (состав фазы 0), §4.2 (контракт), §4.4 (библиотека), §9 (решения D1–D25).

**Перед выполнением:**
- Пользователь даёт отмашку на выполнение плана целиком; коммиты — по шагам плана. Исходный пакет `C:\Users\Глеб\Documents\Граф пакет Cloud.ru` только читается.
- **Порядок с планом 2** (`docs/superpowers/plans/2026-10-02-phase1-prep-golden-and-dumps.md`). Оба плана выполняются в одной ветке `phase0-foundation`, по очереди:
  1. План 1, задачи 0–7: репозиторий, инструменты, dev-панель, тестовая фикстура AE.
  2. План 2, задачи 1–3: архив пакета, рабочие копии, перелинковка. Копии нужны S8 (задача 19), а `tools/packs/paths.mjs` (путь к пакету `sourceRoot()`, папка копий `packsDir()`) — S7, S8, S10 и S11.
  3. План 1, задачи 8–28: пробные сборки, схема библиотеки, оценка веса, шрифты, инвентаризация, канон, лист решений, контракт.
  4. План 2, задачи 4–9: ключевые кадры, эталоны, JSX-дампы, сверка логотипа (D18), доктор пакета. Задача 7 плана 2 берёт `brand/tokens.json` (задача 26) и пишет в лист решений (задача 27).
  5. План 1, задачи 29–30: каркас панели и закрытие фазы 0.

---

## Соглашения (общие для всех задач)

**Пути.**
- Репозиторий лежит в пути с кириллицей. Всё, что видит ExtendScript (проекты, рендеры, MOGRT, PNG), складывается в рабочую папку с ASCII-путём: `C:/CRBK/work` на Windows, `/Users/Shared/CRBK/work` на Mac, или из переменной `BRANDKIT_WORK`.
- Путь строит `workPath(...)` из `tools/lib/work.mjs` (задача 3).
- В JSX пути приходят только через `PARAMS` с прямыми слэшами.

**JSX (ExtendScript).** Только ES3: `var`, `function`, без `let/const`, стрелок, шаблонных строк, висячих запятых и зарезервированных слов в ключах объектов.
- **Запрещено:** `Array.prototype.indexOf/map/forEach/filter`, `Object.keys`, `String.prototype.trim` — пишем циклы.
- **Кириллица** — только внутри строк; раннер экранирует её в `\uXXXX`.
- **Последнее выражение** файла — `finish({...})` из `spikes/lib/check.jsx` либо `JSON.stringify(...)`.
- **Изменения в AE** — внутри `app.beginUndoGroup('BK ...')` … `app.endUndoGroup()`.
- **Подавление диалогов** AE (`app.beginSuppressDialogs()` / `app.endSuppressDialogs(false)`) — вокруг импорта, экспорта и сохранения.

**Пробная сборка.** Папка `spikes/sN-<slug>/`:
- **JSX-проверки** — один `probe.jsx` или несколько файлов (`probe-1-….jsx`, `stage-….jsx`, общий `lib.jsx`). В каждом проверки через `check(name, fn, required)` и в конце `finish(data)`.
- **Раннер** `run.mjs` (у S8 — `run-ae.mjs` и `run-pr.mjs`) запускает пробы одним из трёх способов:
  - одна проба — `runSpike({...})` из `tools/spike/runner.mjs` (задача 6);
  - несколько этапов за один запуск, с продолжением `--only` — `runStages` из `tools/spike/multistage.mjs` (задача 15);
  - этапы, которые запускаются отдельно на разных хостах и машинах и копятся в одном итоге, — `writeStageResult` из `tools/spike/stages.mjs` (задача 19).

**Итог и данные.**
- Итог — `spikes/results/SN.json`, сырые данные — `spikes/results/SN.data.json`. Дополнительные файлы-доказательства лежат в `spikes/results/evidence/SN-*.json`.
- **Вердикты:** `yes`; `no`; `partial` — не прошли только необязательные проверки; `not-run` — сборка не проводилась; `measured` — замер без вердикта (S8). Вердикты `not-run` и `measured` закрепляются (`verdictLocked`), и ручные проверки их не меняют.
- **Ручные наблюдения** (воспроизведение, шаги отмены): `node tools/spike/manual.mjs --id SN --check "<имя>" --pass true|false --detail "<текст>"`. Повторная запись с тем же именем заменяет прежнюю.
- **Отчёт:** `npm run spike:report` → `spikes/RESULTS.md`. При закрытии фазы (задача 30) каждый `partial` сводится к «да» или «нет» с выбранным запасным путём.

**Повторы.** Раннер никогда не повторяет вызов. Если изменяющий вызов упал по таймауту, сначала проверьте хост дешёвым чтением (`node tools/host-run.mjs --host ae "JSON.stringify({v: app.version})"`) и только потом действуйте.

**Коммиты:** conventional commits на английском, по одному на задачу, в конце сообщения `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## Структура файлов фазы 0

```text
package.json, vitest.config.mjs, README.md
tools/
  jsx/lint-jsx.cjs            ES3-линтер (из ae-motion-live)
  jsx/prelude-json.jsx        JSON.stringify/parse под гардом
  lib/work.mjs                рабочая папка с ASCII-путём
  lib/payload.mjs             asciiEscape, buildPayload, parseResponse, hostPort
  lib/cdp.mjs                 getPageTarget, cdpEval
  host-run.mjs                run(host, jsx, opts) + CLI
  spike/result.mjs            makeResult, decideVerdict, writeResult, readResults, renderReport, appendManualCheck
  spike/runner.mjs            runSpike({...})
  spike/report.mjs            CLI → spikes/RESULTS.md
  spike/manual.mjs            CLI ручной проверки
  dev/link-harness.ps1, dev/link-harness.sh
dev/harness/                  CEP-расширение ru.cloud.brandkit.dev (AE 8094, Pr 8096)
spikes/
  lib/check.jsx               check(), finish(), hostVersion()
  fixtures/…                  тестовые шаблоны и медиа (задачи частей B и D)
  s1-…/ … s11-…/              пробные сборки
  results/SN.json, RESULTS.md
tests/                        vitest: tests/tools/*.test.mjs
```

Части B–G ниже добавляют свои файлы в `spikes/`, `tools/` и `docs/`.

---

## Часть A. Репозиторий и инструменты

### Task 0: Ветка фазы 0

**Files:** нет.

- [ ] **Step 1: Создать ветку от `main`**

```bash
git -C "C:/Users/Глеб/Documents/Cloud.ru Preset plugin" switch -c phase0-foundation
```

Expected: `Switched to a new branch 'phase0-foundation'`.

### Task 1: Каркас Node-проекта и тестов

**Files:**
- Create: `package.json`, `vitest.config.mjs`, `README.md`, `tests/smoke.test.mjs`
- Modify: `.gitignore`

- [ ] **Step 1: Создать `package.json`**

```json
{
  "name": "cloudru-brandkit",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "description": "Cloud.ru BrandKit: brand templates and presets for After Effects and Premiere",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "vitest run",
    "lint:jsx": "node tools/jsx/lint-jsx.cjs",
    "spike:report": "node tools/spike/report.mjs"
  }
}
```

- [ ] **Step 2: Установить зависимости разработки**

Run: `npm install -D vitest@latest ajv@latest pngjs@latest adm-zip@latest`
Expected: `added N packages`; в `package.json` появился блок `devDependencies` с четырьмя пакетами.

- [ ] **Step 3: Создать `vitest.config.mjs`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.mjs'],
    environment: 'node',
  },
});
```

- [ ] **Step 4: Написать проверочный тест `tests/smoke.test.mjs`**

```js
import { describe, it, expect } from 'vitest';

describe('repo', () => {
  it('runs the test suite', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Запустить тесты**

Run: `npm test`
Expected: `1 passed`.

- [ ] **Step 6: Дописать в `.gitignore` рабочие выходы пробных сборок**

Добавить в конец файла:

```gitignore

# Выходы пробных сборок (рабочая папка C:/CRBK/work — вне репозитория, но на всякий случай)
spikes/fixtures/out/
work/
```

- [ ] **Step 7: Создать `README.md`**

```markdown
# Cloud.ru BrandKit

Панель для After Effects и Premiere: бренд-элементы Cloud.ru, шаблоны и пресеты анимации по кнопке.

- Спецификация: `docs/superpowers/specs/2026-10-02-cloudru-brandkit-design.md`
- Планы: `docs/superpowers/plans/`
- Тесты: `npm test`
- Итоги пробных сборок: `spikes/RESULTS.md` (`npm run spike:report`)
```

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.mjs README.md tests/smoke.test.mjs .gitignore
git commit -m "chore: scaffold node project with vitest" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: ES3-линтер и JSON-полифил для JSX

**Files:**
- Create: `tools/jsx/lint-jsx.cjs` (копия из ae-motion-live с одной правкой), `tools/jsx/prelude-json.jsx`
- Test: `tests/tools/lint-jsx.test.mjs`, `tests/tools/prelude-json.test.mjs`

- [ ] **Step 1: Написать падающие тесты линтера `tests/tools/lint-jsx.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { lint } = require('../../tools/jsx/lint-jsx.cjs');

describe('lint-jsx', () => {
  it('accepts plain ES3', () => {
    const r = lint('var a = 1;\nJSON.stringify({ a: a });');
    expect(r.errors).toEqual([]);
  });
  it('rejects let/const', () => {
    expect(lint('let a = 1; JSON.stringify(a);').errors.join()).toMatch(/let\/const/);
  });
  it('rejects arrow functions', () => {
    expect(lint('var f = (x) => x; JSON.stringify(f(1));').errors.join()).toMatch(/arrow/);
  });
  it('rejects template literals', () => {
    expect(lint('var s = `x`; JSON.stringify(s);').errors.join()).toMatch(/template/);
  });
  it('rejects trailing commas', () => {
    expect(lint('var a = [1, 2,]; JSON.stringify(a);').errors.join()).toMatch(/trailing comma/);
  });
  it('rejects reserved words as object keys', () => {
    expect(lint('var o = { default: 1 }; JSON.stringify(o);').errors.join()).toMatch(/reserved word/);
  });
  it('rejects ES3 future reserved words as names (ExtendScript refuses "native" in Premiere 26.5)', () => {
    expect(lint('var a = 1, native = 2; JSON.stringify(a + native);').errors.join()).toMatch(/reserved word "native" used as a name/);
    expect(lint('function f(int) { return int; } JSON.stringify(f(1));').errors.join()).toMatch(/reserved word "int" used as a name/);
    expect(lint('var nativeName = 1; JSON.stringify(nativeName);').errors).toEqual([]);
  });
  it('rejects Cyrillic outside strings', () => {
    expect(lint('var имя = 1; JSON.stringify(имя);').errors.join()).toMatch(/non-ASCII/);
  });
  it('does not warn about JSON.parse (our prelude polyfills it)', () => {
    const r = lint('var o = JSON.parse("{}"); JSON.stringify(o);');
    expect(r.warnings.join()).not.toMatch(/JSON\.parse/);
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run tests/tools/lint-jsx.test.mjs`
Expected: FAIL — `Cannot find module '../../tools/jsx/lint-jsx.cjs'`.

- [ ] **Step 3: Скопировать линтер из ae-motion-live**

```bash
mkdir -p tools/jsx
cp "C:/Users/Глеб/.claude/skills/ae-motion-live/scripts/lint-jsx.js" tools/jsx/lint-jsx.cjs
```

- [ ] **Step 4: Убрать из копии предупреждение про `JSON.parse`**

В `tools/jsx/lint-jsx.cjs` удалить блок (наш пролог полифилит `parse`):

```js
  if (/JSON\.parse\s*\(/.test(clean) && !opts.lib) {
    warnings.push('JSON.parse used — es-json.jsx only polyfills stringify; pass --lib (adds an eval-based parse) or avoid it');
  }
```

Сразу после цикла правила 3 («Reserved words as object-literal keys») добавить правило 3b. ExtendScript в Premiere 26.5 отвергает весь скрипт из-за `var native` (будущее зарезервированное слово ES3), а хост отвечает только `EvalScript error` (найдено вживую 2026-10-02):

```js
  // 3b. ES3 future reserved words as variable, function or parameter names: ExtendScript rejects the
  //     whole script ("Illegal use of reserved word 'native'", Premiere 26.5, BrandKit 2026-10-02).
  const FUTURE = 'abstract|boolean|byte|char|class|const|debugger|double|enum|export|extends|final|float|goto|implements|import|int|interface|long|native|package|private|protected|public|short|static|super|synchronized|throws|transient|volatile';
  const reName = new RegExp('(?:\\bvar\\s+|\\bfunction\\s+|,\\s*|\\(\\s*)(' + FUTURE + ')\\b(?=\\s*(?:=|,|;|\\)|\\())', 'g');
  while ((m = reName.exec(clean))) {
    errors.push('ES3: reserved word "' + m[1] + '" used as a name at line ' + lineOf(clean, m.index));
  }
```

и вставить в начало файла, после первой строки-комментария, строку происхождения:

```js
// Vendored from ~/.claude/skills/ae-motion-live/scripts/lint-jsx.js (2026-10-02); JSON.parse warning removed; ES3 future reserved words as names added (rule 3b).
```

- [ ] **Step 5: Запустить тесты линтера**

Run: `npx vitest run tests/tools/lint-jsx.test.mjs`
Expected: `9 passed`.

- [ ] **Step 6: Написать падающий тест полифила `tests/tools/prelude-json.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const prelude = readFileSync(new URL('../../tools/jsx/prelude-json.jsx', import.meta.url), 'utf8');

function runWithoutJson(code) {
  const ctx = vm.createContext({});
  return vm.runInContext('JSON = undefined;\n' + prelude + '\n' + code, ctx);
}

describe('prelude-json', () => {
  it('stringifies when JSON is missing', () => {
    expect(runWithoutJson('JSON.stringify({ a: [1, "x\\n", true, null] })'))
      .toBe('{"a":[1,"x\\n",true,null]}');
  });
  it('parses what it stringified', () => {
    expect(runWithoutJson('JSON.parse(JSON.stringify({ b: "q\\"" })).b')).toBe('q"');
  });
  it('rejects non-JSON input in parse', () => {
    expect(() => runWithoutJson('JSON.parse("alert(1)")')).toThrow();
  });
  it('keeps a native JSON untouched', () => {
    const ctx = vm.createContext({});
    const same = vm.runInContext('var n = JSON; ' + prelude + '; JSON === n', ctx);
    expect(same).toBe(true);
  });
});
```

- [ ] **Step 7: Убедиться, что тест падает**

Run: `npx vitest run tests/tools/prelude-json.test.mjs`
Expected: FAIL — `ENOENT ... prelude-json.jsx`.

- [ ] **Step 8: Создать `tools/jsx/prelude-json.jsx`**

Полифил взят из `Extensions-LLM-Chat_Pr/host/premiere.jsx`: он проверен в ExtendScript, а json2.js там не прошёл разбор. Ставится только там, где нативного JSON нет.

```js
// JSON polyfill for ExtendScript (ES3). Installed only where the engine has no native JSON.
// Source: Extensions-LLM-Chat_Pr/host/premiere.jsx (checked in ExtendScript; json2.js fails to parse there).
// parse uses eval: input is always JSON produced by our own tools, never untrusted data.
if (typeof JSON === 'undefined' || JSON === undefined || JSON === null) {
  JSON = {};
}
(function () {
  var esc = {};
  esc['\b'] = '\\b';
  esc['\t'] = '\\t';
  esc['\n'] = '\\n';
  esc['\f'] = '\\f';
  esc['\r'] = '\\r';
  esc['"'] = '\\"';
  esc['\\'] = '\\\\';
  function quote(s) {
    var out = '', i, c, e;
    for (i = 0; i < s.length; i++) {
      c = s.charAt(i);
      e = esc[c];
      if (e) {
        out += e;
      } else if (c.charCodeAt(0) < 32) {
        out += '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
      } else {
        out += c;
      }
    }
    return '"' + out + '"';
  }
  function str(v) {
    var i, k, part, parts;
    if (v === null) { return 'null'; }
    switch (typeof v) {
      case 'string':
        return quote(v);
      case 'number':
        return isFinite(v) ? String(v) : 'null';
      case 'boolean':
        return String(v);
      case 'object':
        parts = [];
        if (v instanceof Array) {
          for (i = 0; i < v.length; i++) { parts[i] = str(v[i]) || 'null'; }
          return '[' + parts.join(',') + ']';
        }
        for (k in v) {
          if (v.hasOwnProperty(k)) {
            part = str(v[k]);
            if (part !== undefined) { parts.push(quote(k) + ':' + part); }
          }
        }
        return '{' + parts.join(',') + '}';
      default:
        return undefined;
    }
  }
  if (typeof JSON.stringify !== 'function') {
    JSON.stringify = function (v) { return str(v); };
  }
  if (typeof JSON.parse !== 'function') {
    JSON.parse = function (t) {
      t = String(t);
      var trimmed = t.replace(/^\s+|\s+$/g, '');
      var first = trimmed.charAt(0);
      if (first !== '{' && first !== '[' && first !== '"' &&
          first !== '-' && (first < '0' || first > '9') &&
          trimmed !== 'true' && trimmed !== 'false' && trimmed !== 'null') {
        throw new SyntaxError('JSON.parse: unexpected input');
      }
      return eval('(' + t + ')');
    };
  }
})();
```

- [ ] **Step 9: Запустить тесты и линтер на самом полифиле**

Run: `npx vitest run tests/tools/prelude-json.test.mjs && node tools/jsx/lint-jsx.cjs tools/jsx/prelude-json.jsx`
Expected: `4 passed`; `OK    tools/jsx/prelude-json.jsx` (допускается предупреждение о последней строке без `JSON.stringify`).

- [ ] **Step 10: Commit**

```bash
git add tools/jsx tests/tools/lint-jsx.test.mjs tests/tools/prelude-json.test.mjs
git commit -m "feat(tools): vendor ES3 lint and JSON prelude for host scripts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: Рабочая папка с ASCII-путём

**Files:**
- Create: `tools/lib/work.mjs`
- Test: `tests/tools/work.test.mjs`

- [ ] **Step 1: Написать падающий тест**

```js
import { describe, it, expect } from 'vitest';
import { workDir, workPath, assertAscii } from '../../tools/lib/work.mjs';

describe('work', () => {
  it('defaults to C:/CRBK/work on Windows', () => {
    expect(workDir({}, 'win32')).toBe('C:/CRBK/work');
  });
  it('defaults to /Users/Shared/CRBK/work on macOS', () => {
    expect(workDir({}, 'darwin')).toBe('/Users/Shared/CRBK/work');
  });
  it('honours BRANDKIT_WORK and normalises slashes', () => {
    expect(workDir({ BRANDKIT_WORK: 'D:\\tmp\\bk' }, 'win32')).toBe('D:/tmp/bk');
  });
  it('rejects non-ASCII paths', () => {
    expect(() => assertAscii('C:/Users/Глеб/x')).toThrow(/ASCII/);
  });
  it('joins parts under the working folder', () => {
    const saved = process.env.BRANDKIT_WORK;
    process.env.BRANDKIT_WORK = 'D:\\tmp\\bk';
    try {
      expect(workPath('fixtures', 'media')).toBe('D:/tmp/bk/fixtures/media');
    } finally {
      if (saved === undefined) delete process.env.BRANDKIT_WORK; else process.env.BRANDKIT_WORK = saved;
    }
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run tests/tools/work.test.mjs`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Создать `tools/lib/work.mjs`**

```js
// Working folder with an ASCII path for everything ExtendScript touches (projects, renders,
// MOGRTs, PNGs). The repo path contains Cyrillic, and AE 26.1+ mangles non-ASCII output paths.
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export function assertAscii(p) {
  if (/[^\x00-\x7f]/.test(String(p))) throw new Error('path must be ASCII: ' + p);
  return p;
}

export function workDir(env = process.env, platform = process.platform) {
  const raw = env.BRANDKIT_WORK || (platform === 'win32' ? 'C:/CRBK/work' : '/Users/Shared/CRBK/work');
  return assertAscii(String(raw).replace(/\\/g, '/'));
}

export function workPath(...parts) {
  return assertAscii(path.posix.join(workDir(), ...parts));
}

export function ensureDir(p) {
  mkdirSync(p, { recursive: true });
  return p;
}
```

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/tools/work.test.mjs`
Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add tools/lib/work.mjs tests/tools/work.test.mjs
git commit -m "feat(tools): ASCII working folder helpers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Dev-панель BrandKit (CEP) для AE и Premiere

**Files:**
- Create: `dev/harness/CSXS/manifest.xml`, `dev/harness/.debug`, `dev/harness/index.html`, `dev/harness/js/harness.js`, `dev/harness/js/CSInterface.js` (копия), `tools/dev/link-harness.ps1`, `tools/dev/link-harness.sh`

- [ ] **Step 1: Создать `dev/harness/CSXS/manifest.xml`**

Общий `HostList` для обоих хостов, как в рабочих манифестах проектов пользователя (Phygital, LLM-Chat), `ExtensionManifest Version="11.0"`. Два расширения:
- `ru.cloud.brandkit.dev.panel` — видимая панель «BrandKit Dev»;
- `ru.cloud.brandkit.dev.bg` — невидимое (`Custom`), стартует с программой (`StartOn` → `applicationActivate`). Раннер говорит с ним, и панель открывать руками не нужно (проверено на AE 26.5 и Pr 26.5.2 2026-10-02).

```xml
<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<ExtensionManifest xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   ExtensionBundleId="ru.cloud.brandkit.dev"
                   ExtensionBundleVersion="0.0.1"
                   ExtensionBundleName="BrandKit Dev"
                   Version="11.0">
  <ExtensionList>
    <Extension Id="ru.cloud.brandkit.dev.panel" Version="0.0.1" />
    <Extension Id="ru.cloud.brandkit.dev.bg" Version="0.0.1" />
  </ExtensionList>
  <ExecutionEnvironment>
    <HostList>
      <Host Name="AEFT" Version="[26.0,99.9]" />
      <Host Name="PPRO" Version="[26.0,99.9]" />
    </HostList>
    <LocaleList>
      <Locale Code="All" />
    </LocaleList>
    <RequiredRuntimeList>
      <RequiredRuntime Name="CSXS" Version="11.0" />
    </RequiredRuntimeList>
  </ExecutionEnvironment>
  <DispatchInfoList>
    <Extension Id="ru.cloud.brandkit.dev.panel">
      <DispatchInfo>
        <Resources>
          <MainPath>./index.html</MainPath>
        </Resources>
        <Lifecycle>
          <AutoVisible>true</AutoVisible>
        </Lifecycle>
        <UI>
          <Type>Panel</Type>
          <Menu>BrandKit Dev</Menu>
          <Geometry>
            <Size>
              <Height>200</Height>
              <Width>320</Width>
            </Size>
          </Geometry>
        </UI>
      </DispatchInfo>
    </Extension>
    <Extension Id="ru.cloud.brandkit.dev.bg">
      <DispatchInfo>
        <Resources>
          <MainPath>./index.html</MainPath>
        </Resources>
        <Lifecycle>
          <AutoVisible>false</AutoVisible>
          <StartOn>
            <Event>applicationActivate</Event>
            <Event>com.adobe.csxs.events.ApplicationActivate</Event>
          </StartOn>
        </Lifecycle>
        <UI>
          <Type>Custom</Type>
          <Geometry>
            <Size>
              <Height>1</Height>
              <Width>1</Width>
            </Size>
          </Geometry>
        </UI>
      </DispatchInfo>
    </Extension>
  </DispatchInfoList>
</ExtensionManifest>
```

- [ ] **Step 2: Создать `dev/harness/.debug` (порт CDP на каждое расширение и хост)**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ExtensionList>
  <Extension Id="ru.cloud.brandkit.dev.bg">
    <HostList>
      <Host Name="AEFT" Port="8094" />
      <Host Name="PPRO" Port="8096" />
    </HostList>
  </Extension>
  <Extension Id="ru.cloud.brandkit.dev.panel">
    <HostList>
      <Host Name="AEFT" Port="8095" />
      <Host Name="PPRO" Port="8097" />
    </HostList>
  </Extension>
</ExtensionList>
```

- [ ] **Step 3: Скопировать `CSInterface.js`**

```bash
mkdir -p dev/harness/js
cp "C:/Users/Глеб/Documents/Cloud.ru-Motion-Presets/lib/CSInterface.js" dev/harness/js/CSInterface.js
```

Expected: файл ~44 КБ, в нём есть `CSInterface.prototype.evalScript`.

- [ ] **Step 4: Создать `dev/harness/index.html`**

```html
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>BrandKit Dev</title>
  <style>
    body { font: 12px/1.4 sans-serif; color: #ddd; background: #232323; margin: 12px; }
    b { color: #26d07c; }
  </style>
</head>
<body>
  <div>BrandKit Dev: <b id="host">…</b></div>
  <div id="status">ожидание хоста</div>
  <script src="js/CSInterface.js"></script>
  <script src="js/harness.js"></script>
</body>
</html>
```

- [ ] **Step 5: Создать `dev/harness/js/harness.js`**

```js
// Dev harness: shows the host and proves evalScript works. The Node runner (tools/host-run.mjs)
// connects over CDP and calls CSInterface.evalScript in this page.
(function () {
  var cs = new CSInterface();
  var env = cs.getHostEnvironment();
  document.getElementById('host').textContent = env.appName + ' ' + env.appVersion;
  cs.evalScript('String(app.version)', function (r) {
    document.getElementById('status').textContent = 'evalScript OK: ' + r;
  });
})();
```

- [ ] **Step 6: Создать `tools/dev/link-harness.ps1`**

```powershell
# Links dev/harness into the per-user CEP extensions folder (a junction: no admin rights needed)
# and reports PlayerDebugMode. It never changes the registry; if the key is missing it prints the command.
$ErrorActionPreference = 'Stop'
$repo = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$src = Join-Path $repo 'dev\harness'
$dst = Join-Path $env:APPDATA 'Adobe\CEP\extensions\ru.cloud.brandkit.dev'
if (Test-Path $dst) {
  $item = Get-Item $dst -Force
  if ($item.LinkType -ne 'Junction') { throw "$dst exists and is not a junction; remove it by hand" }
  cmd /c rmdir "$dst" | Out-Null
}
cmd /c mklink /J "$dst" "$src" | Out-Null
Write-Output "linked: $dst -> $src"
foreach ($v in '11', '12') {
  $key = "HKCU:\Software\Adobe\CSXS.$v"
  $mode = (Get-ItemProperty -Path $key -Name PlayerDebugMode -ErrorAction SilentlyContinue).PlayerDebugMode
  if ($mode -eq '1') { Write-Output "CSXS.$v PlayerDebugMode=1" }
  else { Write-Output "CSXS.$v PlayerDebugMode is not set. Run: reg add HKCU\Software\Adobe\CSXS.$v /v PlayerDebugMode /t REG_SZ /d 1 /f" }
}
```

- [ ] **Step 7: Создать `tools/dev/link-harness.sh` (Mac)**

```bash
#!/bin/bash
# Links dev/harness into the per-user CEP extensions folder on macOS and reports PlayerDebugMode.
set -euo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd)"
dst="$HOME/Library/Application Support/Adobe/CEP/extensions/ru.cloud.brandkit.dev"
mkdir -p "$(dirname "$dst")"
ln -sfn "$repo/dev/harness" "$dst"
echo "linked: $dst -> $repo/dev/harness"
for v in 11 12; do
  mode="$(defaults read com.adobe.CSXS.$v PlayerDebugMode 2>/dev/null || true)"
  if [ "$mode" = "1" ]; then echo "CSXS.$v PlayerDebugMode=1"
  else echo "CSXS.$v PlayerDebugMode is not set. Run: defaults write com.adobe.CSXS.$v PlayerDebugMode 1"; fi
done
```

- [ ] **Step 8: Подключить панель**

Run (PowerShell): `powershell -ExecutionPolicy Bypass -File tools/dev/link-harness.ps1`
Expected:
```text
linked: C:\Users\Глеб\AppData\Roaming\Adobe\CEP\extensions\ru.cloud.brandkit.dev -> ...\dev\harness
CSXS.11 PlayerDebugMode=1
CSXS.12 PlayerDebugMode=1
```

- [ ] **Step 9: Проверить расширение в AE и Premiere**

1. Запустить (или перезапустить) After Effects 2026 и Premiere Pro 2026. Панель открывать не нужно: фоновое расширение стартует само.
2. Run: `curl -s http://localhost:8094/json` и `curl -s http://localhost:8096/json`
   Expected: в каждом ответе объект с `"type": "page"` и `"title": "BrandKit Dev"` (порт появляется через 10–30 с после старта программы).
3. Window → Extensions → «BrandKit Dev» (по желанию): панель показывает `AEFT 26.5…` и `evalScript OK: 26.5…`; её порты — 8095 и 8097.

Если панель не появилась: проверить `%TEMP%\CEP12-AEFT.log` (или `CEP12-PPRO.log`) на «Signature verification failed». На этой машине PlayerDebugMode=1 уже стоит, подпись для dev-панели не нужна.

- [ ] **Step 10: Commit**

```bash
git add dev/harness tools/dev
git commit -m "feat(dev): CEP dev harness for AE (8094) and Premiere (8096)" -m "An invisible background extension starts with the host, so the runner works without opening the panel; the visible panel uses ports 8095 and 8097." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: Раннер JSX через CDP

**Files:**
- Create: `tools/lib/payload.mjs`, `tools/lib/cdp.mjs`, `tools/host-run.mjs`, `tools/debug-probe.mjs`
- Test: `tests/tools/payload.test.mjs`, `tests/tools/host-run.test.mjs`

- [ ] **Step 1: Написать падающие тесты `tests/tools/payload.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { asciiEscape, buildPayload, parseResponse, hostPort } from '../../tools/lib/payload.mjs';

describe('payload', () => {
  it('escapes non-ASCII into \\uXXXX', () => {
    expect(asciiEscape('var s = "Привет";')).toBe('var s = "\\u041f\\u0440\\u0438\\u0432\\u0435\\u0442";');
  });
  it('builds an ASCII-only, syntactically valid expression', () => {
    const p = buildPayload('var s = "Глеб"; JSON.stringify({ s: s });', '/* prelude */');
    expect(/[^\x00-\x7f]/.test(p)).toBe(false);
    expect(() => new vm.Script(p)).not.toThrow();
    expect(p).toContain('evalScript');
  });
  it('parses JSON replies', () => {
    expect(parseResponse('{"a":1}')).toEqual({ a: 1 });
  });
  it('wraps non-JSON replies', () => {
    expect(parseResponse('hello')).toEqual({ raw: 'hello' });
  });
  it('throws on empty replies', () => {
    expect(() => parseResponse('')).toThrow(/HOST_EMPTY/);
    expect(() => parseResponse('undefined')).toThrow(/HOST_EMPTY/);
  });
  it('throws on host errors', () => {
    expect(() => parseResponse('EvalScript error.')).toThrow(/HOST_EVAL_ERROR/);
    expect(() => parseResponse('HOST_BRIDGE_ERROR: x')).toThrow(/HOST_BRIDGE_ERROR/);
  });
  it('maps hosts to ports', () => {
    expect(hostPort('ae', {})).toBe(8094);
    expect(hostPort('pr', {})).toBe(8096);
    expect(hostPort('ae', { BRANDKIT_AE_PORT: '9001' })).toBe(9001);
    expect(() => hostPort('ps', {})).toThrow(/unknown host/);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run tests/tools/payload.test.mjs`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Создать `tools/lib/payload.mjs`**

```js
// CDP expression that runs JSX in the host through the panel's CSInterface.evalScript.
// Non-ASCII characters are escaped to \uXXXX: evalScript on Windows mangles Cyrillic, and inside
// JSX string literals the escape yields the same string. Outside strings the lint forbids non-ASCII.

export function asciiEscape(src) {
  return String(src).replace(/[\u0080-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

export function buildPayload(jsx, prelude = '') {
  const literal = JSON.stringify(asciiEscape(prelude + '\n' + jsx));
  return '(function(){var __jsx=' + literal + ';' +
    'return new Promise(function(res){try{var cs=new CSInterface();' +
    'cs.evalScript(__jsx,function(r){res(r);});}' +
    'catch(e){res("HOST_BRIDGE_ERROR: "+String(e));}});})()';
}

export function parseResponse(str) {
  if (typeof str !== 'string' || str === '' || str === 'undefined' || str === 'null') {
    throw new Error('HOST_EMPTY: the host returned nothing (does the JSX end with JSON.stringify(...) or finish(...)?)');
  }
  if (str.indexOf('HOST_BRIDGE_ERROR') === 0) throw new Error(str);
  if (str.indexOf('EvalScript error') === 0) throw new Error('HOST_EVAL_ERROR: ' + str);
  try {
    return JSON.parse(str);
  } catch {
    return { raw: str };
  }
}

export function hostPort(host, env = process.env) {
  if (host === 'ae') return Number(env.BRANDKIT_AE_PORT || 8094);
  if (host === 'pr') return Number(env.BRANDKIT_PR_PORT || 8096);
  throw new Error('unknown host: ' + host + ' (expected ae or pr)');
}
```

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/tools/payload.test.mjs`
Expected: `7 passed`.

- [ ] **Step 5: Создать `tools/lib/cdp.mjs`**

Перенесено из `Edit_Skill/scripts/lib/cdp.mjs`: промис выполняется только после закрытия сокета, иначе при немедленном выходе процесса бывает сбой libuv.

```js
// Chrome DevTools Protocol: find the panel page and evaluate one expression in it.
export async function getPageTarget(port) {
  let targets;
  try {
    const res = await fetch(`http://localhost:${port}/json`);
    targets = await res.json();
  } catch (e) {
    throw new Error(`CDP_UNREACHABLE: port ${port} — open the BrandKit Dev panel (Window > Extensions) (${e.message})`);
  }
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error(`CDP_NO_PAGE: no page target on port ${port} (panel closed?)`);
  return page;
}

export function cdpEval(wsUrl, expression, { timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let outcome = null;
    const deliver = () => (outcome.err ? reject(outcome.err) : resolve(outcome.value));
    const finish = (err, value) => {
      if (outcome) return;
      outcome = { err, value };
      clearTimeout(timer);
      try { ws.close(); } catch { deliver(); }
    };
    const timer = setTimeout(() => finish(new Error(
      `CDP_TIMEOUT: ${timeoutMs} ms — a modal dialog may be blocking the host; check the host before any new call`)), timeoutMs);
    ws.onclose = () => {
      clearTimeout(timer);
      if (!outcome) outcome = { err: new Error('CDP_CLOSED: socket closed before the reply') };
      deliver();
    };
    ws.onerror = (e) => finish(new Error('CDP_WS_ERROR: ' + ((e && e.message) || e)));
    ws.onopen = () => ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression, returnByValue: true, awaitPromise: true },
    }));
    ws.onmessage = (msg) => {
      let data;
      try { data = JSON.parse(msg.data); } catch { return; }
      if (data.id !== 1) return;
      if (data.error) { finish(new Error('CDP_ERROR: ' + JSON.stringify(data.error))); return; }
      const r = data.result || {};
      if (r.exceptionDetails) {
        const ex = r.exceptionDetails;
        finish(new Error('CDP_EXCEPTION: ' + ((ex.exception && ex.exception.description) || ex.text)));
        return;
      }
      finish(null, r.result ? r.result.value : undefined);
    };
  });
}
```

- [ ] **Step 6: Написать падающий тест `tests/tools/host-run.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { parseCli, lintOrThrow, PRELUDE } from '../../tools/host-run.mjs';

describe('host-run', () => {
  it('parses CLI flags', () => {
    expect(parseCli(['--host', 'pr', '--timeout', '5000', '--no-lint', '@x.jsx']))
      .toEqual({ host: 'pr', timeoutMs: 5000, lint: false, arg: '@x.jsx' });
  });
  it('defaults timeout and lint', () => {
    expect(parseCli(['--host', 'ae', 'JSON.stringify(1)']))
      .toEqual({ host: 'ae', timeoutMs: 120000, lint: true, arg: 'JSON.stringify(1)' });
  });
  it('rejects ES5+ payloads before they reach the host', () => {
    expect(() => lintOrThrow('let a = 1; JSON.stringify(a);')).toThrow(/LINT/);
  });
  it('returns warnings for valid ES3', () => {
    expect(lintOrThrow('var a = 1; JSON.stringify(a);')).toEqual([]);
  });
  it('loads the JSON prelude', () => {
    expect(PRELUDE).toContain('JSON.parse');
  });
});
```

- [ ] **Step 7: Убедиться, что тест падает**

Run: `npx vitest run tests/tools/host-run.test.mjs`
Expected: FAIL — модуль не найден.

- [ ] **Step 8: Создать `tools/host-run.mjs`**

```js
#!/usr/bin/env node
// Run JSX in a live AE or Premiere through the BrandKit dev panel (CDP 8094 / 8096).
//   node tools/host-run.mjs --host ae "@spikes/x.jsx"
//   node tools/host-run.mjs --host pr --timeout 300000 "JSON.stringify({ v: app.version })"
// The JSX must end with an expression that returns a JSON string (JSON.stringify(...) or finish(...)).
// No retries: a mutating call that timed out is never re-sent (spec §6).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPayload, parseResponse, hostPort } from './lib/payload.mjs';
import { getPageTarget, cdpEval } from './lib/cdp.mjs';

const require = createRequire(import.meta.url);
const { lint } = require('./jsx/lint-jsx.cjs');
const here = path.dirname(fileURLToPath(import.meta.url));

export const PRELUDE = readFileSync(path.join(here, 'jsx', 'prelude-json.jsx'), 'utf8');

export function lintOrThrow(jsx) {
  const r = lint(jsx, {});
  if (r.errors.length) throw new Error('LINT: ' + r.errors.join('; '));
  return r.warnings.filter((w) => !/last statement does not call JSON\.stringify/.test(w));
}

export async function run(host, jsx, { timeoutMs = 120000, lint: doLint = true, prelude = true } = {}) {
  if (doLint) lintOrThrow(jsx);
  const page = await getPageTarget(hostPort(host));
  const raw = await cdpEval(page.webSocketDebuggerUrl, buildPayload(jsx, prelude ? PRELUDE : ''), { timeoutMs });
  return parseResponse(raw);
}

export function parseCli(argv) {
  const o = { host: null, timeoutMs: 120000, lint: true, arg: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--host') { o.host = argv[i + 1]; i += 1; }
    else if (a === '--timeout') { o.timeoutMs = Number(argv[i + 1]); i += 1; }
    else if (a === '--no-lint') o.lint = false;
    else if (o.arg === null) o.arg = a;
  }
  return o;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const o = parseCli(process.argv.slice(2));
  if (!o.host || !o.arg) {
    console.error('usage: node tools/host-run.mjs --host ae|pr [--timeout ms] [--no-lint] "@file.jsx" | "<inline jsx>"');
    process.exit(2);
  }
  try {
    const jsx = o.arg.startsWith('@') ? readFileSync(o.arg.slice(1), 'utf8') : o.arg;
    if (o.lint) lintOrThrow(jsx).forEach((w) => console.error('LINT WARN: ' + w));
    const v = await run(o.host, jsx, { timeoutMs: o.timeoutMs, lint: false });
    console.log(JSON.stringify(v, null, 2));
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
}
```

- [ ] **Step 9: Запустить тесты**

Run: `npx vitest run tests/tools/host-run.test.mjs tests/tools/payload.test.mjs`
Expected: `12 passed`.

- [ ] **Step 10: Живая проверка в AE и Premiere (панели открыты, задача 4)**

Run: `node tools/host-run.mjs --host ae "JSON.stringify({ v: String(app.version), name: 'Глеб' })"`
Expected: `{ "v": "26.5…", "name": "Глеб" }` — кириллица пришла целой.

Run: `node tools/host-run.mjs --host pr "JSON.stringify({ v: String(app.version) })"`
Expected: `{ "v": "26.5.2…" }`.

- [ ] **Step 11: Создать отладчик проб `tools/debug-probe.mjs`**

Если хост отвечает только `EvalScript error`, в ExtendScript синтаксическая ошибка: обычный `try/catch` вокруг кода её не ловит. Отладчик склеивает пробу как раннеры сборок и выполняет её через `eval` строки. Тогда и синтаксическая, и ошибка выполнения возвращаются с номером строки, а отладчик печатает строки вокруг неё. Так 2026-10-02 нашлось `var native` в пробе S8 (зарезервированное слово ES3).

`tools/debug-probe.mjs`:

```js
#!/usr/bin/env node
// Debug a probe that dies with "EvalScript error": compose it like the spike runners do, wrap it in
// try/catch and print the ExtendScript error with its line, so the failing statement can be found.
//   node tools/debug-probe.mjs --host ae|pr --params '<json>' <file.jsx> [<file.jsx> ...]
import { composeProbe } from './spike/runner.mjs';
import { run, PRELUDE } from './host-run.mjs';

const argv = process.argv.slice(2);
const val = (f) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : null);
const host = val('--host');
const params = JSON.parse(val('--params') || '{}');
const files = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--host' && argv[i - 1] !== '--params');
if (!host || !files.length) {
  console.error("usage: node tools/debug-probe.mjs --host ae|pr --params '<json>' <file.jsx> [...]");
  process.exitCode = 2;
} else {
  // eval of the code as a string: a runtime error AND a syntax error (which a plain try/catch around
  // the code cannot catch, the host only says "EvalScript error") come back with their line.
  const body = composeProbe(files, params);
  const wrapped = 'try { eval(' + JSON.stringify(body) + '); } catch (__e) { '
    + 'JSON.stringify({ debugError: String(__e), line: __e.line }); }';
  const r = await run(host, wrapped, { timeoutMs: 120000, lint: false, prelude: true });
  console.log(JSON.stringify(r, null, 2).slice(0, 4000));
  if (r && r.line) {
    const lines = body.split('\n');
    const at = r.line - 1;
    for (let i = Math.max(0, at - 3); i <= Math.min(lines.length - 1, at + 2); i++) console.log((i === at ? '>> ' : '   ') + (i + 1) + ': ' + lines[i]);
  }
}
```

Run: `node tools/debug-probe.mjs; echo "exit $?"`
Expected: строка `usage: node tools/debug-probe.mjs --host ae|pr --params '<json>' <file.jsx> [...]` и `exit 2`.

- [ ] **Step 12: Commit**

```bash
git add tools/lib/payload.mjs tools/lib/cdp.mjs tools/host-run.mjs tools/debug-probe.mjs tests/tools/payload.test.mjs tests/tools/host-run.test.mjs
git commit -m "feat(tools): run JSX in AE and Premiere over CDP" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: Итоги пробных сборок и общий раннер

**Files:**
- Create: `tools/spike/result.mjs`, `tools/spike/runner.mjs`, `tools/spike/report.mjs`, `tools/spike/manual.mjs`, `spikes/lib/check.jsx`, `spikes/results/.gitkeep`
- Test: `tests/tools/spike-result.test.mjs`

- [ ] **Step 1: Написать падающий тест**

```js
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  decideVerdict, makeResult, writeResult, readResults, renderReport, appendManualCheck,
} from '../../tools/spike/result.mjs';

const ok = (name, required = true) => ({ name, pass: true, required, detail: '' });
const bad = (name, required = true) => ({ name, pass: false, required, detail: 'x' });

describe('spike results', () => {
  it('decides verdicts from checks', () => {
    expect(decideVerdict([])).toBe('not-run');
    expect(decideVerdict([ok('a'), ok('b')])).toBe('yes');
    expect(decideVerdict([ok('a'), bad('b', false)])).toBe('partial');
    expect(decideVerdict([ok('a'), bad('b')])).toBe('no');
  });
  it('validates results', () => {
    expect(() => makeResult({ id: 'X1', title: 't', host: 'ae', checks: [] })).toThrow(/spike id/);
    expect(() => makeResult({ id: 'S1', title: 't', host: 'ae', checks: [], verdict: 'maybe' })).toThrow(/verdict/);
    expect(() => makeResult({ id: 'S1', title: 't', host: 'ae', checks: [{ name: 'a' }] })).toThrow(/check/);
  });
  it('round-trips through files and renders a sorted report', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-'));
    writeResult(makeResult({ id: 'S10', title: 'AME | queue', host: 'ae', checks: [ok('a')], date: '2026-10-05' }), dir);
    writeResult(makeResult({ id: 'S2', title: 'MOGRT export', host: 'ae', checks: [bad('a')], fallback: 'manual export', date: '2026-10-05' }), dir);
    const md = renderReport(readResults(dir));
    expect(md.indexOf('| S2 |')).toBeLessThan(md.indexOf('| S10 |'));
    expect(md).toContain('AME \\| queue');
    expect(md).toContain('| no | 0/1 | manual export |');
  });
  it('appends manual checks and recomputes the verdict', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-'));
    writeResult(makeResult({ id: 'S5', title: 'importMGT', host: 'pr', checks: [ok('auto')], date: '2026-10-05' }), dir);
    const r = appendManualCheck('S5', { name: 'undo steps', pass: false, detail: '3 steps' }, dir);
    expect(r.checks).toHaveLength(2);
    expect(r.verdict).toBe('no');
  });
  it('replaces a manual check with the same name instead of duplicating it', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-'));
    writeResult(makeResult({ id: 'S10', title: 'AME', host: 'ae', checks: [ok('auto')], date: '2026-10-05' }), dir);
    appendManualCheck('S10', { name: 'persist after restart', pass: false }, dir);
    const r = appendManualCheck('S10', { name: 'persist after restart', pass: true }, dir);
    expect(r.checks).toHaveLength(2);
    expect(r.verdict).toBe('yes');
  });
  it('keeps a locked verdict (measured, not-run) when manual checks are added', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-'));
    writeResult(makeResult({ id: 'S8', title: 'perf', host: 'pr', checks: [ok('export timed')], verdict: 'measured', verdictLocked: true, date: '2026-10-05' }), dir);
    const r = appendManualCheck('S8', { name: 'playback FHD real time', pass: false, detail: 'drops' }, dir);
    expect(r.verdict).toBe('measured');
    expect(r.verdictLocked).toBe(true);
    expect(() => makeResult({ id: 'S9', title: 'uxp', host: 'pr', checks: [], verdictLocked: true })).toThrow(/locked/);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run tests/tools/spike-result.test.mjs`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Создать `tools/spike/result.mjs`**

```js
// Spike results: one JSON file per spike in spikes/results, rendered into spikes/RESULTS.md.
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 'measured' is for spikes that only measure (S8 in phase 0); 'not-run' for spikes that could not run.
export const VERDICTS = ['yes', 'no', 'partial', 'not-run', 'measured'];
const here = path.dirname(fileURLToPath(import.meta.url));
export const RESULTS_DIR = path.resolve(here, '../../spikes/results');

export function decideVerdict(checks) {
  if (!checks.length) return 'not-run';
  if (checks.some((c) => c.required !== false && !c.pass)) return 'no';
  return checks.every((c) => c.pass) ? 'yes' : 'partial';
}

// verdictLocked: the verdict was set on purpose (measured, not-run) and manual checks must not change it.
export function makeResult({ id, title, host, hostVersion = null, checks = [], verdict, verdictLocked = false, fallback = '', notes = '', evidence = [], date }) {
  if (!/^S\d+$/.test(String(id))) throw new Error('bad spike id: ' + id);
  for (const c of checks) {
    if (!c || typeof c.name !== 'string' || typeof c.pass !== 'boolean') throw new Error('bad check: ' + JSON.stringify(c));
  }
  if (verdictLocked && !verdict) throw new Error('a locked verdict needs an explicit verdict');
  const v = verdict || decideVerdict(checks);
  if (!VERDICTS.includes(v)) throw new Error('bad verdict: ' + v);
  return {
    id, title, host, hostVersion,
    date: date || new Date().toISOString().slice(0, 10),
    verdict: v, verdictLocked: Boolean(verdictLocked), checks, fallback, notes, evidence,
  };
}

export function writeResult(result, dir = RESULTS_DIR) {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, result.id + '.json');
  writeFileSync(file, JSON.stringify(result, null, 2) + '\n', 'utf8');
  return file;
}

export function readResults(dir = RESULTS_DIR) {
  let names;
  try { names = readdirSync(dir).filter((n) => /^S\d+\.json$/.test(n)); } catch { return []; }
  return names.map((n) => JSON.parse(readFileSync(path.join(dir, n), 'utf8')));
}

// Adds a manual observation; a manual check with the same name is replaced, so re-runs do not duplicate it.
export function appendManualCheck(id, check, dir = RESULTS_DIR) {
  const file = path.join(dir, id + '.json');
  const r = JSON.parse(readFileSync(file, 'utf8'));
  const entry = { required: true, detail: '', ...check, manual: true };
  const checks = r.checks.filter((c) => !(c.manual && c.name === entry.name)).concat([entry]);
  const next = makeResult({ ...r, checks, verdict: r.verdictLocked ? r.verdict : undefined });
  writeResult(next, dir);
  return next;
}

const esc = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|');

export function renderReport(results) {
  const rows = [...results].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
  const lines = [
    '# Пробные сборки фазы 0 — итоги',
    '',
    'Собирается командой `npm run spike:report` из `spikes/results/*.json`; руками не править.',
    '',
    '| # | Что | Хост | Версия | Итог | Проверки | Запасной путь |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    const passed = r.checks.filter((c) => c.pass).length;
    lines.push(`| ${r.id} | ${esc(r.title)} | ${esc(r.host)} | ${esc(r.hostVersion || '—')} | ${r.verdict} | ${passed}/${r.checks.length} | ${esc(r.fallback || '—')} |`);
  }
  return lines.join('\n') + '\n';
}
```

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/tools/spike-result.test.mjs`
Expected: `6 passed`.

- [ ] **Step 5: Создать `spikes/lib/check.jsx` (помощник проверок в хосте)**

```js
// Check helper for spike probes (ES3). Each check is a no-arg function returning true/false or
// { pass: bool, detail: any }. Exceptions are recorded as a failed check, never thrown to the host.
var __CHECKS = [];
function check(name, fn, required) {
  var c = { name: name, pass: false, required: required !== false, detail: '' };
  try {
    var r = fn();
    if (r === true || r === false) {
      c.pass = r;
    } else if (r && typeof r === 'object') {
      c.pass = r.pass === true;
      c.detail = (r.detail === undefined) ? '' : r.detail;
    } else {
      c.detail = 'unexpected return: ' + String(r);
    }
  } catch (e) {
    c.detail = 'EXC: ' + String(e) + ((e && e.line) ? ' (line ' + e.line + ')' : '');
  }
  __CHECKS.push(c);
  return c.pass;
}
function hostVersion() {
  return String(app.version);
}
function finish(data) {
  data = data || {};
  data.hostVersion = hostVersion();
  return JSON.stringify({ checks: __CHECKS, data: data });
}
```

- [ ] **Step 6: Создать `tools/spike/runner.mjs`**

```js
// Runs one spike probe in the host and records its result.
//   runSpike({ id, title, host, files, params, timeoutMs, fallback, notes, evidence, verdict, verdictLocked })
// files: JSX files concatenated after `var PARAMS = <json>;` and spikes/lib/check.jsx.
// The probe must end with finish({...}) from check.jsx. Pass verdict + verdictLocked only for
// spikes that measure without a yes/no (S8 in phase 0).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../host-run.mjs';
import { makeResult, writeResult } from './result.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(here, '../..');
const CHECK_LIB = path.join(REPO, 'spikes', 'lib', 'check.jsx');

export function composeProbe(files, params = {}) {
  const parts = ['var PARAMS = ' + JSON.stringify(params) + ';', readFileSync(CHECK_LIB, 'utf8')];
  for (const f of files) parts.push(readFileSync(path.resolve(REPO, f), 'utf8'));
  return parts.join('\n');
}

export async function runSpike({ id, title, host, files, params = {}, timeoutMs = 300000, fallback = '', notes = '', evidence = [], verdict, verdictLocked = false }) {
  const jsx = composeProbe(files, params);
  const r = await run(host, jsx, { timeoutMs });
  if (!r || !Array.isArray(r.checks)) {
    throw new Error(id + ': the probe must return finish({...}); got ' + JSON.stringify(r).slice(0, 300));
  }
  const result = makeResult({
    id, title, host,
    hostVersion: r.data ? r.data.hostVersion : null,
    checks: r.checks, verdict, verdictLocked, fallback, notes, evidence,
  });
  const file = writeResult(result);
  return { result, file, data: r.data };
}
```

- [ ] **Step 7: Создать `tools/spike/report.mjs` и `tools/spike/manual.mjs`**

`tools/spike/report.mjs`:

```js
#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readResults, renderReport } from './result.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../../spikes/RESULTS.md');
writeFileSync(out, renderReport(readResults()), 'utf8');
console.log('written ' + out);
```

`tools/spike/manual.mjs`:

```js
#!/usr/bin/env node
// Record a manual observation: node tools/spike/manual.mjs --id S8 --check "FHD real time" --pass true --detail "no drops"
import { appendManualCheck } from './result.mjs';

const argv = process.argv.slice(2);
const val = (f) => { const i = argv.indexOf(f); return i === -1 ? undefined : argv[i + 1]; };
const id = val('--id');
const name = val('--check');
const pass = val('--pass');
if (!id || !name || (pass !== 'true' && pass !== 'false')) {
  console.error('usage: node tools/spike/manual.mjs --id SN --check "<name>" --pass true|false [--detail "<text>"] [--optional]');
  process.exit(2);
}
const r = appendManualCheck(id, {
  name, pass: pass === 'true', detail: val('--detail') || '', required: !argv.includes('--optional'),
});
console.log(id + ': ' + r.verdict + ' (' + r.checks.length + ' checks)');
```

- [ ] **Step 8: Проверить композицию проб и запустить все тесты**

Run: `node -e "import('./tools/spike/runner.mjs').then(m => console.log(m.composeProbe([], { a: 1 }).slice(0, 40)))"`
Expected: `var PARAMS = {"a":1};` и начало `check.jsx`.

Run: `node tools/jsx/lint-jsx.cjs spikes/lib/check.jsx && npm test`
Expected: `OK    spikes/lib/check.jsx`; все тесты зелёные.

- [ ] **Step 9: Commit**

```bash
mkdir -p spikes/results && touch spikes/results/.gitkeep
git add tools/spike spikes/lib/check.jsx spikes/results/.gitkeep tests/tools/spike-result.test.mjs
git commit -m "feat(spikes): result records, report and shared probe runner" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Часть B. Тестовая фикстура AE и пробные сборки S1, S2, S4, S10

Часть B строит общую тестовую фикстуру After Effects (задача 7) и проводит на ней четыре пробные сборки в AE: S1, S2, S4 и S10 (задачи 8–11). Задачи идут строго по порядку: S2 берёт проект и имена свойств из S1, все пробы открывают фикстуру задачи 7.

**Зависимости.**
- Часть A (задачи 1–6): `run` (`tools/host-run.mjs`), `runSpike`/`composeProbe`/`REPO` (`tools/spike/runner.mjs`), `makeResult`/`writeResult`/`readResults`/`appendManualCheck` (`tools/spike/result.mjs`), `tools/spike/manual.mjs`, `workPath`/`workDir`/`ensureDir`, `spikes/lib/check.jsx`, линтер, панель BrandKit Dev в AE (CDP 8094).
- План 2, задачи 1–3 (идут между задачами 7 и 8): `sourceRoot()` из `tools/packs/paths.mjs` — путь к исходному пакету, его задаёт переменная `BRANDKIT_SOURCE`. S10 (задача 11) берёт из пакета брендовый `FullHD.epr`.

**Что часть B даёт другим частям**
- `spikes/fixtures/contract.mjs` — имена композиций, подписи Essential Graphics в порядке добавления (на этот порядок опирается S9 части E), маркеры и пути фикстуры. Другие части берут их отсюда, а не пишут заново.
- `spikes/lib/ae-project.jsx` — открыть, создать и сохранить проект в рабочей папке; вызов с подавленными окнами ошибок (`bkQuiet`); найти композицию, слой и эффект; список выражений; маркеры композиции.
- `tools/lib/media-probe.mjs` (ffprobe), `tools/spike/wait-file.mjs` (дождаться файла, который пишет другой процесс), `tools/spike/mogrt.mjs` (прочитать поля `.mogrt`). Ожидание файлов и чтение MOGRT — общие помощники: части C, D и E берут их отсюда, а не пишут свои.
- В рабочей папке: `fixtures/media/*`, `fixtures/CRT_fixture.aep`, `fixtures/CRT_fixture_egp.aep` (после S1), `mogrt/CRT_LowerThird_v1.mogrt` и `mogrt/CRT_Hatch_v1.mogrt` (после S2).

**Правила прогонов в AE (задачи 7–11)**
- Пробы открывают, создают и закрывают только проекты из рабочей папки. Если в AE открыт несохранённый проект пользователя, проба его не трогает: первая проверка падает с `BK_DIRTY_USER_PROJECT`, и AE не показывает окно «Сохранить изменения?».
- Каждая проба заканчивается сохранённым проектом без изменений, поэтому следующая открывает фикстуру без вопросов.
- Перед прогоном Node переименовывает прежний выход в `*.prev.aep`: AE сохраняет в свободное имя и не спрашивает о перезаписи.
- Во время прогона в AE ничего не нажимать. Если появилось модальное окно: закрыть его, записать ручной проверкой через `manual.mjs`; новый вызов — только после дешёвого чтения (раздел «Повторы»).
- Повторный прогон перезаписывает `spikes/results/SN.json`; ручные проверки после него записываются заново.
- Имена проверок — на английском: это данные для скриптов. Пояснения для людей — в `notes` и в этом плане.

### Task 7: Тестовая фикстура: медиа и проект AE

**Files:**
- Create: `tools/lib/media-probe.mjs`, `spikes/fixtures/make-media.mjs`, `spikes/lib/ae-project.jsx`, `spikes/fixtures/contract.mjs`, `spikes/fixtures/build-ae-fixture.jsx`, `spikes/fixtures/build-ae-fixture.mjs`
- Test: `tests/tools/media-probe.test.mjs`, `tests/spikes/make-media.test.mjs`, `tests/spikes/ae-project.test.mjs`

- [ ] **Step 1: Написать падающий тест `tests/tools/media-probe.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { frameRate, summarize } from '../../tools/lib/media-probe.mjs';

describe('media-probe', () => {
  it('turns ffprobe rates into numbers', () => {
    expect(frameRate('25/1')).toBe(25);
    expect(frameRate('30000/1001')).toBe(29.97);
    expect(frameRate('0/0')).toBe(null);
    expect(frameRate(undefined)).toBe(null);
  });
  it('summarises a ProRes 4444 movie with alpha', () => {
    const s = summarize({
      streams: [{ codec_type: 'video', codec_name: 'prores', profile: '4444', width: 1920, height: 1080,
        avg_frame_rate: '25/1', pix_fmt: 'yuva444p12le', nb_frames: '125' }],
      format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '5.000000' },
    });
    expect(s.video).toEqual({ codec: 'prores', profile: '4444', width: 1920, height: 1080, fps: 25,
      pixFmt: 'yuva444p12le', frames: 125 });
    expect(s.duration).toBe(5);
    expect(s.audio).toBe(null);
  });
  it('summarises an audio-only file and ignores N/A counts', () => {
    const s = summarize({
      streams: [{ codec_type: 'audio', codec_name: 'pcm_s16le', sample_rate: '48000', channels: 2, nb_frames: 'N/A' }],
      format: { format_name: 'wav', duration: '5.000000' },
    });
    expect(s.video).toBe(null);
    expect(s.audio).toEqual({ codec: 'pcm_s16le', sampleRate: 48000, channels: 2 });
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run tests/tools/media-probe.test.mjs`
Expected: FAIL — модуль `tools/lib/media-probe.mjs` не найден.

- [ ] **Step 3: Создать `tools/lib/media-probe.mjs`**

```js
// ffprobe wrapper: one JSON call per file, summarised to the fields the spikes compare.
import { spawnSync } from 'node:child_process';

export function hasBinary(bin) {
  const r = spawnSync(bin, ['-version'], { encoding: 'utf8' });
  return r.status === 0;
}

export function ffprobeJson(file, bin = 'ffprobe') {
  const r = spawnSync(bin, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) throw new Error('ffprobe failed for ' + file + ': ' + String(r.stderr || r.error || '').trim());
  return JSON.parse(r.stdout);
}

const num = (v) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export function frameRate(s) {
  if (!s || s === '0/0') return null;
  const [n, d] = String(s).split('/').map(Number);
  if (!Number.isFinite(n)) return null;
  return d ? Math.round((n / d) * 1000) / 1000 : n;
}

export function summarize(j) {
  const streams = (j && j.streams) || [];
  const v = streams.find((s) => s.codec_type === 'video') || null;
  const a = streams.find((s) => s.codec_type === 'audio') || null;
  const fmt = (j && j.format) || {};
  return {
    container: fmt.format_name || null,
    duration: num(fmt.duration),
    video: v && {
      codec: v.codec_name,
      profile: v.profile || null,
      width: v.width,
      height: v.height,
      fps: frameRate(v.avg_frame_rate) || frameRate(v.r_frame_rate),
      pixFmt: v.pix_fmt || null,
      frames: num(v.nb_frames),
    },
    audio: a && { codec: a.codec_name, sampleRate: num(a.sample_rate), channels: a.channels },
  };
}

export function probeMedia(file, bin = 'ffprobe') {
  return summarize(ffprobeJson(file, bin));
}
```

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/tools/media-probe.test.mjs`
Expected: `3 passed`.

- [ ] **Step 5: Написать падающий тест `tests/spikes/make-media.test.mjs`**

Тесты с ffmpeg пропускаются, если ffmpeg или ffprobe нет в `PATH`.

```js
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { hexToRgb, solidPng, makeMedia, MEDIA, ffmpegArgs } from '../../spikes/fixtures/make-media.mjs';
import { hasBinary, probeMedia } from '../../tools/lib/media-probe.mjs';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'bk-media-'));
const pixel = (png, x, y) => {
  const i = (png.width * y + x) * 4;
  return Array.from(png.data.slice(i, i + 4));
};
const withFfmpeg = hasBinary('ffmpeg') && hasBinary('ffprobe');
// ffmpeg encodes take seconds on a slow machine: these two tests get 60 s instead of the default 5 s.

describe('make-media', () => {
  it('parses hex colours', () => {
    expect(hexToRgb('#0063FF')).toEqual([0, 99, 255]);
    expect(hexToRgb('FF4517')).toEqual([255, 69, 23]);
    expect(() => hexToRgb('#12345')).toThrow(/hex/);
  });

  it('draws a solid PNG of the requested size and colour', () => {
    const png = PNG.sync.read(solidPng(400, 400, '#0063FF'));
    expect([png.width, png.height]).toEqual([400, 400]);
    expect(pixel(png, 0, 0)).toEqual([0, 99, 255, 255]);
    expect(pixel(png, 399, 399)).toEqual([0, 99, 255, 255]);
  });

  it('lists every file of the fixture contract', () => {
    expect(MEDIA.map((m) => m.name)).toEqual([
      'slot_a.png', 'slot_b.png', 'bars_1080p25_30s.mp4', 'bars2_1080p25_10s.mp4',
      'alpha_prores4444_1080p25_5s.mov', 'tone_48k_5s.wav',
    ]);
    const bars = MEDIA.find((m) => m.name === 'bars_1080p25_30s.mp4');
    expect(ffmpegArgs(bars, 'o.mp4').join(' ')).toContain('testsrc2=size=1920x1080:rate=25:duration=30');
    expect(ffmpegArgs(bars, 'o.mp4').at(-1)).toBe('o.mp4');
  });

  it('writes both slot PNGs and skips ffmpeg media when ffmpeg is off', () => {
    const dir = tmp();
    const res = makeMedia({ dir, ffmpeg: false });
    const status = Object.fromEntries(res.map((r) => [r.name, r.status]));
    expect(status['slot_a.png']).toBe('created');
    expect(status['slot_b.png']).toBe('created');
    expect(status['bars_1080p25_30s.mp4']).toBe('skipped-no-ffmpeg');
    const b = PNG.sync.read(readFileSync(path.join(dir, 'slot_b.png')));
    expect([b.width, b.height]).toEqual([400, 400]);
    expect(pixel(b, 200, 200)).toEqual([255, 69, 23, 255]);
  });

  it('keeps existing files unless forced', () => {
    const dir = tmp();
    makeMedia({ dir, ffmpeg: false, only: ['slot_a.png'] });
    expect(makeMedia({ dir, ffmpeg: false, only: ['slot_a.png'] })[0].status).toBe('exists');
    expect(makeMedia({ dir, ffmpeg: false, only: ['slot_a.png'], force: true })[0].status).toBe('created');
  });

  it.skipIf(!withFfmpeg)('renders the 48 kHz stereo tone with ffmpeg', () => {
    const [r] = makeMedia({ dir: tmp(), only: ['tone_48k_5s.wav'] });
    expect(r.status).toBe('created');
    const s = probeMedia(r.file);
    expect(s.audio).toEqual({ codec: 'pcm_s16le', sampleRate: 48000, channels: 2 });
    expect(s.duration).toBeCloseTo(5, 1);
  }, 60000);

  it.skipIf(!withFfmpeg)('renders ProRes 4444 with alpha', () => {
    const [r] = makeMedia({ dir: tmp(), only: ['alpha_prores4444_1080p25_5s.mov'] });
    expect(r.status).toBe('created');
    const s = probeMedia(r.file);
    expect(s.video).toMatchObject({ codec: 'prores', profile: '4444', width: 1920, height: 1080, fps: 25 });
    expect(s.video.pixFmt).toMatch(/^yuva/);
  }, 60000);
});
```

- [ ] **Step 6: Убедиться, что тест падает**

Run: `npx vitest run tests/spikes/make-media.test.mjs`
Expected: FAIL — модуль `spikes/fixtures/make-media.mjs` не найден.

- [ ] **Step 7: Создать `spikes/fixtures/make-media.mjs`**

PNG рисует pngjs. Видео и звук делает ffmpeg из источников lavfi. Команды проверены на ffmpeg 8.0.1 этой машины: у ProRes 4444 фон прозрачный (альфа 0), квадрат #26D07C непрозрачный, ffprobe показывает `prores/4444` и `yuva444p12le`.

```js
#!/usr/bin/env node
// Fixture media for the phase 0 spikes, written to <work>/fixtures/media (an ASCII path).
//   node spikes/fixtures/make-media.mjs [--force]
// The slot PNGs are drawn with pngjs; video and audio come from ffmpeg lavfi sources.
// Idempotent: an existing non-empty file is kept unless --force is given.
import { existsSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { workPath, ensureDir } from '../../tools/lib/work.mjs';
import { hasBinary, probeMedia } from '../../tools/lib/media-probe.mjs';

export const MEDIA = [
  { name: 'slot_a.png', kind: 'png', w: 400, h: 400, hex: '#0063FF' },
  { name: 'slot_b.png', kind: 'png', w: 400, h: 400, hex: '#FF4517' },
  {
    name: 'bars_1080p25_30s.mp4', kind: 'ffmpeg',
    args: ['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=25:duration=30',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '25'],
  },
  {
    name: 'bars2_1080p25_10s.mp4', kind: 'ffmpeg',
    args: ['-f', 'lavfi', '-i', 'smptebars=size=1920x1080:rate=25:duration=10',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '25'],
  },
  {
    // A 200x200 #26D07C box moving right at 300 px/s over a fully transparent frame.
    name: 'alpha_prores4444_1080p25_5s.mov', kind: 'ffmpeg',
    args: ['-f', 'lavfi', '-i', 'color=c=black@0.0:s=1920x1080:r=25:d=5,format=rgba',
      '-f', 'lavfi', '-i', 'color=c=0x26D07C:s=200x200:r=25:d=5,format=rgba',
      '-filter_complex', '[0:v][1:v]overlay=x=100+t*300:y=440:format=auto,format=yuva444p10le[v]',
      '-map', '[v]', '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le',
      '-alpha_bits', '16', '-vendor', 'apl0'],
  },
  {
    name: 'tone_48k_5s.wav', kind: 'ffmpeg',
    args: ['-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=48000:duration=5', '-ac', '2', '-c:a', 'pcm_s16le'],
  },
];

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex));
  if (!m) throw new Error('bad hex colour: ' + hex);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function solidPng(w, h, hex) {
  const [r, g, b] = hexToRgb(hex);
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h * 4; i += 4) {
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

export function ffmpegArgs(spec, outPath) {
  return ['-y', '-hide_banner', '-loglevel', 'error', ...spec.args, outPath];
}

// ffmpeg: binary name, or false to skip every ffmpeg file (unit tests). only: list of names to make.
export function makeMedia({ dir = workPath('fixtures', 'media'), force = false, ffmpeg = 'ffmpeg', only = null } = {}) {
  ensureDir(dir);
  const canFfmpeg = ffmpeg ? hasBinary(ffmpeg) : false;
  const out = [];
  for (const spec of MEDIA) {
    if (only && !only.includes(spec.name)) continue;
    const file = path.posix.join(String(dir).replace(/\\/g, '/'), spec.name);
    if (!force && existsSync(file) && statSync(file).size > 0) {
      out.push({ name: spec.name, file, status: 'exists', bytes: statSync(file).size });
      continue;
    }
    if (spec.kind === 'png') {
      writeFileSync(file, solidPng(spec.w, spec.h, spec.hex));
      out.push({ name: spec.name, file, status: 'created', bytes: statSync(file).size });
      continue;
    }
    if (!canFfmpeg) {
      out.push({ name: spec.name, file, status: 'skipped-no-ffmpeg', bytes: 0 });
      continue;
    }
    const r = spawnSync(ffmpeg, ffmpegArgs(spec, file), { encoding: 'utf8' });
    if (r.status !== 0 || !existsSync(file)) {
      rmSync(file, { force: true });      // a half-written output of ours, never a source file
      out.push({ name: spec.name, file, status: 'failed', bytes: 0,
        error: String(r.stderr || r.error || '').trim().slice(0, 500) });
      continue;
    }
    out.push({ name: spec.name, file, status: 'created', bytes: statSync(file).size });
  }
  return out;
}

function describeFile(r) {
  if (r.name.endsWith('.png') || !hasBinary('ffprobe')) return '';
  const s = probeMedia(r.file);
  if (s.video) return `${s.video.codec}/${s.video.profile || '-'} ${s.video.width}x${s.video.height} ${s.video.fps}fps ${s.video.pixFmt} ${s.duration}s`;
  return `${s.audio.codec} ${s.audio.sampleRate}Hz ${s.audio.channels}ch ${s.duration}s`;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const res = makeMedia({ force: process.argv.includes('--force') });
  let bad = 0;
  for (const r of res) {
    const ready = r.status === 'created' || r.status === 'exists';
    if (!ready) bad += 1;
    const info = ready ? describeFile(r) : (r.error || '');
    console.log(`${r.status.padEnd(18)} ${r.name.padEnd(34)} ${String(r.bytes).padStart(10)}  ${info}`);
  }
  if (bad) {
    console.error(bad + ' file(s) not ready: install ffmpeg (ffmpeg -version must work) or see the errors above');
    process.exit(1);
  }
}
```

- [ ] **Step 8: Запустить тест**

Run: `npx vitest run tests/spikes/make-media.test.mjs`
Expected: `7 passed` (без ffmpeg: `5 passed | 2 skipped`).

- [ ] **Step 9: Сделать медиа фикстуры**

Run: `node spikes/fixtures/make-media.mjs`
Expected (размеры в байтах могут немного отличаться):

```text
created            slot_a.png                               1335
created            slot_b.png                               1337
created            bars_1080p25_30s.mp4                 21389626  h264/High 1920x1080 25fps yuv420p 30s
created            bars2_1080p25_10s.mp4                   23655  h264/High 1920x1080 25fps yuv420p 10s
created            alpha_prores4444_1080p25_5s.mov       4313828  prores/4444 1920x1080 25fps yuva444p12le 5s
created            tone_48k_5s.wav                        960078  pcm_s16le 48000Hz 2ch 5s
```

Повторный запуск печатает `exists` в каждой строке и ничего не перезаписывает. `--force` делает файлы заново; перед ним закрыть фикстуру в AE: AE держит импортированные файлы открытыми (ae-quirks #188).

- [ ] **Step 10: Написать падающий тест `tests/spikes/ae-project.test.mjs`**

Помощник проверяется в `node:vm` на маленькой заглушке AE: в ней только то, что помощник трогает.

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync(new URL('../../spikes/lib/ae-project.jsx', import.meta.url), 'utf8');

function CompItem(name) { this.name = name; }
function FootageItem(name) { this.name = name; }

// A tiny After Effects stand-in: only what ae-project.jsx touches.
function host({ dirty = false, file = null, items = [], existing = [] } = {}) {
  const calls = [];
  const dialogs = [];
  function File(p) {
    this.path = String(p);
    this.fsName = String(p).replace(/\//g, '\\');
    this.exists = existing.includes(String(p));
    this.length = 1234;
  }
  const project = {
    dirty,
    file: file ? { fsName: file } : null,
    numItems: items.length,
    item: (i) => items[i - 1],
    close: (opt) => { calls.push(['close', opt]); return true; },
    save: (f) => { calls.push(['save', f.path]); existing.push(f.path); },
  };
  const app = {
    project,
    open: (f) => { calls.push(['open', f.path]); return { opened: f.path }; },
    newProject: () => { calls.push(['newProject']); return {}; },
    beginSuppressDialogs: () => { dialogs.push('begin'); },
    endSuppressDialogs: (alert) => { dialogs.push('end:' + alert); },
  };
  const ctx = vm.createContext({
    PARAMS: { workDir: 'C:/CRBK/work' }, app, File, CompItem, FootageItem,
    CloseOptions: { DO_NOT_SAVE_CHANGES: 'no-save' },
  });
  vm.runInContext(SRC, ctx);
  return { ctx, calls, dialogs };
}

const FIXTURE = 'C:/CRBK/work/fixtures/CRT_fixture.aep';

describe('ae-project.jsx', () => {
  it('recognises the work folder by prefix, case and slash insensitive', () => {
    const { ctx } = host();
    expect(ctx.bkIsWorkPath('C:\\CRBK\\Work\\fixtures\\a.aep')).toBe(true);
    expect(ctx.bkIsWorkPath('C:/CRBK/workshop/a.aep')).toBe(false);
    expect(ctx.bkIsWorkPath('C:\\Users\\me\\job.aep')).toBe(false);
  });

  it('refuses to close a dirty project of the user', () => {
    const { ctx, calls } = host({ dirty: true, file: 'C:\\Users\\me\\job.aep', existing: [FIXTURE] });
    expect(() => ctx.bkOpenProject(FIXTURE)).toThrow(/BK_DIRTY_USER_PROJECT/);
    expect(calls).toEqual([]);
  });

  it('refuses a dirty untitled project too', () => {
    const { ctx, calls } = host({ dirty: true, existing: [FIXTURE] });
    expect(() => ctx.bkNewProject()).toThrow(/untitled/);
    expect(calls).toEqual([]);
  });

  it('closes its own dirty project without saving, then opens the fixture', () => {
    const { ctx, calls } = host({ dirty: true, file: 'C:\\CRBK\\work\\s4\\scratch.aep', existing: [FIXTURE] });
    expect(ctx.bkOpenProject(FIXTURE)).toEqual({ opened: FIXTURE });
    expect(calls).toEqual([['close', 'no-save'], ['open', FIXTURE]]);
  });

  it('reports a missing project file before touching the open project', () => {
    const { ctx, calls } = host({ dirty: true, file: 'C:\\CRBK\\work\\x.aep' });
    expect(() => ctx.bkOpenProject(FIXTURE)).toThrow(/BK_NO_FILE/);
    expect(calls).toEqual([]);
  });

  it('saves only into the work folder, with dialogs suppressed', () => {
    const { ctx, calls, dialogs } = host();
    expect(() => ctx.bkSaveAs('C:/Users/me/x.aep')).toThrow(/BK_NOT_WORK_PATH/);
    expect(ctx.bkSaveAs('C:/CRBK/work/fixtures/copy.aep').bytes).toBe(1234);
    expect(calls).toEqual([['save', 'C:/CRBK/work/fixtures/copy.aep']]);
    expect(dialogs).toEqual(['begin', 'end:false']);
  });

  it('always ends dialog suppression, even when the call throws', () => {
    const { ctx, dialogs } = host();
    expect(ctx.bkQuiet(() => 42)).toBe(42);
    expect(() => ctx.bkQuiet(() => { throw new Error('boom'); })).toThrow(/boom/);
    expect(dialogs).toEqual(['begin', 'end:false', 'begin', 'end:false']);
  });

  it('lists expression properties by index path and resolves them back', () => {
    const PT = { PROPERTY: 1, INDEXED_GROUP: 2, NAMED_GROUP: 3 };
    const prop = (matchName, expression = '') => ({ matchName, propertyType: PT.PROPERTY, canSetExpression: true, expression });
    const group = (matchName, children) => ({
      matchName, propertyType: PT.NAMED_GROUP, numProperties: children.length, property: (i) => children[i - 1],
    });
    const broken = { matchName: 'ADBE Broken', propertyType: PT.NAMED_GROUP, get numProperties() { throw new Error('no'); } };
    const opacity = prop('ADBE Opacity', 'x * 100');
    const layer = { name: 'TXT_ROLE', ...group('ADBE AV Layer', [group('ADBE Transform Group', [prop('ADBE Position'), opacity]), broken]) };
    const comp = { numLayers: 1, layer: () => layer };
    const { ctx } = host();
    ctx.PropertyType = PT;
    const list = ctx.bkExpressionProps(comp);
    expect(JSON.parse(JSON.stringify(list))).toEqual([
      { layerIndex: 1, layerName: 'TXT_ROLE', idx: [1, 2], label: 'TXT_ROLE/ADBE Transform Group/ADBE Opacity' },
    ]);
    expect(ctx.bkResolve(comp, list[0])).toBe(opacity);
  });

  it('turns composition markers into plain data', () => {
    const keys = [
      { t: 0, v: { comment: 'in', duration: 1, protectedRegion: true } },
      { t: 9, v: { comment: 'out', duration: 1, protectedRegion: true } },
    ];
    const comp = { markerProperty: { numKeys: 2, keyTime: (k) => keys[k - 1].t, keyValue: (k) => keys[k - 1].v } };
    const { ctx } = host();
    expect(JSON.parse(JSON.stringify(ctx.bkMarkers(comp)))).toEqual([
      { time: 0, comment: 'in', duration: 1, protectedRegion: true },
      { time: 9, comment: 'out', duration: 1, protectedRegion: true },
    ]);
  });

  it('finds exactly one item by name and type', () => {
    const items = [new CompItem('A'), new FootageItem('A'), new CompItem('B'), new CompItem('B')];
    const { ctx } = host({ items });
    expect(ctx.bkComp('A')).toBe(items[0]);
    expect(ctx.bkFindItem('C', CompItem)).toBe(null);
    expect(() => ctx.bkComp('C')).toThrow(/BK_NO_COMP/);
    expect(() => ctx.bkComp('B')).toThrow(/BK_DUPLICATE_ITEM/);
  });

  it('finds a dropdown by its menu: AE 26.5 gives each one a pseudo match name', () => {
    const { ctx } = host();
    const fx = (name, matchName, dropdown) => ({
      name, matchName, property: () => ({ isDropdownEffect: dropdown }),
    });
    // Seen live in AE 26.5: addProperty('ADBE Dropdown Control') yields matchName "Pseudo/@@<id>".
    const effects = [fx('Duration', 'ADBE Slider Control', false), fx('Style', 'Pseudo/@@EVFDU9N0RLeO8coJyvLkjg', true)];
    const layer = {
      name: 'CTRL',
      property: () => ({ numProperties: effects.length, property: (i) => effects[i - 1] }),
    };
    expect(ctx.bkEffect(layer, 'Style', 'ADBE Dropdown Control')).toBe(effects[1]);
    expect(ctx.bkEffect(layer, 'Duration', 'ADBE Slider Control')).toBe(effects[0]);
    expect(() => ctx.bkEffect(layer, 'Duration', 'ADBE Dropdown Control')).toThrow(/BK_EFFECT/);
  });
});
```

- [ ] **Step 11: Убедиться, что тест падает**

Run: `npx vitest run tests/spikes/ae-project.test.mjs`
Expected: FAIL — `ENOENT … spikes/lib/ae-project.jsx`.

- [ ] **Step 12: Создать `spikes/lib/ae-project.jsx`**

```js
// Project helpers for AE spike probes (ES3). Load after spikes/lib/check.jsx; needs PARAMS.workDir.
// Probes open, build and close only projects inside the ASCII work folder. A dirty project from
// anywhere else is the user's work: the helpers refuse (throw) instead of closing it, so AE never
// shows a "save changes?" modal that would block the bridge (ae-quirks #25).
// Docs: https://ae-scripting.docsforadobe.dev/general/project/ (dirty 17.5+, close, save),
//       https://ae-scripting.docsforadobe.dev/general/application/ (open, newProject).
function bkNorm(p) {
  return String(p).replace(/\\/g, '/').toLowerCase();
}

function bkIsWorkPath(p) {
  var root = bkNorm(PARAMS.workDir);
  if (root.charAt(root.length - 1) !== '/') {
    root = root + '/';
  }
  return bkNorm(p).substr(0, root.length) === root;
}

function bkProjectPath() {
  var f = app.project ? app.project.file : null;
  return f ? String(f.fsName) : '';
}

// Runs fn with AE script-error dialogs suppressed (open, import, save, presets, render) and always ends
// the suppression; endSuppressDialogs(false) does not show the suppressed errors afterwards. Prompts such
// as "save changes?" are not covered (docs: application/), so the helpers avoid them by design.
function bkQuiet(fn) {
  app.beginSuppressDialogs();
  try {
    return fn();
  } finally {
    app.endSuppressDialogs(false);
  }
}

// Clean project: nothing to do. Dirty project of ours: close without saving. Anything else: refuse.
function bkReleaseProject() {
  var cur = app.project;
  if (!cur || cur.dirty !== true) {
    return 'clean';
  }
  var p = bkProjectPath();
  if (p === '' || !bkIsWorkPath(p)) {
    throw new Error('BK_DIRTY_USER_PROJECT: save or close the open project first (' + (p || 'untitled') + ')');
  }
  cur.close(CloseOptions.DO_NOT_SAVE_CHANGES);
  return 'closed';
}

function bkOpenProject(path) {
  var f = new File(path);
  if (!f.exists) {
    throw new Error('BK_NO_FILE: ' + path);
  }
  bkReleaseProject();
  var p = bkQuiet(function () {
    return app.open(f);
  });
  if (!p) {
    throw new Error('BK_OPEN_FAILED: ' + path);
  }
  return p;
}

function bkNewProject() {
  bkReleaseProject();
  var p = app.newProject();
  if (!p) {
    throw new Error('BK_NEW_PROJECT_FAILED');
  }
  return p;
}

// Save As into the work folder. Project.save(File) saves without a prompt (docs).
function bkSaveAs(path) {
  if (!bkIsWorkPath(path)) {
    throw new Error('BK_NOT_WORK_PATH: ' + path);
  }
  bkQuiet(function () {
    app.project.save(new File(path));
  });
  var f = new File(path);
  if (!f.exists) {
    throw new Error('BK_SAVE_FAILED: ' + path);
  }
  return { path: String(f.fsName), bytes: f.length, dirty: app.project.dirty };
}

// Exactly one project item with this name (and constructor), else null; duplicates throw, because
// acting on the first of two same-named items is how templates go wrong (spec 4.2).
function bkFindItem(name, ctor) {
  var hits = [];
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (item.name === name && (!ctor || item instanceof ctor)) {
      hits.push(item);
    }
  }
  if (hits.length > 1) {
    throw new Error('BK_DUPLICATE_ITEM: ' + name + ' x' + hits.length);
  }
  return hits.length ? hits[0] : null;
}

function bkComp(name) {
  var c = bkFindItem(name, CompItem);
  if (!c) {
    throw new Error('BK_NO_COMP: ' + name);
  }
  return c;
}

function bkLayer(comp, name) {
  var hits = [];
  for (var i = 1; i <= comp.numLayers; i++) {
    if (comp.layer(i).name === name) {
      hits.push(comp.layer(i));
    }
  }
  if (hits.length !== 1) {
    throw new Error('BK_LAYER: ' + name + ' x' + hits.length + ' in ' + comp.name);
  }
  return hits[0];
}

// AE 26.5 turns every Dropdown Menu Control into a per-instance pseudo effect: it is added as
// 'ADBE Dropdown Control' but reports matchName "Pseudo/@@<id>". A dropdown is told by its menu instead.
function bkMatchName(fx, matchName) {
  if (!matchName || fx.matchName === matchName) {
    return true;
  }
  if (matchName === 'ADBE Dropdown Control') {
    try {
      return fx.property(1).isDropdownEffect === true;
    } catch (e) {
      return false;
    }
  }
  return false;
}

// An effect by the ASCII name we gave it plus its match name; never by a localized display name.
function bkEffect(layer, name, matchName) {
  var parade = layer.property('ADBE Effect Parade');
  for (var i = 1; i <= parade.numProperties; i++) {
    var fx = parade.property(i);
    if (fx.name === name && bkMatchName(fx, matchName)) {
      return fx;
    }
  }
  throw new Error('BK_EFFECT: ' + name + ' on ' + layer.name);
}

function bkSourceText(layer) {
  return layer.property('ADBE Text Properties').property('ADBE Text Document');
}

// Composition markers as data. keyTime/keyValue only inside 1..numKeys: a miss "displays an error" (docs).
function bkMarkers(comp) {
  var mk = comp.markerProperty;
  var out = [];
  for (var k = 1; k <= mk.numKeys; k++) {
    var v = mk.keyValue(k);
    out.push({ time: mk.keyTime(k), comment: v.comment, duration: v.duration, protectedRegion: v.protectedRegion === true });
  }
  return out;
}

// Every property that carries an expression: [{ layerIndex, layerName, idx: [property indices], label }].
// Indices, not references: references go stale after edits (ae-quirks #3).
function bkExpressionProps(comp) {
  var out = [];
  function walk(group, layerIndex, layerName, idx, label) {
    var n = 0;
    try {
      n = group.numProperties;
    } catch (e0) {
      n = 0;                       // some groups refuse to enumerate; nothing of ours lives there
    }
    for (var i = 1; i <= n; i++) {
      var p = null;
      try {
        p = group.property(i);
      } catch (e1) {
        p = null;
      }
      if (p === null) {
        continue;
      }
      var here = idx.concat([i]);
      var name = label + '/' + p.matchName;
      if (p.propertyType === PropertyType.PROPERTY) {
        var has = false;
        try {
          has = p.canSetExpression && p.expression !== '';
        } catch (e2) {
          has = false;
        }
        if (has) {
          out.push({ layerIndex: layerIndex, layerName: layerName, idx: here, label: name });
        }
      } else {
        walk(p, layerIndex, layerName, here, name);
      }
    }
  }
  for (var j = 1; j <= comp.numLayers; j++) {
    walk(comp.layer(j), j, comp.layer(j).name, [], comp.layer(j).name);
  }
  return out;
}

function bkResolve(comp, entry) {
  var p = comp.layer(entry.layerIndex);
  for (var i = 0; i < entry.idx.length; i++) {
    p = p.property(entry.idx[i]);
  }
  return p;
}

function bkNow() {
  return new Date().getTime();
}
```

- [ ] **Step 13: Запустить тест и линтер**

Run: `npx vitest run tests/spikes/ae-project.test.mjs && node tools/jsx/lint-jsx.cjs spikes/lib/ae-project.jsx`
Expected: `11 passed`; `OK    spikes/lib/ae-project.jsx (1 warning(s))`. Предупреждение о последней строке без `JSON.stringify` допустимо: файл подключается перед пробой, пробу завершает `finish(...)`.

- [ ] **Step 14: Создать `spikes/fixtures/contract.mjs`**

Контракт фикстуры в коде. Подписи Essential Graphics — по-русски, внутренние имена — ASCII.

```js
// The shared AE fixture contract (plan part B): names, values and paths that the phase-0 spikes rely on.
// Change it only together with build-ae-fixture.jsx and the plan text.
import { workDir, workPath } from '../../tools/lib/work.mjs';

export const COMP_LT = 'CRT_LowerThird_v1';
export const COMP_HATCH = 'CRT_Hatch_v1';

// Essential Graphics properties that S1 adds, in this order. label = display name in the EGP.
export const EGP = {
  [COMP_LT]: [
    { key: 'name', kind: 'text', layer: 'TXT_NAME', label: 'Имя', required: true },
    { key: 'role', kind: 'text', layer: 'TXT_ROLE', label: 'Должность', required: true },
    { key: 'showRole', kind: 'checkbox', layer: 'CTRL', effect: 'ShowRole', matchName: 'ADBE Checkbox Control',
      label: 'Показать должность', required: true },
    { key: 'duration', kind: 'slider', layer: 'CTRL', effect: 'Duration', matchName: 'ADBE Slider Control',
      label: 'Длительность (служебное, не менять)', required: true },
    { key: 'accent', kind: 'color', layer: 'CTRL', effect: 'Accent', matchName: 'ADBE Color Control',
      label: 'Акцент', required: false },
    { key: 'style', kind: 'dropdown', layer: 'CTRL', effect: 'Style', matchName: 'ADBE Dropdown Control',
      label: 'Стиль', required: false },
    { key: 'photo', kind: 'media', layer: 'SLOT_PHOTO', label: 'Фото', required: true },
  ],
  [COMP_HATCH]: [
    { key: 'duration', kind: 'slider', layer: 'CTRL', effect: 'Duration', matchName: 'ADBE Slider Control',
      label: 'Длительность (служебное, не менять)', required: true },
  ],
};

// Protected regions of CRT_LowerThird_v1 (Responsive Design - Time).
export const MARKERS = [
  { comment: 'in', time: 0, duration: 1 },
  { comment: 'out', time: 9, duration: 1 },
];

export function fixturePaths() {
  return {
    workDir: workDir(),
    mediaDir: workPath('fixtures', 'media'),
    slotA: workPath('fixtures', 'media', 'slot_a.png'),
    fixtureAep: workPath('fixtures', 'CRT_fixture.aep'),
    egpAep: workPath('fixtures', 'CRT_fixture_egp.aep'),
    mogrtDir: workPath('mogrt'),
  };
}

// PARAMS for spikes/fixtures/build-ae-fixture.jsx.
export function fixtureParams() {
  const p = fixturePaths();
  return {
    workDir: p.workDir,
    fixtureAep: p.fixtureAep,
    media: { slotA: p.slotA },
    comps: { lt: COMP_LT, hatch: COMP_HATCH },
    w: 1920, h: 1080, fps: 25, ltDuration: 10, hatchDuration: 60,
    text: { name: 'Имя Фамилия', role: 'Должность' },
    fonts: { name: 'SBSansDisplay-Semibold', role: 'SBSansText-Regular' },
    markers: MARKERS,
  };
}
```

- [ ] **Step 15: Создать `spikes/fixtures/build-ae-fixture.jsx`**

Сборщик создаёт новый проект и строит обе композиции по контракту. Решения, которых в контракте нет:
- плашка `PL_NAME` привязана родителем к `TXT_NAME` (ae-quirks #15): её пространство совпадает с пространством текста, `sourceRectAtTime` не переводится в координаты композиции; «плюс 40 px» — по 20 px с каждой стороны;
- у ключей позиции `PROBE_SQ` нулевые пространственные касательные, иначе между одинаковыми ключами 1 с и 9 с квадрат уплывает (ae-quirks #30);
- у `HATCH` 160 копий линии с шагом 40 px: при смещении −100 первые сто копий левее кадра, остальные его покрывают;
- выражения читают контролы через `.value` (`effect("Duration")(1).value`). Поведение то же, что в тексте контракта; вариант без `.value` проверяет S4;
- рендерер обеих композиций — Classic 3D, как требует контракт шаблона (§4.2). Его внутреннее имя `ADBE Advanced 3d`, у нового Advanced 3D — `ADBE Calder` (ae-quirks #129). Проверка необязательная: рендерер новой композиции по умолчанию и список рендереров пишутся в отчёт;
- каждый шаг — проверка `check()`: сбой записывается, следующие шаги идут дальше или пишут `skipped`; без нового проекта не выполняется ничего.

```js
// Builds the shared AE fixture in a NEW project and saves it as PARAMS.fixtureAep (plan part B, task 7).
// Composed after spikes/lib/check.jsx and spikes/lib/ae-project.jsx. ES3 only.
// Every step is a check: a failure is recorded, later steps say "skipped" or fail on their own, and
// nothing runs unless a fresh project was created (a dirty project of the user is never touched).
// Docs: https://ae-scripting.docsforadobe.dev/layer/layercollection/ (add, addText, addSolid, addShape, addNull)
//       https://ae-scripting.docsforadobe.dev/other/markervalue/ (protectedRegion, AE 16.0+)
//       https://ae-scripting.docsforadobe.dev/property/property/ (setPropertyParameters 17.0.1+, propertyParameters 26.0+)
var FX = { ready: false, lt: null, hatch: null, slot: null, exprCount: 0 };

var FX_EXPR = {
  role: 'thisComp.layer("CTRL").effect("ShowRole")(1).value * 100',
  qa: 'thisComp.layer("CTRL").effect("QA")(1).value * 100',
  plateSize: 'var r = thisComp.layer("TXT_NAME").sourceRectAtTime(0, false);\n[r.width + 40, r.height + 40]',
  platePos: 'var r = thisComp.layer("TXT_NAME").sourceRectAtTime(0, false);\n[r.left + r.width / 2, r.top + r.height / 2]',
  plateFill: 'var s = thisComp.layer("CTRL").effect("Style")(1).value;\n' +
    's == 2 ? [0.94902, 0.94902, 0.94902, 1] : [0.13333, 0.13333, 0.13333, 1]',
  hatchOffset: '-100 + time * 0.5',
  probe: 'var d = thisComp.layer("CTRL").effect("Duration")(1).value;\n' +
    'var x = time < d - 1 ? 100 : linear(time, d - 1, d, 100, 200);\n[x, 100]'
};

function fxStep(name, required, fn) {
  return check(name, function () {
    if (!FX.ready) {
      return { pass: false, detail: 'skipped: no fresh project' };
    }
    return fn();
  }, required);
}

function fxRgb(hex) {
  var n = parseInt(String(hex).replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// ae-quirks #159: startTime, then inPoint, then outPoint.
function fxSpan(L, d) {
  L.startTime = 0;
  L.inPoint = 0;
  L.outPoint = d;
}

function fxXform(L, matchName) {
  return L.property('ADBE Transform Group').property(matchName);
}

function fxAddEffect(L, matchName, name) {
  L.property('ADBE Effect Parade').addProperty(matchName);
  var parade = L.property('ADBE Effect Parade');      // re-resolve after addProperty (ae-quirks #3)
  parade.property(parade.numProperties).name = name;
  return bkEffect(L, name, matchName);
}

// ae-quirks #9: set the text, then change the LIVE document and set it again.
function fxText(comp, name, str, font, size, xy) {
  var L = comp.layers.addText(str);
  L.name = name;
  var st = bkSourceText(L);
  var doc = st.value;
  doc.text = str;
  st.setValue(doc);
  var live = st.value;
  live.font = font;
  live.fontSize = size;
  live.fillColor = [1, 1, 1];
  live.applyStroke = false;
  // addText takes the alignment last used in the Paragraph panel (centred on this machine), so set it.
  live.justification = ParagraphJustification.LEFT_JUSTIFY;
  st.setValue(live);
  fxSpan(L, comp.duration);
  fxXform(L, 'ADBE Position').setValue(xy);
  return L;
}

// doc.font echoes any name (ae-quirks #80); fontObject.location shows a substitute (times.ttf, #187).
function fxFontInfo(L) {
  var doc = bkSourceText(L).value;
  var fo = null;
  try {
    fo = doc.fontObject;
  } catch (e) {
    fo = null;
  }
  return { font: String(doc.font), file: fo ? String(fo.location) : '' };
}

// Linear in time; spatial keys also get zero tangents, or equal keys drift (ae-quirks #30).
function fxLinear(prop) {
  for (var k = 1; k <= prop.numKeys; k++) {
    prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
    if (prop.isSpatial) {
      var z = (prop.propertyValueType === PropertyValueType.ThreeD_SPATIAL) ? [0, 0, 0] : [0, 0];
      prop.setSpatialAutoBezierAtKey(k, false);
      prop.setSpatialContinuousAtKey(k, false);
      prop.setSpatialTangentsAtKey(k, z, z);
    }
  }
}

function fxKeyList(prop) {
  var out = [];
  for (var k = 1; k <= prop.numKeys; k++) {
    out.push([prop.keyTime(k), prop.keyValue(k)]);
  }
  return out;
}

function fxKeys(prop, pairs) {
  for (var i = 0; i < pairs.length; i++) {
    prop.setValueAtTime(pairs[i][0], pairs[i][1]);
  }
  fxLinear(prop);
  return fxKeyList(prop);
}

function fxSolid(comp, name, hex, w, h, xy) {
  var L = comp.layers.addSolid(fxRgb(hex), name, w, h, 1, comp.duration);
  fxSpan(L, comp.duration);
  fxXform(L, 'ADBE Position').setValue(xy);
  return L;
}

function fxGroup(L, groupName) {
  L.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group');
  var root = L.property('ADBE Root Vectors Group');
  root.property(root.numProperties).name = groupName;
}

// Adds a shape item to a named group and returns it, fresh (earlier references are stale now).
function fxInGroup(L, groupName, matchName) {
  L.property('ADBE Root Vectors Group').property(groupName).property('ADBE Vectors Group').addProperty(matchName);
  var vecs = L.property('ADBE Root Vectors Group').property(groupName).property('ADBE Vectors Group');
  return vecs.property(vecs.numProperties);
}

function fxShapeProp(L, groupName, itemMatch, propMatch) {
  return L.property('ADBE Root Vectors Group').property(groupName).property('ADBE Vectors Group')
    .property(itemMatch).property(propMatch);
}

// Sets an expression, evaluates it once and returns expressionError ('' when fine).
function fxExpr(prop, src) {
  prop.expression = src;
  prop.valueAtTime(0, false);
  return prop.expressionError;
}

function fxExprReport(list) {
  var bad = [];
  for (var i = 0; i < list.length; i++) {
    if (list[i][1] !== '') {
      bad.push(list[i][0] + ': ' + list[i][1]);
    }
  }
  return { pass: bad.length === 0, detail: bad.length ? bad : 'set ' + list.length + ', no errors' };
}

// CTRL null. full = lower third set (ShowRole, Duration, Accent, Style, QA); else Duration and QA.
function fxCtrl(comp, full) {
  var C = comp.layers.addNull(comp.duration);
  C.name = 'CTRL';
  fxSpan(C, comp.duration);
  if (full) {
    fxAddEffect(C, 'ADBE Checkbox Control', 'ShowRole').property(1).setValue(1);
  }
  fxAddEffect(C, 'ADBE Slider Control', 'Duration').property(1).setValue(10);
  if (full) {
    fxAddEffect(C, 'ADBE Color Control', 'Accent').property(1).setValue([0.14902, 0.81569, 0.48627, 1]);
    var menu = fxAddEffect(C, 'ADBE Dropdown Control', 'Style').property(1);
    if (menu.isDropdownEffect !== true) {
      throw new Error('Style: property 1 is not a dropdown menu');
    }
    menu = menu.setPropertyParameters(['Dark', 'Light']);   // returns the updated Menu property
    // AE 26.5 rebuilds the pseudo effect here (new "Pseudo/@@<id>" match name) and resets its name
    // to "Dropdown Menu Control" (checked live 2026-10-02), so the ASCII name is set again afterwards.
    menu.parentProperty.name = 'Style';
    menu.setValue(1);
  }
  fxAddEffect(C, 'ADBE Checkbox Control', 'QA').property(1).setValue(1);
  return C;
}

function fxCtrlReport(C, expected) {
  var parade = C.property('ADBE Effect Parade');
  var names = [];
  var values = [];
  for (var i = 1; i <= parade.numProperties; i++) {
    names.push(parade.property(i).name);
    values.push(parade.property(i).name + '=' + JSON.stringify(parade.property(i).property(1).value));
  }
  var items = null;
  try {
    items = bkEffect(C, 'Style', 'ADBE Dropdown Control').property(1).propertyParameters;
  } catch (e) {
    items = null;
  }
  var itemsOk = items === null || JSON.stringify(items) === '["Dark","Light"]';
  return { pass: names.join(',') === expected && itemsOk, detail: { effects: values, styleItems: items } };
}

// Classic 3D, as the template contract asks (spec 4.2). Its internal id is "ADBE Advanced 3d"; the newer
// Advanced 3D renderer is "ADBE Calder" (ae-quirks #129). Measured, not assumed: the default renderer of a
// new comp and the list of renderers go into the detail.
// Docs: https://ae-scripting.docsforadobe.dev/item/compitem/ (renderer: one of renderers, read/write)
function fxClassic3d(comp) {
  var was = comp.renderer;
  var list = comp.renderers;
  var found = false;
  for (var i = 0; i < list.length; i++) {
    if (list[i] === 'ADBE Advanced 3d') {
      found = true;
    }
  }
  if (found) {
    comp.renderer = 'ADBE Advanced 3d';
  }
  return { comp: comp.name, defaultRenderer: was, renderers: list.join(', '), now: comp.renderer };
}

function fxSummary(comp) {
  var layers = [];
  for (var i = 1; i <= comp.numLayers; i++) {
    layers.push(comp.layer(i).name);
  }
  return { name: comp.name, size: [comp.width, comp.height], fps: comp.frameRate, duration: comp.duration,
    renderer: comp.renderer, layers: layers, markers: bkMarkers(comp) };
}

check('project: new, expression engine javascript-1.0', function () {
  bkNewProject();
  app.project.expressionEngine = 'javascript-1.0';
  FX.ready = true;
  return { pass: app.project.expressionEngine === 'javascript-1.0',
    detail: 'AE ' + app.version + ', ' + app.isoLanguage + ', ' + app.project.expressionEngine };
}, true);

check('fonts: SB Sans resolve to real files, not times.ttf', function () {
  var names = [PARAMS.fonts.name, PARAMS.fonts.role];
  var out = [];
  var ok = true;
  for (var i = 0; i < names.length; i++) {
    var list = app.fonts.getFontsByPostScriptName(names[i]);
    var loc = list.length ? String(list[0].location) : '';
    if (!list.length || /times\.ttf$/i.test(loc)) {
      ok = false;
    }
    out.push(names[i] + ' -> ' + (loc || 'missing'));
  }
  return { pass: ok, detail: out };
}, false);

if (FX.ready) {
  app.beginUndoGroup('BK build fixture');
}

fxStep('footage: slot_a.png imported (400x400)', true, function () {
  FX.slot = bkQuiet(function () {
    return app.project.importFile(new ImportOptions(new File(PARAMS.media.slotA)));
  });
  return { pass: FX.slot.width === 400 && FX.slot.height === 400,
    detail: FX.slot.name + ' ' + FX.slot.width + 'x' + FX.slot.height };
});

fxStep('comp ' + PARAMS.comps.lt + ': 1920x1080, 25 fps, 10 s', true, function () {
  FX.lt = app.project.items.addComp(PARAMS.comps.lt, PARAMS.w, PARAMS.h, 1, PARAMS.ltDuration, PARAMS.fps);
  return { pass: FX.lt.frameRate === PARAMS.fps && FX.lt.duration === PARAMS.ltDuration,
    detail: FX.lt.width + 'x' + FX.lt.height + ' ' + FX.lt.frameRate + ' fps ' + FX.lt.duration + ' s' };
});

fxStep('LT SLOT_PHOTO: slot_a.png at (1500,540)', true, function () {
  var L = FX.lt.layers.add(FX.slot, FX.lt.duration);
  L.name = 'SLOT_PHOTO';
  fxSpan(L, FX.lt.duration);
  fxXform(L, 'ADBE Position').setValue([1500, 540]);
  return { pass: true, detail: 'index ' + L.index };
});

fxStep('LT TXT_ROLE: SBSansText-Regular 40 px white at (200,870)', true, function () {
  var L = fxText(FX.lt, 'TXT_ROLE', PARAMS.text.role, PARAMS.fonts.role, 40, [200, 870]);
  return { pass: true, detail: fxFontInfo(L) };
});

fxStep('LT TXT_NAME: SBSansDisplay-Semibold 60 px white at (200,800), opacity keys', true, function () {
  var L = fxText(FX.lt, 'TXT_NAME', PARAMS.text.name, PARAMS.fonts.name, 60, [200, 800]);
  var keys = fxKeys(fxXform(L, 'ADBE Opacity'), [[0, 0], [0.5, 100], [9.5, 100], [10, 0]]);
  return { pass: keys.length === 4, detail: { font: fxFontInfo(L), keys: keys } };
});

fxStep('LT PL_NAME: plate parented to TXT_NAME, directly below it', true, function () {
  var T = bkLayer(FX.lt, 'TXT_NAME');
  var S = FX.lt.layers.addShape();
  S.name = 'PL_NAME';
  fxGroup(S, 'Plate');
  fxInGroup(S, 'Plate', 'ADBE Vector Shape - Rect');
  fxInGroup(S, 'Plate', 'ADBE Vector Graphic - Fill');
  S.parent = T;                                     // parent first, then a neutral transform (ae-quirks #15, #29)
  fxXform(S, 'ADBE Anchor Point').setValue([0, 0]);
  fxXform(S, 'ADBE Position').setValue([0, 0]);
  S.moveAfter(T);
  fxSpan(S, FX.lt.duration);
  return { pass: S.index === T.index + 1, detail: 'PL_NAME ' + S.index + ', TXT_NAME ' + T.index };
});

fxStep('LT PROBE_SQ: 40x40 #FF00FF, linear position keys 0/1/9/10 s', true, function () {
  var L = fxSolid(FX.lt, 'PROBE_SQ', '#FF00FF', 40, 40, [100, 100]);
  var keys = fxKeys(fxXform(L, 'ADBE Position'), [[0, [100, 100]], [1, [200, 100]], [9, [200, 100]], [10, [300, 100]]]);
  var at5 = fxXform(L, 'ADBE Position').valueAtTime(5, false);
  return { pass: keys.length === 4 && Math.abs(at5[0] - 200) < 0.001 && Math.abs(at5[1] - 100) < 0.001,
    detail: { keys: keys, at5: at5 } };
});

fxStep('LT QA_PATCH: 100x100 #26D07C at (1820,100)', true, function () {
  var L = fxSolid(FX.lt, 'QA_PATCH', '#26D07C', 100, 100, [1820, 100]);
  return { pass: true, detail: 'index ' + L.index };
});

fxStep('LT CTRL: ShowRole, Duration, Accent, Style (Dark, Light), QA', true, function () {
  return fxCtrlReport(fxCtrl(FX.lt, true), 'ShowRole,Duration,Accent,Style,QA');
});

fxStep('LT expressions: TXT_ROLE, QA_PATCH opacity; PL_NAME size, position, fill', true, function () {
  var P = bkLayer(FX.lt, 'PL_NAME');
  return fxExprReport([
    ['TXT_ROLE opacity', fxExpr(fxXform(bkLayer(FX.lt, 'TXT_ROLE'), 'ADBE Opacity'), FX_EXPR.role)],
    ['QA_PATCH opacity', fxExpr(fxXform(bkLayer(FX.lt, 'QA_PATCH'), 'ADBE Opacity'), FX_EXPR.qa)],
    ['PL_NAME size', fxExpr(fxShapeProp(P, 'Plate', 'ADBE Vector Shape - Rect', 'ADBE Vector Rect Size'), FX_EXPR.plateSize)],
    ['PL_NAME position', fxExpr(fxShapeProp(P, 'Plate', 'ADBE Vector Shape - Rect', 'ADBE Vector Rect Position'), FX_EXPR.platePos)],
    ['PL_NAME fill', fxExpr(fxShapeProp(P, 'Plate', 'ADBE Vector Graphic - Fill', 'ADBE Vector Fill Color'), FX_EXPR.plateFill)]
  ]);
});

fxStep('LT markers: protected regions "in" 0-1 s and "out" 9-10 s', true, function () {
  var mk = FX.lt.markerProperty;
  for (var i = 0; i < PARAMS.markers.length; i++) {
    var m = PARAMS.markers[i];
    var v = new MarkerValue(m.comment);
    v.duration = m.duration;
    v.protectedRegion = true;
    mk.setValueAtTime(m.time, v);
  }
  var got = bkMarkers(FX.lt);
  var ok = got.length === PARAMS.markers.length;
  for (var j = 0; ok && j < got.length; j++) {
    ok = got[j].protectedRegion && got[j].comment === PARAMS.markers[j].comment &&
      Math.abs(got[j].time - PARAMS.markers[j].time) < 0.001 && Math.abs(got[j].duration - PARAMS.markers[j].duration) < 0.001;
  }
  return { pass: ok, detail: got };
});

fxStep('comp ' + PARAMS.comps.hatch + ': 1920x1080, 25 fps, 60 s', true, function () {
  FX.hatch = app.project.items.addComp(PARAMS.comps.hatch, PARAMS.w, PARAMS.h, 1, PARAMS.hatchDuration, PARAMS.fps);
  return { pass: FX.hatch.duration === PARAMS.hatchDuration, detail: FX.hatch.duration + ' s' };
});

fxStep('Hatch layers: HATCH (line + Repeater), PROBE_SQ, QA_PATCH, CTRL (Duration, QA)', true, function () {
  var H = FX.hatch.layers.addShape();
  H.name = 'HATCH';
  fxGroup(H, 'Lines');
  fxInGroup(H, 'Lines', 'ADBE Vector Shape - Rect').property('ADBE Vector Rect Size').setValue([4, PARAMS.h]);
  fxInGroup(H, 'Lines', 'ADBE Vector Graphic - Fill').property('ADBE Vector Fill Color').setValue([0.14902, 0.81569, 0.48627, 1]);
  var rep = fxInGroup(H, 'Lines', 'ADBE Vector Filter - Repeater');
  rep.property('ADBE Vector Repeater Copies').setValue(160);
  rep.property('ADBE Vector Repeater Transform').property('ADBE Vector Repeater Position').setValue([40, 0]);
  fxXform(H, 'ADBE Anchor Point').setValue([0, 0]);
  fxXform(H, 'ADBE Position').setValue([0, PARAMS.h / 2]);
  fxSpan(H, FX.hatch.duration);
  fxSolid(FX.hatch, 'PROBE_SQ', '#FF00FF', 40, 40, [100, 100]);
  fxSolid(FX.hatch, 'QA_PATCH', '#26D07C', 100, 100, [1820, 100]);
  return fxCtrlReport(fxCtrl(FX.hatch, false), 'Duration,QA');
});

fxStep('Hatch expressions: Repeater offset, PROBE_SQ position, QA_PATCH opacity', true, function () {
  var H = bkLayer(FX.hatch, 'HATCH');
  return fxExprReport([
    ['HATCH offset', fxExpr(fxShapeProp(H, 'Lines', 'ADBE Vector Filter - Repeater', 'ADBE Vector Repeater Offset'), FX_EXPR.hatchOffset)],
    ['PROBE_SQ position', fxExpr(fxXform(bkLayer(FX.hatch, 'PROBE_SQ'), 'ADBE Position'), FX_EXPR.probe)],
    ['QA_PATCH opacity', fxExpr(fxXform(bkLayer(FX.hatch, 'QA_PATCH'), 'ADBE Opacity'), FX_EXPR.qa)]
  ]);
});

fxStep('comps: Classic 3D renderer (ADBE Advanced 3d)', false, function () {
  var a = fxClassic3d(FX.lt);
  var b = fxClassic3d(FX.hatch);
  return { pass: a.now === 'ADBE Advanced 3d' && b.now === 'ADBE Advanced 3d', detail: [a, b] };
});

fxStep('contract values: plate = TXT_NAME ink box + 40 px; Hatch PROBE_SQ x(9.5 s) = 150', true, function () {
  var r = bkLayer(FX.lt, 'TXT_NAME').sourceRectAtTime(0, false);
  var plate = fxShapeProp(bkLayer(FX.lt, 'PL_NAME'), 'Plate', 'ADBE Vector Shape - Rect', 'ADBE Vector Rect Size')
    .valueAtTime(0, false);
  var probe = fxXform(bkLayer(FX.hatch, 'PROBE_SQ'), 'ADBE Position').valueAtTime(9.5, false);
  var ok = Math.abs(plate[0] - (r.width + 40)) < 0.01 && Math.abs(plate[1] - (r.height + 40)) < 0.01 &&
    Math.abs(probe[0] - 150) < 0.01 && Math.abs(probe[1] - 100) < 0.01;
  return { pass: ok, detail: { ink: [r.left, r.top, r.width, r.height], plate: plate, probeAt9_5: probe } };
});

fxStep('expressions: all 8 evaluate without errors (javascript-1.0)', true, function () {
  var comps = [FX.lt, FX.hatch];
  var bad = [];
  var n = 0;
  for (var c = 0; c < comps.length; c++) {
    var list = bkExpressionProps(comps[c]);
    for (var i = 0; i < list.length; i++) {
      var p = bkResolve(comps[c], list[i]);
      p.valueAtTime(0, false);
      p.valueAtTime(9.6, false);
      n += 1;
      if (p.expressionError !== '') {
        bad.push(comps[c].name + ' ' + list[i].label + ': ' + p.expressionError);
      }
    }
  }
  FX.exprCount = n;
  return { pass: n === 8 && bad.length === 0, detail: { count: n, errors: bad } };
});

if (FX.ready) {
  app.endUndoGroup();
}

fxStep('saved: ' + PARAMS.fixtureAep, true, function () {
  var r = bkSaveAs(PARAMS.fixtureAep);
  return { pass: r.bytes > 0 && r.dirty === false, detail: r };
});

var FX_DATA = { exprCount: FX.exprCount, project: '', comps: [] };
try {
  FX_DATA.project = bkProjectPath();
  FX_DATA.engine = app.project.expressionEngine;
  if (FX.lt) {
    FX_DATA.comps.push(fxSummary(FX.lt));
  }
  if (FX.hatch) {
    FX_DATA.comps.push(fxSummary(FX.hatch));
  }
} catch (e) {
  FX_DATA.error = String(e);
}
finish(FX_DATA);
```

- [ ] **Step 16: Проверить сборщик линтером**

Run: `node tools/jsx/lint-jsx.cjs spikes/fixtures/build-ae-fixture.jsx`
Expected: `OK    spikes/fixtures/build-ae-fixture.jsx (1 warning(s))` — последняя строка `finish(...)`, это допустимо.

- [ ] **Step 17: Создать `spikes/fixtures/build-ae-fixture.mjs`**

```js
#!/usr/bin/env node
// Builds the shared AE fixture <work>/fixtures/CRT_fixture.aep in the live AE (BrandKit Dev panel, CDP 8094).
//   node spikes/fixtures/build-ae-fixture.mjs
// Preconditions: media made (make-media.mjs); no unsaved user project open in AE (the builder refuses it).
// Prints one line per step, writes <work>/fixtures/build-report.json, exits 1 if a required step failed.
import { existsSync, renameSync, writeFileSync } from 'node:fs';
import { run } from '../../tools/host-run.mjs';
import { composeProbe } from '../../tools/spike/runner.mjs';
import { workPath, ensureDir } from '../../tools/lib/work.mjs';
import { fixtureParams } from './contract.mjs';

const params = fixtureParams();
if (!existsSync(params.media.slotA)) {
  console.error('missing ' + params.media.slotA + ': run node spikes/fixtures/make-media.mjs');
  process.exit(2);
}
ensureDir(workPath('fixtures'));
// Keep the previous build as .prev.aep: AE then saves into a free name and never asks to overwrite.
if (existsSync(params.fixtureAep)) renameSync(params.fixtureAep, params.fixtureAep.replace(/\.aep$/, '.prev.aep'));

const jsx = composeProbe(['spikes/lib/ae-project.jsx', 'spikes/fixtures/build-ae-fixture.jsx'], params);
let r;
try {
  r = await run('ae', jsx, { timeoutMs: 300000 });
} catch (e) {
  console.error('ERROR: ' + e.message);
  console.error('Before any new call: node tools/host-run.mjs --host ae "JSON.stringify({ v: app.version })"');
  process.exit(1);
}
if (!r || !Array.isArray(r.checks)) {
  console.error('unexpected reply: ' + JSON.stringify(r).slice(0, 300));
  process.exit(1);
}
let failed = 0;
for (const c of r.checks) {
  if (!c.pass && c.required) failed += 1;
  const mark = c.pass ? 'ok  ' : (c.required ? 'FAIL' : 'warn');
  console.log(mark + ' ' + c.name + (c.pass ? '' : '  -> ' + JSON.stringify(c.detail).slice(0, 400)));
}
const report = workPath('fixtures', 'build-report.json');
writeFileSync(report, JSON.stringify(r, null, 2) + '\n', 'utf8');
for (const comp of (r.data && r.data.comps) || []) {
  console.log(comp.name + ': ' + comp.layers.join(', '));
}
console.log((failed ? failed + ' required step(s) failed' : 'fixture built: ' + params.fixtureAep) + '; report ' + report);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 18: Подготовить AE (вручную)**

1. В AE сохранить свою работу и закрыть проект: File → Close Project (в русском интерфейсе «Файл» → «Закрыть проект»).
2. Открыть панель: Window → Extensions → BrandKit Dev («Окно» → «Расширения»).
3. Проверить хост дешёвым чтением.

Run: `node tools/host-run.mjs --host ae "JSON.stringify({ v: String(app.version), dirty: app.project.dirty, lang: app.isoLanguage })"`
Expected: `{ "v": "26.5…", "dirty": false, "lang": "…" }`. Если `dirty: true` — вернуться к пункту 1.

- [ ] **Step 19: Собрать фикстуру**

Run: `node spikes/fixtures/build-ae-fixture.mjs`
Expected: все строки начинаются с `ok`, в конце:

```text
CRT_LowerThird_v1: CTRL, QA_PATCH, PROBE_SQ, TXT_NAME, PL_NAME, TXT_ROLE, SLOT_PHOTO
CRT_Hatch_v1: CTRL, QA_PATCH, PROBE_SQ, HATCH
fixture built: C:/CRBK/work/fixtures/CRT_fixture.aep; report C:/CRBK/work/fixtures/build-report.json
```

`warn fonts: …` — шрифта SB Sans нет или вместо него Times: фикстура собрана, но тексты не в бренде. Сообщить пользователю (D16, D20) и продолжать. `warn comps: Classic 3D renderer …` — в списке рендереров нет `ADBE Advanced 3d`: список из `build-report.json` передать пользователю, пробы S1–S4 и S10 идут дальше. `FAIL` в обязательном шаге — разобрать по `build-report.json`, исправить и собрать заново: сборщик всегда начинает с нового проекта.

- [ ] **Step 20: Осмотреть фикстуру (вручную)**

Фикстура осталась открытой в AE. Проверить на глаз:
1. `CRT_LowerThird_v1`, время 0:00:02:00: белое имя на тёмной плашке, плашка под текстом с ровным запасом; ниже должность; справа синий квадрат 400×400; вверху справа зелёный квадрат QA.
2. Effect Controls слоя `CTRL`: Style → Light — плашка становится светлой (#F2F2F2); ShowRole выключен — должность пропадает; QA выключен — пропадает зелёный квадрат.
3. Над таймлайном два маркера композиции с защищённой (заштрихованной) областью: «in» 0–1 с и «out» 9–10 с.
4. Розовый `PROBE_SQ` движется 0–1 с и 9–10 с, между ними стоит на месте.
5. `CRT_Hatch_v1`: зелёные вертикальные линии медленно едут вправо; `PROBE_SQ` стоит до 9 с и за последнюю секунду до 10 с уезжает вправо.
6. Composition → Composition Settings → вкладка 3D Renderer («Композиция» → «Настройки композиции»): у обеих композиций Classic 3D.

Изменения не сохранять: следующая проба закроет рабочий проект без сохранения.

- [ ] **Step 21: Прогнать все тесты**

Run: `npm test`
Expected: все тесты зелёные.

- [ ] **Step 22: Commit**

```bash
git add tools/lib/media-probe.mjs spikes/fixtures/make-media.mjs spikes/lib/ae-project.jsx spikes/fixtures/contract.mjs spikes/fixtures/build-ae-fixture.jsx spikes/fixtures/build-ae-fixture.mjs tests/tools/media-probe.test.mjs tests/spikes/make-media.test.mjs tests/spikes/ae-project.test.mjs
git commit -m "feat(spikes): AE fixture media, project helpers and fixture builder" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: S1 — Essential Graphics по скрипту

**Files:**
- Create: `spikes/s1-egp/probe.jsx`, `spikes/s1-egp/run.mjs`
- Create (итог прогона): `spikes/results/S1.json`, `spikes/results/S1.data.json`
- Modify: `spikes/RESULTS.md`

Что проверяем (§3.1, S1): добавление свойств в Essential Graphics скриптом на AE 26.5, по одной проверке на каждый тип; чтение имён назад (кириллица); маркеры защищённых областей; сторонний отчёт #504 («без `openInEssentialGraphics` canAdd возвращает `false`»).
- **Обязательные проверки:** открытие фикстуры, `openInEssentialGraphics`, Source Text ×2, флажок, слайдер, слой с заменой медиа, имена назад в обеих композициях, «Длительность» в штриховке, маркеры, сохранение копии.
- **Необязательные:** цвет (в шаблонах цвет задаётся списком палитры, §4.2), выпадающий список (при отказе его добавляют вручную, §4.4), canAdd без `openInEssentialGraphics` (конвейер всегда сначала открывает композицию в EGP).
- Перед добавлением всегда `canAdd`: неудачный `add` показывает предупреждение (модальное окно). Оба вызова идут с подавлением диалогов.

- [ ] **Step 1: Создать `spikes/s1-egp/probe.jsx`**

С какого числа считается индекс в `getMotionGraphicsTemplateControllerName`, документация не пишет. Проба узнаёт это по индексу 1: при двух и более свойствах он допустим в обеих схемах, поэтому вызова за пределами диапазона нет.

```js
// S1: Essential Graphics by script (spec 3.1). Composed after check.jsx and ae-project.jsx. ES3.
// Opens a fresh copy of the fixture, first measures canAdd on a comp copy WITHOUT openInEssentialGraphics
// (third-party report premiere-pro-mcp #504), then adds the contract properties one by one: canAdd first,
// because a failed add raises a warning dialog. Reads controller names back, checks the protected-region
// markers and saves the result as PARAMS.egpAep for S2 and S3.
// Docs: https://ae-scripting.docsforadobe.dev/property/property/ (canAddToMotionGraphicsTemplate 15.0,
//       addToMotionGraphicsTemplateAs 16.1; documented types: checkbox, color, slider, source text;
//       "warning dialogs" when a property cannot be added)
//       https://ae-scripting.docsforadobe.dev/layer/avlayer/ (AVLayer.canAdd/addToMotionGraphicsTemplateAs, 18.0)
//       https://ae-scripting.docsforadobe.dev/item/compitem/ (openInEssentialGraphics; controller count and
//       getMotionGraphicsTemplateControllerName 16.1; the index base is not documented)
var S1 = { open: false, lt: null, hatch: null, base: null, order: null, added: {}, controllers: {}, noEgp: null, markers: null };

function s1Guard(fn) {
  return function () {
    if (!S1.open) {
      return { pass: false, detail: 'skipped: fixture not open' };
    }
    return fn();
  };
}

// The Property (or the AVLayer, for media replacement) that a contract spec points at.
function s1Target(comp, spec) {
  var L = bkLayer(comp, spec.layer);
  if (spec.kind === 'text') {
    return bkSourceText(L);
  }
  if (spec.kind === 'media') {
    return L;
  }
  return bkEffect(L, spec.effect, spec.matchName).property(1);
}

// canAdd, then addAs. Never calls add after canAdd said no: that is the call that shows a dialog.
// The docs mention the warning dialog for canAdd too, so both calls run with dialogs suppressed.
function s1Add(comp, spec) {
  var t = s1Target(comp, spec);
  var can = null;
  var ok = null;
  app.beginSuppressDialogs();
  try {
    can = t.canAddToMotionGraphicsTemplate(comp);
    if (can === true) {
      ok = t.addToMotionGraphicsTemplateAs(comp, spec.label);
    }
  } finally {
    app.endSuppressDialogs(false);
  }
  if (can !== true) {
    return { pass: false, detail: 'canAdd=' + String(can) + ', not added' };
  }
  if (ok === true) {
    S1.added[comp.name] = (S1.added[comp.name] || []).concat([spec.label]);
  }
  return { pass: ok === true, detail: 'canAdd=true, addAs=' + String(ok) };
}

// Reads names at base..base+count-1, returned in the order they were added. The docs give neither the
// index base nor the order; S1 learns both from index 1, which is valid for both bases once there are
// two controllers, so no call goes out of range. AE 26.5 (checked live 2026-10-02): base 1 and the
// newest controller first, so index 1 is the last one added.
function s1Names(comp, order) {
  var n = comp.motionGraphicsTemplateControllerCount;
  var names = [];
  for (var i = 0; i < n; i++) {
    names.push(comp.getMotionGraphicsTemplateControllerName(order.base + i));
  }
  if (order.reverse) {
    names.reverse();
  }
  return { count: n, base: order.base, reverse: order.reverse, names: names };
}

function s1LearnOrder(comp, added) {
  var n = comp.motionGraphicsTemplateControllerCount;
  if (n < 2 || added.length !== n) {
    return null;
  }
  var at1 = comp.getMotionGraphicsTemplateControllerName(1);
  if (at1 === added[0]) {
    return { base: 1, reverse: false };
  }
  if (at1 === added[1]) {
    return { base: 0, reverse: false };
  }
  if (at1 === added[n - 1]) {
    return { base: 1, reverse: true };
  }
  if (at1 === added[n - 2]) {
    return { base: 0, reverse: true };
  }
  return null;
}

function s1SameList(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

check('fixture opened from disk', function () {
  bkOpenProject(PARAMS.fixtureAep);
  S1.lt = bkComp(PARAMS.comps.lt);
  S1.hatch = bkComp(PARAMS.comps.hatch);
  S1.open = true;
  return { pass: true, detail: bkProjectPath() };
}, true);

if (S1.open) {
  app.beginUndoGroup('BK S1 essential graphics');
}

check('without openInEssentialGraphics: canAdd on a comp copy (report #504)', s1Guard(function () {
  var dup = S1.lt.duplicate();
  dup.name = PARAMS.comps.lt + '_noEGP';
  var can = null;
  app.beginSuppressDialogs();
  try {
    can = bkSourceText(bkLayer(dup, 'TXT_NAME')).canAddToMotionGraphicsTemplate(dup);
  } finally {
    app.endSuppressDialogs(false);
    dup.remove();
  }
  S1.noEgp = can;
  return { pass: can === true,
    detail: 'canAdd=' + String(can) + (can === true ? ' (report not reproduced)' : ' (report reproduced: always open the comp in EGP first)') };
}), false);

check('openInEssentialGraphics(' + PARAMS.comps.lt + ')', s1Guard(function () {
  S1.lt.openInEssentialGraphics();
  return { pass: true, detail: 'opened' };
}), true);

for (var s1i = 0; s1i < PARAMS.egp.lt.length; s1i++) {
  (function (spec) {
    check('add ' + spec.kind + ': ' + spec.layer + (spec.effect ? '/' + spec.effect : ''), s1Guard(function () {
      return s1Add(S1.lt, spec);
    }), spec.required);
  })(PARAMS.egp.lt[s1i]);
}

check('controller names read back intact (Cyrillic) in ' + PARAMS.comps.lt, s1Guard(function () {
  var added = S1.added[S1.lt.name] || [];
  S1.order = s1LearnOrder(S1.lt, added);
  S1.base = S1.order ? S1.order.base : null;
  if (S1.order === null) {
    return { pass: false, detail: { count: S1.lt.motionGraphicsTemplateControllerCount, added: added,
      at1: S1.lt.motionGraphicsTemplateControllerCount >= 2 ? S1.lt.getMotionGraphicsTemplateControllerName(1) : null } };
  }
  var r = s1Names(S1.lt, S1.order);
  S1.controllers[S1.lt.name] = r;
  return { pass: r.count === added.length && s1SameList(r.names, added), detail: r };
}), true);

check('openInEssentialGraphics(' + PARAMS.comps.hatch + ') and add slider Duration', s1Guard(function () {
  S1.hatch.openInEssentialGraphics();
  return s1Add(S1.hatch, PARAMS.egp.hatch[0]);
}), true);

check('controller name read back in ' + PARAMS.comps.hatch, s1Guard(function () {
  if (!S1.order) {
    return { pass: false, detail: 'index base unknown (see the lower third check)' };
  }
  var r = s1Names(S1.hatch, S1.order);
  S1.controllers[S1.hatch.name] = r;
  return { pass: r.count === 1 && r.names[0] === PARAMS.egp.hatch[0].label, detail: r };
}), true);

check('protected-region markers survive save and open', s1Guard(function () {
  var got = bkMarkers(S1.lt);
  S1.markers = got;
  var ok = got.length === PARAMS.markers.length;
  for (var i = 0; ok && i < got.length; i++) {
    ok = got[i].protectedRegion === true && got[i].comment === PARAMS.markers[i].comment &&
      Math.abs(got[i].time - PARAMS.markers[i].time) < 0.001 && Math.abs(got[i].duration - PARAMS.markers[i].duration) < 0.001;
  }
  return { pass: ok, detail: got };
}), true);

if (S1.open) {
  app.endUndoGroup();
}

check('saved as ' + PARAMS.egpAep, s1Guard(function () {
  var r = bkSaveAs(PARAMS.egpAep);
  return { pass: r.bytes > 0 && r.dirty === false, detail: r };
}), true);

var S1_DATA = { base: S1.base, reverse: S1.order ? S1.order.reverse : null, noEgpCanAdd: S1.noEgp, controllers: S1.controllers, markers: S1.markers, project: '' };
try {
  S1_DATA.project = bkProjectPath();
} catch (e) {
  S1_DATA.error = String(e);
}
finish(S1_DATA);
```

- [ ] **Step 2: Проверить пробу линтером**

Run: `node tools/jsx/lint-jsx.cjs spikes/lib/ae-project.jsx spikes/s1-egp/probe.jsx`
Expected: две строки `OK … (1 warning(s))`.

- [ ] **Step 3: Создать `spikes/s1-egp/run.mjs`**

```js
#!/usr/bin/env node
// S1: Essential Graphics by script, on a fresh copy of the AE fixture.   node spikes/s1-egp/run.mjs
// Result: spikes/results/S1.json; probe data: spikes/results/S1.data.json (S2 reads it);
// project with Essential Graphics: <work>/fixtures/CRT_fixture_egp.aep.
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runSpike, REPO } from '../../tools/spike/runner.mjs';
import { fixturePaths, COMP_LT, COMP_HATCH, EGP, MARKERS } from '../fixtures/contract.mjs';

const p = fixturePaths();
if (!existsSync(p.fixtureAep)) {
  console.error('no fixture ' + p.fixtureAep + ': run node spikes/fixtures/build-ae-fixture.mjs');
  process.exit(2);
}
if (existsSync(p.egpAep)) renameSync(p.egpAep, p.egpAep.replace(/\.aep$/, '.prev.aep'));

const DATA = 'spikes/results/S1.data.json';
let out;
try {
  out = await runSpike({
    id: 'S1',
    title: 'Essential Graphics по скрипту',
    host: 'ae',
    files: ['spikes/lib/ae-project.jsx', 'spikes/s1-egp/probe.jsx'],
    params: {
      workDir: p.workDir, fixtureAep: p.fixtureAep, egpAep: p.egpAep,
      comps: { lt: COMP_LT, hatch: COMP_HATCH },
      egp: { lt: EGP[COMP_LT], hatch: EGP[COMP_HATCH] },
      markers: MARKERS,
    },
    timeoutMs: 300000,
    fallback: 'Essential Graphics каждого мастера собирается вручную один раз (~25 композиций); скрипт делает имена, маркеры и экспорт',
    notes: 'Цвет и выпадающий список — необязательные проверки: цвет в шаблонах задаётся списком палитры (§4.2), '
      + 'список при отказе добавляется вручную (§4.4). «Без openInEssentialGraphics» — проверка отчёта #504; '
      + 'конвейер всегда сначала открывает композицию в EGP.',
    evidence: [DATA],
  });
} catch (e) {
  console.error('ERROR: ' + e.message);
  console.error('Before any new call: node tools/host-run.mjs --host ae "JSON.stringify({ v: app.version })"');
  process.exit(1);
}
mkdirSync(path.join(REPO, 'spikes/results'), { recursive: true });
writeFileSync(path.join(REPO, DATA), JSON.stringify(out.data, null, 2) + '\n', 'utf8');
for (const c of out.result.checks) {
  console.log((c.pass ? 'ok  ' : (c.required ? 'FAIL' : 'warn')) + ' ' + c.name
    + (c.pass ? '' : '  -> ' + JSON.stringify(c.detail).slice(0, 300)));
}
console.log('S1: ' + out.result.verdict + ' -> ' + out.file);
```

- [ ] **Step 4: Проверить синтаксис раннера**

Run: `node --check spikes/s1-egp/run.mjs`
Expected: пустой вывод, код возврата 0.

- [ ] **Step 5: Подготовить AE (вручную)**

Как в шаге 18 задачи 7. Фикстура из задачи 7 может оставаться открытой.

- [ ] **Step 6: Запустить S1**

Run: `node spikes/s1-egp/run.mjs`
Expected при полном успехе:

```text
ok   fixture opened from disk
ok   without openInEssentialGraphics: canAdd on a comp copy (report #504)
ok   openInEssentialGraphics(CRT_LowerThird_v1)
ok   add text: TXT_NAME
ok   add text: TXT_ROLE
ok   add checkbox: CTRL/ShowRole
ok   add slider: CTRL/Duration
ok   add color: CTRL/Accent
ok   add dropdown: CTRL/Style
ok   add media: SLOT_PHOTO
ok   controller names read back intact (Cyrillic) in CRT_LowerThird_v1
ok   openInEssentialGraphics(CRT_Hatch_v1) and add slider Duration
ok   controller name read back in CRT_Hatch_v1
ok   protected-region markers survive save and open
ok   saved as C:/CRBK/work/fixtures/CRT_fixture_egp.aep
S1: yes -> …\spikes\results\S1.json
```

Как читать итог:
- `warn` в необязательной проверке даёт `partial`: скрипт годится, отказавший тип (цвет, список) настраивается вручную один раз в мастере (§4.4).
- `warn` на строке «report #504» — отчёт подтвердился: правило «сначала `openInEssentialGraphics`» обязательно (конвейер так и делает).
- `FAIL` в обязательной даёт `no`: запасной путь из `fallback` — Essential Graphics каждого мастера вручную.
- `spikes/results/S1.data.json`: схема индексов (`base`), имена свойств по композициям, маркеры. Этот файл читает S2.

- [ ] **Step 7: Проверить панель Essential Graphics и записать наблюдения (вручную)**

1. В AE открыт `CRT_fixture_egp.aep`. Открыть Window → Essential Graphics («Окно» → «Основные графические элементы»), Primary — `CRT_LowerThird_v1`.
2. Проверить: подписи свойств по-русски читаются без искажений; у «Стиль» пункты Dark и Light; «Фото» показывает миниатюру слота медиа.
3. Записать:

```bash
node tools/spike/manual.mjs --id S1 --check "EGP panel shows the Russian labels" --pass true --detail "<число свойств, что видно>"
node tools/spike/manual.mjs --id S1 --check "no dialogs during the run" --pass true --detail "-" --optional
```

Если подписи искажены или во время прогона было окно — `--pass false`, в `--detail` текст окна.

- [ ] **Step 8: Обновить отчёт**

Run: `npm run spike:report`
Expected: `written …\spikes\RESULTS.md`, в таблице строка `| S1 | Essential Graphics по скрипту | ae | 26.5… |`.

- [ ] **Step 9: Commit**

```bash
git add spikes/s1-egp/probe.jsx spikes/s1-egp/run.mjs spikes/results/S1.json spikes/results/S1.data.json spikes/RESULTS.md
git commit -m "feat(spikes): S1 essential graphics by script" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: S2 — Экспорт MOGRT по одному

**Files:**
- Create: `tools/spike/wait-file.mjs`, `tools/spike/mogrt.mjs`, `spikes/s2-mogrt-export/probe.jsx`, `spikes/s2-mogrt-export/run.mjs`
- Test: `tests/tools/wait-file.test.mjs`, `tests/tools/mogrt.test.mjs`
- Create (итог прогона): `spikes/results/S2.json`, `spikes/results/S2.data.json`, `spikes/results/evidence/S2-*-definition.json`
- Modify: `spikes/RESULTS.md`

Что проверяем (§3.1, S2): три вызова хоста строго по одному — нижняя треть, штриховка, снова нижняя треть с `overwrite = true`. Между вызовами Node ждёт, пока размер `.mogrt` не меняется 2 с (не дольше 120 с), и открывает файл через adm-zip: есть ли `definition.json` и `project.aegraphic`, какие свойства внутри, какой `capsuleID`. Обязательно, чтобы в `definition.json` нашлось каждое свойство из S1; лишние свойства не ошибка, их число пишется в `notes`.
- Значение, которое вернул `exportAsMotionGraphicsTemplate`, — отдельная необязательная проверка: известная ошибка с 24.x — `false` до конца экспорта. Если она воспроизвелась, итог `partial`, а конвейер опирается на файл, а не на ответ.
- Порядок перед экспортом: имя шаблона → сохранить → `openInEssentialGraphics` → если проект снова изменён, сохранить ещё раз → экспорт. Несохранённый проект при экспорте вызывает окно «Сохранить?» (документация CompItem); меняет ли проект `openInEssentialGraphics`, неизвестно — проба записывает `dirtyAfterOpenInEGP`.
- Экспорт с `overwrite = false` не проверяем: на существующий файл AE может задать модальный вопрос. Совпадение `capsuleID` при повторном экспорте записывается в `notes` — это вход для S6.

- [ ] **Step 1: Написать падающий тест `tests/tools/wait-file.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, appendFileSync, utimesSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { waitStableFile, findNewFiles, waitNewStableFiles } from '../../tools/spike/wait-file.mjs';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'bk-wait-'));

describe('wait-file', () => {
  it('waits until a growing file stops changing', async () => {
    const f = path.join(tmp(), 'a.mogrt');
    setTimeout(() => writeFileSync(f, 'x'), 50);
    setTimeout(() => appendFileSync(f, 'yy'), 150);
    const r = await waitStableFile(f, { stableMs: 300, timeoutMs: 3000, intervalMs: 20 });
    expect(r.ok).toBe(true);
    expect(r.size).toBe(3);
    expect(r.waitedMs).toBeGreaterThanOrEqual(400);
  });

  it('reports a missing file after the timeout', async () => {
    const r = await waitStableFile(path.join(tmp(), 'none.mogrt'), { stableMs: 50, timeoutMs: 200, intervalMs: 20 });
    expect(r).toMatchObject({ ok: false, reason: 'missing' });
  });

  it('ignores a stale file until it is rewritten', async () => {
    const f = path.join(tmp(), 'old.mogrt');
    writeFileSync(f, 'old');
    const past = new Date(Date.now() - 60000);
    utimesSync(f, past, past);
    const since = Date.now() - 1000;
    const stale = await waitStableFile(f, { stableMs: 50, timeoutMs: 200, intervalMs: 20, sinceMs: since });
    expect(stale).toMatchObject({ ok: false, reason: 'not updated' });
    setTimeout(() => writeFileSync(f, 'new!'), 50);
    const fresh = await waitStableFile(f, { stableMs: 100, timeoutMs: 3000, intervalMs: 20, sinceMs: since });
    expect(fresh).toMatchObject({ ok: true, size: 4 });
  });

  it('finds new files by extension, recursively', () => {
    const d = tmp();
    mkdirSync(path.join(d, 'sub'));
    writeFileSync(path.join(d, 'sub', 'out.MP4'), 'v');
    writeFileSync(path.join(d, 'log.txt'), 't');
    expect(findNewFiles(d, { exts: ['.mp4'] }).map((p) => path.basename(p))).toEqual(['out.MP4']);
    expect(findNewFiles(d, { exts: ['.mp4'], sinceMs: Date.now() + 60000 })).toEqual([]);
  });

  it('waits for a new file to appear and settle', async () => {
    const d = tmp();
    const since = Date.now() - 1000;
    setTimeout(() => writeFileSync(path.join(d, 'job.mp4'), 'abc'), 100);
    const r = await waitNewStableFiles(d, { exts: ['.mp4'], sinceMs: since, stableMs: 100, timeoutMs: 3000, intervalMs: 20 });
    expect(r.ok).toBe(true);
    expect(r.files).toHaveLength(1);
    expect(r.files[0].size).toBe(3);
  });

  it('gives up when nothing appears', async () => {
    const r = await waitNewStableFiles(tmp(), { exts: ['.mp4'], stableMs: 50, timeoutMs: 200, intervalMs: 20 });
    expect(r).toMatchObject({ ok: false, reason: 'no new file' });
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run tests/tools/wait-file.test.mjs`
Expected: FAIL — модуль `tools/spike/wait-file.mjs` не найден.

- [ ] **Step 3: Создать `tools/spike/wait-file.mjs`**

```js
// Waiting for files that another process writes (AE MOGRT export, AME encodes, renders).
// A host call that returned is no proof the bytes are on disk (ae-quirks #27, #40, #50): gate on the file.
// Shared helper: S2 and S10 use it, and the spikes of parts C, D and E import these waits instead of
// writing their own.
import { statSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function statOrNull(p) {
  try {
    return statSync(p);
  } catch {
    return null;
  }
}

// Resolves when `file` exists, is non-empty, is newer than sinceMs and its size and mtime have not
// changed for stableMs. Never throws on timeout: { ok: false, reason: 'missing' | 'not updated' | 'not stable' }.
export async function waitStableFile(file, { stableMs = 2000, timeoutMs = 120000, intervalMs = 250, sinceMs = 0 } = {}) {
  const t0 = Date.now();
  let sig = null;
  let since = 0;
  for (;;) {
    const st = statOrNull(file);
    const now = Date.now();
    if (st && st.size > 0 && st.mtimeMs > sinceMs) {
      const s = st.size + ':' + st.mtimeMs;
      if (s !== sig) {
        sig = s;
        since = now;
      } else if (now - since >= stableMs) {
        return { ok: true, file, size: st.size, mtimeMs: st.mtimeMs, waitedMs: now - t0 };
      }
    }
    if (now - t0 >= timeoutMs) {
      let reason = 'missing';
      if (st) reason = st.mtimeMs > sinceMs && st.size > 0 ? 'not stable' : 'not updated';
      return { ok: false, file, reason, size: st ? st.size : 0, waitedMs: now - t0 };
    }
    await sleep(intervalMs);
  }
}

// Files under dir (recursive) with one of exts (lower case, with the dot), modified after sinceMs.
export function findNewFiles(dir, { exts = [], sinceMs = 0 } = {}) {
  const out = [];
  const walk = (d) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        walk(p);
        continue;
      }
      if (exts.length && !exts.includes(path.extname(e.name).toLowerCase())) continue;
      const st = statOrNull(p);
      if (st && st.mtimeMs > sinceMs) out.push(p.replace(/\\/g, '/'));
    }
  };
  walk(dir);
  return out.sort();
}

// Waits for at least one new file under dir, then until every new file is stable.
export async function waitNewStableFiles(dir, { exts = [], sinceMs = 0, stableMs = 5000, timeoutMs = 600000, intervalMs = 1000 } = {}) {
  const t0 = Date.now();
  let found = [];
  while (Date.now() - t0 < timeoutMs) {
    found = findNewFiles(dir, { exts, sinceMs });
    if (found.length) break;
    await sleep(intervalMs);
  }
  if (!found.length) return { ok: false, reason: 'no new file', files: [], waitedMs: Date.now() - t0 };
  const files = [];
  for (const f of found) {
    const left = Math.max(stableMs + intervalMs, timeoutMs - (Date.now() - t0));
    files.push(await waitStableFile(f, { stableMs, timeoutMs: left, intervalMs, sinceMs }));
  }
  return { ok: files.every((r) => r.ok), files, waitedMs: Date.now() - t0 };
}
```

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/tools/wait-file.test.mjs`
Expected: `6 passed`.

- [ ] **Step 5: Написать падающий тест `tests/tools/mogrt.test.mjs`**

Структура `definition.json` взята из MOGRT, сделанных в AE, из папки Premiere 2026 `Essential Graphics`: `clientControls[]` с полями `type` и `uiName.strDB[].str`; типы 1 — флажок, 2 — слайдер, 4 — цвет, 6 — текст, 8 — группа. Номера для списка и замены медиа там не встречаются, S2 их запишет.

```js
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { readMogrt, matchControls, controlNames } from '../../tools/spike/mogrt.mjs';

const ui = (...names) => ({ strDB: names.map((str, i) => ({ localeString: i ? 'ru_RU' : 'en_US', str })) });

function makeMogrt(definition, { aegraphic = true, bom = false } = {}) {
  const zip = new AdmZip();
  const text = (bom ? '\uFEFF' : '') + JSON.stringify(definition);
  zip.addFile('definition.json', Buffer.from(text, 'utf8'));
  if (aegraphic) zip.addFile('project.aegraphic', Buffer.from('PK-not-checked'));
  zip.addFile('thumb.png', Buffer.from('png'));
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), 'bk-mogrt-')), 'CRT_Test.mogrt');
  zip.writeZip(file);
  return file;
}

const DEF = {
  capsuleID: '11111111-2222-3333-4444-555555555555',
  capsuleName: 'CRT_LowerThird_v1',
  clientControls: [
    { id: 'a', type: 6, uiName: ui('Имя') },
    { id: 'b', type: 1, uiName: ui('Показать должность') },
    { id: 'c', type: 2, uiName: ui('Длительность (служебное, не менять)') },
    { id: 'd', type: 8, uiName: ui('') },
    { id: 'e', type: 13, uiName: ui('Фото') },
  ],
};

describe('mogrt', () => {
  it('collects the distinct non-empty names of a control', () => {
    expect(controlNames({ uiName: ui('Text', 'Текст', 'Text') })).toEqual(['Text', 'Текст']);
    expect(controlNames({})).toEqual([]);
  });

  it('reads entries, capsule and controls of a MOGRT', () => {
    const m = readMogrt(makeMogrt(DEF, { bom: true }));
    expect(m.hasDefinition).toBe(true);
    expect(m.hasAegraphic).toBe(true);
    expect(m.capsuleID).toBe(DEF.capsuleID);
    expect(m.controls.map((c) => c.kind)).toEqual(['text', 'checkbox', 'slider', 'group', 'type13']);
    expect(m.controls[0].names).toEqual(['Имя']);
  });

  it('flags a MOGRT without project.aegraphic', () => {
    expect(readMogrt(makeMogrt(DEF, { aegraphic: false })).hasAegraphic).toBe(false);
  });

  it('matches expected labels and counts controls without groups', () => {
    const m = readMogrt(makeMogrt(DEF));
    expect(matchControls(m.controls, ['Имя', 'Фото', 'Стиль'])).toEqual({
      found: ['Имя', 'Фото'], missing: ['Стиль'], count: 4,
    });
  });
});
```

- [ ] **Step 6: Убедиться, что тест падает**

Run: `npx vitest run tests/tools/mogrt.test.mjs`
Expected: FAIL — модуль `tools/spike/mogrt.mjs` не найден.

- [ ] **Step 7: Создать `tools/spike/mogrt.mjs`**

```js
// Reads an exported .mogrt (a zip): entry list, capsuleID and Essential Graphics controls from definition.json.
// Layout seen in Adobe's own AE-made MOGRTs (Premiere 2026 "Essential Graphics" folder): definition.json,
// project.aegraphic (+ localized copies), thumb*.png; clientControls[] with type and uiName.strDB[].str.
// Shared helper: S2 uses it, and the spikes of parts C, D and E read MOGRT controls with it instead of
// writing their own reader. Reading and patching a capsuleID on its own: tools/mogrt/capsule.mjs (task 17).
import AdmZip from 'adm-zip';

// clientControls[].type in those MOGRTs. Dropdown and media replacement do not occur there; S2 records them.
export const CONTROL_TYPES = { 1: 'checkbox', 2: 'slider', 4: 'color', 6: 'text', 8: 'group' };

export function controlNames(control) {
  const db = (control && control.uiName && control.uiName.strDB) || [];
  const names = [];
  for (const s of db) if (s && typeof s.str === 'string' && s.str && !names.includes(s.str)) names.push(s.str);
  return names;
}

export function readMogrt(file) {
  const zip = new AdmZip(file);
  const entries = zip.getEntries().map((e) => e.entryName);
  const def = zip.getEntry('definition.json');
  const definition = def ? JSON.parse(zip.readAsText(def, 'utf8').replace(/^\uFEFF/, '')) : null;
  const controls = ((definition && definition.clientControls) || []).map((c) => ({
    id: c.id, type: c.type, kind: CONTROL_TYPES[c.type] || 'type' + c.type, names: controlNames(c),
  }));
  return {
    entries,
    hasDefinition: Boolean(def),
    hasAegraphic: entries.includes('project.aegraphic'),
    capsuleID: (definition && definition.capsuleID) || null,
    capsuleName: (definition && definition.capsuleName) || null,
    controls,
    definition,
  };
}

// Which expected labels appear among the control names (any locale), and how many non-group controls exist.
export function matchControls(controls, labels) {
  const all = new Set();
  for (const c of controls) for (const n of c.names) all.add(n);
  return {
    found: labels.filter((l) => all.has(l)),
    missing: labels.filter((l) => !all.has(l)),
    count: controls.filter((c) => c.kind !== 'group').length,
  };
}
```

- [ ] **Step 8: Запустить тест и прочитать настоящий MOGRT из AE**

Run: `npx vitest run tests/tools/mogrt.test.mjs`
Expected: `4 passed`.

Run: `node -e "import('./tools/spike/mogrt.mjs').then((m) => { const r = m.readMogrt('C:/Program Files/Adobe/Adobe Premiere Pro 2026/Essential Graphics/[AE] Sports Package/Sports Lower Third Side.mogrt'); console.log(r.hasDefinition, r.hasAegraphic, r.controls.length, r.controls.map((c) => c.kind).join(',')); })"`
Expected: `true true 12 group,text,text,group,group,color,color,color,color,color,checkbox,checkbox`.

- [ ] **Step 9: Создать `spikes/s2-mogrt-export/probe.jsx`**

```js
// S2: export ONE MOGRT per call (spec 3.1). Composed after check.jsx and ae-project.jsx. ES3.
// Node (run.mjs) waits for a stable file before the next call: exports never overlap.
// Sequence: template name -> save -> openInEssentialGraphics -> save again if that dirtied the project
// (an unsaved project makes the export ask to save, a modal) -> exportAsMotionGraphicsTemplate.
// Both saves run inside bkQuiet and the export inside begin/endSuppressDialogs (plan conventions).
// Docs: https://ae-scripting.docsforadobe.dev/item/compitem/ (motionGraphicsTemplateName,
//       exportAsMotionGraphicsTemplate(doOverWriteFileIfExisting[, file_path]): "use save() before exporting").
// Known bug since 24.x: the call returns false before the export has finished; S2 records the value.
var S2 = { ready: false, comp: null, count: null, returned: null, callMs: null, dirtyAfterOpen: null };

function s2Guard(fn) {
  return function () {
    if (!S2.ready) {
      return { pass: false, detail: 'skipped: project not ready' };
    }
    return fn();
  };
}

check('project ready for ' + PARAMS.comp, function () {
  if (PARAMS.openProject) {
    bkOpenProject(PARAMS.egpAep);
    bkSaveAs(PARAMS.s2Aep);             // work on a copy: the S1 result stays as it is
  } else if (bkNorm(bkProjectPath()) !== bkNorm(PARAMS.s2Aep)) {
    throw new Error('BK_WRONG_PROJECT: expected ' + PARAMS.s2Aep + ', open: ' + (bkProjectPath() || 'untitled'));
  }
  S2.comp = bkComp(PARAMS.comp);
  S2.count = S2.comp.motionGraphicsTemplateControllerCount;
  S2.ready = true;
  return { pass: S2.count > 0, detail: bkProjectPath() + ', controllers: ' + S2.count };
}, true);

check('template name ' + PARAMS.templateName + ', saved, openInEssentialGraphics, clean', s2Guard(function () {
  app.beginUndoGroup('BK S2 template name');
  try {
    S2.comp.motionGraphicsTemplateName = PARAMS.templateName;
  } finally {
    app.endUndoGroup();
  }
  bkQuiet(function () {
    app.project.save();
  });
  S2.comp.openInEssentialGraphics();
  S2.dirtyAfterOpen = app.project.dirty;
  if (S2.dirtyAfterOpen) {
    bkQuiet(function () {
      app.project.save();
    });
  }
  return { pass: S2.comp.motionGraphicsTemplateName === PARAMS.templateName && app.project.dirty === false,
    detail: { name: S2.comp.motionGraphicsTemplateName, dirtyAfterOpenInEGP: S2.dirtyAfterOpen } };
}), true);

check('exportAsMotionGraphicsTemplate returned true (' + PARAMS.comp + ')', s2Guard(function () {
  var t0 = bkNow();
  var r = null;
  app.beginSuppressDialogs();
  try {
    r = S2.comp.exportAsMotionGraphicsTemplate(PARAMS.overwrite, new Folder(PARAMS.folder).fsName);
  } finally {
    app.endSuppressDialogs(false);
  }
  S2.returned = r;
  S2.callMs = bkNow() - t0;
  return { pass: r === true, detail: 'returned ' + String(r) + ' after ' + S2.callMs + ' ms' };
}), false);

finish({ comp: PARAMS.comp, templateName: PARAMS.templateName, overwrite: PARAMS.overwrite,
  returned: S2.returned, callMs: S2.callMs, controllerCount: S2.count, dirtyAfterOpenInEGP: S2.dirtyAfterOpen });
```

- [ ] **Step 10: Проверить пробу линтером**

Run: `node tools/jsx/lint-jsx.cjs spikes/s2-mogrt-export/probe.jsx`
Expected: `OK    spikes/s2-mogrt-export/probe.jsx (1 warning(s))`.

- [ ] **Step 11: Создать `spikes/s2-mogrt-export/run.mjs`**

Раннер вызывает хост сам (не через `runSpike`): итог трёх вызовов и проверок Node собирается в один `S2.json` через `makeResult`/`writeResult`.

```js
#!/usr/bin/env node
// S2: MOGRT export strictly one at a time.   node spikes/s2-mogrt-export/run.mjs
// Needs S1 (CRT_fixture_egp.aep and spikes/results/S1.data.json). Three host calls:
// lower third, hatch, lower third again with overwrite. Between calls Node waits until the .mogrt
// size has not changed for 2 s (max 120 s), then opens it with adm-zip.
// Writes spikes/results/S2.json, the data spikes/results/S2.data.json and the definition dumps
// spikes/results/evidence/S2-<comp>[-again]-definition.json.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { run } from '../../tools/host-run.mjs';
import { composeProbe, REPO } from '../../tools/spike/runner.mjs';
import { makeResult, writeResult } from '../../tools/spike/result.mjs';
import { waitStableFile, statOrNull, findNewFiles } from '../../tools/spike/wait-file.mjs';
import { readMogrt, matchControls } from '../../tools/spike/mogrt.mjs';
import { ensureDir, workPath } from '../../tools/lib/work.mjs';
import { fixturePaths, COMP_LT, COMP_HATCH } from '../fixtures/contract.mjs';

const p = fixturePaths();
const S1DATA = path.join(REPO, 'spikes/results/S1.data.json');
if (!existsSync(p.egpAep) || !existsSync(S1DATA)) {
  console.error('run S1 first (node spikes/s1-egp/run.mjs): need ' + p.egpAep + ' and ' + S1DATA);
  process.exit(2);
}
const s1 = JSON.parse(readFileSync(S1DATA, 'utf8'));
const s2Aep = workPath('fixtures', 'CRT_fixture_s2.aep');
ensureDir(p.mogrtDir);
if (existsSync(s2Aep)) renameSync(s2Aep, s2Aep.replace(/\.aep$/, '.prev.aep'));
for (const c of [COMP_LT, COMP_HATCH]) rmSync(path.posix.join(p.mogrtDir, c + '.mogrt'), { force: true });   // our own outputs

const checks = [];
const evidence = { phases: [] };
let hostVersion = null;

async function phase({ comp, openProject, again }) {
  const file = path.posix.join(p.mogrtDir, comp + '.mogrt');
  const before = statOrNull(file);
  const prev = again && before ? readMogrt(file) : null;
  const t0 = Date.now();
  const params = { workDir: p.workDir, egpAep: p.egpAep, s2Aep, comp, templateName: comp,
    folder: p.mogrtDir, overwrite: true, openProject };
  const r = await run('ae', composeProbe(['spikes/lib/ae-project.jsx', 'spikes/s2-mogrt-export/probe.jsx'], params),
    { timeoutMs: 180000 });
  if (!r || !Array.isArray(r.checks)) throw new Error('S2 probe must return finish({...}); got ' + JSON.stringify(r).slice(0, 300));
  hostVersion = (r.data && r.data.hostVersion) || hostVersion;
  for (const c of r.checks) checks.push(again ? { ...c, name: c.name + ' (re-export)', required: false } : c);

  const tag = comp + (again ? ', re-export' : '');
  const w = await waitStableFile(file, { stableMs: 2000, timeoutMs: 120000, sinceMs: again && before ? before.mtimeMs : 0 });
  const extra = findNewFiles(p.mogrtDir, { exts: ['.mogrt'], sinceMs: t0 - 1000 }).filter((f) => f !== file);
  checks.push({ name: 'mogrt written and stable (' + tag + ')', pass: w.ok, required: !again,
    detail: { ...w, otherNewMogrts: extra, returned: r.data && r.data.returned } });
  const ph = { comp, again: Boolean(again), probe: r.data, wait: w, otherNewMogrts: extra };
  if (w.ok) {
    const m = readMogrt(file);
    ph.mogrt = { entries: m.entries, capsuleID: m.capsuleID, capsuleName: m.capsuleName, controls: m.controls };
    const defOut = 'spikes/results/evidence/S2-' + comp + (again ? '-again' : '') + '-definition.json';
    writeFileSync(path.join(REPO, defOut), JSON.stringify(m.definition, null, 2) + '\n', 'utf8');
    ph.definitionFile = defOut;
    if (!again) {
      checks.push({ name: 'zip has definition.json and project.aegraphic (' + tag + ')',
        pass: m.hasDefinition && m.hasAegraphic, required: true, detail: m.entries });
      // Every S1 controller must be in the MOGRT; extra controls are recorded (count vs S1), not failed.
      const names = (s1.controllers && s1.controllers[comp] && s1.controllers[comp].names) || [];
      const mc = matchControls(m.controls, names);
      checks.push({ name: 'definition.json has every S1 controller (' + tag + ')',
        pass: names.length > 0 && mc.missing.length === 0, required: true,
        detail: { ...mc, s1Count: names.length, s1: names, kinds: m.controls.map((c) => c.kind + ':' + (c.names[0] || '')) } });
    } else {
      ph.capsuleBefore = prev ? prev.capsuleID : null;
      ph.capsuleSame = Boolean(prev && prev.capsuleID === m.capsuleID);
    }
  }
  evidence.phases.push(ph);
}

mkdirSync(path.join(REPO, 'spikes/results/evidence'), { recursive: true });   // definition dumps
try {
  await phase({ comp: COMP_LT, openProject: true });
  await phase({ comp: COMP_HATCH, openProject: false });
  await phase({ comp: COMP_LT, openProject: false, again: true });
} catch (e) {
  console.error('ERROR: ' + e.message);
  console.error('Before any new call: node tools/host-run.mjs --host ae "JSON.stringify({ v: app.version })"');
  checks.push({ name: 'all three export calls completed', pass: false, required: true, detail: e.message });
}

const DATA = 'spikes/results/S2.data.json';
writeFileSync(path.join(REPO, DATA), JSON.stringify(evidence, null, 2) + '\n', 'utf8');
const re = evidence.phases.find((x) => x.again) || {};
const returnedValues = evidence.phases.map((x) => (x.probe ? String(x.probe.returned) : 'n/a')).join('/');
let capsule = 'неизвестен';
if (re.capsuleBefore) capsule = re.capsuleSame ? 'тот же' : 'новый';
const counts = evidence.phases.filter((x) => !x.again && x.mogrt)
  .map((x) => x.comp + ': ' + x.mogrt.controls.filter((c) => c.kind !== 'group').length).join(', ');
const result = makeResult({
  id: 'S2',
  title: 'Экспорт MOGRT по одному',
  host: 'ae',
  hostVersion,
  checks,
  fallback: 'Экспорт MOGRT вручную по чек-листу; AE-сторона плагина от этого не зависит',
  notes: 'exportAsMotionGraphicsTemplate вернул: ' + returnedValues + ' (LT/Hatch/повтор). '
    + 'Свойств в definition.json: ' + (counts || 'n/a') + '. '
    + 'Повторный экспорт с overwrite=true: capsuleID ' + capsule + ' (вход для S6). '
    + 'Экспорт с overwrite=false не проверялся: возможен модальный вопрос.',
  evidence: [DATA],
});
const file = writeResult(result);
for (const c of checks) {
  console.log((c.pass ? 'ok  ' : (c.required ? 'FAIL' : 'warn')) + ' ' + c.name
    + (c.pass ? '' : '  -> ' + JSON.stringify(c.detail).slice(0, 300)));
}
console.log('S2: ' + result.verdict + ' -> ' + file);
```

- [ ] **Step 12: Проверить синтаксис раннера**

Run: `node --check spikes/s2-mogrt-export/run.mjs`
Expected: пустой вывод, код возврата 0.

- [ ] **Step 13: Подготовить AE (вручную)**

Как в шаге 18 задачи 7. S1 должен быть выполнен: нужны `C:/CRBK/work/fixtures/CRT_fixture_egp.aep` и `spikes/results/S1.data.json`.

- [ ] **Step 14: Запустить S2**

Run: `node spikes/s2-mogrt-export/run.mjs`
Expected (ошибка возвращаемого значения воспроизвелась — итог `partial`; если AE вернул `true`, эти строки тоже `ok` и итог `yes`):

```text
ok   project ready for CRT_LowerThird_v1
ok   template name CRT_LowerThird_v1, saved, openInEssentialGraphics, clean
warn exportAsMotionGraphicsTemplate returned true (CRT_LowerThird_v1)  -> "returned false after … ms"
ok   mogrt written and stable (CRT_LowerThird_v1)
ok   zip has definition.json and project.aegraphic (CRT_LowerThird_v1)
ok   definition.json has every S1 controller (CRT_LowerThird_v1)
ok   project ready for CRT_Hatch_v1
ok   template name CRT_Hatch_v1, saved, openInEssentialGraphics, clean
warn exportAsMotionGraphicsTemplate returned true (CRT_Hatch_v1)  -> "returned false after … ms"
ok   mogrt written and stable (CRT_Hatch_v1)
ok   zip has definition.json and project.aegraphic (CRT_Hatch_v1)
ok   definition.json has every S1 controller (CRT_Hatch_v1)
ok   project ready for CRT_LowerThird_v1 (re-export)
ok   template name CRT_LowerThird_v1, saved, openInEssentialGraphics, clean (re-export)
warn exportAsMotionGraphicsTemplate returned true (CRT_LowerThird_v1) (re-export)  -> "returned false after … ms"
ok   mogrt written and stable (CRT_LowerThird_v1, re-export)
S2: partial -> …\spikes\results\S2.json
```

Файлы: `C:/CRBK/work/mogrt/CRT_LowerThird_v1.mogrt` и `CRT_Hatch_v1.mogrt` (их берут часть D и S9 части E). `FAIL` на «mogrt written and stable» — файла нет 120 с: итог `no`, запасной путь — экспорт вручную по чек-листу.

- [ ] **Step 15: Записать наблюдения (вручную)**

```bash
node tools/spike/manual.mjs --id S2 --check "no dialogs during the exports" --pass true --detail "-" --optional
```

Если появлялось окно (сохранение, перезапись, шрифты) — `--pass false`, в `--detail` его текст.

- [ ] **Step 16: Обновить отчёт**

Run: `npm run spike:report`
Expected: `written …\spikes\RESULTS.md`, в таблице строка S2.

- [ ] **Step 17: Commit**

```bash
git add tools/spike/wait-file.mjs tools/spike/mogrt.mjs tests/tools/wait-file.test.mjs tests/tools/mogrt.test.mjs spikes/s2-mogrt-export/probe.jsx spikes/s2-mogrt-export/run.mjs spikes/results/S2.json spikes/results/S2.data.json spikes/results/evidence/S2-*-definition.json spikes/RESULTS.md
git commit -m "feat(spikes): S2 one-by-one MOGRT export with file wait and mogrt reader" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: S4 — applyPreset и оба движка выражений

**Files:**
- Create: `spikes/s4-preset-engines/probe.jsx`, `spikes/s4-preset-engines/run.mjs`
- Create (итог прогона): `spikes/results/S4.json`, `spikes/results/S4.data.json`
- Modify: `spikes/RESULTS.md`

Что проверяем (§3.1, S4):
- Все 8 выражений фикстуры в движке `extendscript` и в `javascript-1.0`: каждое вычисляется в нескольких точках времени, затем тот же текст задаётся заново (перекомпиляция под текущий движок), `expressionError` должен остаться пустым. Это делается до пресетов, пока слои не изменены.
- `applyPreset` с выделением: выделен только `TXT_ROLE`, `comp.time = 2` — пресет ложится только на `TXT_ROLE` (число эффектов меняется у него одного), первый ключ на 2 с. Выделение и `comp.time` перед вызовом читаются назад и пишутся в `detail`.
- Текстовый пресет на выделенный `TXT_NAME` при `comp.time = 3` — ключи аниматора с 3 с.
- Без выделения при `comp.time = 4`: по документации пресет создаёт новый слой-solid.
- Арифметика со свойством без `.value` (`effect("Duration")(1) - 1`) в обоих движках — для правила контракта §4.2.
- **Обязательные:** открытие, 8 выражений найдено, оба движка без ошибок, пресет только на `TXT_ROLE`, первый ключ на `comp.time`. **Необязательные:** текстовый пресет, без выделения, без `.value`, сохранение копии.

Пресеты из поставки AE: общий `Transitions - Wipes/Linear Wipe.ffx` (эффект с ключами, ложится на любой слой) и текстовый `Text/Animate In/Fade Up Characters.ffx`. Node копирует их в рабочую папку: проба видит только ASCII-пути рабочей папки, как в будущей библиотеке. Сама фикстура не меняется: результат сохраняется копией `C:/CRBK/work/s4/CRT_fixture_s4.aep`.

- [ ] **Step 1: Найти пресеты в поставке AE**

Run: `ls "C:/Program Files/Adobe/Adobe After Effects 2026/Support Files/Presets/Transitions - Wipes" "C:/Program Files/Adobe/Adobe After Effects 2026/Support Files/Presets/Text/Animate In"`
Expected: в списках есть `Linear Wipe.ffx` и `Fade Up Characters.ffx` (проверено на этой машине 2026-10-02). Если AE стоит в другой папке — задать `BRANDKIT_AE_PRESETS=<папка Presets>` для шага 7.

- [ ] **Step 2: Создать `spikes/s4-preset-engines/probe.jsx`**

```js
// S4: applyPreset with and without a selection, and every fixture expression in both engines (spec 3.1).
// Composed after check.jsx and ae-project.jsx. ES3. Works on the fixture opened from disk and saves the
// result as a scratch copy (PARAMS.s4Aep): the fixture file itself is never changed.
// Docs: https://ae-scripting.docsforadobe.dev/layer/layer/ (applyPreset: selected layers of the comp; no
//       selection -> a new solid), https://ae-scripting.docsforadobe.dev/general/project/ (expressionEngine,
//       "extendscript" | "javascript-1.0", AE 16.0+),
//       https://ae-scripting.docsforadobe.dev/property/propertybase/ (selected, read/write; a layer has it too),
//       https://ae-scripting.docsforadobe.dev/item/avitem/ (time: the current time, read/write).
var S4 = { open: false, lt: null, hatch: null, engine0: null, exprs: [], engines: {} };

function s4Guard(fn) {
  return function () {
    if (!S4.open) {
      return { pass: false, detail: 'skipped: fixture not open' };
    }
    return fn();
  };
}

function s4Deselect(comp) {
  for (var i = 1; i <= comp.numLayers; i++) {
    comp.layer(i).selected = false;
  }
}

function s4SelectedNames(comp) {
  var sel = comp.selectedLayers;
  var out = [];
  for (var i = 0; i < sel.length; i++) {
    out.push(sel[i].name);
  }
  return out;
}

// Number of effects per layer name (layer names are unique in the fixture).
function s4EffectCounts(comp) {
  var out = {};
  for (var i = 1; i <= comp.numLayers; i++) {
    var n = 0;
    try {
      n = comp.layer(i).property('ADBE Effect Parade').numProperties;
    } catch (e) {
      n = 0;
    }
    out[comp.layer(i).name] = n;
  }
  return out;
}

// Layer names whose effect count differs between two s4EffectCounts results.
function s4Changed(before, after) {
  var out = [];
  for (var k in after) {
    if (after.hasOwnProperty(k) && after[k] !== before[k]) {
      out.push(k);
    }
  }
  return out;
}

// Earliest first keyframe under a property group: { t, at } or null. A group that refuses to enumerate
// is skipped (as in bkExpressionProps) instead of failing the whole search.
function s4FirstKey(group, label) {
  var best = null;
  var count = 0;
  try {
    count = group.numProperties;
  } catch (e0) {
    count = 0;
  }
  for (var i = 1; i <= count; i++) {
    var p = null;
    try {
      p = group.property(i);
    } catch (e1) {
      p = null;
    }
    if (p === null) {
      continue;
    }
    var here = label + '/' + p.matchName;
    if (p.propertyType === PropertyType.PROPERTY) {
      var n = 0;
      try {
        n = p.numKeys;
      } catch (e) {
        n = 0;
      }
      if (n > 0 && (best === null || p.keyTime(1) < best.t)) {
        best = { t: p.keyTime(1), at: here };
      }
    } else {
      var sub = s4FirstKey(p, here);
      if (sub !== null && (best === null || sub.t < best.t)) {
        best = sub;
      }
    }
  }
  return best;
}

function s4LayerNames(comp) {
  var out = [];
  for (var i = 1; i <= comp.numLayers; i++) {
    out.push(comp.layer(i).name);
  }
  return out;
}

// Layer.applyPreset(File) with script-error dialogs suppressed (bkQuiet); it returns nothing (docs).
function s4Apply(layer, presetPath) {
  bkQuiet(function () {
    layer.applyPreset(new File(presetPath));
  });
}

// Switches the engine, evaluates every expression at several times, then re-sets the same source to force
// a recompile under this engine and reads expressionError again.
function s4Engine(engine) {
  app.project.expressionEngine = engine;
  var bad = [];
  for (var i = 0; i < S4.exprs.length; i++) {
    var e = S4.exprs[i];
    var p = bkResolve(e.comp, e.entry);
    for (var k = 0; k < PARAMS.evalTimes.length; k++) {
      if (PARAMS.evalTimes[k] < e.comp.duration) {
        p.valueAtTime(PARAMS.evalTimes[k], false);
      }
    }
    if (p.expressionError !== '') {
      bad.push(e.name + ' (evaluated): ' + p.expressionError);
    }
    var src = p.expression;
    p.expression = src;
    p.valueAtTime(0, false);
    if (p.expressionError !== '') {
      bad.push(e.name + ' (recompiled): ' + p.expressionError);
    }
  }
  S4.engines[engine] = { count: S4.exprs.length, errors: bad, engineNow: app.project.expressionEngine };
  return { pass: app.project.expressionEngine === engine && S4.exprs.length > 0 && bad.length === 0, detail: S4.engines[engine] };
}

check('fixture opened from disk', function () {
  bkOpenProject(PARAMS.fixtureAep);
  S4.lt = bkComp(PARAMS.comps.lt);
  S4.hatch = bkComp(PARAMS.comps.hatch);
  S4.engine0 = app.project.expressionEngine;
  S4.open = true;
  return { pass: true, detail: bkProjectPath() + ', engine ' + S4.engine0 };
}, true);

if (S4.open) {
  app.beginUndoGroup('BK S4 presets and engines');
}

check('fixture expressions found (expected ' + PARAMS.expectedExpressions + ')', s4Guard(function () {
  var comps = [S4.lt, S4.hatch];
  for (var c = 0; c < comps.length; c++) {
    var list = bkExpressionProps(comps[c]);
    for (var i = 0; i < list.length; i++) {
      S4.exprs.push({ comp: comps[c], entry: list[i], name: comps[c].name + ' ' + list[i].label });
    }
  }
  var names = [];
  for (var j = 0; j < S4.exprs.length; j++) {
    names.push(S4.exprs[j].name);
  }
  return { pass: S4.exprs.length === PARAMS.expectedExpressions, detail: names };
}), true);

check('engine extendscript: every expression without errors', s4Guard(function () {
  return s4Engine('extendscript');
}), true);

check('engine javascript-1.0: every expression without errors', s4Guard(function () {
  return s4Engine('javascript-1.0');
}), true);

check('effect value without .value (bare property arithmetic) in both engines', s4Guard(function () {
  var L = S4.lt.layers.addNull(S4.lt.duration);
  L.name = 'BK_BARE';
  var op = L.property('ADBE Transform Group').property('ADBE Opacity');
  var out = {};
  var ok = true;
  var engines = ['extendscript', 'javascript-1.0'];
  try {
    for (var i = 0; i < engines.length; i++) {
      app.project.expressionEngine = engines[i];
      op.expression = 'var d = thisComp.layer("CTRL").effect("Duration")(1);\n' +
        'd - 1 > 0 ? thisComp.layer("CTRL").effect("QA")(1) * 100 : 0';
      var v = op.valueAtTime(0, false);
      out[engines[i]] = { error: op.expressionError, value: v };
      if (op.expressionError !== '' || Math.abs(v - 100) > 0.001) {
        ok = false;
      }
    }
  } finally {
    L.remove();
    app.project.expressionEngine = 'javascript-1.0';
  }
  return { pass: ok, detail: out };
}), false);

check('applyPreset, TXT_ROLE selected: preset lands on TXT_ROLE only', s4Guard(function () {
  var L = bkLayer(S4.lt, 'TXT_ROLE');
  var before = s4LayerNames(S4.lt);
  var fxBefore = s4EffectCounts(S4.lt);
  S4.lt.openInViewer();
  s4Deselect(S4.lt);
  L.selected = true;
  S4.lt.time = PARAMS.times.selected;
  var selected = s4SelectedNames(S4.lt);
  var timeSet = S4.lt.time;
  s4Apply(L, PARAMS.presets.generic);
  var after = s4LayerNames(S4.lt);
  var changed = s4Changed(fxBefore, s4EffectCounts(S4.lt));
  return { pass: after.length === before.length && changed.length === 1 && changed[0] === 'TXT_ROLE',
    detail: { selected: selected, compTime: timeSet, layersBefore: before.length, layersAfter: after.length,
      effectsChangedOn: changed } };
}), true);

check('applyPreset: first keyframe at comp.time (' + PARAMS.times.selected + ' s)', s4Guard(function () {
  var first = s4FirstKey(bkLayer(S4.lt, 'TXT_ROLE').property('ADBE Effect Parade'), 'TXT_ROLE/effects');
  var half = S4.lt.frameDuration / 2;
  return { pass: first !== null && Math.abs(first.t - PARAMS.times.selected) < half, detail: first };
}), true);

check('text preset on TXT_NAME selected: animator keys start at comp.time (' + PARAMS.times.text + ' s)', s4Guard(function () {
  var L = bkLayer(S4.lt, 'TXT_NAME');
  s4Deselect(S4.lt);
  L.selected = true;
  S4.lt.time = PARAMS.times.text;
  s4Apply(L, PARAMS.presets.text);
  var animators = bkLayer(S4.lt, 'TXT_NAME').property('ADBE Text Properties').property('ADBE Text Animators');
  var first = s4FirstKey(animators, 'TXT_NAME/animators');
  var half = S4.lt.frameDuration / 2;
  return { pass: animators.numProperties > 0 && first !== null && Math.abs(first.t - PARAMS.times.text) < half,
    detail: { animators: animators.numProperties, first: first } };
}), false);

check('applyPreset with nothing selected: a new solid layer appears', s4Guard(function () {
  var ids = [];
  for (var b = 1; b <= S4.lt.numLayers; b++) {
    ids.push(S4.lt.layer(b).id);                      // Layer.id: persistent, AE 22.0+
  }
  s4Deselect(S4.lt);
  S4.lt.time = PARAMS.times.none;
  var selected = s4SelectedNames(S4.lt);
  s4Apply(bkLayer(S4.lt, 'SLOT_PHOTO'), PARAMS.presets.generic);
  var fresh = null;
  for (var i = 1; i <= S4.lt.numLayers; i++) {
    var known = false;
    for (var j = 0; j < ids.length; j++) {
      if (ids[j] === S4.lt.layer(i).id) {
        known = true;
      }
    }
    if (!known) {
      fresh = S4.lt.layer(i);
    }
  }
  var solid = false;
  var first = null;
  if (fresh !== null) {
    solid = fresh.source instanceof FootageItem && fresh.source.mainSource instanceof SolidSource;
    first = s4FirstKey(fresh.property('ADBE Effect Parade'), 'new layer/effects');
  }
  return { pass: S4.lt.numLayers === ids.length + 1 && solid,
    detail: { selectedBefore: selected, layersBefore: ids.length, layersAfter: S4.lt.numLayers,
      newLayer: fresh ? fresh.name : null, solid: solid, firstKey: first } };
}), false);

if (S4.open) {
  app.endUndoGroup();
}

check('engine restored and scratch copy saved', s4Guard(function () {
  app.project.expressionEngine = S4.engine0;
  var r = bkSaveAs(PARAMS.s4Aep);
  return { pass: app.project.expressionEngine === S4.engine0 && r.dirty === false, detail: r };
}), false);

finish({ engineBefore: S4.engine0, engines: S4.engines, presets: PARAMS.presets, times: PARAMS.times });
```

- [ ] **Step 3: Проверить пробу линтером**

Run: `node tools/jsx/lint-jsx.cjs spikes/s4-preset-engines/probe.jsx`
Expected: `OK    spikes/s4-preset-engines/probe.jsx (1 warning(s))`.

- [ ] **Step 4: Создать `spikes/s4-preset-engines/run.mjs`**

```js
#!/usr/bin/env node
// S4: applyPreset with and without a selection, expressions in both engines.   node spikes/s4-preset-engines/run.mjs
// The two presets ship with AE; Node copies them into the ASCII work folder (the probe only sees work paths).
// Override the AE presets folder with BRANDKIT_AE_PRESETS if AE lives elsewhere.
import { copyFileSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runSpike, REPO } from '../../tools/spike/runner.mjs';
import { ensureDir, workPath } from '../../tools/lib/work.mjs';
import { fixturePaths, COMP_LT, COMP_HATCH } from '../fixtures/contract.mjs';

const AE_PRESETS = process.env.BRANDKIT_AE_PRESETS || (process.platform === 'win32'
  ? 'C:/Program Files/Adobe/Adobe After Effects 2026/Support Files/Presets'
  : '/Applications/Adobe After Effects 2026/Presets');
const SOURCES = {
  generic: path.join(AE_PRESETS, 'Transitions - Wipes', 'Linear Wipe.ffx'),
  text: path.join(AE_PRESETS, 'Text', 'Animate In', 'Fade Up Characters.ffx'),
};

const p = fixturePaths();
if (!existsSync(p.fixtureAep)) {
  console.error('no fixture ' + p.fixtureAep + ': run node spikes/fixtures/build-ae-fixture.mjs');
  process.exit(2);
}
const presets = {};
ensureDir(workPath('s4', 'presets'));
for (const [key, src] of Object.entries(SOURCES)) {
  if (!existsSync(src)) {
    console.error('preset not found: ' + src + ' (set BRANDKIT_AE_PRESETS)');
    process.exit(2);
  }
  presets[key] = workPath('s4', 'presets', key === 'generic' ? 'linear_wipe.ffx' : 'fade_up_characters.ffx');
  copyFileSync(src, presets[key]);
}
const s4Aep = workPath('s4', 'CRT_fixture_s4.aep');
if (existsSync(s4Aep)) renameSync(s4Aep, s4Aep.replace(/\.aep$/, '.prev.aep'));

const DATA = 'spikes/results/S4.data.json';
let out;
try {
  out = await runSpike({
    id: 'S4',
    title: 'applyPreset и оба движка выражений',
    host: 'ae',
    files: ['spikes/lib/ae-project.jsx', 'spikes/s4-preset-engines/probe.jsx'],
    params: {
      workDir: p.workDir, fixtureAep: p.fixtureAep, s4Aep,
      comps: { lt: COMP_LT, hatch: COMP_HATCH },
      presets,
      times: { selected: 2, text: 3, none: 4 },
      evalTimes: [0, 0.6, 5, 9.6, 30],
      expectedExpressions: 8,
    },
    timeoutMs: 300000,
    fallback: 'Панель требует выделения перед применением пресета',
    notes: 'Пресеты из поставки AE: Transitions - Wipes/Linear Wipe.ffx (общий), Text/Animate In/Fade Up Characters.ffx '
      + '(текстовый); копии в рабочей папке. Обязательные проверки: пресет на выделенный слой, первый ключ на comp.time, '
      + 'выражения фикстуры в обоих движках. Без выделения, текстовый пресет и арифметика без .value — наблюдения.',
    evidence: [DATA],
  });
} catch (e) {
  console.error('ERROR: ' + e.message);
  console.error('Before any new call: node tools/host-run.mjs --host ae "JSON.stringify({ v: app.version })"');
  process.exit(1);
}
mkdirSync(path.join(REPO, 'spikes/results'), { recursive: true });
writeFileSync(path.join(REPO, DATA), JSON.stringify(out.data, null, 2) + '\n', 'utf8');
for (const c of out.result.checks) {
  console.log((c.pass ? 'ok  ' : (c.required ? 'FAIL' : 'warn')) + ' ' + c.name
    + (c.pass ? '' : '  -> ' + JSON.stringify(c.detail).slice(0, 300)));
}
console.log('S4: ' + out.result.verdict + ' -> ' + out.file);
```

- [ ] **Step 5: Проверить синтаксис раннера**

Run: `node --check spikes/s4-preset-engines/run.mjs`
Expected: пустой вывод, код возврата 0.

- [ ] **Step 6: Подготовить AE (вручную)**

Как в шаге 18 задачи 7.

- [ ] **Step 7: Запустить S4**

Run: `node spikes/s4-preset-engines/run.mjs`
Expected при полном успехе:

```text
ok   fixture opened from disk
ok   fixture expressions found (expected 8)
ok   engine extendscript: every expression without errors
ok   engine javascript-1.0: every expression without errors
ok   effect value without .value (bare property arithmetic) in both engines
ok   applyPreset, TXT_ROLE selected: preset lands on TXT_ROLE only
ok   applyPreset: first keyframe at comp.time (2 s)
ok   text preset on TXT_NAME selected: animator keys start at comp.time (3 s)
ok   applyPreset with nothing selected: a new solid layer appears
ok   engine restored and scratch copy saved
S4: yes -> …\spikes\results\S4.json
```

Как читать итог:
- `FAIL` на движке — в `detail` имя выражения и текст ошибки; выражение в контракте переписать под оба движка.
- `FAIL` на первом ключе — пресет кладёт ключи не от `comp.time`: панель должна считать сдвиг сама (записать в контракт адаптера `applyPreset`).
- `warn` без выделения — пресет повёл себя не так, как в документации: панель требует выделения (запасной путь S4).
- `warn` на `.value` — в контракт §4.2 правило «значение контрола только через `.value`».

- [ ] **Step 8: Сверить таймлайн и записать наблюдения (вручную)**

В AE открыт `CRT_fixture_s4.aep`, композиция `CRT_LowerThird_v1`. Проверить: у `TXT_ROLE` эффект Linear Wipe с ключами от 0:00:02:00; у `TXT_NAME` аниматор с ключами от 0:00:03:00; сверху новый solid с Linear Wipe от 0:00:04:00.

```bash
node tools/spike/manual.mjs --id S4 --check "timeline: preset keys start at 2 s, 3 s and 4 s" --pass true --detail "<что видно>" --optional
node tools/spike/manual.mjs --id S4 --check "no dialogs during the run" --pass true --detail "-" --optional
```

- [ ] **Step 9: Обновить отчёт**

Run: `npm run spike:report`
Expected: `written …\spikes\RESULTS.md`, в таблице строка S4.

- [ ] **Step 10: Commit**

```bash
git add spikes/s4-preset-engines/probe.jsx spikes/s4-preset-engines/run.mjs spikes/results/S4.json spikes/results/S4.data.json spikes/RESULTS.md
git commit -m "feat(spikes): S4 applyPreset and both expression engines" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: S10 — AME с брендовым .epr и шаблон Output Module

**Files:**
- Create: `spikes/s10-ame/lib.mjs`, `spikes/s10-ame/probe.jsx`, `spikes/s10-ame/run.mjs`
- Test: `tests/spikes/s10-lib.test.mjs`
- Create (итог прогона): `spikes/results/S10.json`, `spikes/results/S10.data.json`
- Modify: `spikes/RESULTS.md`

Что проверяем (§3.1, S10; §8.1):
- **(a) Шаблон Output Module скриптом.** По документации формат модуля вывода «не задаётся, только читается»; на форуме Adobe это подтверждают («Property is read-only»). Проба сначала пробует `setSettings({ Format: 'QuickTime' })` и записывает ответ; при отказе берёт встроенный шаблон QuickTime с альфой (ищет «alpha» или «альф» в имени и проверяет Format и Channels). Затем `Channels = RGB + Alpha` через `setSettings`; кодек — только если в STRING_SETTABLE есть ключ с «codec». Дальше `saveAsTemplate("CRBK_ProRes4444_Alpha")` и `app.preferences.saveToDisk()` (без него aerender шаблон не видит, ae-quirks #184). Шаблон с тем же именем проба не перезаписывает. Контроль — рендер 10 кадров с новым шаблоном; Node ждёт, пока файл перестанет расти, и проверяет ffprobe: ProRes 4444 с альфой. Очередь рендера очищается, фикстура закрывается без сохранения. Полная выгрузка `getSettings` (STRING_SETTABLE и STRING) — в `S10.data.json`.
- **(b) Очередь AME через BridgeTalk.** Node копирует `FullHD.epr` из пакета (пакет только читается; путь к нему даёт `sourceRoot()` плана 2, переменная `BRANDKIT_SOURCE`). Проба берёт спецификатор `BridgeTalk.getSpecifier('ame')`, проверяет `isRunning`, при необходимости запускает AME. Затем одно сообщение с таймаутом 60 с: `addCompToBatch(проект, epr, папка)` — первая композиция проекта; `getDLItemsAtRoot` и `addDLToBatch(…, GUID)` — выбранная композиция по `dynamicLinkGUID`; `runBatch()` и `getBatchEncoderStatus()`. Каждый вызов в сценарии AME обёрнут отдельно: ошибка одного приходит в ответе как `ключ=ERR …`, остальные выполняются. Ответ AME (`onResult`/`onError`/таймаут) записывается. Node ждёт новые `.mp4` до 10 минут и сверяет их ffprobe с `FullHD.epr` (H.264, 1920×1080, 25 fps). Какую композицию AME считает первой, видно по длительности выхода: 10 с — нижняя треть, 60 с — штриховка.
- **Итог.** Обязательные проверки — только части (b): они решают «да/нет» для очереди AME. Проверки (a) необязательные: при отказе итог `partial`, и шаблон `.aom` загружается вручную по инструкции (§8.1).
- Повтор одной части: `--only om` или `--only ame`; проверки другой части сохраняются. Повторный `--persist` заменяет свою проверку, а не добавляет вторую.

- [ ] **Step 1: Написать падающий тест `tests/spikes/s10-lib.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeResult, writeResult } from '../../tools/spike/result.mjs';
import {
  parseAmeReply, normGuid, guidListed, matchesEpr, isProRes4444Alpha, compByDuration, mergeChecks, recordPersist,
} from '../../spikes/s10-ame/lib.mjs';

describe('s10 lib', () => {
  it('parses the reply that the AME script returns', () => {
    expect(parseAmeReply('build=26.5.2|addComp=true|guids={A};{B}|addDL=ok|run=true')).toEqual({
      build: '26.5.2', addComp: 'true', guids: '{A};{B}', addDL: 'ok', run: 'true',
    });
    expect(parseAmeReply(null)).toEqual({});
    expect(parseAmeReply('frontend=null')).toEqual({ frontend: 'null' });
  });

  it('compares GUIDs without braces and case', () => {
    expect(normGuid('{AB-12}')).toBe('ab-12');
    expect(guidListed('AB-12', '{ef-01};{ab-12}')).toBe(true);
    expect(guidListed('AB-13', '{ef-01};{ab-12}')).toBe(false);
    expect(guidListed('', '{ef-01}')).toBe(false);
  });

  it('recognises an H.264 1080p25 render as FullHD.epr output', () => {
    expect(matchesEpr({ video: { codec: 'h264', width: 1920, height: 1080, fps: 25 } })).toBe(true);
    expect(matchesEpr({ video: { codec: 'h264', width: 1920, height: 1080, fps: 24 } })).toBe(false);
    expect(matchesEpr({ video: null })).toBe(false);
  });

  it('recognises ProRes 4444 with alpha', () => {
    expect(isProRes4444Alpha({ video: { codec: 'prores', profile: '4444', pixFmt: 'yuva444p12le' } })).toBe(true);
    expect(isProRes4444Alpha({ video: { codec: 'prores', profile: '4444', pixFmt: 'yuv444p12le' } })).toBe(false);
  });

  it('tells the fixture comps apart by duration', () => {
    expect(compByDuration(10.0)).toBe('CRT_LowerThird_v1');
    expect(compByDuration(60.04)).toBe('CRT_Hatch_v1');
    expect(compByDuration(5)).toBe(null);
    expect(compByDuration(undefined)).toBe(null);
  });

  it('keeps the checks of the part that was not re-run', () => {
    const prev = [{ name: 'om: a', pass: true }, { name: 'ame: b', pass: false }];
    const fresh = [{ name: 'ame: b', pass: true }];
    expect(mergeChecks(prev, fresh, 'ame:')).toEqual([{ name: 'om: a', pass: true }, { name: 'ame: b', pass: true }]);
  });

  it('records the --persist check once, however often it is re-run', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-s10-'));
    writeResult(makeResult({ id: 'S10', title: 'AME', host: 'ae', checks: [{ name: 'ame: b', pass: true }] }), dir);
    const persist = { name: 'om: template T still listed after an AE restart', pass: false, detail: '0 templates' };
    recordPersist(persist, dir);
    const r = recordPersist({ ...persist, pass: true, detail: '14 templates' }, dir);
    expect(r.checks.map((c) => c.name)).toEqual(['ame: b', persist.name]);
    expect(r.checks[1]).toMatchObject({ pass: true, required: false, manual: true, detail: '14 templates' });
    expect(r.verdict).toBe('yes');
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run tests/spikes/s10-lib.test.mjs`
Expected: FAIL — модуль `spikes/s10-ame/lib.mjs` не найден.

- [ ] **Step 3: Создать `spikes/s10-ame/lib.mjs`**

```js
// Helpers for spikes/s10-ame/run.mjs (unit-tested in tests/spikes/s10-lib.test.mjs). All are pure except
// recordPersist, which updates spikes/results/S10.json.
import { appendManualCheck } from '../../tools/spike/result.mjs';
import { COMP_LT, COMP_HATCH, fixtureParams } from '../fixtures/contract.mjs';

// "build=26.5.2|addComp=true|guids=a;b|addDL=ok|run=true" -> { build: '26.5.2', addComp: 'true', ... }
export function parseAmeReply(reply) {
  const out = {};
  if (typeof reply !== 'string' || !reply) return out;
  for (const part of reply.split('|')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
  }
  return out;
}

export function normGuid(g) {
  return String(g || '').toLowerCase().replace(/[{}\s]/g, '');
}

// Is the AE comp GUID among the ';'-separated GUIDs that AME's getDLItemsAtRoot returned?
export function guidListed(guid, list) {
  const want = normGuid(guid);
  if (!want) return false;
  return String(list || '').split(';').some((g) => normGuid(g) === want);
}

// FullHD.epr: H.264, 1920x1080, 25 fps (docs/research/2026-10-02/audit_reuse_ame.json).
export function matchesEpr(summary, { codec = 'h264', width = 1920, height = 1080, fps = 25 } = {}) {
  const v = summary && summary.video;
  return Boolean(v && v.codec === codec && v.width === width && v.height === height && Math.abs(v.fps - fps) < 0.01);
}

export function isProRes4444Alpha(summary) {
  const v = summary && summary.video;
  return Boolean(v && v.codec === 'prores' && /4444/.test(String(v.profile)) && /^yuva/.test(String(v.pixFmt)));
}

// Which fixture comp a render is, by duration (contract: the lower third is 10 s, the hatch 60 s).
export function compByDuration(seconds) {
  if (typeof seconds !== 'number') return null;
  const { ltDuration, hatchDuration } = fixtureParams();
  if (Math.abs(seconds - ltDuration) < 0.2) return COMP_LT;
  if (Math.abs(seconds - hatchDuration) < 0.2) return COMP_HATCH;
  return null;
}

// Re-running one part (--only om|ame) keeps the other part's checks from the previous S10.json.
export function mergeChecks(previous, fresh, rerunPrefix) {
  return (previous || []).filter((c) => !c.name.startsWith(rerunPrefix)).concat(fresh);
}

// --persist: the restart check goes into S10.json as an optional manual check. appendManualCheck replaces
// a manual check with the same name, so a re-run of --persist keeps one entry. dir: tests only.
export function recordPersist(check, dir) {
  return appendManualCheck('S10', { name: check.name, pass: check.pass, detail: check.detail, required: false }, dir);
}
```

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/spikes/s10-lib.test.mjs`
Expected: `7 passed`.

- [ ] **Step 5: Создать `spikes/s10-ame/probe.jsx`**

Пути в сценарии для AME — родные (`fsName`, с обратными слэшами) и экранируются функцией `s10Q` через `JSON.stringify`; сценарий проверен в `node:vm` на заглушке AME: пути доходят целыми, GUID выбирается в записи AME, сбой одного вызова не останавливает остальные. Кавычек внутри литералов регулярных выражений в JSX нет: линтер принимает такую кавычку за начало строки и перестаёт проверять код после неё.

```js
// S10: Output Module template by script, and the AME queue with a brand .epr through BridgeTalk (spec 3.1).
// Composed after check.jsx and ae-project.jsx. ES3. PARAMS.action picks one step per host call:
//   om          (a) queue the comp, dump settings, QuickTime + RGB + Alpha, saveAsTemplate, 10-frame test render
//   ame-status  (b) is Media Encoder known to BridgeTalk and running (launch it on request)
//   ame-queue   (b) send addCompToBatch + addDLToBatch + runBatch to AME, wait for the reply
//   om-persist  after an AE restart: is the template still in OutputModule.templates
// Docs: https://ae-scripting.docsforadobe.dev/renderqueue/outputmodule/ (getSettings/setSettings 13.0; Format
//       is readable but not settable; saveAsTemplate, templates; setSettings invalidates the object)
//       https://ae-scripting.docsforadobe.dev/other/preferences/ (saveToDisk)
//       https://ame-scripting.docsforadobe.dev/reference/index.html (FrontendScriptObject.addCompToBatch,
//       addDLToBatch, getDLItemsAtRoot; EncoderHostScriptObject.runBatch)
//       https://extendscript.docsforadobe.dev/interapplication-communication/bridgetalk-message-object/
//       (send(timeoutInSecs): synchronous when a timeout is given; onResult, onError, onTimeout)
var S10 = { opened: false, ready: false, rq: null, rq0: 0, base: null, path: 'none', survey: [], formatTry: null,
  channels: null, codecKeys: [], codecTry: [], saved: null, settableKeys: [], dumpSettable: null, dumpAll: null };
var A = { spec: null, running: null, launched: null, status: null, reply: null, error: null, timedOut: false,
  sent: null, waitMs: null, guidLt: null, guidHatch: null, targets: null, body: null };
var S10_OUT = { action: PARAMS.action };

function s10Guard(fn) {
  return function () {
    if (!S10.ready) {
      return { pass: false, detail: 'skipped: render queue item not ready' };
    }
    return fn();
  };
}

// Re-fetch every time: the docs warn that setSettings invalidates the OutputModule object.
function s10Om() {
  return S10.rq.outputModule(1);
}

function s10Settings() {
  return s10Om().getSettings(GetSettingsFormat.STRING);
}

function s10Alpha(text) {
  return new RegExp(PARAMS.alphaPattern, 'i').test(String(text));
}

function s10Qt(s) {
  return /QuickTime/i.test(String(s.Format));
}

function s10HasTemplate(name) {
  var list = s10Om().templates;
  for (var i = 0; i < list.length; i++) {
    if (list[i] === name) {
      return true;
    }
  }
  return false;
}

function s10Keys(obj) {
  var keys = [];
  if (obj) {
    for (var k in obj) {
      if (obj.hasOwnProperty(k)) {
        keys.push(k);
      }
    }
  }
  return keys;
}

// Settings change that may throw ("Property is read-only"): returns '' or the error text.
function s10Try(settings) {
  var err = '';
  app.beginSuppressDialogs();
  try {
    s10Om().setSettings(settings);
  } catch (e) {
    err = String(e);
  } finally {
    app.endSuppressDialogs(false);
  }
  return err;
}

// A JS string literal for the script that AME evaluates (backslashes and quotes escaped by JSON; the
// prelude polyfills JSON where the engine has none). No quote characters inside regex literals here:
// the ES3 lint reads them as the start of a string.
function s10Q(s) {
  return JSON.stringify(String(s));
}

// The script AME runs (ES3 as well): two jobs with the brand preset, runBatch, then the batch status.
// Each call is wrapped, so one failure is reported as "key=ERR ..." and the later calls still run.
// Returns "key=value|..." to onResult.
// The body runs in Media Encoder and writes its reply to replyFile. AE must not wait for it: AME reads
// the comps through Dynamic Link, which the running AE serves, so a waiting AE deadlocks both
// (seen live on AE 26.5 / AME 26.5.2, 2026-10-02). Node waits for replyFile instead.
function s10AmeBody(project, epr, outComp, outDl, guid, format, replyFile) {
  var want = String(guid).toLowerCase().replace(/[{}]/g, '');
  return [
    '(function () {',
    '  var out = [];',
    '  var fe = null;',
    '  var host = null;',
    '  var pick = ' + s10Q(guid) + ';',
    '  function step(key, fn) {',
    '    try { out.push(key + "=" + fn()); } catch (e) { out.push(key + "=ERR " + String(e).replace(/[|=]/g, " ")); }',
    '  }',
    '  step("build", function () { return app.buildNumber; });',
    '  step("frontend", function () { fe = app.getFrontend(); return fe ? "ok" : "null"; });',
    '  step("addComp", function () {',
    '    return fe.addCompToBatch(' + s10Q(project) + ', ' + s10Q(epr) + ', ' + s10Q(outComp) + ');',
    '  });',
    '  step("guids", function () {',
    '    var g = fe.getDLItemsAtRoot(' + s10Q(project) + ');',
    '    for (var i = 0; g && i < g.length; i++) {',
    '      if (String(g[i]).toLowerCase().replace(/[{}]/g, "") === ' + s10Q(want) + ') { pick = String(g[i]); }',
    '    }',
    '    return g ? g.join(";") : "null";',
    '  });',
    '  step("addDL", function () {',
    '    return fe.addDLToBatch(' + s10Q(project) + ', ' + s10Q(format) + ', ' + s10Q(epr) + ', pick, ' + s10Q(outDl) + ') ? "ok" : "null";',
    '  });',
    '  step("run", function () { host = app.getEncoderHost(); return host.runBatch(); });',
    '  step("status", function () { return host.getBatchEncoderStatus(); });',
    '  var f = new File(' + s10Q(replyFile) + ');',
    '  f.encoding = "UTF-8";',
    '  if (f.open("w")) { f.write(out.join("|")); f.close(); }',
    '  return out.join("|");',
    '})();'
  ].join('\n');
}

if (PARAMS.action === 'om') {
  check('om: fixture opened', function () {
    bkOpenProject(PARAMS.fixtureAep);
    S10.opened = true;
    return { pass: true, detail: bkProjectPath() };
  }, false);

  if (S10.opened) {
    app.beginUndoGroup('BK S10 output module');
  }

  check('om: comp queued in the render queue', function () {
    if (!S10.opened) {
      return { pass: false, detail: 'skipped: fixture not open' };
    }
    S10.rq0 = app.project.renderQueue.numItems;
    S10.rq = app.project.renderQueue.items.add(bkComp(PARAMS.comp));
    S10.ready = true;
    return { pass: true, detail: { queuedBefore: S10.rq0, templates: s10Om().templates.length } };
  }, false);

  check('om: settable settings dumped (STRING_SETTABLE)', s10Guard(function () {
    S10.dumpSettable = s10Om().getSettings(GetSettingsFormat.STRING_SETTABLE);
    S10.dumpAll = s10Settings();
    S10.settableKeys = s10Keys(S10.dumpSettable);
    return { pass: S10.settableKeys.length > 0, detail: S10.settableKeys };
  }), false);

  check('om: QuickTime base (Format by setSettings, else a built-in alpha template)', s10Guard(function () {
    var err = s10Try({ 'Format': 'QuickTime' });
    var now = s10Settings();
    S10.formatTry = { error: err, format: String(now.Format) };
    if (err === '' && s10Qt(now)) {
      S10.path = 'setSettings';
      return { pass: true, detail: S10.formatTry };
    }
    var list = s10Om().templates;
    for (var i = 0; i < list.length; i++) {
      if (s10Alpha(list[i]) && list[i] !== PARAMS.template) {     // our own template from a past run is not a base
        s10Om().applyTemplate(list[i]);
        var s = s10Settings();
        S10.survey.push({ name: list[i], format: String(s.Format), channels: String(s.Channels) });
        if (S10.base === null && s10Qt(s) && s10Alpha(s.Channels)) {
          S10.base = list[i];
        }
      }
    }
    if (S10.base !== null) {
      s10Om().applyTemplate(S10.base);
      S10.path = 'template:' + S10.base;
    }
    return { pass: S10.base !== null, detail: { formatTry: S10.formatTry, survey: S10.survey, base: S10.base } };
  }), false);

  check('om: Channels = RGB + Alpha via setSettings', s10Guard(function () {
    var err = s10Try({ 'Channels': 'RGB + Alpha' });
    var s = s10Settings();
    S10.channels = { error: err, channels: String(s.Channels), format: String(s.Format) };
    var keys = s10Keys(S10.dumpSettable);
    for (var i = 0; i < keys.length; i++) {
      if (/codec/i.test(keys[i])) {
        var o = {};
        o[keys[i]] = PARAMS.codec;
        var e2 = s10Try(o);
        S10.codecKeys.push(keys[i]);
        S10.codecTry.push({ key: keys[i], error: e2, now: String(s10Settings()[keys[i]]) });
      }
    }
    return { pass: err === '' && s10Qt(s) && s10Alpha(s.Channels),
      detail: { channels: S10.channels, codecKeys: S10.codecKeys, codecTry: S10.codecTry } };
  }), false);

  check('om: template ' + PARAMS.template + ' saved and listed', s10Guard(function () {
    if (s10HasTemplate(PARAMS.template)) {
      S10.saved = 'already existed, not overwritten';
    } else {
      s10Om().saveAsTemplate(PARAMS.template);
      S10.saved = 'saved now';
    }
    var prefs = 'saved to disk';
    try {
      app.preferences.saveToDisk();       // without it aerender does not see the template (ae-quirks #184)
    } catch (e) {
      prefs = 'saveToDisk failed: ' + String(e);
    }
    return { pass: s10HasTemplate(PARAMS.template), detail: { saved: S10.saved, prefs: prefs, path: S10.path } };
  }), false);

  check('om: template applies QuickTime + RGB + Alpha', s10Guard(function () {
    s10Om().applyTemplate(PARAMS.template);
    var s = s10Settings();
    return { pass: s10Qt(s) && s10Alpha(s.Channels),
      detail: { format: String(s.Format), channels: String(s.Channels), depth: String(s.Depth), color: String(s.Color) } };
  }), false);

  if (S10.opened) {
    app.endUndoGroup();
  }

  check('om: 10-frame test render with the template finished', s10Guard(function () {
    s10Om().file = new File(PARAMS.omTestMov);
    S10.rq.timeSpanStart = 0;
    S10.rq.timeSpanDuration = PARAMS.testFrames * S10.rq.comp.frameDuration;
    bkQuiet(function () {
      app.project.renderQueue.render();   // blocks until done; 10 frames of a simple comp (ae-quirks #33)
    });
    var f = new File(PARAMS.omTestMov);
    return { pass: S10.rq.status === RQItemStatus.DONE && f.exists,
      detail: { status: String(S10.rq.status), file: String(s10Om().file.fsName), exists: f.exists } };
  }), false);

  check('om: render queue cleaned, fixture closed without saving', s10Guard(function () {
    S10.rq.remove();
    var left = app.project.renderQueue.numItems;
    app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
    return { pass: left === S10.rq0, detail: left + ' item(s) left' };
  }), false);

  S10_OUT.om = { path: S10.path, base: S10.base, survey: S10.survey, formatTry: S10.formatTry, channels: S10.channels,
    codecKeys: S10.codecKeys, codecTry: S10.codecTry, saved: S10.saved, settableKeys: S10.settableKeys,
    settable: S10.dumpSettable, all: S10.dumpAll };
}

if (PARAMS.action === 'ame-status') {
  check('ame: BridgeTalk knows Media Encoder', function () {
    A.spec = BridgeTalk.getSpecifier(PARAMS.ameName);
    try {
      A.targets = BridgeTalk.getTargets().join(', ');
    } catch (e) {
      A.targets = 'getTargets failed: ' + String(e);
    }
    return { pass: A.spec !== null && A.spec !== undefined && String(A.spec) !== '',
      detail: { spec: String(A.spec), targets: A.targets } };
  }, true);

  check('ame: Media Encoder running (launched on request)', function () {
    if (!A.spec) {
      return { pass: false, detail: 'no specifier' };
    }
    A.running = BridgeTalk.isRunning(A.spec);
    if (!A.running && PARAMS.launch) {
      A.launched = BridgeTalk.launch(A.spec, 'background');
    }
    A.status = BridgeTalk.getStatus(A.spec);
    return { pass: A.running === true, detail: { running: A.running, launched: A.launched, status: String(A.status) } };
  }, false);

  S10_OUT.spec = String(A.spec);
  S10_OUT.running = A.running;
  S10_OUT.status = String(A.status);
}

if (PARAMS.action === 'ame-queue') {
  check('ame: dynamicLinkGUID of both comps', function () {
    bkOpenProject(PARAMS.fixtureAep);
    A.guidLt = String(bkComp(PARAMS.comps.lt).dynamicLinkGUID);
    A.guidHatch = String(bkComp(PARAMS.comps.hatch).dynamicLinkGUID);
    return { pass: A.guidLt !== '' && A.guidHatch !== '', detail: { lt: A.guidLt, hatch: A.guidHatch } };
  }, false);

  // Fire and forget: AE returns at once and stays free to serve Dynamic Link to Media Encoder.
  // The reply comes back as PARAMS.replyFile, which Node waits for.
  check('ame: job sent to Media Encoder (AE does not wait)', function () {
    A.spec = BridgeTalk.getSpecifier(PARAMS.ameName);
    var bt = new BridgeTalk();
    bt.target = A.spec;
    bt.body = s10AmeBody(new File(PARAMS.fixtureAep).fsName, new File(PARAMS.epr).fsName,
      new Folder(PARAMS.outComp).fsName, new Folder(PARAMS.outDl).fsName, A.guidLt || '', PARAMS.format,
      PARAMS.replyFile);
    A.body = bt.body;
    A.sent = bt.send();
    return { pass: A.sent === true, detail: { sent: A.sent, spec: String(A.spec) } };
  }, false);

  S10_OUT.spec = String(A.spec);
  S10_OUT.guidLt = A.guidLt;
  S10_OUT.guidHatch = A.guidHatch;
  S10_OUT.sent = A.sent;
  S10_OUT.reply = A.reply;
  S10_OUT.error = A.error;
  S10_OUT.timedOut = A.timedOut;
  S10_OUT.waitMs = A.waitMs;
  S10_OUT.body = A.body;
}

if (PARAMS.action === 'om-persist') {
  check('om: template ' + PARAMS.template + ' still listed after an AE restart', function () {
    bkOpenProject(PARAMS.fixtureAep);
    var list = [];
    app.beginUndoGroup('BK S10 persist check');
    try {
      var rq = app.project.renderQueue.items.add(bkComp(PARAMS.comp));
      list = rq.outputModule(1).templates;
      rq.remove();
    } finally {
      app.endUndoGroup();
    }
    var found = false;
    for (var i = 0; i < list.length; i++) {
      if (list[i] === PARAMS.template) {
        found = true;
      }
    }
    app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
    return { pass: found, detail: list.length + ' templates' };
  }, false);
}

finish(S10_OUT);
```

- [ ] **Step 6: Проверить пробу линтером**

Run: `node tools/jsx/lint-jsx.cjs spikes/s10-ame/probe.jsx`
Expected: `OK    spikes/s10-ame/probe.jsx (1 warning(s))`.

- [ ] **Step 7: Создать `spikes/s10-ame/run.mjs`**

```js
#!/usr/bin/env node
// S10: (a) an Output Module template made by script; (b) the AME queue with the brand FullHD.epr via BridgeTalk.
//   node spikes/s10-ame/run.mjs              both parts
//   node spikes/s10-ame/run.mjs --only om    re-run one part; the other part's checks stay in S10.json
//   node spikes/s10-ame/run.mjs --only ame
//   node spikes/s10-ame/run.mjs --persist    after an AE restart: is the template still listed
// Preconditions for (b): Media Encoder 2026 installed, its queue empty (runBatch encodes everything queued).
// FullHD.epr comes from the source package: sourceRoot() of tools/packs/paths.mjs, BRANDKIT_SOURCE overrides it.
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { run } from '../../tools/host-run.mjs';
import { composeProbe, REPO } from '../../tools/spike/runner.mjs';
import { makeResult, writeResult, readResults } from '../../tools/spike/result.mjs';
import { sleep, findNewFiles, waitStableFile } from '../../tools/spike/wait-file.mjs';
import { ensureDir, workPath } from '../../tools/lib/work.mjs';
import { hasBinary, probeMedia } from '../../tools/lib/media-probe.mjs';
import { sourceRoot } from '../../tools/packs/paths.mjs';
import { fixturePaths, COMP_LT, COMP_HATCH } from '../fixtures/contract.mjs';
import {
  parseAmeReply, guidListed, matchesEpr, isProRes4444Alpha, compByDuration, mergeChecks, recordPersist,
} from './lib.mjs';

const SRC_EPR = path.posix.join(sourceRoot(), '7_Пресеты_Media_Encoder', 'FullHD.epr');
const DATA = 'spikes/results/S10.data.json';
const FILES = ['spikes/lib/ae-project.jsx', 'spikes/s10-ame/probe.jsx'];

const argv = process.argv.slice(2);
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
if (only !== null && only !== 'om' && only !== 'ame') {
  console.error('usage: node spikes/s10-ame/run.mjs [--only om|ame] [--persist]');
  process.exit(2);
}
const p = fixturePaths();
const base = {
  workDir: p.workDir, fixtureAep: p.fixtureAep, comp: COMP_LT, comps: { lt: COMP_LT, hatch: COMP_HATCH },
  template: 'CRBK_ProRes4444_Alpha', alphaPattern: 'alpha|альф', codec: 'Apple ProRes 4444',
  omTestMov: workPath('s10', 'om_test.mov'), testFrames: 10,
  ameName: 'ame', epr: workPath('ame', 'FullHD.epr'), outComp: workPath('ame', 'out_comp'),
  outDl: workPath('ame', 'out_dl'), replyFile: workPath('ame', 'reply.txt'), format: 'H.264', sendTimeoutSec: 60,
};

async function host(action, extra, timeoutMs) {
  const r = await run('ae', composeProbe(FILES, { ...base, ...extra, action }), { timeoutMs });
  if (!r || !Array.isArray(r.checks)) {
    throw new Error('S10 ' + action + ': the probe must return finish({...}); got ' + JSON.stringify(r).slice(0, 300));
  }
  return r;
}

async function partOm(evidence, checks) {
  ensureDir(workPath('s10'));
  rmSync(base.omTestMov, { force: true });                       // our own test render from a previous run
  const r = await host('om', {}, 300000);
  checks.push(...r.checks);
  evidence.om = r.data.om;
  let render = null;
  const w = await waitStableFile(base.omTestMov, { stableMs: 2000, timeoutMs: 30000 });
  if (w.ok && hasBinary('ffprobe')) render = probeMedia(base.omTestMov);
  evidence.omRender = render;
  checks.push({ name: 'om: test render is ProRes 4444 with alpha (ffprobe)', pass: isProRes4444Alpha(render),
    required: false, detail: render || 'no ' + base.omTestMov });
  return r.data.hostVersion;
}

async function partAme(evidence, checks) {
  if (!existsSync(SRC_EPR)) throw new Error('brand preset not found: ' + SRC_EPR + ' (set BRANDKIT_SOURCE to the package folder)');
  ensureDir(workPath('ame'));
  copyFileSync(SRC_EPR, base.epr);                               // Node copies binaries; the package stays read-only
  for (const d of [base.outComp, base.outDl]) {
    rmSync(d, { recursive: true, force: true });                 // our own outputs from a previous run
    ensureDir(d);
  }

  // 1) Media Encoder known and running: launch once, then a cheap status read every 5 s, at most 180 s.
  let st = await host('ame-status', { launch: true }, 60000);
  const wasRunning = st.data.running === true;
  const t0 = Date.now();
  while (!(st.data.running === true && /IDLE|PUMPING|UNDEFINED/.test(st.data.status)) && Date.now() - t0 < 180000) {
    if (st.data.status === 'BUSY') console.log('Media Encoder is BUSY: close any dialog in AME');
    await sleep(5000);
    st = await host('ame-status', { launch: false }, 60000);
  }
  if (!wasRunning && st.data.running === true) await sleep(10000); // let a fresh AME finish starting up
  checks.push(...st.checks);
  const ready = st.data.running === true && /IDLE|PUMPING|UNDEFINED/.test(st.data.status);
  checks.push({ name: 'ame: Media Encoder running and idle', pass: ready, required: true, detail: st.data });
  evidence.ameStatus = st.data;
  if (!ready) return st.data.hostVersion;

  // 2) Two jobs and runBatch, sent through BridgeTalk without waiting in AE (a waiting AE cannot serve
  //    Dynamic Link to Media Encoder, and both hang). Media Encoder writes its reply to base.replyFile.
  const since = Date.now() - 2000;
  rmSync(base.replyFile, { force: true });
  const q = await host('ame-queue', {}, 120000);
  checks.push(...q.checks);
  const got = await waitStableFile(base.replyFile, { stableMs: 1000, timeoutMs: base.sendTimeoutSec * 5 * 1000 });
  const replyText = got.ok ? readFileSync(base.replyFile, 'utf8') : null;
  checks.push({ name: 'ame: reply file from Media Encoder', pass: replyText !== null, required: false,
    detail: { file: base.replyFile, wait: got, reply: replyText } });
  const reply = parseAmeReply(replyText);
  evidence.ameQueue = { ...q.data, reply: replyText, parsed: reply };

  // 3) Outputs: AME encodes the jobs one after another. outputPath may be taken as a folder or a file
  //    name, so look for new .mp4 anywhere under <work>/ame and sort them by path.
  const ameDir = workPath('ame');
  const expectDl = reply.addDL === 'ok';
  const deadline = Date.now() + 600000;
  let files = [];
  while (Date.now() < deadline) {
    files = findNewFiles(ameDir, { exts: ['.mp4'], sinceMs: since });
    const hasComp = files.some((f) => f.includes('/out_comp'));
    const hasDl = files.some((f) => f.includes('/out_dl'));
    if (hasComp && (hasDl || !expectDl)) break;
    await sleep(2000);
  }
  const outputs = [];
  for (const f of files) {
    const w = await waitStableFile(f, { stableMs: 5000, timeoutMs: Math.max(15000, deadline - Date.now()), sinceMs: since });
    let probe = null;
    if (w.ok && hasBinary('ffprobe')) {
      try {
        probe = probeMedia(f);
      } catch (e) {
        probe = { error: e.message };
      }
    }
    let job = 'unknown';
    if (f.includes('/out_comp')) job = 'comp';
    if (f.includes('/out_dl')) job = 'dl';
    outputs.push({ file: f, job, wait: w, probe, comp: compByDuration(probe && probe.duration) });
  }
  evidence.ameOutputs = outputs;
  const compOut = outputs.find((o) => o.job === 'comp');
  const dlOut = outputs.find((o) => o.job === 'dl');
  checks.push({ name: 'ame: addCompToBatch accepted the job', pass: reply.addComp === 'true' || Boolean(compOut),
    required: true, detail: { addComp: reply.addComp || null, output: compOut ? compOut.file : null } });
  checks.push({ name: 'ame: addCompToBatch output written and stable', pass: Boolean(compOut && compOut.wait.ok),
    required: true, detail: compOut || 'no new .mp4 under ' + ameDir });
  checks.push({ name: 'ame: output matches FullHD.epr (H.264 1920x1080 25 fps)',
    pass: Boolean(compOut && matchesEpr(compOut.probe)), required: true, detail: compOut ? compOut.probe : null });
  checks.push({ name: 'ame: comp GUID listed by getDLItemsAtRoot', pass: guidListed(q.data.guidLt, reply.guids),
    required: false, detail: { guidLt: q.data.guidLt, guids: reply.guids || null } });
  checks.push({ name: 'ame: addDLToBatch renders the chosen comp (' + COMP_LT + ', 10 s)',
    pass: Boolean(dlOut && dlOut.wait.ok && dlOut.comp === COMP_LT), required: false,
    detail: dlOut || { addDL: reply.addDL || null } });
  return q.data.hostVersion;
}

if (argv.includes('--persist')) {
  try {
    const r = await host('om-persist', {}, 120000);
    const c = r.checks[0];
    const res = recordPersist(c);                                // replaces the entry of an earlier --persist
    console.log((c.pass ? 'ok   ' : 'warn ') + c.name + ' -> S10: ' + res.verdict);
  } catch (e) {
    console.error('ERROR: ' + e.message);
    process.exit(1);
  }
  process.exit(0);
}

const previous = readResults().find((r) => r.id === 'S10') || null;
let evidence = {};
try {
  evidence = JSON.parse(readFileSync(path.join(REPO, DATA), 'utf8'));
} catch {
  evidence = {};
}
const checks = [];
let hostVersion = previous ? previous.hostVersion : null;
let part = 'om';
try {
  if (!only || only === 'om') {
    part = 'om';
    hostVersion = (await partOm(evidence, checks)) || hostVersion;
  }
  if (!only || only === 'ame') {
    part = 'ame';
    hostVersion = (await partAme(evidence, checks)) || hostVersion;
  }
} catch (e) {
  console.error('ERROR: ' + e.message);
  console.error('Before any new call: node tools/host-run.mjs --host ae "JSON.stringify({ v: app.version })"');
  checks.push({ name: part + ': run completed', pass: false, required: part === 'ame', detail: e.message });
}

const all = only ? mergeChecks(previous ? previous.checks : [], checks, only + ':') : checks;
const compOut = (evidence.ameOutputs || []).find((o) => o.job === 'comp');
const notes = [
  'OM: путь ' + ((evidence.om && evidence.om.path) || 'n/a') + '; Format через setSettings: '
    + JSON.stringify((evidence.om && evidence.om.formatTry) || null),
  'AME: addCompToBatch взял композицию ' + ((compOut && compOut.comp) || '(не опознана)') + ' — её AME считает первой в проекте',
  'ответ BridgeTalk: ' + ((evidence.ameQueue && evidence.ameQueue.reply) || 'нет'),
].join('; ');
mkdirSync(path.join(REPO, 'spikes/results'), { recursive: true });
writeFileSync(path.join(REPO, DATA), JSON.stringify(evidence, null, 2) + '\n', 'utf8');
const result = makeResult({
  id: 'S10',
  title: 'AME с брендовым .epr и шаблон Output Module',
  host: 'ae',
  hostVersion,
  checks: all,
  fallback: 'Экспорт из AE через Render Queue или aerender с шаблоном Output Module, повторяющим брендовый `.epr`; '
    + 'шаблон создаёт панель или пользователь загружает по инструкции — по итогу S10 (§8.1)',
  notes,
  evidence: [DATA],
});
const file = writeResult(result);
for (const c of all) {
  console.log((c.pass ? 'ok  ' : (c.required ? 'FAIL' : 'warn')) + ' ' + c.name
    + (c.pass ? '' : '  -> ' + JSON.stringify(c.detail).slice(0, 300)));
}
console.log('S10: ' + result.verdict + ' -> ' + file);
```

- [ ] **Step 8: Проверить синтаксис раннера**

Run: `node --check spikes/s10-ame/run.mjs && node --check spikes/s10-ame/lib.mjs`
Expected: пустой вывод, код возврата 0.

- [ ] **Step 9: Подготовить AE и Media Encoder (вручную)**

1. AE — как в шаге 18 задачи 7.
2. Запустить Adobe Media Encoder 2026, дождаться главного окна, закрыть стартовые окна.
3. Очередь AME (панель Queue, «Очередь») должна быть пустой: `runBatch` кодирует всё, что в ней стоит. Если там задания пользователя — решает пользователь; без его согласия задания не удалять, прогон отложить.
4. Проверить, что брендовый пресет на месте. Путь строит `sourceRoot()`, как в раннере.

Run: `node -e "import('./tools/packs/paths.mjs').then((m) => { const f = m.sourceRoot() + '/7_Пресеты_Media_Encoder/FullHD.epr'; console.log((require('node:fs').existsSync(f) ? 'ok ' : 'MISSING ') + f); })"`
Expected: `ok C:/Users/Глеб/Documents/Граф пакет Cloud.ru/7_Пресеты_Media_Encoder/FullHD.epr` (или путь из `BRANDKIT_SOURCE`). `MISSING` — задать `BRANDKIT_SOURCE` папкой пакета.

- [ ] **Step 10: Запустить S10**

Run: `node spikes/s10-ame/run.mjs`
Expected при полном успехе (часть (b) может идти до 5 минут):

```text
ok   om: fixture opened
ok   om: comp queued in the render queue
ok   om: settable settings dumped (STRING_SETTABLE)
ok   om: QuickTime base (Format by setSettings, else a built-in alpha template)
ok   om: Channels = RGB + Alpha via setSettings
ok   om: template CRBK_ProRes4444_Alpha saved and listed
ok   om: template applies QuickTime + RGB + Alpha
ok   om: 10-frame test render with the template finished
ok   om: render queue cleaned, fixture closed without saving
ok   om: test render is ProRes 4444 with alpha (ffprobe)
ok   ame: BridgeTalk knows Media Encoder
ok   ame: Media Encoder running (launched on request)
ok   ame: Media Encoder running and idle
ok   ame: dynamicLinkGUID of both comps
ok   ame: job sent to Media Encoder (AE does not wait)
ok   ame: reply file from Media Encoder
ok   ame: addCompToBatch accepted the job
ok   ame: addCompToBatch output written and stable
ok   ame: output matches FullHD.epr (H.264 1920x1080 25 fps)
ok   ame: comp GUID listed by getDLItemsAtRoot
ok   ame: addDLToBatch renders the chosen comp (CRT_LowerThird_v1, 10 s)
S10: yes -> …\spikes\results\S10.json
```

Как читать итог:
- в `notes` — каким путём получен шаблон (`setSettings` или `template:<встроенный>`), ответ `setSettings` на Format и какую композицию AME взял как первую;
- `FAIL` на «Media Encoder running and idle» — AME не запустился или показывает окно (`BUSY`): закрыть окно, `node spikes/s10-ame/run.mjs --only ame`;
- `FAIL` на выходе AME — итог `no`: экспорт из AE через Render Queue или aerender с шаблоном Output Module (запасной путь S10);
- `warn` в части (a) — итог `partial`: шаблон Output Module пользователь загружает из `.aom` вручную (Edit → Templates → Output Module → Load).

**Прогон 2026-10-02 (AE 26.5, AME 26.5.2):**
- часть (a) работает: шаблон ProRes 4444 с альфой создан скриптом на базе встроенного «High Quality with Alpha»; `Channels` через `setSettings` только для чтения;
- часть (b) — `no`. BridgeTalk доходит до AME: тело без вызовов frontend выполняется за секунду. Но `addCompToBatch` в AME не возвращается (статус PUMPING, очередь пуста, AME не закрывается штатно);
- AE не должен ждать ответа AME. AME читает композиции через Dynamic Link, а его обслуживает тот же AE, поэтому `bt.send(timeout)` и цикл `pump` блокируют обе программы. Теперь AE только отправляет задание, ответ AME пишет в `reply.txt`, а Node ждёт файл.

- [ ] **Step 11: Сверить очередь AME и записать наблюдения (вручную)**

1. В очереди AME два задания со статусом Done («Готово»); файлы в `C:/CRBK/work/ame/out_comp` и `C:/CRBK/work/ame/out_dl` (или рядом с этими папками — тогда в `spikes/results/S10.data.json` видно, как AME понял путь вывода).
2. Записать:

```bash
node tools/spike/manual.mjs --id S10 --check "ame: queue shows both jobs done" --pass true --detail "<статусы и время кодирования>" --optional
node tools/spike/manual.mjs --id S10 --check "no dialogs in AE or AME during the run" --pass true --detail "-" --optional
```

- [ ] **Step 12: Проверить, что шаблон пережил перезапуск AE (вручную)**

1. Закрыть AE (File → Exit), снова открыть, открыть панель BrandKit Dev.
2. Edit → Templates → Output Module («Редактирование» → «Шаблоны» → «Модуль вывода»): в списке есть `CRBK_ProRes4444_Alpha`.

Run: `node spikes/s10-ame/run.mjs --persist`
Expected: `ok   om: template CRBK_ProRes4444_Alpha still listed after an AE restart -> S10: yes` (или `partial`, если раньше были `warn`).

Шаблон остаётся в настройках AE пользователя. Убрать его, если он не нужен: Edit → Templates → Output Module → выбрать `CRBK_ProRes4444_Alpha` → Delete.

- [ ] **Step 13: Обновить отчёт**

Run: `npm run spike:report`
Expected: `written …\spikes\RESULTS.md`, в таблице строка S10.

- [ ] **Step 14: Commit**

```bash
git add spikes/s10-ame/lib.mjs spikes/s10-ame/probe.jsx spikes/s10-ame/run.mjs tests/spikes/s10-lib.test.mjs spikes/results/S10.json spikes/results/S10.data.json spikes/RESULTS.md
git commit -m "feat(spikes): S10 AME queue via BridgeTalk and output module template" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Часть C. Экземпляр шаблона (S3), ΔE и чтение PNG

Задачи 12–13 — офлайн-утилиты для проверки кадров: цветовое отличие ΔE2000 и чтение PNG. Ими пользуются S3, пробные сборки частей D–E (кадры из Premiere) и будущий QA-гейт (§4.4: ΔE2000 ≤ 2). Задача 14 — пробная сборка S3: шаблон встаёт в проект пользователя After Effects, поля пишутся через Essential Properties, длина подгоняется (rdt, time remap, обрезка), цвет патча меряется. По итогам S3 выбирается механизм длины для правила контракта C27.

**Порядок:** 12 → 13 → 14.

**Зависимости.**
- Задачи 1–6: vitest и pngjs, линтер, `workPath`, `run`/`lintOrThrow`, `composeProbe`, `makeResult`/`writeResult`, `manual.mjs`, панель BrandKit Dev.
- Задача 7 (часть B): контракт фикстуры `spikes/fixtures/contract.mjs` (`COMP_LT`, `COMP_HATCH`, `EGP`, `fixturePaths()`, `fixtureParams()`), `CRT_fixture.aep` и медиа в `C:/CRBK/work/fixtures`.
- Задача 9 (часть B): `tools/spike/wait-file.mjs` — общие ожидания файлов; `waitForPng` берёт оттуда `sleep`.
- S1 (часть B): копия `C:/CRBK/work/fixtures/CRT_fixture_egp.aep` со свойствами Essential Graphics. Если S1 её не дала, шаг 1 задачи 14 собирает копию вручную.

### Task 12: ΔE2000: sRGB → CIELAB

8-битный sRGB переводится в CIELAB (D65, наблюдатель 2°), разница считается по CIEDE2000. Тест сверяется со всеми 34 парами набора Sharma, Wu, Dalal (2005) и с эталонными Lab основных цветов sRGB. Каналы принимаются и дробными: так приходят средние по области кадра.

**Files:**
- Create: `tools/color/deltae.mjs`
- Test: `tests/tools/deltae.test.mjs`

- [ ] **Step 1: Написать падающий тест `tests/tools/deltae.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import {
  hexToRgb, rgbToHex, srgbToLinear, rgbToXyz, xyzToLab, hexToLab, rgbToLab, D65,
  deltaE2000, deltaE2000Rgb, deltaE2000Hex,
} from '../../tools/color/deltae.mjs';

// Sharma, Wu, Dalal (2005), "The CIEDE2000 color-difference formula: implementation notes,
// supplementary test data, and mathematical observations", Color Res. Appl. 30(1): 21-30, Table 1.
// Columns: L1, a1, b1, L2, a2, b2, dE00 (pairs 1-34).
const SHARMA = [
  [50.0000, 2.6772, -79.7751, 50.0000, 0.0000, -82.7485, 2.0425],
  [50.0000, 3.1571, -77.2803, 50.0000, 0.0000, -82.7485, 2.8615],
  [50.0000, 2.8361, -74.0200, 50.0000, 0.0000, -82.7485, 3.4412],
  [50.0000, -1.3802, -84.2814, 50.0000, 0.0000, -82.7485, 1.0000],
  [50.0000, -1.1848, -84.8006, 50.0000, 0.0000, -82.7485, 1.0000],
  [50.0000, -0.9009, -85.5211, 50.0000, 0.0000, -82.7485, 1.0000],
  [50.0000, 0.0000, 0.0000, 50.0000, -1.0000, 2.0000, 2.3669],
  [50.0000, -1.0000, 2.0000, 50.0000, 0.0000, 0.0000, 2.3669],
  [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0009, 7.1792],
  [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0010, 7.1792],
  [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0011, 7.2195],
  [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0012, 7.2195],
  [50.0000, -0.0010, 2.4900, 50.0000, 0.0009, -2.4900, 4.8045],
  [50.0000, -0.0010, 2.4900, 50.0000, 0.0010, -2.4900, 4.8045],
  [50.0000, -0.0010, 2.4900, 50.0000, 0.0011, -2.4900, 4.7461],
  [50.0000, 2.5000, 0.0000, 50.0000, 0.0000, -2.5000, 4.3065],
  [50.0000, 2.5000, 0.0000, 73.0000, 25.0000, -18.0000, 27.1492],
  [50.0000, 2.5000, 0.0000, 61.0000, -5.0000, 29.0000, 22.8977],
  [50.0000, 2.5000, 0.0000, 56.0000, -27.0000, -3.0000, 31.9030],
  [50.0000, 2.5000, 0.0000, 58.0000, 24.0000, 15.0000, 19.4535],
  [50.0000, 2.5000, 0.0000, 50.0000, 3.1736, 0.5854, 1.0000],
  [50.0000, 2.5000, 0.0000, 50.0000, 3.2972, 0.0000, 1.0000],
  [50.0000, 2.5000, 0.0000, 50.0000, 1.8634, 0.5757, 1.0000],
  [50.0000, 2.5000, 0.0000, 50.0000, 3.2592, 0.3350, 1.0000],
  [60.2574, -34.0099, 36.2677, 60.4626, -34.1751, 39.4387, 1.2644],
  [63.0109, -31.0961, -5.8663, 62.8187, -29.7946, -4.0864, 1.2630],
  [61.2901, 3.7196, -5.3901, 61.4292, 2.2480, -4.9620, 1.8731],
  [35.0831, -44.1164, 3.7933, 35.0232, -40.0716, 1.5901, 1.8645],
  [22.7233, 20.0904, -46.6940, 23.0331, 14.9730, -42.5619, 2.0373],
  [36.4612, 47.8580, 18.3852, 36.2715, 50.5065, 21.2231, 1.4146],
  [90.8027, -2.0831, 1.4410, 91.1528, -1.6435, 0.0447, 1.4441],
  [90.9257, -0.5406, -0.9208, 88.6381, -0.8985, -0.7239, 1.5381],
  [6.7747, -0.2908, -2.4247, 5.8714, -0.0985, -2.2286, 0.6377],
  [2.0776, 0.0795, -1.1350, 0.9033, -0.0636, -0.5514, 0.9082],
];

const lab = (L, a, b) => ({ L, a, b });

describe('CIEDE2000 (Sharma 2005 test data)', () => {
  it.each(SHARMA.map((r, i) => [i + 1, r]))('pair %i', (_n, [L1, a1, b1, L2, a2, b2, dE]) => {
    expect(deltaE2000(lab(L1, a1, b1), lab(L2, a2, b2))).toBeCloseTo(dE, 4);
  });
  it('is symmetric', () => {
    for (const [L1, a1, b1, L2, a2, b2] of SHARMA) {
      expect(deltaE2000(lab(L2, a2, b2), lab(L1, a1, b1))).toBeCloseTo(deltaE2000(lab(L1, a1, b1), lab(L2, a2, b2)), 10);
    }
  });
  it('is zero for identical colours', () => {
    expect(deltaE2000(lab(53.2, 80.1, 67.2), lab(53.2, 80.1, 67.2))).toBe(0);
    expect(deltaE2000Hex('#26D07C', '#26d07c')).toBe(0);
  });
});

describe('sRGB 8-bit -> CIELAB (D65)', () => {
  it('maps white to L=100, a=b=0 and black to 0', () => {
    const w = hexToLab('#FFFFFF');
    expect(w.L).toBeCloseTo(100, 6);
    expect(w.a).toBeCloseTo(0, 6);
    expect(w.b).toBeCloseTo(0, 6);
    const k = hexToLab('#000000');
    expect(k.L).toBeCloseTo(0, 10);
    expect(k.a).toBeCloseTo(0, 10);
    expect(k.b).toBeCloseTo(0, 10);
  });
  it('matches reference Lab values of the sRGB primaries and mid grey', () => {
    // Reference: Lindbloom's sRGB/D65 conversion (no chromatic adaptation).
    const near = (got, [L, a, b]) => {
      expect(got.L).toBeCloseTo(L, 2);
      expect(got.a).toBeCloseTo(a, 2);
      expect(got.b).toBeCloseTo(b, 2);
    };
    near(hexToLab('#FF0000'), [53.2408, 80.0925, 67.2032]);
    near(hexToLab('#00FF00'), [87.7347, -86.1827, 83.1793]);
    near(hexToLab('#0000FF'), [32.2970, 79.1875, -107.8602]);
    near(hexToLab('#808080'), [53.5850, 0, 0]);
  });
  it('uses the IEC 61966-2-1 transfer function and the D65 white of its matrix', () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(255)).toBe(1);
    expect(srgbToLinear(10)).toBeCloseTo(10 / 255 / 12.92, 12);
    expect(D65.x).toBeCloseTo(0.95047, 5);
    expect(D65.z).toBeCloseTo(1.08883, 5);
    const xyz = rgbToXyz({ r: 255, g: 255, b: 255 });
    expect(xyzToLab(xyz).L).toBeCloseTo(100, 6);
  });
  it('accepts fractional channel means (from averaged pixels)', () => {
    const a = rgbToLab({ r: 38.4, g: 208.2, b: 124.1 });
    const b = hexToLab('#26D07C');
    expect(deltaE2000(a, b)).toBeLessThan(0.5);
    expect(deltaE2000Rgb({ r: 38, g: 208, b: 124 }, hexToRgb('#26D07C'))).toBe(0);
  });
});

describe('hex helpers', () => {
  it('parses #RRGGBB in any case, with or without #', () => {
    expect(hexToRgb('#26D07C')).toEqual({ r: 38, g: 208, b: 124 });
    expect(hexToRgb('26d07c')).toEqual({ r: 38, g: 208, b: 124 });
  });
  it('rejects anything else', () => {
    expect(() => hexToRgb('#26D07')).toThrow(/bad hex/);
    expect(() => hexToRgb('green')).toThrow(/bad hex/);
  });
  it('formats rounded, clamped channels', () => {
    expect(rgbToHex({ r: 38.4, g: 207.6, b: 300 })).toBe('#26D0FF');
    expect(rgbToHex({ r: -3, g: 0, b: 15 })).toBe('#00000F');
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run tests/tools/deltae.test.mjs`
Expected: FAIL — `Error: Cannot find module '../../tools/color/deltae.mjs'`.

- [ ] **Step 3: Создать `tools/color/deltae.mjs`**

```js
// sRGB (8-bit) -> CIELAB (D65, 2 degree observer) and the CIEDE2000 colour difference.
// Compares rendered colour patches with brand colours (spec §4.4: dE2000 <= 2).
// References: IEC 61966-2-1 (sRGB), CIE 15:2004 (CIELAB), Sharma, Wu, Dalal 2005 (CIEDE2000).

const HEX_RE = /^#?([0-9a-f]{6})$/i;

export function hexToRgb(hex) {
  const m = HEX_RE.exec(String(hex).trim());
  if (!m) throw new Error('bad hex colour: ' + hex);
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return ('#' + c(r) + c(g) + c(b)).toUpperCase();
}

// IEC 61966-2-1 transfer function: 8-bit code value (fractions allowed) -> linear 0..1.
export function srgbToLinear(c8) {
  const c = c8 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// Linear sRGB -> XYZ (D65), matrix as tabulated by Lindbloom from IEC 61966-2-1.
const M = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.0721750],
  [0.0193339, 0.1191920, 0.9503041],
];

// The white of this matrix (row sums), so #FFFFFF lands exactly on L=100, a=b=0.
export const D65 = {
  x: M[0][0] + M[0][1] + M[0][2],
  y: M[1][0] + M[1][1] + M[1][2],
  z: M[2][0] + M[2][1] + M[2][2],
};

export function rgbToXyz({ r, g, b }) {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  return {
    x: M[0][0] * R + M[0][1] * G + M[0][2] * B,
    y: M[1][0] * R + M[1][1] * G + M[1][2] * B,
    z: M[2][0] * R + M[2][1] * G + M[2][2] * B,
  };
}

const EPS = 216 / 24389;
const KAPPA = 24389 / 27;
const f = (t) => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116);

export function xyzToLab({ x, y, z }, white = D65) {
  const fx = f(x / white.x);
  const fy = f(y / white.y);
  const fz = f(z / white.z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export const rgbToLab = (rgb) => xyzToLab(rgbToXyz(rgb));
export const hexToLab = (hex) => rgbToLab(hexToRgb(hex));

const RAD = Math.PI / 180;
// atan2 in degrees, mapped to [0, 360).
const hueDeg = (b, a) => {
  if (a === 0 && b === 0) return 0;
  const d = Math.atan2(b, a) / RAD;
  return d < 0 ? d + 360 : d;
};

// CIEDE2000, equations (2)-(22) of Sharma et al. 2005.
export function deltaE2000(lab1, lab2, { kL = 1, kC = 1, kH = 1 } = {}) {
  const { L: L1, a: a1, b: b1 } = lab1;
  const { L: L2, a: a2, b: b2 } = lab2;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar7 = Math.pow((C1 + C2) / 2, 7);
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + Math.pow(25, 7))));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const h1p = hueDeg(b1, a1p);
  const h2p = hueDeg(b2, a2p);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp;
  if (C1p * C2p === 0) dhp = 0;
  else if (Math.abs(h2p - h1p) <= 180) dhp = h2p - h1p;
  else if (h2p - h1p > 180) dhp = h2p - h1p - 360;
  else dhp = h2p - h1p + 360;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * RAD);

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;
  let hbarp;
  if (C1p * C2p === 0) hbarp = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) hbarp = (h1p + h2p) / 2;
  else if (h1p + h2p < 360) hbarp = (h1p + h2p + 360) / 2;
  else hbarp = (h1p + h2p - 360) / 2;

  const T = 1
    - 0.17 * Math.cos((hbarp - 30) * RAD)
    + 0.24 * Math.cos(2 * hbarp * RAD)
    + 0.32 * Math.cos((3 * hbarp + 6) * RAD)
    - 0.20 * Math.cos((4 * hbarp - 63) * RAD);
  const dTheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));
  const Cbarp7 = Math.pow(Cbarp, 7);
  const RC = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + Math.pow(25, 7)));
  const L50 = Math.pow(Lbarp - 50, 2);
  const SL = 1 + (0.015 * L50) / Math.sqrt(20 + L50);
  const SC = 1 + 0.045 * Cbarp;
  const SH = 1 + 0.015 * Cbarp * T;
  const RT = -Math.sin(2 * dTheta * RAD) * RC;

  const tL = dLp / (kL * SL);
  const tC = dCp / (kC * SC);
  const tH = dHp / (kH * SH);
  return Math.sqrt(tL * tL + tC * tC + tH * tH + RT * tC * tH);
}

export const deltaE2000Rgb = (rgb1, rgb2) => deltaE2000(rgbToLab(rgb1), rgbToLab(rgb2));
export const deltaE2000Hex = (hex1, hex2) => deltaE2000(hexToLab(hex1), hexToLab(hex2));
```

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/tools/deltae.test.mjs`
Expected: `43 passed`.

- [ ] **Step 5: Commit**

```bash
git add tools/color/deltae.mjs tests/tools/deltae.test.mjs
git commit -m "feat(tools): sRGB to CIELAB and CIEDE2000 colour difference" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 13: Чтение PNG: пиксель, среднее, центр цвета, ожидание файла

pngjs декодирует любой PNG в 8-битный RGBA (16-битные файлы приводятся к 8 битам).
- `pixelAt(file, x, y)` → `{r, g, b, a}`.
- `meanColor(file, {x, y, w, h})` → `{r, g, b, a, n}`. Область за краем кадра — исключение: так ловится кадр, сохранённый не в полном размере (ae-quirks #27, #34).
- `findColorCentroid(file, hex, tolerance)` → `{x, y, count, box}`. Центр и рамка пикселей заданного цвета, необязательная `region`. Им S3 находит PROBE_SQ (#FF00FF), части D–E — тот же квадрат в кадрах Premiere.
- `waitForPng(file)` ждёт, пока файл станет целым PNG (сигнатура и чанк IEND) и перестанет расти: `saveFrameToPng` возвращается раньше, чем файл записан (ae-quirks #27, #40, #50, #99).

Вместо пути можно передать уже прочитанное изображение (`readPng`), чтобы мерить один кадр много раз.

**Files:**
- Create: `tools/png/read-png.mjs`
- Test: `tests/tools/read-png.test.mjs`

- [ ] **Step 1: Написать падающий тест `tests/tools/read-png.test.mjs`**

Тест сам рисует PNG в `os.tmpdir()`.

```js
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import {
  readPng, pixelAt, meanColor, findColorCentroid, isCompletePng, waitForPng,
} from '../../tools/png/read-png.mjs';

const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-png-'));

function makePng(file, w, h, paint) {
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const [r, g, b, a] = paint(x, y);
      png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = a;
    }
  }
  writeFileSync(file, PNG.sync.write(png));
  return file;
}

// 400x200 frame on opaque black:
// - a 40x40 magenta square centred at (150, 100), like PROBE_SQ in the fixture;
// - a 20x10 brand-green patch at x 300..319, y 20..29;
// - a 10x10 near-magenta square (250, 4, 251) at x 20..29, y 160..169;
// - a 10x10 fully transparent magenta square at x 360..369, y 160..169.
const frame = path.join(dir, 'frame.png');
beforeAll(() => {
  makePng(frame, 400, 200, (x, y) => {
    if (x >= 130 && x < 170 && y >= 80 && y < 120) return [255, 0, 255, 255];
    if (x >= 300 && x < 320 && y >= 20 && y < 30) return [38, 208, 124, 255];
    if (x >= 20 && x < 30 && y >= 160 && y < 170) return [250, 4, 251, 255];
    if (x >= 360 && x < 370 && y >= 160 && y < 170) return [255, 0, 255, 0];
    return [0, 0, 0, 255];
  });
});

describe('pixelAt', () => {
  it('reads RGBA at integer coordinates', () => {
    expect(pixelAt(frame, 150, 100)).toEqual({ r: 255, g: 0, b: 255, a: 255 });
    expect(pixelAt(frame, 0, 0)).toEqual({ r: 0, g: 0, b: 0, a: 255 });
  });
  it('throws outside the image or on fractional coordinates', () => {
    expect(() => pixelAt(frame, 400, 0)).toThrow(RangeError);
    expect(() => pixelAt(frame, -1, 0)).toThrow(RangeError);
    expect(() => pixelAt(frame, 1.5, 0)).toThrow(RangeError);
  });
  it('accepts an already decoded image', () => {
    const img = readPng(frame);
    expect(img.width).toBe(400);
    expect(img.height).toBe(200);
    expect(pixelAt(img, 305, 25)).toEqual({ r: 38, g: 208, b: 124, a: 255 });
  });
});

describe('meanColor', () => {
  it('averages a uniform region exactly', () => {
    expect(meanColor(frame, { x: 300, y: 20, w: 20, h: 10 })).toEqual({ r: 38, g: 208, b: 124, a: 255, n: 200 });
  });
  it('averages a mixed region', () => {
    // 10 columns of green (x 300..309) and 10 columns of black (x 290..299)
    const m = meanColor(frame, { x: 290, y: 20, w: 20, h: 10 });
    expect(m.r).toBeCloseTo(19, 10);
    expect(m.g).toBeCloseTo(104, 10);
    expect(m.b).toBeCloseTo(62, 10);
    expect(m.n).toBe(200);
  });
  it('throws when the region leaves the image (e.g. a half-resolution frame)', () => {
    expect(() => meanColor(frame, { x: 390, y: 0, w: 20, h: 10 })).toThrow(RangeError);
    expect(() => meanColor(frame, { x: 0, y: 0, w: 0, h: 10 })).toThrow(RangeError);
  });
});

describe('findColorCentroid', () => {
  it('finds the centre, pixel count and box of a solid square', () => {
    expect(findColorCentroid(frame, '#FF00FF', 0)).toEqual({
      x: 150, y: 100, count: 1600,
      box: { x0: 130, y0: 80, x1: 169, y1: 119, w: 40, h: 40 },
    });
  });
  it('matches near colours only within the tolerance (max channel difference)', () => {
    expect(findColorCentroid(frame, '#FA04FB', 0).count).toBe(100);
    expect(findColorCentroid(frame, '#FF00FF', 4).count).toBe(1600);
    const both = findColorCentroid(frame, '#FF00FF', 5);
    expect(both.count).toBe(1700);
  });
  it('ignores transparent pixels unless minAlpha says otherwise', () => {
    expect(findColorCentroid(frame, '#FF00FF', 0, { minAlpha: 0 }).count).toBe(1700);
  });
  it('reports an absent colour as count 0', () => {
    expect(findColorCentroid(frame, '#0063FF', 3)).toEqual({ x: null, y: null, count: 0, box: null });
  });
  it('searches only inside a region when one is given', () => {
    const left = findColorCentroid(frame, '#FF00FF', 0, { region: { x: 100, y: 50, w: 50, h: 100 } });
    expect(left.count).toBe(800);
    expect(left.box).toEqual({ x0: 130, y0: 80, x1: 149, y1: 119, w: 20, h: 40 });
    expect(() => findColorCentroid(frame, '#FF00FF', 0, { region: { x: 390, y: 0, w: 20, h: 10 } })).toThrow(RangeError);
  });
});

describe('PNG completeness', () => {
  it('recognises a complete file and rejects a truncated or missing one', () => {
    const cut = path.join(dir, 'cut.png');
    const buf = readFileSync(frame);
    writeFileSync(cut, buf.subarray(0, buf.length - 20));
    expect(isCompletePng(frame)).toBe(true);
    expect(isCompletePng(cut)).toBe(false);
    expect(isCompletePng(path.join(dir, 'missing.png'))).toBe(false);
  });
  it('waits for a file that appears later', async () => {
    const late = path.join(dir, 'late.png');
    setTimeout(() => writeFileSync(late, readFileSync(frame)), 300);
    const r = await waitForPng(late, { timeoutMs: 5000, intervalMs: 50 });
    expect(r.size).toBe(readFileSync(frame).length);
  });
  it('times out on a file that never completes', async () => {
    const cut = path.join(dir, 'never.png');
    const buf = readFileSync(frame);
    writeFileSync(cut, buf.subarray(0, buf.length - 20));
    await expect(waitForPng(cut, { timeoutMs: 400, intervalMs: 50 })).rejects.toThrow(/PNG_TIMEOUT/);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run tests/tools/read-png.test.mjs`
Expected: FAIL — `Error: Cannot find module '../../tools/png/read-png.mjs'`.

- [ ] **Step 3: Создать `tools/png/read-png.mjs`**

```js
// Read rendered frames (AE saveFrameToPng, Premiere exportFramePNG) and measure them.
// pngjs decodes every PNG to 8-bit RGBA (16-bit files are rescaled), so values are 0..255.
// `src` is a file path or an image already returned by readPng (to measure one frame many times).
import { readFileSync, openSync, readSync, closeSync, fstatSync, statSync } from 'node:fs';
import { PNG } from 'pngjs';
import { hexToRgb } from '../color/deltae.mjs';
import { sleep } from '../spike/wait-file.mjs';

export function readPng(file) {
  return PNG.sync.read(readFileSync(file));
}

const load = (src) => (typeof src === 'string' ? readPng(src) : src);

function assertInside(img, x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= img.width || y >= img.height) {
    throw new RangeError(`pixel (${x}, ${y}) is outside the ${img.width}x${img.height} image`);
  }
}

export function pixelAt(src, x, y) {
  const img = load(src);
  assertInside(img, x, y);
  const i = (y * img.width + x) * 4;
  const d = img.data;
  return { r: d[i], g: d[i + 1], b: d[i + 2], a: d[i + 3] };
}

// Mean RGBA over a rectangle; n = number of pixels. Throws if the rectangle leaves the image,
// which is how a frame saved at a lower resolution than expected shows up (ae-quirks #27, #34).
export function meanColor(src, { x, y, w, h }) {
  const img = load(src);
  if (!(w > 0 && h > 0)) throw new RangeError(`empty region ${w}x${h}`);
  assertInside(img, x, y);
  assertInside(img, x + w - 1, y + h - 1);
  let r = 0, g = 0, b = 0, a = 0;
  const d = img.data;
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const i = (yy * img.width + xx) * 4;
      r += d[i]; g += d[i + 1]; b += d[i + 2]; a += d[i + 3];
    }
  }
  const n = w * h;
  return { r: r / n, g: g / n, b: b / n, a: a / n, n };
}

// Centre (pixel-centre convention: pixel i covers [i, i+1)), count and bounding box of the pixels
// within `tolerance` (max channel difference) of `hex` and with alpha >= minAlpha.
// `region` ({x, y, w, h}) limits the search; by default the whole image is searched.
export function findColorCentroid(src, hex, tolerance = 0, { minAlpha = 128, region = null } = {}) {
  const img = load(src);
  const t = hexToRgb(hex);
  const d = img.data;
  const r = region || { x: 0, y: 0, w: img.width, h: img.height };
  if (!(r.w > 0 && r.h > 0)) throw new RangeError(`empty region ${r.w}x${r.h}`);
  assertInside(img, r.x, r.y);
  assertInside(img, r.x + r.w - 1, r.y + r.h - 1);
  let sx = 0, sy = 0, count = 0;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let y = r.y; y < r.y + r.h; y += 1) {
    for (let x = r.x; x < r.x + r.w; x += 1) {
      const i = (y * img.width + x) * 4;
      if (d[i + 3] < minAlpha) continue;
      const diff = Math.max(Math.abs(d[i] - t.r), Math.abs(d[i + 1] - t.g), Math.abs(d[i + 2] - t.b));
      if (diff > tolerance) continue;
      sx += x + 0.5; sy += y + 0.5; count += 1;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (!count) return { x: null, y: null, count: 0, box: null };
  return {
    x: sx / count, y: sy / count, count,
    box: { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 },
  };
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// Zero-length IEND chunk: length 0, type "IEND", CRC AE 42 60 82.
const IEND = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

// True when the file starts with the PNG signature and ends with the IEND chunk.
export function isCompletePng(file) {
  let fd;
  try {
    fd = openSync(file, 'r');
    const size = fstatSync(fd).size;
    if (size < SIGNATURE.length + IEND.length) return false;
    const head = Buffer.alloc(SIGNATURE.length);
    const tail = Buffer.alloc(IEND.length);
    readSync(fd, head, 0, head.length, 0);
    readSync(fd, tail, 0, tail.length, size - tail.length);
    return head.equals(SIGNATURE) && tail.equals(IEND);
  } catch {
    return false;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

// saveFrameToPng returns before the file is written (ae-quirks #27, #40, #50, #99): wait until the
// file is a complete PNG and its size is the same on two consecutive polls.
// Generic file waits (stable size, new files in a folder) live in tools/spike/wait-file.mjs.
export async function waitForPng(file, { timeoutMs = 60000, intervalMs = 250 } = {}) {
  const t0 = Date.now();
  let last = -1;
  for (;;) {
    let size = -1;
    try { size = statSync(file).size; } catch { size = -1; }
    if (size > 0 && size === last && isCompletePng(file)) {
      return { file, size, waitedMs: Date.now() - t0 };
    }
    last = size;
    if (Date.now() - t0 > timeoutMs) {
      throw new Error(`PNG_TIMEOUT: ${file} is not a complete PNG after ${timeoutMs} ms (size ${size})`);
    }
    await sleep(intervalMs);
  }
}
```

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/tools/read-png.test.mjs`
Expected: `14 passed`.

- [ ] **Step 5: Commit**

```bash
git add tools/png/read-png.mjs tests/tools/read-png.test.mjs
git commit -m "feat(tools): read PNG frames: pixel, mean, colour centroid, completion wait" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 14: S3 — экземпляр шаблона в проекте пользователя (AE)

S3 проверяет путь вставки T1 в After Effects (§3.1, §6.1 «After Effects»):
- импорт одноэлементного `.aep` через `ImportOptions` в бин `Cloud.ru BrandKit` и слой композиции на заданное время;
- запись Essential Properties с чтением назад: текст с кириллицей, флажок, служебный слайдер «Длительность», список. Отдельного слайдера «минуты» в фикстуре нет: слайдер пишется тем же путём, что «Длительность»;
- замена медиа через `setAlternateSource`;
- копия футажа шаблона в `Cloud.ru BrandKit/CRT_LowerThird@1/` рядом с проектом и перелинковка `FootageItem.replace`;
- подгонка длины: `rdt` (растяжение слоя, интро и аутро защищены маркерами) и `trim` (обрезка out point плюс запись «Длительности»); заодно — вытягивание out point вместо растяжения;
- time remap — второй путь из §3.1 («Responsive Time … или time remap»): свежий экземпляр длиной 15 с с ключами времени, поля после включения time remap читаются назад;
- цветовой патч в проекте по умолчанию и в проекте с линейным рабочим пространством;
- выбор механизма длины для правила контракта C27: `recommendMechanism` в `analyze.mjs`.

**Как меряется время.** В фикстуре PROBE_SQ (#FF00FF, 40×40) движется по X линейно: 0 с → 100, 1 с → 200, 9 с → 200, 10 с → 300. Экземпляр `CRT_LowerThird_v1` стоит с 2 с и растянут до 15 с. Node находит квадрат на кадре (`findColorCentroid`) и сравнивает X с моделями из `analyze.mjs`. Кадры только целые (25 fps): 2,5 с — это кадр 62,5, поэтому берётся кадр 62 (2,48 с).

| Кадр | Время | Что на кадре | rdt | равномерное растяжение |
|---|---|---|---|---|
| 62, USER_Comp | 2,48 с | 0,48 с от начала экземпляра, интро | x = 148 | x = 132 |
| 412, USER_Comp | 16,48 с | 14,48 с, аутро (экземпляр кончается в 17 с) | x = 248 | x ≈ 265 |
| 200, USER_Comp | 8,00 с | удержание: патч QA, слот, плашка, должность (до и после записи полей) | — | — |
| 262, USER_Comp_Trim | 10,48 с | Hatch, «Длительность» = 12, до аутро | x = 100 | 200, если поле не применилось |
| 287, USER_Comp_Trim | 11,48 с | Hatch, внутри аутро | x = 148 | 200, если поле не применилось |
| 62, USER_Comp_Remap | 2,48 с | time remap, интро: 0,48 с слоя → 0,48 с шаблона | x = 148 | 148 и без time remap |
| 412, USER_Comp_Remap | 16,48 с | time remap, аутро: 14,48 с слоя → 9,48 с шаблона | x = 248 | квадрата нет, если time remap не сработал |

**Time remap.** Свежий экземпляр `CRT_LowerThird_v1` стоит с 2 с в своей композиции `USER_Comp_Remap`, как Hatch в `USER_Comp_Trim`: в `USER_Comp` уже стоит растянутый экземпляр, и его PROBE_SQ попал бы в те же кадры. Растяжение 100 %, out point в 17 с, ключи time remap 0→0, 1→1, 14→9, 15→10 с (время слоя → время шаблона, линейные). Это то же отображение, что у rdt, поэтому X те же: модель `remap` в `analyze.mjs` строит ключи (`remapKeys`) и ожидаемые X.

Допуск по X — 2,5 px, по цвету — ΔE2000 ≤ 2 (§4.4).

**Почему не один `runSpike`.** Между пробами Node копирует футаж и ждёт PNG, а `runSpike` при каждом вызове перезаписывает `S3.json`. Поэтому `run.mjs` собирает пробы через `composeProbe`, отправляет их через `run` и пишет один итог через `makeResult`/`writeResult`. Каждая проба заканчивается рендером: композиция не меняется, пока Node не дождался файлов. Проба, остановленная предусловием, ставит `DATA.stopped`, и прогон останавливается с записью итога.

**Обязательные и информационные проверки.**
- Обязательные: предусловия, импорт, поля с чтением назад, слот, перелинковка, обе проверки rdt, обе проверки trim, патч в проекте по умолчанию, кадры полного размера.
- Информационные (`required: false`): вытягивание out point, time remap (поля, включение, ключи, чтение полей после включения, X на обоих кадрах; обязательны только поиск шаблона, вставка экземпляра, кадры и сохранение проекта), подтверждение записей по кадру (плашка, должность, слот — позиции взяты из фикстуры части B), ΔE в линейном проекте и служебные замеры (настройки цвета проекта, бин, полный список свойств экземпляра).
- Итог «да»: rdt и trim работают, поля и слот пишутся, цвет патча в проекте по умолчанию не уезжает. В линейном проекте предусловия и вставка обязательны, а сам ΔE — замер.
- Механизм длины для контракта не зависит от итога: его выбирает `recommendMechanism` (шаг 20). Предпочтение — `rdt`: защищённые области шаблона остаются единственным источником таймингов. Если rdt не сработал, а time remap сработал, итог S3 — «нет», а механизм — `remap`.

**Files:**
- Create: `spikes/s3-instance/analyze.mjs`, `spikes/s3-instance/lib.jsx`, `spikes/s3-instance/probe-1-setup.jsx`, `spikes/s3-instance/probe-2-fields.jsx`, `spikes/s3-instance/probe-3-trim-out.jsx`, `spikes/s3-instance/probe-4-hatch-trim.jsx`, `spikes/s3-instance/probe-5-linear.jsx`, `spikes/s3-instance/probe-6-remap.jsx`, `spikes/s3-instance/run.mjs`
- Create (прогоном): `spikes/results/S3.json`, `spikes/results/S3.data.json`
- Modify (генерируется `npm run spike:report`): `spikes/RESULTS.md`
- Test: `tests/spikes/s3-analyze.test.mjs`

- [ ] **Step 1: Копия фикстуры с Essential Graphics: проверить, при необходимости собрать вручную**

Нужен `C:/CRBK/work/fixtures/CRT_fixture_egp.aep` от S1 (часть B). Если файла нет или в `spikes/results/S1.json` добавились не все свойства, соберите копию вручную. Пункты меню даны по-английски; в русском интерфейсе они на тех же местах.

(вручную)
1. After Effects → File → Open Project… (Файл → Открыть проект…): `C:\CRBK\work\fixtures\CRT_fixture_egp.aep`, если он есть, иначе `C:\CRBK\work\fixtures\CRT_fixture.aep`.
2. Двойной щелчок по `CRT_LowerThird_v1` в панели Project. Window → Essential Graphics (Окно → Основные графические элементы). В поле Primary вверху панели — `CRT_LowerThird_v1`.
3. Каждое недостающее свойство из таблицы раскрыть в Timeline и перетащить в панель Essential Graphics. Затем двойной щелчок по его имени в панели — ввести имя из правой колонки. Имена должны совпасть посимвольно; уже добавленное свойство с другим именем — переименовать так же.

| Что перетащить | Имя в Essential Graphics |
|---|---|
| TXT_NAME → Text → Source Text | `Имя` |
| TXT_ROLE → Text → Source Text | `Должность` |
| CTRL → Effects → ShowRole → его единственный параметр | `Показать должность` |
| CTRL → Effects → Duration → его единственный параметр | `Длительность (служебное, не менять)` |
| CTRL → Effects → Accent → его единственный параметр | `Акцент` |
| CTRL → Effects → Style → его единственный параметр (список) | `Стиль` |
| строка слоя SLOT_PHOTO целиком (замена медиа) | `Фото` |

4. Двойной щелчок по `CRT_Hatch_v1`, в поле Primary — `CRT_Hatch_v1`. CTRL → Effects → Duration → параметр → `Длительность (служебное, не менять)`.
5. Если открыт `CRT_fixture_egp.aep` — File → Save (Файл → Сохранить). Если `CRT_fixture.aep` — File → Save As → Save As… (Файл → Сохранить как → Сохранить как…) → `C:\CRBK\work\fixtures\CRT_fixture_egp.aep`; исходный `CRT_fixture.aep` не перезаписывать.

Флажок QA в Essential Graphics не выводится (§4.2). Отметка о ручной сборке пишется в шаге 17: `S3.json` создаёт прогон.

- [ ] **Step 2: Написать падающий тест `tests/spikes/s3-analyze.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import {
  LT, LT_KEYS, FRAMES, TOL_PX, REMAP_MODELS, frameTime, xAtTime, masterTime, remapKeys, expectedLtX, explainX, hatchX,
  nearX, round, describeLt, recommendMechanism,
} from '../../spikes/s3-instance/analyze.mjs';

describe('S3 fixture model', () => {
  it('samples whole frames at 25 fps', () => {
    expect(frameTime(FRAMES.intro)).toBeCloseTo(2.48, 10);
    expect(frameTime(FRAMES.outro)).toBeCloseTo(16.48, 10);
    expect(frameTime(FRAMES.hatchOut)).toBeCloseTo(11.48, 10);
  });
  it('interpolates the PROBE_SQ keys linearly and clamps outside them', () => {
    expect(xAtTime(LT_KEYS, 0.48)).toBeCloseTo(148, 10);
    expect(xAtTime(LT_KEYS, 5)).toBe(200);
    expect(xAtTime(LT_KEYS, 9.48)).toBeCloseTo(248, 10);
    expect(xAtTime(LT_KEYS, 12)).toBe(300);
    expect(xAtTime(LT_KEYS, -1)).toBe(100);
  });
});

describe('duration-fitting models', () => {
  const p = { ...LT, layerDur: LT.target };
  it('rdt keeps the intro and the outro at their speed and stretches the middle', () => {
    expect(masterTime(0.48, 'rdt', p)).toBeCloseTo(0.48, 10);
    expect(masterTime(14.48, 'rdt', p)).toBeCloseTo(9.48, 10);
    expect(masterTime(1, 'rdt', p)).toBeCloseTo(1, 10);
    expect(masterTime(14, 'rdt', p)).toBeCloseTo(9, 10);
    expect(masterTime(7.5, 'rdt', p)).toBeCloseTo(5, 10);
  });
  it('uniform stretches everything, none does not stretch', () => {
    expect(masterTime(14.48, 'uniform', p)).toBeCloseTo(9.6533, 4);
    expect(masterTime(14.48, 'none', p)).toBe(14.48);
    expect(() => masterTime(1, 'loop', p)).toThrow(/unknown model/);
  });
  it('predicts PROBE_SQ x at the sampled frames', () => {
    expect(expectedLtX(FRAMES.intro, 'rdt')).toBeCloseTo(148, 6);
    expect(expectedLtX(FRAMES.intro, 'uniform')).toBeCloseTo(132, 6);
    expect(expectedLtX(FRAMES.intro, 'none')).toBeCloseTo(148, 6);
    expect(expectedLtX(FRAMES.outro, 'rdt')).toBeCloseTo(248, 6);
    expect(expectedLtX(FRAMES.outro, 'uniform')).toBeCloseTo(265.333, 3);
    expect(expectedLtX(FRAMES.outro, 'none')).toBeNull();
  });
  it('explains a measurement by the models it matches', () => {
    expect(explainX(FRAMES.intro, { x: 148.3, count: 1600 })).toEqual(['rdt', 'none']);
    expect(explainX(FRAMES.intro, { x: 132.1, count: 1600 })).toEqual(['uniform']);
    expect(explainX(FRAMES.outro, { x: 247.9, count: 1600 })).toEqual(['rdt']);
    expect(explainX(FRAMES.outro, { x: 265.2, count: 1600 })).toEqual(['uniform']);
    expect(explainX(FRAMES.outro, { x: null, count: 0 })).toEqual(['none']);
    expect(explainX(FRAMES.outro, { x: 300, count: 1600 })).toEqual([]);
  });
});

describe('trim template (CRT_Hatch_v1)', () => {
  it('holds at 100 until Duration - 1, then moves to 200 at Duration', () => {
    expect(hatchX(frameTime(FRAMES.hatchHold), 12)).toBe(100);
    expect(hatchX(frameTime(FRAMES.hatchOut), 12)).toBeCloseTo(148, 6);
    expect(hatchX(frameTime(FRAMES.hatchOut), 10)).toBe(200);
    expect(hatchX(frameTime(FRAMES.hatchHold), 10)).toBe(200);
  });
});

describe('time remap model', () => {
  const p = { ...LT, layerDur: LT.target };
  it('keys the 15 s instance 0->0, 1->1, 14->9, 15->10 (layer time -> template time)', () => {
    expect(remapKeys(p)).toEqual([[0, 0], [1, 1], [14, 9], [15, 10]]);
  });
  it('maps time like rdt inside the layer and holds outside the keys', () => {
    for (const t of [0, 0.48, 1, 5, 7.5, 14, 14.48, 15]) {
      expect(masterTime(t, 'remap', p)).toBeCloseTo(masterTime(t, 'rdt', p), 10);
    }
    expect(masterTime(-1, 'remap', p)).toBe(0);
    expect(masterTime(16, 'remap', p)).toBe(10);
  });
  it('predicts PROBE_SQ x at the sampled frames and explains a remapped instance', () => {
    expect(expectedLtX(FRAMES.intro, 'remap')).toBeCloseTo(148, 6);
    expect(expectedLtX(FRAMES.outro, 'remap')).toBeCloseTo(248, 6);
    expect(explainX(FRAMES.outro, { x: 248.4, count: 1600 }, TOL_PX, REMAP_MODELS)).toEqual(['remap']);
    expect(explainX(FRAMES.outro, { x: null, count: 0 }, TOL_PX, REMAP_MODELS)).toEqual(['none']);
    expect(describeLt(FRAMES.intro, { x: 148.1, count: 1600 }, REMAP_MODELS)).toEqual({
      frame: 62, x: 148.1, count: 1600,
      expected: { remap: 148, none: 148 },
      explainedBy: ['remap', 'none'],
    });
  });
});

describe('recommendMechanism (contract rule C27)', () => {
  const ok = (name) => ({ name, pass: true, required: true, detail: '' });
  const bad = (name) => ({ name, pass: false, required: true, detail: '' });
  const RDT = [
    'RDT fit: a time stretch makes the instance last 15 s from 2 s',
    'RDT stretch: intro keeps its speed (PROBE_SQ x~148 at 0.48 s into the instance)',
    'RDT stretch: outro keeps its speed (PROBE_SQ x~248 at 14.48 s into the instance)',
  ];
  const REMAP = [
    'remap: time remap on (AE adds its own keys)',
    'remap: Essential Properties written before time remap still read back',
    'time remap: intro keeps its speed (PROBE_SQ x~148 at 0.48 s into the instance)',
    'time remap: outro keeps its speed (PROBE_SQ x~248 at 14.48 s into the instance)',
  ];
  // Checks of other kinds never decide the mechanism.
  const OTHER = [
    ok('import of the template .aep returns a FolderItem'),
    bad('trim-out (info): moving the out point alone gives an RDT fit'),
    bad('linear: colour patch dE2000 <= 2 vs #26D07C (linearized sRGB project)'),
  ];

  it('prefers rdt when every RDT check passes, whatever time remap did', () => {
    expect(recommendMechanism([...OTHER, ...RDT.map(ok), ...REMAP.map(bad)]).mechanism).toBe('rdt');
  });
  it('falls back to remap when RDT fails and every time-remap check passes', () => {
    const r = recommendMechanism([...OTHER, ok(RDT[0]), ok(RDT[1]), bad(RDT[2]), ...REMAP.map(ok)]);
    expect(r.mechanism).toBe('remap');
    expect(r.mechanismReason).toContain(RDT[2]);
  });
  it('says trim-only when both were measured and both failed', () => {
    const r = recommendMechanism([...OTHER, ...RDT.map(bad), ok(REMAP[0]), bad(REMAP[1]), ok(REMAP[2]), ok(REMAP[3])]);
    expect(r.mechanism).toBe('trim-only');
    expect(r.mechanismReason).toContain(REMAP[1]);
  });
  it('gives no mechanism when the run stopped before the frames', () => {
    expect(recommendMechanism([...OTHER, ok(RDT[0])])).toEqual({
      mechanism: null, mechanismReason: 'not measured: the run stopped before the RDT frames',
    });
    expect(recommendMechanism([...OTHER, ...RDT.map(bad), ok(REMAP[0])])).toEqual({
      mechanism: null, mechanismReason: 'not measured: the run stopped before the time-remap frames',
    });
  });
});

describe('helpers', () => {
  it('describes a measurement for the record', () => {
    expect(describeLt(FRAMES.outro, { x: 248.2, count: 1600 })).toEqual({
      frame: 412, x: 248.2, count: 1600,
      expected: { rdt: 248, uniform: 265.33, none: null },
      explainedBy: ['rdt'],
    });
  });
  it('compares a centroid with a tolerance', () => {
    expect(nearX({ x: 149.9, count: 1600 }, 148)).toBe(true);
    expect(nearX({ x: 151, count: 1600 }, 148)).toBe(false);
    expect(nearX({ x: null, count: 0 }, 148)).toBe(false);
    expect(nearX({ x: 148, count: 1600 }, null)).toBe(false);
  });
  it('rounds for the record', () => {
    expect(round(265.33333, 2)).toBe(265.33);
    expect(round(null, 2)).toBeNull();
  });
});
```

- [ ] **Step 3: Убедиться, что тест падает**

Run: `npx vitest run tests/spikes/s3-analyze.test.mjs`
Expected: FAIL — `Error: Cannot find module '../../spikes/s3-instance/analyze.mjs'`.

- [ ] **Step 4: Создать `spikes/s3-instance/analyze.mjs`**

```js
// S3 analysis: where PROBE_SQ must be under each duration-fitting model, the frame plan, and the
// duration-fit mechanism for contract rule C27 (recommendMechanism).
// Pure functions (no host, no files), unit-tested in tests/spikes/s3-analyze.test.mjs.

export const FPS = 25;
export const TOL_PX = 2.5;

// CRT_LowerThird_v1 (fixture contract, part B): 10 s, protected regions 0-1 s and 9-10 s.
// The user instance starts at 2 s and must last 15 s.
export const LT = { start: 2, compDur: 10, intro: 1, outro: 1, target: 15 };
// PROBE_SQ x keys, linear: 0 s 100, 1 s 200, 9 s 200, 10 s 300.
export const LT_KEYS = [[0, 100], [1, 200], [9, 200], [10, 300]];

// Whole frames sampled in the user comps (25 fps).
export const FRAMES = {
  hold: 200, // 8.00 s: middle of the instance, before and after the field writes
  intro: 62, // 2.48 s = 0.48 s into the instance
  outro: 412, // 16.48 s = 14.48 s into the instance, 0.52 s before its end at 17 s
  hatchHold: 262, // 10.48 s: Hatch instance with Duration 12, before its outro
  hatchOut: 287, // 11.48 s: inside the Hatch outro
};

// Measuring regions in 1920x1080 comp pixels (fixture positions; layer anchors at their centres).
export const REGIONS = {
  patch: { x: 1795, y: 75, w: 50, h: 50 }, // QA_PATCH 100x100 at (1820, 100)
  slot: { x: 1450, y: 490, w: 100, h: 100 }, // SLOT_PHOTO 400x400 at (1500, 540)
  role: { x: 190, y: 830, w: 360, h: 60 }, // TXT_ROLE, 40 px, baseline at (200, 870)
};

export const COLORS = {
  probe: '#FF00FF',
  qa: '#26D07C',
  slotA: '#0063FF',
  slotB: '#FF4517',
  plateDark: '#222222',
  plateLight: '#F2F2F2',
  white: '#FFFFFF',
};

// What the host may do to a stretched instance (explainX, describeLt).
export const MODELS = ['rdt', 'uniform', 'none'];
// A time-remapped instance: the keys took effect (remap) or time remap changed nothing (none).
export const REMAP_MODELS = ['remap', 'none'];

export const frameTime = (frame, fps = FPS) => frame / fps;

export const round = (v, digits = 2) => (v === null || v === undefined ? null : Number(v.toFixed(digits)));

// Piecewise-linear value of keys [[t, v], ...] at time t, held before the first and after the last key.
export function xAtTime(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i += 1) {
    const [t0, v0] = keys[i - 1];
    const [t1, v1] = keys[i];
    if (t <= t1) return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
  }
  return keys[keys.length - 1][1];
}

// Time-remap keys [layer time, template time] that make an unstretched instance layerDur seconds long:
// intro and outro at template speed, the middle stretched. For LT at 15 s: 0->0, 1->1, 14->9, 15->10.
export function remapKeys({ compDur, intro, outro, layerDur }) {
  return [[0, 0], [intro, intro], [layerDur - outro, compDur - outro], [layerDur, compDur]];
}

// Layer-local time -> time inside the template comp.
//   rdt     - protected intro and outro keep their speed, the middle absorbs the stretch;
//   remap   - linear time-remap keys (remapKeys) on an unstretched layer: the rdt mapping, held
//             outside the keys as AE holds a remapped layer;
//   uniform - a plain time stretch of the whole comp;
//   none    - no stretch (a trimmed or extended out point).
export function masterTime(local, model, { compDur, intro, outro, layerDur }) {
  if (model === 'none') return local;
  if (model === 'uniform') return (local * compDur) / layerDur;
  if (model === 'rdt') {
    if (local <= intro) return local;
    if (local >= layerDur - outro) return compDur - (layerDur - local);
    return intro + ((local - intro) * (compDur - intro - outro)) / (layerDur - intro - outro);
  }
  if (model === 'remap') return xAtTime(remapKeys({ compDur, intro, outro, layerDur }), local);
  throw new Error('unknown model: ' + model);
}

// Expected PROBE_SQ x in the user comp at `frame`, or null when the instance shows nothing there.
export function expectedLtX(frame, model, lt = LT) {
  const local = frameTime(frame) - lt.start;
  const layerDur = model === 'none' ? lt.compDur : lt.target;
  if (local < 0 || local >= layerDur) return null;
  return xAtTime(LT_KEYS, masterTime(local, model, { ...lt, layerDur }));
}

export function nearX(measured, expected, tol = TOL_PX) {
  return measured.count > 0 && expected !== null && Math.abs(measured.x - expected) <= tol;
}

// Models that explain a measured centroid ({x, count}); count 0 = PROBE_SQ is not in the frame.
export function explainX(frame, measured, tol = TOL_PX, models = MODELS) {
  return models.filter((m) => {
    const e = expectedLtX(frame, m);
    return e === null ? measured.count === 0 : nearX(measured, e, tol);
  });
}

// CRT_Hatch_v1 PROBE_SQ: x = 100 until d - 1, then linear to 200 at d (d = the Duration slider).
export function hatchX(t, d) {
  if (t < d - 1) return 100;
  return xAtTime([[d - 1, 100], [d, 200]], t);
}

// Detail for the record: measured x, expected x per model, models that explain it.
export function describeLt(frame, measured, models = MODELS) {
  const expected = {};
  for (const m of models) expected[m] = round(expectedLtX(frame, m));
  return { frame, x: round(measured.x), count: measured.count, expected, explainedBy: explainX(frame, measured, TOL_PX, models) };
}

// Duration-fit mechanism of an AE instance, from the S3 checks; plan 1 task 30 copies it into contract
// rule C27. rdt is preferred: the template's protected regions stay the single source of timing.
// A mechanism counts as measured once its frame checks exist ('RDT stretch: ', 'time remap: ').
//   rdt       - every 'RDT fit: ' and 'RDT stretch: ' check passed;
//   remap     - else every 'remap: ' and 'time remap: ' check passed;
//   trim-only - else (both measured): only trim templates fit, by a cut out point and Duration;
//   null      - the run stopped before the RDT frames, or before the time-remap frames after RDT failed.
export function recommendMechanism(checks) {
  const pick = (re) => checks.filter((c) => re.test(c.name));
  const failed = (list) => list.filter((c) => !c.pass).map((c) => c.name);
  const notMeasured = (what) => ({
    mechanism: null,
    mechanismReason: `not measured: the run stopped before the ${what} frames`,
  });
  const rdt = pick(/^RDT (fit|stretch): /);
  const remap = pick(/^(time )?remap: /);
  if (!rdt.some((c) => c.name.startsWith('RDT stretch: '))) return notMeasured('RDT');
  if (!failed(rdt).length) {
    return {
      mechanism: 'rdt',
      mechanismReason: 'a time stretch of the instance keeps the protected intro and outro at template speed',
    };
  }
  if (!remap.some((c) => c.name.startsWith('time remap: '))) return notMeasured('time-remap');
  if (!failed(remap).length) {
    return {
      mechanism: 'remap',
      mechanismReason: 'time-remap keys keep the intro and outro at template speed; RDT failed: ' + failed(rdt).join('; '),
    };
  }
  return {
    mechanism: 'trim-only',
    mechanismReason: 'neither RDT nor time remap keeps the intro and outro at template speed; failed: '
      + failed(rdt).concat(failed(remap)).join('; '),
  };
}
```

- [ ] **Step 5: Запустить тест**

Run: `npx vitest run tests/spikes/s3-analyze.test.mjs`
Expected: `17 passed`.

- [ ] **Step 6: Создать `spikes/s3-instance/lib.jsx` (общие функции проб)**

Склеивается после `PARAMS` и `check.jsx` перед каждой пробой. Свойства Essential Graphics ищутся по нашим русским именам из S1 — это не локализованные имена интерфейса AE. Эффекты и группы — по match name.

```js
// S3 helpers (ES3). Concatenated after PARAMS and spikes/lib/check.jsx, before each S3 probe.
// Every probe defines a global DATA object and ends with finish(DATA).

function s3Round(v) {
  return Math.round(v * 1000) / 1000;
}

function s3Near(a, b) {
  return Math.abs(a - b) < 0.001;
}

// Paths compared with forward slashes, case-insensitively (NTFS and APFS ignore case by default).
function s3Norm(p) {
  return String(p).replace(/\\/g, '/').toLowerCase();
}

// Records why a probe stopped early; run.mjs stops the whole run when DATA.stopped is set.
function s3Stop(reason) {
  DATA.stopped = reason;
}

// Items under `folder` (recursive) named `name` (null = any name) for which test(item) is true.
// https://ae-scripting.docsforadobe.dev/item/folderitem/
function s3FindItems(folder, name, test) {
  var out = [];
  var stack = [folder];
  var f, it, i;
  while (stack.length) {
    f = stack.pop();
    for (i = 1; i <= f.numItems; i++) {
      it = f.item(i);
      if (it instanceof FolderItem) {
        stack.push(it);
      }
      if ((name === null || it.name === name) && test(it)) {
        out.push(it);
      }
    }
  }
  return out;
}

function s3IsComp(it) {
  return it instanceof CompItem;
}

// Footage backed by a file; solids and placeholders have file === null.
// https://ae-scripting.docsforadobe.dev/item/footageitem/
function s3IsFileFootage(it) {
  return (it instanceof FootageItem) && it.file !== null;
}

// PropertyValueType enum -> its name (https://ae-scripting.docsforadobe.dev/property/property/).
function s3ValueTypeName(t) {
  var names = ['NO_VALUE', 'ThreeD_SPATIAL', 'ThreeD', 'TwoD_SPATIAL', 'TwoD', 'OneD', 'COLOR',
    'CUSTOM_VALUE', 'MARKER', 'LAYER_INDEX', 'MASK_INDEX', 'SHAPE', 'TEXT_DOCUMENT'];
  var i;
  for (i = 0; i < names.length; i++) {
    if (PropertyValueType[names[i]] === t) {
      return names[i];
    }
  }
  return String(t);
}

// The instance's Essential Properties group. layer.essentialProperty is used by the docs example
// for Property.essentialPropertySource (https://ae-scripting.docsforadobe.dev/property/property/);
// the group's match name ADBE Layer Overrides is listed in
// https://ae-scripting.docsforadobe.dev/matchnames/layer/avlayer/
function s3EpGroup(layer) {
  var g = null;
  try {
    g = layer.essentialProperty;
  } catch (e) {
    g = null;
  }
  if (g === undefined || g === null) {
    try {
      g = layer.property('ADBE Layer Overrides');
    } catch (e2) {
      g = null;
    }
  }
  return g;
}

// Depth-first search by display name. These names come from S1 (our Russian EGP names),
// not from AE's localized UI, so a name lookup is safe here.
function s3FindEp(group, name) {
  var i, p, q;
  for (i = 1; i <= group.numProperties; i++) {
    p = group.property(i);
    if (p.name === name) {
      return p;
    }
    if (p.propertyType !== PropertyType.PROPERTY) {
      q = s3FindEp(p, name);
      if (q) {
        return q;
      }
    }
  }
  return null;
}

// The template property behind an Essential Property (Property.essentialPropertySource, AE 22.0+):
// a Property, an AVLayer (media replacement) or null.
function s3EpSource(p) {
  var src = p.essentialPropertySource;
  var layer;
  if (src === null || src === undefined) {
    return { kind: 'none' };
  }
  if (src instanceof AVLayer) {
    return { kind: 'layer', layer: src.name };
  }
  layer = src.propertyGroup(src.propertyDepth);
  return {
    kind: 'property',
    matchName: src.matchName,
    group: src.parentProperty ? src.parentProperty.name : '',
    layer: layer ? layer.name : ''
  };
}

// One row per Essential Property: index path, name, value type, media replacement, source.
// This is what library.json needs for egpName / egpIndex (spec §4.4).
function s3ListEp(group, prefix, out) {
  var i, p, row;
  for (i = 1; i <= group.numProperties; i++) {
    p = group.property(i);
    row = { path: prefix + i, name: p.name, matchName: p.matchName, type: 'GROUP', media: false, source: null };
    if (p.propertyType === PropertyType.PROPERTY) {
      row.type = s3ValueTypeName(p.propertyValueType);
      try {
        row.media = p.canSetAlternateSource === true;
      } catch (e1) {
        row.media = 'EXC: ' + String(e1);
      }
      try {
        row.source = s3EpSource(p);
      } catch (e2) {
        row.source = 'EXC: ' + String(e2);
      }
      out.push(row);
    } else {
      out.push(row);
      s3ListEp(p, prefix + i + '.', out);
    }
  }
  return out;
}

// Writes a Source Text Essential Property and reads it back (AE 25.2+ reads overrides correctly).
// Undo groups nest (https://ae-scripting.docsforadobe.dev/general/application/), so the helper
// keeps its own group even when the probe already opened one. The check is required unless
// `required` is false (the time-remap probe writes its fields as information).
function s3WriteText(group, key, text, label, required) {
  return check(label, function () {
    var p = s3FindEp(group, PARAMS.egp[key]);
    var doc, back;
    if (!p) {
      return { pass: false, detail: 'no Essential Property named ' + PARAMS.egp[key] };
    }
    app.beginUndoGroup('BK S3 text field');
    try {
      doc = p.value;
      doc.text = text;
      p.setValue(doc);
    } finally {
      app.endUndoGroup();
    }
    back = p.value.text;
    return { pass: back === text, detail: { back: back } };
  }, required !== false);
}

// Writes a checkbox, slider or dropdown Essential Property and reads it back; `required` as in s3WriteText.
function s3WriteNumber(group, key, v, label, required) {
  return check(label, function () {
    var p = s3FindEp(group, PARAMS.egp[key]);
    var before, back;
    if (!p) {
      return { pass: false, detail: 'no Essential Property named ' + PARAMS.egp[key] };
    }
    before = p.value;
    app.beginUndoGroup('BK S3 field');
    try {
      p.setValue(v);
    } finally {
      app.endUndoGroup();
    }
    back = p.value;
    return {
      pass: Number(back) === Number(v),
      detail: { before: Number(before), back: Number(back), type: s3ValueTypeName(p.propertyValueType) }
    };
  }, required !== false);
}

// One whole frame of `comp` into `path`. CompItem.saveFrameToPng is not in the docsforadobe guide;
// it is live-verified on AE 26.x (ae-quirks #27, #34, #40, #50, #93): it honours resolutionFactor
// and returns before the file is on disk, so Node waits for a complete PNG (read-png.mjs waitForPng).
// Probes end with their renders: nothing in the comp changes until Node has the files.
function s3SaveFrame(comp, frame, path) {
  comp.resolutionFactor = [1, 1];
  comp.saveFrameToPng(frame * comp.frameDuration, new File(path));
  return path;
}

// Saves the project (to `path` when given) with dialogs suppressed; returns the saved path.
// https://ae-scripting.docsforadobe.dev/general/project/ (save with a File does not prompt)
function s3Save(path) {
  app.beginSuppressDialogs();
  try {
    if (path) {
      app.project.save(new File(path));
    } else {
      app.project.save();
    }
  } finally {
    app.endSuppressDialogs(false);
  }
  return app.project.file ? app.project.file.fsName : '';
}

// Project colour settings (https://ae-scripting.docsforadobe.dev/general/project/).
function s3ColorSettings() {
  var p = app.project;
  return {
    workingSpace: String(p.workingSpace),
    linearize: p.linearizeWorkingSpace,
    linearBlending: p.linearBlending,
    bpc: p.bitsPerChannel,
    gamma: p.workingGamma,
    engine: String(p.expressionEngine)
  };
}

// Imports the template .aep as a project (one folder per import).
// https://ae-scripting.docsforadobe.dev/other/importoptions/
function s3ImportTemplate(file) {
  var io = new ImportOptions(new File(file));
  var asProject = io.canImportAs(ImportAsType.PROJECT);
  var item = null;
  if (asProject) {
    io.importAs = ImportAsType.PROJECT;
  }
  app.beginSuppressDialogs();
  try {
    item = app.project.importFile(io);
  } finally {
    app.endSuppressDialogs(false);
  }
  return { item: item, asProject: asProject };
}

// Expression errors in a comp, read before any render: an expression that throws while
// saveFrameToPng renders can raise a blocking modal (ae-quirks #11). Best effort: expressionError
// holds the result of the last evaluation (https://ae-scripting.docsforadobe.dev/property/property/).
var S3_EXPR_GROUPS = ['ADBE Transform Group', 'ADBE Root Vectors Group', 'ADBE Effect Parade',
  'ADBE Text Properties', 'ADBE Mask Parade'];

function s3ExprWalk(group, where, out) {
  var i, p;
  for (i = 1; i <= group.numProperties; i++) {
    p = group.property(i);
    if (!p) {
      continue;
    }
    if (p.propertyType === PropertyType.PROPERTY) {
      try {
        if (p.canSetExpression && p.expressionEnabled && p.expressionError !== '') {
          out.push(where + '/' + p.matchName + ': ' + p.expressionError);
        }
      } catch (e) {
        // a property that cannot carry an expression: nothing to report
      }
    } else {
      s3ExprWalk(p, where, out);
    }
  }
}

function s3ExprErrors(comp) {
  var out = [];
  var i, j, layer, g;
  for (i = 1; i <= comp.numLayers; i++) {
    layer = comp.layer(i);
    for (j = 0; j < S3_EXPR_GROUPS.length; j++) {
      g = layer.property(S3_EXPR_GROUPS[j]);
      if (g) {
        s3ExprWalk(g, comp.name + '/' + layer.name, out);
      }
    }
  }
  return out;
}
```

- [ ] **Step 7: Создать `spikes/s3-instance/probe-1-setup.jsx`**

Новый проект, сохранение по ASCII-пути, `USER_Comp`, импорт шаблона, бин `Cloud.ru BrandKit`, список футажа для копирования, слой на 2 с, кадр «до записи».

```js
// S3 probe 1: a fresh user project saved to an ASCII path, the template .aep imported once into the
// Cloud.ru BrandKit bin, the lower third placed at 2 s, and a baseline frame with template defaults.
var DATA = { stage: 'setup' };

function s3Setup() {
  var userComp = null;
  var imported = null;
  var lt = null;
  var hatch = null;
  var layer = null;

  // https://ae-scripting.docsforadobe.dev/general/project/ (dirty, AE 17.5+)
  if (!check('precondition: the open project has no unsaved changes', function () {
    return { pass: app.project.dirty === false, detail: { dirty: app.project.dirty } };
  }, true)) {
    s3Stop('unsaved project in AE: save or close it by hand, then rerun');
    return;
  }

  // https://ae-scripting.docsforadobe.dev/text/fontsobject/ and /text/fontobject/ (AE 24.0+)
  if (!check('precondition: SB Sans fonts installed, not substituted', function () {
    var rows = [];
    var ok = true;
    var i, list, f, loc, good;
    for (i = 0; i < PARAMS.fonts.length; i++) {
      list = app.fonts.getFontsByPostScriptName(PARAMS.fonts[i]);
      f = list.length ? list[0] : null;
      loc = f ? String(f.location) : '';
      good = f !== null && f.isSubstitute !== true && (loc === '' || /sbsans/i.test(loc));
      if (!good) {
        ok = false;
      }
      rows.push({ ps: PARAMS.fonts[i], found: f !== null, location: loc });
    }
    return { pass: ok, detail: rows };
  }, true)) {
    s3Stop('SB Sans fonts missing: an import would raise a font dialog');
    return;
  }

  // https://ae-scripting.docsforadobe.dev/general/application/ (newProject prompts only when dirty)
  if (!check('new project (app.newProject)', function () {
    var p = app.newProject();
    return { pass: p !== null && app.project.numItems === 0, detail: { numItems: app.project.numItems } };
  }, true)) {
    s3Stop('app.newProject failed');
    return;
  }

  if (!check('user project saved to its ASCII path', function () {
    var saved = s3Save(PARAMS.userProject);
    return { pass: s3Norm(saved) === s3Norm(PARAMS.userProject), detail: saved };
  }, true)) {
    s3Stop('first save failed');
    return;
  }

  check('project colour settings and expression engine read', function () {
    DATA.colorDefault = s3ColorSettings();
    return { pass: true, detail: DATA.colorDefault };
  }, false);

  app.beginUndoGroup('BK S3 setup');
  try {
    // https://ae-scripting.docsforadobe.dev/item/itemcollection/
    if (!check('USER_Comp 1920x1080, 25 fps, 30 s', function () {
      userComp = app.project.items.addComp('USER_Comp', 1920, 1080, 1, 30, 25);
      userComp.resolutionFactor = [1, 1];
      return { pass: s3Near(userComp.frameRate, 25) && s3Near(userComp.duration, 30), detail: { id: userComp.id } };
    }, true)) {
      s3Stop('addComp failed');
      return;
    }
    DATA.userCompId = userComp.id;

    if (!check('saveFrameToPng exists on CompItem (undocumented, ae-quirks #27)', function () {
      return typeof userComp.saveFrameToPng === 'function';
    }, true)) {
      s3Stop('no CompItem.saveFrameToPng in this AE');
      return;
    }

    // Project.importFile returns a FolderItem for an .aep; the docs do not say, so it is measured.
    if (!check('import of the template .aep returns a FolderItem', function () {
      var r = s3ImportTemplate(PARAMS.fixtureEgp);
      imported = r.item;
      return {
        pass: imported instanceof FolderItem,
        detail: {
          asProject: r.asProject,
          typeName: imported ? imported.typeName : null,
          name: imported ? imported.name : null
        }
      };
    }, true)) {
      s3Stop('import failed');
      return;
    }

    if (!check('template comps found exactly once in the imported folder', function () {
      var a = s3FindItems(imported, PARAMS.ltComp, s3IsComp);
      var b = s3FindItems(imported, PARAMS.hatchComp, s3IsComp);
      if (a.length === 1) {
        lt = a[0];
      }
      if (b.length === 1) {
        hatch = b[0];
      }
      return { pass: lt !== null && hatch !== null, detail: { lowerThird: a.length, hatch: b.length } };
    }, true)) {
      s3Stop('template comps not found');
      return;
    }
    DATA.ltCompId = lt.id;
    DATA.hatchCompId = hatch.id;

    // https://ae-scripting.docsforadobe.dev/other/markervalue/ (protectedRegion, AE 16.0+)
    check('lower third has protected regions 0-1 s and 9-10 s', function () {
      var mp = lt.markerProperty;
      var rows = [];
      var okIn = false;
      var okOut = false;
      var k, mv, t;
      for (k = 1; k <= mp.numKeys; k++) {
        mv = mp.keyValue(k);
        t = mp.keyTime(k);
        rows.push({ t: s3Round(t), dur: s3Round(mv.duration), protectedRegion: mv.protectedRegion, comment: mv.comment });
        if (mv.protectedRegion === true && s3Near(t, 0) && s3Near(mv.duration, 1)) {
          okIn = true;
        }
        if (mv.protectedRegion === true && s3Near(t, 9) && s3Near(mv.duration, 1)) {
          okOut = true;
        }
      }
      return { pass: okIn && okOut, detail: rows };
    }, true);

    if (!check('no expression errors in the template comps (read before any render)', function () {
      var errs = s3ExprErrors(lt).concat(s3ExprErrors(hatch));
      return { pass: errs.length === 0, detail: errs };
    }, true)) {
      s3Stop('expression errors in the template');
      return;
    }

    check('no missing or substituted fonts after the import', function () {
      var m = app.fonts.missingOrSubstitutedFonts;
      return { pass: m.length === 0, detail: m.length };
    }, false);

    // Spec §6.1 AE step 3: one import per id@version in the Cloud.ru BrandKit bin, label in the comment.
    check('template folder moved into the Cloud.ru BrandKit bin, id@version in its comment', function () {
      var root = app.project.rootFolder;
      var bin = null;
      var i;
      for (i = 1; i <= root.numItems; i++) {
        if (root.item(i) instanceof FolderItem && root.item(i).name === PARAMS.bin) {
          bin = root.item(i);
        }
      }
      if (bin === null) {
        bin = app.project.items.addFolder(PARAMS.bin);
      }
      imported.parentFolder = bin;
      imported.comment = PARAMS.binComment;
      return {
        pass: imported.parentFolder.id === bin.id && imported.comment === PARAMS.binComment,
        detail: { bin: bin.name, folder: imported.name }
      };
    }, false);

    DATA.footage = [];
    check('template footage listed for copying next to the project', function () {
      var list = s3FindItems(imported, null, s3IsFileFootage);
      var i;
      for (i = 0; i < list.length; i++) {
        DATA.footage.push({ id: list[i].id, name: list[i].name, path: list[i].file.fsName, missing: list[i].footageMissing });
      }
      return { pass: list.length > 0, detail: DATA.footage.length };
    }, true);

    // LayerCollection.add honours "Create Layers at Composition Start Time", so startTime is set
    // explicitly (https://ae-scripting.docsforadobe.dev/layer/layercollection/).
    if (!check('lower third added as a layer at 2 s', function () {
      layer = userComp.layers.add(lt);
      layer.startTime = PARAMS.ltStart;
      return {
        pass: s3Near(layer.inPoint, PARAMS.ltStart) && s3Near(layer.outPoint, PARAMS.ltStart + lt.duration) && layer.stretch === 100,
        detail: { inPt: s3Round(layer.inPoint), outPt: s3Round(layer.outPoint), stretch: layer.stretch }
      };
    }, true)) {
      s3Stop('layers.add failed');
      return;
    }
    DATA.ltLayerId = layer.id;

    check('baseline frame requested (8 s, template defaults)', function () {
      s3SaveFrame(userComp, PARAMS.frames.hold, PARAMS.out.before);
      return true;
    }, true);
  } finally {
    app.endUndoGroup();
  }

  check('setup: user project saved', function () {
    var saved = s3Save(null);
    return { pass: saved !== '' && app.project.dirty === false, detail: saved };
  }, true);
}

s3Setup();
finish(DATA);
```

- [ ] **Step 8: Создать `spikes/s3-instance/probe-2-fields.jsx`**

Запись четырёх полей с чтением назад, слот, перелинковка, растяжение до 15 с, три кадра.

```js
// S3 probe 2: Essential Properties written and read back, media replacement through
// setAlternateSource, template footage relinked to its copy next to the project, the RDT fit by a
// time stretch to 15 s, and three frames for Node to measure.
var DATA = { stage: 'fields' };

function s3Fields() {
  var userComp = null;
  var lt = null;
  var layer = null;
  var ep = null;
  var slotB = null;

  // https://ae-scripting.docsforadobe.dev/general/project/ (itemByID 13.0+, layerByID 22.0+)
  if (!check('instance found by id (itemByID, layerByID)', function () {
    userComp = app.project.itemByID(PARAMS.ids.userCompId);
    lt = app.project.itemByID(PARAMS.ids.ltCompId);
    layer = app.project.layerByID(PARAMS.ids.ltLayerId);
    return {
      pass: (userComp instanceof CompItem) && (lt instanceof CompItem) && (layer instanceof AVLayer),
      detail: { layer: layer ? layer.name : null }
    };
  }, true)) {
    s3Stop('ids from probe 1 not found');
    return;
  }

  if (!check('Essential Properties group on the instance', function () {
    var byMatch = layer.property('ADBE Layer Overrides');
    var viaAttr = null;
    try {
      viaAttr = layer.essentialProperty;
    } catch (e) {
      viaAttr = null;
    }
    ep = s3EpGroup(layer);
    return {
      pass: ep !== null && ep.numProperties > 0,
      detail: {
        count: ep ? ep.numProperties : 0,
        matchName: ep ? ep.matchName : null,
        viaAttribute: viaAttr !== null && viaAttr !== undefined,
        viaMatchName: byMatch !== null && byMatch !== undefined
      }
    };
  }, true)) {
    s3Stop('no Essential Properties on the instance');
    return;
  }

  check('instance exposes every S1 property by its display name', function () {
    var missing = [];
    var k;
    for (k in PARAMS.egp) {
      if (PARAMS.egp.hasOwnProperty(k) && !s3FindEp(ep, PARAMS.egp[k])) {
        missing.push(PARAMS.egp[k]);
      }
    }
    DATA.ep = s3ListEp(ep, '', []);
    return { pass: missing.length === 0, detail: { missing: missing } };
  }, false);

  app.beginUndoGroup('BK S3 fields');
  try {
    s3WriteText(ep, 'name', PARAMS.values.name, 'EP name (text, Cyrillic): written and read back');
    s3WriteNumber(ep, 'showRole', PARAMS.values.showRole, 'EP showRole (checkbox): written and read back');
    s3WriteNumber(ep, 'duration', PARAMS.values.ltDuration, 'EP duration (slider): written and read back');
    s3WriteNumber(ep, 'style', PARAMS.values.style, 'EP style (dropdown): written and read back');

    // https://ae-scripting.docsforadobe.dev/item/avitem/ (isMediaReplacementCompatible)
    check('slot_b.png imported, media-replacement compatible', function () {
      app.beginSuppressDialogs();
      try {
        slotB = app.project.importFile(new ImportOptions(new File(PARAMS.slotB)));
      } finally {
        app.endSuppressDialogs(false);
      }
      return { pass: slotB !== null && slotB.isMediaReplacementCompatible === true, detail: slotB ? slotB.name : null };
    }, true);

    // https://ae-scripting.docsforadobe.dev/property/property/ (canSetAlternateSource,
    // setAlternateSource, alternateSource: AE 18.0+)
    check('EP photo: setAlternateSource(slot_b) and read back', function () {
      var p = s3FindEp(ep, PARAMS.egp.photo);
      var alt;
      if (!p) {
        return { pass: false, detail: 'no Essential Property named ' + PARAMS.egp.photo };
      }
      if (p.canSetAlternateSource !== true) {
        return { pass: false, detail: 'canSetAlternateSource is false' };
      }
      p.setAlternateSource(slotB);
      alt = p.alternateSource;
      // AE 26.5 does not point at slot_b itself: it wraps it into a new comp named "<property>_<file>"
      // (the photo field name + "_slot_b"), the size of the footage, with slot_b as its only layer
      // (seen live 2026-10-02). Accept the item itself or such a wrapper over the same item.
      var wrapped = alt instanceof CompItem && alt.numLayers === 1 && alt.layer(1).source !== null &&
        alt.layer(1).source.id === slotB.id;
      return {
        pass: alt !== null && (alt.id === slotB.id || wrapped),
        detail: { alternate: alt ? alt.name : null, type: alt ? alt.typeName : null,
          sameItem: alt !== null && alt.id === slotB.id, wrapped: wrapped }
      };
    }, true);

    // https://ae-scripting.docsforadobe.dev/item/footageitem/ (replace keeps the interpretation)
    check('template footage relinked into Cloud.ru BrandKit/<id>@<version> (FootageItem.replace)', function () {
      var rows = [];
      var ok = PARAMS.relink.length > 0;
      var i, r, it, now;
      for (i = 0; i < PARAMS.relink.length; i++) {
        r = PARAMS.relink[i];
        it = app.project.itemByID(r.id);
        it.replace(new File(r.target));
        now = it.file ? it.file.fsName : '';
        if (s3Norm(now) !== s3Norm(r.target) || it.footageMissing !== false) {
          ok = false;
        }
        rows.push({ name: it.name, file: now, missing: it.footageMissing });
      }
      return { pass: ok, detail: rows };
    }, true);

    // https://ae-scripting.docsforadobe.dev/layer/layer/ (stretch, in %); the docs do not say
    // how stretch moves in/out points, so they are read back.
    check('RDT fit: a time stretch makes the instance last 15 s from 2 s', function () {
      layer.stretch = PARAMS.ltTarget / lt.duration * 100;
      return {
        pass: s3Near(layer.inPoint, PARAMS.ltStart) && s3Near(layer.outPoint, PARAMS.ltStart + PARAMS.ltTarget),
        detail: { stretch: layer.stretch, startTime: s3Round(layer.startTime), inPt: s3Round(layer.inPoint), outPt: s3Round(layer.outPoint) }
      };
    }, true);

    check('frames requested: intro, outro, hold (after the writes)', function () {
      s3SaveFrame(userComp, PARAMS.frames.intro, PARAMS.out.rdtIntro);
      s3SaveFrame(userComp, PARAMS.frames.outro, PARAMS.out.rdtOutro);
      s3SaveFrame(userComp, PARAMS.frames.hold, PARAMS.out.after);
      return true;
    }, true);
  } finally {
    app.endUndoGroup();
  }

  check('fields: user project saved', function () {
    return s3Save(null) !== '' && app.project.dirty === false;
  }, true);
}

s3Fields();
finish(DATA);
```

- [ ] **Step 9: Создать `spikes/s3-instance/probe-3-trim-out.jsx`**

```js
// S3 probe 3: the same instance fitted by moving its out point instead of a time stretch.
// Information only: records where AE puts the out point and renders the intro and outro frames.
var DATA = { stage: 'trim-out' };

function s3TrimOut() {
  var userComp = null;
  var layer = null;

  if (!check('trim-out: instance found by id', function () {
    userComp = app.project.itemByID(PARAMS.ids.userCompId);
    layer = app.project.layerByID(PARAMS.ids.ltLayerId);
    return (userComp instanceof CompItem) && (layer instanceof AVLayer);
  }, true)) {
    s3Stop('ids from probe 1 not found');
    return;
  }

  app.beginUndoGroup('BK S3 trim out');
  try {
    check('trim-out: stretch back to 100 %', function () {
      layer.stretch = 100;
      return { pass: layer.stretch === 100, detail: { inPt: s3Round(layer.inPoint), outPt: s3Round(layer.outPoint) } };
    }, true);

    check('trim-out: out point set to 17 s (AE may clamp it to the end of the template)', function () {
      layer.outPoint = PARAMS.ltStart + PARAMS.ltTarget;
      DATA.trimOut = { stretch: layer.stretch, inPt: s3Round(layer.inPoint), outPt: s3Round(layer.outPoint) };
      return { pass: s3Near(layer.outPoint, PARAMS.ltStart + PARAMS.ltTarget), detail: DATA.trimOut };
    }, false);

    check('trim-out: frames requested (intro, outro)', function () {
      s3SaveFrame(userComp, PARAMS.frames.intro, PARAMS.out.trimIntro);
      s3SaveFrame(userComp, PARAMS.frames.outro, PARAMS.out.trimOutro);
      return true;
    }, true);
  } finally {
    app.endUndoGroup();
  }

  check('trim-out: user project saved', function () {
    return s3Save(null) !== '';
  }, true);
}

s3TrimOut();
finish(DATA);
```

- [ ] **Step 10: Создать `spikes/s3-instance/probe-4-hatch-trim.jsx`**

```js
// S3 probe 4: the lower third goes back to the RDT fit; then a trim template (no RDT):
// CRT_Hatch_v1 at 0 s in USER_Comp_Trim, cut to 12 s, service Duration written to 12; two frames.
var DATA = { stage: 'trim' };

function s3Trim() {
  var lt = null;
  var hatch = null;
  var layer = null;
  var comp = null;
  var h = null;

  if (!check('trim: template comps and instance found by id', function () {
    lt = app.project.itemByID(PARAMS.ids.ltCompId);
    hatch = app.project.itemByID(PARAMS.ids.hatchCompId);
    layer = app.project.layerByID(PARAMS.ids.ltLayerId);
    return (lt instanceof CompItem) && (hatch instanceof CompItem) && (layer instanceof AVLayer);
  }, true)) {
    s3Stop('ids from probe 1 not found');
    return;
  }

  app.beginUndoGroup('BK S3 trim');
  try {
    // ae-quirks #159: assign startTime, then inPoint, then outPoint.
    check('lower third back to the RDT fit (2-17 s)', function () {
      layer.stretch = 100;
      layer.startTime = PARAMS.ltStart;
      layer.inPoint = PARAMS.ltStart;
      layer.outPoint = PARAMS.ltStart + lt.duration;
      layer.stretch = PARAMS.ltTarget / lt.duration * 100;
      return {
        pass: s3Near(layer.inPoint, PARAMS.ltStart) && s3Near(layer.outPoint, PARAMS.ltStart + PARAMS.ltTarget),
        detail: { stretch: layer.stretch, inPt: s3Round(layer.inPoint), outPt: s3Round(layer.outPoint) }
      };
    }, false);

    if (!check('trim: Hatch added at 0 s in USER_Comp_Trim and cut to 12 s', function () {
      comp = app.project.items.addComp('USER_Comp_Trim', 1920, 1080, 1, 30, 25);
      comp.resolutionFactor = [1, 1];
      h = comp.layers.add(hatch);
      h.startTime = 0;
      h.inPoint = 0;
      h.outPoint = PARAMS.hatchLength;
      return {
        pass: s3Near(h.inPoint, 0) && s3Near(h.outPoint, PARAMS.hatchLength),
        detail: { inPt: s3Round(h.inPoint), outPt: s3Round(h.outPoint), templateDuration: hatch.duration }
      };
    }, true)) {
      s3Stop('Hatch instance failed');
      return;
    }

    s3WriteNumber(s3EpGroup(h), 'duration', PARAMS.values.hatchDuration, 'trim: EP duration = 12 written and read back');

    check('trim: frames requested (10.48 s, 11.48 s)', function () {
      s3SaveFrame(comp, PARAMS.frames.hatchHold, PARAMS.out.hatchHold);
      s3SaveFrame(comp, PARAMS.frames.hatchOut, PARAMS.out.hatchOut);
      return true;
    }, true);
  } finally {
    app.endUndoGroup();
  }

  check('trim: user project saved', function () {
    return s3Save(null) !== '' && app.project.dirty === false;
  }, true);
}

s3Trim();
finish(DATA);
```

- [ ] **Step 11: Создать `spikes/s3-instance/probe-5-linear.jsx`**

```js
// S3 probe 5 (after the manual step that created user_linear.aep): the lower third inserted into
// a project with a linearized sRGB working space; one frame for the colour patch.
var DATA = { stage: 'linear' };

function s3Linear() {
  var comp = null;
  var lt = null;

  if (!check('linear: precondition: the open project has no unsaved changes', function () {
    return { pass: app.project.dirty === false, detail: { dirty: app.project.dirty } };
  }, true)) {
    s3Stop('unsaved project in AE: save or close it by hand, then rerun');
    return;
  }

  // https://ae-scripting.docsforadobe.dev/general/application/ (open prompts only when dirty)
  if (!check('linear: user_linear.aep is the open project', function () {
    var cur = app.project.file ? s3Norm(app.project.file.fsName) : '';
    if (cur !== s3Norm(PARAMS.linearProject) && app.open(new File(PARAMS.linearProject)) === null) {
      return { pass: false, detail: 'app.open returned null' };
    }
    return {
      pass: app.project.file !== null && s3Norm(app.project.file.fsName) === s3Norm(PARAMS.linearProject),
      detail: app.project.file ? app.project.file.fsName : null
    };
  }, true)) {
    s3Stop('user_linear.aep did not open');
    return;
  }

  if (!check('linear: precondition: linearized sRGB working space (set by hand)', function () {
    DATA.color = s3ColorSettings();
    return { pass: DATA.color.linearize === true && /srgb/i.test(DATA.color.workingSpace), detail: DATA.color };
  }, true)) {
    s3Stop('colour settings of user_linear.aep are not the ones from the manual step');
    return;
  }

  app.beginUndoGroup('BK S3 linear');
  try {
    if (!check('linear: template imported, lower third found', function () {
      var r = s3ImportTemplate(PARAMS.fixtureEgp);
      var a = (r.item instanceof FolderItem) ? s3FindItems(r.item, PARAMS.ltComp, s3IsComp) : [];
      if (a.length === 1) {
        lt = a[0];
      }
      return { pass: lt !== null, detail: { folder: r.item instanceof FolderItem, found: a.length } };
    }, true)) {
      s3Stop('import failed');
      return;
    }

    if (!check('linear: no expression errors in the template (read before the render)', function () {
      var errs = s3ExprErrors(lt);
      return { pass: errs.length === 0, detail: errs };
    }, true)) {
      s3Stop('expression errors in the template');
      return;
    }

    if (!check('linear: lower third added at 2 s in USER_Comp', function () {
      var l;
      comp = app.project.items.addComp('USER_Comp', 1920, 1080, 1, 30, 25);
      comp.resolutionFactor = [1, 1];
      l = comp.layers.add(lt);
      l.startTime = PARAMS.ltStart;
      return { pass: s3Near(l.inPoint, PARAMS.ltStart), detail: { inPt: s3Round(l.inPoint) } };
    }, true)) {
      s3Stop('layers.add failed');
      return;
    }

    check('linear: frame requested (8 s)', function () {
      s3SaveFrame(comp, PARAMS.frames.hold, PARAMS.out.linear);
      return true;
    }, true);
  } finally {
    app.endUndoGroup();
  }

  check('linear: project saved', function () {
    return s3Save(null) !== '';
  }, true);
}

s3Linear();
finish(DATA);
```

- [ ] **Step 12: Создать `spikes/s3-instance/probe-6-remap.jsx`**

Time remap — второй путь подгонки длины из §3.1. Проба идёт в основном прогоне после пробы 4:
- свежий экземпляр `CRT_LowerThird_v1` встаёт с 2 с в новую композицию `USER_Comp_Remap` (1920×1080, 25 fps, 30 с), как в пробе 1;
- до включения time remap пишутся «Имя» и «Показать должность»;
- `timeRemapEnabled = true`; ключи, которые AE ставит при включении, записываются в `DATA.remapAdded` и снимаются;
- out point — 17 с, растяжение остаётся 100 %;
- ключи из `PARAMS.remapKeys` (0→0, 1→1, 14→9, 15→10 с), линейные. `setValueAtTime` принимает время композиции, поэтому к времени слоя прибавляется `startTime`;
- после включения time remap оба поля читаются назад, затем запрашиваются кадры 62 и 412.

Проверки самого time remap информационные: механизм длины выбирает `recommendMechanism`, а не итог S3.

```js
// S3 probe 6: the time-remap fit (spec §3.1 S3: Responsive Time or time remap). A fresh lower third goes
// in at 2 s in its own comp USER_Comp_Remap: USER_Comp holds the stretched instance, whose PROBE_SQ would
// share the frames. Two fields are written, time remap is switched on, the keys AE adds are removed, the
// layer is made 15 s long and keyed with PARAMS.remapKeys; the fields are read back and two frames requested.
var DATA = { stage: 'remap' };

function s3Remap() {
  var lt = null;
  var comp = null;
  var layer = null;

  if (!check('remap: template comp found by id', function () {
    lt = app.project.itemByID(PARAMS.ids.ltCompId);
    return lt instanceof CompItem;
  }, true)) {
    s3Stop('ids from probe 1 not found');
    return;
  }

  app.beginUndoGroup('BK S3 remap');
  try {
    if (!check('remap: fresh lower third added at 2 s in USER_Comp_Remap', function () {
      comp = app.project.items.addComp('USER_Comp_Remap', 1920, 1080, 1, 30, 25);
      comp.resolutionFactor = [1, 1];
      layer = comp.layers.add(lt);
      layer.startTime = PARAMS.ltStart;
      return {
        pass: s3Near(layer.inPoint, PARAMS.ltStart) && layer.stretch === 100,
        detail: { inPt: s3Round(layer.inPoint), outPt: s3Round(layer.outPoint), stretch: layer.stretch }
      };
    }, true)) {
      s3Stop('remap instance failed');
      return;
    }

    s3WriteText(s3EpGroup(layer), 'name', PARAMS.values.name,
      'remap: EP name (text) written before time remap', false);
    s3WriteNumber(s3EpGroup(layer), 'showRole', PARAMS.values.showRole,
      'remap: EP showRole (checkbox) written before time remap', false);

    // https://ae-scripting.docsforadobe.dev/layer/avlayer/ (canSetTimeRemapEnabled, timeRemapEnabled) and
    // /matchnames/layer/avlayer/ (ADBE Time Remapping). AE keys the property when time remap is switched on;
    // the docs do not say where, so the keys are recorded. They are NOT removed here: removing every
    // time-remap key switches time remap off again (seen live on AE 26.5, 2026-10-02).
    check('remap: time remap on (AE adds its own keys)', function () {
      var tr, k;
      if (layer.canSetTimeRemapEnabled !== true) {
        return { pass: false, detail: 'canSetTimeRemapEnabled is false' };
      }
      layer.timeRemapEnabled = true;
      tr = layer.property('ADBE Time Remapping');
      DATA.remapAdded = [];
      for (k = 1; k <= tr.numKeys; k++) {
        DATA.remapAdded.push([s3Round(tr.keyTime(k)), s3Round(tr.keyValue(k))]);
      }
      return { pass: layer.timeRemapEnabled === true, detail: { added: DATA.remapAdded } };
    }, false);

    // With time remap on, the layer may run past the end of its source.
    check('remap: out point at 17 s (a 15 s instance, no stretch)', function () {
      layer.outPoint = PARAMS.ltStart + PARAMS.ltTarget;
      return {
        pass: s3Near(layer.outPoint, PARAMS.ltStart + PARAMS.ltTarget) && layer.stretch === 100,
        detail: { inPt: s3Round(layer.inPoint), outPt: s3Round(layer.outPoint), stretch: layer.stretch }
      };
    }, false);

    // setValueAtTime takes comp time, so layer time + startTime; linear keys keep the intro and the outro
    // at template speed (https://ae-scripting.docsforadobe.dev/property/property/). Our keys go in first,
    // then every other key (AE's own) is removed, so time remap never runs out of keys.
    check('remap: keys 0->0, 1->1, 14->9, 15->10 s (layer time -> template time), linear', function () {
      var tr = layer.property('ADBE Time Remapping');
      var rows = [];
      var ok, i, k, key, t, mine;
      if (layer.timeRemapEnabled !== true) {
        return { pass: false, detail: 'time remap is off' };
      }
      for (i = 0; i < PARAMS.remapKeys.length; i++) {
        key = PARAMS.remapKeys[i];
        tr.setValueAtTime(layer.startTime + key[0], key[1]);
      }
      for (k = tr.numKeys; k >= 1; k--) {
        t = tr.keyTime(k) - layer.startTime;
        mine = false;
        for (i = 0; i < PARAMS.remapKeys.length; i++) {
          if (s3Near(t, PARAMS.remapKeys[i][0])) {
            mine = true;
          }
        }
        if (!mine) {
          tr.removeKey(k);
        }
      }
      for (k = 1; k <= tr.numKeys; k++) {
        tr.setInterpolationTypeAtKey(k, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
        rows.push([s3Round(tr.keyTime(k) - layer.startTime), s3Round(tr.keyValue(k))]);
      }
      ok = rows.length === PARAMS.remapKeys.length;
      for (i = 0; ok && i < rows.length; i++) {
        ok = s3Near(rows[i][0], PARAMS.remapKeys[i][0]) && s3Near(rows[i][1], PARAMS.remapKeys[i][1]);
      }
      return {
        pass: ok,
        detail: {
          keys: rows,
          atIntroFrame: s3Round(tr.valueAtTime(PARAMS.frames.intro * comp.frameDuration, false)),
          atOutroFrame: s3Round(tr.valueAtTime(PARAMS.frames.outro * comp.frameDuration, false))
        }
      };
    }, false);

    // Switching time remap on adds a property to the layer, which can invalidate property objects taken
    // before it, so the Essential Properties group is looked up again.
    check('remap: Essential Properties written before time remap still read back', function () {
      var ep = s3EpGroup(layer);
      var name = s3FindEp(ep, PARAMS.egp.name);
      var showRole = s3FindEp(ep, PARAMS.egp.showRole);
      var back = { name: name ? name.value.text : null, showRole: showRole ? Number(showRole.value) : null };
      return {
        pass: back.name === PARAMS.values.name && back.showRole === Number(PARAMS.values.showRole),
        detail: back
      };
    }, false);

    check('remap: frames requested (intro, outro)', function () {
      s3SaveFrame(comp, PARAMS.frames.intro, PARAMS.out.remapIntro);
      s3SaveFrame(comp, PARAMS.frames.outro, PARAMS.out.remapOutro);
      return true;
    }, true);
  } finally {
    app.endUndoGroup();
  }

  check('remap: user project saved', function () {
    return s3Save(null) !== '' && app.project.dirty === false;
  }, true);
}

s3Remap();
finish(DATA);
```

- [ ] **Step 13: Прогнать ES3-линтер по JSX**

Run: `node tools/jsx/lint-jsx.cjs spikes/s3-instance/lib.jsx spikes/s3-instance/probe-1-setup.jsx spikes/s3-instance/probe-2-fields.jsx spikes/s3-instance/probe-3-trim-out.jsx spikes/s3-instance/probe-4-hatch-trim.jsx spikes/s3-instance/probe-5-linear.jsx spikes/s3-instance/probe-6-remap.jsx`
Expected: семь строк `OK    spikes/s3-instance/<файл> (1 warning(s))`, код выхода 0. Единственное предупреждение у каждого файла — про последнюю инструкцию: файлы склеиваются, и проба заканчивается `finish(DATA)`.

- [ ] **Step 14: Создать `spikes/s3-instance/run.mjs` и проверить сборку проб без AE**

Имена композиций, подписи Essential Graphics, пути фикстуры и шрифты берутся из контракта фикстуры `spikes/fixtures/contract.mjs` (задача 7), а не пишутся заново. Карта «ключ → подпись» для проб строится из `EGP[COMP_LT]`.

```js
#!/usr/bin/env node
// S3: a template instance in a user's AE project (spec §3.1 S3, §6.1 "After Effects").
//   node spikes/s3-instance/run.mjs            probes 1-4 and 6 (time remap) in a fresh user project;
//                                              frames measured here
//   node spikes/s3-instance/run.mjs --linear   after the manual user_linear.aep step: probe 5, merged in
//   node spikes/s3-instance/run.mjs --check    compose and lint the six probes, no host needed
// Writes spikes/results/S3.json and spikes/results/S3.data.json (Essential Properties map, measurements, and
// the duration-fit mechanism for contract rule C27 as the top-level fields mechanism and mechanismReason).
// Several probes instead of one runSpike call: Node has to copy footage and wait for PNG files between them.
import { existsSync, copyFileSync, rmSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { run, lintOrThrow } from '../../tools/host-run.mjs';
import { composeProbe } from '../../tools/spike/runner.mjs';
import { makeResult, writeResult, RESULTS_DIR } from '../../tools/spike/result.mjs';
import { workPath, ensureDir } from '../../tools/lib/work.mjs';
import { readPng, waitForPng, meanColor, findColorCentroid } from '../../tools/png/read-png.mjs';
import { deltaE2000Rgb, hexToRgb, rgbToHex } from '../../tools/color/deltae.mjs';
import { COMP_LT, COMP_HATCH, EGP, fixturePaths, fixtureParams } from '../fixtures/contract.mjs';
import {
  LT, FRAMES, REGIONS, COLORS, REMAP_MODELS, expectedLtX, explainX, hatchX, nearX, frameTime, round, describeLt,
  remapKeys, recommendMechanism,
} from './analyze.mjs';

const ID = 'S3';
const TITLE = 'Экземпляр шаблона в проекте пользователя';
const FALLBACK = 'Выбрать работающий механизм длительности и записать в контракт §4.2';
const LIB = 'spikes/s3-instance/lib.jsx';
const RESULT_FILE = path.join(RESULTS_DIR, 'S3.json');
const DATA_FILE = path.join(RESULTS_DIR, 'S3.data.json');
const DE_MAX = 2; // spec §4.4: dE2000 <= 2
const HATCH_DEFAULT_DURATION = 10; // CRT_Hatch_v1 CTRL Duration in the fixture

// Essential Graphics display names set by S1, key -> label (fixture contract, part B). The Hatch Duration
// carries the same label as the lower third's (EGP[COMP_HATCH]), so probe 4 uses this map as well.
const EGP_LABELS = Object.fromEntries(EGP[COMP_LT].map((e) => [e.key, e.label]));

const FX = fixturePaths();
const W = {
  fixtureEgp: FX.egpAep,
  slotA: FX.slotA,
  slotB: path.posix.join(FX.mediaDir, 'slot_b.png'),
  userProject: workPath('s3', 'user_s3.aep'),
  linearProject: workPath('s3', 'user_linear.aep'),
  bkDir: workPath('s3', 'Cloud.ru BrandKit', 'CRT_LowerThird@1'),
  frames: workPath('s3', 'frames'),
};

const png = (name) => path.posix.join(W.frames, name);
const OUT = {
  before: png('lt_before_f200.png'),
  after: png('lt_after_f200.png'),
  rdtIntro: png('lt_rdt_f062.png'),
  rdtOutro: png('lt_rdt_f412.png'),
  trimIntro: png('lt_trimout_f062.png'),
  trimOutro: png('lt_trimout_f412.png'),
  hatchHold: png('hatch_f262.png'),
  hatchOut: png('hatch_f287.png'),
  remapIntro: png('lt_remap_f062.png'),
  remapOutro: png('lt_remap_f412.png'),
  linear: png('lt_linear_f200.png'),
};

const PARAMS = {
  userProject: W.userProject,
  linearProject: W.linearProject,
  fixtureEgp: W.fixtureEgp,
  slotB: W.slotB,
  fonts: Object.values(fixtureParams().fonts),
  ltComp: COMP_LT,
  hatchComp: COMP_HATCH,
  bin: 'Cloud.ru BrandKit',
  binComment: 'CRT_LowerThird@1',
  ltStart: LT.start,
  ltTarget: LT.target,
  hatchLength: 12,
  egp: EGP_LABELS,
  values: { name: 'Анна-Мария Ёлкина', showRole: 0, ltDuration: LT.target, style: 2, hatchDuration: 12 },
  // Probe 6: [layer time, template time] keys of the 15 s time-remapped instance (0->0, 1->1, 14->9, 15->10).
  remapKeys: remapKeys({ ...LT, layerDur: LT.target }),
  frames: FRAMES,
  out: OUT,
};

const checks = [];
const data = {};
let hostVersion = null;
const images = new Map();

const add = (name, pass, detail, required = true) => {
  checks.push({ name, pass: Boolean(pass), required, detail });
};

async function probe(file, params) {
  const jsx = composeProbe([LIB, 'spikes/s3-instance/' + file], params);
  const r = await run('ae', jsx, { timeoutMs: 300000 });
  if (!r || !Array.isArray(r.checks)) {
    throw new Error(file + ': the probe must return finish({...}); got ' + JSON.stringify(r).slice(0, 300));
  }
  checks.push(...r.checks);
  if (r.data && r.data.hostVersion) hostVersion = r.data.hostVersion;
  return r.data || {};
}

// saveFrameToPng returns before the files exist (ae-quirks #27, #40, #50): wait, then check the size.
async function frames(...files) {
  try {
    for (const f of files) await waitForPng(f, { timeoutMs: 180000 });
  } catch (e) {
    add('frames written to disk', false, e.message);
    return false;
  }
  const sizes = files.map((f) => {
    const img = readPng(f);
    images.set(f, img);
    return { file: path.posix.basename(f), w: img.width, h: img.height };
  });
  add('frames at full resolution 1920x1080: ' + sizes.map((s) => s.file).join(', '),
    sizes.every((s) => s.w === 1920 && s.h === 1080), sizes);
  return sizes.every((s) => s.w === 1920 && s.h === 1080);
}

const img = (f) => images.get(f);
const probeSq = (f) => findColorCentroid(img(f), COLORS.probe, 10);
const dE = (mean, hex) => deltaE2000Rgb(mean, hexToRgb(hex));

function analyseRdt() {
  const intro = probeSq(OUT.rdtIntro);
  const outro = probeSq(OUT.rdtOutro);
  data.rdt = { intro: describeLt(FRAMES.intro, intro), outro: describeLt(FRAMES.outro, outro) };
  add('RDT stretch: intro keeps its speed (PROBE_SQ x~148 at 0.48 s into the instance)',
    nearX(intro, expectedLtX(FRAMES.intro, 'rdt')), data.rdt.intro);
  add('RDT stretch: outro keeps its speed (PROBE_SQ x~248 at 14.48 s into the instance)',
    nearX(outro, expectedLtX(FRAMES.outro, 'rdt')), data.rdt.outro);
}

function analyseFields(color) {
  const before = img(OUT.before);
  const after = img(OUT.after);
  const patch = meanColor(after, REGIONS.patch);
  const dPatch = dE(patch, COLORS.qa);
  data.patchDefault = { r: patch.r, g: patch.g, b: patch.b };
  add('colour patch dE2000 <= 2 vs #26D07C in the user project', dPatch <= DE_MAX,
    { mean: rgbToHex(patch), alpha: round(patch.a, 1), dE: round(dPatch, 3), color });

  // Render-side confirmation of the writes. Optional: positions come from the part B fixture.
  const darkBefore = findColorCentroid(before, COLORS.plateDark, 6);
  const lightAfter = findColorCentroid(after, COLORS.plateLight, 6);
  add('render: style 2 turns the name plate light', darkBefore.count >= 1000 && lightAfter.count >= 1000,
    { darkBefore: darkBefore.count, lightAfter: lightAfter.count }, false);
  add('render: the longer name widens the plate (sourceRectAtTime sees the override)',
    Boolean(darkBefore.box && lightAfter.box) && lightAfter.box.w - darkBefore.box.w >= 40,
    { before: darkBefore.box, after: lightAfter.box }, false);
  const roleBefore = findColorCentroid(before, COLORS.white, 4, { region: REGIONS.role }).count;
  const roleAfter = findColorCentroid(after, COLORS.white, 4, { region: REGIONS.role }).count;
  add('render: showRole 0 hides the role line', roleBefore >= 50 && roleAfter === 0, { roleBefore, roleAfter }, false);
  const slotBefore = meanColor(before, REGIONS.slot);
  const slotAfter = meanColor(after, REGIONS.slot);
  const dA = dE(slotBefore, COLORS.slotA);
  const dB = dE(slotAfter, COLORS.slotB);
  add('render: the photo slot shows slot_b after setAlternateSource', dA <= DE_MAX && dB <= DE_MAX,
    { before: rgbToHex(slotBefore), dEslotA: round(dA, 3), after: rgbToHex(slotAfter), dEslotB: round(dB, 3) }, false);
}

function analyseTrimOut(layer) {
  const intro = probeSq(OUT.trimIntro);
  const outro = probeSq(OUT.trimOutro);
  data.trimOutFrames = { intro: describeLt(FRAMES.intro, intro), outro: describeLt(FRAMES.outro, outro) };
  add('trim-out (info): moving the out point alone gives an RDT fit',
    explainX(FRAMES.intro, intro).includes('rdt') && explainX(FRAMES.outro, outro).includes('rdt'),
    { layer: layer || null, ...data.trimOutFrames }, false);
}

function analyseHatch() {
  const d = PARAMS.values.hatchDuration;
  const rows = [
    [FRAMES.hatchHold, OUT.hatchHold, 'trim: hold until Duration - 1 (PROBE_SQ x~100 at 10.48 s)'],
    [FRAMES.hatchOut, OUT.hatchOut, 'trim: the outro follows Duration (PROBE_SQ x~148 at 11.48 s)'],
  ];
  data.trimFrames = [];
  for (const [frame, file, name] of rows) {
    const m = probeSq(file);
    const t = frameTime(frame);
    const detail = { frame, x: round(m.x), count: m.count, expected: round(hatchX(t, d)), ifDurationIgnored: round(hatchX(t, HATCH_DEFAULT_DURATION)) };
    data.trimFrames.push(detail);
    add(name, nearX(m, hatchX(t, d)), detail);
  }
}

// Time remap on the fresh instance in USER_Comp_Remap: the keys must give the rdt mapping.
// Information only; the mechanism for contract rule C27 comes from recommendMechanism.
function analyseRemap() {
  const intro = probeSq(OUT.remapIntro);
  const outro = probeSq(OUT.remapOutro);
  data.remapFrames = {
    intro: describeLt(FRAMES.intro, intro, REMAP_MODELS),
    outro: describeLt(FRAMES.outro, outro, REMAP_MODELS),
  };
  add('time remap: intro keeps its speed (PROBE_SQ x~148 at 0.48 s into the instance)',
    nearX(intro, expectedLtX(FRAMES.intro, 'remap')), data.remapFrames.intro, false);
  add('time remap: outro keeps its speed (PROBE_SQ x~248 at 14.48 s into the instance)',
    nearX(outro, expectedLtX(FRAMES.outro, 'remap')), data.remapFrames.outro, false);
}

function save(notes) {
  const result = makeResult({
    id: ID, title: TITLE, host: 'ae', hostVersion, checks, fallback: FALLBACK, notes,
    evidence: ['spikes/results/S3.data.json', ...Object.values(OUT).filter((f) => existsSync(f))],
  });
  const file = writeResult(result);
  // Plan 1 task 30 copies data.mechanism into contract rule C27.
  Object.assign(data, recommendMechanism(checks));
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
  const passed = checks.filter((c) => c.pass).length;
  console.log(`${ID}: ${result.verdict} (${passed}/${checks.length}) -> ${file}`);
  console.log(`${ID} mechanism: ${data.mechanism} (${data.mechanismReason})`);
}

function stop(reason) {
  save('stopped: ' + reason);
  console.error('S3 stopped: ' + reason);
  process.exitCode = 1;
}

async function main() {
  for (const f of [W.fixtureEgp, W.slotA, W.slotB]) {
    if (!existsSync(f)) {
      console.error('missing ' + f + ': run Task 7 and S1 (part B) first, or Task 14 step 1 by hand');
      process.exit(2);
    }
  }
  // Stale frames are indistinguishable from fresh ones (ae-quirks #27); a stale project would hide a failed save.
  rmSync(W.frames, { recursive: true, force: true });
  ensureDir(W.frames);
  ensureDir(W.bkDir);
  try {
    rmSync(W.userProject, { force: true });
  } catch (e) {
    console.error('cannot remove ' + W.userProject + ' (still open in AE?): ' + e.message);
    process.exit(2);
  }

  const s1 = await probe('probe-1-setup.jsx', PARAMS);
  data.setup = s1;
  if (s1.stopped) return stop(s1.stopped);
  if (!(await frames(OUT.before))) return stop('baseline frame missing');

  // Spec §6.1: template footage is copied next to the user project and relinked there.
  // Node copies the binaries; ExtendScript only relinks. Probe 1 opened a new project, so AE no
  // longer holds an older copy from a previous run (AE keeps imported files open: ae-quirks #188).
  const relink = [];
  const copied = [];
  for (const f of s1.footage || []) {
    const src = f.path.replace(/\\/g, '/');
    const dst = path.posix.join(W.bkDir, path.posix.basename(src));
    copyFileSync(src, dst);
    copied.push({ src, dst, same: statSync(src).size === statSync(dst).size });
    relink.push({ id: f.id, target: dst });
  }
  add('template footage copied into Cloud.ru BrandKit/CRT_LowerThird@1 (Node)',
    copied.length > 0 && copied.every((c) => c.same), copied);

  const ids = { userCompId: s1.userCompId, ltCompId: s1.ltCompId, hatchCompId: s1.hatchCompId, ltLayerId: s1.ltLayerId };
  const s2 = await probe('probe-2-fields.jsx', { ...PARAMS, ids, relink });
  data.fields = s2;
  if (s2.stopped) return stop(s2.stopped);
  if (!(await frames(OUT.rdtIntro, OUT.rdtOutro, OUT.after))) return stop('frames of probe 2 missing or not full size');
  analyseRdt();
  analyseFields(s1.colorDefault);

  const s3 = await probe('probe-3-trim-out.jsx', { ...PARAMS, ids });
  data.trimOut = s3;
  if (s3.stopped) return stop(s3.stopped);
  if (!(await frames(OUT.trimIntro, OUT.trimOutro))) return stop('frames of probe 3 missing or not full size');
  analyseTrimOut(s3.trimOut);

  const s4 = await probe('probe-4-hatch-trim.jsx', { ...PARAMS, ids });
  data.trim = s4;
  if (s4.stopped) return stop(s4.stopped);
  if (!(await frames(OUT.hatchHold, OUT.hatchOut))) return stop('frames of probe 4 missing or not full size');
  analyseHatch();

  // Time remap (spec §3.1 S3: "Responsive Time ... or time remap") on a fresh instance in USER_Comp_Remap.
  const s6 = await probe('probe-6-remap.jsx', { ...PARAMS, ids });
  data.remap = s6;
  if (s6.stopped) return stop(s6.stopped);
  if (!(await frames(OUT.remapIntro, OUT.remapOutro))) return stop('frames of probe 6 missing or not full size');
  analyseRemap();

  save('main run: probes 1-4 and 6');
  return undefined;
}

// The --linear run adds its checks (prefixed "linear: ") to the existing S3.json.
async function linear() {
  if (!existsSync(RESULT_FILE)) {
    console.error('no ' + RESULT_FILE + ': run the main S3 stage first');
    process.exit(2);
  }
  if (!existsSync(W.linearProject)) {
    console.error('missing ' + W.linearProject + ': do the manual step of Task 14 first');
    process.exit(2);
  }
  ensureDir(W.frames);
  rmSync(OUT.linear, { force: true });
  const s5 = await probe('probe-5-linear.jsx', PARAMS);
  const measured = {};
  if (!s5.stopped && (await frames(OUT.linear))) {
    const prevData = existsSync(DATA_FILE) ? JSON.parse(readFileSync(DATA_FILE, 'utf8')) : {};
    const patch = meanColor(img(OUT.linear), REGIONS.patch);
    const d = dE(patch, COLORS.qa);
    const vsDefault = prevData.patchDefault ? deltaE2000Rgb(patch, prevData.patchDefault) : null;
    measured.patch = { mean: rgbToHex(patch), dE: round(d, 3), dEvsDefaultProject: round(vsDefault, 3), color: s5.color };
    add('linear: colour patch dE2000 <= 2 vs #26D07C (linearized sRGB project)', d <= DE_MAX, measured.patch, false);
    const slot = meanColor(img(OUT.linear), REGIONS.slot);
    const ds = dE(slot, COLORS.slotA);
    measured.slot = { mean: rgbToHex(slot), dE: round(ds, 3) };
    add('linear: template photo slot_a dE2000 <= 2', ds <= DE_MAX, measured.slot, false);
  }
  const prev = JSON.parse(readFileSync(RESULT_FILE, 'utf8'));
  const mine = checks.map((c) => (c.name.startsWith('linear: ') ? c : { ...c, name: 'linear: ' + c.name }));
  const merged = makeResult({
    ...prev,
    hostVersion: prev.hostVersion || hostVersion,
    checks: prev.checks.filter((c) => !c.name.startsWith('linear: ')).concat(mine),
    verdict: undefined,
    date: undefined,
    notes: String(prev.notes || '').split('; linear run')[0] + '; linear run' + (s5.stopped ? ' stopped: ' + s5.stopped : ''),
  });
  writeResult(merged);
  const allData = existsSync(DATA_FILE) ? JSON.parse(readFileSync(DATA_FILE, 'utf8')) : {};
  allData.linear = { probe: s5, measured };
  Object.assign(allData, recommendMechanism(merged.checks)); // the linear checks never change it
  writeFileSync(DATA_FILE, JSON.stringify(allData, null, 2) + '\n', 'utf8');
  console.log(`${ID}: ${merged.verdict} (${merged.checks.filter((c) => c.pass).length}/${merged.checks.length}) after the linear run`);
  if (s5.stopped) process.exitCode = 1;
}

// Each probe composed with this run's PARAMS and linted exactly as host-run.mjs does before sending.
function checkOnly() {
  const ids = { userCompId: 1, ltCompId: 2, hatchCompId: 3, ltLayerId: 4 };
  for (const f of ['probe-1-setup.jsx', 'probe-2-fields.jsx', 'probe-3-trim-out.jsx', 'probe-4-hatch-trim.jsx',
    'probe-5-linear.jsx', 'probe-6-remap.jsx']) {
    lintOrThrow(composeProbe([LIB, 'spikes/s3-instance/' + f], { ...PARAMS, ids, relink: [] }));
    console.log('OK ' + f);
  }
}

const isLinear = process.argv.includes('--linear');
if (process.argv.includes('--check')) {
  checkOnly();
} else {
  (isLinear ? linear() : main()).catch((e) => {
    console.error('ERROR: ' + e.message);
    if (!isLinear && checks.length) save('aborted: ' + e.message);
    process.exit(1);
  });
}
```

Run: `node --check spikes/s3-instance/run.mjs && node spikes/s3-instance/run.mjs --check`
Expected: шесть строк `OK probe-1-setup.jsx` … `OK probe-6-remap.jsx`. Каждая проба склеена с настоящими `PARAMS` и прошла тот же линтер, что `run` перед отправкой; AE не нужен. Заодно это проверка импорта в обычном Node: все именованные импорты из `contract.mjs`, `analyze.mjs` и `tools/` нашлись (vitest такие ошибки не ловит).

- [ ] **Step 15: Подготовить After Effects (вручную)**

1. After Effects 2026 открыт, панель BrandKit Dev открыта (Window → Extensions → BrandKit Dev, задача 4).
2. Текущий проект сохранён или это пустой новый проект: прогон создаёт новый проект, и AE не должен спрашивать о сохранении.
3. Проверка хоста:

Run: `node tools/host-run.mjs --host ae "JSON.stringify({ v: String(app.version), dirty: app.project.dirty })"`
Expected: `{ "v": "26.5…", "dirty": false }`.

- [ ] **Step 16: Основной прогон (пробы 1–4 и 6)**

Run: `node spikes/s3-instance/run.mjs`
Expected: через 1–3 минуты две строки: `S3: <итог> (<прошло>/69) -> …\spikes\results\S3.json` и `S3 mechanism: <rdt | remap | trim-only> (<причина>)`. Если AE не даёт вытянуть out point за конец шаблона, две информационные проверки trim-out не проходят и итог — `partial (67/69)`. Кадры лежат в `C:/CRBK/work/s3/frames`, проект — `C:/CRBK/work/s3/user_s3.aep` (композиции `USER_Comp`, `USER_Comp_Trim`, `USER_Comp_Remap`), копия футажа — `C:/CRBK/work/s3/Cloud.ru BrandKit/CRT_LowerThird@1/slot_a.png`.

Если вывод `S3 stopped: …` — причина в тексте (несохранённый проект, нет шрифтов SB Sans, ошибки выражений шаблона). Устранить и повторить шаг.

Если `ERROR: CDP_TIMEOUT…` — не повторять сразу. Посмотреть, нет ли в AE модального окна, и закрыть его. Проверить хост командой из шага 15. Если проект остался изменённым — File → Revert (Файл → Восстановить). Только потом запускать шаг заново.

- [ ] **Step 17: Ручные отметки (вручную)**

1. Визуально (необязательно). В открытом `user_s3.aep` открыть `USER_Comp`. Поставить индикатор времени на 2 с, проиграть до 4 с (пробел), затем с 15 с до 17 с. Интро и аутро должны идти с той же скоростью, что в шаблоне: имя проявляется за 0,5 с, гаснет за последние 0,5 с.

Run: `node tools/spike/manual.mjs --id S3 --check "visual: stretched instance plays intro and outro at template speed" --pass true --detail "<что видно>" --optional`
При расхождении — `--pass false` и описание в `--detail`.

2. Если шаг 1 собирал копию фикстуры вручную:

Run: `node tools/spike/manual.mjs --id S3 --check "fixture EGP built by hand (S1 fallback)" --pass true --detail "added by hand: <список свойств>" --optional`

Expected (каждая команда): `S3: <итог> (<n> checks)`.

Повторный основной прогон перезаписывает `S3.json`, и тогда ручные отметки и шаг 19 делаются заново.

- [ ] **Step 18: Проект с другим рабочим пространством (вручную)**

1. File → New → New Project (Файл → Создать → Новый проект). Прогон сохранил `user_s3.aep`; если AE всё же спросит о сохранении — Don't Save («Не сохранять»).
2. File → Project Settings… (Файл → Настройки проекта…), вкладка Color (Цвет):
   - Color Engine, если есть такой выбор: Adobe, не OCIO;
   - Working Space (в новых версиях — Working Color Space; «Рабочее пространство»): `sRGB IEC61966-2.1`;
   - включить Linearize Working Space («Линеаризовать рабочее пространство»);
   - остальное не менять → OK.
3. File → Save As → Save As… → `C:\CRBK\work\s3\user_linear.aep`.
4. Проверка:

Run: `node tools/host-run.mjs --host ae "JSON.stringify({ file: app.project.file ? app.project.file.fsName : '', ws: app.project.workingSpace, lin: app.project.linearizeWorkingSpace, dirty: app.project.dirty })"`
Expected: `file` оканчивается на `user_linear.aep`, `"ws": "sRGB IEC61966-2.1"`, `"lin": true`, `"dirty": false`.

- [ ] **Step 19: Прогон в линейном проекте (проба 5)**

Run: `node spikes/s3-instance/run.mjs --linear`
Expected: `S3: <итог> (<прошло>/80) after the linear run`; с ручными отметками шага 17 проверок больше. Проверки этого прогона добавляются в `S3.json` с префиксом `linear: `. Повторный запуск заменяет их, а не дублирует. `mechanism` в `S3.data.json` от этого прогона не меняется.

Если при импорте шаблона AE показал окно о различии настроек цвета — записать его текст и нажать OK. При `CDP_TIMEOUT` действовать как в шаге 16, затем File → Revert и повторить шаг.

- [ ] **Step 20: Отчёт и вывод для контракта**

Run: `npm run spike:report`
Expected: `written …\spikes\RESULTS.md`; в таблице есть строка `| S3 | Экземпляр шаблона в проекте пользователя | ae | 26.5… | … |`.

Как читать `spikes/results/S3.json` и `S3.data.json`. Вывод переносится в контракт §4.2 (часть F).
- `mechanism` и `mechanismReason` в `S3.data.json` — механизм длины экземпляра в AE, его выбрал `recommendMechanism`. Задача 30 плана 1 копирует `mechanism` в правило контракта C27.
  - `rdt` — прошли `RDT fit: …` и обе `RDT stretch: …`. В AE `fit: rdt` = растяжение слоя экземпляра: `stretch = нужная длина / длительность шаблона × 100`.
  - `remap` — rdt не прошёл, прошли все проверки `remap: …` и `time remap: …`. В AE `fit: rdt` = time remap на слое без растяжения: out point по нужной длине и линейные ключи по `remapKeys`, интро и аутро — со скоростью шаблона. Итог S3 при этом «нет», а time remap и есть его запасной путь.
  - `trim-only` — не сработали ни rdt, ни time remap. Что делает AE, видно в `rdt.intro.explainedBy`, `rdt.outro.explainedBy` (`uniform` — растягивает всё целиком) и в `remapFrames`. Длину в AE тогда меняет только `fit: trim`, а шаблон с `fit: rdt` вставляется в своей длине.
  - `null` — прогон остановился раньше нужных кадров, и C27 из такого итога не заполнить. Устранить причину и повторить шаг 16.
- `trim-out (info): …` — справка: даёт ли одно вытягивание out point без растяжения подгонку rdt. На `mechanism` не влияет.
- Проверки `trim: …` прошли → `fit: trim` в AE = обрезка out point плюс запись «Длительности».
- `remap: Essential Properties written before time remap still read back` — поля экземпляра переживают включение time remap. `remap.remapAdded` — ключи, которые AE ставит сам при включении.
- `colour patch …` и `linear: colour patch …` — ΔE патча в проекте по умолчанию и в линейном; `dEvsDefaultProject` — разница между проектами. При ΔE > 2 панель предупреждает о рабочем пространстве (§6.1, AE, шаг 2).
- `fields.ep` в `S3.data.json` — карта свойств экземпляра: порядковый путь, имя, тип, исходное свойство шаблона. Это основа для `egpName`/`egpIndex` в схеме библиотеки.

- [ ] **Step 21: Все тесты**

Run: `npm test`
Expected: все тесты зелёные, среди них `tests/spikes/s3-analyze.test.mjs` (17).

- [ ] **Step 22: Commit**

```bash
git add spikes/s3-instance/analyze.mjs spikes/s3-instance/lib.jsx spikes/s3-instance/probe-1-setup.jsx spikes/s3-instance/probe-2-fields.jsx spikes/s3-instance/probe-3-trim-out.jsx spikes/s3-instance/probe-4-hatch-trim.jsx spikes/s3-instance/probe-5-linear.jsx spikes/s3-instance/probe-6-remap.jsx spikes/s3-instance/run.mjs tests/spikes/s3-analyze.test.mjs spikes/results/S3.json spikes/results/S3.data.json spikes/RESULTS.md
git commit -m "feat(spikes): S3 template instance in a user AE project" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Часть D. Фикстура Premiere и пробные сборки S5, S6, S7

Задачи 15–18 проверяют путь шаблонов в Premiere через CEP ExtendScript.
- **Задача 15** — тестовая секвенция в проекте `CRT_pr_test.prproj` и общие помощники Premiere для S5–S7.
- **Задача 16, S5** — `importMGT`, запись полей MOGRT с чтением назад, длина `rdt` и `trim`, серия из 50 вставок, шаги отмены.
- **Задача 17, S6** — повторный импорт изменённого MOGRT в проект, где он уже стоит, и `capsuleID`.
- **Задача 18, S7** — ProRes с альфой и звук, экспорт брендовым `.epr` (напрямую и очередью AME), «вписать в окно», Crop через QE, шаблонный `.prproj`.

**Порядок:** 15 → 16 → 17 → 18. S5 и S7 работают в фикстуре задачи 15, каждая в своём клоне секвенции. S6 — в своём свежем проекте.

**Зависимости.**
- Часть A (задачи 1–6): vitest, pngjs, adm-zip; `run` и `lintOrThrow` (`tools/host-run.mjs`), `composeProbe` и `REPO` (`tools/spike/runner.mjs`), `makeResult`/`writeResult`/`appendManualCheck`/`RESULTS_DIR`, `tools/spike/manual.mjs`, `workPath`/`workDir`/`ensureDir`; панель BrandKit Dev в Premiere (порт 8096) и в AE (8094, нужна S6).
- Часть B, задача 7: медиа фикстуры в `C:/CRBK/work/fixtures/media` и `tools/lib/media-probe.mjs` (`probeMedia`, `hasBinary`). Контракт фикстуры `spikes/fixtures/contract.mjs`: `COMP_LT`, `COMP_HATCH`, `EGP`, `fixturePaths()`, `fixtureParams()`. Имена шаблонов, подписи Essential Graphics, пути и шрифты S5 и S6 берут оттуда, а не пишут заново.
- План 2, задача 1: `sourceRoot()` из `tools/packs/paths.mjs` — путь к исходному пакету (переменная `BRANDKIT_SOURCE`). Из пакета S7 копирует брендовый `FullHD.epr`.
- Часть B, S1 (задача 8): копия `C:/CRBK/work/fixtures/CRT_fixture_egp.aep` со свойствами Essential Graphics.
- Часть B, S2 (задача 9): `C:/CRBK/work/mogrt/CRT_LowerThird_v1.mogrt`, `CRT_Hatch_v1.mogrt` и `tools/spike/wait-file.mjs` (`waitStableFile`). Если S2 не дала файлов, задача 16 (шаг 1) экспортирует их вручную.
- Часть C: `tools/color/deltae.mjs`, `tools/png/read-png.mjs` (задачи 12–13) и модель кадров S3 `spikes/s3-instance/analyze.mjs` (задача 14). Так AE и Premiere меряются в одни и те же моменты одних и тех же шаблонов.

**Многошаговые сборки.** `runSpike` из задачи 6 делает один вызов хоста и перезаписывает итог. У S5–S7 вызовов много, а между ними Node ждёт файлы и считает кадры. Поэтому задача 15 добавляет `tools/spike/multistage.mjs`:
- сборка — список именованных этапов (`pr`, `ae` или `node`); пробы собирает тот же `composeProbe`, отправляет тот же `run`;
- данные каждого этапа лежат в `spikes/results/SN.data.json`, итог `SN.json` пересобирается после каждого запуска;
- `--only <этапы>` продолжает тот же прогон (та же папка `C:/CRBK/work/sN/run-<дата>-<время>`) и сохраняет ручные отметки. Полный запуск начинает новый прогон и ручные отметки сбрасывает;
- упавший этап останавливает прогон, сам этап не повторяется. После `CDP_TIMEOUT` сначала посмотреть, нет ли в Premiere окна, и проверить хост дешёвым чтением: `node tools/host-run.mjs --host pr "JSON.stringify({ v: app.version })"`. Потом продолжить через `--only`.

**Правила проб в Premiere** (источники — в комментариях кода: premiere-autopilot, Phygital, PProPanel):
- дорожки в ExtendScript нумеруются с 0 (V1 = 0). Время — в тиках: 254016000000 в секунде, 10160640000 на кадр 25p. Клип ставится секундами на 1 мс внутрь кадра, длина задаётся целыми объектами `Time` (сначала `outPoint`, потом `end`);
- `importMGT` только перезаписывает. Поэтому шаблоны идут на свободную V3 после 30 с, где под ними чёрный фон: так кадр не смешивается с полосами;
- `importFiles` и `importMGT` возвращаются раньше, чем элемент появился, а изредка не делают ничего. Проба ждёт элемент сама и записывает, как долго;
- кадр — QE `exportFramePNG(таймкод CTI, нативный путь)`. Если файла нет, тот же кадр выводится `exportAsMediaDirect` с PNG-пресетом;
- эффекты и Motion ищутся по match name, их параметры — по индексу: Premiere может работать на русском. Свойства MOGRT ищутся по нашим именам из Essential Graphics (`Имя`, `Стиль` …) — это не строки интерфейса.

**Ручные шаги** помечены «(вручную)». Пункты меню даны по-английски, в русском интерфейсе они на тех же местах; Sequence там называется «Эпизод».

**Файлы части D:**

```text
tools/pr/env.mjs                  имена фикстуры, папка Premiere, копии пресетов в C:/CRBK/work/pr/presets
tools/spike/multistage.mjs        многошаговые сборки: этапы, --only, пересборка SN.json
tools/mogrt/capsule.mjs           capsuleID в .mogrt: прочитать, записать копию с новым
tools/png/frame-diff.mjs          разница кадров: доля, рамка изменений, карта размытия
spikes/lib/pr-helpers.jsx         ES3-помощники Premiere (время, проект, секвенции, дорожки, MOGRT, QE, кадры)
spikes/lib/pr-shots.jsx           проба: кадры рабочей секвенции
spikes/fixtures/pr/               build-seq.jsx, build.mjs, fixture.json
spikes/s5-importmgt/              analyze.mjs, stage-insert.jsx, stage-readback.jsx, stage-series.jsx,
                                  stage-count.jsx, stage-undo.jsx, run.mjs
spikes/s6-capsule/                analyze.mjs, ae-export.jsx, pr-insert.jsx, run.mjs
spikes/s7-media-export/           analyze.mjs, stage-media.jsx, stage-export.jsx, stage-fit-place.jsx,
                                  stage-fit-apply.jsx, stage-template-import.jsx, stage-template-place.jsx, run.mjs
tests/tools/                      pr-env, multistage, capsule, frame-diff (.test.mjs)
tests/spikes/                     pr-helpers, s5-analyze, s6-analyze, s7-analyze (.test.mjs)
spikes/results/                   S5.json, S5.data.json, S6.json, S6.data.json, S7.json, S7.data.json
```

### Task 15: Фикстура Premiere и общие помощники

Фикстура: проект `C:/CRBK/work/pr/CRT_pr_test.prproj`, секвенция `CRT_Seq_1080p25` из пресета HD 1080p 25 fps, `bars_1080p25_30s.mp4` на V1 в 0–30 с, `bars2_1080p25_10s.mp4` на V2 в 10–20 с, оба файла в бине `CRT_Media`. Пустой проект создаётся и сохраняется вручную (так задано контрактом фикстуры), всё остальное делает проба. Повторный запуск пробы ничего не меняет, только проверяет.

Пресет секвенции и PNG-пресет Node копирует из папки Premiere в `C:/CRBK/work/pr/presets` под ASCII-именами: ExtendScript видит только пути рабочей папки.

**Files:**
- Create: `tools/pr/env.mjs`, `tools/spike/multistage.mjs`, `spikes/lib/pr-helpers.jsx`, `spikes/lib/pr-shots.jsx`, `spikes/fixtures/pr/build-seq.jsx`, `spikes/fixtures/pr/build.mjs`
- Test: `tests/tools/pr-env.test.mjs`, `tests/tools/multistage.test.mjs`, `tests/spikes/pr-helpers.test.mjs`
- Create (прогоном): `spikes/fixtures/pr/fixture.json`

- [ ] **Step 1: Написать падающий тест `tests/tools/pr-env.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TICKS_PER_SECOND, TPF_25, prRoot, presetSources, stagePreset, clearFrames } from '../../tools/pr/env.mjs';

const tmp = (p) => mkdtempSync(path.join(os.tmpdir(), p));

describe('pr env', () => {
  it('knows a 25p frame in ticks', () => {
    expect(TPF_25).toBe(10160640000);
    expect(TPF_25 * 25).toBe(TICKS_PER_SECOND);
  });

  it('finds the presets under the Premiere folder on Windows and on a Mac', () => {
    expect(presetSources({}, 'win32').seq1080p25)
      .toBe('C:/Program Files/Adobe/Adobe Premiere Pro 2026/Settings/SequencePresets/HD 1080p/HD 1080p 25 fps.sqpreset');
    expect(presetSources({}, 'win32').pngStill)
      .toBe('C:/Program Files/Adobe/Adobe Premiere Pro 2026/MediaIO/systempresets/3F3F3F3F_504E4720/PNG Sequence (Match Source).epr');
    expect(prRoot({}, 'darwin')).toBe('/Applications/Adobe Premiere Pro 2026/Adobe Premiere Pro 2026.app/Contents');
    expect(prRoot({ BRANDKIT_PR_ROOT: 'D:\\Apps\\Pr' }, 'win32')).toBe('D:/Apps/Pr');
  });

  it('copies a preset into the work folder and refuses a missing one', () => {
    const src = path.join(tmp('bk-pe-'), 'x.epr');
    writeFileSync(src, '<epr/>');
    const dst = stagePreset(src, 'X.epr', tmp('bk-pd-'));
    expect(readFileSync(dst, 'utf8')).toBe('<epr/>');
    expect(dst).toMatch(/\/X\.epr$/);
    expect(() => stagePreset(src + '.missing', 'Y.epr', tmp('bk-pd-'))).toThrow(/preset not found/);
  });

  it('removes the frames of earlier attempts for the given keys only', () => {
    const dir = tmp('bk-fr-');
    for (const f of ['a.png', 'a_direct00000.png', 'ab.png', 'b.png']) writeFileSync(path.join(dir, f), 'x');
    expect(clearFrames(dir, ['a'])).toBe(2);
    expect(readdirSync(dir).sort()).toEqual(['ab.png', 'b.png']);
    expect(clearFrames(path.join(dir, 'none'), ['a'])).toBe(0);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run tests/tools/pr-env.test.mjs`
Expected: FAIL — `Cannot find module '../../tools/pr/env.mjs'`.

- [ ] **Step 3: Создать `tools/pr/env.mjs`**

Переменная `BRANDKIT_PR_ROOT` и её значения по умолчанию — те же, что у S8 (часть E).

```js
// Premiere side of part D: names of the Task 15 fixture, the Premiere install folder and the system
// presets that Node copies under the ASCII work folder. ExtendScript sees only <work> paths (plan conventions).
import { copyFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { workPath, ensureDir } from '../lib/work.mjs';

export const TICKS_PER_SECOND = 254016000000;
export const TPF_25 = TICKS_PER_SECOND / 25; // 10160640000 ticks per 25p frame
export const PR_PROJECT_FILE = 'CRT_pr_test.prproj';
export const PR_FIXTURE_SEQ = 'CRT_Seq_1080p25';
export const PR_MEDIA_BIN = 'CRT_Media';

// The folder that holds Settings/ and MediaIO/. Same variable and defaults as part E (s8-perf prPaths).
export function prRoot(env = process.env, platform = process.platform) {
  return String(env.BRANDKIT_PR_ROOT || (platform === 'darwin'
    ? '/Applications/Adobe Premiere Pro 2026/Adobe Premiere Pro 2026.app/Contents'
    : 'C:/Program Files/Adobe/Adobe Premiere Pro 2026')).replace(/\\/g, '/');
}

export function presetSources(env = process.env, platform = process.platform) {
  const root = prRoot(env, platform);
  return {
    seq1080p25: root + '/Settings/SequencePresets/HD 1080p/HD 1080p 25 fps.sqpreset',
    pngStill: root + '/MediaIO/systempresets/3F3F3F3F_504E4720/PNG Sequence (Match Source).epr',
  };
}

// Node copies a preset into <work>/pr/presets under a plain ASCII name; the install path never reaches JSX.
export function stagePreset(src, name, dir = workPath('pr', 'presets')) {
  if (!existsSync(src)) throw new Error('preset not found: ' + src + ' (set BRANDKIT_PR_ROOT)');
  ensureDir(dir);
  const dst = path.posix.join(String(dir).replace(/\\/g, '/'), name);
  copyFileSync(src, dst);
  return dst;
}

// Frames of an earlier attempt look exactly like fresh ones (ae-quirks #27): before a stage exports frames,
// <key>.png and <key>_direct*.png of its keys are removed from the frames folder. Returns how many.
export function clearFrames(dir, keys) {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const f of readdirSync(dir)) {
    if (keys.some((k) => f === k + '.png' || f.startsWith(k + '_direct'))) {
      rmSync(path.join(dir, f), { force: true });
      n += 1;
    }
  }
  return n;
}

export function fixtureMedia(name) {
  return workPath('fixtures', 'media', name);
}

// PARAMS shared by the Premiere stages of S5-S7 (spikes/lib/pr-helpers.jsx reads them).
// copy: false gives the same PARAMS without touching the install (the --check modes, no Premiere needed).
export function prBaseParams({ copy = true } = {}) {
  return {
    projectFile: PR_PROJECT_FILE,
    srcSeq: PR_FIXTURE_SEQ,
    binName: PR_MEDIA_BIN,
    tpf: TPF_25,
    pngPreset: copy ? stagePreset(presetSources().pngStill, 'PNG_still.epr') : workPath('pr', 'presets', 'PNG_still.epr'),
    frameWaitMs: 5000,
  };
}
```

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/tools/pr-env.test.mjs`
Expected: `4 passed`.

- [ ] **Step 5: Написать падающий тест `tests/tools/multistage.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  nodeCheck, parseOnly, saveStage, loadStages, rebuildResult, runStages, hostVersionOf,
} from '../../tools/spike/multistage.mjs';
import { appendManualCheck } from '../../tools/spike/result.mjs';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'bk-ms-'));

describe('multistage', () => {
  it('builds Node checks', () => {
    expect(nodeCheck('a', true)).toEqual({ name: 'a', pass: true, required: true, detail: '' });
    expect(nodeCheck('b', 1, 'x', false)).toEqual({ name: 'b', pass: false, required: false, detail: 'x' });
  });

  it('parses --only', () => {
    expect(parseOnly(['--only', 'a, b'])).toEqual(['a', 'b']);
    expect(parseOnly([])).toBe(null);
  });

  it('reports one host version, or each host when both answered', () => {
    const st = { a: { host: 'pr', hostVersion: '26.5.2' }, n: { host: 'node' }, b: { host: 'ae', hostVersion: '26.5' } };
    expect(hostVersionOf(st, ['a', 'n'])).toBe('26.5.2');
    expect(hostVersionOf(st, ['b', 'a'])).toBe('AE 26.5; Pr 26.5.2');
    expect(hostVersionOf(st, ['n'])).toBe(null);
  });

  it('rebuilds the result in declared stage order and keeps manual checks on request', () => {
    const dir = tmp();
    saveStage('S5', 'second', { host: 'node', checks: [nodeCheck('n', true)] }, dir);
    saveStage('S5', 'first', { host: 'pr', hostVersion: '26.5.2', checks: [nodeCheck('h', true)], evidence: ['C:/x.png'] }, dir);
    writeFileSync(path.join(dir, 'S5.json'), JSON.stringify({
      id: 'S5', checks: [{ name: 'm', pass: false, required: true, detail: '', manual: true }],
    }));
    const { result } = rebuildResult({ id: 'S5', title: 't', host: 'pr', stageOrder: ['first', 'second'] }, { dir });
    expect(result.checks.map((c) => [c.name, c.stage])).toEqual([['h', 'first'], ['n', 'second'], ['m', undefined]]);
    expect(result.hostVersion).toBe('26.5.2');
    expect(result.evidence).toEqual(['C:/x.png']);
    expect(result.verdict).toBe('no');
    const fresh = rebuildResult({ id: 'S5', title: 't', host: 'pr', stageOrder: ['first', 'second'] }, { dir, keepManual: false });
    expect(fresh.result.verdict).toBe('yes');
  });

  it('runs stages in order, records a throwing stage and stops; --only continues the same run', async () => {
    const dir = tmp();
    const runRoot = tmp();
    const seen = [];
    const stages = [
      { name: 'a', run: async (ctx) => { seen.push('a'); return { checks: [nodeCheck('a ok', true)], data: { dir: ctx.runDir } }; } },
      { name: 'b', run: async () => { seen.push('b'); throw new Error('boom'); } },
      { name: 'c', run: async (ctx) => { seen.push('c:' + ctx.stages.a.data.dir); return { checks: [] }; } },
      { name: 'd', onDemand: true, run: async () => { seen.push('d'); return { checks: [] }; } },
    ];
    const first = await runStages({ id: 'S9', title: 't', host: 'node', stages, dir, runRoot });
    expect(seen).toEqual(['a', 'b']);
    expect(first.failed).toBe('b');
    expect(first.result.checks.map((c) => [c.name, c.pass])).toEqual([['a ok', true], ['stage b completed', false]]);
    const again = await runStages({ id: 'S9', title: 't', host: 'node', stages, argv: ['--only', 'c,d'], dir, runRoot });
    expect(seen).toEqual(['a', 'b', 'c:' + first.runDir, 'd']);
    expect(again.runDir).toBe(first.runDir);
    expect(Object.keys(loadStages('S9', dir).stages)).toEqual(['a', 'b', 'c', 'd']);
    expect(JSON.parse(readFileSync(path.join(dir, 'S9.json'), 'utf8')).checks).toHaveLength(2);
  });

  it('keeps each manual check once over --only re-runs; a full run drops them', async () => {
    const opts = {
      id: 'S7', title: 't', host: 'node', dir: tmp(), runRoot: tmp(),
      stages: [{ name: 'a', run: async () => ({ checks: [nodeCheck('a ok', true)] }) }],
    };
    await runStages(opts);
    appendManualCheck('S7', { name: 'visual', pass: false, detail: 'first look' }, opts.dir);
    await runStages({ ...opts, argv: ['--only', 'a'] });
    appendManualCheck('S7', { name: 'visual', pass: true, detail: 'second look' }, opts.dir);
    const again = await runStages({ ...opts, argv: ['--only', 'a'] });
    expect(again.result.checks.map((c) => [c.name, c.pass, c.manual === true]))
      .toEqual([['a ok', true, false], ['visual', true, true]]);
    expect(again.result.verdict).toBe('yes');
    const fresh = await runStages(opts);
    expect(fresh.result.checks.map((c) => c.name)).toEqual(['a ok']);
  });

  it('refuses --only before a first run and unknown stage names', async () => {
    const stages = [{ name: 'a', run: async () => ({ checks: [] }) }];
    await expect(runStages({ id: 'S8', title: 't', host: 'node', stages, argv: ['--only', 'a'], dir: tmp(), runRoot: tmp() }))
      .rejects.toThrow(/no earlier run/);
    await expect(runStages({ id: 'S8', title: 't', host: 'node', stages, argv: ['--only', 'x'], dir: tmp(), runRoot: tmp() }))
      .rejects.toThrow(/unknown stage/);
  });
});
```

- [ ] **Step 6: Убедиться, что тест падает**

Run: `npx vitest run tests/tools/multistage.test.mjs`
Expected: FAIL — `Cannot find module '../../tools/spike/multistage.mjs'`.

- [ ] **Step 7: Создать `tools/spike/multistage.mjs`**

```js
// Multi-stage spikes (part D): a spike is a list of named stages - host probes and Node analyses - that run
// one after another in one invocation. Each stage's checks, data and evidence are stored in
// spikes/results/<id>.data.json; after every invocation spikes/results/<id>.json is rebuilt from the
// stages in their declared order (makeResult/writeResult).
// Which stage helper to use:
//   - this module: several stages of one spike in one invocation (S5-S7). --only <stages> continues the same
//     run: the same run folder, the other stages and the manual checks (tools/spike/manual.mjs) are kept.
//     A full run starts fresh: a new run folder, no manual checks, as a fresh spike would;
//   - tools/spike/stages.mjs (Task 19): stages that run as separate commands, on different hosts or machines,
//     and accumulate in one result (S8, S9, S11: AE then Premiere, Windows then Mac).
//   await runStages({ id, title, host, fallback, notes, stages, argv: process.argv.slice(2) })
//   stages: [{ name, host: 'ae' | 'pr' | 'node', onDemand?: true, run: async (ctx) => entry }]
//   entry:  { checks, data, evidence, notes, hostVersion }
//   ctx:    { runDir, stages: the entries saved so far, by stage name }
// No stage is retried. A stage that throws becomes a failed check and stops the run; after a cheap read
// of the host, continue with --only <stage>,<stage> (same run folder, the other stages are kept).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { run } from '../host-run.mjs';
import { composeProbe } from './runner.mjs';
import { RESULTS_DIR, makeResult, writeResult } from './result.mjs';
import { workPath } from '../lib/work.mjs';

const HOST_LABEL = { ae: 'AE', pr: 'Pr' };

export function nodeCheck(name, pass, detail = '', required = true) {
  return { name, pass: pass === true, required: required !== false, detail };
}

// One host probe: PARAMS + spikes/lib/check.jsx + files, ending with finish({...}).
export async function runStage({ host, files, params = {}, timeoutMs = 300000 }) {
  const r = await run(host, composeProbe(files, params), { timeoutMs });
  if (!r || !Array.isArray(r.checks)) {
    throw new Error('the probe must end with finish({...}); got ' + JSON.stringify(r).slice(0, 300));
  }
  const data = r.data || {};
  return { checks: r.checks, data, hostVersion: data.hostVersion || null };
}

export function dataFile(id, dir = RESULTS_DIR) {
  return path.join(dir, id + '.data.json');
}

export function loadStages(id, dir = RESULTS_DIR) {
  const f = dataFile(id, dir);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : { meta: {}, stages: {} };
}

function writeStore(id, store, dir) {
  const f = dataFile(id, dir);
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify(store, null, 2) + '\n', 'utf8');
  return f;
}

export function resetStages(id, meta, dir = RESULTS_DIR) {
  return writeStore(id, { meta, stages: {} }, dir);
}

export function saveStage(id, name, entry, dir = RESULTS_DIR) {
  const store = loadStages(id, dir);
  store.stages[name] = {
    at: new Date().toISOString(),
    host: entry.host || 'node',
    hostVersion: entry.hostVersion || null,
    checks: entry.checks || [],
    data: entry.data || {},
    evidence: entry.evidence || [],
    notes: entry.notes || '',
  };
  writeStore(id, store, dir);
  return store;
}

// '26.5.2' when one host answered, 'AE 26.5; Pr 26.5.2' when both did.
export function hostVersionOf(stages, order) {
  const seen = {};
  for (const name of order) {
    const st = stages[name];
    if (st && st.host !== 'node' && st.hostVersion && !seen[st.host]) seen[st.host] = st.hostVersion;
  }
  const hosts = Object.keys(seen);
  if (!hosts.length) return null;
  if (hosts.length === 1) return seen[hosts[0]];
  return hosts.map((h) => (HOST_LABEL[h] || h) + ' ' + seen[h]).join('; ');
}

export function rebuildResult({ id, title, host, stageOrder, fallback = '', notes = '' },
  { dir = RESULTS_DIR, keepManual = true } = {}) {
  const store = loadStages(id, dir);
  let checks = [];
  let evidence = [];
  const noteParts = notes ? [notes] : [];
  for (const name of stageOrder) {
    const st = store.stages[name];
    if (!st) continue;
    checks = checks.concat(st.checks.map((c) => ({ ...c, stage: name })));
    evidence = evidence.concat(st.evidence);
    if (st.notes) noteParts.push(name + ': ' + st.notes);
  }
  const prevFile = path.join(dir, id + '.json');
  if (keepManual && existsSync(prevFile)) {
    const prev = JSON.parse(readFileSync(prevFile, 'utf8'));
    checks = checks.concat((prev.checks || []).filter((c) => c.manual === true));
  }
  const result = makeResult({
    id, title, host, hostVersion: hostVersionOf(store.stages, stageOrder), checks, fallback,
    notes: noteParts.join('\n'), evidence: [...new Set(evidence)],
  });
  return { result, file: writeResult(result, dir) };
}

export function parseOnly(argv) {
  const i = argv.indexOf('--only');
  if (i === -1) return null;
  return String(argv[i + 1] || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-');
}

export async function runStages({ id, title, host, fallback = '', notes = '', stages, argv = [], dir = RESULTS_DIR, runRoot }) {
  const only = parseOnly(argv);
  const names = stages.map((s) => s.name);
  for (const n of only || []) {
    if (!names.includes(n)) throw new Error('unknown stage: ' + n + ' (known: ' + names.join(', ') + ')');
  }
  if (!only) {
    const runDir = path.posix.join(runRoot || workPath(id.toLowerCase()), 'run-' + stamp());
    resetStages(id, { runDir, startedAt: new Date().toISOString() }, dir);
  }
  const meta = loadStages(id, dir).meta || {};
  if (!meta.runDir) throw new Error('no earlier run of ' + id + ' to continue: run it once without --only');
  mkdirSync(meta.runDir, { recursive: true });
  const todo = stages.filter((s) => (only ? only.includes(s.name) : !s.onDemand));
  let failed = null;
  for (const st of todo) {
    let entry;
    try {
      entry = await st.run({ runDir: meta.runDir, stages: loadStages(id, dir).stages });
    } catch (e) {
      failed = st.name;
      entry = { checks: [nodeCheck('stage ' + st.name + ' completed', false, String((e && e.message) || e))] };
    }
    saveStage(id, st.name, { host: st.host || 'node', ...entry }, dir);
    const cs = entry.checks || [];
    console.log(id + ' ' + st.name + ': ' + cs.filter((c) => c.pass).length + '/' + cs.length + ' checks passed');
    if (failed) break;
  }
  const { result, file } = rebuildResult({ id, title, host, stageOrder: names, fallback, notes }, { dir, keepManual: !!only });
  console.log(id + ': ' + result.verdict + ' (' + result.checks.length + ' checks) -> ' + file);
  if (failed) {
    console.log(id + ': stage "' + failed + '" failed. Check the host with a cheap read first '
      + '(node tools/host-run.mjs --host pr "JSON.stringify({ v: app.version })"), '
      + 'then continue with --only <stages>. A mutating stage is never re-run blindly.');
  }
  return { result, file, failed, runDir: meta.runDir };
}
```

- [ ] **Step 8: Запустить тест**

Run: `npx vitest run tests/tools/multistage.test.mjs`
Expected: `7 passed`.

- [ ] **Step 9: Написать падающий тест `tests/spikes/pr-helpers.test.mjs`**

ES3-помощники выполняются в `node:vm` с минимальной заменой Premiere: `Time` держит тики и секунды согласованными, `File` отдаёт нативный путь. Тест заодно прогоняет файл через ES3-линтер.

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { lintOrThrow } from '../../tools/host-run.mjs';

const src = readFileSync(new URL('../../spikes/lib/pr-helpers.jsx', import.meta.url), 'utf8');
const TPS = 254016000000;
const TPF = 10160640000; // 25 fps

// A minimal Premiere stand-in: Time keeps ticks and seconds in step, File gives a native path.
function Time() { this._t = 0; }
Object.defineProperty(Time.prototype, 'ticks', { get() { return String(this._t); }, set(v) { this._t = Number(v); } });
Object.defineProperty(Time.prototype, 'seconds', { get() { return this._t / TPS; }, set(v) { this._t = Math.round(v * TPS); } });
function File(p) { this.fsName = String(p).replace(/\//g, '\\'); }

function load(app = {}) {
  const ctx = vm.createContext({ Time, File, app, $: { sleep() {} } });
  vm.runInContext(src, ctx);
  return ctx;
}

const at = (sec) => { const t = new Time(); t.seconds = sec; return t; };
const track = (...ranges) => {
  const clips = { numItems: ranges.length };
  ranges.forEach(([s, e], i) => { clips[i] = { start: at(s), end: at(e), inPoint: at(0), outPoint: at(e - s), name: 'c' + i }; });
  return { clips };
};
const bin = (name, kids, type = 2) => {
  const children = { numItems: kids.length };
  kids.forEach((k, i) => { children[i] = k; });
  return { name, type, nodeId: 'n-' + name, children };
};
const clipItem = (name, media) => ({ name, type: 1, nodeId: 'n-' + name, getMediaPath: () => media });

describe('pr-helpers: time and values', () => {
  const h = load();

  it('converts seconds, ticks and frames at 25 fps', () => {
    expect(h.TICKS_PER_SECOND).toBe(TPS);
    expect(h.secToTicks(1)).toBe(TPS);
    expect(h.ticksToSec(127008000000)).toBe(0.5);
    expect(h.secToFrames(40.48, TPF)).toBe(1012);
    expect(h.framesToTicks(1, TPF)).toBe(TPF);
    expect(h.ticksToFrames('3048192000000', TPF)).toBe(300);
    expect(h.onFrameGrid(TPF * 7, TPF)).toBe(true);
    expect(h.onFrameGrid(TPF * 7 + 1, TPF)).toBe(false);
  });

  it('builds Time objects through ticks', () => {
    const t = h.makeTime(TPF * 25);
    expect(t.ticks).toBe(String(TPS));
    expect(t.seconds).toBe(1);
  });

  it('handles strings and paths without ES5 helpers', () => {
    expect(h.normPath('C:\\CRBK\\Work\\A.mp4')).toBe('c:/crbk/work/a.mp4');
    expect(h.sameFsPath('C:/CRBK/x.png', 'c:\\crbk\\X.PNG')).toBe(true);
    expect(h.strHas('abc', 'b')).toBe(true);
    expect(h.endsWith('x/CRT_pr_test.prproj', 'CRT_pr_test.prproj')).toBe(true);
    expect(h.endsWith('prproj', 'CRT_pr_test.prproj')).toBe(false);
    expect([h.truthy(1), h.truthy(true), h.truthy('true'), h.truthy(0), h.truthy(false)]).toEqual([true, true, true, false, false]);
    expect(h.describeValue([1, 2])).toEqual({ type: 'object', value: '[1,2]' });
    expect(h.describeValue(null)).toEqual({ type: 'null', value: null });
  });
});

describe('pr-helpers: tracks', () => {
  const h = load();

  it('finds free ranges, clips and the first free track', () => {
    const v2 = track([10, 20]);
    expect(h.trackFreeAt(v2, 0, 10)).toBe(true);
    expect(h.trackFreeAt(v2, 19, 21)).toBe(false);
    expect(h.trackFreeAt(v2, 20, 30)).toBe(true);
    expect(h.clipStartingAt(v2, 250, TPF).name).toBe('c0');
    expect(h.clipStartingAt(v2, 251, TPF)).toBe(null);
    const tracks = { numTracks: 3, 0: track([0, 30]), 1: v2, 2: track() };
    expect(h.firstFreeTrack(tracks, 1, 12, 15)).toBe(2);
    expect(h.firstFreeTrack(tracks, 1, 0, 5)).toBe(1);
    expect(h.firstFreeTrack(tracks, 0, 0, 40)).toBe(2);
    expect(h.trackItems(v2, TPF)[0]).toMatchObject({ name: 'c0', startF: 250, endF: 500, onGrid: true });
  });

  it('reports track occupancy by track label', () => {
    const seq = { timebase: String(TPF), videoTracks: { numTracks: 2, 0: track([0, 30]), 1: track([10, 20]) }, audioTracks: { numTracks: 1, 0: track() } };
    const o = h.occupancy(seq);
    expect(o.video.map((t) => [t.track, t.items.map((c) => [c.startF, c.endF])])).toEqual([['V1', [[0, 750]]], ['V2', [[250, 500]]]]);
    expect(o.audio).toEqual([{ track: 'A1', items: [] }]);
  });

  it('trims through outPoint first, then end', () => {
    const order = [];
    const clip = {
      start: at(40), inPoint: at(3600),
      set outPoint(v) { order.push(['out', Number(v.ticks)]); },
      set end(v) { order.push(['end', Number(v.ticks)]); },
    };
    h.trimClip(clip, 375, TPF);
    expect(order).toEqual([['out', (3600 * 25 + 375) * TPF], ['end', (40 * 25 + 375) * TPF]]);
  });
});

describe('pr-helpers: project and MOGRT values', () => {
  it('walks bins, finds items by name and by media path', () => {
    const root = bin('root', [
      bin('CRT_Media', [clipItem('bars.mp4', 'C:\\CRBK\\work\\fixtures\\media\\bars.mp4')]),
      clipItem('loose.png', 'C:\\x\\loose.png'),
    ], 3);
    const h = load({ project: { rootItem: root, path: 'C:\\CRBK\\work\\pr\\CRT_pr_test.prproj' } });
    expect(h.projectIs('CRT_pr_test.prproj')).toBe(true);
    expect(h.projectIs('other.prproj')).toBe(false);
    expect(h.findItemByName('bars.mp4').nodeId).toBe('n-bars.mp4');
    expect(h.findItemByPath('C:/CRBK/work/fixtures/media/BARS.mp4').name).toBe('bars.mp4');
    expect(h.findItemByPath('C:/CRBK/work/none.mp4')).toBe(null);
    expect(h.projectTree().map((t) => t.path).sort()).toEqual(['/CRT_Media', '/CRT_Media/bars.mp4', '/loose.png']);
  });

  it('writes MOGRT text as JSON with one style run and reads it back', () => {
    const h = load();
    const param = {
      v: JSON.stringify({ textEditValue: 'Имя Фамилия', fontEditValue: ['SBSansDisplay-Semibold'], fontTextRunLength: [11] }),
      getValue() { return this.v; },
      setValue(v, ui) { this.v = v; this.ui = ui; return 0; },
    };
    const r = h.setMgtText(param, 'Анна-Мария Ёлкина');
    expect(r.runsBefore).toBe(1);
    expect(param.ui).toBe(1);
    expect(JSON.parse(param.v)).toEqual({ textEditValue: 'Анна-Мария Ёлкина', fontEditValue: ['SBSansDisplay-Semibold'], fontTextRunLength: [17] });
    expect(h.readMgtText(param)).toBe('Анна-Мария Ёлкина');
    expect(() => h.setMgtText({ getValue: () => '{"a":1}' }, 'x')).toThrow(/BK_NOT_AE_TEXT/);
    expect(h.readMgtText({ getValue: () => 'garbage' })).toBe(null);
  });

  it('matches a QE clip by name and start, skipping gaps', () => {
    const h = load();
    const items = [{ type: 'Empty', name: '' }, { type: 'Clip', name: 'slot_b.png', start: { secs: '10' } }, { type: 'Clip', name: 'slot_b.png', start: { secs: '40' } }];
    const qt = { numItems: items.length, getItemAt: (i) => items[i] };
    expect(h.qeItemFor(qt, 'slot_b.png', 40)).toBe(items[2]);
    expect(h.qeItemFor(qt, 'slot_b.png', 41)).toBe(null);
    expect(h.qeItemFor(qt, 'other', 10)).toBe(null);
  });
});

describe('pr-helpers: ES3', () => {
  it('passes the ES3 lint with no warning beyond the library tail', () => {
    expect(lintOrThrow(src)).toEqual([]);
  });
});
```

- [ ] **Step 10: Убедиться, что тест падает**

Run: `npx vitest run tests/spikes/pr-helpers.test.mjs`
Expected: FAIL — `Error: ENOENT: no such file or directory, open '…spikeslibpr-helpers.jsx'`.

- [ ] **Step 11: Создать `spikes/lib/pr-helpers.jsx`**

Что взято из рабочих проектов:
- `importFile` — опрос появления элемента, как `importToBin` в Phygital (`cep-premiere/host/host.jsx`);
- `exportFramePNG` — QE с таймкодом CTI, как в premiere-autopilot, и запасной `exportAsMediaDirect` на один кадр, как `exportTimelineFrame` в Phygital. Порядок аргументов QE — (таймкод, путь), как в premiere-autopilot на 26.3.2; в Phygital вызовы QE (путь, время) на 26.x молча возвращали false;
- `cloneSequence`, `placeClip`, `trimClip` — правила premiere-autopilot (клон находится по новому `sequenceID`, размещение на 1 мс внутрь кадра, длина через `outPoint`, потом `end`).

```js
// Premiere ExtendScript helpers for the BrandKit spikes (ES3). Loaded after spikes/lib/check.jsx:
//   files: ['spikes/lib/pr-helpers.jsx', 'spikes/<spike>/<stage>.jsx']   (S5, S6, S7; S8 may reuse them)
// Docs: https://ppro-scripting.docsforadobe.dev/ (Project, ProjectItem, Sequence, Track, TrackItem,
// Component, ComponentParam, Time). The QE DOM is undocumented: every QE call records what it did.
// Paths come in through PARAMS as ASCII with forward slashes; Premiere gets them as File(p).fsName.
//
// Time:     TICKS_PER_SECOND, secToTicks, ticksToSec, secToFrames, framesToTicks, ticksToFrames,
//           onFrameGrid, makeTime. tpf = ticks per frame = Number(sequence.timebase).
// Values:   strHas, endsWith, normPath, sameFsPath, truthy, describeValue
// Project:  projectIs, isBin, walkProject, findItemByName, findItemByNodeId, findItemByPath, projectTree,
//           ensureBin, importFile
// Sequence: findSequenceByName, findSequenceById, uniqueSequenceName, cloneSequence, activateSequence,
//           newSequenceFromPreset
// Tracks:   clipTimes, trackItems, occupancy, trackFreeAt, firstFreeTrack, clipStartingAt, placeClip, trimClip
// MOGRT:    importMogrt, mgtParamNames, mgtParam, setMgtText, readMgtText
// Effects:  componentList, componentByMatch, paramList
// QE:       ensureQE, qeItemFor
// Frames:   waitForFile, filesWithPrefix, exportFramePNG
// Undo:     undoBegin, undoEnd
// Stages:   projectCheck, workCloneCheck, workSeqCheck, frameCheck - check() wrappers that read PARAMS
//           projectFile, srcSeq, workBase, workSeq, workSeqId, framesDir, pngPreset, frameWaitMs.

var TICKS_PER_SECOND = 254016000000;

function secToTicks(sec) {
  return Math.round(Number(sec) * TICKS_PER_SECOND);
}

function ticksToSec(ticks) {
  return Number(ticks) / TICKS_PER_SECOND;
}

function secToFrames(sec, tpf) {
  return Math.round(Number(sec) * TICKS_PER_SECOND / Number(tpf));
}

function framesToTicks(frames, tpf) {
  return Math.round(frames) * Number(tpf);
}

function ticksToFrames(ticks, tpf) {
  return Math.round(Number(ticks) / Number(tpf));
}

function onFrameGrid(ticks, tpf) {
  return Number(ticks) % Number(tpf) === 0;
}

// Whole Time objects built from ticks: assigning .seconds on a clip's start is a silent no-op
// (premiere-autopilot SKILL.md, "Times, in/out points"). https://ppro-scripting.docsforadobe.dev/other/time/
function makeTime(ticks) {
  var t = new Time();
  t.ticks = String(ticks);
  return t;
}

function strHas(s, sub) {
  return String(s).split(sub).length > 1;
}

function endsWith(s, suffix) {
  var str = String(s);
  return str.length >= suffix.length && str.substr(str.length - suffix.length) === suffix;
}

function normPath(p) {
  return String(p).split('\\').join('/').toLowerCase();
}

function sameFsPath(a, b) {
  return normPath(a) === normPath(b);
}

function truthy(v) {
  return v === true || v === 1 || v === '1' || v === 'true';
}

// A host value made safe for the JSON answer: { type, value }.
function describeValue(v) {
  var t = typeof v;
  var s = '';
  if (v === null || t === 'undefined') {
    return { type: v === null ? 'null' : t, value: null };
  }
  if (t === 'object') {
    try { s = JSON.stringify(v); } catch (e) { s = String(v); }
    return { type: t, value: s };
  }
  return { type: t, value: v };
}

function projectIs(fileName) {
  var p = '';
  try { p = String(app.project.path); } catch (e) { p = ''; }
  return endsWith(normPath(p), '/' + String(fileName).toLowerCase());
}

// ProjectItem.type: 1 clip, 2 bin, 3 root, 4 file (Phygital cep-premiere host.jsx compares with 2).
function isBin(item) {
  return item.type === 2;
}

// Depth-first walk over bins; visit(item, treePath) returns true to stop the walk and get that item back.
function walkProject(visit) {
  var stack = [{ item: app.project.rootItem, path: '' }];
  var n, kids, count, i, c, p;
  while (stack.length) {
    n = stack.pop();
    kids = n.item.children;
    count = kids ? kids.numItems : 0;
    for (i = 0; i < count; i++) {
      c = kids[i];
      p = n.path + '/' + String(c.name);
      if (visit(c, p) === true) {
        return c;
      }
      if (isBin(c)) {
        stack.push({ item: c, path: p });
      }
    }
  }
  return null;
}

function findItemByName(name) {
  return walkProject(function (c) { return String(c.name) === name; });
}

function findItemByNodeId(nodeId) {
  return walkProject(function (c) { return String(c.nodeId) === String(nodeId); });
}

// ProjectItem.getMediaPath(): https://ppro-scripting.docsforadobe.dev/item/projectitem/
function findItemByPath(mediaPath) {
  var want = normPath(new File(mediaPath).fsName);
  return walkProject(function (c) {
    var mp = '';
    if (isBin(c)) {
      return false;
    }
    try { mp = String(c.getMediaPath()); } catch (e) { mp = ''; }
    return mp !== '' && normPath(mp) === want;
  });
}

function projectTree() {
  var out = [];
  walkProject(function (c, p) {
    out.push({ path: p, type: c.type, nodeId: String(c.nodeId) });
    return false;
  });
  return out;
}

function ensureBin(name) {
  var root = app.project.rootItem;
  var i, c;
  for (i = 0; i < root.children.numItems; i++) {
    c = root.children[i];
    if (isBin(c) && String(c.name) === name) {
      return c;
    }
  }
  return root.createBin(name);
}

// importFiles returns before the item exists and now and then drops a call (Phygital cep-premiere
// host.jsx, importToBin): poll for the item by its media path, import a second time only when the first
// call left nothing in the project. https://ppro-scripting.docsforadobe.dev/general/project/ (importFiles)
function importFile(path, bin, timeoutMs) {
  var t0 = new Date().getTime();
  var limit = timeoutMs || 8000;
  var item = findItemByPath(path);
  var attempts = 0;
  var deadline;
  if (item) {
    return { item: item, attempts: 0, ms: 0, reused: true };
  }
  while (!item && attempts < 2) {
    attempts += 1;
    app.project.importFiles([new File(path).fsName], true, bin, false);
    deadline = new Date().getTime() + limit;
    item = findItemByPath(path);
    while (!item && new Date().getTime() < deadline) {
      $.sleep(100);
      item = findItemByPath(path);
    }
  }
  return { item: item, attempts: attempts, ms: new Date().getTime() - t0, reused: false };
}

function findSequenceByName(name) {
  var seqs = app.project.sequences;
  var i;
  for (i = 0; i < seqs.numSequences; i++) {
    if (String(seqs[i].name) === name) {
      return seqs[i];
    }
  }
  return null;
}

function findSequenceById(id) {
  var seqs = app.project.sequences;
  var i;
  for (i = 0; i < seqs.numSequences; i++) {
    if (String(seqs[i].sequenceID) === String(id)) {
      return seqs[i];
    }
  }
  return null;
}

function uniqueSequenceName(base) {
  var n;
  if (!findSequenceByName(base)) {
    return base;
  }
  for (n = 2; n < 1000; n++) {
    if (!findSequenceByName(base + '_' + n)) {
      return base + '_' + n;
    }
  }
  return base + '_' + new Date().getTime();
}

// Sequence.clone() returns a Boolean; the copy is found by diffing sequenceIDs
// (premiere-autopilot panel-api-notes). https://ppro-scripting.docsforadobe.dev/sequence/sequence/ (clone)
function cloneSequence(src, baseName) {
  var known = {};
  var seqs = app.project.sequences;
  var name = uniqueSequenceName(baseName);
  var copy = null;
  var i, j, tries, rv;
  for (i = 0; i < seqs.numSequences; i++) {
    known[String(seqs[i].sequenceID)] = true;
  }
  rv = src.clone();
  for (tries = 0; tries < 20 && !copy; tries++) {
    seqs = app.project.sequences;
    for (j = 0; j < seqs.numSequences; j++) {
      if (!known[String(seqs[j].sequenceID)]) {
        copy = seqs[j];
        break;
      }
    }
    if (!copy) {
      $.sleep(100);
    }
  }
  if (copy) {
    copy.name = name;
  }
  return { seq: copy, name: copy ? String(copy.name) : null, id: copy ? String(copy.sequenceID) : null, rv: String(rv) };
}

// openSequence makes a sequence active; assigning activeSequence is the fallback premiere-autopilot uses.
// https://ppro-scripting.docsforadobe.dev/general/project/ (openSequence, activeSequence)
function activateSequence(seq) {
  var id = String(seq.sequenceID);
  var act = null;
  try { app.project.openSequence(id); } catch (e) { act = null; }
  act = app.project.activeSequence;
  if (act && String(act.sequenceID) === id) {
    return true;
  }
  try { app.project.activeSequence = seq; } catch (e2) { act = null; }
  act = app.project.activeSequence;
  return !!(act && String(act.sequenceID) === id);
}

// Project.newSequence(name, presetPath) returns a Sequence or 0; QE newSequence is the fallback (Adobe
// PProPanel, createSequenceFromPreset). https://ppro-scripting.docsforadobe.dev/general/project/
function newSequenceFromPreset(name, presetPath) {
  var how = [];
  var made = null;
  var seq;
  try {
    made = app.project.newSequence(name, new File(presetPath).fsName);
    how.push('dom: ' + (made ? 'sequence' : String(made)));
  } catch (e) {
    how.push('dom: ' + String(e));
  }
  seq = findSequenceByName(name);
  if (!seq && ensureQE()) {
    try {
      qe.project.newSequence(name, new File(presetPath).fsName);
      how.push('qe: called');
    } catch (e2) {
      how.push('qe: ' + String(e2));
    }
    seq = findSequenceByName(name);
  }
  return { seq: seq, how: how };
}

function clipTimes(clip, tpf) {
  return {
    startF: ticksToFrames(clip.start.ticks, tpf),
    endF: ticksToFrames(clip.end.ticks, tpf),
    inF: ticksToFrames(clip.inPoint.ticks, tpf),
    outF: ticksToFrames(clip.outPoint.ticks, tpf),
    onGrid: onFrameGrid(clip.start.ticks, tpf) && onFrameGrid(clip.end.ticks, tpf),
    startTicks: String(clip.start.ticks),
    endTicks: String(clip.end.ticks)
  };
}

function trackItems(track, tpf) {
  var out = [];
  var i, t;
  for (i = 0; i < track.clips.numItems; i++) {
    t = clipTimes(track.clips[i], tpf);
    t.name = String(track.clips[i].name);
    out.push(t);
  }
  return out;
}

function occupancy(seq) {
  var tpf = Number(seq.timebase);
  var out = { video: [], audio: [] };
  var v, a;
  for (v = 0; v < seq.videoTracks.numTracks; v++) {
    out.video.push({ track: 'V' + (v + 1), items: trackItems(seq.videoTracks[v], tpf) });
  }
  for (a = 0; a < seq.audioTracks.numTracks; a++) {
    out.audio.push({ track: 'A' + (a + 1), items: trackItems(seq.audioTracks[a], tpf) });
  }
  return out;
}

// True when no item of the track overlaps [startSec, endSec).
function trackFreeAt(track, startSec, endSec) {
  var s = secToTicks(startSec);
  var e = secToTicks(endSec);
  var i, c;
  for (i = 0; i < track.clips.numItems; i++) {
    c = track.clips[i];
    if (Number(c.start.ticks) < e && Number(c.end.ticks) > s) {
      return false;
    }
  }
  return true;
}

// Index of the first track, from fromIndex up, free over [startSec, endSec); -1 when there is none.
function firstFreeTrack(tracks, fromIndex, startSec, endSec) {
  var i;
  for (i = fromIndex; i < tracks.numTracks; i++) {
    if (trackFreeAt(tracks[i], startSec, endSec)) {
      return i;
    }
  }
  return -1;
}

function clipStartingAt(track, frame, tpf) {
  var i;
  for (i = 0; i < track.clips.numItems; i++) {
    if (ticksToFrames(track.clips[i].start.ticks, tpf) === frame) {
      return track.clips[i];
    }
  }
  return null;
}

// Overwrite onto one track at a whole frame. The docs give the time as a ticks string; premiere-autopilot
// places with a seconds number one millisecond into the frame, which lands exactly on it on 26.3
// (Edit_Skill scripts/gfxplace.mjs). https://ppro-scripting.docsforadobe.dev/sequence/track/ (overwriteClip)
function placeClip(track, item, startSec, tpf) {
  var f = secToFrames(startSec, tpf);
  track.overwriteClip(item, f * Number(tpf) / TICKS_PER_SECOND + 0.001);
  return { clip: clipStartingAt(track, f, tpf), startF: f };
}

// A placed clip made lenF frames long: outPoint first, then end. Assigning end alone lengthens the item
// and leaves outPoint (premiere-autopilot SKILL.md). The caller reads the clip back from its track.
// TrackItem start/end/inPoint/outPoint are read/write Time objects: https://ppro-scripting.docsforadobe.dev/item/trackitem/
function trimClip(clip, lenF, tpf) {
  var startT = Number(clip.start.ticks);
  var inT = Number(clip.inPoint.ticks);
  clip.outPoint = makeTime(inT + framesToTicks(lenF, tpf));
  clip.end = makeTime(startT + framesToTicks(lenF, tpf));
}

// importMGT(path, time as a ticks string, video track index, audio track index) returns a TrackItem and
// only overwrites. The clip is looked up on its track afterwards: a null return and a silent drop are both
// measured. https://ppro-scripting.docsforadobe.dev/sequence/sequence/ (importMGT)
function importMogrt(seq, mogrtPath, startSec, vIdx, aIdx, waitMs) {
  var tpf = Number(seq.timebase);
  var f = secToFrames(startSec, tpf);
  var track = seq.videoTracks[vIdx];
  var t0 = new Date().getTime();
  var rv = null;
  var err = null;
  var name = null;
  var clip, deadline;
  try {
    rv = seq.importMGT(new File(mogrtPath).fsName, String(framesToTicks(f, tpf)), vIdx, aIdx);
  } catch (e) {
    err = String(e);
  }
  try { name = rv ? String(rv.name) : null; } catch (e2) { name = 'EXC: ' + String(e2); }
  clip = track ? clipStartingAt(track, f, tpf) : null;
  deadline = new Date().getTime() + (waitMs || 2000);
  while (!clip && track && new Date().getTime() < deadline) {
    $.sleep(100);
    clip = clipStartingAt(track, f, tpf);
  }
  return {
    clip: clip,
    returned: rv ? true : false,
    returnedName: name,
    startF: f,
    lenF: clip ? ticksToFrames(clip.end.ticks, tpf) - f : null,
    ms: new Date().getTime() - t0,
    error: err
  };
}

// TrackItem.getMGTComponent(): the Component of a MOGRT's parameters, null for other clips.
// https://ppro-scripting.docsforadobe.dev/item/trackitem/
function mgtParamNames(clip) {
  var out = [];
  var comp = clip.getMGTComponent();
  var i;
  if (!comp) {
    return out;
  }
  for (i = 0; i < comp.properties.numItems; i++) {
    out.push(String(comp.properties[i].displayName));
  }
  return out;
}

// getParamForDisplayName is not in the official reference; Adobe's PProPanel sample uses it
// (github.com/Adobe-CEP/Samples, PProPanel/jsx/PPRO/Premiere.jsx, importMoGRT). The display names are
// the names our templates give in Essential Graphics, not localized UI strings.
function mgtParam(clip, displayName) {
  var comp = clip.getMGTComponent();
  var p = null;
  var i;
  if (!comp) {
    return null;
  }
  try { p = comp.properties.getParamForDisplayName(displayName); } catch (e) { p = null; }
  if (p) {
    return p;
  }
  for (i = 0; i < comp.properties.numItems; i++) {
    if (String(comp.properties[i].displayName) === displayName) {
      return comp.properties[i];
    }
  }
  return null;
}

// Source Text of an AE-made MOGRT reads as JSON: textEditValue plus fontTextRunLength per style run
// (Adobe community answers 2020-2024, not in the official reference). One style run per field (contract).
// setValue(value, updateUI): https://ppro-scripting.docsforadobe.dev/sequence/componentparam/
function setMgtText(param, text) {
  var raw = String(param.getValue());
  var obj = JSON.parse(raw);
  var runs;
  if (!obj || typeof obj !== 'object' || obj.textEditValue === undefined) {
    throw new Error('BK_NOT_AE_TEXT: ' + raw.substr(0, 80));
  }
  runs = obj.fontTextRunLength ? obj.fontTextRunLength.length : 0;
  obj.textEditValue = text;
  obj.fontTextRunLength = [text.length];
  return { rv: describeValue(param.setValue(JSON.stringify(obj), 1)), runsBefore: runs };
}

function readMgtText(param) {
  try { return JSON.parse(String(param.getValue())).textEditValue; } catch (e) { return null; }
}

// Component.matchName / displayName / properties: https://ppro-scripting.docsforadobe.dev/sequence/component/
function componentList(clip) {
  var out = [];
  var i, c;
  for (i = 0; i < clip.components.numItems; i++) {
    c = clip.components[i];
    out.push({ index: i, matchName: String(c.matchName), displayName: String(c.displayName) });
  }
  return out;
}

function componentByMatch(clip, matchName) {
  var i;
  for (i = 0; i < clip.components.numItems; i++) {
    if (String(clip.components[i].matchName) === matchName) {
      return clip.components[i];
    }
  }
  return null;
}

function paramList(component) {
  var out = [];
  var i, p, v;
  for (i = 0; i < component.properties.numItems; i++) {
    p = component.properties[i];
    v = null;
    try { v = p.getValue(); } catch (e) { v = 'EXC: ' + String(e); }
    out.push({ index: i, displayName: String(p.displayName), value: describeValue(v) });
  }
  return out;
}

// app.enableQE(): https://ppro-scripting.docsforadobe.dev/application/application/ (the QE DOM itself is undocumented)
function ensureQE() {
  try { app.enableQE(); } catch (e) { return false; }
  return typeof qe !== 'undefined' && !!qe && !!qe.project;
}

// QE track items include gaps as items of type "Empty" (pymiere docs). A clip is matched by name and,
// where QE reports it, by start.secs (as premiere-autopilot scripts read it).
function qeItemFor(qeTrack, name, startSec) {
  var i, it, s;
  for (i = 0; i < qeTrack.numItems; i++) {
    it = qeTrack.getItemAt(i);
    if (!it || String(it.type) === 'Empty' || String(it.name) !== String(name)) {
      continue;
    }
    s = NaN;
    try { s = parseFloat(it.start.secs); } catch (e) { s = NaN; }
    if (isNaN(s) || Math.abs(s - startSec) < 0.02) {
      return it;
    }
  }
  return null;
}

function waitForFile(path, timeoutMs) {
  var deadline = new Date().getTime() + timeoutMs;
  var f = new File(path);
  while (!(f.exists && f.length > 0) && new Date().getTime() < deadline) {
    $.sleep(100);
    f = new File(path);
  }
  return f.exists && f.length > 0;
}

function filesWithPrefix(dirPath, prefix) {
  var out = [];
  var folder = new Folder(dirPath);
  var all, i;
  if (!folder.exists) {
    return out;
  }
  all = folder.getFiles();
  for (i = 0; i < all.length; i++) {
    if (all[i] instanceof File && String(all[i].name).substr(0, prefix.length) === prefix && all[i].length > 0) {
      out.push(String(all[i].fsName).split('\\').join('/'));
    }
  }
  return out;
}

// One frame of `seq` as PNG; `frame` counts from the sequence start, outBase has no extension.
// 1) QE, as verified in premiere-autopilot (Edit_Skill SKILL.md "A frame", references/review-to-edit.md):
//    the DOM playhead to the frame, then exportFramePNG(CTI timecode, native path) on the QE sequence;
//    Premiere appends ".png"; past one hour QE returns the head of the sequence (frames stay under 1 h).
//    QE follows the active sequence, so its name is compared with ours first.
// 2) No file after waitMs: exportAsMediaDirect over a one-frame In/Out with the PNG still preset
//    (Phygital cep-premiere host.jsx, exportTimelineFrame); the still exporter appends a frame number.
// Returns { ok, file, method, tc, playhead, attempts }. Node still waits for a complete PNG (read-png).
function exportFramePNG(seq, frame, outBase, pngPreset, waitMs) {
  var res = { ok: false, file: null, method: null, tc: null, playhead: null, attempts: [] };
  var tpf = Number(seq.timebase);
  var limit = waitMs || 5000;
  var qs = null;
  var qname = '';
  var tries, parts, leaf, dir, oldIn, oldOut, rv, found;
  if (!activateSequence(seq)) {
    res.attempts.push('activate: failed');
    return res;
  }
  if (ensureQE()) {
    for (tries = 0; tries < 10 && !qs; tries++) {
      try { qs = qe.project.getActiveSequence(); } catch (e) { qs = null; }
      qname = qs ? String(qs.name) : '';
      if (qs && qs.name !== undefined && qname !== String(seq.name)) {
        qs = null;
        $.sleep(300);
      }
    }
    if (!qs) {
      res.attempts.push('qe: active sequence is "' + qname + '", not "' + String(seq.name) + '"');
    }
  } else {
    res.attempts.push('qe: unavailable');
  }
  if (qs) {
    try {
      // Sequence.setPlayerPosition(ticks string): https://ppro-scripting.docsforadobe.dev/sequence/sequence/
      seq.setPlayerPosition(String(framesToTicks(frame, tpf)));
      res.playhead = String(seq.getPlayerPosition().ticks);
      res.tc = String(qs.CTI.timecode);
      qs.exportFramePNG(res.tc, new File(outBase).fsName);
      if (waitForFile(outBase + '.png', limit)) {
        res.ok = true;
        res.file = outBase + '.png';
        res.method = 'qe';
        return res;
      }
      res.attempts.push('qe ' + res.tc + ': no file after ' + limit + ' ms');
    } catch (e2) {
      res.attempts.push('qe: ' + String(e2));
    }
  }
  if (!pngPreset) {
    res.attempts.push('direct: no PNG preset');
    return res;
  }
  parts = String(outBase).split('/');
  leaf = parts.pop() + '_direct';
  dir = parts.join('/');
  oldIn = null;
  oldOut = null;
  try { oldIn = seq.getInPointAsTime(); oldOut = seq.getOutPointAsTime(); } catch (e3) { oldIn = null; }
  try {
    // setInPoint takes seconds and rounds down: aim one millisecond into the frame (premiere-autopilot).
    seq.setInPoint(frame * tpf / TICKS_PER_SECOND + 0.001);
    seq.setOutPoint((frame + 1) * tpf / TICKS_PER_SECOND + 0.001);
    // workAreaType 1 = In/Out; active sequence and native paths only (premiere-autopilot SKILL.md).
    // https://ppro-scripting.docsforadobe.dev/sequence/sequence/ (exportAsMediaDirect)
    rv = seq.exportAsMediaDirect(new File(dir + '/' + leaf + '.png').fsName, new File(pngPreset).fsName, 1);
    found = filesWithPrefix(dir, leaf);
    if (found.length) {
      res.ok = true;
      res.file = found[0];
      res.method = 'direct: ' + String(rv);
    } else {
      res.attempts.push('direct: no file, returned ' + String(rv));
    }
  } catch (e4) {
    res.attempts.push('direct: ' + String(e4));
  }
  try {
    if (oldIn && Number(oldIn.ticks) >= 0) {
      seq.setInPoint(oldIn);
    }
    if (oldOut && Number(oldOut.ticks) >= 0) {
      seq.setOutPoint(oldOut);
    }
  } catch (e5) {
    res.attempts.push('restore In/Out: ' + String(e5));
  }
  return res;
}

// After Effects has undo groups; whether Premiere ExtendScript has them is measured in S5, so both calls
// are guarded. One Ctrl+Z per click is the goal of spec section 6 (the bridge).
function undoBegin(label) {
  if (typeof app.beginUndoGroup === 'function') {
    app.beginUndoGroup(label);
    return true;
  }
  return false;
}

function undoEnd(opened) {
  if (opened && typeof app.endUndoGroup === 'function') {
    app.endUndoGroup();
  }
}

// ---- Stage scaffolding: check() wrappers shared by the S5-S7 stages ----

function projectCheck() {
  return check('active project is ' + PARAMS.projectFile, function () {
    return { pass: projectIs(PARAMS.projectFile), detail: String(app.project.path) };
  });
}

// Clones PARAMS.srcSeq as PARAMS.workBase (then _2, _3 ...) and activates it; sets data.workSeq(Id).
function workCloneCheck(data) {
  var seq = null;
  var ok = check('work clone of ' + PARAMS.srcSeq + ' is active', function () {
    var src = findSequenceByName(PARAMS.srcSeq);
    var c;
    if (!src) {
      return { pass: false, detail: 'no sequence ' + PARAMS.srcSeq + ' (Task 15)' };
    }
    c = cloneSequence(src, PARAMS.workBase);
    seq = c.seq;
    data.workSeq = c.name;
    data.workSeqId = c.id;
    return { pass: !!seq && activateSequence(seq), detail: { name: c.name, id: c.id, rv: c.rv } };
  });
  return ok ? seq : null;
}

// The clone an earlier stage made: by PARAMS.workSeqId, else by PARAMS.workSeq (its name).
function workSeqCheck(data) {
  var seq = null;
  var ok = check('work sequence of an earlier stage is active', function () {
    if (PARAMS.workSeqId) {
      seq = findSequenceById(PARAMS.workSeqId);
    }
    if (!seq && PARAMS.workSeq) {
      seq = findSequenceByName(PARAMS.workSeq);
    }
    data.workSeq = seq ? String(seq.name) : null;
    data.workSeqId = seq ? String(seq.sequenceID) : null;
    return {
      pass: !!seq && activateSequence(seq),
      detail: { found: data.workSeq, wanted: PARAMS.workSeqId || PARAMS.workSeq || null }
    };
  });
  return ok ? seq : null;
}

// One frame into data.frames[key] = <PARAMS.framesDir>/<key>.png; `frame` counts from the sequence start.
function frameCheck(seq, data, key, frame) {
  return check('frame ' + key + ' (' + frame + ') exported', function () {
    var r = exportFramePNG(seq, frame, PARAMS.framesDir + '/' + key, PARAMS.pngPreset, PARAMS.frameWaitMs);
    if (!data.frames) {
      data.frames = {};
    }
    if (r.ok) {
      data.frames[key] = r.file;
    }
    return { pass: r.ok, detail: { method: r.method, tc: r.tc, playhead: r.playhead, attempts: r.attempts } };
  });
}
```

- [ ] **Step 12: Запустить тест и линтер**

Run: `npx vitest run tests/spikes/pr-helpers.test.mjs && node tools/jsx/lint-jsx.cjs spikes/lib/pr-helpers.jsx`
Expected: `10 passed`; `OK    spikes/lib/pr-helpers.jsx (1 warning(s))` — единственное предупреждение о последней строке: это библиотека, пробу завершает `finish(...)`.

- [ ] **Step 13: Создать `spikes/lib/pr-shots.jsx` (проба: кадры рабочей секвенции)**

```js
// Frames of a work sequence for the Node analysis (ES3, after spikes/lib/pr-helpers.jsx).
//   PARAMS.shots = [{ key, frame }]: frame counted from the sequence start, PNG to <framesDir>/<key>.png.
//   PARAMS.workSeqId / workSeq: the clone an earlier stage made.
var SHOTS = { frames: {} };
var shotsSeq = null;

if (projectCheck()) {
  shotsSeq = workSeqCheck(SHOTS);
}

if (shotsSeq) {
  for (var shotI = 0; shotI < PARAMS.shots.length; shotI++) {
    frameCheck(shotsSeq, SHOTS, PARAMS.shots[shotI].key, PARAMS.shots[shotI].frame);
  }
}

finish(SHOTS);
```

Run: `node tools/jsx/lint-jsx.cjs spikes/lib/pr-shots.jsx`
Expected: `OK    spikes/lib/pr-shots.jsx (1 warning(s))`.

- [ ] **Step 14: Создать пробу фикстуры `spikes/fixtures/pr/build-seq.jsx`**

```js
// Task 15: the Premiere fixture in the open project CRT_pr_test.prproj (ES3, after pr-helpers.jsx).
// Sequence CRT_Seq_1080p25 from the HD 1080p 25 fps preset; bars on V1 at 0-30 s, bars2 on V2 at 10-20 s;
// both files in the bin CRT_Media. A sequence of that name that exists already is only checked.
var P = PARAMS;
var data = { existed: false };
var tpf = Number(P.tpf);
var seq = null;
var bin = null;
var bars = null;
var bars2 = null;

var inProject = check('active project is ' + P.projectFile, function () {
  return { pass: projectIs(P.projectFile), detail: String(app.project.path) };
});

if (inProject) {
  seq = findSequenceByName(P.seqName);
  data.existed = !!seq;
}

if (inProject && !data.existed) {
  check('media bin ' + P.binName + ' ready', function () {
    bin = ensureBin(P.binName);
    return { pass: !!bin, detail: bin ? String(bin.name) : 'createBin returned 0' };
  });
}

if (bin) {
  check('bars_1080p25_30s.mp4 imported', function () {
    var r = importFile(P.bars, bin, 8000);
    bars = r.item;
    return { pass: !!bars, detail: { attempts: r.attempts, ms: r.ms, reused: r.reused } };
  });
  check('bars2_1080p25_10s.mp4 imported', function () {
    var r = importFile(P.bars2, bin, 8000);
    bars2 = r.item;
    return { pass: !!bars2, detail: { attempts: r.attempts, ms: r.ms, reused: r.reused } };
  });
  check('sequence ' + P.seqName + ' created from the HD 1080p 25 fps preset', function () {
    var r = newSequenceFromPreset(P.seqName, P.preset);
    seq = r.seq;
    return { pass: !!seq, detail: r.how };
  });
}

if (seq) {
  data.sequenceId = String(seq.sequenceID);
  check('fixture sequence is active', function () {
    return activateSequence(seq);
  });
  check('sequence is 1920x1080 at 25 fps', function () {
    var w = seq.frameSizeHorizontal;
    var h = seq.frameSizeVertical;
    return { pass: w === 1920 && h === 1080 && Number(seq.timebase) === tpf, detail: { w: w, h: h, timebase: String(seq.timebase) } };
  });
}

if (seq && !data.existed && bars && bars2) {
  check('bars placed on V1 at 0 s', function () {
    var r = placeClip(seq.videoTracks[0], bars, 0, tpf);
    return { pass: !!r.clip, detail: r.startF };
  });
  check('bars2 placed on V2 at 10 s', function () {
    var r = placeClip(seq.videoTracks[1], bars2, 10, tpf);
    return { pass: !!r.clip, detail: r.startF };
  });
}

if (seq) {
  data.occupancy = occupancy(seq);
  data.tracks = { video: seq.videoTracks.numTracks, audio: seq.audioTracks.numTracks };
  check('V1 holds exactly bars, frames 0-750 (0-30 s)', function () {
    var it = trackItems(seq.videoTracks[0], tpf);
    return { pass: it.length === 1 && it[0].startF === 0 && it[0].endF === 750, detail: it };
  });
  check('V2 holds exactly bars2, frames 250-500 (10-20 s)', function () {
    var it = trackItems(seq.videoTracks[1], tpf);
    return { pass: it.length === 1 && it[0].startF === 250 && it[0].endF === 500, detail: it };
  });
  check('V3 exists and is empty (S5-S7 place their clips there)', function () {
    var n = seq.videoTracks.numTracks;
    return { pass: n >= 3 && seq.videoTracks[2].clips.numItems === 0, detail: data.tracks };
  });
}

if (seq && !data.existed) {
  check('project saved', function () {
    return { pass: true, detail: describeValue(app.project.save()) };
  }, false);
}

finish(data);
```

- [ ] **Step 15: Создать `spikes/fixtures/pr/build.mjs` и проверить пробу без Premiere**

Перед вызовом хоста Node проверяет медиа задачи 7 через ffprobe: если файл не тот, Premiere его не увидит.

```js
#!/usr/bin/env node
// Task 15: the Premiere fixture in the open project CRT_pr_test.prproj (BrandKit Dev panel, CDP 8096).
//   node spikes/fixtures/pr/build.mjs           build it, or only check it when the sequence exists
//   node spikes/fixtures/pr/build.mjs --check   compose and lint the probe with real PARAMS, no host
// Writes spikes/fixtures/pr/fixture.json: the checks, the sequence ID and the track occupancy.
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { lintOrThrow } from '../../../tools/host-run.mjs';
import { composeProbe, REPO } from '../../../tools/spike/runner.mjs';
import { runStage } from '../../../tools/spike/multistage.mjs';
import { workPath } from '../../../tools/lib/work.mjs';
import { hasBinary, probeMedia } from '../../../tools/lib/media-probe.mjs';
import {
  PR_PROJECT_FILE, PR_FIXTURE_SEQ, PR_MEDIA_BIN, TPF_25, presetSources, stagePreset, fixtureMedia,
} from '../../../tools/pr/env.mjs';

const FILES = ['spikes/lib/pr-helpers.jsx', 'spikes/fixtures/pr/build-seq.jsx'];
const OUT = path.join(REPO, 'spikes', 'fixtures', 'pr', 'fixture.json');
const MEDIA = [
  { name: 'bars_1080p25_30s.mp4', sec: 30 },
  { name: 'bars2_1080p25_10s.mp4', sec: 10 },
];
const checkOnly = process.argv.includes('--check');

// Task 7 media, checked before Premiere sees them.
function mediaProblems() {
  if (!hasBinary('ffprobe')) return ['ffprobe not found: install ffmpeg (ffprobe -version must work)'];
  const out = [];
  for (const m of MEDIA) {
    const f = fixtureMedia(m.name);
    if (!existsSync(f)) {
      out.push('missing ' + f + ' (part B, Task 7)');
      continue;
    }
    const s = probeMedia(f);
    const v = s.video || {};
    if (v.width !== 1920 || v.height !== 1080 || Math.abs(v.fps - 25) > 0.01 || Math.abs(s.duration - m.sec) > 0.1) {
      out.push(m.name + ': ' + JSON.stringify({ w: v.width, h: v.height, fps: v.fps, duration: s.duration })
        + ', expected 1920x1080, 25 fps, ' + m.sec + ' s');
    }
  }
  return out;
}

const params = {
  projectFile: PR_PROJECT_FILE,
  seqName: PR_FIXTURE_SEQ,
  binName: PR_MEDIA_BIN,
  tpf: TPF_25,
  preset: checkOnly ? workPath('pr', 'presets', 'HD_1080p_25fps.sqpreset')
    : stagePreset(presetSources().seq1080p25, 'HD_1080p_25fps.sqpreset'),
  bars: fixtureMedia('bars_1080p25_30s.mp4'),
  bars2: fixtureMedia('bars2_1080p25_10s.mp4'),
};

if (checkOnly) {
  lintOrThrow(composeProbe(FILES, params));
  console.log('OK build-seq.jsx composed with real PARAMS and linted');
} else {
  const problems = mediaProblems();
  if (problems.length) {
    for (const p of problems) console.error(p);
    process.exitCode = 2;
  } else {
    const r = await runStage({ host: 'pr', files: FILES, params, timeoutMs: 180000 });
    writeFileSync(OUT, JSON.stringify({ date: new Date().toISOString().slice(0, 10), hostVersion: r.hostVersion,
      checks: r.checks, data: r.data }, null, 2) + '\n', 'utf8');
    for (const c of r.checks) {
      console.log((c.pass ? 'PASS ' : 'FAIL ') + c.name + (c.pass ? '' : ' - ' + JSON.stringify(c.detail)));
    }
    for (const t of (r.data.occupancy ? r.data.occupancy.video.concat(r.data.occupancy.audio) : [])) {
      console.log(t.track + ': ' + (t.items.map((i) => i.name + ' ' + i.startF + '-' + i.endF).join(', ') || 'empty'));
    }
    const bad = r.checks.filter((c) => c.required !== false && !c.pass);
    console.log(bad.length ? 'fixture NOT ready' : 'fixture ready (' + (r.data.existed ? 'checked' : 'built') + '): ' + OUT);
    process.exitCode = bad.length ? 1 : 0;
  }
}
```

Run: `node tools/jsx/lint-jsx.cjs spikes/fixtures/pr/build-seq.jsx && node spikes/fixtures/pr/build.mjs --check`
Expected: `OK    spikes/fixtures/pr/build-seq.jsx (1 warning(s))`, затем `OK build-seq.jsx composed with real PARAMS and linted`.

- [ ] **Step 16: Подготовить Premiere (вручную)**

1. Premiere Pro 2026: закрыть все проекты (File → Close Project), чтобы `app.project` был нужным.
2. Создать папку: Run: `mkdir -p C:/CRBK/work/pr`
3. File → New → Project…: Project name `CRT_pr_test`, Project location → Choose location… → `C:\CRBK\work\pr`. Если справа включён «Create new sequence» — выключить. Create. Затем File → Save.
4. Window → Extensions → «BrandKit Dev»: панель показывает `evalScript OK`.
5. Проверить хост:

Run: `node tools/host-run.mjs --host pr "JSON.stringify({ v: String(app.version), path: String(app.project.path) })"`
Expected: `"v": "26.5.2…"`, `path` оканчивается на `CRT_pr_test.prproj`.

- [ ] **Step 17: Построить фикстуру**

Run: `node spikes/fixtures/pr/build.mjs`
Expected (до минуты):

```text
PASS active project is CRT_pr_test.prproj
PASS media bin CRT_Media ready
PASS bars_1080p25_30s.mp4 imported
PASS bars2_1080p25_10s.mp4 imported
PASS sequence CRT_Seq_1080p25 created from the HD 1080p 25 fps preset
PASS fixture sequence is active
PASS sequence is 1920x1080 at 25 fps
PASS bars placed on V1 at 0 s
PASS bars2 placed on V2 at 10 s
PASS V1 holds exactly bars, frames 0-750 (0-30 s)
PASS V2 holds exactly bars2, frames 250-500 (10-20 s)
PASS V3 exists and is empty (S5-S7 place their clips there)
PASS project saved
V1: bars_1080p25_30s.mp4 0-750
V2: bars2_1080p25_10s.mp4 250-500
V3: empty
A1: empty
…
fixture ready (built): …\spikes\fixtures\pr\fixture.json
```

Строки `A1…` перечисляют аудиодорожки пресета; у файлов задачи 7 звука нет, поэтому дорожки пустые.

Если вывод начинается с `missing …` или `… expected 1920x1080, 25 fps` — сначала задача 7 (часть B). При `CDP_TIMEOUT` — посмотреть, нет ли в Premiere окна, закрыть его и проверить хост командой шага 16.

- [ ] **Step 18: Повторный запуск только проверяет**

Run: `node spikes/fixtures/pr/build.mjs`
Expected: шесть строк `PASS` (проект, активная секвенция, размер и fps, V1, V2, V3) и `fixture ready (checked): …`. Ничего не импортируется и не ставится второй раз.

- [ ] **Step 19: Commit**

```bash
git add tools/pr/env.mjs tools/spike/multistage.mjs spikes/lib/pr-helpers.jsx spikes/lib/pr-shots.jsx spikes/fixtures/pr/build-seq.jsx spikes/fixtures/pr/build.mjs spikes/fixtures/pr/fixture.json tests/tools/pr-env.test.mjs tests/tools/multistage.test.mjs tests/spikes/pr-helpers.test.mjs
git commit -m "feat(spikes): Premiere fixture and shared helpers for S5-S7" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 16: S5 — importMGT и запись полей (CEP)

S5 отвечает на вопросы §3.1 и §6.1: куда и как ложится MOGRT, пишутся ли поля, держит ли явная длина анимацию, как часто вставка молча не выполняется, сколько шагов отмены.

Раскладка в клоне `CRT_S5_work` секвенции фикстуры (секунды):

| Где | Что | Зачем |
|---|---|---|
| V2, 12 с | LowerThird поверх `bars2` | `importMGT` перезаписывает занятое место |
| V3, 40 с | L1 — LowerThird: имя, должность, флажок, слайдер, цвет; длина 15 с | запись полей, явная длина у `rdt` |
| V3, 60 с | L2 — LowerThird: список «Стиль» | основание индекса списка (0 или 1) |
| V3, 75 с | L3 — LowerThird по умолчанию | эталон для кадров |
| V3, 90 с | Hatch: обрезан до 12 с, «Длительность» = 12 | шаблон `trim` |
| V3, с 900 с | по одной вставке на каждый подсчёт отмены | шаги отмены (вручную) |
| V3, с 200 с, свой клон `CRT_S5_series` | серия из 50 LowerThird | доля молча невыполненных вставок, длина по умолчанию |

**Кадры** — те же моменты, что в S3 (часть C), от начала каждого клипа:

| Кадр | Секунды в клипе | Что должно быть |
|---|---|---|
| `l1Intro` 1012 | 0,48 | PROBE_SQ x ≈ 148: интро идёт с исходной скоростью |
| `l1Outro` 1362 | 14,48 из 15 | x ≈ 248, если Premiere растягивает только середину (`rdt`); 265 — равномерное растяжение; 300 — держит последний кадр |
| `l1Hold`, `l2Hold`, `l3Hold` | 5 | плашка, имя и должность в покое |
| `hatchHold` 2512 | 10,48 | x ≈ 100 при «Длительности» 12 (200, если значение не дошло) |
| `hatchOut` 2537 | 11,48 | x ≈ 148 («11,5 с» на сетке 25p — кадр 287, как в S3) |

Слайдера «минуты» в фикстуре нет: слайдер пишется тем же путём, что «Длительность».

**Обязательные и информационные проверки.** Обязательные: вставка на свободную V3, найденные параметры, запись и чтение назад текста (кириллица), флажка, слайдера и списка, явная длина 15 с, обрезка Hatch, кадры (`rdt`, «Длительность», плашка, должность, стиль), чтение назад в новом вызове. Информационные: перезапись на V2, наличие `app.beginUndoGroup`, цвет, слот «Фото», ΔE патча, итоги серии и пересчёта.

**Files:**
- Create: `spikes/s5-importmgt/analyze.mjs`, `spikes/s5-importmgt/stage-insert.jsx`, `spikes/s5-importmgt/stage-readback.jsx`, `spikes/s5-importmgt/stage-series.jsx`, `spikes/s5-importmgt/stage-count.jsx`, `spikes/s5-importmgt/stage-undo.jsx`, `spikes/s5-importmgt/run.mjs`
- Test: `tests/spikes/s5-analyze.test.mjs`
- Create (прогоном): `spikes/results/S5.json`, `spikes/results/S5.data.json`
- Modify (генерируется `npm run spike:report`): `spikes/RESULTS.md`

- [ ] **Step 1: MOGRT от S2 на месте, иначе экспортировать вручную**

Run: `ls -la C:/CRBK/work/mogrt/`
Expected: `CRT_LowerThird_v1.mogrt` и `CRT_Hatch_v1.mogrt`, оба больше нуля байт.

Если файлов нет или итог S2 — `no` (`spikes/results/S2.json`), экспортировать их из AE (вручную):
1. After Effects 2026 → File → Open Project… → `C:\CRBK\work\fixtures\CRT_fixture_egp.aep`.
2. Двойной щелчок по `CRT_LowerThird_v1` в панели Project. Window → Essential Graphics. В панели: Primary — `CRT_LowerThird_v1`, Name — `CRT_LowerThird_v1`. В списке — семь свойств в этом порядке: `Имя`, `Должность`, `Показать должность`, `Длительность (служебное, не менять)`, `Акцент`, `Стиль`, `Фото`. Недостающее — перетащить из Timeline и переименовать двойным щелчком (что откуда перетаскивать — в таблице шага 1 задачи 14, часть C).
3. Внизу панели Export Motion Graphics Template… → Destination: Local Drive → Browse… → `C:\CRBK\work\mogrt` → OK. Если AE спросит о сохранении проекта — Save.
4. То же для `CRT_Hatch_v1` (Primary и Name `CRT_Hatch_v1`, одно свойство `Длительность (служебное, не менять)`) → `C:\CRBK\work\mogrt\CRT_Hatch_v1.mogrt`.
5. Повторить команду `ls` выше. После прогона S5 (шаг 12) записать отметку:

Run: `node tools/spike/manual.mjs --id S5 --check "MOGRT exported by hand (S2 fallback)" --pass true --detail "S2 verdict no; both files exported from CRT_fixture_egp.aep" --optional`
Expected: `S5: <итог> (<n> checks)`.

- [ ] **Step 2: Написать падающий тест `tests/spikes/s5-analyze.test.mjs`**

Тест рисует синтетические кадры с геометрией фикстуры части B: PROBE_SQ, плашка, строка должности, цветовой патч.

```js
import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import {
  shotPlan, frameChecks, indexBase, seriesStep, seriesSummary, seriesChecks, recountChecks,
} from '../../spikes/s5-importmgt/analyze.mjs';

// Synthetic 1920x1080 frames on black, painted with the fixture geometry (part B contract).
function frame(rects) {
  const img = new PNG({ width: 1920, height: 1080 });
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
  for (const [x0, y0, w, h, [r, g, b]] of rects) {
    for (let y = y0; y < y0 + h; y += 1) {
      for (let x = x0; x < x0 + w; x += 1) {
        const i = (y * 1920 + x) * 4;
        img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b;
      }
    }
  }
  return img;
}
const MAGENTA = [255, 0, 255];
const DARK = [34, 34, 34];
const LIGHT = [242, 242, 242];
const WHITE = [255, 255, 255];
const QA = [38, 208, 124];
const probe = (cx) => [cx - 20, 80, 40, 40, MAGENTA]; // PROBE_SQ 40x40 centred on (cx, 100)
const patch = [1770, 50, 100, 100, QA]; // QA_PATCH 100x100 centred on (1820, 100)
const role = [200, 845, 180, 25, WHITE]; // the role line under the plate

const good = () => ({
  l1Intro: frame([probe(148)]),
  l1Outro: frame([probe(248)]),
  l1Hold: frame([[160, 720, 1300, 130, DARK], patch]),
  l2Hold: frame([[160, 720, 480, 130, LIGHT], role, patch]),
  l3Hold: frame([[160, 720, 480, 130, DARK], role, patch]),
  hatchHold: frame([probe(100)]),
  hatchOut: frame([probe(148)]),
});
const INS = {
  writes: { showRole: { written: { type: 'boolean', value: false } } },
  style: { before: { type: 'number', value: 1 }, written: 2 },
};

describe('S5 frame plan', () => {
  it('takes the S3 moments relative to each clip start', () => {
    expect(shotPlan().map((s) => [s.key, s.frame])).toEqual([
      ['l1Intro', 1012], ['l1Outro', 1362], ['l1Hold', 1125], ['l2Hold', 1625],
      ['l3Hold', 2000], ['hatchHold', 2512], ['hatchOut', 2537],
    ]);
  });
});

describe('S5 frame checks', () => {
  it('passes when Premiere honours RDT, the trim, every write and the colour', () => {
    const r = frameChecks(good(), INS);
    expect(r.checks.filter((c) => !c.pass)).toEqual([]);
    expect(r.data.dropdown.base).toBe('one-based');
    expect(r.data.intro.explainedBy).toEqual(['rdt', 'none']);
  });

  it('names a uniform stretch, a held last frame and an ignored Duration', () => {
    const img = { ...good(), l1Outro: frame([probe(265)]), hatchOut: frame([probe(200)]) };
    const r = frameChecks(img, INS);
    const failed = r.checks.filter((c) => !c.pass).map((c) => c.name);
    expect(failed).toHaveLength(2);
    expect(r.data.outro.explainedBy).toEqual(['uniform']);
    expect(r.data.hatchOut).toMatchObject({ x: 200, expected: 148, ifDurationIgnored: 200 });
    const held = frameChecks({ ...good(), l1Outro: frame([probe(300)]) }, INS);
    expect(held.data.outro.heldLastFrame).toBe(true);
  });

  it('fails the render checks when a write did not reach the picture', () => {
    const img = { ...good(), l1Hold: frame([[160, 720, 480, 130, DARK], role]), l2Hold: frame([[160, 720, 480, 130, DARK]]) };
    const failed = frameChecks(img, INS).checks.filter((c) => !c.pass).map((c) => c.name);
    expect(failed).toEqual([
      'render: the written name widens the plate (L1 against L3)',
      'render: the checkbox write hides the role line',
      'render: the dropdown write turns the plate light; index base one-based',
    ]);
  });

  it('reads the index base from the default value', () => {
    expect(indexBase({ type: 'number', value: 0 })).toBe('zero-based');
    expect(indexBase(1)).toBe('one-based');
    expect(indexBase({ type: 'boolean', value: false })).toBe('unknown');
    expect(indexBase(null)).toBe('unknown');
  });
});

describe('S5 series', () => {
  const rows = [
    { i: 0, startF: 5000, found: true, returned: true, lenF: 250, ms: 400 },
    { i: 1, startF: 5300, found: false, returned: true, lenF: null, ms: 2100 },
    { i: 2, startF: 5600, found: true, returned: true, lenF: 250, ms: 300 },
  ];

  it('spaces the inserts by the default length', () => {
    expect(seriesStep(250)).toBe(12);
    expect(seriesStep(null)).toBe(12);
    expect(seriesStep(1500)).toBe(62);
  });

  it('counts drops, lengths and return-value mismatches', () => {
    expect(seriesSummary(rows)).toEqual({
      total: 3, landed: 2, dropped: 1, dropRate: 0.333, returnMismatch: 1, lengths: { 250: 2 }, meanMs: 933,
    });
    const r = seriesChecks(rows, { stepSec: 12 });
    expect(r.checks.map((c) => [c.pass, c.required])).toEqual([[false, false], [true, false], [false, false]]);
    expect(r.note).toContain('1 not on the track within 2 s (33.3 %)');
  });

  it('finds clips that arrived late and clips that vanished', () => {
    const r = recountChecks(rows, { 5300: 250, 5600: 250 });
    expect(r.late).toEqual([1]);
    expect(r.checks.map((c) => c.pass)).toEqual([false, false, true]);
    expect(r.note).toBe('recount: 2 of 3 on the track, late 1, gone 1');
  });
});
```

- [ ] **Step 3: Убедиться, что тест падает**

Run: `npx vitest run tests/spikes/s5-analyze.test.mjs`
Expected: FAIL — `Cannot find module '../../spikes/s5-importmgt/analyze.mjs'`.

- [ ] **Step 4: Создать `spikes/s5-importmgt/analyze.mjs`**

Модели `rdt`, равномерного растяжения и Hatch берутся из S3 (`spikes/s3-instance/analyze.mjs`); здесь только моменты в клипах Premiere и разбор серии.

```js
// S5 analysis (pure, unit-tested in tests/spikes/s5-analyze.test.mjs): where the stages put the clips,
// which frames are exported, and what the frames and the insert series say. The LowerThird and Hatch
// models come from S3 (part C, spikes/s3-instance/analyze.mjs), so AE and Premiere are measured at the
// same moments of the same templates.
import {
  FPS, LT, FRAMES, REGIONS, COLORS, TOL_PX, expectedLtX, describeLt, nearX, hatchX, frameTime, round,
} from '../s3-instance/analyze.mjs';
import { findColorCentroid, meanColor } from '../../tools/png/read-png.mjs';
import { deltaE2000Rgb, hexToRgb, rgbToHex } from '../../tools/color/deltae.mjs';
import { nodeCheck } from '../../tools/spike/multistage.mjs';

// Seconds on the work clone. Bars on V1 end at 30 s, so the clips on V3 from 40 s stand on black.
export const AT = { overwrite: 12, l1: 40, l2: 60, l3: 75, hatch: 90 };
export const RDT_SEC = 15; // explicit length of L1, the RDT LowerThird
export const HATCH_SEC = 12; // trimmed length of the Hatch, also written to its Duration slider
export const HATCH_DEFAULT_DURATION = 10; // CTRL Duration of CRT_Hatch_v1 in the fixture
export const SERIES = { startSec: 200, count: 50, minStepSec: 12, vIdx: 2 };

// Clip-local frames, taken from S3, where the LowerThird starts at LT.start and the Hatch at 0.
export const LOCAL = {
  intro: FRAMES.intro - LT.start * FPS, // 12 = 0.48 s
  outro: FRAMES.outro - LT.start * FPS, // 362 = 14.48 s of the 15 s clip
  hold: 125, // 5 s: plate, text and role at rest
  hatchHold: FRAMES.hatchHold, // 262 = 10.48 s
  hatchOut: FRAMES.hatchOut, // 287 = 11.48 s ("11.5 s" on the 25p grid)
};

// TXT_NAME (baseline 200, 800; 60 px) on PL_NAME (sourceRectAtTime + 40 px): the plate lies in this band.
export const NAME_BAND = { x: 0, y: 690, w: 1920, h: 190 };

const truthy = (v) => v === true || v === 1 || v === '1' || v === 'true';

export function shotPlan(at = AT) {
  const f = (sec) => Math.round(sec * FPS);
  return [
    { key: 'l1Intro', frame: f(at.l1) + LOCAL.intro },
    { key: 'l1Outro', frame: f(at.l1) + LOCAL.outro },
    { key: 'l1Hold', frame: f(at.l1) + LOCAL.hold },
    { key: 'l2Hold', frame: f(at.l2) + LOCAL.hold },
    { key: 'l3Hold', frame: f(at.l3) + LOCAL.hold },
    { key: 'hatchHold', frame: f(at.hatch) + LOCAL.hatchHold },
    { key: 'hatchOut', frame: f(at.hatch) + LOCAL.hatchOut },
  ];
}

export function probeAt(img) {
  return img ? findColorCentroid(img, COLORS.probe, 10) : { x: null, y: null, count: 0, box: null };
}

const plate = (img, hex) => findColorCentroid(img, hex, 6, { region: NAME_BAND });
const whiteInRole = (img) => findColorCentroid(img, COLORS.white, 4, { region: REGIONS.role }).count;

// The template default of Style is its first item (Dark): read back as 0 or 1 it gives the index base.
export function indexBase(before) {
  const v = before && typeof before === 'object' && 'value' in before ? before.value : before;
  if (typeof v !== 'number' && !(typeof v === 'string' && /^\d+$/.test(v))) return 'unknown';
  if (Number(v) === 0) return 'zero-based';
  if (Number(v) === 1) return 'one-based';
  return 'unknown';
}

// img: { key: decoded 1920x1080 PNG } for the frames of shotPlan(); ins: data of stage "insert".
export function frameChecks(img, ins = {}) {
  const checks = [];
  const data = {};

  const intro = probeAt(img.l1Intro);
  data.intro = describeLt(FRAMES.intro, intro);
  checks.push(nodeCheck('RDT LowerThird made 15 s long: the intro keeps its speed (PROBE_SQ x~148 at 0.48 s)',
    nearX(intro, expectedLtX(FRAMES.intro, 'rdt')), data.intro));
  const outro = probeAt(img.l1Outro);
  data.outro = { ...describeLt(FRAMES.outro, outro), heldLastFrame: outro.count > 0 && Math.abs(outro.x - 300) <= TOL_PX };
  checks.push(nodeCheck('RDT LowerThird made 15 s long: the outro keeps its speed (PROBE_SQ x~248 at 14.48 s)',
    nearX(outro, expectedLtX(FRAMES.outro, 'rdt')), data.outro));

  for (const [key, frame] of [['hatchHold', FRAMES.hatchHold], ['hatchOut', FRAMES.hatchOut]]) {
    const m = probeAt(img[key]);
    const t = frameTime(frame);
    const d = {
      localFrame: frame, x: round(m.x), count: m.count,
      expected: round(hatchX(t, HATCH_SEC)), ifDurationIgnored: round(hatchX(t, HATCH_DEFAULT_DURATION)),
    };
    data[key] = d;
    checks.push(nodeCheck('Hatch trimmed to 12 s, Duration 12: PROBE_SQ x~' + d.expected + ' at ' + round(t) + ' s',
      nearX(m, hatchX(t, HATCH_SEC)), d));
  }

  if (img.l1Hold && img.l3Hold) {
    const w = plate(img.l1Hold, COLORS.plateDark);
    const d = plate(img.l3Hold, COLORS.plateDark);
    data.plates = { written: w.box, defaults: d.box };
    checks.push(nodeCheck('render: the written name widens the plate (L1 against L3)',
      Boolean(w.box && d.box) && w.box.w - d.box.w >= 250, data.plates));
    const sw = ins.writes && ins.writes.showRole;
    const hidden = !(sw && sw.written && truthy(sw.written.value));
    data.role = { written: whiteInRole(img.l1Hold), defaults: whiteInRole(img.l3Hold), expectHidden: hidden };
    checks.push(nodeCheck('render: the checkbox write ' + (hidden ? 'hides' : 'shows') + ' the role line',
      data.role.defaults >= 50 && (hidden ? data.role.written === 0 : data.role.written >= 50), data.role));
  } else {
    checks.push(nodeCheck('render: hold frames of L1 and L3 present', false, Object.keys(img)));
  }

  if (img.l2Hold && img.l3Hold) {
    const st = ins.style || {};
    const base = indexBase(st.before);
    data.dropdown = {
      base, readDefault: st.before === undefined ? null : st.before, written: st.written === undefined ? null : st.written,
      lightOnL2: plate(img.l2Hold, COLORS.plateLight).count, darkOnL3: plate(img.l3Hold, COLORS.plateDark).count,
    };
    checks.push(nodeCheck('render: the dropdown write turns the plate light; index base ' + base,
      data.dropdown.lightOnL2 >= 1000 && data.dropdown.darkOnL3 >= 1000 && base !== 'unknown', data.dropdown));
  } else {
    checks.push(nodeCheck('render: hold frames of L2 and L3 present', false, Object.keys(img)));
  }

  if (img.l3Hold) {
    const m = meanColor(img.l3Hold, REGIONS.patch);
    const de = deltaE2000Rgb(m, hexToRgb(COLORS.qa));
    data.patch = { mean: rgbToHex(m), alpha: round(m.a, 1), dE: round(de, 3) };
    checks.push(nodeCheck('colour patch in Premiere: dE2000 <= 2 against #26D07C', de <= 2, data.patch, false));
  }
  return { checks, data };
}

// Step between the series inserts: the default length plus 2 s, at least 12 s, so no insert overwrites
// the one before it.
export function seriesStep(defaultFrames) {
  const sec = defaultFrames > 0 ? defaultFrames / FPS : 10;
  return Math.max(SERIES.minStepSec, Math.ceil(sec) + 2);
}

export function seriesSummary(rows) {
  const total = rows.length;
  const landed = rows.filter((r) => r.found).length;
  const lengths = {};
  for (const r of rows) if (r.found) lengths[r.lenF] = (lengths[r.lenF] || 0) + 1;
  return {
    total,
    landed,
    dropped: total - landed,
    dropRate: total ? round((total - landed) / total, 3) : null,
    returnMismatch: rows.filter((r) => r.found !== r.returned).length,
    lengths,
    meanMs: total ? Math.round(rows.reduce((s, r) => s + (r.ms || 0), 0) / total) : null,
  };
}

export function seriesChecks(rows, params = {}) {
  const s = seriesSummary(rows);
  return {
    summary: s,
    note: s.total + ' importMGT, ' + s.dropped + ' not on the track within 2 s (' + round(100 * (s.dropRate || 0), 1)
      + ' %), lengths in frames ' + JSON.stringify(s.lengths) + ', step ' + params.stepSec + ' s, mean ' + s.meanMs + ' ms',
    checks: [
      nodeCheck('series: no silent drops', s.total > 0 && s.dropped === 0, { dropped: s.dropped, dropRate: s.dropRate }, false),
      nodeCheck('series: one default length', Object.keys(s.lengths).length === 1, s.lengths, false),
      nodeCheck('series: the return value of importMGT tells whether the clip landed', s.returnMismatch === 0, s.returnMismatch, false),
    ],
  };
}

// present: { startFrame: lengthInFrames } from stage "count", a new host call after the series.
export function recountChecks(rows, present) {
  const has = (r) => present[String(r.startF)] !== undefined;
  const late = rows.filter((r) => !r.found && has(r)).map((r) => r.i);
  const gone = rows.filter((r) => r.found && !has(r)).map((r) => r.i);
  const missing = rows.filter((r) => !has(r)).map((r) => r.i);
  return {
    late,
    note: 'recount: ' + (rows.length - missing.length) + ' of ' + rows.length + ' on the track, late ' + late.length + ', gone ' + gone.length,
    checks: [
      nodeCheck('recount: no clip appeared after the 2 s check (a blind retry would have doubled it)', late.length === 0, { late }, false),
      nodeCheck('recount: every clip seen during the series is still there', gone.length === 0, { gone }, false),
      nodeCheck('recount: the drops seen by a new host call recorded', true, { missing }, false),
    ],
  };
}
```

- [ ] **Step 5: Запустить тест**

Run: `npx vitest run tests/spikes/s5-analyze.test.mjs`
Expected: `8 passed`.

- [ ] **Step 6: Создать этап `spikes/s5-importmgt/stage-insert.jsx`**

Вставки, запись полей с чтением назад через новый поиск клипа на дорожке, длина L1 и Hatch. Текст пишется JSON-ом (`textEditValue` + `fontTextRunLength`), флажок — значением того же типа, что прочитан. Список: прочитанное значение по умолчанию плюс один; основание индекса Node определяет по кадру.

```js
// S5 stage "insert" (Premiere, ES3, after spikes/lib/pr-helpers.jsx): importMGT onto an occupied V2
// (overwrite) and onto the free V3 of a fixture clone; Essential Graphics fields written and read back;
// the RDT LowerThird made 15 s long; the Hatch trimmed to 12 s with Duration = 12. Track indices are
// 0-based (V2 = 1, V3 = 2). Frames come from the next stage (spikes/lib/pr-shots.jsx); L1 is left
// selected for the manual Properties check. PARAMS.names and PARAMS.hatchNames: the Essential Graphics
// labels of the LowerThird and of the Hatch by contract key (spikes/fixtures/contract.mjs, EGP).
var P = PARAMS;
var tpf = Number(P.tpf);
var V3 = 2;
var data = { writes: {} };
var seq = null;
var l1 = null;
var l2 = null;
var l3 = null;
var hatch = null;

function onV3(sec) {
  return clipStartingAt(seq.videoTracks[V3], secToFrames(sec, tpf), tpf);
}

// ComponentParam.getColorValue returns a Color object or an array, depending on the build: record either.
function colorText(c) {
  if (c && typeof c === 'object' && c.red !== undefined) {
    return [c.alpha, c.red, c.green, c.blue].join(',');
  }
  return String(describeValue(c).value);
}

var ready = projectCheck();
if (ready) {
  seq = workCloneCheck(data);
  ready = !!seq;
}
ready = ready && check('S2 MOGRT files exist', function () {
  return { pass: new File(P.lt).exists && new File(P.hatch).exists, detail: [P.lt, P.hatch] };
});

if (ready) {
  check('undo groups exist in Premiere ExtendScript (app.beginUndoGroup)', function () {
    data.undoApi = typeof app.beginUndoGroup;
    return { pass: data.undoApi === 'function', detail: data.undoApi };
  }, false);

  check('importMGT onto the occupied V2 at ' + P.at.overwrite + ' s overwrites bars2, nothing shifts', function () {
    var v1Before = JSON.stringify(trackItems(seq.videoTracks[0], tpf));
    var v2Before = trackItems(seq.videoTracks[1], tpf);
    var r = importMogrt(seq, P.lt, P.at.overwrite, 1, 1, 2000);
    var v2After = trackItems(seq.videoTracks[1], tpf);
    var bars2End = -1;
    var i;
    for (i = 0; i < v2After.length; i++) {
      if (v2After[i].startF === secToFrames(10, tpf)) {
        bars2End = v2After[i].endF;
      }
    }
    data.overwrite = {
      v2Before: v2Before, v2After: v2After, returned: r.returned, lenF: r.lenF, error: r.error,
      v1Same: JSON.stringify(trackItems(seq.videoTracks[0], tpf)) === v1Before
    };
    return { pass: !!r.clip && bars2End === r.startF && data.overwrite.v1Same, detail: data.overwrite };
  }, false);

  check('importMGT onto the free V3 at ' + P.at.l1 + ' s: the clip is there', function () {
    var free = trackFreeAt(seq.videoTracks[V3], P.at.l1, P.at.l1 + P.rdtSec);
    var r = importMogrt(seq, P.lt, P.at.l1, V3, V3, 2000);
    l1 = r.clip;
    data.l1 = { wasFree: free, startF: r.startF, lenF: r.lenF, returned: r.returned, returnedName: r.returnedName, ms: r.ms, error: r.error };
    if (l1) {
      data.l1.times = clipTimes(l1, tpf);
    }
    return { pass: !!l1 && free, detail: data.l1 };
  });

  check('importMGT returns the TrackItem it placed', function () {
    return { pass: !!l1 && data.l1.returned && data.l1.returnedName === String(l1.name), detail: data.l1.returnedName };
  }, false);

  check('default length of the LowerThird recorded', function () {
    return {
      pass: !!l1 && data.l1.lenF > 0,
      detail: { frames: data.l1.lenF, sec: l1 ? ticksToSec(framesToTicks(data.l1.lenF, tpf)) : null, times: data.l1.times || null }
    };
  });
}

if (ready && l1) {
  check('Essential Graphics parameters found by display name', function () {
    var want = [P.names.name, P.names.role, P.names.showRole, P.names.duration, P.names.style];
    var missing = [];
    var i;
    for (i = 0; i < want.length; i++) {
      if (!mgtParam(l1, want[i])) {
        missing.push(want[i]);
      }
    }
    data.params = paramList(l1.getMGTComponent());
    return { pass: missing.length === 0, detail: { missing: missing, params: data.params } };
  });

  check('media replacement ' + P.names.photo + ': what Premiere exposes (not writable by script, spec 1.1)', function () {
    var p = mgtParam(l1, P.names.photo);
    var v = null;
    if (p) {
      try { v = p.getValue(); } catch (e) { v = 'EXC: ' + String(e); }
    }
    data.photo = { found: !!p, value: describeValue(v) };
    return { pass: true, detail: data.photo };
  }, false);

  check('text with Cyrillic written and read back: ' + P.names.name, function () {
    var p = mgtParam(l1, P.names.name);
    var before = readMgtText(p);
    var w = setMgtText(p, P.values.name);
    var back = readMgtText(mgtParam(onV3(P.at.l1), P.names.name));
    data.writes.name = { before: before, rv: w.rv, runsBefore: w.runsBefore, back: back };
    return { pass: back === P.values.name, detail: data.writes.name };
  });

  check('text written and read back: ' + P.names.role, function () {
    var p = mgtParam(l1, P.names.role);
    var before = readMgtText(p);
    var w = setMgtText(p, P.values.role);
    var back = readMgtText(mgtParam(onV3(P.at.l1), P.names.role));
    data.writes.role = { before: before, rv: w.rv, runsBefore: w.runsBefore, back: back };
    return { pass: back === P.values.role, detail: data.writes.role };
  });

  check('checkbox written and read back: ' + P.names.showRole, function () {
    var p = mgtParam(l1, P.names.showRole);
    var v0 = p.getValue();
    var next = (typeof v0 === 'boolean') ? !v0 : (truthy(v0) ? 0 : 1);
    var rv = p.setValue(next, 1);
    var back = mgtParam(onV3(P.at.l1), P.names.showRole).getValue();
    data.writes.showRole = { before: describeValue(v0), written: describeValue(next), rv: describeValue(rv), back: describeValue(back) };
    return { pass: truthy(back) === truthy(next), detail: data.writes.showRole };
  });

  check('slider written and read back: ' + P.names.duration, function () {
    var p = mgtParam(l1, P.names.duration);
    var v0 = p.getValue();
    var rv = p.setValue(P.rdtSec, 1);
    var back = mgtParam(onV3(P.at.l1), P.names.duration).getValue();
    data.writes.duration = { before: describeValue(v0), rv: describeValue(rv), back: describeValue(back) };
    return { pass: Math.abs(Number(back) - P.rdtSec) < 0.001, detail: data.writes.duration };
  });

  check('colour written and read back: ' + P.names.accent, function () {
    var p = mgtParam(l1, P.names.accent);
    var v0 = null;
    var rv, back;
    if (!p) {
      return { pass: false, detail: 'no parameter ' + P.names.accent };
    }
    try { v0 = p.getColorValue(); } catch (e) { v0 = 'EXC: ' + String(e); }
    // setColorValue(alpha, red, green, blue, updateUI), 0-255:
    // https://ppro-scripting.docsforadobe.dev/sequence/componentparam/
    rv = p.setColorValue(255, P.values.accent.r, P.values.accent.g, P.values.accent.b, 1);
    back = colorText(mgtParam(onV3(P.at.l1), P.names.accent).getColorValue());
    data.writes.accent = { before: colorText(v0), rv: describeValue(rv), back: back };
    return { pass: strHas(back, String(P.values.accent.r)) && strHas(back, String(P.values.accent.g)), detail: data.writes.accent };
  }, false);

  check('explicit length of ' + P.rdtSec + ' s on the RDT LowerThird (outPoint, then end)', function () {
    var before = clipTimes(onV3(P.at.l1), tpf);
    var lenF = secToFrames(P.rdtSec, tpf);
    var after;
    trimClip(onV3(P.at.l1), lenF, tpf);
    after = clipTimes(onV3(P.at.l1), tpf);
    data.l1.rdt = { before: before, after: after };
    return { pass: after.startF === data.l1.startF && after.endF === data.l1.startF + lenF, detail: data.l1.rdt };
  });
}

if (ready) {
  check('second LowerThird at ' + P.at.l2 + ' s for the dropdown', function () {
    var r = importMogrt(seq, P.lt, P.at.l2, V3, V3, 2000);
    l2 = r.clip;
    return { pass: !!l2, detail: { startF: r.startF, lenF: r.lenF, error: r.error } };
  });
}

if (ready && l2) {
  check('dropdown written and read back: ' + P.names.style, function () {
    var p = mgtParam(l2, P.names.style);
    var v0 = p.getValue();
    var next = Number(v0) + 1;
    var rv = p.setValue(next, 1);
    var back = mgtParam(onV3(P.at.l2), P.names.style).getValue();
    data.style = { before: describeValue(v0), written: next, rv: describeValue(rv), back: describeValue(back) };
    return { pass: Number(back) === next, detail: data.style };
  });
}

if (ready) {
  check('reference LowerThird at ' + P.at.l3 + ' s (template defaults)', function () {
    var r = importMogrt(seq, P.lt, P.at.l3, V3, V3, 2000);
    l3 = r.clip;
    return { pass: !!l3, detail: { startF: r.startF, lenF: r.lenF, error: r.error } };
  });

  check('Hatch MOGRT at ' + P.at.hatch + ' s: the clip is there', function () {
    var r = importMogrt(seq, P.hatch, P.at.hatch, V3, V3, 2000);
    hatch = r.clip;
    data.hatch = { startF: r.startF, lenF: r.lenF, returned: r.returned, ms: r.ms, error: r.error };
    if (hatch) {
      data.hatch.times = clipTimes(hatch, tpf);
    }
    return { pass: !!hatch, detail: data.hatch };
  });
}

if (ready && hatch) {
  check('Hatch: slider written and read back: ' + P.hatchNames.duration, function () {
    var p = mgtParam(hatch, P.hatchNames.duration);
    var v0 = p.getValue();
    var rv = p.setValue(P.hatchSec, 1);
    var back = mgtParam(onV3(P.at.hatch), P.hatchNames.duration).getValue();
    data.hatch.duration = { before: describeValue(v0), rv: describeValue(rv), back: describeValue(back) };
    return { pass: Math.abs(Number(back) - P.hatchSec) < 0.001, detail: data.hatch.duration };
  });

  check('Hatch trimmed to ' + P.hatchSec + ' s (outPoint, then end)', function () {
    var lenF = secToFrames(P.hatchSec, tpf);
    var t;
    trimClip(onV3(P.at.hatch), lenF, tpf);
    t = clipTimes(onV3(P.at.hatch), tpf);
    data.hatch.trimmed = t;
    return { pass: t.startF === data.hatch.startF && t.endF === data.hatch.startF + lenF, detail: t };
  });
}

if (ready && l1) {
  check('L1 left selected for the manual Properties check', function () {
    // TrackItem.setSelected(state, updateUI): https://ppro-scripting.docsforadobe.dev/item/trackitem/
    return { pass: true, detail: describeValue(onV3(P.at.l1).setSelected(1, 1)) };
  }, false);
}

if (ready) {
  check('project saved', function () {
    return { pass: true, detail: describeValue(app.project.save()) };
  }, false);
}

finish(data);
```

- [ ] **Step 7: Создать этап `spikes/s5-importmgt/stage-readback.jsx`**

Новый вызов хоста читает записанное ещё раз: на Pr 26.5.1 описан параметр, который остался старым (§1.1, п. 4).

```js
// S5 stage "readback" (Premiere, ES3, after pr-helpers.jsx): a new host call reads back what stage
// "insert" wrote, through fresh MGT components. A value that only looked written inside the same call
// shows up here (spec 1.1 item 4 and 8.2: every written value is read back).
var P = PARAMS;
var tpf = Number(P.tpf);
var data = { values: {} };
var seq = null;

function clipAt(sec) {
  return clipStartingAt(seq.videoTracks[2], secToFrames(sec, tpf), tpf);
}

if (projectCheck()) {
  seq = workSeqCheck(data);
}

if (seq) {
  check('L1, L2 and the Hatch are still on V3', function () {
    return { pass: !!clipAt(P.at.l1) && !!clipAt(P.at.l2) && !!clipAt(P.at.hatch), detail: [P.at.l1, P.at.l2, P.at.hatch] };
  });

  check('L1 text fields read back in a new call', function () {
    var c = clipAt(P.at.l1);
    data.values.name = readMgtText(mgtParam(c, P.names.name));
    data.values.role = readMgtText(mgtParam(c, P.names.role));
    return { pass: data.values.name === P.expect.name && data.values.role === P.expect.role, detail: data.values };
  });

  check('L1 checkbox and slider read back in a new call', function () {
    var c = clipAt(P.at.l1);
    data.values.showRole = describeValue(mgtParam(c, P.names.showRole).getValue());
    data.values.duration = describeValue(mgtParam(c, P.names.duration).getValue());
    return {
      pass: truthy(data.values.showRole.value) === truthy(P.expect.showRole)
        && Math.abs(Number(data.values.duration.value) - P.expect.duration) < 0.001,
      detail: { got: [data.values.showRole, data.values.duration], want: [P.expect.showRole, P.expect.duration] }
    };
  });

  check('L2 dropdown read back in a new call', function () {
    data.values.style = describeValue(mgtParam(clipAt(P.at.l2), P.names.style).getValue());
    return { pass: Number(data.values.style.value) === Number(P.expect.style), detail: { got: data.values.style, want: P.expect.style } };
  });

  check('Hatch slider read back in a new call', function () {
    data.values.hatchDuration = describeValue(mgtParam(clipAt(P.at.hatch), P.hatchNames.duration).getValue());
    return {
      pass: Math.abs(Number(data.values.hatchDuration.value) - P.expect.hatchDuration) < 0.001,
      detail: { got: data.values.hatchDuration, want: P.expect.hatchDuration }
    };
  });

  check('L1 keeps its explicit length of ' + P.rdtSec + ' s', function () {
    var t = clipTimes(clipAt(P.at.l1), tpf);
    return { pass: t.endF - t.startF === secToFrames(P.rdtSec, tpf), detail: t };
  });
}

finish(data);
```

- [ ] **Step 8: Создать этапы серии `spikes/s5-importmgt/stage-series.jsx` и `spikes/s5-importmgt/stage-count.jsx`**

Серия не повторяет пропавшие вставки — пропуск и есть замер. Пересчёт в новом вызове отделяет настоящие пропуски от клипов, которые появились позже двух секунд ожидания: если такие есть, повторная вставка из §6.1 удвоила бы клип.

```js
// S5 stage "series" (Premiere, ES3, after pr-helpers.jsx): PARAMS.count importMGT calls on fresh ranges
// of one track of its own fresh clone of the fixture (a re-run starts clean), PARAMS.stepSec apart.
// No retries: a clip that did not land is the measurement (spec 3.1 S5; 6.1 step 5 allows one retry in
// the panel, recount and Node decide whether that is safe). Each call is timed in the host.
var P = PARAMS;
var data = { rows: [] };
var seq = null;

var ready = projectCheck();
if (ready) {
  seq = workCloneCheck(data);
  ready = !!seq;
}
ready = ready && check('series range is free on V' + (P.vIdx + 1), function () {
  var end = P.startSec + P.count * P.stepSec;
  return { pass: trackFreeAt(seq.videoTracks[P.vIdx], P.startSec, end), detail: [P.startSec, end] };
});

if (ready) {
  data.itemsBefore = projectTree().length;
  for (var i = 0; i < P.count; i++) {
    var r = importMogrt(seq, P.mogrt, P.startSec + i * P.stepSec, P.vIdx, P.vIdx, 2000);
    data.rows.push({ i: i, startF: r.startF, found: !!r.clip, returned: r.returned, lenF: r.lenF, ms: r.ms, error: r.error });
  }
  data.itemsAfter = projectTree().length;
  check('series ran to the end', function () {
    return { pass: data.rows.length === P.count, detail: data.rows.length + ' of ' + P.count };
  });
  check('project items added by the series recorded', function () {
    return { pass: true, detail: { before: data.itemsBefore, after: data.itemsAfter } };
  }, false);
}

finish(data);
```

```js
// S5 stage "count" (Premiere, ES3, read-only): a new host call recounts the series clips, so clips that
// arrived after the 2 s check of stage "series" are told apart from real drops.
var P = PARAMS;
var tpf = Number(P.tpf);
var data = { present: {} };
var seq = null;

if (projectCheck()) {
  seq = workSeqCheck(data);
}

if (seq) {
  check('series recounted on V' + (P.vIdx + 1), function () {
    var tr = seq.videoTracks[P.vIdx];
    var i, f, c;
    for (i = 0; i < P.count; i++) {
      f = secToFrames(P.startSec + i * P.stepSec, tpf);
      c = clipStartingAt(tr, f, tpf);
      if (c) {
        data.present[String(f)] = ticksToFrames(c.end.ticks, tpf) - f;
      }
    }
    return { pass: true, detail: data.present };
  });
}

finish(data);
```

- [ ] **Step 9: Создать этап `spikes/s5-importmgt/stage-undo.jsx`**

Этап по требованию: одна вставка и три записи прямо перед ручным подсчётом шагов отмены. Вариант `undo-group` то же самое делает внутри `app.beginUndoGroup`, если он есть в Premiere.

```js
// S5 stages "undo" and "undo-group" (Premiere, ES3, on demand): one LowerThird and three field writes
// (text, checkbox, dropdown) on a fresh range of the work clone, right before the manual count of undo
// steps in Window > History (Task 16). With PARAMS.useUndoGroup the four actions run inside
// app.beginUndoGroup / endUndoGroup, when Premiere has them. These checks only prepare the manual count,
// so they do not decide the verdict; a silent drop here means: run the stage again.
var P = PARAMS;
var tpf = Number(P.tpf);
var data = { undoGroup: false };
var seq = null;
var clip = null;

var ready = projectCheck();
if (ready) {
  seq = workSeqCheck(data);
  ready = !!seq;
}

// A repeated count gets the next free 20 s slot on the track, so nothing is overwritten.
if (ready) {
  data.atSec = P.atSec;
  while (!trackFreeAt(seq.videoTracks[P.vIdx], data.atSec, data.atSec + 15) && data.atSec < P.atSec + 2000) {
    data.atSec += 20;
  }
}

if (ready) {
  if (P.useUndoGroup && typeof app.beginUndoGroup === 'function') {
    app.beginUndoGroup('BK S5 insert');
    data.undoGroup = true;
  }
  try {
    check('one LowerThird inserted at ' + data.atSec + ' s on V' + (P.vIdx + 1), function () {
      var r = importMogrt(seq, P.mogrt, data.atSec, P.vIdx, P.vIdx, 2000);
      clip = r.clip;
      return { pass: !!clip, detail: { startF: r.startF, lenF: r.lenF, error: r.error } };
    }, false);
    if (clip) {
      check('three fields written: text, checkbox, dropdown', function () {
        var show = mgtParam(clip, P.names.showRole);
        var style = mgtParam(clip, P.names.style);
        var s0 = show.getValue();
        var d0 = style.getValue();
        setMgtText(mgtParam(clip, P.names.name), P.text);
        show.setValue((typeof s0 === 'boolean') ? !s0 : (truthy(s0) ? 0 : 1), 1);
        style.setValue(Number(d0) + 1, 1);
        data.back = readMgtText(mgtParam(clipStartingAt(seq.videoTracks[P.vIdx], secToFrames(data.atSec, tpf), tpf), P.names.name));
        return { pass: data.back === P.text, detail: data.back };
      }, false);
    }
  } finally {
    if (data.undoGroup) {
      app.endUndoGroup();
    }
  }
  if (clip) {
    check('the clip is selected for the History count', function () {
      return { pass: true, detail: describeValue(clip.setSelected(1, 1)) };
    }, false);
  }
}

finish(data);
```

- [ ] **Step 10: Прогнать ES3-линтер по пробам S5**

Run: `node tools/jsx/lint-jsx.cjs spikes/s5-importmgt/stage-insert.jsx spikes/s5-importmgt/stage-readback.jsx spikes/s5-importmgt/stage-series.jsx spikes/s5-importmgt/stage-count.jsx spikes/s5-importmgt/stage-undo.jsx`
Expected: пять строк `OK    spikes/s5-importmgt/<файл> (1 warning(s))`; единственное предупреждение — о последней строке `finish(...)`.

- [ ] **Step 11: Создать `spikes/s5-importmgt/run.mjs` и проверить сборку проб без Premiere**

```js
#!/usr/bin/env node
// S5: importMGT and MOGRT field writes in Premiere through CEP ExtendScript (spec 3.1, S5).
//   node spikes/s5-importmgt/run.mjs                    insert, shots, frames, readback, series, count
//   node spikes/s5-importmgt/run.mjs --only undo        on demand, right before the manual undo count
//   node spikes/s5-importmgt/run.mjs --only undo-group  the same inside app.beginUndoGroup, if Premiere has it
//   node spikes/s5-importmgt/run.mjs --only <stages>    continue after a failed stage (same run folder)
//   node spikes/s5-importmgt/run.mjs --check            compose and lint every probe, no host
// Needs the Task 15 fixture open in Premiere (BrandKit Dev panel, CDP 8096) and the S2 MOGRTs (part B).
import { existsSync } from 'node:fs';
import path from 'node:path';
import { lintOrThrow } from '../../tools/host-run.mjs';
import { composeProbe } from '../../tools/spike/runner.mjs';
import { runStages, runStage, nodeCheck } from '../../tools/spike/multistage.mjs';
import { workPath, ensureDir } from '../../tools/lib/work.mjs';
import { prBaseParams, clearFrames } from '../../tools/pr/env.mjs';
import { readPng, waitForPng } from '../../tools/png/read-png.mjs';
import { COMP_LT, COMP_HATCH, EGP, fixturePaths } from '../fixtures/contract.mjs';
import {
  AT, RDT_SEC, HATCH_SEC, SERIES, shotPlan, frameChecks, seriesStep, seriesChecks, recountChecks,
} from './analyze.mjs';

const ID = 'S5';
const TITLE = 'importMGT и запись полей (CEP)';
const FALLBACK = 'Если явная длительность ломает анимацию rdt-шаблона — вставка с длиной по умолчанию и ручное '
  + 'растягивание; trim-шаблоны панель всегда обрезает сама. Если не пишется текст — Premiere становится '
  + '«только вставка», текст правится в Properties';
const NOTES = 'Клон CRT_S5_work* секвенции CRT_Seq_1080p25 в CRT_pr_test.prproj: проверка перезаписи на V2 в 12 с; '
  + 'на V3 — L1 (поля записаны, 15 с) в 40 с, L2 (список) в 60 с, L3 (по умолчанию) в 75 с, Hatch (12 с) в 90 с, '
  + 'вставки для подсчёта отмены с 900 с. Серия — в своём клоне CRT_S5_series*, на V3 с 200 с.';
const HELPERS = 'spikes/lib/pr-helpers.jsx';
// The S2 templates and the Essential Graphics labels S1 gave them, key -> display name (fixture contract, part B).
const LT = path.posix.join(fixturePaths().mogrtDir, COMP_LT + '.mogrt');
const HATCH = path.posix.join(fixturePaths().mogrtDir, COMP_HATCH + '.mogrt');
const labels = (comp) => Object.fromEntries(EGP[comp].map((p) => [p.key, p.label]));
const NAMES = labels(COMP_LT);
const HATCH_NAMES = labels(COMP_HATCH);
const VALUES = {
  name: 'Анна-Мария Ёлкина-Константинопольская',
  role: 'Руководитель облачной платформы',
  accent: { r: 160, g: 104, b: 255 },
};
const UNDO_AT = { undo: 900, 'undo-group': 920 };

function prParams(ctx, extra = {}, copy = true) {
  const ins = ctx.stages.insert && ctx.stages.insert.data;
  return {
    ...prBaseParams({ copy }),
    workBase: 'CRT_S5_work',
    workSeqId: ins ? ins.workSeqId : null,
    workSeq: ins ? ins.workSeq : null,
    framesDir: path.posix.join(ctx.runDir, 'frames'),
    names: NAMES,
    hatchNames: HATCH_NAMES,
    ...extra,
  };
}

async function insert(ctx) {
  for (const f of [LT, HATCH]) {
    if (!existsSync(f)) throw new Error('missing ' + f + ': run S2 (part B) or export it by hand (Task 16, step 1)');
  }
  return runStage({
    host: 'pr',
    files: [HELPERS, 'spikes/s5-importmgt/stage-insert.jsx'],
    params: prParams(ctx, { lt: LT, hatch: HATCH, values: VALUES, at: AT, rdtSec: RDT_SEC, hatchSec: HATCH_SEC }),
    timeoutMs: 600000,
  });
}

async function shots(ctx) {
  clearFrames(ensureDir(path.posix.join(ctx.runDir, 'frames')), shotPlan().map((s) => s.key));
  const r = await runStage({
    host: 'pr', files: [HELPERS, 'spikes/lib/pr-shots.jsx'], params: prParams(ctx, { shots: shotPlan() }), timeoutMs: 300000,
  });
  return { ...r, evidence: Object.values(r.data.frames || {}) };
}

async function frames(ctx) {
  const files = (ctx.stages.shots && ctx.stages.shots.data.frames) || {};
  const checks = [];
  const img = {};
  for (const s of shotPlan()) {
    const name = 'frame ' + s.key + ' is a complete 1920x1080 PNG';
    if (!files[s.key]) {
      checks.push(nodeCheck(name, false, 'not exported'));
      continue;
    }
    try {
      await waitForPng(files[s.key], { timeoutMs: 60000 });
    } catch (e) {
      checks.push(nodeCheck(name, false, e.message));
      continue;
    }
    const im = readPng(files[s.key]);
    const full = im.width === 1920 && im.height === 1080;
    checks.push(nodeCheck(name, full, im.width + 'x' + im.height));
    if (full) img[s.key] = im;
  }
  const r = frameChecks(img, (ctx.stages.insert && ctx.stages.insert.data) || {});
  return { checks: checks.concat(r.checks), data: r.data };
}

async function readback(ctx) {
  const ins = (ctx.stages.insert && ctx.stages.insert.data) || {};
  const w = ins.writes || {};
  return runStage({
    host: 'pr',
    files: [HELPERS, 'spikes/s5-importmgt/stage-readback.jsx'],
    params: prParams(ctx, {
      at: AT,
      rdtSec: RDT_SEC,
      expect: {
        name: VALUES.name,
        role: VALUES.role,
        showRole: w.showRole ? w.showRole.written.value : null,
        duration: RDT_SEC,
        style: ins.style ? ins.style.written : null,
        hatchDuration: HATCH_SEC,
      },
    }),
    timeoutMs: 120000,
  });
}

function seriesParams(ctx) {
  const ins = ctx.stages.insert && ctx.stages.insert.data;
  const lenF = ins && ins.l1 ? ins.l1.lenF : null;
  return { mogrt: LT, startSec: SERIES.startSec, stepSec: seriesStep(lenF), count: SERIES.count, vIdx: SERIES.vIdx };
}

async function series(ctx) {
  const sp = seriesParams(ctx);
  const r = await runStage({
    host: 'pr', files: [HELPERS, 'spikes/s5-importmgt/stage-series.jsx'], params: prParams(ctx, { ...sp, workBase: 'CRT_S5_series' }),
    timeoutMs: 900000,
  });
  const s = seriesChecks(r.data.rows || [], sp);
  return { ...r, checks: r.checks.concat(s.checks), notes: s.note, data: { ...r.data, summary: s.summary, params: sp } };
}

async function count(ctx) {
  const st = ctx.stages.series;
  if (!st || !st.data.params) throw new Error('stage series has not run');
  const r = await runStage({
    host: 'pr',
    files: [HELPERS, 'spikes/s5-importmgt/stage-count.jsx'],
    params: prParams(ctx, { ...st.data.params, workSeqId: st.data.workSeqId, workSeq: st.data.workSeq }),
    timeoutMs: 120000,
  });
  const c = recountChecks(st.data.rows || [], r.data.present || {});
  return { ...r, checks: r.checks.concat(c.checks), notes: c.note, data: { ...r.data, late: c.late } };
}

const undoStage = (name, useUndoGroup) => async (ctx) => {
  const r = await runStage({
    host: 'pr',
    files: [HELPERS, 'spikes/s5-importmgt/stage-undo.jsx'],
    params: prParams(ctx, { mogrt: LT, atSec: UNDO_AT[name], vIdx: SERIES.vIdx, text: 'Проверка отмены', useUndoGroup }),
    timeoutMs: 120000,
  });
  console.log(name + ': the clip for the History count is on V3 at ' + r.data.atSec + ' s of ' + r.data.workSeq);
  return r;
};

// Every probe composed with representative PARAMS and linted exactly as run() does before sending.
function checkOnly() {
  const ctx = { runDir: workPath('s5', 'run-check'), stages: { insert: { data: { workSeqId: 'x', workSeq: 'CRT_S5_work', l1: { lenF: 250 } } } } };
  const base = prParams(ctx, {}, false);
  const probes = [
    ['spikes/s5-importmgt/stage-insert.jsx', { lt: LT, hatch: HATCH, values: VALUES, at: AT, rdtSec: RDT_SEC, hatchSec: HATCH_SEC }],
    ['spikes/lib/pr-shots.jsx', { shots: shotPlan() }],
    ['spikes/s5-importmgt/stage-readback.jsx', { at: AT, rdtSec: RDT_SEC, expect: { name: VALUES.name } }],
    ['spikes/s5-importmgt/stage-series.jsx', { ...seriesParams(ctx), workBase: 'CRT_S5_series' }],
    ['spikes/s5-importmgt/stage-count.jsx', { ...seriesParams(ctx), workSeqId: 'y' }],
    ['spikes/s5-importmgt/stage-undo.jsx', { mogrt: LT, atSec: 900, vIdx: 2, text: 'Проверка отмены', useUndoGroup: true }],
  ];
  for (const [file, extra] of probes) {
    lintOrThrow(composeProbe([HELPERS, file], { ...base, ...extra }));
    console.log('OK ' + file);
  }
}

if (process.argv.includes('--check')) {
  checkOnly();
} else {
  const out = await runStages({
    id: ID,
    title: TITLE,
    host: 'pr',
    fallback: FALLBACK,
    notes: NOTES,
    argv: process.argv.slice(2),
    stages: [
      { name: 'insert', host: 'pr', run: insert },
      { name: 'shots', host: 'pr', run: shots },
      { name: 'frames', host: 'node', run: frames },
      { name: 'readback', host: 'pr', run: readback },
      { name: 'series', host: 'pr', run: series },
      { name: 'count', host: 'pr', run: count },
      { name: 'undo', host: 'pr', onDemand: true, run: undoStage('undo', false) },
      { name: 'undo-group', host: 'pr', onDemand: true, run: undoStage('undo-group', true) },
    ],
  });
  console.log('run folder: ' + out.runDir);
  process.exitCode = out.failed ? 1 : 0;
}
```

Run: `node --check spikes/s5-importmgt/run.mjs && node spikes/s5-importmgt/run.mjs --check`
Expected: шесть строк `OK spikes/…` — каждая проба склеена с настоящими PARAMS и прошла тот же линтер, что `run` перед отправкой; Premiere не нужен, файлов в `C:/CRBK/work` режим `--check` не создаёт.

- [ ] **Step 12: Прогон S5**

Premiere открыт с `CRT_pr_test.prproj` (задача 15), панель BrandKit Dev открыта, во время прогона Premiere не трогать.

Run: `node spikes/s5-importmgt/run.mjs`
Expected (2–6 минут):

```text
S5 insert: 24/24 checks passed
S5 shots: 9/9 checks passed
S5 frames: 15/15 checks passed
S5 readback: 8/8 checks passed
S5 series: 8/8 checks passed
S5 count: 6/6 checks passed
S5: <итог> (70 checks) -> …\spikes\results\S5.json
run folder: C:/CRBK/work/s5/run-<дата>-<время>
```

Меньше пройденных в `insert` — обычно информационная проверка `app.beginUndoGroup` (в Premiere её может не быть); в `series` и `count` — пропуски вставок. Это замеры: итог тогда `partial`, а не `no`. Кадры лежат в `run folder`/frames.

Если этап упал (`stage … completed` FAIL или `CDP_TIMEOUT`): посмотреть, нет ли в Premiere окна, проверить хост командой шага 16 задачи 15 и продолжить с упавшего этапа, например `node spikes/s5-importmgt/run.mjs --only shots,frames,readback,series,count`. Этапы `insert` и `series` при повторе делают новый клон (`CRT_S5_work_2`, `CRT_S5_series_2`), поэтому после `insert` повторяются и все следующие, а после `series` — `count`.

- [ ] **Step 13: Панель Properties после записи текста скриптом (вручную)**

1. В Premiere открыта секвенция `CRT_S5_work`; на V3 в 40 с выделен клип L1 (его выделил этап `insert`). Если выделение снято — щелчок по клипу на V3 в 40 с.
2. Window → Essential Graphics → вкладка Edit (в 26.x те же поля есть в Window → Properties).
3. Посмотреть поле `Имя`: в нём `Анна-Мария Ёлкина-Константинопольская` (новый текст), `Имя Фамилия` (старый) или пусто.

Run: `node tools/spike/manual.mjs --id S5 --check "manual: Properties shows the scripted name after the clip is selected" --pass true --detail "<что в поле Имя: новый текст / старый / пусто>" --optional`
Expected: `S5: <итог> (<n> checks)`.
Если в поле не новый текст — `--pass false`, в `--detail` — что видно.

- [ ] **Step 14: Шаги отмены одной вставки (вручную)**

1. Window → History (Окно → История); прокрутить список вниз, запомнить последнюю строку.
2. Run: `node spikes/s5-importmgt/run.mjs --only undo`
   Expected: `undo: the clip for the History count is on V3 at 900 s of CRT_S5_work` и `S5 undo: 5/5 checks passed`. Каждый следующий запуск ставит клип в следующий свободный слот (920 с, 940 с …). Если вставка молча не выполнилась (проверка `one LowerThird inserted …` FAIL) — запустить ту же команду ещё раз.
3. Посчитать новые строки History после запомненной; записать их названия.
4. Нажимать Ctrl+Z по одному разу, пока клип на V3 в напечатанной секунде не исчезнет. Записать число нажатий; проверить, что новых строк не осталось.

Run: `node tools/spike/manual.mjs --id S5 --check "manual: one scripted insert with three writes undoes in one step (no undo group)" --pass false --detail "<N шагов: названия строк History; после N x Ctrl+Z таймлайн как до вставки>" --optional`
Expected: `S5: <итог> (<n> checks)`.
`--pass true` — только если хватило одного Ctrl+Z.

5. Если `S5.data.json` → `stages.insert.data.undoApi` = `"function"`: повторить пункты 1–4 с `node spikes/s5-importmgt/run.mjs --only undo-group` и записать:

Run: `node tools/spike/manual.mjs --id S5 --check "manual: the same inside app.beginUndoGroup undoes in one step" --pass true --detail "<N шагов: …>" --optional`
Expected: `S5: <итог> (<n> checks)`.

- [ ] **Step 15: Анимация растянутого клипа на глаз (вручную, необязательно)**

В секвенции `CRT_S5_work` поставить индикатор на 40 с, проиграть до 42 с, затем с 53 до 55 с. Интро и аутро должны идти с той же скоростью, что в шаблоне: имя проявляется за 0,5 с и гаснет за последние 0,5 с.

Run: `node tools/spike/manual.mjs --id S5 --check "visual: 15 s RDT clip plays intro and outro at template speed" --pass true --detail "<что видно>" --optional`
Expected: `S5: <итог> (<n> checks)`.

- [ ] **Step 16: Отчёт и выводы для контракта и панели**

Run: `npm run spike:report`
Expected: `written …\spikes\RESULTS.md`; в таблице строка `| S5 | importMGT и запись полей (CEP) | pr | 26.5.2… | … |`.

Как читать `spikes/results/S5.json` и `S5.data.json` (`stages.<этап>.data`):
- Обе проверки `RDT LowerThird made 15 s long …` прошли → панель ставит `rdt`-шаблон с явной длиной. Не прошли → в `stages.frames.data.outro.explainedBy` видно, что делает Premiere (`uniform` — растягивает всё; `heldLastFrame` — держит последний кадр). Тогда запасной путь S5: вставка с длиной по умолчанию и ручное растягивание.
- `Hatch trimmed to 12 s …` прошли → `trim`-шаблоны: обрезка (`outPoint`, затем `end`) плюс запись «Длительности».
- Запись и чтение назад текста не прошли → Premiere «только вставка», текст правится в Properties (запасной путь S5).
- `stages.frames.data.dropdown.base` — основание индекса списка в Premiere. В `library.json` пункты считаются с 1 (§4.4); при `zero-based` адаптер Premiere вычитает 1.
- `stages.insert.data.l1.lenF` и `stages.insert.data.hatch.lenF` — длина MOGRT по умолчанию в кадрах. Она входит в проверку свободной дорожки (§6.1, шаг 3).
- `stages.series.data.summary` и `stages.count.data.late` — доля молча невыполненных вставок и поздние клипы. Одна повторная вставка из §6.1 безопасна, только если `late` пуст.
- Ручные отметки шагов 13–14 — для §6 («один шаг отмены на клик») и §8.2 (подсказка про Properties).

- [ ] **Step 17: Все тесты**

Run: `npm test`
Expected: все тесты зелёные, среди них `tests/spikes/s5-analyze.test.mjs` (8).

- [ ] **Step 18: Commit**

```bash
git add spikes/s5-importmgt/analyze.mjs spikes/s5-importmgt/stage-insert.jsx spikes/s5-importmgt/stage-readback.jsx spikes/s5-importmgt/stage-series.jsx spikes/s5-importmgt/stage-count.jsx spikes/s5-importmgt/stage-undo.jsx spikes/s5-importmgt/run.mjs tests/spikes/s5-analyze.test.mjs spikes/results/S5.json spikes/results/S5.data.json spikes/RESULTS.md
git commit -m "feat(spikes): S5 importMGT and MOGRT field writes in Premiere" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 17: S6 — повторный импорт MOGRT и capsuleID

Premiere узнаёт шаблон по `capsuleID` из `definition.json` внутри `.mogrt`. S6 выясняет, что будет, когда в проект, где шаблон уже стоит, приходит его новая версия.

Ход прогона:
1. **AE.** Копия `CRT_fixture_egp.aep` в папке прогона. Экспорт `CRT_LowerThird_v1` без изменений (`asis`); затем QA_PATCH перекрашивается эффектом Fill в #A068FF и шаблон экспортируется под тем же именем (`changed`); затем дубль композиции `CRT_LowerThird_v2` (`dup`). Строго по одному: следующий экспорт — после того, как файл перестал расти.
2. **Node.** `capsuleID` всех четырёх файлов (с шаблоном S2): сохраняет ли AE ID при повторном экспорте и даёт ли новый дублю. Две копии повторного экспорта: со старым ID (на случай, если AE сам дал новый) и со свежим.
3. **Premiere**, свежий проект `CRT_pr_s6.prproj`, секвенция `CRT_S6`, V1: A — шаблон S2 (0 с), B — повторный экспорт как есть (12 с), C — он же со старым ID (24 с), D — со свежим ID (36 с). После каждой вставки — кадр каждого экземпляра в его пятой секунде. Цвет QA_PATCH говорит, какая версия рисуется: #26D07C — старая, #A068FF — новая.

Проект свежий, потому что в проекте с прошлыми версиями ответ о кэше смешался бы с тем, что осталось от прошлого прогона. Повторный прогон S6 — в новом пустом проекте.

**Обязательные проверки:** A до повторных импортов рисует старую версию; D (свежий ID) рисует новую; A после D по-прежнему старая — версии сосуществуют. Это политика §4.4 по умолчанию. Поведение при том же ID и факты об ID из AE — информационные: они выбирают механизм конвейера (замена ID в `definition.json` или дубль композиции).

**Files:**
- Create: `tools/mogrt/capsule.mjs`, `spikes/s6-capsule/analyze.mjs`, `spikes/s6-capsule/ae-export.jsx`, `spikes/s6-capsule/pr-insert.jsx`, `spikes/s6-capsule/run.mjs`
- Test: `tests/tools/capsule.test.mjs`, `tests/spikes/s6-analyze.test.mjs`
- Create (прогоном): `spikes/results/S6.json`, `spikes/results/S6.data.json`
- Modify (генерируется `npm run spike:report`): `spikes/RESULTS.md`

- [ ] **Step 1: Написать падающий тест `tests/tools/capsule.test.mjs`**

Синтетический `.mogrt`: `definition.json` так, как его пишет AE (с BOM и ID ещё раз во вложенном поле), и два двоичных файла.

```js
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import {
  readCapsuleId, readDefinition, patchCapsuleId, newCapsuleId, mogrtReady,
} from '../../tools/mogrt/capsule.mjs';

const OLD = '0b1e5a7e-1111-4c4c-9d9d-000000000001';
// definition.json the way AE writes it ("key": value with spaces), with a BOM as some writers add one,
// and the ID a second time in a nested field to prove that every occurrence is replaced.
const DEF_TEXT = '\uFEFF{"apiVersion": "1.4", "authorApp": "aefx", "capsuleID": "' + OLD + '", '
  + '"capsuleName": "CRT_LowerThird_v1", "sourceInfoLocalized": {"en_US": {"capsule": "' + OLD + '"}}, '
  + '"clientControls": [{"id": "c1", "type": 6, "uiName": {"strDB": [{"localeString": "ru_RU", "str": "Имя"}]}}]}';

function makeMogrt(defText = DEF_TEXT) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-cap-'));
  const zip = new AdmZip();
  if (defText !== null) zip.addFile('definition.json', Buffer.from(defText, 'utf8'));
  zip.addFile('project.aegraphic', Buffer.from([80, 75, 3, 4, 1, 2, 3, 250, 251]));
  zip.addFile('thumb.png', Buffer.from('png-bytes'));
  const file = path.join(dir, 'src.mogrt');
  zip.writeZip(file);
  return { dir, file };
}

describe('capsule', () => {
  it('reads capsuleID and the definition', () => {
    const { file } = makeMogrt();
    expect(readCapsuleId(file)).toBe(OLD);
    expect(readDefinition(file).clientControls[0].uiName.strDB[0].str).toBe('Имя');
  });

  it('writes a copy with a new capsuleID everywhere in definition.json and keeps everything else', () => {
    const { dir, file } = makeMogrt();
    const before = readFileSync(file);
    const dst = path.join(dir, 'dst.mogrt');
    expect(patchCapsuleId(file, dst, 'new-id-1')).toEqual({ oldId: OLD, newId: 'new-id-1', occurrences: 2 });
    expect(readCapsuleId(dst)).toBe('new-id-1');
    expect(readFileSync(file).equals(before)).toBe(true);
    const z = new AdmZip(dst);
    expect(z.readFile('definition.json').toString('utf8')).toBe(DEF_TEXT.split(OLD).join('new-id-1'));
    expect([...z.readFile('project.aegraphic')]).toEqual([80, 75, 3, 4, 1, 2, 3, 250, 251]);
    expect(z.readFile('thumb.png').toString()).toBe('png-bytes');
  });

  it('accepts the same ID (a no-op copy)', () => {
    const { dir, file } = makeMogrt();
    const dst = path.join(dir, 'same.mogrt');
    expect(patchCapsuleId(file, dst, OLD).newId).toBe(OLD);
    expect(readCapsuleId(dst)).toBe(OLD);
  });

  it('fails loudly without definition.json or without capsuleID', () => {
    expect(() => readCapsuleId(makeMogrt(null).file)).toThrow(/definition\.json not found/);
    const { dir, file } = makeMogrt('{"capsuleName": "x"}');
    expect(() => readCapsuleId(file)).toThrow(/capsuleID not found/);
    expect(() => patchCapsuleId(file, path.join(dir, 'y.mogrt'), 'z')).toThrow(/capsuleID not found/);
  });

  it('tells a ready .mogrt from a half-written one', () => {
    const { dir, file } = makeMogrt();
    expect(mogrtReady(file)).toEqual({ ok: true, capsuleID: OLD });
    const half = path.join(dir, 'half.mogrt');
    writeFileSync(half, readFileSync(file).subarray(0, 40));
    expect(mogrtReady(half).ok).toBe(false);
  });

  it('makes fresh UUIDs', () => {
    expect(newCapsuleId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(newCapsuleId()).not.toBe(newCapsuleId());
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run tests/tools/capsule.test.mjs`
Expected: FAIL — `Cannot find module '../../tools/mogrt/capsule.mjs'`.

- [ ] **Step 3: Создать `tools/mogrt/capsule.mjs`**

ID меняется как текст во всём `definition.json`, остальные файлы архива копируются как есть. В шаблонах Adobe из AE (Premiere 2026, «[AE] Sports Package») ID встречается один раз и только в `definition.json`, не в `project.aegraphic`.

```js
// MOGRT capsule identity (S6). A .mogrt is a zip; definition.json at its root carries capsuleID, by which
// Premiere tells templates apart. In Adobe's AE-made templates (Premiere 2026, "[AE] Sports Package") the ID
// occurs once, in definition.json only, not inside project.aegraphic. patchCapsuleId writes a copy with a new
// ID, as premiere-autopilot scripts/mogrtcard.py does for Premiere-made templates: every occurrence of the old
// ID in definition.json is replaced as text (formatting and a BOM are kept), every other entry is copied as is.
// Two MOGRT readers stay side by side: tools/spike/mogrt.mjs (Task 9) reads the Essential Graphics controls,
// this module reads and patches capsuleID.
import { randomUUID } from 'node:crypto';
import AdmZip from 'adm-zip';

function definitionEntry(zip) {
  const entries = zip.getEntries();
  const entry = entries.find((e) => e.entryName === 'definition.json')
    || entries.find((e) => /(^|\/)definition\.json$/.test(e.entryName));
  if (!entry) throw new Error('definition.json not found in the .mogrt');
  return entry;
}

const parse = (text) => JSON.parse(text.replace(/^\uFEFF/, ''));

export function readDefinition(file) {
  const zip = new AdmZip(file);
  return parse(zip.readFile(definitionEntry(zip)).toString('utf8'));
}

export function readCapsuleId(file) {
  const id = readDefinition(file).capsuleID;
  if (!id) throw new Error('capsuleID not found in ' + file);
  return String(id);
}

export function newCapsuleId() {
  return randomUUID();
}

export function patchCapsuleId(src, dst, newId) {
  const zip = new AdmZip(src);
  const entry = definitionEntry(zip);
  const text = zip.readFile(entry).toString('utf8');
  const oldId = parse(text).capsuleID;
  if (!oldId) throw new Error('capsuleID not found in ' + src);
  const parts = text.split(String(oldId));
  const patched = parts.join(String(newId));
  if (parse(patched).capsuleID !== String(newId)) throw new Error('capsuleID did not change in ' + src);
  zip.updateFile(entry, Buffer.from(patched, 'utf8'));
  zip.writeZip(dst);
  return { oldId: String(oldId), newId: String(newId), occurrences: parts.length - 1 };
}

// A .mogrt that After Effects may still be writing is ready when it opens as a zip whose definition.json
// carries a capsuleID; used after the file size has settled.
export function mogrtReady(file) {
  try {
    return { ok: true, capsuleID: readCapsuleId(file) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
```

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/tools/capsule.test.mjs`
Expected: `6 passed`.

- [ ] **Step 5: Написать падающий тест `tests/spikes/s6-analyze.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import { shotsAfter, qaLook, capsuleChecks, policyNote } from '../../spikes/s6-capsule/analyze.mjs';

function frameWithPatch(hex) {
  const img = new PNG({ width: 1920, height: 1080 });
  const n = parseInt(hex.slice(1), 16);
  for (let y = 0; y < 1080; y += 1) {
    for (let x = 0; x < 1920; x += 1) {
      const i = (y * 1920 + x) * 4;
      const inPatch = x >= 1770 && x < 1870 && y >= 50 && y < 150; // QA_PATCH 100x100 at (1820, 100)
      img.data[i] = inPatch ? (n >> 16) & 255 : 0;
      img.data[i + 1] = inPatch ? (n >> 8) & 255 : 0;
      img.data[i + 2] = inPatch ? n & 255 : 0;
      img.data[i + 3] = 255;
    }
  }
  return img;
}

const coexist = { A0: 'old', A1: 'old', B1: 'new', A2: 'old', B2: 'new', C2: 'new', A3: 'old', B3: 'new', C3: 'new', D3: 'new' };

describe('S6 analysis', () => {
  it('plans a frame of every instance after each import', () => {
    expect(shotsAfter(0)).toEqual([{ key: 'A0', frame: 125 }]);
    expect(shotsAfter(3).map((s) => s.key + ':' + s.frame)).toEqual(['A3:125', 'B3:425', 'C3:725', 'D3:1025']);
  });

  it('tells the old and the new QA patch apart', () => {
    expect(qaLook(frameWithPatch('#26D07C')).look).toBe('old');
    expect(qaLook(frameWithPatch('#A068FF')).look).toBe('new');
    expect(qaLook(frameWithPatch('#2AD480')).look).toBe('old');
    expect(qaLook(frameWithPatch('#FFFFFF'))).toMatchObject({ look: 'other', mean: '#FFFFFF' });
  });

  it('passes the default policy when a fresh capsuleID coexists with the old instance', () => {
    const checks = capsuleChecks(coexist, { changedKeepsId: true });
    expect(checks.filter((c) => !c.pass)).toEqual([]);
    expect(checks[1].name).toBe('AE re-export (the same capsuleID): B renders the new version');
  });

  it('fails it when the fresh capsuleID still renders the cached version', () => {
    const cached = { ...coexist, B1: 'old', B2: 'old', C2: 'old', B3: 'old', C3: 'old', D3: 'old' };
    const checks = capsuleChecks(cached, { changedKeepsId: true });
    expect(checks.filter((c) => c.required && !c.pass).map((c) => c.name)).toEqual(['fresh capsuleID: D renders the new version']);
    expect(policyNote(cached, { changedKeepsId: true })).toContain('Premiere keeps rendering the template it already holds');
  });

  it('writes the facts and the policy into one note', () => {
    expect(policyNote(coexist, { unchangedKeepsId: true, changedKeepsId: true, dupNewId: true })).toBe(
      'AE re-export of the unchanged comp keeps capsuleID: yes; after a change: yes; duplicated comp gets a new one: yes; '
      + 'a fresh capsuleID per version works, inserted instances stay as they were; with the old capsuleID both versions still coexist',
    );
  });
});
```

- [ ] **Step 6: Убедиться, что тест падает**

Run: `npx vitest run tests/spikes/s6-analyze.test.mjs`
Expected: FAIL — `Cannot find module '../../spikes/s6-capsule/analyze.mjs'`.

- [ ] **Step 7: Создать `spikes/s6-capsule/analyze.mjs`**

```js
// S6 analysis (pure, unit-tested in tests/spikes/s6-analyze.test.mjs): which version of the LowerThird each
// instance renders, judged by the QA_PATCH colour, and what that means for the versioning policy
// (spec 4.4, "Версии MOGRT").
import { REGIONS, round } from '../s3-instance/analyze.mjs';
import { meanColor } from '../../tools/png/read-png.mjs';
import { deltaE2000Rgb, hexToRgb, rgbToHex } from '../../tools/color/deltae.mjs';
import { nodeCheck } from '../../tools/spike/multistage.mjs';

export const OLD_HEX = '#26D07C'; // QA_PATCH of the fixture (part B)
export const NEW_HEX = '#A068FF'; // QA_PATCH after stage ae-changed (brand accent, D1)
export const MAX_DE = 10; // two far-apart colours: a classification, not the QA threshold
// Instances on V1 of CRT_S6, 10 s each by default: A the S2 template, B the AE re-export as is,
// C the re-export with the old capsuleID forced, D the re-export with a fresh capsuleID.
export const SLOTS = { A: 0, B: 12, C: 24, D: 36 };
export const LOOK_KEYS = ['A0', 'A1', 'B1', 'A2', 'B2', 'C2', 'A3', 'B3', 'C3', 'D3'];

export const shotFrame = (slot) => Math.round((SLOTS[slot] + 5) * 25);

// After import number `step` (0 = A ... 3 = D): a frame of every instance so far, keys like "B2".
export function shotsAfter(step) {
  return ['A', 'B', 'C', 'D'].slice(0, step + 1).map((k) => ({ key: k + step, frame: shotFrame(k) }));
}

export function qaLook(src) {
  const c = meanColor(src, REGIONS.patch);
  const dOld = deltaE2000Rgb(c, hexToRgb(OLD_HEX));
  const dNew = deltaE2000Rgb(c, hexToRgb(NEW_HEX));
  let look = 'other';
  if (dOld <= MAX_DE && dOld <= dNew) look = 'old';
  else if (dNew <= MAX_DE) look = 'new';
  return { look, mean: rgbToHex(c), dOld: round(dOld, 2), dNew: round(dNew, 2) };
}

// looks: { A0, A1, B1, ... D3 } -> 'old' | 'new' | 'other' | 'missing'; facts: data of stage "ids".
export function capsuleChecks(looks, facts = {}) {
  const same = facts.changedKeepsId === true ? 'the same' : 'a new';
  return [
    nodeCheck('A (the S2 template) renders the old QA colour before any re-import', looks.A0 === 'old', looks),
    nodeCheck('AE re-export (' + same + ' capsuleID): B renders the new version', looks.B1 === 'new', looks, false),
    nodeCheck('AE re-export: A still renders the old version', looks.A1 === 'old', looks, false),
    nodeCheck('forced old capsuleID: C renders the new version', looks.C2 === 'new', looks, false),
    nodeCheck('forced old capsuleID: A and B render as before', looks.A2 === 'old' && looks.B2 === looks.B1, looks, false),
    nodeCheck('fresh capsuleID: D renders the new version', looks.D3 === 'new', looks),
    nodeCheck('fresh capsuleID: A still renders the old version (versions coexist)', looks.A3 === 'old', looks),
  ];
}

const yesNo = (v) => (v === true ? 'yes' : v === false ? 'no' : '?');

// One line for the notes of S6.json: the facts and the policy they support.
export function policyNote(looks, facts = {}) {
  const parts = [
    'AE re-export of the unchanged comp keeps capsuleID: ' + yesNo(facts.unchangedKeepsId),
    'after a change: ' + yesNo(facts.changedKeepsId),
    'duplicated comp gets a new one: ' + yesNo(facts.dupNewId),
  ];
  if (looks.D3 === 'new' && looks.A3 === 'old') parts.push('a fresh capsuleID per version works, inserted instances stay as they were');
  if (looks.C2 === 'old') parts.push('with the old capsuleID Premiere keeps rendering the template it already holds');
  if (looks.C2 === 'new' && looks.A2 === 'new') parts.push('with the old capsuleID the new version also replaces inserted instances');
  if (looks.C2 === 'new' && looks.A2 === 'old') parts.push('with the old capsuleID both versions still coexist');
  return parts.join('; ');
}
```

- [ ] **Step 8: Запустить тест**

Run: `npx vitest run tests/spikes/s6-analyze.test.mjs`
Expected: `5 passed`.

- [ ] **Step 9: Создать AE-пробу `spikes/s6-capsule/ae-export.jsx`**

Один экспорт на вызов. Цвет патча меняется эффектом Fill: цвет солида после создания не меняется (ae-quirks #7). Параметр цвета Fill ищется по типу значения, а не по имени.

```js
// S6, After Effects stage (ES3, after spikes/lib/check.jsx). One export per call; Node waits for each
// .mogrt before the next call (S2 discipline: strictly one at a time, until the size settles).
//   asis    - open the S6 copy of CRT_fixture_egp.aep, export CRT_LowerThird_v1 unchanged
//   changed - QA_PATCH recoloured through a Fill effect, project saved, exported under the same template name
//   dup     - the (changed) master comp duplicated as PARAMS.dupName and exported under that name
// PARAMS: { mode, workDir, aep, comp, outDir, fonts, hex, rgb, dupName }
// Docs: https://ae-scripting.docsforadobe.dev/general/application/ (open, beginSuppressDialogs)
//       https://ae-scripting.docsforadobe.dev/general/project/ (dirty 17.5+, save(file), close)
//       https://ae-scripting.docsforadobe.dev/item/compitem/ (duplicate, openInEssentialGraphics,
//       motionGraphicsTemplateName, motionGraphicsTemplateControllerCount, exportAsMotionGraphicsTemplate)
var S6 = { mode: PARAMS.mode, templateName: null };
var s6Comp = null;

function s6Norm(p) {
  return String(p).replace(/\\/g, '/').toLowerCase();
}

function s6OpenPath() {
  var f = app.project ? app.project.file : null;
  return f ? String(f.fsName) : '';
}

function s6IsCopyOpen() {
  return s6Norm(s6OpenPath()) === s6Norm(new File(PARAMS.aep).fsName);
}

function s6InWork(p) {
  var root = s6Norm(PARAMS.workDir) + '/';
  return s6Norm(p).substr(0, root.length) === root;
}

// A changed project outside the work folder is the user's work: refuse instead of letting AE ask
// (a modal blocks the bridge, ae-quirks #25). A changed copy of ours is closed without saving.
function s6Open() {
  var p = null;
  if (s6IsCopyOpen()) {
    return 'already open';
  }
  if (app.project && app.project.dirty === true) {
    if (!s6InWork(s6OpenPath())) {
      throw new Error('BK_DIRTY_USER_PROJECT: save or close the open project first (' + (s6OpenPath() || 'untitled') + ')');
    }
    app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
  }
  app.beginSuppressDialogs();
  try {
    p = app.open(new File(PARAMS.aep));
  } finally {
    app.endSuppressDialogs(false);
  }
  if (!p) {
    throw new Error('BK_OPEN_FAILED: ' + PARAMS.aep);
  }
  return 'opened';
}

// Exactly one comp of that name: acting on the first of two same-named items is how templates go wrong.
function s6CompNamed(name) {
  var hits = [];
  var i, it;
  for (i = 1; i <= app.project.numItems; i++) {
    it = app.project.item(i);
    if (it instanceof CompItem && it.name === name) {
      hits.push(it);
    }
  }
  if (hits.length !== 1) {
    throw new Error('BK_COMP: ' + name + ' x' + hits.length);
  }
  return hits[0];
}

function s6LayerNamed(comp, name) {
  var hits = [];
  var i;
  for (i = 1; i <= comp.numLayers; i++) {
    if (comp.layer(i).name === name) {
      hits.push(comp.layer(i));
    }
  }
  if (hits.length !== 1) {
    throw new Error('BK_LAYER: ' + name + ' x' + hits.length + ' in ' + comp.name);
  }
  return hits[0];
}

// exportAsMotionGraphicsTemplate asks to save a changed project, so the copy is saved first; since 24.x
// it may return false before the file exists, so Node judges by the file, not by this value.
function s6Export(comp) {
  var rv = null;
  var name = comp.name;
  comp.openInEssentialGraphics();
  app.beginSuppressDialogs();
  try {
    if (app.project.dirty === true) {
      // A plain Save: the open project is already PARAMS.aep (s6Open). Save As (save(file)) left the
      // comp reference invalid in AE 26.5 ("Object is invalid", seen live 2026-10-02).
      app.project.save();
    }
    comp = s6CompNamed(name);
    // Read before exporting: after exportAsMotionGraphicsTemplate the comp reference is invalid in
    // AE 26.5 ("Object is invalid" on the next property read, seen live 2026-10-02).
    S6.templateName = String(comp.motionGraphicsTemplateName);
    S6.properties = comp.motionGraphicsTemplateControllerCount;
    rv = comp.exportAsMotionGraphicsTemplate(true, new Folder(PARAMS.outDir).fsName);
  } finally {
    app.endSuppressDialogs(false);
  }
  return String(rv);
}

// https://ae-scripting.docsforadobe.dev/text/fontsobject/ (getFontsByPostScriptName, AE 24.0+). A missing
// font would raise a dialog on open; a substitute reports a location outside the font's own file (#187).
var ok = check('SB Sans fonts installed, not substituted', function () {
  var rows = [];
  var good = true;
  var i, list, f, loc;
  for (i = 0; i < PARAMS.fonts.length; i++) {
    list = app.fonts.getFontsByPostScriptName(PARAMS.fonts[i]);
    f = list.length ? list[0] : null;
    loc = f ? String(f.location) : '';
    if (!f || f.isSubstitute === true || (loc !== '' && !/sbsans/i.test(loc))) {
      good = false;
    }
    rows.push({ ps: PARAMS.fonts[i], found: f !== null, location: loc });
  }
  return { pass: good, detail: rows };
});

ok = ok && check('S6 copy of CRT_fixture_egp.aep is the open project', function () {
  S6.open = s6Open();
  return { pass: s6IsCopyOpen(), detail: { open: s6OpenPath(), how: S6.open } };
});

ok = ok && check('template comp ' + PARAMS.comp + ' found once', function () {
  s6Comp = s6CompNamed(PARAMS.comp);
  return {
    pass: true,
    detail: { id: s6Comp.id, templateName: String(s6Comp.motionGraphicsTemplateName), properties: s6Comp.motionGraphicsTemplateControllerCount }
  };
});

if (ok && PARAMS.mode === 'changed') {
  ok = check('QA_PATCH recoloured to ' + PARAMS.hex + ' with a Fill effect', function () {
    var layer = s6LayerNamed(s6Comp, 'QA_PATCH');
    var fx = null;
    var color = null;
    var back, i;
    app.beginUndoGroup('BK S6 recolour');
    try {
      layer.property('ADBE Effect Parade').addProperty('ADBE Fill');
      // Fresh references after addProperty (ae-quirks #3); the colour is found by its value type, not by a
      // localized name. A solid cannot be recoloured after creation (ae-quirks #7), hence the Fill effect.
      fx = layer.property('ADBE Effect Parade').property(layer.property('ADBE Effect Parade').numProperties);
      for (i = 1; i <= fx.numProperties; i++) {
        if (fx.property(i).propertyValueType === PropertyValueType.COLOR) {
          color = fx.property(i);
          break;
        }
      }
      if (!color) {
        throw new Error('BK_NO_COLOR_PARAM in ' + fx.matchName);
      }
      color.setValue([PARAMS.rgb[0], PARAMS.rgb[1], PARAMS.rgb[2], 1]);
      back = color.value;
    } finally {
      app.endUndoGroup();
    }
    S6.fill = { effect: fx.matchName, param: color.matchName, value: [back[0], back[1], back[2]] };
    return {
      pass: Math.abs(back[0] - PARAMS.rgb[0]) < 0.01 && Math.abs(back[1] - PARAMS.rgb[1]) < 0.01 && Math.abs(back[2] - PARAMS.rgb[2]) < 0.01,
      detail: S6.fill
    };
  });
}

if (ok && PARAMS.mode === 'dup') {
  ok = check('master comp duplicated as ' + PARAMS.dupName, function () {
    var dup;
    app.beginUndoGroup('BK S6 duplicate');
    try {
      dup = s6Comp.duplicate();
      dup.name = PARAMS.dupName;
      dup.motionGraphicsTemplateName = PARAMS.dupName;
    } finally {
      app.endUndoGroup();
    }
    S6.dup = { master: s6Comp.motionGraphicsTemplateControllerCount, dup: dup.motionGraphicsTemplateControllerCount };
    s6Comp = dup;
    return { pass: dup.name === PARAMS.dupName, detail: S6.dup };
  });
  check('the duplicate keeps the Essential Graphics properties', function () {
    return { pass: !!S6.dup && S6.dup.dup === S6.dup.master, detail: S6.dup || null };
  }, false);
}

if (ok) {
  check(PARAMS.mode + ': exportAsMotionGraphicsTemplate called (Node waits for the file)', function () {
    S6.returned = s6Export(s6Comp);
    return { pass: true, detail: { returned: S6.returned, templateName: S6.templateName, properties: S6.properties } };
  });
}

finish(S6);
```

- [ ] **Step 10: Создать Premiere-пробу `spikes/s6-capsule/pr-insert.jsx`**

```js
// S6, Premiere stage (ES3, after spikes/lib/pr-helpers.jsx), in a fresh project of its own (CRT_pr_s6.prproj):
//   setup  - sequence CRT_S6 from the HD 1080p 25 fps preset, then the same as insert
//   insert - one MOGRT at PARAMS.atSec on V1, then frames of every instance so far (PARAMS.shots)
// The frames of all instances after each import show whether an import changed what older ones render.
// PARAMS: { mode, projectFile, seqName, seqId, preset, tpf, key, label, file, atSec, shots, framesDir,
//           pngPreset, frameWaitMs, templateHint }
var P = PARAMS;
var data = { frames: {}, item: null };
var seq = null;

var ready = projectCheck();

if (ready && P.mode === 'setup') {
  ready = check('the S6 project is fresh: no sequence ' + P.seqName + ' yet', function () {
    return { pass: !findSequenceByName(P.seqName), detail: P.seqName };
  });
  ready = ready && check('sequence ' + P.seqName + ' created from the HD 1080p 25 fps preset', function () {
    var r = newSequenceFromPreset(P.seqName, P.preset);
    seq = r.seq;
    return { pass: !!seq, detail: r.how };
  });
}

if (ready && P.mode !== 'setup') {
  ready = check('sequence ' + P.seqName + ' found', function () {
    seq = (P.seqId ? findSequenceById(P.seqId) : null) || findSequenceByName(P.seqName);
    return { pass: !!seq, detail: P.seqId || P.seqName };
  });
}

if (ready) {
  data.seqId = String(seq.sequenceID);
  ready = check('sequence ' + P.seqName + ' is active', function () {
    return activateSequence(seq);
  });
}

if (ready) {
  check(P.key + ': ' + P.label + ' inserted at ' + P.atSec + ' s on V1', function () {
    var r = importMogrt(seq, P.file, P.atSec, 0, 0, 3000);
    var info = { file: P.file, startF: r.startF, lenF: r.lenF, returned: r.returned, ms: r.ms, error: r.error };
    if (r.clip) {
      try {
        info.projectItem = String(r.clip.projectItem.name);
        info.nodeId = String(r.clip.projectItem.nodeId);
      } catch (e) {
        info.projectItem = 'EXC: ' + String(e);
      }
    }
    data.item = info;
    return { pass: !!r.clip, detail: info };
  });

  for (var k = 0; k < P.shots.length; k++) {
    frameCheck(seq, data, P.shots[k].key, P.shots[k].frame);
  }

  check('project items of the template recorded', function () {
    var items = [];
    walkProject(function (c, p) {
      if (strHas(String(c.name), P.templateHint)) {
        items.push({ path: p, nodeId: String(c.nodeId), type: c.type });
      }
      return false;
    });
    data.templateItems = items;
    return { pass: true, detail: items };
  }, false);
}

finish(data);
```

Run: `node tools/jsx/lint-jsx.cjs spikes/s6-capsule/ae-export.jsx spikes/s6-capsule/pr-insert.jsx`
Expected: две строки `OK    spikes/s6-capsule/<файл> (1 warning(s))`.

- [ ] **Step 11: Создать `spikes/s6-capsule/run.mjs` и проверить сборку проб без хостов**

```js
#!/usr/bin/env node
// S6: a changed MOGRT imported again into a project that already uses it; capsuleID (spec 3.1, S6).
//   node spikes/s6-capsule/run.mjs                  every stage, AE first, then Premiere
//   node spikes/s6-capsule/run.mjs --only <stages>  continue after a failed stage (same run folder)
//   node spikes/s6-capsule/run.mjs --project CRT_pr_s6_2.prproj --only pr-a,...   another fresh project
//   node spikes/s6-capsule/run.mjs --check          compose and lint every probe, no host
// Needs After Effects with the BrandKit Dev panel (CDP 8094) and no unsaved project of the user, Premiere
// with the fresh empty project CRT_pr_s6.prproj and the panel (CDP 8096), and S1/S2 outputs (part B).
import { copyFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { lintOrThrow } from '../../tools/host-run.mjs';
import { composeProbe } from '../../tools/spike/runner.mjs';
import { runStages, runStage, nodeCheck } from '../../tools/spike/multistage.mjs';
import { waitStableFile } from '../../tools/spike/wait-file.mjs';
import { workDir, workPath, ensureDir } from '../../tools/lib/work.mjs';
import { prBaseParams, presetSources, stagePreset, clearFrames } from '../../tools/pr/env.mjs';
import { readCapsuleId, patchCapsuleId, newCapsuleId, mogrtReady } from '../../tools/mogrt/capsule.mjs';
import { waitForPng } from '../../tools/png/read-png.mjs';
import { hexToRgb } from '../../tools/color/deltae.mjs';
import { COMP_LT, fixturePaths, fixtureParams } from '../fixtures/contract.mjs';
import { NEW_HEX, SLOTS, LOOK_KEYS, shotsAfter, qaLook, capsuleChecks, policyNote } from './analyze.mjs';

const ID = 'S6';
const TITLE = 'Повторный импорт MOGRT и capsuleID';
const FALLBACK = 'Политика: вставленные экземпляры заморожены, новая версия = новый шаблон с версией в имени';
const NOTES = 'AE работает с копией CRT_fixture_egp.aep в папке прогона; Premiere — в свежем проекте CRT_pr_s6.prproj, '
  + 'секвенция CRT_S6: A — шаблон S2, B — повторный экспорт как есть, C — он же со старым capsuleID, D — с новым.';
// Fixture contract (part B): the S2 template, the S1 copy with Essential Graphics, the SB Sans fonts.
const FIXTURE = fixturePaths();
const ORIG = path.posix.join(FIXTURE.mogrtDir, COMP_LT + '.mogrt');
const EGP_AEP = FIXTURE.egpAep;
const FONTS = Object.values(fixtureParams().fonts);
const DUP = 'CRT_LowerThird_v2';
const argv = process.argv.slice(2);
const PR6 = {
  projectFile: argv.includes('--project') ? argv[argv.indexOf('--project') + 1] : 'CRT_pr_s6.prproj',
  seqName: 'CRT_S6',
  dir: workPath('pr', 's6'),
};
const MGT_MEDIA = path.posix.join(PR6.dir, 'Motion Graphics Template Media');
const AE_PROBE = 'spikes/s6-capsule/ae-export.jsx';
const PR_FILES = ['spikes/lib/pr-helpers.jsx', 'spikes/s6-capsule/pr-insert.jsx'];

const aepCopy = (ctx) => path.posix.join(ctx.runDir, 'CRT_fixture_s6.aep');

function aeParams(ctx, mode) {
  const rgb = hexToRgb(NEW_HEX);
  return {
    mode, workDir: workDir(), aep: aepCopy(ctx), comp: COMP_LT, outDir: path.posix.join(ctx.runDir, mode),
    fonts: FONTS, hex: NEW_HEX, rgb: [rgb.r / 255, rgb.g / 255, rgb.b / 255], dupName: DUP,
  };
}

// S2 discipline: the next AE stage starts only after this .mogrt stopped growing and opens as a zip.
const aeStage = (mode) => async (ctx) => {
  if (mode === 'asis') {
    for (const f of [ORIG, EGP_AEP]) {
      if (!existsSync(f)) throw new Error('missing ' + f + ': run S1 and S2 (part B); by hand: part C task 14 step 1, task 16 step 1');
    }
    if (!existsSync(aepCopy(ctx))) copyFileSync(EGP_AEP, aepCopy(ctx));
  }
  const params = aeParams(ctx, mode);
  ensureDir(params.outDir);
  const t0 = Date.now();
  const r = await runStage({ host: 'ae', files: [AE_PROBE], params, timeoutMs: 300000 });
  if (r.data.returned === undefined) return r;
  const name = r.data.templateName || (mode === 'dup' ? DUP : COMP_LT);
  const file = path.posix.join(params.outDir, name + '.mogrt');
  const w = await waitStableFile(file, { stableMs: 2000, timeoutMs: 180000, sinceMs: t0 - 2000 });
  const ready = w.ok ? mogrtReady(file) : { ok: false, error: w.reason };
  r.checks.push(nodeCheck(mode + ': ' + name + '.mogrt written and readable', w.ok && ready.ok,
    { file, waitedMs: w.waitedMs, bytes: w.size, capsuleID: ready.capsuleID || null, error: ready.error || null }));
  return {
    ...r,
    data: { ...r.data, file: w.ok && ready.ok ? file : null, capsuleID: ready.capsuleID || null },
    evidence: w.ok ? [file] : [],
  };
};

async function ids(ctx) {
  const fileOf = (stage) => (ctx.stages[stage] && ctx.stages[stage].data.file) || null;
  const files = { asis: fileOf('ae-asis'), v2: fileOf('ae-changed'), dup: fileOf('ae-dup') };
  if (!files.v2) throw new Error('no re-exported .mogrt from stage ae-changed');
  const id = { orig: readCapsuleId(ORIG) };
  for (const [k, f] of Object.entries(files)) id[k] = f ? readCapsuleId(f) : null;
  const facts = {
    ...id,
    unchangedKeepsId: id.asis === null ? null : id.asis === id.orig,
    changedKeepsId: id.v2 === id.orig,
    dupNewId: id.dup === null ? null : id.dup !== id.orig && id.dup !== id.v2,
  };
  // The same file name in every variant, so only capsuleID and content differ.
  const sameFile = path.posix.join(ensureDir(path.posix.join(ctx.runDir, 'pr-sameid')), COMP_LT + '.mogrt');
  const newFile = path.posix.join(ensureDir(path.posix.join(ctx.runDir, 'pr-newid')), COMP_LT + '.mogrt');
  patchCapsuleId(files.v2, sameFile, id.orig);
  const fresh = patchCapsuleId(files.v2, newFile, newCapsuleId()).newId;
  return {
    checks: [
      nodeCheck('capsuleIDs read from the S2 template and the AE exports', Boolean(id.orig && id.v2), id),
      nodeCheck('AE: a re-export of the unchanged comp keeps the capsuleID', facts.unchangedKeepsId === true, facts, false),
      nodeCheck('AE: a re-export after a change keeps the capsuleID', facts.changedKeepsId === true, facts, false),
      nodeCheck('AE: a duplicated comp exports with a new capsuleID', facts.dupNewId === true, facts, false),
      nodeCheck('patched copies carry the old and a fresh capsuleID, the re-export itself unchanged',
        readCapsuleId(sameFile) === id.orig && readCapsuleId(newFile) === fresh && readCapsuleId(files.v2) === id.v2,
        { sameFile, newFile, fresh }),
    ],
    data: { facts, files: { ...files, sameFile, newFile } },
    evidence: [ORIG, sameFile, newFile],
  };
}

function listDir(dir) {
  return existsSync(dir) ? readdirSync(dir).sort() : 'missing';
}

function prParams(ctx, extra = {}, copy = true) {
  const a = ctx.stages['pr-a'];
  return {
    ...prBaseParams({ copy }),
    projectFile: PR6.projectFile,
    seqName: PR6.seqName,
    seqId: a ? a.data.seqId : null,
    preset: copy ? stagePreset(presetSources().seq1080p25, 'HD_1080p_25fps.sqpreset') : workPath('pr', 'presets', 'HD_1080p_25fps.sqpreset'),
    framesDir: path.posix.join(ctx.runDir, 'frames'),
    templateHint: 'CRT_LowerThird',
    ...extra,
  };
}

const prStage = (step, key, label, fileOf) => async (ctx) => {
  const file = fileOf(ctx);
  if (!file) throw new Error('no .mogrt for ' + key + ': stage ids has not run');
  clearFrames(ensureDir(path.posix.join(ctx.runDir, 'frames')), shotsAfter(step).map((s) => s.key));
  const r = await runStage({
    host: 'pr',
    files: PR_FILES,
    params: prParams(ctx, { mode: step === 0 ? 'setup' : 'insert', key, label, file, atSec: SLOTS[key], shots: shotsAfter(step) }),
    timeoutMs: 300000,
  });
  return { ...r, data: { ...r.data, mgtMedia: listDir(MGT_MEDIA) }, evidence: Object.values(r.data.frames || {}) };
};

const idsFile = (key) => (ctx) => ctx.stages.ids && ctx.stages.ids.data.files[key];

async function looks(ctx) {
  const frames = {};
  for (const n of ['pr-a', 'pr-b', 'pr-c', 'pr-d']) Object.assign(frames, (ctx.stages[n] && ctx.stages[n].data.frames) || {});
  const look = {};
  const detail = {};
  for (const key of LOOK_KEYS) {
    if (!frames[key]) {
      look[key] = 'missing';
      continue;
    }
    try {
      await waitForPng(frames[key], { timeoutMs: 60000 });
      detail[key] = qaLook(frames[key]);
      look[key] = detail[key].look;
    } catch (e) {
      look[key] = 'error';
      detail[key] = e.message;
    }
  }
  const facts = (ctx.stages.ids && ctx.stages.ids.data.facts) || {};
  const media = {};
  for (const n of ['pr-a', 'pr-b', 'pr-c', 'pr-d']) media[n] = ctx.stages[n] ? ctx.stages[n].data.mgtMedia : null;
  return {
    checks: capsuleChecks(look, facts).concat([
      nodeCheck('Motion Graphics Template Media after each import recorded', true, media, false),
    ]),
    data: { look, detail, media },
    notes: policyNote(look, facts),
  };
}

function checkOnly() {
  const ctx = { runDir: workPath('s6', 'run-check'), stages: { 'pr-a': { data: { seqId: 'x' } } } };
  for (const mode of ['asis', 'changed', 'dup']) {
    lintOrThrow(composeProbe([AE_PROBE], aeParams(ctx, mode)));
    console.log('OK ' + AE_PROBE + ' (' + mode + ')');
  }
  for (const step of [0, 1]) {
    lintOrThrow(composeProbe(PR_FILES, prParams(ctx, { mode: step ? 'insert' : 'setup', key: 'A', label: 'x', file: ORIG, atSec: 0, shots: shotsAfter(step) }, false)));
    console.log('OK spikes/s6-capsule/pr-insert.jsx (' + (step ? 'insert' : 'setup') + ')');
  }
}

if (process.argv.includes('--check')) {
  checkOnly();
} else {
  const out = await runStages({
    id: ID,
    title: TITLE,
    host: 'ae+pr',
    fallback: FALLBACK,
    notes: NOTES,
    argv,
    stages: [
      { name: 'ae-asis', host: 'ae', run: aeStage('asis') },
      { name: 'ae-changed', host: 'ae', run: aeStage('changed') },
      { name: 'ae-dup', host: 'ae', run: aeStage('dup') },
      { name: 'ids', host: 'node', run: ids },
      { name: 'pr-a', host: 'pr', run: prStage(0, 'A', 'S2 template', () => ORIG) },
      { name: 'pr-b', host: 'pr', run: prStage(1, 'B', 'AE re-export as is', idsFile('v2')) },
      { name: 'pr-c', host: 'pr', run: prStage(2, 'C', 're-export with the old capsuleID', idsFile('sameFile')) },
      { name: 'pr-d', host: 'pr', run: prStage(3, 'D', 're-export with a fresh capsuleID', idsFile('newFile')) },
      { name: 'looks', host: 'node', run: looks },
    ],
  });
  console.log('run folder: ' + out.runDir);
  process.exitCode = out.failed ? 1 : 0;
}
```

Run: `node --check spikes/s6-capsule/run.mjs && node spikes/s6-capsule/run.mjs --check`
Expected: пять строк `OK spikes/s6-capsule/…` (три режима AE-пробы, два режима Premiere-пробы).

- [ ] **Step 12: Подготовить AE и Premiere (вручную)**

1. After Effects 2026 открыт, панель Window → Extensions → «BrandKit Dev» открыта. Текущий проект сохранён (File → Save) или пустой (File → New → New Project): чужой несохранённый проект проба не закрывает и останавливается.
2. Premiere: закрыть все проекты (File → Close Project).
3. Run: `mkdir -p C:/CRBK/work/pr/s6`
4. File → New → Project…: Project name `CRT_pr_s6`, Project location → `C:\CRBK\work\pr\s6`, «Create new sequence» выключен → Create. File → Save.
5. Window → Extensions → «BrandKit Dev» в Premiere.
6. Проверить оба хоста:

Run: `node tools/host-run.mjs --host ae "JSON.stringify({ v: String(app.version), dirty: app.project.dirty })"`
Expected: `"v": "26.5…"`, `"dirty": false`.

Run: `node tools/host-run.mjs --host pr "JSON.stringify({ v: String(app.version), path: String(app.project.path), sequences: app.project.sequences.numSequences })"`
Expected: `path` оканчивается на `CRT_pr_s6.prproj`, `"sequences": 0`.

- [ ] **Step 13: Прогон S6**

Run: `node spikes/s6-capsule/run.mjs`
Expected (2–6 минут):

```text
S6 ae-asis: 5/5 checks passed
S6 ae-changed: 6/6 checks passed
S6 ae-dup: 7/7 checks passed
S6 ids: <2..5>/5 checks passed
S6 pr-a: 7/7 checks passed
S6 pr-b: 7/7 checks passed
S6 pr-c: 8/8 checks passed
S6 pr-d: 9/9 checks passed
S6 looks: <5..8>/8 checks passed
S6: <итог> (62 checks) -> …\spikes\results\S6.json
run folder: C:/CRBK/work/s6/run-<дата>-<время>
```

В `ids` и `looks` информационные проверки фиксируют факты и могут не пройти — тогда итог `partial`. Итог `no` — только если не прошла обязательная проверка (A, D или A после D).

Если упал AE-этап: посмотреть, нет ли в AE окна; проверить AE командой шага 12 и продолжить с упавшего этапа, например `node spikes/s6-capsule/run.mjs --only ae-changed,ae-dup,ids,pr-a,pr-b,pr-c,pr-d,looks`. Если упал Premiere-этап после `pr-a` — продолжить с него в том же проекте. Если упал сам `pr-a` после вставки, проект уже не свежий: создать новый пустой проект `CRT_pr_s6_2.prproj` в той же папке (пункты 2–5 шага 12) и запустить `node spikes/s6-capsule/run.mjs --project CRT_pr_s6_2.prproj --only pr-a,pr-b,pr-c,pr-d,looks`.

- [ ] **Step 14: Посмотреть на экземпляры (вручную, необязательно)**

В Premiere открыть секвенцию `CRT_S6`, встать на 5, 17, 29 и 41 с и сверить цвет квадрата вверху справа с `stages.looks.data.look` в `spikes/results/S6.data.json`. Если в Project появились лишние элементы шаблона или Premiere показывал окна при вставке — записать:

Run: `node tools/spike/manual.mjs --id S6 --check "visual: instance colours in the Program Monitor match the frames" --pass true --detail "<что видно, окна, элементы Project>" --optional`
Expected: `S6: <итог> (<n> checks)`.

- [ ] **Step 15: Отчёт и вывод для политики версий**

Run: `npm run spike:report`
Expected: в `spikes/RESULTS.md` строка `| S6 | Повторный импорт MOGRT и capsuleID | ae+pr | AE 26.5…; Pr 26.5.2… | … |`.

Как читать (вывод одной строкой — в `notes` итога, данные — в `S6.data.json`):
- `fresh capsuleID: …` (обе) прошли → политика §4.4 подтверждена: новая версия = новый `capsuleID`, вставленные экземпляры не меняются. Механизм конвейера — замена ID в `definition.json` (`tools/mogrt/capsule.mjs`); если `AE: a duplicated comp exports with a new capsuleID` прошла, годится и дубль мастер-композиции.
- Не прошли → запасной путь S6: экземпляры заморожены, новая версия — новый шаблон с версией в имени.
- `forced old capsuleID: C renders the new version` не прошла → Premiere держит то, что уже знает: тот же ID с новым содержимым показывает старую версию. Новый ID на каждую версию обязателен.
- `stages.ids.data.facts.changedKeepsId` — сохраняет ли AE ID при повторном экспорте. `true` — без замены ID новая версия уходит в проекты под старым ID, и что тогда рисует Premiere, показывают проверки C.
- `stages.pr-a…pr-d.data.mgtMedia` — папки в `Motion Graphics Template Media` после каждого импорта; `templateItems` — элементы шаблона в Project.

- [ ] **Step 16: Все тесты**

Run: `npm test`
Expected: все тесты зелёные, среди них `tests/tools/capsule.test.mjs` (6) и `tests/spikes/s6-analyze.test.mjs` (5).

- [ ] **Step 17: Commit**

```bash
git add tools/mogrt/capsule.mjs spikes/s6-capsule/analyze.mjs spikes/s6-capsule/ae-export.jsx spikes/s6-capsule/pr-insert.jsx spikes/s6-capsule/run.mjs tests/tools/capsule.test.mjs tests/spikes/s6-analyze.test.mjs spikes/results/S6.json spikes/results/S6.data.json spikes/RESULTS.md
git commit -m "feat(spikes): S6 MOGRT re-import and capsuleID" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 18: S7 — медиа, экспорт, вписать в окно, шаблонный .prproj

Четыре группы этапов, каждая со своим анализом в Node. Первый этап группы делает свой клон секвенции фикстуры (`CRT_S7_media`, `CRT_S7_fit`, `CRT_S7_tpl`), поэтому повтор группы начинается с чистого клона:
- **media** — ProRes 4444 с альфой и WAV на свободные дорожки в 0 с. Кадр в 2 с до и после альфа-клипа: при честной альфе меняется только квадрат клипа, а не вся картинка.
- **export** — брендовый `FullHD.epr` (Node копирует его из `7_Пресеты_Media_Encoder` исходного пакета в `C:/CRBK/work/pr/FullHD.epr`): `exportAsMediaDirect` и очередь AME (`encodeSequence` + `startBatch`), In/Out 0–5 с. ffprobe проверяет H.264 1920×1080, 25 fps, 5 с, AAC 48 кГц стерео; громкость — что тон из WAV попал в файл.
- **fit** — «вписать в окно»: `slot_b.png` (400×400) в 40 с. Сначала Node меряет, каким размером фото пришло (с учётом Scale, который Premiere поставил сам), затем проба ставит Position и Scale под окно 600×600 в (100, 100) и читает их назад. Записывается, нормирована ли Position. Потом Crop через QE: имена `Crop`, `Обрезка` и match name `AE.ADBE Crop` по очереди, Left = 50 %. Окно 16:9 для второго `bars2` в 50 с — только чтение назад.
- **template** — `CR_Templates_test.prproj` (собирается вручную, шаг 13) импортируется `importFiles`. Проба записывает, что пришло: корректирующий слой `CRT_Blur_Adjust`, стиль «CR Субтитры», секвенции. Слой ставится над `bars2` в 11 с; кадр в 12 с до и после даёт карту размытия.

**Обязательные проверки:** импорт и размещение обоих файлов, честная альфа, прямой экспорт с брендовым `.epr` (размер, fps, длина, кодеки), окно для фото, Crop через QE и его результат на кадре, импорт шаблонного проекта, корректирующий слой, размытие под ним, стиль субтитров. Информационные: очередь AME, сетка кадров у WAV, окно 16:9, маска (резкий центр), эффекты мастер-клипа, громкость тона.

**Files:**
- Create: `tools/png/frame-diff.mjs`, `spikes/s7-media-export/analyze.mjs`, `spikes/s7-media-export/stage-media.jsx`, `spikes/s7-media-export/stage-export.jsx`, `spikes/s7-media-export/stage-fit-place.jsx`, `spikes/s7-media-export/stage-fit-apply.jsx`, `spikes/s7-media-export/stage-template-import.jsx`, `spikes/s7-media-export/stage-template-place.jsx`, `spikes/s7-media-export/run.mjs`
- Test: `tests/tools/frame-diff.test.mjs`, `tests/spikes/s7-analyze.test.mjs`
- Create (прогоном): `spikes/results/S7.json`, `spikes/results/S7.data.json`
- Modify (генерируется `npm run spike:report`): `spikes/RESULTS.md`

- [ ] **Step 1: Написать падающий тест `tests/tools/frame-diff.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { meanAbsDiff, diffFraction, diffBox, tileMap } from '../../tools/png/frame-diff.mjs';

function canvas(w, h, [r, g, b] = [0, 0, 0]) {
  const img = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h * 4; i += 4) {
    img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
  }
  return img;
}

function fill(img, x, y, w, h, [r, g, b]) {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const i = (yy * img.width + xx) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b;
    }
  }
  return img;
}

describe('frame-diff', () => {
  it('measures the mean difference and the share of changed pixels', () => {
    const a = canvas(40, 40, [100, 100, 100]);
    const b = fill(canvas(40, 40, [100, 100, 100]), 0, 0, 20, 40, [130, 100, 100]);
    expect(meanAbsDiff(a, b, { x: 20, y: 0, w: 20, h: 40 })).toBe(0);
    expect(meanAbsDiff(a, b, { x: 0, y: 0, w: 20, h: 40 })).toBe(10);
    expect(diffFraction(a, b, null, 8)).toBe(0.5);
    expect(diffFraction(a, b, null, 30)).toBe(0);
  });

  it('boxes the changed pixels, inside a clipped rectangle', () => {
    const a = canvas(100, 60);
    const b = fill(canvas(100, 60), 10, 20, 30, 15, [200, 0, 0]);
    expect(diffBox(a, b, 12)).toEqual({ count: 450, box: { x0: 10, y0: 20, x1: 39, y1: 34, w: 30, h: 15 } });
    expect(diffBox(a, b, 12, { x: 25, y: 0, w: 500, h: 500 }).box).toEqual({ x0: 25, y0: 20, x1: 39, y1: 34, w: 15, h: 15 });
    expect(diffBox(a, a, 0)).toEqual({ count: 0, box: null });
  });

  it('refuses frames of different sizes', () => {
    expect(() => meanAbsDiff(canvas(4, 4), canvas(5, 4), null)).toThrow(/sizes differ/);
  });

  it('maps blurred, sharp and flat tiles', () => {
    const edges = () => fill(fill(canvas(80, 40), 10, 0, 10, 40, [255, 255, 255]), 50, 0, 10, 40, [255, 255, 255]);
    const t = tileMap(edges(), fill(edges(), 5, 0, 5, 40, [128, 128, 128]), { cols: 4, rows: 2, edgeMin: 10 });
    expect(t).toEqual({ map: ['B.S.', 'B.S.'], blurred: 2, sharp: 2 });
  });

  it('reads PNG files by path', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-fd-'));
    const fa = path.join(dir, 'a.png');
    const fb = path.join(dir, 'b.png');
    writeFileSync(fa, PNG.sync.write(canvas(4, 4)));
    writeFileSync(fb, PNG.sync.write(fill(canvas(4, 4), 1, 1, 2, 2, [255, 0, 255])));
    expect(diffBox(fa, fb, 0).count).toBe(4);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run tests/tools/frame-diff.test.mjs`
Expected: FAIL — `Cannot find module '../../tools/png/frame-diff.mjs'`.

- [ ] **Step 3: Создать `tools/png/frame-diff.mjs`**

Дополняет `read-png.mjs` (часть C): там — пиксель, среднее и центр цвета одного кадра, здесь — сравнение двух кадров.

```js
// Frame-to-frame measures for decoded PNGs, on top of tools/png/read-png.mjs (part C): mean difference,
// share of changed pixels, the box of the changed pixels and a blur map by tiles. `src` is a path or an
// image from readPng; rectangles are { x, y, w, h } and are clipped to the image.
import { readPng } from './read-png.mjs';

const load = (src) => (typeof src === 'string' ? readPng(src) : src);

function region(img, rect) {
  const r = rect || { x: 0, y: 0, w: img.width, h: img.height };
  return {
    x0: Math.max(0, Math.floor(r.x)),
    y0: Math.max(0, Math.floor(r.y)),
    x1: Math.min(img.width, Math.floor(r.x + r.w)),
    y1: Math.min(img.height, Math.floor(r.y + r.h)),
  };
}

function pair(srcA, srcB) {
  const a = load(srcA);
  const b = load(srcB);
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`frame sizes differ: ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  }
  return [a, b];
}

const changed = (a, b, i, tol) => Math.abs(a.data[i] - b.data[i]) > tol
  || Math.abs(a.data[i + 1] - b.data[i + 1]) > tol || Math.abs(a.data[i + 2] - b.data[i + 2]) > tol;

// Mean absolute difference per RGB channel (0..255) over the rectangle.
export function meanAbsDiff(srcA, srcB, rect) {
  const [a, b] = pair(srcA, srcB);
  const r = region(a, rect);
  let sum = 0;
  let n = 0;
  for (let y = r.y0; y < r.y1; y += 1) {
    for (let x = r.x0; x < r.x1; x += 1) {
      const i = (y * a.width + x) * 4;
      sum += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
      n += 3;
    }
  }
  return n ? sum / n : 0;
}

// Share of pixels where any channel differs by more than tol.
export function diffFraction(srcA, srcB, rect, tol) {
  const [a, b] = pair(srcA, srcB);
  const r = region(a, rect);
  let count = 0;
  let n = 0;
  for (let y = r.y0; y < r.y1; y += 1) {
    for (let x = r.x0; x < r.x1; x += 1) {
      if (changed(a, b, (y * a.width + x) * 4, tol)) count += 1;
      n += 1;
    }
  }
  return n ? count / n : 0;
}

// Number and bounding box of the pixels that differ by more than tol; box null when none do.
export function diffBox(srcA, srcB, tol, rect) {
  const [a, b] = pair(srcA, srcB);
  const r = region(a, rect);
  let count = 0;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let y = r.y0; y < r.y1; y += 1) {
    for (let x = r.x0; x < r.x1; x += 1) {
      if (!changed(a, b, (y * a.width + x) * 4, tol)) continue;
      count += 1;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return { count, box: count ? { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null };
}

// Before/after tiles: 'B' changed (blurred), 'S' textured and unchanged (sharp), '.' otherwise. A tile is
// textured when at least edgeMin horizontal neighbours differ by more than edgeDelta in grey level in the
// "before" frame: a flat tile looks the same blurred or not.
export function tileMap(srcA, srcB, { cols = 8, rows = 8, edgeDelta = 20, edgeMin = 50, blurMin = 1.5, sharpMax = 0.5 } = {}) {
  const [a, b] = pair(srcA, srcB);
  const tw = Math.floor(a.width / cols);
  const th = Math.floor(a.height / rows);
  const grey = (x, y) => {
    const i = (y * a.width + x) * 4;
    return (a.data[i] + a.data[i + 1] + a.data[i + 2]) / 3;
  };
  const map = [];
  let blurred = 0;
  let sharp = 0;
  for (let ty = 0; ty < rows; ty += 1) {
    let line = '';
    for (let tx = 0; tx < cols; tx += 1) {
      const rect = { x: tx * tw, y: ty * th, w: tw, h: th };
      let edges = 0;
      for (let y = rect.y; y < rect.y + th; y += 1) {
        for (let x = rect.x; x < rect.x + tw - 1; x += 1) {
          if (Math.abs(grey(x + 1, y) - grey(x, y)) > edgeDelta) edges += 1;
        }
      }
      const d = meanAbsDiff(a, b, rect);
      if (d > blurMin) {
        line += 'B';
        blurred += 1;
      } else if (d < sharpMax && edges >= edgeMin) {
        line += 'S';
        sharp += 1;
      } else {
        line += '.';
      }
    }
    map.push(line);
  }
  return { map, blurred, sharp };
}
```

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/tools/frame-diff.test.mjs`
Expected: `5 passed`.

- [ ] **Step 5: Написать падающий тест `tests/spikes/s7-analyze.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import {
  alphaChecks, parseMeanVolume, exportChecks, baseOfStill, fitChecks, blurChecks,
} from '../../spikes/s7-media-export/analyze.mjs';

const W = 1920;
const H = 1080;
function frame(paint) {
  const img = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const [r, g, b] = paint(x, y);
      const i = (y * W + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  return img;
}
const inside = (x, y, x0, y0, w, h) => x >= x0 && x < x0 + w && y >= y0 && y < y0 + h;
const stripes = (x) => (Math.floor(x / 30) % 2 ? [230, 230, 230] : [20, 20, 20]);
const BLACK = [0, 0, 0];
const ORANGE = [255, 69, 23];
const GREEN = [38, 208, 124];
const GOOD = { duration: 5.0, video: { codec: 'h264', width: 1920, height: 1080, fps: 25 }, audio: { codec: 'aac', sampleRate: 48000, channels: 2 } };

describe('S7 analysis', () => {
  it('sees an alpha clip over the picture, and a clip whose alpha was ignored', () => {
    const before = frame((x) => stripes(x));
    const after = frame((x, y) => (inside(x, y, 700, 440, 200, 200) ? GREEN : stripes(x)));
    expect(alphaChecks(before, after).map((c) => c.pass)).toEqual([true, true]);
    const opaque = frame((x, y) => (inside(x, y, 700, 440, 200, 200) ? GREEN : BLACK));
    expect(alphaChecks(before, opaque).map((c) => c.pass)).toEqual([true, false]);
  });

  it('reads the mean volume printed by ffmpeg volumedetect', () => {
    expect(parseMeanVolume('[Parsed_volumedetect_0 @ 0x1] mean_volume: -21.1 dB\n[...] max_volume: -18.1 dB')).toBe(-21.1);
    expect(parseMeanVolume('mean_volume: -inf dB')).toBe(-Infinity);
    expect(parseMeanVolume('no audio')).toBe(null);
  });

  it('checks an export of 5 s against the brand preset', () => {
    expect(exportChecks('direct', GOOD, -21).map((c) => [c.pass, c.required])).toEqual([[true, true], [true, false]]);
    expect(exportChecks('ame', { ...GOOD, video: { ...GOOD.video, fps: 24 } }, -91, false).map((c) => [c.pass, c.required]))
      .toEqual([[false, false], [false, false]]);
    expect(exportChecks('direct', null, null)[0].pass).toBe(false);
  });

  it('measures the base size of the still at Scale 100', () => {
    const img = frame((x, y) => (inside(x, y, 760, 340, 400, 400) ? ORANGE : BLACK));
    const r = baseOfStill(img);
    expect(r.check.pass).toBe(true);
    expect(r.baseW).toBe(400);
    expect(baseOfStill(img, 50).baseW).toBe(800);
  });

  it('checks fit to window and the crop', () => {
    const fit = frame((x, y) => (inside(x, y, 100, 100, 600, 600) ? ORANGE : BLACK));
    const crop = frame((x, y) => (inside(x, y, 400, 100, 300, 600) ? ORANGE : BLACK));
    expect(fitChecks(fit, crop).map((c) => c.pass)).toEqual([true, true]);
    const off = frame((x, y) => (inside(x, y, 660, 240, 600, 600) ? ORANGE : BLACK));
    expect(fitChecks(off, null).map((c) => c.pass)).toEqual([false, false]);
  });

  it('maps a blur that spares the centre', () => {
    const before = frame((x) => stripes(x));
    const after = frame((x, y) => (inside(x, y, 480, 270, 960, 540) ? stripes(x) : [128, 128, 128]));
    expect(blurChecks(before, after).map((c) => c.pass)).toEqual([true, true]);
    expect(blurChecks(before, before).map((c) => c.pass)).toEqual([false, true]);
  });
});
```

- [ ] **Step 6: Убедиться, что тест падает**

Run: `npx vitest run tests/spikes/s7-analyze.test.mjs`
Expected: FAIL — `Cannot find module '../../spikes/s7-media-export/analyze.mjs'`.

- [ ] **Step 7: Создать `spikes/s7-media-export/analyze.mjs`**

```js
// S7 analysis (pure, unit-tested in tests/spikes/s7-analyze.test.mjs): alpha, the brand exports,
// "fit to window", Crop through QE and the blur of the template adjustment layer.
import { findColorCentroid } from '../../tools/png/read-png.mjs';
import { diffFraction, diffBox, tileMap } from '../../tools/png/frame-diff.mjs';
import { nodeCheck } from '../../tools/spike/multistage.mjs';

export const STILL_HEX = '#FF4517'; // slot_b.png, 400x400 (fixture contract, part B)
export const WINDOW = { x: 100, y: 100, w: 600, h: 600 }; // where the still has to land
export const WIDE_WINDOW = { x: 1100, y: 150, w: 720, h: 405 }; // a 16:9 window for bars2 (read back only)
export const CROP_LEFT = 50; // percent, through the first Crop parameter
export const EXPORT_RANGE = { inSec: 0, outSec: 5 }; // In/Out of the exports: the alpha clip and the tone

// The alpha clip at its second second against the same frame before it was placed. Whatever the box
// looks like, an honoured alpha changes a small part of the picture; an ignored one paints most of it.
export function alphaChecks(before, after) {
  const fraction = diffFraction(before, after, null, 12);
  const box = diffBox(before, after, 12).box;
  return [
    nodeCheck('media: the ProRes 4444 clip shows over the bars', fraction > 0.001, { fraction, box }),
    nodeCheck('media: alpha honoured, the clip covers only its box', fraction > 0.001 && fraction < 0.25, { fraction, box }),
  ];
}

// "mean_volume: -21.0 dB" from ffmpeg -af volumedetect; null when the line is missing.
export function parseMeanVolume(stderr) {
  const m = /mean_volume:\s*(-?(?:\d+(?:\.\d+)?|inf))\s*dB/.exec(String(stderr));
  if (!m) return null;
  return m[1] === '-inf' ? -Infinity : Number(m[1]);
}

// probe: probeMedia() of tools/lib/media-probe.mjs (part B) for an export of EXPORT_RANGE with FullHD.epr.
export function exportChecks(key, probe, meanVolume, required = true) {
  const v = (probe && probe.video) || {};
  const a = (probe && probe.audio) || {};
  const want = EXPORT_RANGE.outSec - EXPORT_RANGE.inSec;
  const ok = Boolean(probe) && v.codec === 'h264' && v.width === 1920 && v.height === 1080 && Math.abs(v.fps - 25) < 0.01
    && Math.abs(probe.duration - want) <= 0.1 && a.codec === 'aac' && a.sampleRate === 48000 && a.channels === 2;
  return [
    nodeCheck(key + ': H.264 1920x1080, 25 fps, ' + want + ' s, AAC 48 kHz stereo', ok, probe, required),
    nodeCheck(key + ': the 1 kHz tone is in the export (mean volume above -40 dB)',
      typeof meanVolume === 'number' && meanVolume > -40, { meanVolume }, false),
  ];
}

// The still as it arrives: centred, drawn at the Scale it got (100, or more with "Set to frame size").
// baseW is its width at Scale 100, the base of the Scale in the recipe.
export function baseOfStill(img, currentScale = 100) {
  const c = findColorCentroid(img, STILL_HEX, 16);
  const centred = c.box !== null && Math.abs(c.x - 960) <= 2 && Math.abs(c.y - 540) <= 2 && c.box.w === c.box.h;
  const baseW = c.box && currentScale > 0 ? (c.box.w * 100) / currentScale : null;
  return {
    check: nodeCheck('fit: the still arrives as a centred square, its size measured', centred, { ...c, currentScale, baseW }),
    baseW,
  };
}

export function fitChecks(fitWindow, fitCrop) {
  const checks = [];
  const name1 = 'fit: the still lands on the window ' + WINDOW.x + ',' + WINDOW.y + ' ' + WINDOW.w + 'x' + WINDOW.h;
  const name2 = 'crop: Crop left ' + CROP_LEFT + ' % added through QE cuts the left half of the window';
  if (fitWindow) {
    const c = findColorCentroid(fitWindow, STILL_HEX, 16);
    checks.push(nodeCheck(name1, c.box !== null && Math.abs(c.x - (WINDOW.x + WINDOW.w / 2)) <= 3
      && Math.abs(c.y - (WINDOW.y + WINDOW.h / 2)) <= 3 && Math.abs(c.box.w - WINDOW.w) <= 4 && Math.abs(c.box.h - WINDOW.h) <= 4, c));
  } else {
    checks.push(nodeCheck(name1, false, 'frame fitWindow missing'));
  }
  if (fitCrop) {
    const c = findColorCentroid(fitCrop, STILL_HEX, 16);
    const cut = WINDOW.x + (WINDOW.w * CROP_LEFT) / 100;
    checks.push(nodeCheck(name2, c.box !== null && Math.abs(c.box.x0 - cut) <= 4
      && Math.abs(c.box.x1 - (WINDOW.x + WINDOW.w - 1)) <= 4 && Math.abs(c.box.h - WINDOW.h) <= 4, c));
  } else {
    checks.push(nodeCheck(name2, false, 'frame fitCrop missing (Crop through QE did not happen?)'));
  }
  return checks;
}

// Before and after the template adjustment layer over SMPTE bars (vertical edges across the top two thirds).
export function blurChecks(before, after) {
  const t = tileMap(before, after);
  return [
    nodeCheck('template: the adjustment layer blurs the picture below it', t.blurred >= 2, t),
    nodeCheck('template: its inverted mask keeps part of the picture sharp', t.sharp >= 1, t, false),
  ];
}
```

- [ ] **Step 8: Запустить тест**

Run: `npx vitest run tests/spikes/s7-analyze.test.mjs`
Expected: `6 passed`.

- [ ] **Step 9: Создать этапы `spikes/s7-media-export/stage-media.jsx` и `spikes/s7-media-export/stage-export.jsx`**

`exportAsMediaDirect` работает только с активной секвенцией и нативными путями и возвращается, когда файл записан. Задание AME пишет файл позже; Node его ждёт.

```js
// S7 stage "media" (Premiere, ES3, after spikes/lib/pr-helpers.jsx): ProRes 4444 with alpha and a WAV
// imported into CRT_Media and overwritten onto free tracks of a fixture clone; a frame before and after
// the alpha clip at the same moment for the Node check. Track indices are 0-based.
var P = PARAMS;
var tpf = Number(P.tpf);
var data = { frames: {} };
var seq = null;
var bin = null;
var alpha = null;
var wav = null;
var shot = secToFrames(P.shotSec, tpf);

var ready = projectCheck();
if (ready) {
  seq = workCloneCheck(data);
  ready = !!seq;
}

if (ready) {
  check('media bin ' + P.binName + ' ready', function () {
    bin = ensureBin(P.binName);
    return { pass: !!bin, detail: bin ? String(bin.name) : null };
  });
}

if (ready && bin) {
  check('ProRes 4444 with alpha imported', function () {
    var r = importFile(P.alpha, bin, 10000);
    var fi;
    alpha = r.item;
    data.alphaImport = { attempts: r.attempts, ms: r.ms, reused: r.reused };
    if (alpha) {
      // ProjectItem.getFootageInterpretation(): https://ppro-scripting.docsforadobe.dev/item/projectitem/
      try {
        fi = alpha.getFootageInterpretation();
        data.alphaInterp = { alphaUsage: fi.alphaUsage, ignoreAlpha: fi.ignoreAlpha, invertAlpha: fi.invertAlpha, frameRate: fi.frameRate };
      } catch (e) {
        data.alphaInterp = 'EXC: ' + String(e);
      }
    }
    return { pass: !!alpha, detail: { importInfo: data.alphaImport, interpretation: data.alphaInterp || null } };
  });
  check('WAV imported', function () {
    var r = importFile(P.wav, bin, 10000);
    wav = r.item;
    return { pass: !!wav, detail: { attempts: r.attempts, ms: r.ms, reused: r.reused } };
  });
  frameCheck(seq, data, 'alphaBefore', shot);
}

if (ready && alpha) {
  check('alpha clip overwritten onto the first free video track above V1 at 0 s', function () {
    var v = firstFreeTrack(seq.videoTracks, 1, 0, P.clipSec);
    var r;
    if (v < 0) {
      return { pass: false, detail: 'no free video track over 0-' + P.clipSec + ' s' };
    }
    r = placeClip(seq.videoTracks[v], alpha, 0, tpf);
    data.alphaTrack = 'V' + (v + 1);
    data.alphaTimes = r.clip ? clipTimes(r.clip, tpf) : null;
    return {
      pass: !!r.clip && data.alphaTimes.endF - data.alphaTimes.startF === secToFrames(P.clipSec, tpf),
      detail: { track: data.alphaTrack, times: data.alphaTimes }
    };
  });
  frameCheck(seq, data, 'alphaAfter', shot);
}

if (ready && wav) {
  check('WAV overwritten onto the first free audio track at 0 s', function () {
    var a = firstFreeTrack(seq.audioTracks, 0, 0, P.clipSec);
    var r;
    if (a < 0) {
      return { pass: false, detail: 'no free audio track over 0-' + P.clipSec + ' s' };
    }
    r = placeClip(seq.audioTracks[a], wav, 0, tpf);
    data.wavTrack = 'A' + (a + 1);
    data.wavTimes = r.clip ? clipTimes(r.clip, tpf) : null;
    return {
      pass: !!r.clip && Math.abs(data.wavTimes.endF - data.wavTimes.startF - secToFrames(P.clipSec, tpf)) <= 1,
      detail: { track: data.wavTrack, times: data.wavTimes }
    };
  });
  // Audio-only files are interpreted at their own rate, so their edges may miss the 25p grid
  // (premiere-autopilot SKILL.md, "Times, in/out points").
  check('WAV clip edges lie on the 25p frame grid', function () {
    return { pass: !!data.wavTimes && data.wavTimes.onGrid, detail: data.wavTimes || null };
  }, false);
}

finish(data);
```

```js
// S7 stage "export" (Premiere, ES3, after pr-helpers.jsx): the brand FullHD.epr through
// exportAsMediaDirect and through the AME queue (encodeSequence + startBatch), both over In/Out
// P.inSec-P.outSec of the work clone, which holds the alpha clip and the tone.
var P = PARAMS;
var data = {};
var seq = null;
var tpf = 0;

var ready = projectCheck();
if (ready) {
  seq = workSeqCheck(data);
  ready = !!seq;
}

if (ready) {
  tpf = Number(seq.timebase);
  // AME takes a while to start, so it is launched first. https://ppro-scripting.docsforadobe.dev/general/encoder/
  check('AME launched (app.encoder.launchEncoder)', function () {
    return { pass: true, detail: describeValue(app.encoder.launchEncoder()) };
  }, false);
  ready = check('In/Out set to ' + P.inSec + '-' + P.outSec + ' s', function () {
    var a, b;
    // setInPoint/setOutPoint take seconds and round down: aim one millisecond into the frame.
    seq.setInPoint(P.inSec + 0.001);
    seq.setOutPoint(P.outSec + 0.001);
    a = ticksToFrames(seq.getInPointAsTime().ticks, tpf);
    b = ticksToFrames(seq.getOutPointAsTime().ticks, tpf);
    return { pass: a === secToFrames(P.inSec, tpf) && b === secToFrames(P.outSec, tpf), detail: [a, b] };
  });
}

if (ready) {
  check('file extension of the brand preset', function () {
    // Sequence.getExportFileExtension(presetPath): https://ppro-scripting.docsforadobe.dev/sequence/sequence/
    var ext = String(seq.getExportFileExtension(new File(P.epr).fsName));
    if (ext.charAt(0) === '.') {
      ext = ext.substr(1);
    }
    data.ext = ext;
    return { pass: ext !== '', detail: ext };
  }, false);

  check('exportAsMediaDirect with the brand .epr wrote a file', function () {
    var out = P.outDir + '/direct_FullHD.' + (data.ext || 'mp4');
    var t0 = new Date().getTime();
    var rv, f;
    // Active sequence and native paths only; workAreaType 1 = In/Out (premiere-autopilot SKILL.md).
    // https://ppro-scripting.docsforadobe.dev/sequence/sequence/ (exportAsMediaDirect)
    rv = seq.exportAsMediaDirect(new File(out).fsName, new File(P.epr).fsName, 1);
    f = new File(out);
    data.direct = { file: out, returned: String(rv), ms: new Date().getTime() - t0, bytes: f.exists ? f.length : 0 };
    return { pass: f.exists && f.length > 0, detail: data.direct };
  });

  check('AME job queued with the brand .epr (app.encoder.encodeSequence)', function () {
    var out = P.outDir + '/ame_FullHD.' + (data.ext || 'mp4');
    // encodeSequence(sequence, outputPath, presetPath, workArea 1 = In/Out, removeUponCompletion) -> job ID.
    var job = app.encoder.encodeSequence(seq, new File(out).fsName, new File(P.epr).fsName, 1, 1);
    data.ame = { file: out, job: String(job) };
    return { pass: !!job && String(job) !== '0', detail: data.ame };
  }, false);

  check('AME batch started (app.encoder.startBatch)', function () {
    return { pass: true, detail: describeValue(app.encoder.startBatch()) };
  }, false);
}

finish(data);
```

- [ ] **Step 10: Создать этапы `spikes/s7-media-export/stage-fit-place.jsx` и `spikes/s7-media-export/stage-fit-apply.jsx`**

Motion находится по match name `AE.ADBE Motion`, Position и Scale — по индексам 0 и 1 (так их использует `applyVerticalReframe` в Extensions-LLM-Chat_Pr). QE возвращает промах как пустой объект эффекта, поэтому найденным считается эффект с непустым именем.

```js
// S7 stage "fit-place" (Premiere, ES3, after pr-helpers.jsx), in a fresh clone of the fixture: slot_b.png
// (400x400, #FF4517) at P.stillSec and a second bars2 at P.wideSec, on free tracks over black (V1 ends at
// 30 s); the Motion parameters as they arrive; one frame from which Node measures the still's displayed size.
var P = PARAMS;
var tpf = Number(P.tpf);
var data = { frames: {} };
var seq = null;
var still = null;

var ready = projectCheck();
if (ready) {
  seq = workCloneCheck(data);
  ready = !!seq;
}

if (ready) {
  check('slot_b.png placed at ' + P.stillSec + ' s', function () {
    var r = importFile(P.still, ensureBin(P.binName), 8000);
    var v;
    if (!r.item) {
      return { pass: false, detail: 'import failed' };
    }
    v = firstFreeTrack(seq.videoTracks, 1, P.stillSec, P.stillSec + 6);
    if (v < 0) {
      return { pass: false, detail: 'no free video track' };
    }
    still = placeClip(seq.videoTracks[v], r.item, P.stillSec, tpf).clip;
    data.still = { track: v, name: still ? String(still.name) : null, times: still ? clipTimes(still, tpf) : null };
    return { pass: !!still, detail: data.still };
  });

  check('second bars2 instance placed at ' + P.wideSec + ' s', function () {
    var item = findItemByPath(P.bars2);
    var v, wide;
    if (!item) {
      return { pass: false, detail: 'bars2 is not in the project (Task 15)' };
    }
    v = firstFreeTrack(seq.videoTracks, 1, P.wideSec, P.wideSec + 11);
    if (v < 0) {
      return { pass: false, detail: 'no free video track' };
    }
    wide = placeClip(seq.videoTracks[v], item, P.wideSec, tpf).clip;
    data.wide = { track: v, times: wide ? clipTimes(wide, tpf) : null };
    return { pass: !!wide, detail: data.wide };
  });
}

if (still) {
  // Motion by match name, never by its localized display name; parameters by index (0 Position, 1 Scale,
  // as Extensions-LLM-Chat_Pr applyVerticalReframe uses them). The defaults show whether Position is normalized.
  check('Motion found by match name AE.ADBE Motion', function () {
    var m = componentByMatch(still, 'AE.ADBE Motion');
    data.components = componentList(still);
    data.motion = m ? paramList(m) : null;
    return { pass: !!m, detail: { components: data.components, motion: data.motion } };
  });
  frameCheck(seq, data, 'fitBase', secToFrames(P.shotSec, tpf));
}

finish(data);
```

```js
// S7 stage "fit-apply" (Premiere, ES3, after pr-helpers.jsx): the "fit to window" recipe through Motion
// (match name AE.ADBE Motion; parameters by index: 0 Position, 1 Scale), read back and rendered; then Crop
// added through QE (every name variant tried and recorded) and set through the DOM by parameter index.
var P = PARAMS;
var tpf = Number(P.tpf);
var data = { frames: {}, undoApi: typeof app.beginUndoGroup };
var seq = null;
var crop = null;

function clipAt(trackIdx, sec) {
  return clipStartingAt(seq.videoTracks[trackIdx], secToFrames(sec, tpf), tpf);
}

function isNormalized(v) {
  return !!v && v.length === 2 && v[0] >= 0 && v[0] <= 1.0001 && v[1] >= 0 && v[1] <= 1.0001;
}

// Position goes to the centre of the window (normalized or in pixels, as the default value shows);
// Scale = window width / displayed width at Scale 100 x 100.
function fitRecipe(trackIdx, sec, win, baseW) {
  var m = componentByMatch(clipAt(trackIdx, sec), 'AE.ADBE Motion');
  var pos0 = m.properties[0].getValue();
  var norm = isNormalized(pos0);
  var cx = win.x + win.w / 2;
  var cy = win.y + win.h / 2;
  var target = norm ? [cx / P.frameW, cy / P.frameH] : [cx, cy];
  var scale = 100 * win.w / baseW;
  var m2, pos, sc;
  m.properties[0].setValue(target, 1);
  m.properties[1].setValue(scale, 1);
  m2 = componentByMatch(clipAt(trackIdx, sec), 'AE.ADBE Motion');
  pos = m2.properties[0].getValue();
  sc = Number(m2.properties[1].getValue());
  return {
    normalized: norm, pos0: describeValue(pos0), target: target, scale: scale, backPos: describeValue(pos), backScale: sc,
    names: [String(m2.properties[0].displayName), String(m2.properties[1].displayName)],
    ok: Math.abs(pos[0] - target[0]) < 0.0001 && Math.abs(pos[1] - target[1]) < 0.0001 && Math.abs(sc - scale) < 0.01
  };
}

var ready = projectCheck();
if (ready) {
  seq = workSeqCheck(data);
  ready = !!seq;
}
ready = ready && check('clips of stage fit-place found', function () {
  return { pass: !!clipAt(P.stillTrack, P.stillSec) && !!clipAt(P.wideTrack, P.wideSec), detail: [P.stillTrack, P.wideTrack] };
});

if (ready) {
  check('fit recipe on the still: Position and Scale set and read back', function () {
    data.fitStill = fitRecipe(P.stillTrack, P.stillSec, P.window, P.baseW);
    return { pass: data.fitStill.ok, detail: data.fitStill };
  });
  frameCheck(seq, data, 'fitWindow', secToFrames(P.shotSec, tpf));

  check('16:9 recipe on bars2: Position and Scale set and read back', function () {
    data.fitWide = fitRecipe(P.wideTrack, P.wideSec, P.wideWindow, P.frameW);
    return { pass: data.fitWide.ok, detail: data.fitWide };
  }, false);

  check('Crop found through QE (the name depends on the UI language)', function () {
    var tries = [];
    var listed = [];
    var i, h, e, nm, list;
    if (!ensureQE()) {
      return { pass: false, detail: 'QE unavailable' };
    }
    for (i = 0; i < P.cropNames.length; i++) {
      e = null;
      try { e = qe.project.getVideoEffectByName(P.cropNames[i]); } catch (err) { e = null; }
      // A miss may come back as an empty effect object (premiere-autopilot fillmono.mjs checks the name).
      if (e && e.name !== undefined && String(e.name) === '') {
        e = null;
      }
      tries.push(P.cropNames[i] + ': ' + (e ? 'found' : 'no'));
      if (e && !crop) {
        crop = e;
        data.cropBy = P.cropNames[i];
      }
    }
    try {
      list = qe.project.getVideoEffectList();
      data.effectCount = list.length;
      for (i = 0; i < list.length; i++) {
        nm = String(list[i]).toLowerCase();
        for (h = 0; h < P.cropHints.length; h++) {
          if (strHas(nm, P.cropHints[h])) {
            listed.push(String(list[i]));
          }
        }
      }
    } catch (err3) {
      listed.push('getVideoEffectList: ' + String(err3));
    }
    data.cropTries = tries;
    data.cropListed = listed;
    return { pass: !!crop, detail: { by: data.cropBy || null, tries: tries, listed: listed } };
  });
}

if (ready && crop) {
  check('Crop added to the still through QE and seen in the DOM', function () {
    var before = componentList(clipAt(P.stillTrack, P.stillSec));
    var qi = qeItemFor(qe.project.getActiveSequence().getVideoTrackAt(P.stillTrack), String(clipAt(P.stillTrack, P.stillSec).name), P.stillSec);
    var after;
    if (!qi) {
      return { pass: false, detail: 'no QE item for the still' };
    }
    qi.addVideoEffect(crop);
    after = componentList(clipAt(P.stillTrack, P.stillSec));
    data.cropComponent = after.length === before.length + 1 ? after[after.length - 1] : null;
    return { pass: !!data.cropComponent, detail: { before: before, after: after } };
  });
}

if (ready && data.cropComponent) {
  check('Crop parameter ' + P.cropParam + ' set to ' + P.cropLeft + ' and read back', function () {
    var c = clipAt(P.stillTrack, P.stillSec).components[data.cropComponent.index];
    var back;
    data.cropParams = paramList(c);
    c.properties[P.cropParam].setValue(P.cropLeft, 1);
    back = Number(clipAt(P.stillTrack, P.stillSec).components[data.cropComponent.index].properties[P.cropParam].getValue());
    return { pass: Math.abs(back - P.cropLeft) < 0.01, detail: { params: data.cropParams, back: back } };
  });
  frameCheck(seq, data, 'fitCrop', secToFrames(P.shotSec, tpf));
}

finish(data);
```

- [ ] **Step 11: Создать этапы `spikes/s7-media-export/stage-template-import.jsx` и `spikes/s7-media-export/stage-template-place.jsx`**

Если Premiere на импорт `.prproj` покажет окно Import Project, вызов зависнет (шаг 15). Повторный запуск этапа находит уже импортированные элементы и второй раз не импортирует.

```js
// S7 stage "template-import" (Premiere, ES3, after pr-helpers.jsx): CR_Templates_test.prproj imported with
// importFiles; what lands in the project is recorded: the adjustment layer with its master clip effects, the
// caption track style, the sequences. If Premiere shows its Import Project dialog instead, the call blocks
// (Task 18 says what to do); a second run finds the items and does not import again.
var P = PARAMS;
var data = { added: [], importedEarlier: false };

// '/Bin/Item' -> '/Bin': the bin the template project came in.
function topBin(path) {
  var parts = String(path).split('/');
  return parts.length > 2 ? '/' + parts[1] : '';
}

var ready = projectCheck();
ready = ready && check('template project exists: ' + P.templates, function () {
  return { pass: new File(P.templates).exists, detail: P.templates };
});

if (ready) {
  check('importFiles(.prproj) brought the template items into the project', function () {
    var before = projectTree();
    var known = {};
    var i, rv, deadline, last, stable, now, bin;
    for (i = 0; i < before.length; i++) {
      known[before[i].nodeId] = true;
      if (endsWith(before[i].path, '/' + P.adjName)) {
        bin = topBin(before[i].path);
        data.importedEarlier = true;
      }
    }
    if (data.importedEarlier) {
      for (i = 0; i < before.length; i++) {
        if (bin !== '' && before[i].path.substr(0, bin.length) === bin) {
          data.added.push(before[i]);
        }
      }
      return { pass: data.added.length > 0, detail: { importedEarlier: true, bin: bin, items: data.added } };
    }
    // https://ppro-scripting.docsforadobe.dev/general/project/ (importFiles; suppressUI = true)
    rv = app.project.importFiles([new File(P.templates).fsName], true, app.project.rootItem, false);
    // The import lands asynchronously: wait until something arrived and the tree stopped growing for 2 s.
    deadline = new Date().getTime() + P.waitMs;
    last = -1;
    stable = 0;
    now = before;
    while (new Date().getTime() < deadline && !(now.length > before.length && stable >= 10)) {
      $.sleep(200);
      now = projectTree();
      if (now.length === last) {
        stable += 1;
      } else {
        stable = 0;
        last = now.length;
      }
    }
    for (i = 0; i < now.length; i++) {
      if (!known[now[i].nodeId]) {
        data.added.push(now[i]);
      }
    }
    data.returned = describeValue(rv);
    return { pass: data.added.length > 0, detail: { returned: data.returned, added: data.added } };
  });

  check('adjustment layer ' + P.adjName + ' arrived', function () {
    var i;
    for (i = 0; i < data.added.length; i++) {
      if (endsWith(data.added[i].path, '/' + P.adjName)) {
        data.adj = data.added[i];
      }
    }
    return { pass: !!data.adj, detail: data.adj || null };
  });

  if (data.adj) {
    check('master clip effects of ' + P.adjName + ' (ProjectItem.videoComponents)', function () {
      // https://ppro-scripting.docsforadobe.dev/item/projectitem/ (videoComponents)
      var comps = findItemByNodeId(data.adj.nodeId).videoComponents();
      var list = [];
      var i;
      for (i = 0; i < comps.numItems; i++) {
        list.push(String(comps[i].matchName));
      }
      data.adjComponents = list;
      return { pass: strHas(list.join('|'), 'Gaussian'), detail: list };
    }, false);
  }

  check('caption style ' + P.styleName + ' arrived', function () {
    var i;
    for (i = 0; i < data.added.length; i++) {
      if (endsWith(data.added[i].path, '/' + P.styleName)) {
        data.style = data.added[i];
      }
    }
    return { pass: !!data.style, detail: data.style || null };
  });

  check('sequences in the project after the import recorded', function () {
    var list = [];
    var seqs = app.project.sequences;
    var i;
    for (i = 0; i < seqs.numSequences; i++) {
      list.push(String(seqs[i].name));
    }
    data.sequences = list;
    return { pass: true, detail: list };
  }, false);
}

finish(data);
```

```js
// S7 stage "template-place" (Premiere, ES3, after pr-helpers.jsx), in a fresh clone of the fixture: the
// imported adjustment layer on the first free track above V2, over bars2; a frame at the same moment before
// and after it for the Node blur map.
var P = PARAMS;
var tpf = Number(P.tpf);
var data = { frames: {} };
var seq = null;
var adj = null;
var shot = 0;

var ready = projectCheck();
if (ready) {
  seq = workCloneCheck(data);
  ready = !!seq;
}
ready = ready && check('adjustment layer item found', function () {
  adj = (P.adjNodeId ? findItemByNodeId(P.adjNodeId) : null) || findItemByName(P.adjName);
  return { pass: !!adj, detail: adj ? String(adj.treePath) : null };
});

if (ready) {
  shot = secToFrames(P.shotSec, tpf);
  frameCheck(seq, data, 'tplBefore', shot);
  check(P.adjName + ' placed above V2 at ' + P.atSec + ' s', function () {
    var v = firstFreeTrack(seq.videoTracks, 2, P.atSec, P.atSec + 6);
    var clip;
    if (v < 0) {
      return { pass: false, detail: 'no free video track above V2' };
    }
    clip = placeClip(seq.videoTracks[v], adj, P.atSec, tpf).clip;
    if (!clip) {
      return { pass: false, detail: 'nothing on V' + (v + 1) + ' at ' + P.atSec + ' s' };
    }
    data.placed = { track: 'V' + (v + 1), times: clipTimes(clip, tpf), components: componentList(clip) };
    // TrackItem.isAdjustmentLayer(): https://ppro-scripting.docsforadobe.dev/item/trackitem/
    try { data.placed.isAdjustmentLayer = clip.isAdjustmentLayer(); } catch (e) { data.placed.isAdjustmentLayer = 'EXC: ' + String(e); }
    return { pass: true, detail: data.placed };
  });
  frameCheck(seq, data, 'tplAfter', shot);
}

finish(data);
```

- [ ] **Step 12: Прогнать ES3-линтер, создать `spikes/s7-media-export/run.mjs` и проверить сборку проб без Premiere**

Run: `node tools/jsx/lint-jsx.cjs spikes/s7-media-export/stage-media.jsx spikes/s7-media-export/stage-export.jsx spikes/s7-media-export/stage-fit-place.jsx spikes/s7-media-export/stage-fit-apply.jsx spikes/s7-media-export/stage-template-import.jsx spikes/s7-media-export/stage-template-place.jsx`
Expected: шесть строк `OK    spikes/s7-media-export/<файл> (1 warning(s))`.

`spikes/s7-media-export/run.mjs`:

```js
#!/usr/bin/env node
// S7: media, brand export, "fit to window", Crop through QE, the template .prproj (spec 3.1 S7, D11, D25).
//   node spikes/s7-media-export/run.mjs                  every stage
//   node spikes/s7-media-export/run.mjs --only <stages>  continue after a failed stage (same run folder)
//   node spikes/s7-media-export/run.mjs --check          compose and lint every probe, no host
// Needs Premiere with CRT_pr_test.prproj and the BrandKit Dev panel (CDP 8096), the Task 15 fixture, and
// CR_Templates_test.prproj built by hand and closed (Task 18). ffmpeg/ffprobe check the exports.
import { copyFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { lintOrThrow } from '../../tools/host-run.mjs';
import { composeProbe } from '../../tools/spike/runner.mjs';
import { runStages, runStage, nodeCheck } from '../../tools/spike/multistage.mjs';
import { waitStableFile } from '../../tools/spike/wait-file.mjs';
import { probeMedia } from '../../tools/lib/media-probe.mjs';
import { workPath, ensureDir } from '../../tools/lib/work.mjs';
import { prBaseParams, fixtureMedia, clearFrames } from '../../tools/pr/env.mjs';
import { readPng, waitForPng } from '../../tools/png/read-png.mjs';
import { sourceRoot } from '../../tools/packs/paths.mjs';
import {
  WINDOW, WIDE_WINDOW, CROP_LEFT, EXPORT_RANGE, alphaChecks, parseMeanVolume, exportChecks, baseOfStill, fitChecks, blurChecks,
} from './analyze.mjs';

const ID = 'S7';
const TITLE = 'Медиа, экспорт, вписать в окно, шаблонный .prproj';
const FALLBACK = 'Размытие полей подкаста — .prfpset для ручного применения; стиль субтитров — инструкцией; '
  + 'если Crop через QE не работает — панель просит поставить клип спикера ниже клипа экрана или добавить Crop вручную';
const NOTES = 'Клоны секвенции CRT_Seq_1080p25 в CRT_pr_test.prproj: CRT_S7_media* (медиа и экспорт), CRT_S7_fit* (окно и Crop), '
  + 'CRT_S7_tpl* (корректирующий слой); экспорты и кадры — в папке прогона.';
const HELPERS = 'spikes/lib/pr-helpers.jsx';
// The source package is read-only: Node copies the brand preset out of it. Its path is sourceRoot() of
// plan 2 (tools/packs/paths.mjs), set with BRANDKIT_SOURCE.
const EPR_SRC = sourceRoot() + '/7_Пресеты_Media_Encoder/FullHD.epr';
const EPR = workPath('pr', 'FullHD.epr');
const TEMPLATES = workPath('pr', 'CR_Templates_test.prproj');
const ADJ = 'CRT_Blur_Adjust';
const STYLE = 'CR Субтитры';
const FIT = { stillSec: 40, wideSec: 50, shotSec: 41 };
const TPL = { atSec: 11, shotSec: 12 };

// Each group of stages works in its own clone of the fixture, made by the group's first stage, so a re-run
// of that stage starts again on a clean clone: media (+ export), fit-place (+ fit-apply), template-place.
function cloneOf(ctx, stage) {
  const d = ctx.stages[stage] && ctx.stages[stage].data;
  return { workSeqId: d ? d.workSeqId : null, workSeq: d ? d.workSeq : null };
}

function prParams(ctx, extra = {}, copy = true) {
  return { ...prBaseParams({ copy }), framesDir: path.posix.join(ctx.runDir, 'frames'), ...extra };
}

// Frame keys each stage exports; their files from an earlier attempt are removed first.
const FRAME_KEYS = {
  'stage-media.jsx': ['alphaBefore', 'alphaAfter'],
  'stage-fit-place.jsx': ['fitBase'],
  'stage-fit-apply.jsx': ['fitWindow', 'fitCrop'],
  'stage-template-place.jsx': ['tplBefore', 'tplAfter'],
};

async function prStage(ctx, file, extra, timeoutMs = 300000) {
  clearFrames(ensureDir(path.posix.join(ctx.runDir, 'frames')), FRAME_KEYS[file] || []);
  const r = await runStage({ host: 'pr', files: [HELPERS, 'spikes/s7-media-export/' + file], params: prParams(ctx, extra), timeoutMs });
  return { ...r, evidence: Object.values(r.data.frames || {}) };
}

// Frames of a stage as decoded images; a missing or broken frame is a failed check, not an exception.
async function framesOf(ctx, stage, keys) {
  const fr = (ctx.stages[stage] && ctx.stages[stage].data.frames) || {};
  const img = {};
  const checks = [];
  for (const k of keys) {
    const name = 'frame ' + k + ' is a complete 1920x1080 PNG';
    if (!fr[k]) {
      checks.push(nodeCheck(name, false, 'not exported by stage ' + stage));
      continue;
    }
    try {
      await waitForPng(fr[k], { timeoutMs: 60000 });
      img[k] = readPng(fr[k]);
      checks.push(nodeCheck(name, img[k].width === 1920 && img[k].height === 1080, img[k].width + 'x' + img[k].height));
    } catch (e) {
      checks.push(nodeCheck(name, false, e.message));
    }
  }
  return { img, checks };
}

const MEDIA_PARAMS = {
  alpha: fixtureMedia('alpha_prores4444_1080p25_5s.mov'), wav: fixtureMedia('tone_48k_5s.wav'), clipSec: 5, shotSec: 2,
};

const media = (ctx) => prStage(ctx, 'stage-media.jsx', { ...MEDIA_PARAMS, workBase: 'CRT_S7_media' });

async function mediaCheck(ctx) {
  const f = await framesOf(ctx, 'media', ['alphaBefore', 'alphaAfter']);
  const extra = f.img.alphaBefore && f.img.alphaAfter ? alphaChecks(f.img.alphaBefore, f.img.alphaAfter) : [];
  return { checks: f.checks.concat(extra) };
}

async function exportStage(ctx) {
  if (!existsSync(EPR_SRC)) throw new Error('brand preset not found: ' + EPR_SRC + ' (set BRANDKIT_SOURCE)');
  ensureDir(workPath('pr'));
  copyFileSync(EPR_SRC, EPR);
  const outDir = ensureDir(path.posix.join(ctx.runDir, 'export'));
  for (const f of readdirSync(outDir)) {
    if (/^(direct|ame)_/.test(f)) rmSync(path.posix.join(outDir, f), { force: true });
  }
  const startedAt = Date.now();
  const r = await prStage(ctx, 'stage-export.jsx', {
    ...cloneOf(ctx, 'media'), epr: EPR, outDir, inSec: EXPORT_RANGE.inSec, outSec: EXPORT_RANGE.outSec,
  }, 900000);
  return { ...r, data: { ...r.data, startedAt } };
}

function meanVolumeDb(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-ss', '1', '-t', '3', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'],
    { encoding: 'utf8' });
  return parseMeanVolume(String(r.stderr || ''));
}

// exportAsMediaDirect has finished when it returns; the AME job writes later, after its queue starts.
async function exportCheck(ctx) {
  const st = (ctx.stages.export && ctx.stages.export.data) || {};
  const checks = [];
  const data = {};
  for (const [key, timeoutMs, required] of [['direct', 120000, true], ['ame', 900000, false]]) {
    const file = st[key] && st[key].file;
    if (!file) {
      checks.push(...exportChecks(key, null, null, required));
      continue;
    }
    const w = await waitStableFile(file, { stableMs: 5000, timeoutMs, intervalMs: 1000, sinceMs: (st.startedAt || 0) - 2000 });
    if (!w.ok) {
      checks.push(nodeCheck(key + ': the export file settled', false, w, required));
      continue;
    }
    data[key] = { probe: probeMedia(file), meanVolume: meanVolumeDb(file), bytes: w.size };
    checks.push(...exportChecks(key, data[key].probe, data[key].meanVolume, required));
  }
  return { checks, data, evidence: ['direct', 'ame'].map((k) => st[k] && st[k].file).filter(Boolean) };
}

const fitPlace = (ctx) => prStage(ctx, 'stage-fit-place.jsx', {
  workBase: 'CRT_S7_fit', still: fixtureMedia('slot_b.png'), bars2: fixtureMedia('bars2_1080p25_10s.mp4'), ...FIT,
});

// Scale of the still as it arrived (Motion parameter 1, recorded by fit-place), so baseW is at Scale 100.
async function fitBase(ctx) {
  const f = await framesOf(ctx, 'fit-place', ['fitBase']);
  if (!f.img.fitBase) return { checks: f.checks };
  const motion = ctx.stages['fit-place'].data.motion;
  const scale = motion && motion[1] ? Number(motion[1].value.value) : 100;
  const r = baseOfStill(f.img.fitBase, scale > 0 ? scale : 100);
  return { checks: f.checks.concat([r.check]), data: { baseW: r.baseW, currentScale: scale } };
}

async function fitApply(ctx) {
  const place = ctx.stages['fit-place'] && ctx.stages['fit-place'].data;
  const baseW = ctx.stages['fit-base'] && ctx.stages['fit-base'].data.baseW;
  if (!place || !place.still || !place.wide || !baseW) throw new Error('stages fit-place and fit-base must pass first');
  return prStage(ctx, 'stage-fit-apply.jsx', {
    ...cloneOf(ctx, 'fit-place'), ...FIT, stillTrack: place.still.track, wideTrack: place.wide.track, window: WINDOW, wideWindow: WIDE_WINDOW, baseW,
    frameW: 1920, frameH: 1080, cropNames: ['Crop', 'Обрезка', 'AE.ADBE Crop'], cropHints: ['crop', 'обрез'], cropParam: 0, cropLeft: CROP_LEFT,
  });
}

async function fitCheck(ctx) {
  const f = await framesOf(ctx, 'fit-apply', ['fitWindow', 'fitCrop']);
  return { checks: f.checks.concat(fitChecks(f.img.fitWindow || null, f.img.fitCrop || null)) };
}

async function templateImport(ctx) {
  if (!existsSync(TEMPLATES)) throw new Error('missing ' + TEMPLATES + ': build it by hand first (Task 18, step 13)');
  return prStage(ctx, 'stage-template-import.jsx', { templates: TEMPLATES, adjName: ADJ, styleName: STYLE, waitMs: 30000 }, 180000);
}

function templatePlace(ctx) {
  const imp = ctx.stages['template-import'] && ctx.stages['template-import'].data;
  return prStage(ctx, 'stage-template-place.jsx', {
    workBase: 'CRT_S7_tpl', adjNodeId: imp && imp.adj ? imp.adj.nodeId : null, adjName: ADJ, ...TPL,
  });
}

async function templateCheck(ctx) {
  const f = await framesOf(ctx, 'template-place', ['tplBefore', 'tplAfter']);
  const extra = f.img.tplBefore && f.img.tplAfter ? blurChecks(f.img.tplBefore, f.img.tplAfter) : [];
  return { checks: f.checks.concat(extra) };
}

function checkOnly() {
  const ctx = { runDir: workPath('s7', 'run-check'), stages: { media: { data: { workSeqId: 'x', workSeq: 'CRT_S7_media' } } } };
  const probes = [
    ['stage-media.jsx', { ...MEDIA_PARAMS, workBase: 'CRT_S7_media' }],
    ['stage-export.jsx', { ...cloneOf(ctx, 'media'), epr: EPR, outDir: workPath('s7', 'run-check', 'export'), inSec: 0, outSec: 5 }],
    ['stage-fit-place.jsx', { workBase: 'CRT_S7_fit', still: fixtureMedia('slot_b.png'), bars2: fixtureMedia('bars2_1080p25_10s.mp4'), ...FIT }],
    ['stage-fit-apply.jsx', { workSeqId: 'y', ...FIT, stillTrack: 1, wideTrack: 1, window: WINDOW, wideWindow: WIDE_WINDOW, baseW: 400, frameW: 1920, frameH: 1080,
      cropNames: ['Crop', 'Обрезка', 'AE.ADBE Crop'], cropHints: ['crop', 'обрез'], cropParam: 0, cropLeft: CROP_LEFT }],
    ['stage-template-import.jsx', { templates: TEMPLATES, adjName: ADJ, styleName: STYLE, waitMs: 30000 }],
    ['stage-template-place.jsx', { workBase: 'CRT_S7_tpl', adjNodeId: null, adjName: ADJ, ...TPL }],
  ];
  for (const [file, extra] of probes) {
    lintOrThrow(composeProbe([HELPERS, 'spikes/s7-media-export/' + file], prParams(ctx, extra, false)));
    console.log('OK spikes/s7-media-export/' + file);
  }
}

if (process.argv.includes('--check')) {
  checkOnly();
} else {
  const out = await runStages({
    id: ID,
    title: TITLE,
    host: 'pr',
    fallback: FALLBACK,
    notes: NOTES,
    argv: process.argv.slice(2),
    stages: [
      { name: 'media', host: 'pr', run: media },
      { name: 'media-check', host: 'node', run: mediaCheck },
      { name: 'export', host: 'pr', run: exportStage },
      { name: 'export-check', host: 'node', run: exportCheck },
      { name: 'fit-place', host: 'pr', run: fitPlace },
      { name: 'fit-base', host: 'node', run: fitBase },
      { name: 'fit-apply', host: 'pr', run: fitApply },
      { name: 'fit-check', host: 'node', run: fitCheck },
      { name: 'template-import', host: 'pr', run: templateImport },
      { name: 'template-place', host: 'pr', run: templatePlace },
      { name: 'template-check', host: 'node', run: templateCheck },
    ],
  });
  console.log('run folder: ' + out.runDir);
  process.exitCode = out.failed ? 1 : 0;
}
```

Run: `node --check spikes/s7-media-export/run.mjs && node spikes/s7-media-export/run.mjs --check`
Expected: шесть строк `OK spikes/s7-media-export/stage-…`.

- [ ] **Step 13: Собрать шаблонный проект `CR_Templates_test.prproj` (вручную)**

Это модель `prproj/CR_Templates.prproj` библиотеки (§4.4, D11, D25). Эффект кладётся на сам элемент корректирующего слоя в Project как эффект мастер-клипа: эффект клипа на таймлайне в другой проект скриптом не перенести.

1. Premiere: File → Close Project для открытых проектов. File → New → Project…: Project name `CR_Templates_test`, Project location `C:\CRBK\work\pr`, «Create new sequence» выключен → Create.
2. **Корректирующий слой.** File → New → Adjustment Layer… → Width 1920, Height 1080, Timebase 25.00 fps, Pixel Aspect Ratio Square Pixels (1.0) → OK. В Project появился `Adjustment Layer`: правый щелчок → Rename → `CRT_Blur_Adjust` → Enter.
3. **Размытие на элементе.** Window → Effects, в поиске — `Gaussian Blur` (в русском интерфейсе «Размытие по Гауссу»). Перетащить эффект на элемент `CRT_Blur_Adjust` в панели Project.
4. Перетащить `CRT_Blur_Adjust` из Project в окно Source Monitor (или двойной щелчок по нему). Window → Effect Controls: в заголовке — мастер-клип `CRT_Blur_Adjust` (Master), под ним Gaussian Blur. Задать:
   - Blurriness — `40`;
   - Repeat Edge Pixels — включить;
   - под названием эффекта нажать кнопку прямоугольной маски (Create 4-point polygon mask); появится Mask (1) по центру кадра, её не двигать;
   - Mask (1) → Inverted — включить.
   Если эффект не ложится на элемент или в Effect Controls нет Master — это записывается отметкой в шаге 16, а прогон всё равно делается: размытия не будет, и сработает запасной путь (`.prfpset`).
5. **Стиль субтитров.** File → New → Sequence… → Sequence Presets → HD 1080p → `HD 1080p 25 fps`, Sequence Name `CRT_Captions` → OK.
6. Window → Text → вкладка Captions → Create new caption track → Format: Subtitle → OK. Кнопка «+» (Add new caption segment) → в поле ввести `Тест субтитров`.
7. Выделить субтитр на дорожке C1. Window → Essential Graphics → вкладка Edit (в 26.x — также Window → Properties):
   - шрифт `SB Sans Text`, начертание Regular, размер 48;
   - Fill — белый `FFFFFF`;
   - Background — включить, цвет `222222`, непрозрачность 100 %;
   - Track Style (выпадающий список вверху) → Create Style… → Name `CR Субтитры` → OK. В Project появился элемент `CR Субтитры`.
8. File → Save, затем File → Close Project.
9. Run: `ls -la C:/CRBK/work/pr/CR_Templates_test.prproj`
   Expected: файл есть, больше нуля байт.

- [ ] **Step 14: Подготовить Premiere (вручную)**

1. File → Open Project… → `C:\CRBK\work\pr\CRT_pr_test.prproj` (фикстура задачи 15). Других проектов не открывать; `CR_Templates_test.prproj` должен быть закрыт.
2. Window → Extensions → «BrandKit Dev».
3. Run: `node tools/host-run.mjs --host pr "JSON.stringify({ path: String(app.project.path) })"`
   Expected: `path` оканчивается на `CRT_pr_test.prproj`.
4. Свободно не меньше 1 ГБ на `C:`; AME при прогоне откроется сам.

- [ ] **Step 15: Прогон S7**

Run: `node spikes/s7-media-export/run.mjs`
Expected (3–15 минут; дольше всего — запуск AME и его задание):

```text
S7 media: 10/10 checks passed
S7 media-check: 4/4 checks passed
S7 export: 8/8 checks passed
S7 export-check: 4/4 checks passed
S7 fit-place: 6/6 checks passed
S7 fit-base: 2/2 checks passed
S7 fit-apply: 10/10 checks passed
S7 fit-check: 4/4 checks passed
S7 template-import: 7/7 checks passed
S7 template-place: 6/6 checks passed
S7 template-check: 4/4 checks passed
S7: <итог> (65 checks) -> …\spikes\results\S7.json
run folder: C:/CRBK/work/s7/run-<дата>-<время>
```

Меньше пройденных в `media` — чаще всего информационная проверка сетки кадров у WAV, в `fit-apply` — окно 16:9, в `export` и `export-check` — очередь AME; это замеры, итог тогда `partial`. Какие имена Crop сработали, записано в `stages.fit-apply.data.cropTries`. Экспорты лежат в `run folder`/export.

Если `template-import` упал по `CDP_TIMEOUT`:
1. В Premiere, скорее всего, открыто окно Import Project: выбрать Import Entire Project, включить Create folder for imported items → OK.
2. Проверить хост командой шага 14.
3. Run: `node spikes/s7-media-export/run.mjs --only template-import,template-place,template-check`
   Этап найдёт импортированное и второй раз не импортирует.
4. Записать, что импорт шёл через окно:

Run: `node tools/spike/manual.mjs --id S7 --check "manual: importFiles(.prproj) opened the Import Project dialog" --pass false --detail "<текст окна и выбранные пункты>" --optional`
Expected: `S7: <итог> (<n> checks)`.

Другие упавшие этапы — продолжить с них через `--only`. Группа повторяется целиком, с первого этапа: `--only media,media-check,export,export-check`, `--only fit-place,fit-base,fit-apply,fit-check` или `--only template-place,template-check`; первый этап сделает новый клон.

- [ ] **Step 16: Ручные отметки шаблонного проекта (вручную)**

Если в шаге 13 эффект не лёг на элемент Project или в Effect Controls не было Master:

Run: `node tools/spike/manual.mjs --id S7 --check "manual: master clip effect on the adjustment layer item" --pass false --detail "<что произошло>" --optional`
Expected: `S7: <итог> (<n> checks)`.

Если всё легло — `--pass true` с кратким описанием.

- [ ] **Step 17: Отчёт и выводы**

Run: `npm run spike:report`
Expected: в `spikes/RESULTS.md` строка `| S7 | Медиа, экспорт, вписать в окно, шаблонный .prproj | pr | 26.5.2… | … |`.

Как читать `spikes/results/S7.json` и `S7.data.json`:
- `media: alpha honoured …` — ProRes 4444 с альфой годится для петель T2 в Premiere; `stages.media.data.alphaInterp` — как Premiere прочитал альфу.
- `direct: H.264 1920x1080 …` прошла → адаптер Premiere экспортирует `exportAsMediaDirect` с брендовым `.epr` (§6, `exportWithPreset`). `ame: …` прошли → можно и очередью AME; не прошли → в панели только прямой экспорт.
- `fit: the still lands on the window …` → рецепт «вписать в окно» работает. `stages.fit-apply.data.fitStill.normalized` — нормирована ли Position (1 = ширина кадра). Масштаб = ширина окна / ширина клипа при Scale 100 (`stages.fit-base.data.baseW`).
- `crop: …` прошла → Crop через QE работает; `stages.fit-apply.data.cropBy` — имя, которое сработало (зависит от языка интерфейса). Не прошла → запасной путь S7: панель просит поставить клип спикера ниже клипа экрана или добавить Crop вручную.
- `template: the adjustment layer blurs …` прошла → D11: клип размытия из шаблонного `.prproj`. Не прошла → `.prfpset` для ручного применения. `stages.template-place.data.placed` — компоненты клипа и `isAdjustmentLayer`; `stages.template-import.data.adjComponents` — эффекты мастер-клипа.
- `caption style CR Субтитры arrived` прошла → D25: стиль едет в шаблонном `.prproj`. Не прошла → стиль — инструкцией.
- Отметка про окно Import Project (шаг 15) — панель не сможет импортировать шаблонный проект молча; это ограничение вписать в D11/D25 листа решений.

- [ ] **Step 18: Все тесты**

Run: `npm test`
Expected: все тесты зелёные, среди них `tests/tools/frame-diff.test.mjs` (5) и `tests/spikes/s7-analyze.test.mjs` (6).

- [ ] **Step 19: Commit**

```bash
git add tools/png/frame-diff.mjs spikes/s7-media-export/analyze.mjs spikes/s7-media-export/stage-media.jsx spikes/s7-media-export/stage-export.jsx spikes/s7-media-export/stage-fit-place.jsx spikes/s7-media-export/stage-fit-apply.jsx spikes/s7-media-export/stage-template-import.jsx spikes/s7-media-export/stage-template-place.jsx spikes/s7-media-export/run.mjs tests/tools/frame-diff.test.mjs tests/spikes/s7-analyze.test.mjs spikes/results/S7.json spikes/results/S7.data.json spikes/RESULTS.md
git commit -m "feat(spikes): S7 media, brand export, fit to window and template project" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Часть E. Производительность (S8), бета UXP (S9), кодек петель (S11)

Три пробные сборки этой части меряют и записывают, а не строят шаблоны.
- **S8** — сколько стоят в Premiere существующие тяжёлые композиции, экспортированные в MOGRT как есть.
- **S9** — пишет ли UXP в бете Premiere 27 текст и список MOGRT. Если беты нет, сборка записывается как «не проводилась».
- **S11** — PNG в MOV против ProRes 4444 для петель T2: вес, скорость декодирования и воспроизведение.

**Зависимости.**
- Часть A (задачи 1–6): `run` из `tools/host-run.mjs`, `composeProbe` из `tools/spike/runner.mjs`, `makeResult`/`writeResult`/`appendManualCheck` из `tools/spike/result.mjs` (закреплённые вердикты `measured` и `not-run`), `workPath`/`ensureDir` из `tools/lib/work.mjs`, `tools/spike/manual.mjs`.
- Часть B: задача 7 — `bars_1080p25_30s.mp4` (базовая линия S8); S2 (задача 9) — `waitStableFile` из `tools/spike/wait-file.mjs` (S8 ждёт `.mogrt`) и `C:/CRBK/work/mogrt/CRT_LowerThird_v1.mogrt` с полями из S1 (S9).
- Часть D, задача 15: `spikes/lib/pr-helpers.jsx` — `importMogrt`, вставка MOGRT с ожиданием клипа (S8).
- План 2, задачи 1–3 (идут до задачи 8 этого плана): `tools/packs/paths.mjs` — `packDir()` для перелинкованных копий `C:/CRBK/packs/<slug>/<slug>_relinked.aep` (S8) и `sourceRoot()`, путь к пакету из `BRANDKIT_SOURCE` (S11). Сами копии нужны S8.
- Часть F: инвентаризация называет самую слабую машину для S8; задача 23 (оценка веса) читает `C:/CRBK/work/s11/bitrates.json` из S11.

**Новые общие модули** (создаются в задаче 19, нужны задачам 20–21):
- `tools/spike/stages.mjs` — итог сборки, который пишется в несколько заходов: отдельными командами, на разных хостах и машинах. Каждый заход заменяет только свои проверки; ручные проверки и проверки других заходов остаются. Так S8 пишет AE-часть и Premiere-часть, а повторный запуск не стирает ручные наблюдения. Закреплённый вердикт (`measured` у S8) повторный заход сохраняет.
- `tools/spike/machine.mjs` — сведения о машине (ОС, CPU, RAM, GPU) для замеров.

`runSpike` из задачи 6 здесь не подходит: он делает один вызов хоста и перезаписывает итог целиком. `runStages` из `tools/spike/multistage.mjs` (задача 15) тоже не подходит: он проводит этапы одного запуска по порядку, а здесь заходы идут отдельными командами, в разное время и на разных машинах. Пробы этой части собираются тем же `composeProbe` и запускаются тем же `run`, а итог пишет `writeStageResult` (поверх `makeResult`/`writeResult`).

**Файлы части E:**

```text
tools/spike/stages.mjs, tools/spike/machine.mjs
spikes/s8-perf/       lib.mjs, ae-export.jsx, run-ae.mjs, pr.jsx, run-pr.mjs, playback.mjs
spikes/s9-uxp-beta/   lib.mjs, record-not-run.mjs, record-report.mjs, plugin/{manifest.json,index.html,index.js}
spikes/s11-loop-codec/ lib.mjs, encode.mjs, playback.mjs
spikes/results/       S8.json, S8.data.json, S9.json, S11.json, S11.data.json
tests/tools/          spike-stages.test.mjs, machine.test.mjs
tests/spikes/         s8-perf.test.mjs, s9-uxp.test.mjs, s11-codec.test.mjs
```

### Task 19: S8 — производительность MOGRT (замер фазы 0)

**Files:**
- Create: `tools/spike/stages.mjs`, `tools/spike/machine.mjs`, `spikes/s8-perf/lib.mjs`, `spikes/s8-perf/ae-export.jsx`, `spikes/s8-perf/run-ae.mjs`, `spikes/s8-perf/pr.jsx`, `spikes/s8-perf/run-pr.mjs`, `spikes/s8-perf/playback.mjs`
- Test: `tests/tools/spike-stages.test.mjs`, `tests/tools/machine.test.mjs`, `tests/spikes/s8-perf.test.mjs`
- Create (при живом прогоне): `spikes/results/S8.json`, `spikes/results/S8.data.json`
- Modify: `spikes/RESULTS.md` (пересобирается `npm run spike:report`)

Что меряем (спецификация §3.1, S8):
- три существующие композиции, экспортированные в MOGRT без свойств:
  - подкаст `Подпись_спикера_1` — рамка с Z-пролётом и размытием движения, 3840×2160, 10 с;
  - вебинары `Заставка с вижуалом` — экран вебинара, 1920×1080, 30 с;
  - SMM `BG_pattern_1x1_2` — мерцающая сетка, 1440×1440, 30 с, рендерер Advanced 3D (записываем, не исправляем);
- в Premiere: время первой вставки `importMGT` в секвенции FHD 25p и UHD 25p, воспроизведение на Full и 1/2 с индикатором пропущенных кадров, время экспорта 10 с через `exportAsMediaDirect`;
- базовая линия: экспорт тех же 10 с обычного видео (`bars_1080p25_30s.mp4`) в секвенциях того же размера.

Решения:
- **Вердикта по бюджету нет.** Итог S8 в фазе 0 означает только «замер выполнен». Бюджет производительности фиксируется после повтора на мастерах первого пакета (§3.1 S8), до первой приёмки релиза. Поэтому раннеры S8 пишут вердикт `measured` и закрепляют его (`verdictLocked`). Проверки и ручные наблюдения записываются, но вердикт не меняют.
- **Где запускать Premiere-часть.** По спецификации — на самой слабой машине команды; её называет инвентаризация (часть F). Если инвентаризация ещё не готова или машина недоступна, сначала запустите на этой машине. Числа Premiere хранятся по имени машины, поэтому повтор на слабой машине ложится рядом, а не поверх.
- **Копии проектов.** Проба сохраняет проект перед экспортом MOGRT. Перелинкованные копии плана 2 — эталон «только перелинковка» (§3.2), поэтому AE открывает их копии в `C:/CRBK/work/s8/aep/`.
- **Отдельный проект Premiere.** Время первой вставки честно меряется только там, где этого MOGRT ещё не было.
- **Диапазон экспорта задаём In/Out 0–10 с.** Рабочая область в Premiere по умолчанию выключена (документация `isWorkAreaEnabled`), а In/Out с `exportAsMediaDirect(…, 1)` проверен в premiere-autopilot. Длина результата проверяется по числу кадров.

- [ ] **Step 1: Написать падающий тест заходов `tests/tools/spike-stages.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { upsertStageChecks, mergeHostVersion, writeStageResult, readResult } from '../../tools/spike/stages.mjs';
import { appendManualCheck, makeResult, writeResult } from '../../tools/spike/result.mjs';

const ok = (name) => ({ name, pass: true, required: true, detail: '' });
const bad = (name) => ({ name, pass: false, required: true, detail: 'x' });

describe('spike stages', () => {
  it('replaces only the checks of the same stage and keeps manual ones', () => {
    const prev = [{ ...ok('a'), stage: 'ae' }, { ...ok('m'), manual: true }, { ...bad('b'), stage: 'pr' }];
    const next = upsertStageChecks(prev, 'pr', [ok('b2')]);
    expect(next.map((c) => c.name)).toEqual(['a', 'm', 'b2']);
    expect(next[2].stage).toBe('pr');
  });
  it('requires a stage', () => {
    expect(() => upsertStageChecks([], '', [ok('a')])).toThrow(/stage/);
  });
  it('merges host versions without repeats', () => {
    expect(mergeHostVersion(null, 'AE 26.5')).toBe('AE 26.5');
    expect(mergeHostVersion('AE 26.5', 'AE 26.5')).toBe('AE 26.5');
    expect(mergeHostVersion('AE 26.5', 'Pr 26.5.2')).toBe('AE 26.5; Pr 26.5.2');
    expect(mergeHostVersion('AE 26.5', null)).toBe('AE 26.5');
  });
  it('keeps manual checks and evidence when a stage is re-run', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-'));
    const s8 = { id: 'S8', title: 't', host: 'ae+pr', stage: 'ae', verdict: 'measured', verdictLocked: true, dir };
    writeStageResult({ ...s8, checks: [ok('export')], evidence: ['a.json'] });
    appendManualCheck('S8', { name: 'playback', pass: false, required: false }, dir);
    const r = writeStageResult({ ...s8, checks: [ok('export again')], evidence: ['b.json'] });
    expect(r.checks.map((c) => c.name)).toEqual(['playback', 'export again']);
    expect(r.verdict).toBe('measured');
    expect(readResult('S8', dir).evidence).toEqual(['a.json', 'b.json']);
    expect(readResult('S99', dir)).toBe(null);
  });
  it('keeps a locked verdict of the previous result unless the stage computes its own', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-'));
    writeStageResult({ id: 'S8', title: 't', host: 'ae+pr', stage: 'ae', checks: [bad('export')], verdict: 'measured', verdictLocked: true, dir });
    expect(writeStageResult({ id: 'S8', title: 't', host: 'ae+pr', stage: 'pr', checks: [ok('insert')], dir }))
      .toMatchObject({ verdict: 'measured', verdictLocked: true });
    writeResult(makeResult({ id: 'S9', title: 't', host: 'pr-beta', checks: [], verdict: 'not-run', verdictLocked: true }), dir);
    expect(writeStageResult({ id: 'S9', title: 't', host: 'pr-beta', stage: 'uxp', checks: [ok('setText')], keepLocked: false, dir }))
      .toMatchObject({ verdict: 'yes', verdictLocked: false });
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run tests/tools/spike-stages.test.mjs`
Expected: FAIL — `Cannot find module '../../tools/spike/stages.mjs'`.

- [ ] **Step 3: Создать `tools/spike/stages.mjs`**

```js
// Spike results written in several stages that run as separate commands, on different hosts or machines,
// and add up in one result: AE then Premiere, Windows then Mac, automatic then manual (S8, S9, S11).
// An automatic stage replaces only its own checks; checks of other stages and manual checks
// (tools/spike/manual.mjs) are kept, so a stage can be re-run without losing observations.
// When one invocation runs the stages of a spike in order and --only continues that run (S5-S7),
// use runStages from tools/spike/multistage.mjs (task 15) instead.
// verdict, verdictLocked: as in makeResult; S8 writes 'measured', locked. Without a verdict, a locked
// verdict of the previous result is kept, so a re-run cannot unlock it by accident; keepLocked: false
// computes the verdict from the checks instead (S9: a real run replaces the 'not-run' of branch A).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { RESULTS_DIR, makeResult, writeResult } from './result.mjs';

export function upsertStageChecks(prev, stage, checks) {
  if (!stage) throw new Error('stage is required');
  const kept = (prev || []).filter((c) => c.stage !== stage);
  return kept.concat(checks.map((c) => ({ ...c, stage })));
}

export function mergeHostVersion(prev, next) {
  if (!prev) return next || null;
  if (!next || prev.includes(next)) return prev;
  return prev + '; ' + next;
}

export function readResult(id, dir = RESULTS_DIR) {
  const file = path.join(dir, id + '.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

export function writeStageResult({
  id, title, host, hostVersion = null, stage, checks, verdict, verdictLocked = false, keepLocked = true,
  fallback = '', notes = '', evidence = [], dir = RESULTS_DIR,
}) {
  const prev = readResult(id, dir);
  const keep = Boolean(!verdict && keepLocked && prev && prev.verdictLocked);
  const result = makeResult({
    id, title, host,
    hostVersion: mergeHostVersion(prev ? prev.hostVersion : null, hostVersion),
    checks: upsertStageChecks(prev ? prev.checks : [], stage, checks),
    verdict: keep ? prev.verdict : verdict,
    verdictLocked: keep || verdictLocked,
    fallback, notes,
    evidence: [...new Set([...((prev && prev.evidence) || []), ...evidence])],
  });
  writeResult(result, dir);
  return result;
}
```

Run: `npx vitest run tests/tools/spike-stages.test.mjs`
Expected: `5 passed`.

- [ ] **Step 4: Написать падающий тест `tests/tools/machine.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { machineInfo } from '../../tools/spike/machine.mjs';

describe('machineInfo', () => {
  it('reports platform, CPU and RAM without the GPU query', () => {
    const m = machineInfo({ gpu: false });
    expect(m.platform).toBe(process.platform);
    expect(m.threads).toBeGreaterThan(0);
    expect(m.ramGb).toBeGreaterThan(0);
    expect(m.gpus).toEqual([]);
  });
});
```

Run: `npx vitest run tests/tools/machine.test.mjs`
Expected: FAIL — `Cannot find module '../../tools/spike/machine.mjs'`.

- [ ] **Step 5: Создать `tools/spike/machine.mjs`**

```js
// Facts about this machine for performance spikes (S8, S11): OS, CPU, RAM, GPU.
// GPU names come from CIM on Windows and system_profiler on macOS; a failure is reported, not thrown.
// The team inventory (part F) stays the source of truth for picking the weakest machine.
import os from 'node:os';
import { execFileSync } from 'node:child_process';

export function machineInfo({ gpu = true } = {}) {
  const cpus = os.cpus();
  const info = {
    hostname: os.hostname(),
    platform: process.platform,
    release: os.release(),
    cpu: cpus.length ? cpus[0].model.trim() : 'unknown',
    threads: cpus.length,
    ramGb: Math.round(os.totalmem() / 1e9),
    gpus: [],
  };
  if (!gpu) return info;
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('powershell', ['-NoProfile', '-Command',
        'Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion | ConvertTo-Json -Compress'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const v = JSON.parse(out);
      info.gpus = (Array.isArray(v) ? v : [v]).map((g) => g.Name + ' (driver ' + g.DriverVersion + ')');
    } else if (process.platform === 'darwin') {
      const out = execFileSync('system_profiler', ['SPDisplaysDataType', '-json'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      info.gpus = (JSON.parse(out).SPDisplaysDataType || []).map((g) => g.sppci_model || g._name);
    }
  } catch (e) {
    info.gpus = ['unknown (' + String(e.message).split('\n')[0] + ')'];
  }
  return info;
}
```

Run: `npx vitest run tests/tools/machine.test.mjs`
Expected: `1 passed`.

- [ ] **Step 6: Написать падающий тест помощников S8 `tests/spikes/s8-perf.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  S8_PACKS, relinkedAep, prPaths, nameVariants, sequencePlan, realtimeFactor,
  mergeMeasurements, summaryLines, waitValidFile, playbackCheck,
} from '../../spikes/s8-perf/lib.mjs';

describe('S8 helpers', () => {
  it('finds the relinked copies of plan 2 next to the work folder', () => {
    expect(relinkedAep('podcast', {}, 'win32')).toBe('C:/CRBK/packs/podcast/podcast_relinked.aep');
    expect(relinkedAep('smm', { BRANDKIT_WORK: 'D:\\bk\\work' }, 'win32')).toBe('D:/bk/packs/smm/smm_relinked.aep');
    expect(relinkedAep('podcast', {}, 'darwin')).toBe('/Users/Shared/CRBK/packs/podcast/podcast_relinked.aep');
  });
  it('builds Premiere preset paths per platform', () => {
    const w = prPaths({}, 'win32');
    expect(w.presets.FHD).toBe('C:/Program Files/Adobe/Adobe Premiere Pro 2026/Settings/SequencePresets/HD 1080p/HD 1080p 25 fps.sqpreset');
    expect(w.exportPreset).toMatch(/3F3F3F3F_4D6F6F56\/Apple ProRes 422 LT\.epr$/);
    expect(prPaths({ BRANDKIT_PR_ROOT: 'E:\\Pr' }, 'win32').presets.UHD).toBe('E:/Pr/Settings/SequencePresets/UHD (4K)/UHD (4K) 2160p 25 fps.sqpreset');
  });
  it('gives NFC and NFD forms of a name only when they differ', () => {
    expect(nameVariants('Оверлей')).toHaveLength(2);
    expect(nameVariants('BG_pattern_1x1_2')).toEqual(['BG_pattern_1x1_2']);
    expect(S8_PACKS.map((p) => p.slug)).toEqual(['podcast', 'webinars', 'smm']);
  });
  it('plans one sequence per element and size plus two baselines', () => {
    expect(sequencePlan().map((s) => s.name)).toEqual([
      'S8_podcast_FHD', 'S8_podcast_UHD', 'S8_webinars_FHD', 'S8_webinars_UHD',
      'S8_smm_FHD', 'S8_smm_UHD', 'S8_base_FHD', 'S8_base_UHD',
    ]);
  });
  it('computes the real-time factor', () => {
    expect(realtimeFactor(10, 40000)).toBe(0.25);
    expect(realtimeFactor(10, 0)).toBe(null);
  });
  it('merges measurements deeply and replaces arrays', () => {
    expect(mergeMeasurements({ a: { b: 1, c: 2 }, l: [1] }, { a: { c: 3, d: 4 }, l: [2], e: 5 }))
      .toEqual({ a: { b: 1, c: 3, d: 4 }, l: [2], e: 5 });
  });
  it('prints one summary line per sequence', () => {
    const lines = summaryLines({ pr: { inserts: { S8_podcast_FHD: { wallMs: 8200, order: 1 } }, exports: { S8_podcast_FHD: { wallMs: 40000, realtime: 0.25 } } } });
    expect(lines).toHaveLength(8);
    expect(lines[0]).toContain('insert 8.2 s (first MOGRT in project)');
    expect(lines[0]).toContain('0.25x real time');
    expect(lines[7]).toContain('insert -');
  });
  it('turns a playback observation into an optional check', () => {
    expect(playbackCheck({ host: 'PC1', seq: 'S8_smm_UHD', res: '1/2', dropped: '0' }))
      .toEqual({ name: 'pr@PC1: playback S8_smm_UHD 1/2 without dropped frames', pass: true, required: false, detail: 'dropped 0 of 250 frames' });
    expect(playbackCheck({ host: 'PC1', seq: 'S8_podcast_FHD', res: 'Full', dropped: '17' }).pass).toBe(false);
    expect(() => playbackCheck({ host: 'PC1', seq: 'S8_x_FHD', res: 'Full', dropped: '0' })).toThrow(/unknown sequence/);
    expect(() => playbackCheck({ host: 'PC1', seq: 'S8_smm_FHD', res: '1/4', dropped: '0' })).toThrow(/Full or 1\/2/);
    expect(() => playbackCheck({ host: 'PC1', seq: 'S8_smm_FHD', res: 'Full', dropped: 'many' })).toThrow(/whole number/);
  });
  it('waits for a stable file that validates, also after an invalid version', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-'));
    const f = path.join(dir, 'a.mogrt');
    writeFileSync(f, 'part');
    const past = new Date(Date.now() - 60000);
    utimesSync(f, past, past);
    const validate = (p) => (readFileSync(p, 'utf8') === 'done' ? { ok: true, detail: 'zip ok' } : { ok: false, detail: 'no definition.json' });
    setTimeout(() => writeFileSync(f, 'done'), 100);
    const r = await waitValidFile(f, { validate, stableMs: 20, intervalMs: 5, timeoutMs: 3000 });
    expect(r).toMatchObject({ ok: true, bytes: 4, detail: 'zip ok' });
    expect(r.ms).toBeGreaterThan(0);
    const stuck = await waitValidFile(f, { validate: () => ({ ok: false, detail: 'no definition.json' }), stableMs: 20, intervalMs: 5, timeoutMs: 200 });
    expect(stuck).toMatchObject({ ok: false, ms: null });
    expect(stuck.detail).toContain('stable but invalid: no definition.json');
    const miss = await waitValidFile(path.join(dir, 'none.mogrt'), { stableMs: 20, intervalMs: 5, timeoutMs: 50 });
    expect(miss).toMatchObject({ ok: false, detail: 'timeout: missing' });
  });
});
```

Run: `npx vitest run tests/spikes/s8-perf.test.mjs`
Expected: FAIL — `Cannot find module '../../spikes/s8-perf/lib.mjs'`.

- [ ] **Step 7: Создать `spikes/s8-perf/lib.mjs`**

```js
// Helpers for spike S8 (MOGRT performance in Premiere). Everything except waitValidFile and the
// measurement file IO is pure; tests/spikes/s8-perf.test.mjs covers it and waitValidFile.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { workPath } from '../../tools/lib/work.mjs';
import { packDir } from '../../tools/packs/paths.mjs';
import { RESULTS_DIR } from '../../tools/spike/result.mjs';
import { waitStableFile } from '../../tools/spike/wait-file.mjs';

export const S8_ID = 'S8';
export const S8_TITLE = 'Производительность MOGRT';
export const S8_FALLBACK = 'Элементы без полей сверх бюджета уходят в T2-предрендеры. Элементы с полями вставляются MOGRT, '
  + 'и панель подсказывает «Клип → Render and Replace» (ProRes 4444 с альфой); автоматического рендера заполненного '
  + 'экземпляра в v1 нет';
export const S8_NOTES = 'Фаза 0: замер без вердикта по бюджету. Существующие композиции экспортированы в MOGRT как есть; '
  + 'числа Premiere хранятся по машинам (имя машины в названиях проверок). Бюджет производительности фиксируется только '
  + 'после повтора на мастерах первого пакета (§3.1 S8) на самой слабой машине команды по инвентаризации (часть F). '
  + 'Цифры: spikes/results/S8.data.json.';
export const S8_MEASUREMENTS = path.join(RESULTS_DIR, 'S8.data.json');
export const RANGE_SEC = 10;

// Comps from spec §3.1 S8: podcast frame with Z fly-in and motion blur, webinar screen, twinkling grid.
export const S8_PACKS = [
  { slug: 'podcast', comp: 'Подпись_спикера_1', folder: 'RENDER' },
  { slug: 'webinars', comp: 'Заставка с вижуалом', folder: 'Оформление' },
  { slug: 'smm', comp: 'BG_pattern_1x1_2', folder: 'BG_pattern' },
];

export const S8_SIZES = [
  { key: 'FHD', w: 1920, h: 1080 },
  { key: 'UHD', w: 3840, h: 2160 },
];

// Relinked working copies of plan 2 (tasks 1-3): packDir from tools/packs/paths.mjs, C:/CRBK/packs/<slug>
// next to the work folder (BRANDKIT_WORK moves both).
export function relinkedAep(slug, env = process.env, platform = process.platform) {
  return path.posix.join(packDir(slug, env, platform), slug + '_relinked.aep');
}

export function mogrtPath(slug) {
  return workPath('s8', 'mogrt', 'perf_' + slug + '.mogrt');
}

// Premiere install paths (sequence presets and the export preset). BRANDKIT_PR_ROOT overrides.
export function prPaths(env = process.env, platform = process.platform) {
  const root = String(env.BRANDKIT_PR_ROOT || (platform === 'darwin'
    ? '/Applications/Adobe Premiere Pro 2026/Adobe Premiere Pro 2026.app/Contents'
    : 'C:/Program Files/Adobe/Adobe Premiere Pro 2026')).replace(/\\/g, '/');
  return {
    presets: {
      FHD: root + '/Settings/SequencePresets/HD 1080p/HD 1080p 25 fps.sqpreset',
      UHD: root + '/Settings/SequencePresets/UHD (4K)/UHD (4K) 2160p 25 fps.sqpreset',
    },
    exportPreset: root + '/MediaIO/systempresets/3F3F3F3F_4D6F6F56/Apple ProRes 422 LT.epr',
  };
}

// Comp names may be stored NFC or NFD (Mac); the probe accepts either form.
export function nameVariants(name) {
  const out = [];
  for (const v of [name.normalize('NFC'), name.normalize('NFD')]) if (!out.includes(v)) out.push(v);
  return out;
}

// One sequence per element and size, plus two baseline sequences with plain video.
export function sequencePlan(packs = S8_PACKS, sizes = S8_SIZES) {
  const out = [];
  for (const p of packs) {
    for (const s of sizes) out.push({ name: `S8_${p.slug}_${s.key}`, slug: p.slug, size: s.key, w: s.w, h: s.h });
  }
  for (const s of sizes) out.push({ name: `S8_base_${s.key}`, slug: 'base', size: s.key, w: s.w, h: s.h });
  return out;
}

export function realtimeFactor(mediaSec, wallMs) {
  if (!(wallMs > 0)) return null;
  return Math.round((mediaSec * 1000 / wallMs) * 100) / 100;
}

export function mergeMeasurements(prev, patch) {
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const out = { ...(prev || {}) };
  for (const [k, v] of Object.entries(patch || {})) {
    out[k] = isObj(v) && isObj(out[k]) ? mergeMeasurements(out[k], v) : v;
  }
  return out;
}

export function readMeasurements(file = S8_MEASUREMENTS) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
}

export function updateMeasurements(patch, file = S8_MEASUREMENTS) {
  const next = mergeMeasurements(readMeasurements(file), patch);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(next, null, 2) + '\n', 'utf8');
  return next;
}

// Premiere numbers are kept per machine (spec §3.1: S8 belongs on the weakest machine of the inventory),
// so a later run on another machine adds to the file instead of replacing this one.
export function machineKey() {
  return os.hostname();
}

// perMachine: one entry of measurements.machines, i.e. { machine, pr: { inserts, exports } }.
export function summaryLines(perMachine, plan = sequencePlan()) {
  const pr = (perMachine && perMachine.pr) || {};
  const ins = pr.inserts || {};
  const exp = pr.exports || {};
  return plan.map((s) => {
    const i = ins[s.name];
    const e = exp[s.name];
    return [
      s.name.padEnd(16),
      i ? `insert ${(i.wallMs / 1000).toFixed(1)} s${i.order === 1 ? ' (first MOGRT in project)' : ''}` : 'insert -',
      e ? `export ${RANGE_SEC} s: ${(e.wallMs / 1000).toFixed(1)} s = ${e.realtime}x real time` : 'export -',
    ].join(' | ');
  });
}

// One manual observation: Program Monitor at Full or 1/2, dropped frame indicator after 10 s of playback.
// Optional check: in phase 0 S8 measures, the budget verdict comes after the repeat (spec §3.1 S8).
export function playbackCheck({ host, seq, res, dropped }) {
  if (!sequencePlan().some((s) => s.name === seq)) throw new Error('unknown sequence: ' + seq);
  if (res !== 'Full' && res !== '1/2') throw new Error('resolution must be Full or 1/2: ' + res);
  const n = Number(dropped);
  if (!Number.isInteger(n) || n < 0) throw new Error('dropped frames must be a whole number: ' + dropped);
  return {
    name: `pr@${host}: playback ${seq} ${res} without dropped frames`,
    pass: n === 0, required: false, detail: `dropped ${n} of ${RANGE_SEC * 25} frames`,
  };
}

// AE may write the .mogrt after exportAsMotionGraphicsTemplate returns (spec §1.1 item 3). The wait is the
// shared waitStableFile (tools/spike/wait-file.mjs: size and mtime unchanged for stableMs), then `validate`
// must accept the file. A stable file that does not validate may be a pause inside AE's write, so the wait
// goes on for a newer write until timeoutMs. ms = time from the start of the wait to the last write of the
// file (0 when it was complete before the wait began), null on failure.
export async function waitValidFile(file, { validate = null, stableMs = 4000, intervalMs = 500, timeoutMs = 900000 } = {}) {
  const t0 = Date.now();
  let sinceMs = 0;
  let last = '';
  for (;;) {
    const left = Math.max(0, timeoutMs - (Date.now() - t0));
    const w = await waitStableFile(file, { stableMs, intervalMs, timeoutMs: left, sinceMs });
    if (!w.ok) return { ok: false, bytes: w.size, ms: null, detail: 'timeout: ' + w.reason + (last ? '; ' + last : '') };
    const v = validate ? validate(file) : { ok: true, detail: '' };
    if (v.ok) return { ok: true, bytes: w.size, ms: Math.max(0, Math.round(w.mtimeMs - t0)), detail: v.detail };
    last = 'stable but invalid: ' + v.detail;
    sinceMs = w.mtimeMs;
  }
}
```

Run: `npx vitest run tests/spikes/s8-perf.test.mjs`
Expected: `9 passed`.

- [ ] **Step 8: Создать AE-пробу `spikes/s8-perf/ae-export.jsx`**

Проба открывает копию проекта, находит композицию строго по имени (NFC или NFD) и экспортирует её как MOGRT без свойств. Чужой несохранённый проект не трогает: сборка останавливается. Свою копию от прошлого пакета закрывает без сохранения. Возвращаемое значение экспорта только записывается: готовность файла решает Node.

```js
// S8, AE stage: open one copy of a relinked pack, find one existing comp by its exact name and export it
// as a MOGRT with no Essential Graphics properties ("as is"), to measure its cost in Premiere.
// PARAMS: { slug, aepPath, copyDir, compNames: [NFC, NFD], folderName, templateName, mogrtDir }
// Node polls the .mogrt file afterwards: since 24.x the export may return before the file is written.
// Docs: https://ae-scripting.docsforadobe.dev/general/application/ (app.open, beginSuppressDialogs)
//       https://ae-scripting.docsforadobe.dev/general/project/ (Project.dirty since 17.5, save(file))
//       https://ae-scripting.docsforadobe.dev/item/compitem/ (openInEssentialGraphics,
//       motionGraphicsTemplateName, exportAsMotionGraphicsTemplate(overwrite, folderPath): 15.0+)

var S8 = { comp: null, facts: null, timings: {}, exportCalled: false, exportReturned: null, opened: null };
var S8_TAG = 'ae ' + PARAMS.slug + ': ';

function s8Now() {
  return new Date().getTime();
}

function s8NameMatches(name) {
  var i;
  for (i = 0; i < PARAMS.compNames.length; i++) {
    if (name === PARAMS.compNames[i]) { return true; }
  }
  return false;
}

function s8FindComps() {
  var hits = [], i, it;
  for (i = 1; i <= app.project.numItems; i++) {
    it = app.project.item(i);
    if (it instanceof CompItem && s8NameMatches(it.name)) { hits.push(it); }
  }
  return hits;
}

function s8MissingFootage() {
  var out = { count: 0, names: [] }, i, it;
  for (i = 1; i <= app.project.numItems; i++) {
    it = app.project.item(i);
    if (it instanceof FootageItem && it.footageMissing) {
      out.count += 1;
      if (out.names.length < 10) { out.names.push(it.name); }
    }
  }
  return out;
}

// Top-level layers only: enough to explain the cost (motion blur, 3D, adjustment, precomps, effects).
function s8Facts(comp) {
  var f = {
    name: comp.name, width: comp.width, height: comp.height, fps: comp.frameRate,
    duration: comp.duration, renderer: String(comp.renderer), compMotionBlur: comp.motionBlur,
    layers: comp.numLayers, motionBlurLayers: 0, threeDLayers: 0, adjustmentLayers: 0,
    precompLayers: 0, effects: []
  };
  var seen = {}, i, j, L, fx, mn;
  for (i = 1; i <= comp.numLayers; i++) {
    L = comp.layer(i);
    try {
      if (L.motionBlur === true) { f.motionBlurLayers += 1; }
      if (L.threeDLayer === true) { f.threeDLayers += 1; }
      if (L.adjustmentLayer === true) { f.adjustmentLayers += 1; }
      if (L.source && (L.source instanceof CompItem)) { f.precompLayers += 1; }
      fx = L.property('ADBE Effect Parade');
      if (fx) {
        for (j = 1; j <= fx.numProperties; j++) {
          mn = fx.property(j).matchName;
          if (!seen[mn]) {
            seen[mn] = true;
            f.effects.push(mn);
          }
        }
      }
    } catch (e) {
      f.effects.push('ERR layer ' + i + ': ' + String(e));
    }
  }
  return f;
}

// Never discard the user's work: a changed project blocks the run, unless it is one of our own copies
// in PARAMS.copyDir (left changed by a previous pack), which is closed without saving.
var s8Ok = check(S8_TAG + 'open project is saved or is an S8 copy', function () {
  var f = app.project.file;
  var p = f ? String(f.fsName).replace(/\\/g, '/').toLowerCase() : '';
  var dir = String(PARAMS.copyDir).toLowerCase();
  var own = p !== '' && p.substr(0, dir.length) === dir;
  if (app.project.dirty === true && own) {
    app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
    return { pass: true, detail: 'closed the previous S8 copy without saving: ' + p };
  }
  return { pass: app.project.dirty !== true, detail: 'dirty=' + app.project.dirty + ' file=' + (p || 'untitled') };
});

if (s8Ok) {
  s8Ok = check(S8_TAG + 'pack copy opened', function () {
    var f = new File(PARAMS.aepPath), p = null, t = s8Now();
    if (!f.exists) { return { pass: false, detail: 'missing ' + PARAMS.aepPath }; }
    app.beginSuppressDialogs();
    try {
      p = app.open(f);
    } finally {
      app.endSuppressDialogs(false);
    }
    S8.timings.openMs = s8Now() - t;
    S8.opened = (p && p.file) ? p.file.fsName : null;
    return { pass: p !== null, detail: 'file=' + S8.opened + ' engine=' + (p ? p.expressionEngine : '') + ' in ' + S8.timings.openMs + ' ms' };
  });
}

if (s8Ok) {
  s8Ok = check(S8_TAG + 'no missing footage', function () {
    var m = s8MissingFootage();
    return { pass: m.count === 0, detail: m.count + ' missing' + (m.count ? ': ' + m.names.join(', ') : '') };
  });
}

if (s8Ok) {
  s8Ok = check(S8_TAG + 'exactly one comp with the given name', function () {
    var hits = s8FindComps(), inFolder = [], i;
    if (hits.length === 1) {
      S8.comp = hits[0];
    } else {
      for (i = 0; i < hits.length; i++) {
        if (hits[i].parentFolder && hits[i].parentFolder.name === PARAMS.folderName) { inFolder.push(hits[i]); }
      }
      if (inFolder.length === 1) { S8.comp = inFolder[0]; }
    }
    return { pass: S8.comp !== null, detail: hits.length + ' by name, picked ' + (S8.comp ? 'item id ' + S8.comp.id : 'none') };
  });
}

if (s8Ok) {
  check(S8_TAG + 'comp facts recorded', function () {
    S8.facts = s8Facts(S8.comp);
    return { pass: true, detail: S8.facts.width + 'x' + S8.facts.height + ' ' + S8.facts.fps + ' fps ' + S8.facts.duration + ' s' };
  }, false);
  // Contract 4.2 wants Classic 3D; Advanced 3D (ADBE Calder) is recorded, not fixed: S8 exports comps as they are.
  check(S8_TAG + 'renderer is not Advanced 3D (ADBE Calder)', function () {
    return { pass: String(S8.comp.renderer) !== 'ADBE Calder', detail: 'renderer=' + S8.comp.renderer };
  }, false);
}

if (s8Ok) {
  s8Ok = check(S8_TAG + 'template name set in Essential Graphics', function () {
    var count = -1;
    app.beginUndoGroup('BK S8 template name');
    try {
      try { S8.comp.openInViewer(); } catch (e0) { /* the viewer is optional for the export */ }
      S8.comp.openInEssentialGraphics();
      S8.comp.motionGraphicsTemplateName = PARAMS.templateName;
      // AE 26.5 does not export a template without Essential Graphics properties: the call returns
      // false at once and writes nothing (seen live 2026-10-02). The comps are measured as they are,
      // so one neutral property is exposed: the opacity of the first layer that has one (cameras and
      // lights do not). Exposing a property changes no pixel.
      for (var li = 1; S8.comp.motionGraphicsTemplateControllerCount === 0 && li <= S8.comp.numLayers; li++) {
        var tg = S8.comp.layer(li).property('ADBE Transform Group');
        var op = tg ? tg.property('ADBE Opacity') : null;
        if (op && op.canAddToMotionGraphicsTemplate(S8.comp) &&
            op.addToMotionGraphicsTemplateAs(S8.comp, 'Opacity (S8 export)')) {
          S8.addedForExport = S8.comp.layer(li).name;
        }
      }
    } finally {
      app.endUndoGroup();
    }
    try { count = S8.comp.motionGraphicsTemplateControllerCount; } catch (e1) { count = -1; }
    return { pass: S8.comp.motionGraphicsTemplateName === PARAMS.templateName && count > 0,
      detail: 'name=' + S8.comp.motionGraphicsTemplateName + ' properties=' + count +
        (S8.addedForExport ? ' (added for export: opacity of ' + S8.addedForExport + ')' : '') };
  });
}

if (s8Ok) {
  // The export prompts to save a changed project; save the copy first (same path).
  s8Ok = check(S8_TAG + 'project copy saved before export', function () {
    var t = s8Now();
    app.beginSuppressDialogs();
    try {
      app.project.save(new File(PARAMS.aepPath));
    } finally {
      app.endSuppressDialogs(false);
    }
    S8.timings.saveMs = s8Now() - t;
    return { pass: app.project.dirty !== true, detail: 'dirty=' + app.project.dirty + ' in ' + S8.timings.saveMs + ' ms' };
  });
}

if (s8Ok) {
  check(S8_TAG + 'exportAsMotionGraphicsTemplate called', function () {
    var t = s8Now(), rv = null;
    app.beginSuppressDialogs();
    try {
      rv = S8.comp.exportAsMotionGraphicsTemplate(true, new Folder(PARAMS.mogrtDir).fsName);
    } finally {
      app.endSuppressDialogs(false);
    }
    S8.timings.exportCallMs = s8Now() - t;
    S8.exportCalled = true;
    S8.exportReturned = rv;
    // The return value is recorded, not trusted: Node decides by the file.
    return { pass: true, detail: 'returned ' + String(rv) + ' after ' + S8.timings.exportCallMs + ' ms' };
  });
}

finish({
  slug: PARAMS.slug, facts: S8.facts, timings: S8.timings, opened: S8.opened,
  exportCalled: S8.exportCalled, exportReturned: S8.exportReturned
});
```

Run: `node tools/jsx/lint-jsx.cjs spikes/s8-perf/ae-export.jsx`
Expected: `OK    spikes/s8-perf/ae-export.jsx (1 warning(s))`; единственное предупреждение — `last statement does not call JSON.stringify` (последняя строка — `finish(...)`).

- [ ] **Step 9: Создать AE-раннер `spikes/s8-perf/run-ae.mjs`**

Пакеты идут строго по одному. Следующий открывается только после того, как размер и время записи `.mogrt` предыдущего 4 с не меняются (`waitStableFile` из `tools/spike/wait-file.mjs`, задача 9) и файл читается как zip с `definition.json`. Если устойчивый файл не читается, ожидание продолжается до следующей записи.

```js
#!/usr/bin/env node
// S8, AE stage: export three existing comps as MOGRT without properties, strictly one at a time.
//   node spikes/s8-perf/run-ae.mjs [--only podcast,smm]
// Works on copies of the plan 2 relinked projects (C:/CRBK/packs/<slug>/<slug>_relinked.aep) in
// <work>/s8/aep; the relinked copies themselves are never opened or saved.
import { copyFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import AdmZip from 'adm-zip';
import { run } from '../../tools/host-run.mjs';
import { composeProbe } from '../../tools/spike/runner.mjs';
import { writeStageResult } from '../../tools/spike/stages.mjs';
import { machineInfo } from '../../tools/spike/machine.mjs';
import { workPath, ensureDir } from '../../tools/lib/work.mjs';
import {
  S8_ID, S8_TITLE, S8_FALLBACK, S8_NOTES, S8_PACKS, relinkedAep, mogrtPath, nameVariants,
  waitValidFile, updateMeasurements,
} from './lib.mjs';

const argv = process.argv.slice(2);
const onlyArg = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
const packs = onlyArg ? S8_PACKS.filter((p) => onlyArg.split(',').includes(p.slug)) : S8_PACKS;

function validMogrt(file) {
  try {
    const names = new AdmZip(file).getEntries().map((e) => e.entryName);
    const ok = names.some((n) => /(^|\/)definition\.json$/i.test(n));
    return { ok, detail: names.length + ' zip entries' + (ok ? '' : ', no definition.json') };
  } catch (e) {
    return { ok: false, detail: 'not a readable zip: ' + e.message };
  }
}

// Spec §3.1 S8: a measurement without a verdict in phase 0, so the verdict is 'measured' and locked.
function record(slug, checks, hostVersion) {
  return writeStageResult({
    id: S8_ID, title: S8_TITLE, host: 'ae+pr', hostVersion, stage: 'ae:' + slug, checks,
    verdict: 'measured', verdictLocked: true,
    fallback: S8_FALLBACK, notes: S8_NOTES, evidence: ['spikes/results/S8.data.json'],
  });
}

updateMeasurements({ ae: { machine: machineInfo() } });
const mogrtDir = ensureDir(workPath('s8', 'mogrt'));
ensureDir(workPath('s8', 'aep'));

for (const p of packs) {
  const src = relinkedAep(p.slug);
  if (!existsSync(src)) {
    record(p.slug, [{ name: `ae ${p.slug}: relinked copy exists`, pass: false, required: true, detail: 'missing ' + src + ' (plan 2, tasks 1-3)' }], null);
    console.log(`${p.slug}: SKIP, no ${src}`);
    continue;
  }
  const copy = workPath('s8', 'aep', p.slug + '_s8.aep');
  copyFileSync(src, copy);
  const target = mogrtPath(p.slug);
  rmSync(target, { force: true });
  const params = {
    slug: p.slug, aepPath: copy, copyDir: workPath('s8', 'aep'), compNames: nameVariants(p.comp),
    folderName: p.folder, templateName: 'perf_' + p.slug, mogrtDir,
  };
  const t0 = performance.now();
  let r;
  try {
    r = await run('ae', composeProbe(['spikes/s8-perf/ae-export.jsx'], params), { timeoutMs: 600000 });
  } catch (e) {
    record(p.slug, [{ name: `ae ${p.slug}: probe answered`, pass: false, required: true, detail: e.message }], null);
    console.error(`${p.slug}: ${e.message}`);
    console.error('STOP: check AE for a dialog, then run: node tools/host-run.mjs --host ae "JSON.stringify({ v: app.version })"');
    process.exit(1);
  }
  const probeMs = Math.round(performance.now() - t0);
  const checks = r.checks.slice();
  const d = r.data || {};
  const entry = { comp: p.comp, copy, probeMs, timings: d.timings, facts: d.facts, exportReturned: d.exportReturned };
  if (d.exportCalled) {
    const w = await waitValidFile(target, { validate: validMogrt, stableMs: 4000, intervalMs: 500, timeoutMs: 600000 });
    if (!w.ok) w.detail += '; .mogrt files in the folder: ' + (readdirSync(mogrtDir).join(', ') || 'none');
    checks.push({ name: `ae ${p.slug}: ${path.posix.basename(target)} written and readable`, pass: w.ok, required: true, detail: w.detail });
    Object.assign(entry, { mogrt: target, mogrtBytes: w.bytes, readyAfterReturnMs: w.ms });
    console.log(`${p.slug}: ${w.ok ? 'OK' : 'FAIL'} ${target} ${(w.bytes / 1e6).toFixed(1)} MB, `
      + `export call ${d.timings && d.timings.exportCallMs} ms + ${w.ms} ms until the last write; renderer ${d.facts && d.facts.renderer}`);
  } else {
    console.log(`${p.slug}: FAIL before export, see spikes/results/S8.json`);
  }
  updateMeasurements({ ae: { version: d.hostVersion, packs: { [p.slug]: entry } } });
  const res = record(p.slug, checks, 'AE ' + d.hostVersion);
  console.log(`  ${checks.filter((c) => c.pass).length}/${checks.length} checks, S8 now: ${res.verdict}`);
}
```

Run: `node --check spikes/s8-perf/run-ae.mjs`
Expected: без вывода, код выхода 0.

- [ ] **Step 10: Создать Premiere-пробу `spikes/s8-perf/pr.jsx`**

Одно действие на вызов, чтобы Node мерил каждый вызов отдельно. Секвенции создаются из `.sqpreset` (`app.project.newSequence`, запасной путь — QE). MOGRT ставится на пустую V1 в момент 0. Проба собирается после `spikes/lib/pr-helpers.jsx` (часть D, задача 15) и вставляет через его `importMogrt`: один вызов `importMGT`, затем до 2 с ожидания клипа на V1. Только если клипа так и нет, допускается ровно одна повторная вставка (§6.1: изменения не было). Поздно появившийся клип так не вставляется дважды. Была ли повторная вставка, пишется в данные (`retried`).

```js
// S8, Premiere stage. One action per call so that Node can time each call:
//   state  - open project file name and the S8_ sequences (read only); optional expectations
//   setup  - create the S8_ sequences from .sqpreset files and import the baseline clip
//   base   - put the baseline clip on V1 of the S8_base_ sequences
//   insert - importMGT of one MOGRT at 0 on V1 of one sequence (V1 must be empty)
//   export - In/Out 0..rangeSec, then exportAsMediaDirect with an .epr (1 = in/out range)
// Composed after spikes/lib/pr-helpers.jsx (part D, task 15): insert goes through its importMogrt.
// Docs: https://ppro-scripting.docsforadobe.dev/general/project/ (newSequence, openSequence, importFiles)
//       https://ppro-scripting.docsforadobe.dev/sequence/sequence/ (importMGT: time in ticks as a string;
//       exportAsMediaDirect workAreaType 0 entire, 1 in/out, 2 work area; setInPoint in seconds)
//       https://ppro-scripting.docsforadobe.dev/sequence/track/ (overwriteClip)
// $.hiresTimer: microseconds since the previous read (ExtendScript), used to time the export call.
// The insert time is importMogrt's ms: from the importMGT call until the clip is on V1.

var S8P = { data: {} };
var S8P_REQUIRED = PARAMS.required !== false;   // baseline sequences are informative only

function s8pIsS8(name) {
  return /^S8_/.test(String(name));
}

function s8pByName(name) {
  var hits = [], seqs = app.project.sequences, i;
  for (i = 0; i < seqs.numSequences; i++) {
    if (String(seqs[i].name) === name) { hits.push(seqs[i]); }
  }
  return hits;
}

function s8pFps(seq) {
  var tb = Number(seq.timebase);
  return tb > 0 ? Math.round((254016000000 / tb) * 1000) / 1000 : 0;
}

function s8pDescribe(seq) {
  var v1 = seq.videoTracks.numTracks > 0 ? seq.videoTracks[0].clips.numItems : -1;
  return {
    name: String(seq.name), id: String(seq.sequenceID), w: seq.frameSizeHorizontal,
    h: seq.frameSizeVertical, fps: s8pFps(seq), v1Clips: v1
  };
}

function s8pProjectFile() {
  var m = /([^\/\\]+)$/.exec(String(app.project.path));
  return m ? m[1] : String(app.project.path);
}

function s8pTimerReset() {
  try { return $.hiresTimer; } catch (e) { return -1; }
}

function s8pTimerMs() {
  var us = -1;
  try { us = $.hiresTimer; } catch (e) { us = -1; }
  return us > 0 ? Math.round(us / 1000) : null;
}

function s8pState() {
  var list = [], seqs = app.project.sequences, i;
  for (i = 0; i < seqs.numSequences; i++) {
    if (s8pIsS8(seqs[i].name)) { list.push(s8pDescribe(seqs[i])); }
  }
  S8P.data.project = s8pProjectFile();
  S8P.data.sequences = list;
  if (PARAMS.expectFresh) {
    check('pr: project ' + PARAMS.projectFile + ' is open and has no S8_ sequences', function () {
      var same = S8P.data.project.toLowerCase() === String(PARAMS.projectFile).toLowerCase();
      return { pass: same && list.length === 0, detail: 'open=' + S8P.data.project + ', S8_ sequences=' + list.length };
    });
  }
  if (PARAMS.expectSequences) {
    for (i = 0; i < PARAMS.expectSequences.length; i++) {
      check('pr: sequence ' + PARAMS.expectSequences[i].name + ' exists once with the planned size and 25 fps', (function (e) {
        return function () {
          var hits = s8pByName(e.name), d;
          if (hits.length !== 1) { return { pass: false, detail: hits.length + ' found' }; }
          d = s8pDescribe(hits[0]);
          return { pass: d.w === e.w && d.h === e.h && Math.abs(d.fps - 25) < 0.01, detail: d.w + 'x' + d.h + ' ' + d.fps + ' fps' };
        };
      })(PARAMS.expectSequences[i]));
    }
  }
}

function s8pCreate(name, preset) {
  var how = [], seq = null, presetFs = new File(preset).fsName;  // not "native": an ES3 reserved word, ExtendScript refuses it
  try {
    seq = app.project.newSequence(name, presetFs);
    how.push(seq ? 'newSequence ok' : 'newSequence returned ' + String(seq));
  } catch (e) {
    how.push('newSequence threw ' + String(e));
  }
  if (!seq) {
    try {
      app.enableQE();
      qe.project.newSequence(name, presetFs);
      how.push('qe.project.newSequence called');
    } catch (e2) {
      how.push('qe threw ' + String(e2));
      return { ok: false, how: how.join('; ') };
    }
  }
  return { ok: true, how: how.join('; ') };
}

function s8pSetup() {
  var i;
  for (i = 0; i < PARAMS.create.length; i++) {
    check('pr: create sequence ' + PARAMS.create[i].name, (function (s) {
      return function () {
        var r = s8pCreate(s.name, s.preset);
        return { pass: r.ok, detail: r.how };
      };
    })(PARAMS.create[i]));
  }
  check('pr: import the baseline clip', function () {
    var ok = app.project.importFiles([new File(PARAMS.baseClip).fsName], true, app.project.rootItem, false);
    return { pass: ok !== false, detail: 'importFiles returned ' + String(ok) };
  }, false);
}

function s8pFindItems(name) {
  var root = app.project.rootItem, hits = [], i;
  for (i = 0; i < root.children.numItems; i++) {
    if (String(root.children[i].name) === name) { hits.push(root.children[i]); }
  }
  return hits;
}

function s8pBase() {
  var items = s8pFindItems(PARAMS.baseItemName), i;
  var ok = check('pr: baseline clip is in the project once', function () {
    return { pass: items.length === 1, detail: items.length + ' items named ' + PARAMS.baseItemName };
  }, false);
  if (!ok) { return; }
  for (i = 0; i < PARAMS.targets.length; i++) {
    check('pr: baseline clip on V1 of ' + PARAMS.targets[i], (function (name) {
      return function () {
        var hits = s8pByName(name), seq;
        if (hits.length !== 1) { return { pass: false, detail: hits.length + ' sequences' }; }
        seq = hits[0];
        app.project.openSequence(seq.sequenceID);
        seq.videoTracks[0].overwriteClip(items[0], 0);
        return { pass: seq.videoTracks[0].clips.numItems === 1, detail: 'V1 clips=' + seq.videoTracks[0].clips.numItems };
      };
    })(PARAMS.targets[i]), false);
  }
}

// importMogrt (pr-helpers.jsx) calls importMGT once, then polls V1 for the clip at frame 0 for up to 2 s.
// Spec 6.1: a call that left nothing on V1 changed nothing, so exactly one more insert is allowed, and only
// after that wait: a clip that lands late is never inserted twice.
function s8pInsert() {
  var hits = s8pByName(PARAMS.seqName), seq = null;
  var ok = check('pr: ' + PARAMS.seqName + ' exists once and V1 is empty', function () {
    if (hits.length !== 1) { return { pass: false, detail: hits.length + ' found' }; }
    seq = hits[0];
    app.project.openSequence(seq.sequenceID);
    return { pass: seq.videoTracks[0].clips.numItems === 0, detail: 'V1 clips=' + seq.videoTracks[0].clips.numItems };
  });
  if (!ok) { return; }
  check('pr: importMGT ' + PARAMS.label + ' into ' + PARAMS.seqName, function () {
    var r, clips, c, mgt = null;
    r = importMogrt(seq, PARAMS.mogrtPath, 0, 0, 0, 2000);
    S8P.data.hostMs = r.ms;
    S8P.data.retried = false;
    if (!r.clip) {
      S8P.data.firstAttempt = { returned: r.returned, error: r.error, ms: r.ms };
      S8P.data.retried = true;
      r = importMogrt(seq, PARAMS.mogrtPath, 0, 0, 0, 2000);
      S8P.data.retryMs = r.ms;
    }
    clips = seq.videoTracks[0].clips;
    if (!r.clip || clips.numItems !== 1) {
      return {
        pass: false,
        detail: 'V1 clips=' + clips.numItems + ', returned ' + (r.returned ? 'a track item' : 'nothing')
          + (r.error ? ', error ' + r.error : '') + (S8P.data.retried ? ', after the second attempt' : '')
      };
    }
    c = r.clip;
    try { mgt = c.getMGTComponent(); } catch (e) { mgt = null; }
    S8P.data.clip = { name: String(c.name), start: c.start.seconds, end: c.end.seconds, mgt: mgt ? true : false };
    return {
      pass: Math.abs(c.start.seconds) < 0.001,
      detail: S8P.data.clip.name + ' ' + c.start.seconds + '..' + c.end.seconds + ' s, MGT component=' + S8P.data.clip.mgt
        + (S8P.data.retried ? ', inserted on the second attempt' : '')
    };
  });
}

function s8pExport() {
  var hits = s8pByName(PARAMS.seqName), seq = null;
  var ok = check('pr: ' + PARAMS.seqName + ' is the active sequence', function () {
    if (hits.length !== 1) { return { pass: false, detail: hits.length + ' found' }; }
    seq = hits[0];
    app.project.openSequence(seq.sequenceID);
    return { pass: String(app.project.activeSequence.sequenceID) === String(seq.sequenceID), detail: 'active=' + app.project.activeSequence.name };
  }, S8P_REQUIRED);
  if (!ok) { return; }
  ok = check('pr: In/Out of ' + PARAMS.seqName + ' set to 0..' + PARAMS.rangeSec + ' s', function () {
    var a, b;
    seq.setInPoint(0);
    seq.setOutPoint(PARAMS.rangeSec);
    a = seq.getInPointAsTime().seconds;
    b = seq.getOutPointAsTime().seconds;
    return { pass: Math.abs(a) < 0.001 && Math.abs(b - PARAMS.rangeSec) < 0.05, detail: a + '..' + b + ' s' };
  }, S8P_REQUIRED);
  if (!ok) { return; }
  check('pr: exportAsMediaDirect ' + PARAMS.seqName, function () {
    var rv, f;
    s8pTimerReset();
    rv = seq.exportAsMediaDirect(new File(PARAMS.outPath).fsName, new File(PARAMS.presetPath).fsName, 1);
    S8P.data.hostMs = s8pTimerMs();
    S8P.data.returned = String(rv);
    f = new File(PARAMS.outPath);
    return { pass: f.exists && f.length > 0, detail: 'returned ' + String(rv) + ', bytes=' + (f.exists ? f.length : 0) };
  }, S8P_REQUIRED);
}

if (PARAMS.action === 'state') {
  s8pState();
} else if (PARAMS.action === 'setup') {
  s8pSetup();
} else if (PARAMS.action === 'base') {
  s8pBase();
} else if (PARAMS.action === 'insert') {
  s8pInsert();
} else if (PARAMS.action === 'export') {
  s8pExport();
} else {
  check('pr: known action ' + PARAMS.action, function () { return false; });
}
S8P.data.action = PARAMS.action;
finish(S8P.data);
```

Run: `node tools/jsx/lint-jsx.cjs spikes/s8-perf/pr.jsx`
Expected: `OK    spikes/s8-perf/pr.jsx (1 warning(s))` — то же предупреждение о `finish(...)`.

- [ ] **Step 11: Создать Premiere-раннер `spikes/s8-perf/run-pr.mjs` и запись наблюдений `spikes/s8-perf/playback.mjs`**

`spikes/s8-perf/run-pr.mjs`:

```js
#!/usr/bin/env node
// S8, Premiere stage. Run after spikes/s8-perf/run-ae.mjs, with an EMPTY saved project open in Premiere.
//   node spikes/s8-perf/run-pr.mjs --stage insert [--project CRT_s8_perf.prproj]
//     8 sequences (3 elements x FHD/UHD + 2 baselines), baseline clip, 6 timed importMGT calls
//   node spikes/s8-perf/run-pr.mjs --stage export
//     8 timed exportAsMediaDirect calls, 10 s each (In/Out 0..10 s, Apple ProRes 422 LT)
// Every host call is timed here (wall clock, including the bridge) and in the host (importMogrt's ms for
// an insert, $.hiresTimer for an export).
// Checks, stages and numbers carry the machine name, so runs on several machines are kept side by side.
import { existsSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { run } from '../../tools/host-run.mjs';
import { composeProbe } from '../../tools/spike/runner.mjs';
import { writeStageResult } from '../../tools/spike/stages.mjs';
import { machineInfo } from '../../tools/spike/machine.mjs';
import { workPath, ensureDir } from '../../tools/lib/work.mjs';
import {
  S8_ID, S8_TITLE, S8_FALLBACK, S8_NOTES, S8_PACKS, RANGE_SEC, mogrtPath, prPaths, sequencePlan,
  realtimeFactor, readMeasurements, updateMeasurements, summaryLines, machineKey,
} from './lib.mjs';

// pr.jsx runs after the shared Premiere helpers: its insert uses importMogrt (part D, task 15).
const FILES = ['spikes/lib/pr-helpers.jsx', 'spikes/s8-perf/pr.jsx'];
const BASE_ITEM = 'bars_1080p25_30s.mp4';
const HOST = machineKey();
const argv = process.argv.slice(2);
const val = (f, d) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : d);
const stage = val('--stage', null);
const projectFile = val('--project', 'CRT_s8_perf.prproj');
if (stage !== 'insert' && stage !== 'export') {
  console.error('usage: node spikes/s8-perf/run-pr.mjs --stage insert|export [--project CRT_s8_perf.prproj]');
  process.exit(2);
}

const plan = sequencePlan();
const pr = prPaths();
const checks = [];
let prVersion = null;
const tagged = (name) => name.replace(/^pr: /, `pr@${HOST}: `);
console.log(`machine key: ${HOST}`);

// Spec §3.1 S8: a measurement without a verdict in phase 0, so the verdict is 'measured' and locked.
function save() {
  return writeStageResult({
    id: S8_ID, title: S8_TITLE, host: 'ae+pr', hostVersion: prVersion ? 'Pr ' + prVersion : null,
    stage: `pr:${stage}@${HOST}`, checks, verdict: 'measured', verdictLocked: true,
    fallback: S8_FALLBACK, notes: S8_NOTES, evidence: ['spikes/results/S8.data.json'],
  });
}

function stop(message) {
  save();
  console.error('STOP: ' + message);
  process.exit(1);
}

function nodeCheck(name, pass, detail, required = true) {
  checks.push({ name: tagged(name), pass, required, detail });
  return pass;
}

// One host call; a failed or timed-out call is recorded and stops the run. Node never repeats a host call
// (plan conventions); the single importMGT retry of spec 6.1 happens inside pr.jsx.
async function call(params, timeoutMs) {
  const what = params.seqName ? params.action + ' ' + params.seqName : params.action;
  const t0 = performance.now();
  let r;
  try {
    r = await run('pr', composeProbe(FILES, params), { timeoutMs });
  } catch (e) {
    nodeCheck('pr: ' + what + ' answered', false, e.message);
    stop(e.message + '\nCheck Premiere for a dialog, then: node tools/host-run.mjs --host pr "JSON.stringify({ v: app.version })"');
  }
  checks.push(...r.checks.map((c) => ({ ...c, name: tagged(c.name) })));
  prVersion = (r.data && r.data.hostVersion) || prVersion;
  return {
    data: r.data || {},
    wallMs: Math.round(performance.now() - t0),
    ok: r.checks.every((c) => c.pass || c.required === false),
  };
}

function probeVideo(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,nb_frames', '-of', 'json', file], { encoding: 'utf8' });
  const s = (JSON.parse(out).streams || [])[0] || {};
  return { w: Number(s.width), h: Number(s.height), frames: Number(s.nb_frames) };
}

if (stage === 'insert') {
  const presetsOk = [pr.presets.FHD, pr.presets.UHD]
    .map((f) => nodeCheck('pr: sequence preset exists', existsSync(f), f)).every(Boolean);
  if (!presetsOk) stop('sequence presets not found; set BRANDKIT_PR_ROOT to the Premiere install folder');
  const baseClip = workPath('fixtures', 'media', BASE_ITEM);
  nodeCheck('pr: baseline clip exists (task 7)', existsSync(baseClip), baseClip, false);
  const ready = S8_PACKS.filter((p) => nodeCheck(`pr: ${p.slug} MOGRT from the AE stage exists`, existsSync(mogrtPath(p.slug)), mogrtPath(p.slug)));
  if (!ready.length) stop('no MOGRT from the AE stage in ' + workPath('s8', 'mogrt'));

  const st = await call({ action: 'state', expectFresh: true, projectFile }, 60000);
  if (!st.ok) stop(`open an empty saved project ${projectFile} in Premiere (task 19, manual step)`);
  await call({
    action: 'setup',
    create: plan.map((s) => ({ name: s.name, preset: pr.presets[s.size] })),
    baseClip,
  }, 300000);
  await call({ action: 'state', expectSequences: plan.map((s) => ({ name: s.name, w: s.w, h: s.h })) }, 60000);
  await call({ action: 'base', baseItemName: BASE_ITEM, targets: plan.filter((s) => s.slug === 'base').map((s) => s.name) }, 120000);

  const inserts = {};
  let order = 0;
  for (const s of plan.filter((x) => ready.some((p) => p.slug === x.slug))) {
    order += 1;
    const res = await call({ action: 'insert', seqName: s.name, mogrtPath: mogrtPath(s.slug), label: 'perf_' + s.slug }, 600000);
    inserts[s.name] = {
      order, wallMs: res.wallMs, hostMs: res.data.hostMs, retried: res.data.retried === true,
      retryMs: res.data.retryMs || null, firstAttempt: res.data.firstAttempt || null, clip: res.data.clip || null,
    };
    console.log(`${s.name}: insert ${(res.wallMs / 1000).toFixed(1)} s (in host ${res.data.hostMs} ms)`
      + `${order === 1 ? ', first MOGRT in this project' : ''}${res.data.retried ? ', second attempt' : ''}`);
  }
  updateMeasurements({
    machines: { [HOST]: { machine: machineInfo(), pr: { version: prVersion, project: projectFile, presets: pr.presets, inserts } } },
  });
  const result = save();
  console.log(`S8 now: ${result.verdict}. Next: manual playback check (task 19), then --stage export`);
}

if (stage === 'export') {
  if (!nodeCheck('pr: export preset exists', existsSync(pr.exportPreset), pr.exportPreset)) {
    stop('export preset not found; set BRANDKIT_PR_ROOT to the Premiere install folder');
  }
  const mine = (readMeasurements().machines || {})[HOST] || {};
  const inserted = (mine.pr && mine.pr.inserts) || {};
  const outDir = ensureDir(workPath('s8', 'export'));
  const exportsM = {};
  for (const s of plan) {
    if (s.slug !== 'base' && !inserted[s.name]) {
      console.log(`${s.name}: skipped, no insert recorded on ${HOST}`);
      continue;
    }
    const outPath = `${outDir}/${s.name}.mov`;
    rmSync(outPath, { force: true });
    const required = s.slug !== 'base';
    const res = await call({
      action: 'export', seqName: s.name, outPath, presetPath: pr.exportPreset, rangeSec: RANGE_SEC, required,
    }, 1800000);
    const e = { wallMs: res.wallMs, hostMs: res.data.hostMs, returned: res.data.returned, realtime: realtimeFactor(RANGE_SEC, res.wallMs) };
    if (existsSync(outPath)) {
      const v = probeVideo(outPath);
      Object.assign(e, v, { bytes: statSync(outPath).size });
      nodeCheck(`pr: ${s.name} export is ${s.w}x${s.h} with ${RANGE_SEC * 25} frames (+-1)`,
        v.w === s.w && v.h === s.h && Math.abs(v.frames - RANGE_SEC * 25) <= 1, `${v.w}x${v.h}, ${v.frames} frames`, required);
    }
    exportsM[s.name] = e;
    console.log(`${s.name}: export of ${RANGE_SEC} s took ${(res.wallMs / 1000).toFixed(1)} s (${e.realtime}x real time)`);
  }
  const m = updateMeasurements({ machines: { [HOST]: { pr: { exports: exportsM } } } });
  const result = save();
  console.log('\n' + summaryLines(m.machines[HOST]).join('\n'));
  console.log(`\nS8: ${result.verdict} (${result.checks.length} checks) -> spikes/results/S8.json`);
}
```

`spikes/s8-perf/playback.mjs`:

```js
#!/usr/bin/env node
// Record one manual playback observation for S8 (Program Monitor, dropped frame indicator, 10 s from 00:00).
//   node spikes/s8-perf/playback.mjs S8_podcast_FHD Full 0 ["note"]
import { appendManualCheck } from '../../tools/spike/result.mjs';
import { S8_ID, machineKey, playbackCheck } from './lib.mjs';

const [seq, res, dropped, note] = process.argv.slice(2);
let check;
try {
  check = playbackCheck({ host: machineKey(), seq, res, dropped });
} catch (e) {
  console.error(e.message + '\nusage: node spikes/s8-perf/playback.mjs <S8_sequence> Full|1/2 <dropped frames> ["note"]');
  process.exit(2);
}
if (note) check.detail += '; ' + note;
const r = appendManualCheck(S8_ID, check);
console.log(`${check.name}: ${check.pass ? 'PASS' : 'FAIL'} (${check.detail}); S8 now: ${r.verdict}`);
```

Run: `node spikes/s8-perf/run-pr.mjs; node --check spikes/s8-perf/playback.mjs`
Expected: `usage: node spikes/s8-perf/run-pr.mjs --stage insert|export [--project CRT_s8_perf.prproj]`, код выхода 2; `--check` без вывода.

- [ ] **Step 12: Подготовить AE (вручную)**

1. Проверить копии плана 2:

   Run: `ls C:/CRBK/packs/podcast/podcast_relinked.aep C:/CRBK/packs/webinars/webinars_relinked.aep C:/CRBK/packs/smm/smm_relinked.aep`
   Expected: три пути без ошибок. Если файла нет — сначала план 2, задачи 1–3.
2. After Effects 2026 открыт, панель Window → Extensions → «BrandKit Dev» открыта (задача 4).
3. Текущий проект сохранён (File → Save) или пустой (File → New → New Project). Иначе проба остановится на первой проверке и ничего не откроет.
4. Свободно не меньше 2 ГБ на диске `C:` (копии трёх проектов и три MOGRT).

- [ ] **Step 13: Экспортировать три MOGRT**

Run: `node spikes/s8-perf/run-ae.mjs`
Expected (2–10 мин):
- по строке на пакет: `<slug>: OK C:/CRBK/work/s8/mogrt/perf_<slug>.mogrt <N> MB, export call <N> ms + <N> ms until the last write; renderer <id>`;
- под ней `<N>/<M> checks, S8 now: measured`;
- у `smm` — `renderer ADBE Calder`: необязательная проверка рендерера не проходит. Это записывается, но итог остаётся `measured`.

Если строка начинается с `FAIL` или раннер остановился:
1. Прочитать проверки в `spikes/results/S8.json`.
2. При `STOP` посмотреть, нет ли в AE диалога, и закрыть его.
3. Проверить хост одним чтением: `node tools/host-run.mjs --host ae "JSON.stringify({ v: app.version })"`.
4. Повторить только упавший пакет: `node spikes/s8-perf/run-ae.mjs --only smm`. Повтор безопасен: проба работает с копией, а прежние проверки этого пакета заменяются.

- [ ] **Step 14: Подготовить Premiere (вручную)**

Где: на самой слабой машине по инвентаризации (часть F) или, пока её нет, на этой. Для другой машины:
- нужны репозиторий, Node 22+, ffprobe и панель BrandKit Dev (задача 4, на Mac — `tools/dev/link-harness.sh`);
- скопировать туда `C:/CRBK/work/s8/mogrt/*.mogrt` → `<work>/s8/mogrt/` и `C:/CRBK/work/fixtures/media/bars_1080p25_30s.mp4` → `<work>/fixtures/media/`;
- `<work>` — `C:/CRBK/work` на Windows, `/Users/Shared/CRBK/work` на Mac.

Шаги:
1. Premiere Pro 2026: закрыть другие проекты (File → Close Project), чтобы `app.project` был нужным проектом.
2. File → New → Project…: Project name `CRT_s8_perf`, Project location `C:\CRBK\work\pr` (на Mac — `/Users/Shared/CRBK/work/pr`) → Create. Затем File → Save.
3. Window → Extensions → «BrandKit Dev»: панель показывает `evalScript OK`.
4. Свободно не меньше 4 ГБ: восемь экспортов ProRes 422 LT по 10 с.

- [ ] **Step 15: Создать секвенции и вставить MOGRT**

Run: `node spikes/s8-perf/run-pr.mjs --stage insert`
Expected (1–5 мин):

```text
machine key: <имя машины>
S8_podcast_FHD: insert <N> s (in host <N> ms), first MOGRT in this project
S8_podcast_UHD: insert <N> s (in host <N> ms)
S8_webinars_FHD: insert <N> s (in host <N> ms)
S8_webinars_UHD: insert <N> s (in host <N> ms)
S8_smm_FHD: insert <N> s (in host <N> ms)
S8_smm_UHD: insert <N> s (in host <N> ms)
S8 now: measured. Next: manual playback check (task 19), then --stage export
```

Строка может кончаться на `, second attempt`: за 2 с клип на V1 не появился, и вставка прошла со второй попытки. В проекте 8 секвенций `S8_*`; у `S8_base_FHD` и `S8_base_UHD` на V1 лежит `bars_1080p25_30s.mp4`.

Если вставку нужно повторить, проект уже не «свежий». Создайте новый пустой проект (`CRT_s8_perf_2`) и запустите `node spikes/s8-perf/run-pr.mjs --stage insert --project CRT_s8_perf_2.prproj`.

- [ ] **Step 16: Проверить воспроизведение (вручную)**

Делать до экспорта: экспорт прогревает кэши. Превью не рендерить (Sequence → Render In to Out не нажимать): полоса над таймлайном должна остаться красной или жёлтой.

1. Program Monitor → значок гаечного ключа (Settings) в панели кнопок под монитором → включить «Show Dropped Frame Indicator». Слева от кнопок воспроизведения появится индикатор-«светофор»: зелёный — пропусков нет, жёлтый — есть. Он сбрасывается при каждом запуске воспроизведения.
2. Для каждой секвенции `S8_podcast_FHD`, `S8_podcast_UHD`, `S8_webinars_FHD`, `S8_webinars_UHD`, `S8_smm_FHD`, `S8_smm_UHD`:
   1. Двойной щелчок по секвенции в панели Project — она откроется в Timeline.
   2. Program Monitor → «Select Playback Resolution» (выпадающий список справа внизу монитора) → Full.
   3. Щёлкнуть по Timeline, нажать Home, затем Space. Остановить (Space), когда таймкод в мониторе пройдёт `00:00:10:00`.
   4. Навести курсор на индикатор: подсказка «Dropped Frames: N». У зелёного индикатора N = 0.
   5. Записать: `node spikes/s8-perf/playback.mjs <секвенция> Full <N>`.
   6. Переключить «Select Playback Resolution» на 1/2 и повторить пункты 3–5 с `1/2`.

Двенадцать команд (подставить N; по желанию — заметку в кавычках последним аргументом):

```bash
node spikes/s8-perf/playback.mjs S8_podcast_FHD Full 0
node spikes/s8-perf/playback.mjs S8_podcast_FHD 1/2 0
node spikes/s8-perf/playback.mjs S8_podcast_UHD Full 0
node spikes/s8-perf/playback.mjs S8_podcast_UHD 1/2 0
node spikes/s8-perf/playback.mjs S8_webinars_FHD Full 0
node spikes/s8-perf/playback.mjs S8_webinars_FHD 1/2 0
node spikes/s8-perf/playback.mjs S8_webinars_UHD Full 0
node spikes/s8-perf/playback.mjs S8_webinars_UHD 1/2 0
node spikes/s8-perf/playback.mjs S8_smm_FHD Full 0
node spikes/s8-perf/playback.mjs S8_smm_FHD 1/2 0
node spikes/s8-perf/playback.mjs S8_smm_UHD Full 0
node spikes/s8-perf/playback.mjs S8_smm_UHD 1/2 0
```

Expected на каждую: `pr@<имя машины>: playback <секвенция> <Full|1/2> without dropped frames: PASS|FAIL (dropped N of 250 frames); S8 now: measured`. Это необязательные проверки. Пропуски записываются как FAIL, но вердикт не меняют: `measured` закреплён.

- [ ] **Step 17: Экспортировать по 10 с из каждой секвенции**

Run: `node spikes/s8-perf/run-pr.mjs --stage export`
Expected (5–30 мин, Premiere на время экспорта не отвечает — это нормально):

```text
machine key: <имя машины>
S8_podcast_FHD: export of 10 s took <N> s (<k>x real time)
… по строке на каждую из 8 секвенций …

S8_podcast_FHD   | insert <N> s (first MOGRT in project) | export 10 s: <N> s = <k>x real time
… 8 строк сводки …

S8: measured (<N> checks) -> spikes/results/S8.json
```

Файлы — в `C:/CRBK/work/s8/export/`. Проверка «export is WxH with 250 frames (+-1)» подтверждает, что экспортирован именно диапазон 0–10 с.

- [ ] **Step 18: Тесты и отчёт**

Run: `npm test && npm run spike:report`
Expected: все тесты зелёные; в `spikes/RESULTS.md` строка `| S8 | Производительность MOGRT | ae+pr | AE …; Pr … | measured | …`.

Числа для решений — в `spikes/results/S8.data.json`:
- `ae.packs.<slug>.facts` — что внутри композиции: размер, рендерер, слои с motion blur и 3D, эффекты;
- `machines.<имя>.pr.inserts` и `.exports` — время вставки и экспорта;
- `machines.<имя>.machine` — сведения о машине.

Сравнивать экспорт MOGRT с базовой линией `S8_base_*` на той же машине.

- [ ] **Step 19: Commit**

```bash
git add tools/spike/stages.mjs tools/spike/machine.mjs spikes/s8-perf/lib.mjs spikes/s8-perf/ae-export.jsx spikes/s8-perf/run-ae.mjs spikes/s8-perf/pr.jsx spikes/s8-perf/run-pr.mjs spikes/s8-perf/playback.mjs tests/tools/spike-stages.test.mjs tests/tools/machine.test.mjs tests/spikes/s8-perf.test.mjs spikes/results/S8.json spikes/results/S8.data.json spikes/RESULTS.md
git commit -m "feat(spikes): S8 MOGRT performance probes and phase-0 measurements" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 20: S9 — UXP в бете Premiere 27: MogrtText и список

**Files:**
- Create: `spikes/s9-uxp-beta/lib.mjs`, `spikes/s9-uxp-beta/record-not-run.mjs`, `spikes/s9-uxp-beta/record-report.mjs`, `spikes/s9-uxp-beta/plugin/manifest.json`, `spikes/s9-uxp-beta/plugin/index.html`, `spikes/s9-uxp-beta/plugin/index.js`
- Test: `tests/spikes/s9-uxp.test.mjs`
- Create (при прогоне): `spikes/results/S9.json`; в ветке B ещё `spikes/s9-uxp-beta/report.json`
- Modify: `spikes/RESULTS.md` (пересобирается `npm run spike:report`)

Что проверяем (§3.1 S9):
- `insertMogrtFromPath` → компонент `AE.ADBE Capsule` → `getStartValue()` → `MogrtText.setText()` (кириллица) → `createKeyframe` + `createSetValueAction` внутри `project.lockedAccess` / `executeTransaction`;
- то же для выпадающего списка «Стиль»;
- число шагов отмены: `insertMogrtFromPath` — немедленный вызов, а не Action.

Если беты нет, итог S9 — `not-run`, запасной путь — «переезд Premiere на UXP откладывается, CEP остаётся» (§6.2). Вердикт `not-run` закрепляется (`verdictLocked`): заметки через `tools/spike/manual.mjs` его не меняют. Настоящий прогон (`record-report.mjs`) считает вердикт по проверкам заново. Плагин всё равно кладётся в репозиторий: после Adobe MAX (10–12 ноября 2026) S9 запускается без доработок.

Источники API:
- типы `@adobe/premierepro` 27.0.0-beta (`MogrtText` с beta.22, <https://github.com/adobe/premierepro-types/pull/90>);
- справочник <https://developer.adobe.com/premiere-pro/uxp/ppro_reference/classes/sequenceeditor/> (`insertMogrtFromPath(path, TickTime, vIdx, aIdx)`, с 25.6);
- манифест и точки входа: <https://developer.adobe.com/premiere-pro/uxp/plugins/concepts/manifest/>, <https://developer.adobe.com/premiere-pro/uxp/plugins/concepts/entrypoints/> — команды видны в Window → UXP Plugins → <плагин> → <команда>;
- образцы Adobe `sequenceEditor.ts` и `keyframe.ts`: <https://github.com/AdobeDocs/uxp-premiere-pro-samples/tree/main/sample-panels/premiere-api/src>.

- [ ] **Step 1: Проверить, есть ли бета и UDT**

Run (PowerShell): `Get-ChildItem "C:/Program Files/Adobe" -Directory | Where-Object { $_.Name -match 'Premiere|UXP' } | Select-Object -ExpandProperty Name`
Expected на 2026-10-02 на этой машине: `Adobe Premiere Pro 2026` — беты и UDT нет, значит ветка A (шаг 7). Если в списке есть `Adobe Premiere Pro (Beta)` — ветка B (шаги 8–11). На Mac то же смотрится в `/Applications`.

- [ ] **Step 2: Написать падающий тест `tests/spikes/s9-uxp.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { detectBeta, checksFromReport } from '../../spikes/s9-uxp-beta/lib.mjs';
import { decideVerdict } from '../../tools/spike/result.mjs';

const good = {
  host: { name: 'premierepro', version: '27.0.0' },
  steps: [
    { name: 'insertMogrtFromPath', ok: true, ms: 900, detail: '2 items returned' },
    { name: 'find AE.ADBE Capsule', ok: true, ms: 0, detail: 'attempt 1, component 2' },
  ],
  params: [{ index: 0, displayName: 'Имя', kind: 'MogrtText' }, { index: 5, displayName: 'Стиль', kind: 'Keyframe' }],
  text: { index: 0, by: 'displayName', kind: 'MogrtText', before: 'Имя Фамилия', written: 'Проверка ЁЙ ёй S9', readback: 'Проверка ЁЙ ёй S9', transaction: true, ok: true },
  dropdown: { index: 5, by: 'displayName', before: 1, written: 2, readback: 2, transaction: true, ok: true },
  error: null,
};

describe('S9 helpers', () => {
  it('finds Premiere (Beta) and UDT among installed folders', () => {
    expect(detectBeta(['Adobe Premiere Pro 2026', 'Adobe Premiere Pro (Beta)', 'Adobe UXP Developer Tools']))
      .toEqual({ premiereBeta: 'Adobe Premiere Pro (Beta)', udt: 'Adobe UXP Developer Tools' });
    expect(detectBeta(['Adobe Premiere Pro 2026', 'Adobe Media Encoder 2026'])).toEqual({ premiereBeta: null, udt: null });
  });
  it('passes a complete report', () => {
    expect(decideVerdict(checksFromReport(good))).toBe('yes');
  });
  it('fails when the text does not read back', () => {
    const bad = { ...good, text: { ...good.text, readback: 'Имя Фамилия', ok: false } };
    expect(decideVerdict(checksFromReport(bad))).toBe('no');
  });
  it('fails when the dropdown does not read back', () => {
    const bad = { ...good, dropdown: { ...good.dropdown, readback: 1, ok: false } };
    expect(decideVerdict(checksFromReport(bad))).toBe('no');
  });
  it('fails the dropdown and lists the names seen when there is no «Стиль»', () => {
    const noStyle = { ...good, dropdown: { ok: false, by: 'displayName', missing: 'Стиль', seen: ['Имя', null, 'Цвет'] } };
    const checks = checksFromReport(noStyle);
    expect(decideVerdict(checks)).toBe('no');
    expect(checks.find((c) => /dropdown/.test(c.name)).detail).toBe('no parameter named "Стиль"; seen: Имя, ?, Цвет');
  });
  it('fails an aborted run', () => {
    expect(decideVerdict(checksFromReport({ error: 'no active sequence', steps: [] }))).toBe('no');
  });
  it('is partial when only the optional checks fail', () => {
    const noNames = { ...good, params: good.params.map((p) => ({ ...p, displayName: '' })) };
    expect(decideVerdict(checksFromReport(noNames))).toBe('partial');
  });
});
```

Run: `npx vitest run tests/spikes/s9-uxp.test.mjs`
Expected: FAIL — `Cannot find module '../../spikes/s9-uxp-beta/lib.mjs'`.

- [ ] **Step 3: Создать `spikes/s9-uxp-beta/lib.mjs`**

```js
// Pure helpers for spike S9 (Premiere 27 beta, UXP): detect the beta and turn the plugin report into checks.
export const S9_ID = 'S9';
export const S9_TITLE = 'UXP: MogrtText в бете 27';
export const S9_FALLBACK = 'Переезд Premiere на UXP откладывается, CEP остаётся (§6.2)';
export const S9_REVISIT = 'Повторить после Adobe MAX (10–12 ноября 2026) или когда бета 27 станет доступна команде (D20, §6.2).';

// entries: folder names in C:/Program Files/Adobe (Windows) or /Applications (macOS).
export function detectBeta(entries) {
  const names = (entries || []).map(String);
  return {
    premiereBeta: names.find((n) => /premiere/i.test(n) && /\(beta\)|\bbeta\b/i.test(n)) || null,
    udt: names.find((n) => /uxp developer tool/i.test(n)) || null,
  };
}

export function checksFromReport(report) {
  const r = report || {};
  const steps = Array.isArray(r.steps) ? r.steps : [];
  const step = (name) => steps.find((s) => s.name === name) || null;
  const ins = step('insertMogrtFromPath');
  const cap = step('find AE.ADBE Capsule');
  const params = Array.isArray(r.params) ? r.params : [];
  const text = r.text || {};
  const dd = r.dropdown || {};
  const version = r.host && r.host.version ? String(r.host.version) : '';
  return [
    { name: 'uxp: host is Premiere 27.x (beta)', pass: /^27\./.test(version), required: false, detail: version || 'no host version' },
    {
      name: 'uxp: insertMogrtFromPath placed a clip with an AE.ADBE Capsule component',
      pass: Boolean(ins && ins.ok && cap && cap.ok), required: true,
      detail: [ins && ins.detail, cap && cap.detail].filter(Boolean).join('; '),
    },
    {
      name: 'uxp: parameter display names are readable',
      pass: params.some((p) => typeof p.displayName === 'string' && p.displayName !== ''), required: false,
      detail: params.map((p) => p.index + ':' + (p.displayName || '?') + ':' + p.kind).join(', '),
    },
    { name: 'uxp: getStartValue() returns MogrtText for the name field', pass: text.kind === 'MogrtText', required: true, detail: 'param ' + text.index + ' picked by ' + text.by },
    {
      name: 'uxp: MogrtText.setText with Cyrillic reads back',
      pass: text.ok === true && typeof text.written === 'string' && text.readback === text.written, required: true,
      detail: JSON.stringify({ before: text.before, written: text.written, readback: text.readback, transaction: text.transaction, uniform: text.uniform }),
    },
    {
      // The plugin finds the dropdown by name only; without it the report lists the names seen.
      name: 'uxp: dropdown set through createKeyframe(number) reads back',
      pass: dd.ok === true && dd.readback === dd.written, required: true,
      detail: Array.isArray(dd.seen)
        ? `no parameter named "${dd.missing}"; seen: ${dd.seen.map((n) => n || '?').join(', ')}`
        : JSON.stringify({ index: dd.index, by: dd.by, before: dd.before, written: dd.written, readback: dd.readback, transaction: dd.transaction }),
    },
    { name: 'uxp: no uncaught error in the plugin', pass: !r.error, required: false, detail: r.error || '' },
  ];
}
```

Run: `npx vitest run tests/spikes/s9-uxp.test.mjs`
Expected: `7 passed`.

- [ ] **Step 4: Создать записи итога `record-not-run.mjs` и `record-report.mjs`**

`spikes/s9-uxp-beta/record-not-run.mjs`:

```js
#!/usr/bin/env node
// S9 when Premiere (Beta) 27 is not available: record the spike as "not-run" with what was looked for.
//   node spikes/s9-uxp-beta/record-not-run.mjs [--reason "<why>"] [--force]
// --force records not-run even if a beta folder exists (for example, UDT cannot connect to it).
// The verdict is locked: notes added with tools/spike/manual.mjs keep it; record-report.mjs replaces it.
import { existsSync, readdirSync } from 'node:fs';
import { makeResult, writeResult } from '../../tools/spike/result.mjs';
import { S9_ID, S9_TITLE, S9_FALLBACK, S9_REVISIT, detectBeta } from './lib.mjs';

const argv = process.argv.slice(2);
const reason = argv.includes('--reason') ? argv[argv.indexOf('--reason') + 1] : '';
const roots = process.platform === 'darwin' ? ['/Applications'] : ['C:/Program Files/Adobe'];
const entries = [];
for (const r of roots) if (existsSync(r)) entries.push(...readdirSync(r));
const found = detectBeta(entries);

if (found.premiereBeta && !argv.includes('--force')) {
  console.error(`Premiere beta found: "${found.premiereBeta}". Run the plugin steps of task 20, or pass --force with --reason.`);
  process.exit(1);
}

const seen = found.premiereBeta ? `найдена «${found.premiereBeta}», но не проверена` : `Premiere (Beta) не найдена в ${roots.join(', ')}`;
const udt = found.udt ? `UDT: «${found.udt}»` : 'UXP Developer Tool не найден';
const result = makeResult({
  id: S9_ID, title: S9_TITLE, host: 'pr-beta', checks: [], verdict: 'not-run', verdictLocked: true, fallback: S9_FALLBACK,
  notes: [seen, udt, reason, S9_REVISIT].filter(Boolean).join('. '),
  evidence: ['spikes/s9-uxp-beta/plugin/'],
});
console.log(`written ${writeResult(result)} (S9: not-run; ${seen}; ${udt})`);
```

`spikes/s9-uxp-beta/record-report.mjs`:

```js
#!/usr/bin/env node
// S9: turn the plugin report (copied into the repo) into the S9 result. Observations that only a person
// can make (Program Monitor, Properties panel, undo steps) are added later with tools/spike/manual.mjs.
// The verdict is computed from the checks: a real run replaces the locked not-run of branch A.
//   node spikes/s9-uxp-beta/record-report.mjs spikes/s9-uxp-beta/report.json
import { existsSync, readFileSync } from 'node:fs';
import { writeStageResult } from '../../tools/spike/stages.mjs';
import { S9_ID, S9_TITLE, S9_FALLBACK, S9_REVISIT, checksFromReport } from './lib.mjs';

const file = process.argv[2] || 'spikes/s9-uxp-beta/report.json';
if (!existsSync(file)) {
  console.error(`no plugin report: ${file}\nusage: node spikes/s9-uxp-beta/record-report.mjs [spikes/s9-uxp-beta/report.json]`);
  process.exit(2);
}
const report = JSON.parse(readFileSync(file, 'utf8'));
const checks = checksFromReport(report);
const result = writeStageResult({
  id: S9_ID, title: S9_TITLE, host: 'pr-beta',
  hostVersion: report.host ? `${report.host.name} ${report.host.version}` : null,
  stage: 'uxp', checks, keepLocked: false, fallback: S9_FALLBACK,
  notes: `Отчёт плагина: ${file} (UXP ${report.uxp || '?'}, ${report.platform || '?'}). ${S9_REVISIT}`,
  evidence: [file, 'spikes/s9-uxp-beta/plugin/'],
});
for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.required ? '' : '(optional) '}${c.name}${c.detail ? ' | ' + c.detail : ''}`);
console.log(`S9: ${result.verdict} (${result.checks.length} checks) -> spikes/results/S9.json`);
```

Run: `node --check spikes/s9-uxp-beta/record-not-run.mjs && node spikes/s9-uxp-beta/record-report.mjs spikes/s9-uxp-beta/none.json`
Expected: `no plugin report: spikes/s9-uxp-beta/none.json` и строка `usage: node spikes/s9-uxp-beta/record-report.mjs …`, код выхода 2. Отчёта нет, поэтому скрипт ничего не пишет; запуск в обычном Node проверяет его импорты (vitest пропущенный именованный экспорт не замечает).

- [ ] **Step 5: Создать UXP-плагин `spikes/s9-uxp-beta/plugin/`**

`spikes/s9-uxp-beta/plugin/manifest.json` (manifestVersion 5, хост `premierepro` от 27.0.0, одна команда; `fullAccess` — на случай, если Premiere проверяет права плагина на путь к MOGRT вне его папки):

```json
{
  "manifestVersion": 5,
  "id": "ru.cloud.brandkit.s9",
  "name": "BrandKit S9 Spike",
  "version": "0.0.1",
  "main": "index.html",
  "host": {
    "app": "premierepro",
    "minVersion": "27.0.0"
  },
  "entrypoints": [
    {
      "type": "command",
      "id": "runS9",
      "label": {
        "default": "Run S9 (MOGRT text + dropdown)"
      }
    }
  ],
  "requiredPermissions": {
    "localFileSystem": "fullAccess"
  }
}
```

`spikes/s9-uxp-beta/plugin/index.html`:

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>BrandKit S9 Spike</title>
</head>
<body>
  <script src="index.js"></script>
</body>
</html>
```

`spikes/s9-uxp-beta/plugin/index.js`:

Как плагин находит поля:
- текст — параметр с именем «Имя», иначе первый, чьё значение — `MogrtText`;
- список — только параметр с именем «Стиль». Догадки по позиции нет: она верна, лишь если все семь полей S1 стоят в том же порядке. Если имени нет, список не пишется, а в отчёт попадают имена всех полей; проверка списка не проходит и перечисляет их.

Каким путём найдено каждое поле, пишется в отчёт.

```js
// S9 spike: MOGRT text and dropdown through UXP in Premiere (Beta) 27.
// Command "Run S9": insert CRT_LowerThird_v1.mogrt at 00:00 on V1 of the active sequence, write the name
// field through MogrtText.setText (Cyrillic) and the "Стиль" dropdown through a number keyframe, read both
// back and save a JSON report to the plugin data folder (its path is printed to the UDT console).
// API: @adobe/premierepro 27.0.0-beta (MogrtText since beta.22, https://github.com/adobe/premierepro-types/pull/90);
// patterns from https://github.com/AdobeDocs/uxp-premiere-pro-samples/tree/main/sample-panels/premiere-api/src
// (sequenceEditor.ts: insertMogrtFromPath inside lockedAccess; keyframe.ts: 'AE.ADBE Capsule',
// createKeyframe + createSetValueAction inside lockedAccess/executeTransaction).
const ppro = require('premierepro');
const uxp = require('uxp');
const os = require('os');

const MOGRT = os.platform() === 'darwin'
  ? '/Users/Shared/CRBK/work/mogrt/CRT_LowerThird_v1.mogrt'
  : 'C:/CRBK/work/mogrt/CRT_LowerThird_v1.mogrt';
const TEXT_VALUE = 'Проверка ЁЙ ёй S9';
const NAME_LABEL = 'Имя';
const STYLE_LABEL = 'Стиль';

function step(report, name, ok, ms, detail) {
  report.steps.push({ name, ok, ms, detail: detail || '' });
}

function kindOf(v) {
  if (v === null || v === undefined) return 'null';
  if (ppro.MogrtText && v instanceof ppro.MogrtText) return 'MogrtText';
  if (typeof v.getText === 'function' && typeof v.setText === 'function') return 'MogrtText';
  if (typeof v.getText === 'function') return 'MogrtComment';
  if ('red' in v && 'green' in v && 'blue' in v) return 'Color';
  if ('value' in v) return 'Keyframe';
  return 'other';
}

function plain(v, kind) {
  try {
    if (kind === 'MogrtText' || kind === 'MogrtComment') return v.getText();
    if (kind === 'Color') return [v.red, v.green, v.blue, v.alpha];
    if (kind === 'Keyframe') {
      const w = v.value;
      return w !== null && typeof w === 'object' && 'value' in w ? w.value : w;
    }
  } catch (e) {
    return 'ERR ' + e.message;
  }
  return null;
}

async function insertMogrt(project, sequence, report) {
  const editor = ppro.SequenceEditor.getEditor(sequence);
  const track = await sequence.getVideoTrack(0);
  const before = track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false).length;
  if (before !== 0) throw new Error('V1 is not empty (' + before + ' clips): use an empty sequence');
  let items = [];
  const t0 = Date.now();
  project.lockedAccess(() => {
    // An immediate call, not an Action: it is not part of a transaction (Adobe sample does the same).
    items = editor.insertMogrtFromPath(MOGRT, ppro.TickTime.TIME_ZERO, 0, 0);
  });
  step(report, 'insertMogrtFromPath', Array.isArray(items) && items.length > 0, Date.now() - t0, (items ? items.length : 0) + ' items returned');
  return items || [];
}

async function findCapsule(sequence, items, report) {
  let candidates = items;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    if (!candidates.length) {
      candidates = (await sequence.getVideoTrack(0)).getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
    }
    for (const it of candidates) {
      if (typeof it.getComponentChain !== 'function') continue;
      const chain = await it.getComponentChain();
      for (let i = 0; i < chain.getComponentCount(); i += 1) {
        const comp = chain.getComponentAtIndex(i);
        if ((await comp.getMatchName()) === 'AE.ADBE Capsule') {
          step(report, 'find AE.ADBE Capsule', true, 0, 'attempt ' + attempt + ', component ' + i);
          return comp;
        }
      }
    }
    candidates = [];
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  step(report, 'find AE.ADBE Capsule', false, 0, 'not found after 10 attempts');
  throw new Error('AE.ADBE Capsule not found');
}

async function dumpParams(capsule) {
  const out = [];
  for (let i = 0; i < capsule.getParamCount(); i += 1) {
    const p = capsule.getParam(i);
    const row = { index: i, displayName: null, kind: 'null', value: null, error: null };
    try { row.displayName = p.displayName; } catch (e) { row.error = 'displayName: ' + e.message; }
    try {
      const v = await p.getStartValue();
      row.kind = kindOf(v);
      row.value = plain(v, row.kind);
    } catch (e) {
      row.error = (row.error ? row.error + '; ' : '') + 'getStartValue: ' + e.message;
    }
    out.push(row);
  }
  return out;
}

function pickText(params) {
  const byName = params.find((p) => p.displayName === NAME_LABEL);
  if (byName) return { index: byName.index, by: 'displayName' };
  const byKind = params.find((p) => p.kind === 'MogrtText');
  return byKind ? { index: byKind.index, by: 'first MogrtText' } : null;
}

// The dropdown is found by its Essential Graphics name only: a guess by position would assume that every
// S1 field exists, in S1's order. Without the name, runS9 reports the names it saw instead.
function pickStyle(params) {
  const byName = params.find((p) => p.displayName === STYLE_LABEL);
  return byName ? { index: byName.index, by: 'displayName' } : null;
}

async function writeText(project, capsule, pick, report) {
  const p = capsule.getParam(pick.index);
  const mt = await p.getStartValue();
  report.text = { index: pick.index, by: pick.by, kind: kindOf(mt) };
  if (report.text.kind !== 'MogrtText') throw new Error('param ' + pick.index + ' is not MogrtText');
  report.text.before = mt.getText();
  report.text.uniform = typeof mt.isUniformStyling === 'function' ? mt.isUniformStyling() : null;
  report.text.written = TEXT_VALUE;
  project.lockedAccess(() => {
    mt.setText(TEXT_VALUE);
    const kf = p.createKeyframe(mt);
    report.text.transaction = project.executeTransaction((compound) => {
      compound.addAction(p.createSetValueAction(kf, true));
    }, 'BK S9 text');
  });
  const after = await p.getStartValue();
  report.text.readback = kindOf(after) === 'MogrtText' ? after.getText() : null;
  report.text.ok = report.text.readback === TEXT_VALUE;
}

async function writeDropdown(project, capsule, pick, report) {
  const p = capsule.getParam(pick.index);
  const v0 = await p.getStartValue();
  const before = plain(v0, kindOf(v0));
  // Default item 1 (Dark) reads as 0 or 1 depending on the index base; +1 selects Light in both cases.
  const target = typeof before === 'number' ? (before <= 1 ? before + 1 : before - 1) : 1;
  report.dropdown = { index: pick.index, by: pick.by, kind: kindOf(v0), before, written: target };
  project.lockedAccess(() => {
    const kf = p.createKeyframe(target);
    report.dropdown.transaction = project.executeTransaction((compound) => {
      compound.addAction(p.createSetValueAction(kf, true));
    }, 'BK S9 dropdown');
  });
  const v1 = await p.getStartValue();
  report.dropdown.readback = plain(v1, kindOf(v1));
  report.dropdown.ok = report.dropdown.readback === target;
}

async function saveReport(report) {
  const lfs = uxp.storage.localFileSystem;
  const folder = await lfs.getDataFolder();
  const file = await folder.createFile('s9-report.json', { overwrite: true });
  await file.write(JSON.stringify(report, null, 2));
  let where = null;
  try { where = lfs.getNativePath(file); } catch (e) { where = file.nativePath || file.name; }
  console.log('S9 report: ' + where);
}

async function runS9() {
  const report = {
    spike: 'S9',
    createdAt: new Date().toISOString(),
    host: { name: uxp.host.name, version: uxp.host.version, uiLocale: uxp.host.uiLocale },
    uxp: uxp.versions ? uxp.versions.uxp : null,
    platform: os.platform(),
    mogrtPath: MOGRT,
    steps: [],
    params: [],
    text: null,
    dropdown: null,
    error: null,
  };
  try {
    const project = await ppro.Project.getActiveProject();
    if (!project) throw new Error('no active project');
    const sequence = await project.getActiveSequence();
    if (!sequence) throw new Error('no active sequence');
    const items = await insertMogrt(project, sequence, report);
    const capsule = await findCapsule(sequence, items, report);
    report.params = await dumpParams(capsule);
    const t = pickText(report.params);
    if (!t) throw new Error('no MogrtText parameter among ' + report.params.length);
    await writeText(project, capsule, t, report);
    const s = pickStyle(report.params);
    if (s) {
      await writeDropdown(project, capsule, s, report);
    } else {
      // A failed dropdown check in Node, not an exception: the check lists these names.
      report.dropdown = { ok: false, by: 'displayName', missing: STYLE_LABEL, seen: report.params.map((p) => p.displayName) };
      console.error('S9: no parameter named "' + STYLE_LABEL + '"; seen: ' + report.dropdown.seen.join(', '));
    }
  } catch (e) {
    report.error = String(e && e.message ? e.message : e);
    console.error('S9 failed: ' + report.error);
  }
  await saveReport(report);
}

uxp.entrypoints.setup({
  commands: {
    runS9,
  },
});
```

Run: `node --check spikes/s9-uxp-beta/plugin/index.js && node -e "JSON.parse(require('fs').readFileSync('spikes/s9-uxp-beta/plugin/manifest.json','utf8')); console.log('manifest ok')"`
Expected: `manifest ok`.

- [ ] **Step 6: Прогнать тесты**

Run: `npm test`
Expected: все тесты зелёные, включая `7 passed` в `tests/spikes/s9-uxp.test.mjs`.

- [ ] **Step 7: Ветка A — беты нет: записать «не проводилась»**

Run: `node spikes/s9-uxp-beta/record-not-run.mjs`
Expected: `written …\spikes\results\S9.json (S9: not-run; Premiere (Beta) не найдена в C:/Program Files/Adobe; UXP Developer Tool не найден)`.

Если бета установлена, но запустить S9 нельзя (UDT не подключается, нет лицензии на бету), записать причину:
`node spikes/s9-uxp-beta/record-not-run.mjs --force --reason "UDT не подключился к Premiere (Beta) 27.0.0.13"`.

Дальше — шаг 12.

- [ ] **Step 8: Ветка B — подготовить бету, UDT и проект (вручную)**

1. Creative Cloud desktop → Beta apps → Premiere Pro (Beta) → установить или обновить до последней сборки. К сборке 27.0.0.13 UDT не подключался, со сборки 60 подключался. Версию смотреть так (PowerShell): `(Get-Item "C:/Program Files/Adobe/Adobe Premiere Pro (Beta)/Adobe Premiere Pro (Beta).exe").VersionInfo.ProductVersion`.
2. Creative Cloud desktop → All apps → UXP Developer Tools → Install (нужны права администратора). Запустить UDT и войти в Adobe ID (онлайн).
3. Premiere (Beta) → Edit → Preferences (Settings) → Plugins → включить «Enable Developer Mode» → перезапустить Premiere (Beta). После каждого обновления беты флажок проверять заново.
4. Проверить MOGRT из S2: `ls C:/CRBK/work/mogrt/CRT_LowerThird_v1.mogrt` — путь без ошибки.
5. Premiere (Beta): File → New → Project… → name `S9_beta`, location `C:\CRBK\work\s9` → Create. Затем File → New → Sequence… → HD 1080p → HD 1080p 25 fps → Sequence Name `S9_Seq` → OK. Секвенция открыта в Timeline, V1 пустая.
6. Скопировать плагин в ASCII-путь (репозиторий лежит в пути с кириллицей):

   Run: `rm -rf C:/CRBK/work/s9/plugin && mkdir -p C:/CRBK/work/s9 && cp -r spikes/s9-uxp-beta/plugin C:/CRBK/work/s9/plugin`
   Expected: в `C:/CRBK/work/s9/plugin` лежат `manifest.json`, `index.html`, `index.js`.

- [ ] **Step 9: Загрузить плагин и выполнить команду (вручную)**

1. UDT → «Add Plugin…» → выбрать `C:\CRBK\work\s9\plugin\manifest.json`. В списке появится «BrandKit S9 Spike».
2. В строке плагина → Actions (•••) → Load, целевое приложение — Premiere Pro (Beta). Ожидается «Plugin Load Successful».
3. Premiere (Beta): Window → UXP Plugins → BrandKit S9 Spike → «Run S9 (MOGRT text + dropdown)». На V1 в 00:00 появится клип `CRT_LowerThird_v1`.
4. UDT → строка плагина → Actions (•••) → Debug. В консоли DevTools найти строку `S9 report: <путь>`.
5. Скопировать отчёт в репозиторий (PowerShell, путь с обратными слэшами): `Copy-Item "<путь из консоли>" spikes/s9-uxp-beta/report.json`.

- [ ] **Step 10: Записать итог по отчёту**

Run: `node spikes/s9-uxp-beta/record-report.mjs spikes/s9-uxp-beta/report.json`
Expected: семь строк `PASS|FAIL …`, например `PASS uxp: MogrtText.setText with Cyrillic reads back | {"before":"Имя Фамилия","written":"Проверка ЁЙ ёй S9",…}`, и последняя `S9: <итог> (7 checks) -> spikes/results/S9.json`.

Как читать неудачи:
- `getStartValue() returns MogrtText` не прошла — MogrtText в этой сборке не работает. Это и есть ответ S9: запасной путь, CEP остаётся.
- `dropdown … reads back` не прошла с деталью `no parameter named "Стиль"; seen: …` — список по имени не найден. Если в `seen` одни `?`, UXP этой сборки не отдаёт имена полей: искать их по порядку из `library.json` (`egpIndex`), и этот порядок становится обязательным для UXP. Если имена есть, а «Стиль» среди них нет, сверить имена полей с S1.

- [ ] **Step 11: Записать наблюдения (вручную)**

1. Program Monitor на 00:00:01:00 показывает имя «Проверка ЁЙ ёй S9», а не «Имя Фамилия»:
   `node tools/spike/manual.mjs --id S9 --check "uxp: Program Monitor shows the written name text" --pass true --detail "<что видно>"`
2. Плашка имени светлая (#F2F2F2, стиль Light), а не тёмная:
   `node tools/spike/manual.mjs --id S9 --check "uxp: Program Monitor shows the Light plate after the dropdown write" --pass true --detail "<что видно>"`
3. Выделить клип; Window → Properties (или Essential Graphics → Edit): поле «Имя» показывает новый текст без перевыбора клипа:
   `node tools/spike/manual.mjs --id S9 --check "uxp: Properties panel shows the new text without reselecting the clip" --pass true --detail "<что видно>" --optional`
4. Шаги отмены: нажимать Ctrl+Z, пока клип не исчезнет с V1. Записать, после какого нажатия вернулись «Имя Фамилия» и тёмная плашка. `--pass true`, если всего нажатий не больше трёх (вставка, текст, список):
   `node tools/spike/manual.mjs --id S9 --check "uxp: undo steps for insert + text + dropdown" --pass true --detail "<N> Ctrl+Z: 1 — …, 2 — …, 3 — …" --optional`

Для `--pass` подставить `false`, если наблюдение не совпало.

- [ ] **Step 12: Отчёт и commit**

Run: `npm run spike:report`
Expected: в `spikes/RESULTS.md` строка `| S9 | UXP: MogrtText в бете 27 | pr-beta | … | not-run |` (ветка A) или с итогом прогона (ветка B).

Ветка A:

```bash
git add spikes/s9-uxp-beta/lib.mjs spikes/s9-uxp-beta/record-not-run.mjs spikes/s9-uxp-beta/record-report.mjs spikes/s9-uxp-beta/plugin/manifest.json spikes/s9-uxp-beta/plugin/index.html spikes/s9-uxp-beta/plugin/index.js tests/spikes/s9-uxp.test.mjs spikes/results/S9.json spikes/RESULTS.md
git commit -m "feat(spikes): S9 UXP MogrtText probe plugin, recorded as not run" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Ветка B:

```bash
git add spikes/s9-uxp-beta/lib.mjs spikes/s9-uxp-beta/record-not-run.mjs spikes/s9-uxp-beta/record-report.mjs spikes/s9-uxp-beta/plugin/manifest.json spikes/s9-uxp-beta/plugin/index.html spikes/s9-uxp-beta/plugin/index.js spikes/s9-uxp-beta/report.json tests/spikes/s9-uxp.test.mjs spikes/results/S9.json spikes/RESULTS.md
git commit -m "feat(spikes): S9 UXP MogrtText probe in Premiere 27 beta" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 21: S11 — кодек петель T2: ProRes 4444 против PNG в MOV

**Files:**
- Create: `spikes/s11-loop-codec/lib.mjs`, `spikes/s11-loop-codec/encode.mjs`, `spikes/s11-loop-codec/playback.mjs`
- Test: `tests/spikes/s11-codec.test.mjs`
- Create (при прогоне): `spikes/results/S11.json`, `spikes/results/S11.data.json`; вне репозитория — `C:/CRBK/work/s11/*.mov` и `C:/CRBK/work/s11/bitrates.json`
- Modify: `spikes/RESULTS.md` (пересобирается `npm run spike:report`)

Источники — три рендера пакета (только чтение; имена сверяются в NFC, `Оверлей 16 на 9.mov` на диске записан в NFD):

| Ключ | Файл в пакете | Кадр | Отрезок |
|---|---|---|---|
| `bg_1x1` | `4_SMM_Pack/Render/BG/BG_pattern_1x1_1.mov` | 1440×1440 | 10–20 с |
| `overlay_16x9` | `3_Обучающие_курсы/3_Обучающие курсы/Render Overlays/FullHD/Оверлей 16 на 9.mov` | 1920×1080 | 60–70 с |
| `intro_4k` | `6_Podcast_Cloud.ru_Pack/Ready mov/Заставка_ПОДКАСТ_CLOUD.RU.mov` | 3840×2160 | весь файл (7 с) |

Варианты каждого отрезка:
- `prores_ae` — копия потока исходного рендера AE: настоящий битрейт ProRes 4444 из AE. Его и брать для оценки веса;
- `prores_ks` — ProRes 4444 с альфой из ffmpeg (`prores_ks`, профиль 4444, `yuva444p10le`): сравнение с PNG при одинаковом кодировщике;
- `png` — PNG в MOV с альфой (`-c:v png -pix_fmt rgba`).

Автоматические проверки на каждый источник:
- PNG легче ProRes из AE хотя бы вдвое — обязательная. По замерам пакета ожидалось в 3–9 раз; при выигрыше меньше двух смена кодека не окупает риск;
- PNG декодируется ffmpeg ≥ 25 кадров/с с потоками по умолчанию — обязательная;
- в один поток (PNG и ProRes) — необязательные. Это пессимистичная оценка: Premiere и AE декодируют в несколько потоков. Неудача даёт `partial`, решает ручная проверка;
- PNG легче `prores_ks` — необязательная, для сравнения.

Ручные проверки:
- воспроизведение каждого PNG-файла в Premiere без пропусков на Full — обязательные;
- ProRes в Premiere и первый проход превью в AE — необязательные, для сравнения.

Итог `yes` — петли T2 в PNG в MOV. Иначе — запасной путь: ProRes 4444 и сокращённая матрица T2 (D24).

Формат `C:/CRBK/work/s11/bitrates.json` (его читает задача 23, часть F):
- `unit` — «MB/s per megapixel at 25 fps», МБ = 10⁶ байт;
- `codecs.prores_ae`, `codecs.prores_ks`, `codecs.png` — у каждого `mean` и `max` (МБ/с на мегапиксель) и `samples[]` с полями `{ key, w, h, mbPerSec, mbPerSecPerMp }`;
- вес петли: `mbPerSecPerMp × (w·h / 10⁶) × длина в секундах`. Для ProRes брать `prores_ae`, для запаса — `max`.

- [ ] **Step 1: Написать падающий тест `tests/spikes/s11-codec.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  resolveNfc, encodeArgs, decodeArgs, parseProbe, parseBench, decodeFps, mbPerSec, perMegapixel,
  buildChecks, bitratesTable, formatTable, playbackCheck, S11_SOURCES,
} from '../../spikes/s11-loop-codec/lib.mjs';
import { decideVerdict } from '../../tools/spike/result.mjs';

const row = (key, w, h, ae, ks, png) => ({
  key, w, h,
  variants: {
    prores_ae: { bytes: ae.bytes, mbps: ae.bytes / 1e6 / 10, dec1Fps: 60, decNFps: 300 },
    prores_ks: { bytes: ks.bytes, mbps: ks.bytes / 1e6 / 10, dec1Fps: 40, decNFps: 250 },
    png: { bytes: png.bytes, mbps: png.bytes / 1e6 / 10, dec1Fps: png.dec1, decNFps: png.decN },
  },
});

describe('S11 helpers', () => {
  it('resolves package paths whose stored names are NFD', () => {
    const nfd = 'Оверлей 16 на 9.mov'.normalize('NFD');
    const tree = { R: ['3_Обучающие_курсы'], [path.join('R', '3_Обучающие_курсы')]: [nfd, 'x.mov'] };
    const readdir = (p) => tree[p] || [];
    expect(resolveNfc('R', '3_Обучающие_курсы/Оверлей 16 на 9.mov', readdir)).toBe(path.join('R', '3_Обучающие_курсы', nfd));
    expect(() => resolveNfc('R', 'nope/a.mov', readdir)).toThrow(/not found/);
  });
  it('lists three sources with distinct keys', () => {
    expect(S11_SOURCES.map((s) => s.key)).toEqual(['bg_1x1', 'overlay_16x9', 'intro_4k']);
  });
  it('builds ffmpeg arguments per variant', () => {
    expect(encodeArgs('png', 'in.mov', 10, 10, 'out.mov').slice(-5)).toEqual(['-c:v', 'png', '-pix_fmt', 'rgba', 'out.mov']);
    expect(encodeArgs('prores_ks', 'in.mov', 0, 10, 'o.mov')).toEqual(expect.arrayContaining(['prores_ks', '4444', 'yuva444p10le']));
    expect(encodeArgs('prores_ae', 'in.mov', 60, 10, 'o.mov').slice(-3)).toEqual(['-c', 'copy', 'o.mov']);
    expect(() => encodeArgs('h264', 'a', 0, 1, 'b')).toThrow(/unknown variant/);
    expect(decodeArgs('f.mov', 1)).toEqual(['-hide_banner', '-nostdin', '-benchmark', '-threads', '1', '-i', 'f.mov', '-map', '0:v:0', '-f', 'null', '-']);
    expect(decodeArgs('f.mov', 0)).not.toContain('-threads');
  });
  it('parses ffprobe output and ffmpeg benchmark lines', () => {
    expect(parseProbe('{"streams":[{"width":1440,"height":1440,"r_frame_rate":"25/1","nb_frames":"250"}],"format":{"duration":"10.0"}}'))
      .toEqual({ w: 1440, h: 1440, fps: 25, frames: 250, duration: 10 });
    expect(parseProbe({ streams: [{ width: 8, height: 8, r_frame_rate: '25/1' }], format: { duration: '7.000000' } }).frames).toBe(175);
    const err = 'frame=  120 fps=0.0 q=-0.0 size=N/A\rframe=  250 fps=240 q=-0.0 Lsize=N/A speed=9.6x\nbench: utime=3.210s stime=0.120s rtime=1.042s\nbench: maxrss=123456KiB\n';
    expect(parseBench(err)).toEqual({ utime: 3.21, stime: 0.12, rtime: 1.042, frames: 250 });
    expect(parseBench('nothing')).toEqual({ utime: null, stime: null, rtime: null, frames: null });
    expect(decodeFps(250, 2)).toBe(125);
    expect(decodeFps(250, 0)).toBe(null);
  });
  it('computes MB/s and MB/s per megapixel', () => {
    expect(mbPerSec(158_000_000, 250)).toBeCloseTo(15.8);
    expect(perMegapixel(15.8, 1440, 1440)).toBeCloseTo(7.62, 2);
    expect(mbPerSec(1, 0)).toBe(null);
  });
  it('passes when png is light and decodes in real time', () => {
    const rows = [row('bg_1x1', 1440, 1440, { bytes: 158e6 }, { bytes: 200e6 }, { bytes: 30e6, dec1: 30, decN: 200 })];
    expect(decideVerdict(buildChecks(rows, 'win32'))).toBe('yes');
  });
  it('is partial when png only misses real time on one thread', () => {
    const rows = [row('intro_4k', 3840, 2160, { bytes: 250e6 }, { bytes: 300e6 }, { bytes: 60e6, dec1: 12, decN: 90 })];
    expect(decideVerdict(buildChecks(rows, 'win32'))).toBe('partial');
  });
  it('fails when png is not at least 2x lighter than the AE render', () => {
    const rows = [row('intro_4k', 3840, 2160, { bytes: 100e6 }, { bytes: 300e6 }, { bytes: 80e6, dec1: 30, decN: 90 })];
    const checks = buildChecks(rows, 'win32');
    expect(decideVerdict(checks)).toBe('no');
    expect(checks[0].detail).toContain('gain 1.25x');
  });
  it('turns playback observations into checks', () => {
    expect(playbackCheck({ tag: 'win32', app: 'pr', variant: 'png', key: 'intro_4k', value: '0' }))
      .toEqual({ name: 'win32 pr: real-time playback without dropped frames, png, intro_4k', pass: true, required: true, detail: 'dropped 0 frames' });
    expect(playbackCheck({ tag: 'win32', app: 'pr', variant: 'prores_ks', key: 'bg_1x1', value: '4' })).toMatchObject({ pass: false, required: false });
    expect(playbackCheck({ tag: 'darwin', app: 'ae', variant: 'png', key: 'bg_1x1', value: '24.6' })).toMatchObject({ pass: true, required: false, detail: 'first pass 24.6 fps' });
    expect(playbackCheck({ tag: 'win32', app: 'ae', variant: 'png', key: 'bg_1x1', value: '17' }).pass).toBe(false);
    expect(() => playbackCheck({ tag: 'win32', app: 'ps', variant: 'png', key: 'bg_1x1', value: '0' })).toThrow(/pr or ae/);
    expect(() => playbackCheck({ tag: 'win32', app: 'pr', variant: 'h264', key: 'bg_1x1', value: '0' })).toThrow(/png or prores_ks/);
    expect(() => playbackCheck({ tag: 'win32', app: 'pr', variant: 'png', key: 'nope', value: '0' })).toThrow(/unknown source/);
  });
  it('writes the bitrate table for the weight estimate', () => {
    const rows = [
      row('bg_1x1', 1440, 1440, { bytes: 158e6 }, { bytes: 200e6 }, { bytes: 30e6, dec1: 30, decN: 200 }),
      row('overlay_16x9', 1920, 1080, { bytes: 26e6 }, { bytes: 90e6 }, { bytes: 5e6, dec1: 90, decN: 400 }),
    ];
    const t = bitratesTable(rows, { date: '2026-10-05', platform: 'win32' });
    expect(t.unit).toMatch(/per megapixel/);
    expect(t.codecs.prores_ae.samples[0]).toEqual({ key: 'bg_1x1', w: 1440, h: 1440, mbPerSec: 15.8, mbPerSecPerMp: 7.62 });
    expect(t.codecs.prores_ae.max).toBe(7.62);
    expect(t.codecs.png.mean).toBeCloseTo((30 / 10 / 2.0736 + 5 / 10 / 2.0736) / 2, 2);
    expect(formatTable(rows)).toHaveLength(7);
  });
});
```

Run: `npx vitest run tests/spikes/s11-codec.test.mjs`
Expected: FAIL — `Cannot find module '../../spikes/s11-loop-codec/lib.mjs'`.

- [ ] **Step 2: Создать `spikes/s11-loop-codec/lib.mjs`**

```js
// Helpers for spike S11 (T2 loop codec: ProRes 4444 against PNG in MOV). Pure except resolveNfc's default readdir.
import { readdirSync } from 'node:fs';
import path from 'node:path';

export const S11_ID = 'S11';
export const S11_TITLE = 'Кодек петель T2';
export const S11_FALLBACK = 'ProRes 4444 и сокращённая матрица T2 (D24)';
export const FPS = 25;
export const MB = 1e6;            // MB = 10^6 bytes everywhere in S11 and in bitrates.json
export const MIN_GAIN = 2;        // PNG must be at least 2x lighter than the AE ProRes render (package estimate: 3-9x)
export const REALTIME_FPS = 25;
export const VARIANTS = ['prores_ae', 'prores_ks', 'png'];

// Three renders of the package (read only). startSec picks a typical stretch, not the intro.
export const S11_SOURCES = [
  { key: 'bg_1x1', rel: '4_SMM_Pack/Render/BG/BG_pattern_1x1_1.mov', startSec: 10, label: 'SMM фон 1440×1440' },
  { key: 'overlay_16x9', rel: '3_Обучающие_курсы/3_Обучающие курсы/Render Overlays/FullHD/Оверлей 16 на 9.mov', startSec: 60, label: 'оверлей курсов 1920×1080' },
  { key: 'intro_4k', rel: '6_Podcast_Cloud.ru_Pack/Ready mov/Заставка_ПОДКАСТ_CLOUD.RU.mov', startSec: 0, label: 'интро подкаста 3840×2160 (весь файл, 7 с)' },
];

// Walk the path segment by segment, comparing NFC forms: some package names are NFD (saved on a Mac).
export function resolveNfc(root, rel, readdir = readdirSync) {
  let cur = root;
  for (const seg of rel.split('/')) {
    const want = seg.normalize('NFC');
    const hit = readdir(cur).find((e) => String(e).normalize('NFC') === want);
    if (hit === undefined) throw new Error(`not found: "${seg}" in ${cur}`);
    cur = path.join(cur, hit);
  }
  return cur;
}

// variant: prores_ae = stream copy of the AE render (its real bitrate), prores_ks = ffmpeg ProRes 4444
// with alpha, png = PNG in MOV with alpha.
export function encodeArgs(variant, src, startSec, seconds, out) {
  const head = ['-y', '-hide_banner', '-nostdin', '-loglevel', 'error', '-ss', String(startSec), '-i', src,
    '-t', String(seconds), '-map', '0:v:0', '-an'];
  if (variant === 'prores_ae') return head.concat(['-c', 'copy', out]);
  if (variant === 'prores_ks') return head.concat(['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', out]);
  if (variant === 'png') return head.concat(['-c:v', 'png', '-pix_fmt', 'rgba', out]);
  throw new Error('unknown variant: ' + variant);
}

// threads: 1 for a single decoder thread, 0 for the ffmpeg default.
export function decodeArgs(file, threads) {
  return ['-hide_banner', '-nostdin', '-benchmark']
    .concat(threads ? ['-threads', String(threads)] : [])
    .concat(['-i', file, '-map', '0:v:0', '-f', 'null', '-']);
}

export function parseProbe(json) {
  const j = typeof json === 'string' ? JSON.parse(json) : json;
  const s = (j.streams || [])[0] || {};
  const [num, den] = String(s.r_frame_rate || '0/1').split('/').map(Number);
  const fps = den ? num / den : 0;
  const duration = Number((j.format || {}).duration);
  const frames = Number(s.nb_frames) > 0 ? Number(s.nb_frames) : Math.round(duration * fps);
  return { w: Number(s.width), h: Number(s.height), fps, frames, duration };
}

export function parseBench(stderr) {
  const s = String(stderr);
  const b = /bench:\s*utime=([\d.]+)s\s+stime=([\d.]+)s\s+rtime=([\d.]+)s/.exec(s);
  const frames = [...s.matchAll(/frame=\s*(\d+)/g)].map((m) => Number(m[1]));
  return {
    utime: b ? Number(b[1]) : null,
    stime: b ? Number(b[2]) : null,
    rtime: b ? Number(b[3]) : null,
    frames: frames.length ? frames[frames.length - 1] : null,
  };
}

export function decodeFps(frames, rtime) {
  return frames > 0 && rtime > 0 ? frames / rtime : null;
}

export function mbPerSec(bytes, frames, fps = FPS) {
  return frames > 0 ? bytes / MB / (frames / fps) : null;
}

export function perMegapixel(value, w, h) {
  return value === null || !(w > 0 && h > 0) ? null : value / (w * h / 1e6);
}

export function round(x, digits = 2) {
  if (x === null || x === undefined || Number.isNaN(x)) return null;
  const k = 10 ** digits;
  return Math.round(x * k) / k;
}

// rows: [{ key, w, h, variants: { prores_ae: { bytes, mbps, dec1Fps, decNFps }, prores_ks: {...}, png: {...} } }]
export function buildChecks(rows, tag) {
  const checks = [];
  for (const r of rows) {
    const at = `${r.key} ${r.w}x${r.h}`;
    const { prores_ae: ae, prores_ks: ks, png } = r.variants;
    const gainAe = ae && png && png.bytes > 0 ? ae.bytes / png.bytes : null;
    const gainKs = ks && png && png.bytes > 0 ? ks.bytes / png.bytes : null;
    checks.push({
      name: `${tag}: png at least ${MIN_GAIN}x lighter than the AE ProRes 4444 render, ${at}`,
      pass: gainAe !== null && gainAe >= MIN_GAIN, required: true,
      detail: `png ${round(png && png.mbps)} MB/s, AE ProRes ${round(ae && ae.mbps)} MB/s, gain ${round(gainAe)}x`,
    });
    checks.push({
      name: `${tag}: png lighter than prores_ks 4444, ${at}`,
      pass: gainKs !== null && gainKs > 1, required: false,
      detail: `prores_ks ${round(ks && ks.mbps)} MB/s, gain ${round(gainKs)}x`,
    });
    checks.push({
      name: `${tag}: png decodes at >= ${REALTIME_FPS} fps (ffmpeg, default threads), ${at}`,
      pass: Boolean(png && png.decNFps >= REALTIME_FPS), required: true,
      detail: `${round(png && png.decNFps, 1)} fps`,
    });
    checks.push({
      name: `${tag}: png decodes at >= ${REALTIME_FPS} fps (ffmpeg, 1 thread), ${at}`,
      pass: Boolean(png && png.dec1Fps >= REALTIME_FPS), required: false,
      detail: `${round(png && png.dec1Fps, 1)} fps`,
    });
    checks.push({
      name: `${tag}: prores_ks decodes at >= ${REALTIME_FPS} fps (ffmpeg, 1 thread), ${at}`,
      pass: Boolean(ks && ks.dec1Fps >= REALTIME_FPS), required: false,
      detail: `${round(ks && ks.dec1Fps, 1)} fps`,
    });
  }
  return checks;
}

// The weight estimator (part F, task 23) reads this: MB/s per megapixel at 25 fps, per codec.
export function bitratesTable(rows, { date, platform } = {}) {
  const codecs = {};
  for (const v of VARIANTS) {
    const samples = rows.filter((r) => r.variants[v]).map((r) => ({
      key: r.key, w: r.w, h: r.h,
      mbPerSec: round(r.variants[v].mbps, 3),
      mbPerSecPerMp: round(perMegapixel(r.variants[v].mbps, r.w, r.h), 3),
    }));
    const vals = samples.map((s) => s.mbPerSecPerMp).filter((x) => x !== null);
    codecs[v] = {
      mean: vals.length ? round(vals.reduce((a, b) => a + b, 0) / vals.length, 3) : null,
      max: vals.length ? Math.max(...vals) : null,
      samples,
    };
  }
  return {
    spike: 'S11', date: date || null, platform: platform || null, fps: FPS,
    unit: 'MB/s per megapixel at 25 fps (MB = 10^6 bytes)',
    note: 'prores_ae = stream copy of the AE render: use it for ProRes 4444 weight; prores_ks = the same frames '
      + 'encoded by ffmpeg, for a like-for-like size comparison with png',
    codecs,
  };
}

// One manual observation. Premiere: dropped frames over the whole clip (Full resolution); required for png,
// the codec under test. AE: the frame rate of the first preview pass from the Info panel; informative.
export function playbackCheck({ tag, app, variant, key, value }) {
  if (!S11_SOURCES.some((s) => s.key === key)) throw new Error('unknown source: ' + key);
  if (app !== 'pr' && app !== 'ae') throw new Error('app must be pr or ae: ' + app);
  if (variant !== 'png' && variant !== 'prores_ks') throw new Error('variant must be png or prores_ks: ' + variant);
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error('value must be a number: ' + value);
  if (app === 'pr') {
    return {
      name: `${tag} pr: real-time playback without dropped frames, ${variant}, ${key}`,
      pass: n === 0, required: variant === 'png', detail: `dropped ${n} frames`,
    };
  }
  return {
    name: `${tag} ae: first preview pass in real time, ${variant}, ${key}`,
    pass: n >= REALTIME_FPS * 0.98, required: false, detail: `first pass ${n} fps`,
  };
}

export function formatTable(rows) {
  const lines = ['source           variant    MB/s    MB/s/MP  1 thread  default'];
  for (const r of rows) {
    for (const v of VARIANTS) {
      const x = r.variants[v];
      if (!x) continue;
      lines.push([
        r.key.padEnd(16), v.padEnd(10), String(round(x.mbps)).padStart(6),
        String(round(perMegapixel(x.mbps, r.w, r.h))).padStart(8),
        String(round(x.dec1Fps, 1)).padStart(8), String(round(x.decNFps, 1)).padStart(8),
      ].join(' '));
    }
  }
  return lines;
}
```

Run: `npx vitest run tests/spikes/s11-codec.test.mjs`
Expected: `10 passed`.

- [ ] **Step 3: Создать `spikes/s11-loop-codec/encode.mjs` и `spikes/s11-loop-codec/playback.mjs`**

`spikes/s11-loop-codec/encode.mjs` (бинарные файлы пишет только ffmpeg, в рабочую папку; пакет только читается):

```js
#!/usr/bin/env node
// S11: T2 loop codec. Cuts 10 s from three package renders into <work>/s11 as ProRes 4444 (stream copy of
// the AE render and a prores_ks re-encode) and as PNG in MOV, measures MB/s and ffmpeg decode speed
// (1 thread and default threads) and writes:
//   spikes/results/S11.json       automatic checks (stage auto:<platform>), manual checks are kept
//   spikes/results/S11.data.json  all numbers, per platform
//   <work>/s11/bitrates.json      MB/s per megapixel per codec for the weight estimate (part F)
//   node spikes/s11-loop-codec/encode.mjs [--package "<package folder>"] [--seconds 10]
// The package defaults to sourceRoot() of tools/packs/paths.mjs (plan 2, task 1; BRANDKIT_SOURCE).
// It is only read: ffmpeg reads the sources, every output goes to the work folder.
import { existsSync, mkdirSync, readFileSync, statSync, statfsSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { workPath, ensureDir } from '../../tools/lib/work.mjs';
import { sourceRoot } from '../../tools/packs/paths.mjs';
import { RESULTS_DIR } from '../../tools/spike/result.mjs';
import { writeStageResult } from '../../tools/spike/stages.mjs';
import { machineInfo } from '../../tools/spike/machine.mjs';
import {
  S11_ID, S11_TITLE, S11_FALLBACK, S11_SOURCES, VARIANTS, FPS, resolveNfc, encodeArgs, decodeArgs, parseProbe,
  parseBench, decodeFps, mbPerSec, perMegapixel, buildChecks, bitratesTable, formatTable,
} from './lib.mjs';

const argv = process.argv.slice(2);
const val = (f, d) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : d);
const pkg = val('--package', sourceRoot());
const seconds = Number(val('--seconds', '10'));
const tag = process.platform;

function ffprobe(file) {
  return parseProbe(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,nb_frames,r_frame_rate:format=duration', '-of', 'json', file],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
}

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')} failed (${r.status}): ${String(r.stderr).slice(-600)}`);
  return r.stderr;
}

function ffmpegVersion() {
  const first = execFileSync('ffmpeg', ['-hide_banner', '-version'], { encoding: 'utf8' }).split('\n')[0];
  const m = /ffmpeg version (\S+)/.exec(first);
  return 'ffmpeg ' + (m ? m[1] : first);
}

if (!existsSync(pkg)) {
  console.error(`package not found: ${pkg} (pass --package or set BRANDKIT_SOURCE)`);
  process.exit(2);
}
const outDir = ensureDir(workPath('s11'));
const free = statfsSync(outDir);
const freeGb = (free.bavail * free.bsize) / 1e9;
if (freeGb < 8) {
  console.error(`only ${freeGb.toFixed(1)} GB free in ${outDir}; S11 needs about 8 GB`);
  process.exit(2);
}

const rows = [];
for (const s of S11_SOURCES) {
  const src = resolveNfc(pkg, s.rel);
  const sp = ffprobe(src);
  const row = { key: s.key, label: s.label, source: s.rel, startSec: s.startSec, w: sp.w, h: sp.h, fps: sp.fps, variants: {} };
  for (const v of VARIANTS) {
    const out = path.posix.join(outDir, `${s.key}_${v}.mov`);
    const t0 = Date.now();
    ffmpeg(encodeArgs(v, src, s.startSec, seconds, out));
    const encodeMs = Date.now() - t0;
    const p = ffprobe(out);
    const bytes = statSync(out).size;
    const one = parseBench(ffmpeg(decodeArgs(out, 1)));
    const many = parseBench(ffmpeg(decodeArgs(out, 0)));
    const mbps = mbPerSec(bytes, p.frames, p.fps || FPS);
    row.frames = p.frames;
    row.variants[v] = {
      file: out, bytes, frames: p.frames, encodeMs, mbps, mbpsPerMp: perMegapixel(mbps, row.w, row.h),
      dec1Fps: decodeFps(one.frames || p.frames, one.rtime), decNFps: decodeFps(many.frames || p.frames, many.rtime),
    };
    console.log(`${s.key} ${v}: ${(bytes / 1e6).toFixed(1)} MB for ${p.frames} frames`);
  }
  rows.push(row);
}

const date = new Date().toISOString().slice(0, 10);
const table = bitratesTable(rows, { date, platform: tag });
const bitratesFile = path.posix.join(outDir, 'bitrates.json');
writeFileSync(bitratesFile, JSON.stringify(table, null, 2) + '\n', 'utf8');

const mFile = path.join(RESULTS_DIR, 'S11.data.json');
const all = existsSync(mFile) ? JSON.parse(readFileSync(mFile, 'utf8')) : {};
all[tag] = { date, machine: machineInfo(), ffmpeg: ffmpegVersion(), seconds, rows, bitrates: table };
mkdirSync(RESULTS_DIR, { recursive: true });
writeFileSync(mFile, JSON.stringify(all, null, 2) + '\n', 'utf8');

const result = writeStageResult({
  id: S11_ID, title: S11_TITLE, host: 'ffmpeg+pr+ae', hostVersion: ffmpegVersion(), stage: 'auto:' + tag,
  checks: buildChecks(rows, tag), fallback: S11_FALLBACK,
  notes: 'Автоматическая часть — размеры файлов и декодирование ffmpeg; решение по кодеку — вместе с ручной '
    + 'проверкой воспроизведения в Premiere и AE (задача 21). Цифры: spikes/results/S11.data.json.',
  evidence: ['spikes/results/S11.data.json', bitratesFile],
});
console.log('\n' + formatTable(rows).join('\n'));
console.log(`\nbitrates: ${bitratesFile}`);
console.log(`S11: ${result.verdict} (${result.checks.length} checks) -> spikes/results/S11.json`);
```

`spikes/s11-loop-codec/playback.mjs`:

```js
#!/usr/bin/env node
// Record one manual playback observation for S11.
//   Premiere: node spikes/s11-loop-codec/playback.mjs pr png bg_1x1 <dropped frames> ["note"]
//   AE:       node spikes/s11-loop-codec/playback.mjs ae png bg_1x1 <first-pass fps> ["note"]
import { appendManualCheck } from '../../tools/spike/result.mjs';
import { S11_ID, playbackCheck } from './lib.mjs';

const [app, variant, key, value, note] = process.argv.slice(2);
let check;
try {
  check = playbackCheck({ tag: process.platform, app, variant, key, value });
} catch (e) {
  console.error(e.message + '\nusage: node spikes/s11-loop-codec/playback.mjs pr|ae png|prores_ks <source key> <dropped frames | first-pass fps> ["note"]');
  process.exit(2);
}
if (note) check.detail += '; ' + note;
const r = appendManualCheck(S11_ID, check);
console.log(`${check.name}: ${check.pass ? 'PASS' : 'FAIL'} (${check.detail}); S11 now: ${r.verdict}`);
```

Run: `node --check spikes/s11-loop-codec/playback.mjs && node spikes/s11-loop-codec/encode.mjs --package C:/CRBK/none`
Expected: `package not found: C:/CRBK/none (pass --package or set BRANDKIT_SOURCE)`, код выхода 2. Скрипт выходит до ffmpeg; запуск в обычном Node проверяет его импорты.

- [ ] **Step 4: Нарезать, замерить, записать**

Нужно: ffmpeg и ffprobe в PATH, около 8 ГБ свободно в `C:/CRBK/work` (скрипт проверяет сам). Пакет берётся из `sourceRoot()` (`tools/packs/paths.mjs`): `C:/Users/Глеб/Documents/Граф пакет Cloud.ru` или путь из `BRANDKIT_SOURCE`; другой путь — флагом `--package`.

Run: `node spikes/s11-loop-codec/encode.mjs`
Expected (3–15 мин):

```text
bg_1x1 prores_ae: <N> MB for 250 frames
bg_1x1 prores_ks: <N> MB for 250 frames
bg_1x1 png: <N> MB for 250 frames
overlay_16x9 prores_ae: <N> MB for 250 frames
… overlay_16x9 prores_ks, overlay_16x9 png …
intro_4k prores_ae: <N> MB for 175 frames
… intro_4k prores_ks, intro_4k png …

source           variant    MB/s    MB/s/MP  1 thread  default
… 9 строк таблицы …

bitrates: C:/CRBK/work/s11/bitrates.json
S11: <итог> (15 checks) -> spikes/results/S11.json
```

Ориентир — прогон при подготовке плана (2026-10-02, по 1 с на источник): PNG легче ProRes из AE в 3,5–8 раз; 4K PNG в один поток декодировался около 29 кадров/с, у самого порога.

- [ ] **Step 5: Воспроизведение в Premiere (вручную, эта машина)**

1. Premiere Pro 2026: File → New → Project… → name `S11_playback`, location `C:\CRBK\work\s11` → Create.
2. File → Import… → в `C:\CRBK\work\s11` выбрать шесть файлов: `bg_1x1_png.mov`, `bg_1x1_prores_ks.mov`, `overlay_16x9_png.mov`, `overlay_16x9_prores_ks.mov`, `intro_4k_png.mov`, `intro_4k_prores_ks.mov` → Open.
3. Program Monitor → гаечный ключ (Settings) → включить «Show Dropped Frame Indicator» (индикатор появится слева от кнопок воспроизведения).
4. Для каждого файла:
   1. Правый щелчок по файлу в панели Project → New Sequence From Clip.
   2. Program Monitor → «Select Playback Resolution» → Full.
   3. Щёлкнуть по Timeline, Home, Space; дождаться конца клипа (10 с, у `intro_4k` — 7 с), Space.
   4. Навести курсор на индикатор → «Dropped Frames: N».
   5. Записать: `node spikes/s11-loop-codec/playback.mjs pr <png|prores_ks> <ключ> <N>`.

Шесть команд (подставить N):

```bash
node spikes/s11-loop-codec/playback.mjs pr png bg_1x1 0
node spikes/s11-loop-codec/playback.mjs pr prores_ks bg_1x1 0
node spikes/s11-loop-codec/playback.mjs pr png overlay_16x9 0
node spikes/s11-loop-codec/playback.mjs pr prores_ks overlay_16x9 0
node spikes/s11-loop-codec/playback.mjs pr png intro_4k 0
node spikes/s11-loop-codec/playback.mjs pr prores_ks intro_4k 0
```

Expected на каждую: `win32 pr: real-time playback without dropped frames, <variant>, <ключ>: PASS|FAIL (dropped N frames); S11 now: <итог>`. PNG-проверки обязательные, ProRes — нет.

- [ ] **Step 6: Первый проход превью в AE (вручную, эта машина)**

1. After Effects 2026: сохранить текущий проект, затем File → New → New Project.
2. File → Import → File… → те же шесть файлов → Import.
3. Каждый файл перетащить на кнопку «Create a new Composition» внизу панели Project: композиция получит размер, частоту и длину файла.
4. Window → Preview: снять флажок «Cache Before Playback». Открыть Window → Info.
5. Для каждой композиции:
   1. Edit → Purge → All Memory (подтвердить, если спросит).
   2. Щёлкнуть по таймлайну композиции, Home, Space.
   3. Во время первого прохода смотреть в Info: частоту кадров и надпись Real-time или Non-real-time (красным). Space — стоп.
   4. Записать: `node spikes/s11-loop-codec/playback.mjs ae <png|prores_ks> <ключ> <кадров/с>`.

```bash
node spikes/s11-loop-codec/playback.mjs ae png bg_1x1 25
node spikes/s11-loop-codec/playback.mjs ae prores_ks bg_1x1 25
node spikes/s11-loop-codec/playback.mjs ae png overlay_16x9 25
node spikes/s11-loop-codec/playback.mjs ae prores_ks overlay_16x9 25
node spikes/s11-loop-codec/playback.mjs ae png intro_4k 25
node spikes/s11-loop-codec/playback.mjs ae prores_ks intro_4k 25
```

Expected на каждую: `win32 ae: first preview pass in real time, <variant>, <ключ>: PASS|FAIL (first pass N fps); S11 now: <итог>`. Это необязательные проверки: они показывают, отстаёт ли PNG от ProRes в AE.

- [ ] **Step 7: Mac (вручную, если Mac доступен в фазе 0)**

Спецификация просит Win и Mac. Если Mac команды доступен:
1. Скопировать шесть файлов из шагов 5–6 в `/Users/Shared/CRBK/work/s11/`.
2. Повторить шаги 5–6 на Mac из клона репозитория. Метка проверок станет `darwin`; на Mac PNG-проверки Premiere тоже обязательные.
3. Если на Mac есть пакет, прогнать и замер: `node spikes/s11-loop-codec/encode.mjs --package "<путь к «Граф пакет Cloud.ru»>"`. Его проверки лягут рядом, с меткой `darwin`.

Если Mac недоступен до конца фазы 0, проверку не записывать: итог S11 тогда относится только к Windows. В листе решений у D24 отметить «S11 на Mac не проверена» и повторить шаги 5–6 на Mac до утверждения D24.

- [ ] **Step 8: Отчёт и решение для D24**

Run: `npm test && npm run spike:report`
Expected: все тесты зелёные; в `spikes/RESULTS.md` строка `| S11 | Кодек петель T2 | ffmpeg+pr+ae | ffmpeg … | <итог> | … | ProRes 4444 и сокращённая матрица T2 (D24) |`.

Итог переносится в лист решений (часть F):
- `yes` — петли T2 в PNG в MOV;
- `partial` — PNG, если не прошли только проверки в один поток или в AE. Отметить риск для слабых машин;
- `no` — ProRes 4444 и сокращённая матрица T2.

- [ ] **Step 9: Commit**

```bash
git add spikes/s11-loop-codec/lib.mjs spikes/s11-loop-codec/encode.mjs spikes/s11-loop-codec/playback.mjs tests/spikes/s11-codec.test.mjs spikes/results/S11.json spikes/results/S11.data.json spikes/RESULTS.md
git commit -m "feat(spikes): S11 loop codec comparison, ProRes 4444 vs PNG in MOV" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Часть F. Схема библиотеки, оценка веса, шрифты, инвентаризация, решения и контракт

Задачи 22–28 не трогают AE и Premiere: это Node-модули с юнит-тестами, два скрипта инвентаризации и документы фазы 0.

- **Опора на часть A.** Задача 1 поставила vitest и ajv; задача 3 дала `workPath`.
- **Связь с частью E.** S11 (задача 21) пишет замеры кодеков в `workPath('s11', 'bitrates.json')`, задача 23 их читает. Если файла ещё нет, оценка веса берёт битрейты из замеров пакета. Самую слабую машину для S8 называет инвентаризация (задача 25).
- **Для части G.** Лист решений `docs/decisions/phase0-decisions.md` и документы, на которые он ссылается: `weight-estimate.md`, `inventory.md`, `fonts-this-pc.json`, `brandbook-rules.md`, `docs/contract/template-contract.md`, `brand/tokens.json`.
- **Новые папки тестов.** `tests/helpers/` — сборщик шрифта для тестов (не тест). `tests/docs/` — проверки структуры документов, чтобы правка не потеряла строку или номер страницы.

### Task 22: Схема `library.src.json` и `library.json`, валидатор

Схема из spec §4.4. Источник `library.src.json` правят руками, каталог `library.json` пишет конвейер. Общая часть элемента лежит в `$defs.itemCommon` схемы источника, схема каталога ссылается на неё по `$id`. Что схема выразить не может, проверяет код `validate.mjs`.

**Решения схемы** (входят в A3 листа решений):
- `id` = `<СЕМЕЙСТВО>_<Элемент>`: семейства контракта (LOGO, TTL, WEB, CRS, SMM, POD, TRN, BG), плюс FX, SFX (звуки) и AME (пресеты экспорта). До 40 символов: с суффиксом формата и версией имя `.mogrt` укладывается в 64; реальные имена файлов проверяет правило `file-name`.
- `variants[].key` — суффикс формата (`16x9`, `16x9_4K`, `9x16`, `1x1`); у T2 к нему добавляются опции.
- `version` — целое, его поднимают руками при смене дизайна; из него конвейер делает `_v<N>`. В источнике `aeComp` без `_v<N>`, в каталоге — с ним.
- `duration` в секундах; длина вставки по умолчанию = интро + удержание + аутро. `loop.periodFrames` — в кадрах; у петли все варианты в одном fps.
- `parts` в источнике — диапазоны кадров `[от, до)`, в каталоге — файлы с `sha256`, `bytes` и `frames`.
- Добавлено к spec: `accepts` у слотов (photo, qr, video), `unitSec` и `enabledBy` у поля длины, `editable: false` у служебного поля.

**Правила в коде:** `unique-id`, `unique-keys`, `companion-ref`, `companion-kind`, `drives-duration`, `ae-comp`, `options-index`, `service-field`, `switch-ref`, `enabled-by`, `field-hosts`, `egp-name`, `field-default`, `media-fit`, `aspect`, `parts`, `loop`, `windows`, `files`, `file-name`.

**Files:**
- Create: `tools/library/schema/library.src.schema.json`, `tools/library/schema/library.schema.json`, `tools/library/validate.mjs`, `docs/library/example.src.json`
- Test: `tests/tools/library-validate.test.mjs`

- [ ] **Step 1: Написать падающий тест `tests/tools/library-validate.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateLibrary, detectKind } from '../../tools/library/validate.mjs';

const example = () => JSON.parse(readFileSync(new URL('../../docs/library/example.src.json', import.meta.url), 'utf8'));
const item = (doc, id) => doc.items.find((i) => i.id === id);
const field = (it, key) => it.fields.find((f) => f.key === key);
const errorsOf = (doc, kind) => validateLibrary(doc, kind).errors.join('\n');

const SHA = 'a'.repeat(64);
function catalog() {
  const it = structuredClone(item(example(), 'TTL_LowerThird'));
  delete it.companions;
  it.requiredFonts = it.requiredFonts.map((f) => ({ ...f, build: '1.002' }));
  it.variants = it.variants.map((v) => ({
    ...v,
    aeComp: v.aeComp + '_v1',
    file: `items/TTL_LowerThird/TTL_LowerThird_${v.key}_v1.mogrt`,
    sha256: SHA,
    bytes: 1000,
  }));
  it.aep = { file: 'items/TTL_LowerThird/TTL_LowerThird_v1.aep', sha256: SHA, bytes: 2000 };
  return { schemaVersion: 1, libraryVersion: '2026.10.02', minPluginVersion: '1.0.0', items: [it] };
}

describe('library source', () => {
  it('accepts the example', () => {
    expect(validateLibrary(example())).toEqual({ ok: true, kind: 'source', errors: [] });
  });
  it('rejects unknown properties and bad ids (schema)', () => {
    const doc = example();
    doc.items[0].colour = 'green';
    doc.items[1].id = 'whoosh';
    const e = errorsOf(doc);
    expect(e).toMatch(/schema: \/items\/0 unknown property "colour"/);
    expect(e).toMatch(/schema: \/items\/1\/id must match pattern/);
  });
  it('requires fit and duration on T1 items (schema)', () => {
    const doc = example();
    delete item(doc, 'TTL_LowerThird').fit;
    expect(errorsOf(doc)).toMatch(/must have required property 'fit'/);
  });
  it('rejects duplicate ids', () => {
    const doc = example();
    doc.items.push(structuredClone(item(doc, 'SFX_WhooshIn')));
    expect(errorsOf(doc)).toMatch(/SFX_WhooshIn: unique-id/);
  });
  it('rejects a companion that does not exist', () => {
    const doc = example();
    item(doc, 'TTL_LowerThird').companions[0].ref = 'SFX_Missing';
    expect(errorsOf(doc)).toMatch(/TTL_LowerThird: companion-ref: companion "SFX_Missing"/);
  });
  it('rejects two fields that drive the duration', () => {
    const doc = example();
    const web = item(doc, 'WEB_Screen');
    web.fields.push({ ...field(web, 'minutes'), key: 'minutes2', egpName: 'Минуты 2' });
    expect(errorsOf(doc)).toMatch(/WEB_Screen: drives-duration: 2 fields/);
  });
  it('rejects an AE-capable variant without aeComp', () => {
    const doc = example();
    delete item(doc, 'TTL_LowerThird').variants[2].aeComp;
    expect(errorsOf(doc)).toMatch(/TTL_LowerThird: ae-comp: variant "9x16": an AE-capable variant needs aeComp/);
  });
  it('rejects a versioned aeComp in the source', () => {
    const doc = example();
    item(doc, 'TTL_LowerThird').variants[0].aeComp = 'CR_TTL_LowerThird_16x9_v1';
    expect(errorsOf(doc)).toMatch(/ae-comp: .*has no _vN/);
  });
  it('rejects dropdown options that are not indexed from 1', () => {
    const doc = example();
    field(item(doc, 'TTL_LowerThird'), 'side').options = [{ index: 0, label_ru: 'Слева' }, { index: 1, label_ru: 'Справа' }];
    expect(errorsOf(doc)).toMatch(/schema: .*options\/0\/index must be >= 1/);
    field(item(doc, 'TTL_LowerThird'), 'side').options = [{ index: 2, label_ru: 'Слева' }, { index: 1, label_ru: 'Справа' }];
    expect(errorsOf(doc)).toMatch(/TTL_LowerThird: options-index: field "side"/);
  });
  it('rejects an editable service field', () => {
    const doc = example();
    field(item(doc, 'WEB_Screen'), 'duration').editable = true;
    expect(errorsOf(doc)).toMatch(/WEB_Screen: service-field: field "duration": a service field must set "editable": false/);
  });
  it('rejects a service field that drives the duration', () => {
    const doc = example();
    const web = item(doc, 'WEB_Screen');
    delete field(web, 'minutes').drivesDuration;
    Object.assign(field(web, 'duration'), { drivesDuration: true, unitSec: 1 });
    expect(errorsOf(doc)).toMatch(/drives-duration: field "duration": only a visible slider/);
  });
  it('rejects variant options that are not switch values', () => {
    const doc = example();
    item(doc, 'TTL_LowerThird').variants[0].options = { style: 4 };
    item(doc, 'TTL_LowerThird').variants[1].options = { name: 1 };
    const e = errorsOf(doc);
    expect(e).toMatch(/switch-ref: variant "16x9" options: "style" needs an option index 1..3/);
    expect(e).toMatch(/switch-ref: variant "16x9_4K" options: "name" is not a dropdown or checkbox field/);
  });
  it('rejects an enabledBy that is not a checkbox', () => {
    const doc = example();
    field(item(doc, 'WEB_Screen'), 'minutes').enabledBy = 'title';
    expect(errorsOf(doc)).toMatch(/WEB_Screen: enabled-by: field "minutes"/);
  });
  it('rejects a video slot on an rdt template', () => {
    const doc = example();
    item(doc, 'WEB_Screen').fit = 'rdt';
    expect(errorsOf(doc)).toMatch(/WEB_Screen: media-fit: field "visual"/);
  });
  it('rejects a T1 field without egpName and a field host the item lacks', () => {
    const doc = example();
    const ttl = item(doc, 'TTL_LowerThird');
    delete field(ttl, 'role2').egpName;
    ttl.hosts = ['pr'];
    field(ttl, 'name').hosts = ['ae'];
    const e = errorsOf(doc);
    expect(e).toMatch(/egp-name: field "role2"/);
    expect(e).toMatch(/field-hosts: field "name"/);
  });
  it('rejects defaults that do not fit the field', () => {
    const doc = example();
    field(item(doc, 'WEB_Screen'), 'minutes').default = 20;
    field(item(doc, 'TTL_LowerThird'), 'style').default = 0;
    const e = errorsOf(doc);
    expect(e).toMatch(/WEB_Screen: field-default: field "minutes"/);
    expect(e).toMatch(/TTL_LowerThird: field-default: field "style"/);
  });
  it('rejects a loop part that does not match the period and mixed fps', () => {
    const doc = example();
    const bg = item(doc, 'BG_WebinarPortal');
    bg.variants[1].parts.loop = [0, 749];
    bg.variants[1].fps = 30;
    const e = errorsOf(doc);
    expect(e).toMatch(/BG_WebinarPortal: loop: variant "16x9_4K": the loop part has 749 frames, the period is 750/);
    expect(e).toMatch(/BG_WebinarPortal: loop: a looped item needs one fps/);
  });
  it('rejects a frame size that does not match the aspect', () => {
    const doc = example();
    item(doc, 'TTL_LowerThird').variants[3].w = 1440;
    expect(errorsOf(doc)).toMatch(/aspect: variant "1x1": 1440x1080 is not 1x1/);
  });
  it('rejects a video companion that is T1 or not under', () => {
    const doc = example();
    item(doc, 'WEB_Screen').companions[0].placement = 'in';
    expect(errorsOf(doc)).toMatch(/WEB_Screen: companion-kind: companion "BG_WebinarPortal"/);
  });
});

describe('library catalog', () => {
  it('detects the kind', () => {
    expect(detectKind(example())).toBe('source');
    expect(detectKind(catalog())).toBe('catalog');
  });
  it('accepts a minimal catalog', () => {
    expect(validateLibrary(catalog())).toEqual({ ok: true, kind: 'catalog', errors: [] });
  });
  it('requires pinned font builds and a calver libraryVersion (schema)', () => {
    const doc = catalog();
    delete doc.items[0].requiredFonts[0].build;
    doc.libraryVersion = '2026-10-02';
    const e = errorsOf(doc);
    expect(e).toMatch(/requiredFonts\/0 must have required property 'build'/);
    expect(e).toMatch(/libraryVersion must match pattern/);
  });
  it('requires aeComp with the item version', () => {
    const doc = catalog();
    doc.items[0].variants[0].aeComp = 'CR_TTL_LowerThird_16x9_v2';
    expect(errorsOf(doc)).toMatch(/ae-comp: variant "16x9": aeComp must end with _v1/);
  });
  it('requires a .mogrt for Premiere T1 variants and the .aep for AE', () => {
    const doc = catalog();
    delete doc.items[0].variants[0].file;
    delete doc.items[0].variants[0].sha256;
    delete doc.items[0].variants[0].bytes;
    delete doc.items[0].aep;
    const e = errorsOf(doc);
    expect(e).toMatch(/files: variant "16x9": a Premiere T1 variant needs a .mogrt file/);
    expect(e).toMatch(/files: an AE T1 item needs its .aep/);
  });
  it('requires sha256 next to a file (schema)', () => {
    const doc = catalog();
    delete doc.items[0].variants[0].sha256;
    expect(errorsOf(doc)).toMatch(/must have properties sha256, bytes when property file is present/);
  });
  it('rejects file names over 64 characters', () => {
    const doc = catalog();
    doc.items[0].variants[0].file = 'items/TTL_LowerThird/' + 'x'.repeat(60) + '.mogrt';
    expect(errorsOf(doc)).toMatch(/file-name: .*at most 64 characters/);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run tests/tools/library-validate.test.mjs`
Expected: FAIL — `Cannot find module '../../tools/library/validate.mjs'`.

- [ ] **Step 3: Создать схему источника `tools/library/schema/library.src.schema.json`**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://brandkit.invalid/schema/library.src.schema.json",
  "title": "Cloud.ru BrandKit: library source (library.src.json)",
  "description": "Hand-edited source of the catalog (spec 4.4). The pipeline turns it into library.json. Cross-field rules live in tools/library/validate.mjs.",
  "type": "object",
  "required": ["schemaVersion", "items"],
  "additionalProperties": false,
  "properties": {
    "$schema": { "type": "string" },
    "schemaVersion": { "const": 1 },
    "items": { "type": "array", "items": { "$ref": "#/$defs/item" } }
  },
  "$defs": {
    "id": {
      "description": "<FAMILY>_<Element>. Families from contract 4.2 plus FX, SFX (sounds) and AME (export presets). 40 characters leave room for _<format>_v<N>.mogrt in a 64-character file name; validate.mjs checks the real names.",
      "type": "string",
      "pattern": "^(LOGO|TTL|WEB|CRS|SMM|POD|TRN|BG|FX|SFX|AME)_[A-Za-z0-9]+(_[A-Za-z0-9]+)*$",
      "maxLength": 40
    },
    "key": { "type": "string", "pattern": "^[a-z][a-z0-9_]{0,31}$" },
    "variantKey": { "type": "string", "pattern": "^[A-Za-z0-9]+(_[A-Za-z0-9]+)*$", "maxLength": 24 },
    "host": { "enum": ["ae", "pr"] },
    "hosts": { "type": "array", "items": { "$ref": "#/$defs/host" }, "minItems": 1, "uniqueItems": true },
    "aspect": { "enum": ["16x9", "9x16", "1x1", "4x5", "4x3"] },
    "hostVersion": { "type": "string", "pattern": "^[0-9]+\\.[0-9]+(\\.[0-9]+)?$" },
    "minHostVersion": {
      "type": "object",
      "additionalProperties": false,
      "minProperties": 1,
      "properties": { "ae": { "$ref": "#/$defs/hostVersion" }, "pr": { "$ref": "#/$defs/hostVersion" } }
    },
    "aeCompBase": {
      "description": "Variant comp name in the working project, without the version suffix: the pipeline appends _v<N>.",
      "type": "string",
      "pattern": "^CR_[A-Z]+_[A-Za-z0-9]+(_[A-Za-z0-9]+)*$",
      "maxLength": 60
    },
    "font": {
      "type": "object",
      "required": ["postScriptName"],
      "additionalProperties": false,
      "properties": {
        "postScriptName": { "type": "string", "pattern": "^[A-Za-z0-9-]+$" },
        "build": { "description": "Reference build from the name table, e.g. 1.002 (brand/tokens.json).", "type": "string", "pattern": "^[0-9]+\\.[0-9]{3}$" }
      }
    },
    "duration": {
      "description": "Seconds. Default insert length = introSec + holdSec + outroSec.",
      "type": "object",
      "required": ["introSec", "holdSec", "outroSec"],
      "additionalProperties": false,
      "properties": {
        "introSec": { "type": "number", "minimum": 0 },
        "holdSec": { "type": "number", "minimum": 0 },
        "outroSec": { "type": "number", "minimum": 0 }
      }
    },
    "option": {
      "type": "object",
      "required": ["index", "label_ru"],
      "additionalProperties": false,
      "properties": {
        "index": { "type": "integer", "minimum": 1 },
        "label_ru": { "type": "string", "minLength": 1 }
      }
    },
    "field": {
      "type": "object",
      "required": ["key", "label_ru", "type"],
      "additionalProperties": false,
      "properties": {
        "key": { "$ref": "#/$defs/key" },
        "label_ru": { "type": "string", "minLength": 1 },
        "type": { "enum": ["text", "dropdown", "checkbox", "slider", "media"] },
        "egpName": { "description": "Display name of the Essential Graphics property (Premiere looks the parameter up by it).", "type": "string", "minLength": 1 },
        "egpIndex": { "description": "Position in Essential Graphics, for the future UXP adapter.", "type": "integer", "minimum": 0 },
        "default": { "type": ["string", "number", "boolean", "null"] },
        "maxLen": { "type": "integer", "minimum": 1 },
        "options": { "type": "array", "minItems": 2, "items": { "$ref": "#/$defs/option" } },
        "min": { "type": "number" },
        "max": { "type": "number" },
        "accepts": { "type": "array", "minItems": 1, "uniqueItems": true, "items": { "enum": ["photo", "qr", "video"] } },
        "drivesDuration": { "description": "The field sets the insert length: value * unitSec + duration.outroSec.", "type": "boolean" },
        "unitSec": { "type": "number", "exclusiveMinimum": 0 },
        "enabledBy": { "description": "Key of a checkbox field that switches this field on.", "$ref": "#/$defs/key" },
        "service": { "description": "Written by the panel itself (the Duration slider); never shown in the form or in the capability check.", "type": "boolean" },
        "editable": { "type": "boolean" },
        "hosts": { "description": "Hosts where the panel fills the field; elsewhere the field is 'fill in Properties'.", "$ref": "#/$defs/hosts" }
      },
      "allOf": [
        { "if": { "properties": { "type": { "const": "dropdown" } } }, "then": { "required": ["options"] } },
        { "if": { "properties": { "type": { "const": "slider" } } }, "then": { "required": ["min", "max"] } },
        { "if": { "properties": { "type": { "const": "text" } } }, "then": { "required": ["maxLen"] } },
        { "if": { "properties": { "type": { "const": "media" } } }, "then": { "required": ["accepts"] } },
        { "if": { "required": ["drivesDuration"], "properties": { "drivesDuration": { "const": true } } }, "then": { "required": ["unitSec"] } }
      ]
    },
    "options": {
      "type": "object",
      "propertyNames": { "$ref": "#/$defs/key" },
      "additionalProperties": { "type": ["integer", "boolean"] }
    },
    "frameRange": {
      "description": "[from, to) in frames of the source comp.",
      "type": "array",
      "prefixItems": [{ "type": "integer", "minimum": 0 }, { "type": "integer", "minimum": 1 }],
      "items": false,
      "minItems": 2
    },
    "srcParts": {
      "type": "object",
      "additionalProperties": false,
      "minProperties": 1,
      "properties": {
        "intro": { "$ref": "#/$defs/frameRange" },
        "loop": { "$ref": "#/$defs/frameRange" },
        "outro": { "$ref": "#/$defs/frameRange" }
      }
    },
    "rect": {
      "type": "object",
      "required": ["variant", "x", "y", "w", "h"],
      "additionalProperties": false,
      "properties": {
        "variant": { "$ref": "#/$defs/variantKey" },
        "when": { "$ref": "#/$defs/options" },
        "x": { "type": "number" },
        "y": { "type": "number" },
        "w": { "type": "number", "exclusiveMinimum": 0 },
        "h": { "type": "number", "exclusiveMinimum": 0 }
      }
    },
    "window": {
      "type": "object",
      "required": ["key", "label_ru", "rects"],
      "additionalProperties": false,
      "properties": {
        "key": { "$ref": "#/$defs/key" },
        "label_ru": { "type": "string", "minLength": 1 },
        "rects": { "type": "array", "minItems": 1, "items": { "$ref": "#/$defs/rect" } }
      }
    },
    "companion": {
      "type": "object",
      "required": ["ref", "kind", "placement", "default"],
      "additionalProperties": false,
      "properties": {
        "ref": { "$ref": "#/$defs/id" },
        "kind": { "enum": ["music", "sfx", "video"] },
        "placement": { "enum": ["in", "out", "under"] },
        "default": { "type": "boolean" }
      }
    },
    "variant": {
      "type": "object",
      "required": ["key"],
      "additionalProperties": false,
      "properties": {
        "key": { "$ref": "#/$defs/variantKey" },
        "aspect": { "$ref": "#/$defs/aspect" },
        "w": { "type": "integer", "minimum": 16, "maximum": 8192 },
        "h": { "type": "integer", "minimum": 16, "maximum": 8192 },
        "fps": { "type": "number", "exclusiveMinimum": 0, "maximum": 120 },
        "options": { "$ref": "#/$defs/options" },
        "parts": { "$ref": "#/$defs/srcParts" },
        "aeComp": { "$ref": "#/$defs/aeCompBase" },
        "minHostVersion": { "$ref": "#/$defs/minHostVersion" }
      }
    },
    "itemCommon": {
      "description": "Properties shared by library.src.json and library.json items.",
      "type": "object",
      "required": ["id", "title_ru", "category", "tier", "hosts", "version", "variants"],
      "properties": {
        "id": { "$ref": "#/$defs/id" },
        "title_ru": { "type": "string", "minLength": 1 },
        "category": { "enum": ["logo", "titles", "webinars", "courses", "smm", "podcast", "transitions", "backgrounds", "effects", "sounds", "export"] },
        "tier": { "enum": ["T1", "T2", "T3"] },
        "hosts": { "$ref": "#/$defs/hosts" },
        "version": { "type": "integer", "minimum": 1 },
        "fit": { "enum": ["rdt", "trim"] },
        "cutFrame": { "description": "Transitions: first frame of full cover.", "type": "integer", "minimum": 0 },
        "windows": { "type": "array", "items": { "$ref": "#/$defs/window" } },
        "duration": { "$ref": "#/$defs/duration" },
        "loop": {
          "type": "object",
          "required": ["periodFrames"],
          "additionalProperties": false,
          "properties": { "periodFrames": { "type": "integer", "minimum": 1 } }
        },
        "fields": { "type": "array", "items": { "$ref": "#/$defs/field" } },
        "companions": { "type": "array", "items": { "$ref": "#/$defs/companion" } }
      },
      "allOf": [
        { "if": { "properties": { "tier": { "const": "T1" } } }, "then": { "required": ["fit", "duration"] } },
        { "if": { "properties": { "category": { "const": "transitions" } } }, "then": { "required": ["cutFrame"] } },
        {
          "if": { "properties": { "tier": { "enum": ["T1", "T2"] } } },
          "then": { "properties": { "variants": { "type": "array", "items": { "type": "object", "required": ["aspect", "w", "h", "fps"] } } } }
        }
      ]
    },
    "item": {
      "type": "object",
      "$ref": "#/$defs/itemCommon",
      "propertyNames": {
        "enum": ["id", "title_ru", "category", "tier", "hosts", "version", "fit", "cutFrame", "windows", "duration", "loop", "fields", "companions", "requiredFonts", "variants"]
      },
      "properties": {
        "requiredFonts": { "type": "array", "items": { "$ref": "#/$defs/font" } },
        "variants": { "type": "array", "minItems": 1, "items": { "$ref": "#/$defs/variant" } }
      }
    }
  }
}
```

- [ ] **Step 4: Создать схему каталога `tools/library/schema/library.schema.json`**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://brandkit.invalid/schema/library.schema.json",
  "title": "Cloud.ru BrandKit: library catalog (library.json)",
  "description": "Written by the pipeline with files, sha256 and versions; never edited by hand (spec 4.4). Shares item definitions with library.src.schema.json.",
  "type": "object",
  "required": ["schemaVersion", "libraryVersion", "minPluginVersion", "items"],
  "additionalProperties": false,
  "properties": {
    "$schema": { "type": "string" },
    "schemaVersion": { "const": 1 },
    "libraryVersion": { "description": "calver YYYY.MM.DD, optional .N for a second build on the same day", "type": "string", "pattern": "^20[0-9]{2}\\.(0[1-9]|1[0-2])\\.(0[1-9]|[12][0-9]|3[01])(\\.[0-9]+)?$" },
    "minPluginVersion": { "description": "semver", "type": "string", "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$" },
    "generatedAt": { "type": "string", "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?Z$" },
    "items": { "type": "array", "items": { "$ref": "#/$defs/item" } }
  },
  "$defs": {
    "path": {
      "description": "Relative to the library root; ASCII only (contract 4.2). The 64-character limit on the file name is checked in validate.mjs.",
      "type": "string",
      "pattern": "^([A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+\\.[a-z0-9]+$"
    },
    "sha256": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
    "stored": {
      "type": "object",
      "required": ["file", "sha256", "bytes"],
      "additionalProperties": false,
      "properties": {
        "file": { "$ref": "#/$defs/path" },
        "sha256": { "$ref": "#/$defs/sha256" },
        "bytes": { "type": "integer", "minimum": 0 }
      }
    },
    "part": {
      "type": "object",
      "required": ["file", "sha256", "bytes", "frames"],
      "additionalProperties": false,
      "properties": {
        "file": { "$ref": "#/$defs/path" },
        "sha256": { "$ref": "#/$defs/sha256" },
        "bytes": { "type": "integer", "minimum": 0 },
        "frames": { "type": "integer", "minimum": 1 }
      }
    },
    "fontPinned": {
      "type": "object",
      "$ref": "library.src.schema.json#/$defs/font",
      "required": ["postScriptName", "build"]
    },
    "variant": {
      "type": "object",
      "required": ["key", "minHostVersion"],
      "additionalProperties": false,
      "dependentRequired": { "file": ["sha256", "bytes"] },
      "properties": {
        "key": { "$ref": "library.src.schema.json#/$defs/variantKey" },
        "aspect": { "$ref": "library.src.schema.json#/$defs/aspect" },
        "w": { "type": "integer", "minimum": 16, "maximum": 8192 },
        "h": { "type": "integer", "minimum": 16, "maximum": 8192 },
        "fps": { "type": "number", "exclusiveMinimum": 0, "maximum": 120 },
        "options": { "$ref": "library.src.schema.json#/$defs/options" },
        "file": { "$ref": "#/$defs/path" },
        "sha256": { "$ref": "#/$defs/sha256" },
        "bytes": { "type": "integer", "minimum": 0 },
        "parts": {
          "type": "object",
          "additionalProperties": false,
          "minProperties": 1,
          "properties": {
            "intro": { "$ref": "#/$defs/part" },
            "loop": { "$ref": "#/$defs/part" },
            "outro": { "$ref": "#/$defs/part" }
          }
        },
        "aeComp": {
          "description": "Variant comp inside <id>_v<N>.aep, with the version suffix.",
          "type": "string",
          "pattern": "^CR_[A-Z]+_[A-Za-z0-9]+(_[A-Za-z0-9]+)*_v[0-9]+$",
          "maxLength": 64
        },
        "minHostVersion": { "$ref": "library.src.schema.json#/$defs/minHostVersion" }
      }
    },
    "item": {
      "type": "object",
      "$ref": "library.src.schema.json#/$defs/itemCommon",
      "propertyNames": {
        "enum": ["id", "title_ru", "category", "tier", "hosts", "version", "fit", "cutFrame", "windows", "duration", "loop", "fields", "companions", "requiredFonts", "variants", "aep", "preview", "poster"]
      },
      "properties": {
        "requiredFonts": { "type": "array", "items": { "$ref": "#/$defs/fontPinned" } },
        "variants": { "type": "array", "minItems": 1, "items": { "$ref": "#/$defs/variant" } },
        "aep": { "$ref": "#/$defs/stored" },
        "preview": { "$ref": "#/$defs/stored" },
        "poster": { "$ref": "#/$defs/stored" }
      }
    }
  }
}
```

- [ ] **Step 5: Создать валидатор `tools/library/validate.mjs`**

Ajv в строгом режиме с двумя послаблениями (комментарий в коде объясняет оба). Ошибки схемы и правил идут одним списком строк вида `<id>: <правило>: <что не так>`.

```js
#!/usr/bin/env node
// Validates library.src.json (source) and library.json (catalog): JSON Schema 2020-12 first,
// then the cross-field rules that a schema cannot express (spec 4.2, 4.4, 6.1).
//   node tools/library/validate.mjs docs/library/example.src.json
//   node tools/library/validate.mjs --catalog <library root>/library.json
// The kind is detected by libraryVersion (catalog only) unless --source or --catalog is given.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// Files written by PowerShell 5.1 may start with a BOM, which JSON.parse rejects.
const stripBom = (t) => (t.charCodeAt(0) === 0xfeff ? t.slice(1) : t);
const readJson = (p) => JSON.parse(stripBom(readFileSync(p, 'utf8')));
export const SRC_SCHEMA = readJson(path.join(here, 'schema', 'library.src.schema.json'));
export const CATALOG_SCHEMA = readJson(path.join(here, 'schema', 'library.schema.json'));

// strictRequired is off: "required" inside if/then names properties declared by the parent schema.
// allowUnionTypes: field defaults and switch values are unions (string | number | boolean | null).
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
ajv.addSchema(SRC_SCHEMA);
ajv.addSchema(CATALOG_SCHEMA);
const schemaFor = {
  source: ajv.getSchema(SRC_SCHEMA.$id),
  catalog: ajv.getSchema(CATALOG_SCHEMA.$id),
};

const ASPECTS = { '16x9': 16 / 9, '9x16': 9 / 16, '1x1': 1, '4x5': 4 / 5, '4x3': 4 / 3 };
const FILE_NAME = /^[A-Za-z0-9_-]+\.[a-z0-9]+$/;

export function detectKind(doc) {
  return doc && typeof doc === 'object' && 'libraryVersion' in doc ? 'catalog' : 'source';
}

function formatSchemaError(e) {
  const at = e.instancePath || '/';
  if (e.keyword === 'propertyNames') return `schema: ${at} unknown property "${e.params.propertyName}"`;
  if (e.keyword === 'additionalProperties') return `schema: ${at} unknown property "${e.params.additionalProperty}"`;
  return `schema: ${at} ${e.message}`;
}

function schemaErrors(doc, kind) {
  const validate = schemaFor[kind];
  if (validate(doc)) return [];
  // Errors inside propertyNames carry e.propertyName; the propertyNames error itself names the property.
  return [...new Set(validate.errors.filter((e) => e.propertyName === undefined).map(formatSchemaError))];
}

function checkItem(item, byId, kind, err) {
  const fields = item.fields || [];
  const variants = item.variants || [];
  const fieldByKey = new Map();
  for (const f of fields) {
    if (fieldByKey.has(f.key)) err('unique-keys', `field "${f.key}" is declared twice`);
    fieldByKey.set(f.key, f);
  }
  const variantByKey = new Map();
  for (const v of variants) {
    if (variantByKey.has(v.key)) err('unique-keys', `variant "${v.key}" is declared twice`);
    variantByKey.set(v.key, v);
  }

  // Values of switches used by variant options and window conditions.
  const checkSwitches = (where, values) => {
    for (const [k, val] of Object.entries(values || {})) {
      const f = fieldByKey.get(k);
      if (!f || (f.type !== 'dropdown' && f.type !== 'checkbox')) {
        err('switch-ref', `${where}: "${k}" is not a dropdown or checkbox field`);
      } else if (f.type === 'checkbox' && typeof val !== 'boolean') {
        err('switch-ref', `${where}: "${k}" needs true or false`);
      } else if (f.type === 'dropdown' && !(Number.isInteger(val) && val >= 1 && val <= f.options.length)) {
        err('switch-ref', `${where}: "${k}" needs an option index 1..${f.options.length}`);
      }
    }
  };

  // Fields.
  const driving = fields.filter((f) => f.drivesDuration);
  if (driving.length > 1) err('drives-duration', `${driving.length} fields drive the duration; at most one may`);
  const egpNames = new Set();
  for (const f of fields) {
    if (f.type === 'dropdown') {
      f.options.forEach((o, i) => {
        if (o.index !== i + 1) err('options-index', `field "${f.key}": options must be indexed 1..${f.options.length} in order`);
      });
    }
    if (f.drivesDuration && (f.type !== 'slider' || f.service)) {
      err('drives-duration', `field "${f.key}": only a visible slider can drive the duration`);
    }
    if (f.service) {
      if (f.editable !== false) err('service-field', `field "${f.key}": a service field must set "editable": false`);
      if (f.type !== 'slider') err('service-field', `field "${f.key}": a service field must be a slider`);
    }
    if (f.enabledBy !== undefined) {
      const g = fieldByKey.get(f.enabledBy);
      if (!g || g.type !== 'checkbox') err('enabled-by', `field "${f.key}": enabledBy "${f.enabledBy}" is not a checkbox field`);
    }
    if (f.hosts && f.hosts.some((h) => !item.hosts.includes(h))) {
      err('field-hosts', `field "${f.key}": hosts ${f.hosts.join(',')} are not all item hosts`);
    }
    if (item.tier === 'T1') {
      if (!f.egpName) err('egp-name', `field "${f.key}": a T1 field needs egpName`);
      else if (egpNames.has(f.egpName)) err('egp-name', `field "${f.key}": egpName "${f.egpName}" is used twice`);
      else egpNames.add(f.egpName);
    }
    if (f.type === 'slider' && !(f.min < f.max)) err('field-default', `field "${f.key}": min must be below max`);
    if (f.default !== undefined && f.default !== null) {
      const d = f.default;
      const bad =
        (f.type === 'text' && (typeof d !== 'string' || d.length > f.maxLen)) ||
        (f.type === 'checkbox' && typeof d !== 'boolean') ||
        (f.type === 'dropdown' && !(Number.isInteger(d) && d >= 1 && d <= f.options.length)) ||
        (f.type === 'slider' && !(typeof d === 'number' && d >= f.min && d <= f.max)) ||
        (f.type === 'media' && typeof d !== 'string');
      if (bad) err('field-default', `field "${f.key}": default ${JSON.stringify(d)} does not fit type ${f.type}`);
    }
    if (f.type === 'media' && f.accepts.includes('video') && item.fit !== 'trim') {
      err('media-fit', `field "${f.key}": a slot that accepts video makes the template fit "trim"`);
    }
  }

  // Variants.
  const aeComps = new Set();
  for (const v of variants) {
    if (v.aspect && v.w && v.h && Math.abs(v.w / v.h - ASPECTS[v.aspect]) / ASPECTS[v.aspect] > 0.01) {
      err('aspect', `variant "${v.key}": ${v.w}x${v.h} is not ${v.aspect}`);
    }
    checkSwitches(`variant "${v.key}" options`, v.options);
    if (item.tier === 'T1' && item.hosts.includes('ae')) {
      if (!v.aeComp) {
        err('ae-comp', `variant "${v.key}": an AE-capable variant needs aeComp`);
      } else {
        const versioned = /_v[0-9]+$/.test(v.aeComp);
        if (kind === 'source' && versioned) err('ae-comp', `variant "${v.key}": aeComp in the source has no _vN, the pipeline adds it`);
        if (kind === 'catalog' && !v.aeComp.endsWith('_v' + item.version)) err('ae-comp', `variant "${v.key}": aeComp must end with _v${item.version}`);
        if (aeComps.has(v.aeComp)) err('ae-comp', `variant "${v.key}": aeComp "${v.aeComp}" is used twice`);
        aeComps.add(v.aeComp);
      }
    }
    if (v.parts) {
      const frames = (p) => (Array.isArray(p) ? p[1] - p[0] : p.frames);
      if (kind === 'source') {
        for (const [name, r] of Object.entries(v.parts)) {
          if (!(r[0] < r[1])) err('parts', `variant "${v.key}": part ${name} needs from < to`);
        }
        const order = ['intro', 'loop', 'outro'].filter((n) => v.parts[n]);
        for (let i = 1; i < order.length; i += 1) {
          if (v.parts[order[i - 1]][1] !== v.parts[order[i]][0]) err('parts', `variant "${v.key}": ${order[i - 1]} and ${order[i]} must be contiguous`);
        }
      }
      if (item.loop && v.parts.loop && frames(v.parts.loop) !== item.loop.periodFrames) {
        err('loop', `variant "${v.key}": the loop part has ${frames(v.parts.loop)} frames, the period is ${item.loop.periodFrames}`);
      }
    }
  }
  if (item.loop && new Set(variants.map((v) => v.fps)).size > 1) {
    err('loop', 'a looped item needs one fps across its variants');
  }

  // Windows.
  for (const win of item.windows || []) {
    for (const r of win.rects) {
      const v = variantByKey.get(r.variant);
      if (!v) { err('windows', `window "${win.key}": no variant "${r.variant}"`); continue; }
      checkSwitches(`window "${win.key}" when`, r.when);
      if (v.w && v.h && (r.x < 0 || r.y < 0 || r.x + r.w > v.w || r.y + r.h > v.h)) {
        err('windows', `window "${win.key}": the rect leaves the ${v.w}x${v.h} frame of "${v.key}"`);
      }
    }
  }

  // Companions.
  for (const c of item.companions || []) {
    const ref = byId.get(c.ref);
    if (!ref || c.ref === item.id) { err('companion-ref', `companion "${c.ref}" does not exist`); continue; }
    if ((c.kind === 'music' || c.kind === 'sfx') && ref.category !== 'sounds') err('companion-kind', `companion "${c.ref}": ${c.kind} must be a sounds item`);
    if (c.kind === 'video' && (ref.tier === 'T1' || c.placement !== 'under')) err('companion-kind', `companion "${c.ref}": a video companion is T2/T3 and goes under`);
  }

  // Catalog files.
  if (kind === 'catalog') {
    const stored = [];
    for (const k of ['aep', 'preview', 'poster']) if (item[k]) stored.push(item[k].file);
    for (const v of variants) {
      if (v.file) stored.push(v.file);
      for (const p of Object.values(v.parts || {})) stored.push(p.file);
      if (item.tier === 'T1' && item.hosts.includes('pr') && !(v.file && v.file.endsWith('.mogrt'))) err('files', `variant "${v.key}": a Premiere T1 variant needs a .mogrt file`);
      if (item.tier === 'T2' && !v.file && !v.parts) err('files', `variant "${v.key}": a T2 variant needs a file or parts`);
    }
    if (item.tier === 'T1' && item.hosts.includes('ae') && !(item.aep && item.aep.file.endsWith('.aep'))) err('files', 'an AE T1 item needs its .aep');
    for (const f of stored) {
      const base = f.split('/').pop();
      if (base.length > 64 || !FILE_NAME.test(base)) err('file-name', `"${base}" must be ASCII [A-Za-z0-9_-] and at most 64 characters`);
    }
  }
}

export function crossCheck(doc, kind = detectKind(doc)) {
  const errors = [];
  const items = doc.items || [];
  const byId = new Map();
  for (const it of items) {
    if (byId.has(it.id)) errors.push(`${it.id}: unique-id: the id is used twice`);
    byId.set(it.id, it);
  }
  for (const it of items) checkItem(it, byId, kind, (rule, msg) => errors.push(`${it.id}: ${rule}: ${msg}`));
  return errors;
}

export function validateLibrary(doc, kind = detectKind(doc)) {
  const errors = schemaErrors(doc, kind);
  // Cross-field rules assume the shape is right, so they run only on a schema-valid document.
  if (!errors.length) errors.push(...crossCheck(doc, kind));
  return { ok: errors.length === 0, kind, errors };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const file = argv.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('usage: node tools/library/validate.mjs [--source|--catalog] <library.src.json|library.json>');
    process.exit(2);
  }
  const doc = readJson(file);
  const forced = argv.includes('--catalog') ? 'catalog' : argv.includes('--source') ? 'source' : undefined;
  const r = validateLibrary(doc, forced);
  if (r.ok) {
    console.log(`OK ${file}: ${r.kind}, ${doc.items.length} items`);
  } else {
    for (const e of r.errors) console.error(e);
    console.error(`FAIL ${file}: ${r.kind}, ${r.errors.length} errors`);
    process.exit(1);
  }
}
```

- [ ] **Step 6: Создать пример источника `docs/library/example.src.json`**

Четыре элемента: подпись спикера (T1, `rdt`, четыре формата), звук-компаньон к ней, экран вебинара (T1, `trim`, таймер с `drivesDuration`, слоты, служебная «Длительность») и его фон — T2-петля 30 с.

```json
{
  "$schema": "../../tools/library/schema/library.src.schema.json",
  "schemaVersion": 1,
  "items": [
    {
      "id": "TTL_LowerThird",
      "title_ru": "Подпись спикера",
      "category": "titles",
      "tier": "T1",
      "hosts": ["ae", "pr"],
      "version": 1,
      "fit": "rdt",
      "duration": { "introSec": 1, "holdSec": 4, "outroSec": 1 },
      "requiredFonts": [
        { "postScriptName": "SBSansText-Regular" },
        { "postScriptName": "SBSansDisplay-Regular" },
        { "postScriptName": "SBSansDisplay-Semibold" },
        { "postScriptName": "SBSansDisplay-Bold" }
      ],
      "fields": [
        { "key": "name", "label_ru": "Имя", "type": "text", "egpName": "Имя", "egpIndex": 0, "maxLen": 40, "default": "Имя Фамилия" },
        { "key": "role1", "label_ru": "Должность, строка 1", "type": "text", "egpName": "Должность 1", "egpIndex": 1, "maxLen": 50, "default": "Должность" },
        { "key": "role2", "label_ru": "Должность, строка 2", "type": "text", "egpName": "Должность 2", "egpIndex": 2, "maxLen": 50, "default": "" },
        {
          "key": "style", "label_ru": "Стиль", "type": "dropdown", "egpName": "Стиль", "egpIndex": 3, "default": 1,
          "options": [
            { "index": 1, "label_ru": "Титры" },
            { "index": 2, "label_ru": "Подкаст" },
            { "index": 3, "label_ru": "Вебинар" }
          ]
        },
        {
          "key": "side", "label_ru": "Сторона", "type": "dropdown", "egpName": "Сторона", "egpIndex": 4, "default": 1,
          "options": [
            { "index": 1, "label_ru": "Слева" },
            { "index": 2, "label_ru": "Справа" }
          ]
        }
      ],
      "variants": [
        { "key": "16x9", "aspect": "16x9", "w": 1920, "h": 1080, "fps": 25, "aeComp": "CR_TTL_LowerThird_16x9", "minHostVersion": { "ae": "26.0", "pr": "26.0" } },
        { "key": "16x9_4K", "aspect": "16x9", "w": 3840, "h": 2160, "fps": 25, "aeComp": "CR_TTL_LowerThird_16x9_4K", "minHostVersion": { "ae": "26.0", "pr": "26.0" } },
        { "key": "9x16", "aspect": "9x16", "w": 1080, "h": 1920, "fps": 25, "aeComp": "CR_TTL_LowerThird_9x16", "minHostVersion": { "ae": "26.0", "pr": "26.0" } },
        { "key": "1x1", "aspect": "1x1", "w": 1080, "h": 1080, "fps": 25, "aeComp": "CR_TTL_LowerThird_1x1", "minHostVersion": { "ae": "26.0", "pr": "26.0" } }
      ],
      "companions": [
        { "ref": "SFX_WhooshIn", "kind": "sfx", "placement": "in", "default": true }
      ]
    },
    {
      "id": "SFX_WhooshIn",
      "title_ru": "Звук входа плашки",
      "category": "sounds",
      "tier": "T3",
      "hosts": ["ae", "pr"],
      "version": 1,
      "variants": [{ "key": "wav" }]
    },
    {
      "id": "WEB_Screen",
      "title_ru": "Экран вебинара",
      "category": "webinars",
      "tier": "T1",
      "hosts": ["ae", "pr"],
      "version": 1,
      "fit": "trim",
      "duration": { "introSec": 0, "holdSec": 30, "outroSec": 5 },
      "requiredFonts": [
        { "postScriptName": "SBSansDisplay-Regular" },
        { "postScriptName": "SBSansDisplay-Semibold" }
      ],
      "fields": [
        {
          "key": "layout", "label_ru": "Раскладка", "type": "dropdown", "egpName": "Раскладка", "default": 1,
          "options": [
            { "index": 1, "label_ru": "С визуалом" },
            { "index": 2, "label_ru": "Со спикером" }
          ]
        },
        { "key": "timer", "label_ru": "Таймер", "type": "checkbox", "egpName": "Таймер", "default": false },
        { "key": "minutes", "label_ru": "Минуты до начала", "type": "slider", "egpName": "Минуты", "min": 1, "max": 15, "default": 5, "drivesDuration": true, "unitSec": 60, "enabledBy": "timer" },
        { "key": "title", "label_ru": "Заголовок", "type": "text", "egpName": "Заголовок", "maxLen": 80, "default": "Название вебинара" },
        { "key": "speaker", "label_ru": "Спикер", "type": "text", "egpName": "Спикер", "maxLen": 60, "default": "Имя Фамилия" },
        { "key": "visual", "label_ru": "Визуал", "type": "media", "egpName": "Визуал", "accepts": ["photo", "video"], "hosts": ["ae"] },
        { "key": "qr", "label_ru": "QR-код", "type": "media", "egpName": "QR", "accepts": ["qr"], "hosts": ["ae"] },
        { "key": "duration", "label_ru": "Длительность", "type": "slider", "egpName": "Длительность (служебное, не менять)", "min": 1, "max": 1000, "service": true, "editable": false }
      ],
      "variants": [
        { "key": "16x9", "aspect": "16x9", "w": 1920, "h": 1080, "fps": 25, "aeComp": "CR_WEB_Screen_16x9", "minHostVersion": { "ae": "26.0", "pr": "26.0" } },
        { "key": "16x9_4K", "aspect": "16x9", "w": 3840, "h": 2160, "fps": 25, "aeComp": "CR_WEB_Screen_16x9_4K", "minHostVersion": { "ae": "26.0", "pr": "26.0" } }
      ],
      "companions": [
        { "ref": "BG_WebinarPortal", "kind": "video", "placement": "under", "default": true }
      ]
    },
    {
      "id": "BG_WebinarPortal",
      "title_ru": "Фон экрана вебинара, петля 30 с",
      "category": "webinars",
      "tier": "T2",
      "hosts": ["ae", "pr"],
      "version": 1,
      "loop": { "periodFrames": 750 },
      "variants": [
        { "key": "16x9", "aspect": "16x9", "w": 1920, "h": 1080, "fps": 25, "parts": { "loop": [0, 750] } },
        { "key": "16x9_4K", "aspect": "16x9", "w": 3840, "h": 2160, "fps": 25, "parts": { "loop": [0, 750] } }
      ]
    }
  ]
}
```

- [ ] **Step 7: Запустить тесты и валидатор на примере**

Run: `npx vitest run tests/tools/library-validate.test.mjs`
Expected: `26 passed`.

Run: `node tools/library/validate.mjs docs/library/example.src.json`
Expected: `OK docs/library/example.src.json: source, 4 items`.

- [ ] **Step 8: Commit**

```bash
git add tools/library/schema/library.src.schema.json tools/library/schema/library.schema.json tools/library/validate.mjs docs/library/example.src.json tests/tools/library-validate.test.mjs
git commit -m "feat(library): library.json schemas and validator" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 23: Оценка веса библиотеки и черновая матрица T2

Вес для D24 (spec §4.4 «Вес»). Мегабайты строки = битрейт кодека × (пиксели формата / пиксели 1920×1080) × секунды × копии × коэффициент. Коэффициент < 1 — у почти статичных кадров, где замер пакета показал меньший битрейт; у плотных паттернов он 1.

**Битрейты по умолчанию** (МБ/с на 1920×1080):
- ProRes 4444 — 15: spec §4.4; фоны SMM в пакете 12,6–17,1 МБ/с при 1440×1440 (`media_inventory.txt`).
- PNG в MOV — 2,5: стенд кодеков 1,7–2,4 МБ/с на 2 Мп (`research_distribution_assets.json`).

**Замеры S11 (часть E, задача 21).** Файл `workPath('s11', 'bitrates.json')`: `codecs.prores_ae`, `codecs.prores_ks`, `codecs.png`, у каждого `mean` и `max` в МБ/с на мегапиксель при 25 fps. Оценка берёт `max`: `prores_ae` (поток рендера AE без перекодирования) — для ProRes 4444, `png` — для PNG в MOV. Ручную поправку можно передать флагом `--bitrates` файлом вида `{ "prores4444": { "mbPerSec": 15.9, "atPixels": 2073600 } }`.

**Матрица** `docs/decisions/t2-matrix.draft.json` — элементы T2 из spec §5: фоны (стрелки, плюсы, стеллаж), рамка SMM, дрейф рамки лекции 60 с, фон экрана вебинара 30 с, переходы (ступени и полосы × цвета × логотип), интро и аутро подкаста, предрендеры подписей логошота. Форматы по spec §4.3: 16:9 FHD, 9:16, 1:1 — в установке по умолчанию; 16:9 4K — отдельной опцией (D24). 4:5 и 4:3 — по запросу, в оценку не входят. Отдельно грубо посчитаны MOGRT, `.aep`, превью, звуки, стиллы и пресеты.

**Files:**
- Create: `tools/library/estimate-weight.mjs`, `docs/decisions/t2-matrix.draft.json`, `docs/decisions/weight-estimate.md`, `docs/decisions/weight-estimate-png.md`
- Test: `tests/tools/estimate-weight.test.mjs`

- [ ] **Step 1: Написать падающий тест `tests/tools/estimate-weight.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_RATES, FORMATS, mbFor, estimate, normalizeRates, renderMarkdown } from '../../tools/library/estimate-weight.mjs';

const rates = { prores4444: { mbPerSec: 15, atPixels: 1920 * 1080 }, png_mov: { mbPerSec: 2.5, atPixels: 1920 * 1080 } };
const row = (extra) => ({ id: 'BG_X', title_ru: 'Фон', codec: 'prores4444', seconds: 10, formats: ['16x9'], ...extra });

describe('estimate-weight', () => {
  it('scales the rate with seconds, copies, pixels and the content factor', () => {
    expect(mbFor({ format: '16x9', seconds: 10, codec: 'prores4444' }, rates)).toBeCloseTo(150);
    expect(mbFor({ format: '16x9_4K', seconds: 10, codec: 'prores4444' }, rates)).toBeCloseTo(600);
    expect(mbFor({ format: '1x1', seconds: 10, copies: 3, codec: 'prores4444', rateFactor: 0.5 }, rates)).toBeCloseTo(15 * (1080 * 1080) / (1920 * 1080) * 10 * 3 * 0.5);
  });
  it('splits the default install and the optional extra', () => {
    const r = estimate({ items: [row({ optionalFormats: ['16x9_4K'] }), row({ id: 'BG_Y', optional: true })] }, rates);
    expect(r.rows[0].defaultMB).toBeCloseTo(150);
    expect(r.rows[0].optionalMB).toBeCloseTo(600);
    expect(r.rows[1].defaultMB).toBe(0);
    expect(r.rows[1].optionalMB).toBeCloseTo(150);
    expect(r.totals.defaultMB).toBeCloseTo(150);
    expect(r.totals.fullMB).toBeCloseTo(900);
  });
  it('adds fixed extras and can override the codec of every row', () => {
    const r = estimate({ items: [row()], extras: [{ title_ru: 'MOGRT', count: 10, mbEach: 3 }] }, rates, { codec: 'png_mov' });
    expect(r.rows[0].codec).toBe('png_mov');
    expect(r.totals.defaultMB).toBeCloseTo(25 + 30);
  });
  it('rejects unknown codecs and formats', () => {
    expect(() => estimate({ items: [row({ codec: 'hap' })] }, rates)).toThrow(/unknown codec hap/);
    expect(() => estimate({ items: [row({ formats: ['21x9'] })] }, rates)).toThrow(/unknown format 21x9/);
  });
  it('reads the S11 table: max MB/s per megapixel, prores_ae for ProRes 4444, png for PNG in MOV', () => {
    const r = normalizeRates({
      spike: 'S11', date: '2026-10-05', platform: 'win32', unit: 'MB/s per megapixel at 25 fps (MB = 10^6 bytes)',
      codecs: {
        prores_ae: { mean: 6, max: 7.5, samples: [] },
        prores_ks: { mean: 9, max: 10, samples: [] },
        png: { mean: 1, max: 1.25, samples: [] },
      },
    });
    expect(Object.keys(r)).toEqual(['prores4444', 'png_mov']);
    expect(r.prores4444.mbPerSec).toBeCloseTo(7.5 * 2.0736);
    expect(r.png_mov.mbPerSec).toBeCloseTo(1.25 * 2.0736);
    expect(normalizeRates({ codecs: { png: { mean: null, max: null, samples: [] } } })).toEqual({});
  });
  it('accepts a hand-made override and rejects a bad one', () => {
    expect(normalizeRates({ prores4444: { mbPerSec: 16, atPixels: 2073600 } }).prores4444.mbPerSec).toBe(16);
    expect(() => normalizeRates({ prores4444: { mbPerSec: 0 } })).toThrow(/bad rate/);
  });
  it('renders totals in GB and a row per item', () => {
    const md = renderMarkdown(estimate({ items: [row({ optionalFormats: ['16x9_4K'] })] }, rates), { rates: DEFAULT_RATES });
    expect(md).toContain('- **Установка по умолчанию:** 0,15 ГБ');
    expect(md).toContain('- **Полный дистрибутив:** 0,75 ГБ');
    expect(md).toContain('| Фон (`BG_X`) | prores4444 | 10 | 1 | 1 | 16x9 | 150 | 16x9_4K | 600 |');
    expect(renderMarkdown(estimate({ items: [row()] }, rates, { codec: 'png_mov' }), { codec: 'png_mov' })).toContain('кодеке png_mov (--codec)');
  });
  it('accepts the draft T2 matrix', () => {
    const matrix = JSON.parse(readFileSync(new URL('../../docs/decisions/t2-matrix.draft.json', import.meta.url), 'utf8'));
    expect(matrix.status).toBe('draft');
    const r = estimate(matrix, DEFAULT_RATES);
    expect(r.rows.map((x) => x.id)).toEqual([
      'BG_Arrows', 'BG_Plus', 'BG_Rack', 'SMM_FrameNotched', 'CRS_LectureDrift', 'WEB_PortalBG',
      'TRN_Stairs', 'TRN_Bars', 'POD_Intro', 'POD_Outro', 'LOGO_SloganPrerenders',
    ]);
    for (const it of matrix.items) for (const f of it.formats.concat(it.optionalFormats)) expect(Object.keys(FORMATS)).toContain(f);
    expect(r.totals.defaultMB).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run tests/tools/estimate-weight.test.mjs`
Expected: FAIL — `Cannot find module '../../tools/library/estimate-weight.mjs'`.

- [ ] **Step 3: Создать `tools/library/estimate-weight.mjs`**

```js
#!/usr/bin/env node
// Library weight estimate for D24 (spec 4.4 "Вес"): the T2 matrix times bitrates gives megabytes
// for the default install and for the optional extra (4K loops, rare formats).
//   node tools/library/estimate-weight.mjs [--matrix docs/decisions/t2-matrix.draft.json]
//        [--bitrates <file>] [--codec png_mov] [--out docs/decisions/weight-estimate.md]
// Bitrates: built-in defaults below, replaced by workPath('s11', 'bitrates.json') once S11 has
// written it, or by --bitrates. Sizes are decimal: 1 MB = 1e6 bytes, 1 GB = 1e9 bytes.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workPath } from '../lib/work.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');
const REF_PIXELS = 1920 * 1080; // 2,073,600 px; 1440x1440 SMM frames have the same count

export const FORMATS = {
  '16x9': [1920, 1080],
  '16x9_4K': [3840, 2160],
  '9x16': [1080, 1920],
  '1x1': [1080, 1080],
  '4x5': [1080, 1350],
  '4x3': [1440, 1080],
};

// MB/s at REF_PIXELS; the rate scales linearly with the pixel count (spec 4.4: 4K is up to 4x).
export const DEFAULT_RATES = {
  prores4444: {
    mbPerSec: 15,
    atPixels: REF_PIXELS,
    source: 'spec 4.4; SMM BG_pattern renders 12.6-17.1 MB/s at 1440x1440 (docs/research/2026-10-02/media_inventory.txt)',
  },
  png_mov: {
    mbPerSec: 2.5,
    atPixels: REF_PIXELS,
    source: 'codec bench (research_distribution_assets.json): PNG in MOV 1.7-2.4 MB/s at about 2 Mpx; S11 replaces it',
  },
};

const stripBom = (t) => (t.charCodeAt(0) === 0xfeff ? t.slice(1) : t);
const readJson = (p) => JSON.parse(stripBom(readFileSync(p, 'utf8')));

// The S11 table (part E): { date, platform, unit, codecs: { prores_ae, prores_ks, png } }, each codec with
// mean and max in MB/s per megapixel at 25 fps. The max is used: prores_ae (stream copy of the AE render)
// stands for ProRes 4444, png for PNG in MOV. A hand-made override { codec: { mbPerSec, atPixels } } also works.
const S11_CODECS = { prores4444: 'prores_ae', png_mov: 'png' };

export function normalizeRates(raw) {
  const out = {};
  if (raw && raw.codecs && typeof raw.codecs === 'object') {
    for (const [codec, key] of Object.entries(S11_CODECS)) {
      const c = raw.codecs[key];
      if (c && c.max > 0) {
        out[codec] = {
          mbPerSec: c.max * (REF_PIXELS / 1e6),
          atPixels: REF_PIXELS,
          source: `S11 ${key}: max ${c.max} MB/s per Mpx (${raw.date || 'no date'}, ${raw.platform || 'no platform'})`,
        };
      }
    }
    return out;
  }
  for (const [codec, r] of Object.entries(raw || {})) {
    if (!(r && r.mbPerSec > 0 && r.atPixels > 0)) throw new Error(`bad rate for ${codec}: ${JSON.stringify(r)}`);
    out[codec] = { mbPerSec: r.mbPerSec, atPixels: r.atPixels, source: r.source || 'override' };
  }
  return out;
}

export function loadRates(bitratesPath) {
  const file = bitratesPath || workPath('s11', 'bitrates.json');
  if (!existsSync(file)) {
    if (bitratesPath) throw new Error('bitrates file not found: ' + bitratesPath);
    return { rates: { ...DEFAULT_RATES }, from: 'built-in defaults' };
  }
  return { rates: { ...DEFAULT_RATES, ...normalizeRates(readJson(file)) }, from: file };
}

export function mbFor({ format, seconds, copies = 1, codec, rateFactor = 1 }, rates, sizes = FORMATS) {
  const size = sizes[format];
  if (!size) throw new Error(`unknown format ${format} (known: ${Object.keys(sizes).join(', ')})`);
  const rate = rates[codec];
  if (!rate) throw new Error(`unknown codec ${codec} (known: ${Object.keys(rates).join(', ')})`);
  return rate.mbPerSec * ((size[0] * size[1]) / rate.atPixels) * seconds * copies * rateFactor;
}

// codec: optional override for every row, to compare ProRes 4444 with PNG in MOV (S11).
export function estimate(matrix, rates, { codec } = {}) {
  const sizes = { ...FORMATS, ...(matrix.sizes || {}) };
  const rows = [];
  for (const item of matrix.items) {
    const it = codec ? { ...item, codec } : item;
    const each = (format) => mbFor({ ...it, format }, rates, sizes);
    const main = it.optional ? [] : it.formats;
    const extra = it.optional ? it.formats.concat(it.optionalFormats || []) : it.optionalFormats || [];
    rows.push({
      id: it.id,
      title_ru: it.title_ru,
      codec: it.codec,
      seconds: it.seconds,
      copies: it.copies || 1,
      rateFactor: it.rateFactor || 1,
      defaultFormats: main,
      optionalFormats: extra,
      defaultMB: main.reduce((s, f) => s + each(f), 0),
      optionalMB: extra.reduce((s, f) => s + each(f), 0),
    });
  }
  const extras = (matrix.extras || []).map((x) => ({
    title_ru: x.title_ru,
    defaultMB: x.optional ? 0 : x.count * x.mbEach,
    optionalMB: x.optional ? x.count * x.mbEach : 0,
  }));
  const sum = (key) => rows.concat(extras).reduce((s, r) => s + r[key], 0);
  const defaultMB = sum('defaultMB');
  const optionalMB = sum('optionalMB');
  return { rows, extras, totals: { defaultMB, optionalMB, fullMB: defaultMB + optionalMB } };
}

const mb = (x) => String(Math.round(x));
const gb = (x) => (x / 1000).toFixed(2).replace('.', ',');

export function renderMarkdown(result, { matrixFile = '', ratesFrom = '', rates = {}, codec } = {}) {
  const t = result.totals;
  const lines = [
    '# Оценка веса библиотеки (D24)',
    '',
    `Собрано командой \`node tools/library/estimate-weight.mjs\`; матрица: \`${matrixFile}\`; битрейты: ${ratesFrom}. МБ и ГБ десятичные.`,
    '',
  ];
  if (codec) lines.push(`Сценарий: все строки в кодеке ${codec} (--codec).`, '');
  lines.push(
    `- **Установка по умолчанию:** ${gb(t.defaultMB)} ГБ`,
    `- **Отдельная опция (4K и редкие форматы):** ${gb(t.optionalMB)} ГБ`,
    `- **Полный дистрибутив:** ${gb(t.fullMB)} ГБ`,
    '',
    '| Элемент | Кодек | Сек | Копий | Коэф. | Форматы по умолчанию | МБ | Форматы опции | МБ |',
    '|---|---|---|---|---|---|---|---|---|',
  );
  for (const r of result.rows) {
    lines.push(`| ${r.title_ru} (\`${r.id}\`) | ${r.codec} | ${r.seconds} | ${r.copies} | ${r.rateFactor} | ` +
      `${r.defaultFormats.join(', ') || '—'} | ${mb(r.defaultMB)} | ${r.optionalFormats.join(', ') || '—'} | ${mb(r.optionalMB)} |`);
  }
  for (const x of result.extras) {
    lines.push(`| ${x.title_ru} | — | — | — | — | — | ${mb(x.defaultMB)} | — | ${mb(x.optionalMB)} |`);
  }
  lines.push(`| **Итого** | | | | | | **${mb(t.defaultMB)}** | | **${mb(t.optionalMB)}** |`);
  lines.push('', '| Кодек | МБ/с на 1920×1080 | Источник |', '|---|---|---|');
  for (const [codec, r] of Object.entries(rates)) {
    lines.push(`| ${codec} | ${((r.mbPerSec * REF_PIXELS) / r.atPixels).toFixed(1)} | ${r.source} |`);
  }
  return lines.join('\n') + '\n';
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const val = (f) => { const i = argv.indexOf(f); return i === -1 ? undefined : argv[i + 1]; };
  const matrixFile = val('--matrix') || path.join(REPO, 'docs', 'decisions', 't2-matrix.draft.json');
  try {
    const { rates, from } = loadRates(val('--bitrates'));
    const codec = val('--codec');
    const result = estimate(readJson(matrixFile), rates, { codec });
    const md = renderMarkdown(result, { matrixFile: path.relative(REPO, matrixFile).replace(/\\/g, '/'), ratesFrom: from, rates, codec });
    const out = val('--out');
    if (out) {
      writeFileSync(out, md, 'utf8');
      console.log(`written ${out}: default ${gb(result.totals.defaultMB)} GB, optional ${gb(result.totals.optionalMB)} GB`);
    } else {
      process.stdout.write(md);
    }
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
}
```

- [ ] **Step 4: Создать черновую матрицу `docs/decisions/t2-matrix.draft.json`**

В `basis_ru` у каждой строки — откуда взяты длительность, число копий и коэффициент.

```json
{
  "status": "draft",
  "note_ru": "Черновик матрицы T2 для D24. Длительности — минимальные бесшовные периоды по аудиту пакетов (spec §4.1: 10–15 с, дрейф рамки лекции 60 с, портал вебинара 30 с). copies — число вариантов опций (цвет, логотип, подпись, раскладка). rateFactor — поправка к битрейту для почти статичных кадров по замерам пакета; у плотных паттернов 1. Форматы по spec §4.3: 16:9 FHD, 9:16, 1:1 в установке по умолчанию, 16:9 4K — отдельной опцией (D24); 4:5 и 4:3 делаются по запросу и не считаются.",
  "items": [
    {
      "id": "BG_Arrows",
      "title_ru": "Фон «стрелки», петля",
      "codec": "prores4444",
      "seconds": 15,
      "copies": 1,
      "rateFactor": 1,
      "formats": ["16x9", "9x16", "1x1"],
      "optionalFormats": ["16x9_4K"],
      "basis_ru": "spec §5 «Фоны»; SMM BG_pattern_*_1, рендер 30 с не бесшовный — петля 15 с"
    },
    {
      "id": "BG_Plus",
      "title_ru": "Фон «плюсы», петля",
      "codec": "prores4444",
      "seconds": 10,
      "copies": 1,
      "rateFactor": 1,
      "formats": ["16x9", "9x16", "1x1"],
      "optionalFormats": ["16x9_4K"],
      "basis_ru": "spec §5 «Фоны»; аудит SMM: Evolution = time*144 даёт бесшовные 10 с"
    },
    {
      "id": "BG_Rack",
      "title_ru": "Фон «стеллаж», петля",
      "codec": "prores4444",
      "seconds": 10,
      "copies": 1,
      "rateFactor": 1,
      "formats": ["16x9", "9x16", "1x1"],
      "optionalFormats": ["16x9_4K"],
      "basis_ru": "spec §5 «Фоны»; PATTERN RACK вебинаров, период не измерен — нижняя граница 10 с"
    },
    {
      "id": "SMM_FrameNotched",
      "title_ru": "SMM: рамка с вырезами, петля",
      "codec": "prores4444",
      "seconds": 15,
      "copies": 3,
      "rateFactor": 0.15,
      "formats": ["1x1", "9x16", "16x9"],
      "optionalFormats": [],
      "basis_ru": "spec §5 «SMM»; 3 цвета (#222222, #26D07C, #FFFFFF); Оверлей_1x1.mov 2,0 МБ/с против 15,8 у фона — коэф. 0,15"
    },
    {
      "id": "CRS_LectureDrift",
      "title_ru": "Курсы: дрейф рамки лекции, петля 60 с",
      "codec": "prores4444",
      "seconds": 60,
      "copies": 3,
      "rateFactor": 0.5,
      "formats": ["16x9"],
      "optionalFormats": ["16x9_4K"],
      "basis_ru": "spec §5, D9; 3 раскладки (16:9, 3:2, со спикером); оверлей курсов 7,1 МБ/с — коэф. 0,5. Если блоки дрейфа не зависят от раскладки, copies = 1"
    },
    {
      "id": "WEB_PortalBG",
      "title_ru": "Вебинары: фон экрана (портал), петля 30 с",
      "codec": "prores4444",
      "seconds": 30,
      "copies": 2,
      "rateFactor": 1,
      "formats": ["16x9"],
      "optionalFormats": ["16x9_4K"],
      "basis_ru": "spec §4.1, §5; 2 раскладки (с визуалом, со спикером); замера нет — коэф. 1"
    },
    {
      "id": "TRN_Stairs",
      "title_ru": "Переход «ступенчатая шторка»",
      "codec": "prores4444",
      "seconds": 2.04,
      "copies": 3,
      "rateFactor": 1,
      "formats": ["16x9", "9x16", "1x1"],
      "optionalFormats": ["16x9_4K"],
      "basis_ru": "spec §5 «Переходы»; Переход.mov 2,04 с; цвета — предположение 3 (#26D07C, #222222, #FFFFFF)"
    },
    {
      "id": "TRN_Bars",
      "title_ru": "Переход «шторка-полосы»",
      "codec": "prores4444",
      "seconds": 1.04,
      "copies": 6,
      "rateFactor": 1,
      "formats": ["16x9", "9x16", "1x1"],
      "optionalFormats": ["16x9_4K"],
      "basis_ru": "spec §5; 3 цвета × с логотипом и без; 26 кадров при 25 fps"
    },
    {
      "id": "POD_Intro",
      "title_ru": "Подкаст: интро",
      "codec": "prores4444",
      "seconds": 7,
      "copies": 1,
      "rateFactor": 0.5,
      "formats": ["16x9", "9x16"],
      "optionalFormats": ["16x9_4K"],
      "basis_ru": "spec §5 «Подкаст»; Заставка 4K 24,9 МБ/с = 6,2 МБ/с на 2 Мп — коэф. 0,5"
    },
    {
      "id": "POD_Outro",
      "title_ru": "Подкаст: аутро",
      "codec": "prores4444",
      "seconds": 10,
      "copies": 1,
      "rateFactor": 0.1,
      "formats": ["16x9", "9x16"],
      "optionalFormats": ["16x9_4K"],
      "basis_ru": "OUTRO.mov 4K 5,1 МБ/с = 1,3 МБ/с на 2 Мп — коэф. 0,1"
    },
    {
      "id": "LOGO_SloganPrerenders",
      "title_ru": "Логошот: предрендеры фиксированных подписей",
      "codec": "prores4444",
      "seconds": 5,
      "copies": 6,
      "rateFactor": 0.25,
      "formats": ["16x9", "9x16"],
      "optionalFormats": ["16x9_4K"],
      "basis_ru": "spec §5, D5: 3 подписи × 2 темы; 5 с (рабочая область логошота 0–5,02 с); плоская графика — коэф. 0,25"
    }
  ],
  "extras": [
    { "title_ru": "MOGRT: ~100 файлов по ~3 МБ (оценка без замера)", "count": 100, "mbEach": 3 },
    { "title_ru": "Одноэлементные .aep: ~25 по ~3 МБ", "count": 25, "mbEach": 3 },
    { "title_ru": "Превью 480 px MP4 и постеры: ~60 по ~1,5 МБ", "count": 60, "mbEach": 1.5 },
    { "title_ru": "Звуки WAV: ~30 по ~2 МБ", "count": 30, "mbEach": 2 },
    { "title_ru": "Стиллы SVG/PNG: ~60 по ~0,5 МБ", "count": 60, "mbEach": 0.5 },
    { "title_ru": "Пресеты .ffx, .epr, .aom и CR_Templates.prproj", "count": 1, "mbEach": 5 }
  ]
}
```

- [ ] **Step 5: Запустить тесты**

Run: `npx vitest run tests/tools/estimate-weight.test.mjs`
Expected: `8 passed`.

- [ ] **Step 6: Собрать оценку в двух кодеках**

Run: `node tools/library/estimate-weight.mjs --out docs/decisions/weight-estimate.md`
Expected (встроенные битрейты): `written docs/decisions/weight-estimate.md: default 5,25 GB, optional 12,56 GB`.

Run: `node tools/library/estimate-weight.mjs --codec png_mov --out docs/decisions/weight-estimate-png.md`
Expected: `written docs/decisions/weight-estimate-png.md: default 1,34 GB, optional 2,09 GB`.

Если S11 уже записала `C:/CRBK/work/s11/bitrates.json`, числа будут другими, а в строке «битрейты» файла будет путь к замерам; тогда поправить черновую оценку в строке D24 листа решений (задача 27). Самые тяжёлые строки черновика — дрейф рамки лекции (1,35 ГБ) и фон вебинара (0,9 ГБ); это первые кандидаты на сокращение в D24.

- [ ] **Step 7: Commit**

```bash
git add tools/library/estimate-weight.mjs docs/decisions/t2-matrix.draft.json docs/decisions/weight-estimate.md docs/decisions/weight-estimate-png.md tests/tools/estimate-weight.test.mjs
git commit -m "feat(library): weight estimate and draft T2 matrix" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 24: Версии шрифтов из таблицы `name` и скан SB Sans

Premiere не умеет перечислять шрифты из скрипта, поэтому панель будет проверять их сама (spec §6, §8.1): Node читает таблицу `name` файла шрифта. Здесь — читалка и сканер; на этой машине он записывает сборки SB Sans для D16 и `brand/tokens.json`.

Имени файла верить нельзя. На этой машине `SBSansDisplay-SemiBold.otf` содержит PostScript-имя `SBSansDisplay-Semibold` (ae-quirks 187), а файлы `SBSansUI-*.otf` — `SBSansInterface-*`.

**Files:**
- Create: `tests/helpers/make-font.mjs`, `tools/fonts/opentype-name.mjs`, `tools/fonts/scan-fonts.mjs`, `docs/decisions/fonts-this-pc.json`
- Test: `tests/tools/opentype-name.test.mjs`, `tests/tools/scan-fonts.test.mjs`

- [ ] **Step 1: Создать сборщик тестового шрифта `tests/helpers/make-font.mjs`**

Минимальный sfnt в памяти: заголовок, одна запись таблиц (`name`) и таблица `name` формата 0. Файл не тест: vitest берёт только `*.test.mjs`.

```js
// Builds a minimal sfnt font in memory for tests: offset table, one table record ('name') and a
// format-0 name table. `base` shifts table offsets when the font sits inside a TTC collection.
export function utf16be(text) {
  return Buffer.from(text, 'utf16le').swap16();
}

export function makeFont({ sfnt = 'OTTO', names = [], base = 0 } = {}) {
  const records = names.map((n) => ({
    ...n,
    bytes: n.bytes || (n.platformID === 1 ? Buffer.from(n.text, 'latin1') : utf16be(n.text)),
  }));
  const header = 6 + 12 * records.length;
  const storage = Buffer.concat(records.map((r) => r.bytes));
  const name = Buffer.alloc(header + storage.length);
  name.writeUInt16BE(0, 0); // format 0
  name.writeUInt16BE(records.length, 2);
  name.writeUInt16BE(header, 4); // offset of the string storage
  let off = 0;
  records.forEach((r, i) => {
    const p = 6 + 12 * i;
    name.writeUInt16BE(r.platformID, p);
    name.writeUInt16BE(r.encodingID, p + 2);
    name.writeUInt16BE(r.languageID, p + 4);
    name.writeUInt16BE(r.nameID, p + 6);
    name.writeUInt16BE(r.bytes.length, p + 8);
    name.writeUInt16BE(off, p + 10);
    off += r.bytes.length;
  });
  storage.copy(name, header);
  const dir = Buffer.alloc(12 + 16);
  if (sfnt === 'OTTO') dir.write('OTTO', 0, 'latin1');
  else dir.writeUInt32BE(0x00010000, 0);
  dir.writeUInt16BE(1, 4); // numTables
  dir.write('name', 12, 'latin1');
  dir.writeUInt32BE(0, 16); // checksum, not checked by the reader
  dir.writeUInt32BE(base + 28, 20); // offset of the name table from the start of the file
  dir.writeUInt32BE(name.length, 24);
  return Buffer.concat([dir, name]);
}

export function makeTtc(font) {
  const head = Buffer.alloc(16);
  head.write('ttcf', 0, 'latin1');
  head.writeUInt32BE(0x00010000, 4);
  head.writeUInt32BE(1, 8); // numFonts
  head.writeUInt32BE(16, 12); // offset of font 0
  return Buffer.concat([head, font]);
}

export const win = (nameID, text, languageID = 0x0409) => ({ platformID: 3, encodingID: 1, languageID, nameID, text });
export const mac = (nameID, text) => ({ platformID: 1, encodingID: 0, languageID: 0, nameID, text });
export const sbFont = (postScriptName, version) =>
  makeFont({ names: [win(1, 'SB Sans'), win(5, 'Version ' + version), win(6, postScriptName)] });
```

- [ ] **Step 2: Написать падающий тест `tests/tools/opentype-name.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { readNames, decodeMacRoman } from '../../tools/fonts/opentype-name.mjs';
import { makeFont, makeTtc, win, mac } from '../helpers/make-font.mjs';

describe('opentype name table', () => {
  it('reads the PostScript name and the version from Windows records', () => {
    const r = readNames(makeFont({ names: [win(1, 'SB Sans Display Semibold'), win(5, 'Version 1.002'), win(6, 'SBSansDisplay-Semibold')] }));
    expect(r.postScriptName).toBe('SBSansDisplay-Semibold');
    expect(r.version).toBe('Version 1.002');
    expect(r.versionNumber).toBe('1.002');
    expect(r.family).toBe('SB Sans Display Semibold');
  });
  it('reads Mac Roman records when there is no Windows record', () => {
    const cafe = { platformID: 1, encodingID: 0, languageID: 0, nameID: 1, bytes: Buffer.from([0x43, 0x61, 0x66, 0x8e]) };
    const r = readNames(makeFont({ names: [mac(5, 'Version 1.000'), mac(6, 'SBSansText-Regular'), cafe] }));
    expect(r.postScriptName).toBe('SBSansText-Regular');
    expect(r.versionNumber).toBe('1.000');
    expect(r.family).toBe('Caf' + String.fromCharCode(0xe9));
  });
  it('prefers Windows English over other Windows languages and over Mac', () => {
    const r = readNames(makeFont({ names: [mac(6, 'FromMac'), win(6, 'FromRu', 0x0419), win(6, 'FromEn')] }));
    expect(r.postScriptName).toBe('FromEn');
  });
  it('accepts the TrueType header and a TTC collection', () => {
    expect(readNames(makeFont({ sfnt: 'truetype', names: [win(6, 'TT')] })).postScriptName).toBe('TT');
    expect(readNames(makeTtc(makeFont({ base: 16, names: [win(6, 'InTtc')] }))).postScriptName).toBe('InTtc');
  });
  it('returns null for names the font does not have', () => {
    const r = readNames(makeFont({ names: [win(6, 'OnlyPs')] }));
    expect(r.version).toBeNull();
    expect(r.versionNumber).toBeNull();
  });
  it('rejects files that are not fonts', () => {
    expect(() => readNames(Buffer.from('this is not a font file at all'))).toThrow(/not an sfnt/);
    expect(() => readNames(Buffer.from('tiny'))).toThrow(/too short/);
  });
  it('decodes Mac Roman high bytes', () => {
    expect(decodeMacRoman(Buffer.from([0x80, 0xa5, 0xdb]))).toBe(String.fromCharCode(0xc4, 0x2022, 0x20ac));
  });
});
```

- [ ] **Step 3: Убедиться, что тест падает**

Run: `npx vitest run tests/tools/opentype-name.test.mjs`
Expected: FAIL — `Cannot find module '../../tools/fonts/opentype-name.mjs'`.

- [ ] **Step 4: Создать `tools/fonts/opentype-name.mjs`**

```js
// Reads names from an OpenType/TrueType font file: the sfnt table directory and the 'name' table.
// nameID 5 is the version string ("Version 1.002"), nameID 6 the PostScript name.
// Platform 3 (Windows) and platform 0 (Unicode) strings are UTF-16BE; platform 1 (Mac) encoding 0
// is Mac Roman. Spec: https://learn.microsoft.com/typography/opentype/spec/name
import { readFileSync } from 'node:fs';

export const NAME_IDS = { family: 1, subfamily: 2, fullName: 4, version: 5, postScriptName: 6, typoFamily: 16, typoSubfamily: 17 };

// Mac OS Roman, bytes 0x80..0xFF (Unicode's ROMAN.TXT mapping).
const MAC_ROMAN_HIGH = [
  0x00c4, 0x00c5, 0x00c7, 0x00c9, 0x00d1, 0x00d6, 0x00dc, 0x00e1, 0x00e0, 0x00e2, 0x00e4, 0x00e3, 0x00e5, 0x00e7, 0x00e9, 0x00e8,
  0x00ea, 0x00eb, 0x00ed, 0x00ec, 0x00ee, 0x00ef, 0x00f1, 0x00f3, 0x00f2, 0x00f4, 0x00f6, 0x00f5, 0x00fa, 0x00f9, 0x00fb, 0x00fc,
  0x2020, 0x00b0, 0x00a2, 0x00a3, 0x00a7, 0x2022, 0x00b6, 0x00df, 0x00ae, 0x00a9, 0x2122, 0x00b4, 0x00a8, 0x2260, 0x00c6, 0x00d8,
  0x221e, 0x00b1, 0x2264, 0x2265, 0x00a5, 0x00b5, 0x2202, 0x2211, 0x220f, 0x03c0, 0x222b, 0x00aa, 0x00ba, 0x03a9, 0x00e6, 0x00f8,
  0x00bf, 0x00a1, 0x00ac, 0x221a, 0x0192, 0x2248, 0x2206, 0x00ab, 0x00bb, 0x2026, 0x00a0, 0x00c0, 0x00c3, 0x00d5, 0x0152, 0x0153,
  0x2013, 0x2014, 0x201c, 0x201d, 0x2018, 0x2019, 0x00f7, 0x25ca, 0x00ff, 0x0178, 0x2044, 0x20ac, 0x2039, 0x203a, 0xfb01, 0xfb02,
  0x2021, 0x00b7, 0x201a, 0x201e, 0x2030, 0x00c2, 0x00ca, 0x00c1, 0x00cb, 0x00c8, 0x00cd, 0x00ce, 0x00cf, 0x00cc, 0x00d3, 0x00d4,
  0xf8ff, 0x00d2, 0x00da, 0x00db, 0x00d9, 0x0131, 0x02c6, 0x02dc, 0x00af, 0x02d8, 0x02d9, 0x02da, 0x00b8, 0x02dd, 0x02db, 0x02c7,
];

export function decodeMacRoman(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b < 0x80 ? b : MAC_ROMAN_HIGH[b - 0x80]);
  return s;
}

export function decodeUtf16be(bytes) {
  const even = Buffer.from(bytes.subarray(0, bytes.length - (bytes.length % 2)));
  return even.swap16().toString('utf16le');
}

function decodeRecord(r, bytes) {
  if (r.platformID === 3 || r.platformID === 0) return decodeUtf16be(bytes);
  if (r.platformID === 1 && r.encodingID === 0) return decodeMacRoman(bytes);
  return null; // other encodings (Mac CJK, Windows symbol) are not needed for SB Sans
}

// Windows English first, then any Windows, then Unicode, then Mac Roman.
function rank(r) {
  if (r.platformID === 3 && r.languageID === 0x0409) return 0;
  if (r.platformID === 3) return 1;
  if (r.platformID === 0) return 2;
  if (r.platformID === 1 && r.encodingID === 0) return 3;
  return 9;
}

function fontOffset(buf, fontIndex) {
  const tag = buf.toString('latin1', 0, 4);
  if (tag === 'ttcf') {
    const numFonts = buf.readUInt32BE(8);
    if (fontIndex >= numFonts) throw new Error(`font index ${fontIndex} out of ${numFonts}`);
    return buf.readUInt32BE(12 + 4 * fontIndex);
  }
  if (tag === 'OTTO' || tag === 'true' || buf.readUInt32BE(0) === 0x00010000) return 0;
  throw new Error('not an sfnt font (bad header ' + JSON.stringify(tag) + ')');
}

export function readNames(buf, { fontIndex = 0 } = {}) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) throw new Error('not an sfnt font (too short)');
  const base = fontOffset(buf, fontIndex);
  const numTables = buf.readUInt16BE(base + 4);
  let name = null;
  for (let i = 0; i < numTables; i += 1) {
    const rec = base + 12 + 16 * i;
    if (buf.toString('latin1', rec, rec + 4) === 'name') name = { offset: buf.readUInt32BE(rec + 8), length: buf.readUInt32BE(rec + 12) };
  }
  if (!name) throw new Error('no name table');
  const t = name.offset;
  const count = buf.readUInt16BE(t + 2);
  const storage = t + buf.readUInt16BE(t + 4);
  const best = {};
  for (let i = 0; i < count; i += 1) {
    const p = t + 6 + 12 * i;
    const r = {
      platformID: buf.readUInt16BE(p),
      encodingID: buf.readUInt16BE(p + 2),
      languageID: buf.readUInt16BE(p + 4),
      nameID: buf.readUInt16BE(p + 6),
    };
    const len = buf.readUInt16BE(p + 8);
    const off = storage + buf.readUInt16BE(p + 10);
    if (off + len > buf.length) continue; // a broken record must not abort the scan
    const text = decodeRecord(r, buf.subarray(off, off + len));
    if (text === null) continue;
    const prev = best[r.nameID];
    if (!prev || rank(r) < prev.rank) best[r.nameID] = { rank: rank(r), text };
  }
  const out = {};
  for (const [key, id] of Object.entries(NAME_IDS)) out[key] = best[id] ? best[id].text : null;
  const m = out.version && /(\d+\.\d+)/.exec(out.version);
  out.versionNumber = m ? m[1] : null;
  return out;
}

export function readFontNames(file, opts) {
  return readNames(readFileSync(file), opts);
}
```

- [ ] **Step 5: Запустить тест**

Run: `npx vitest run tests/tools/opentype-name.test.mjs`
Expected: `7 passed`.

- [ ] **Step 6: Написать падающий тест `tests/tools/scan-fonts.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanFonts, fontDirs } from '../../tools/fonts/scan-fonts.mjs';
import { sbFont } from '../helpers/make-font.mjs';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'bk-fonts-'));
const slash = (p) => p.replace(/\\/g, '/');

describe('scan-fonts', () => {
  it('reads the real PostScript name of SB Sans files and skips the rest', () => {
    const dir = tmp();
    writeFileSync(path.join(dir, 'SBSansDisplay-SemiBold.otf'), sbFont('SBSansDisplay-Semibold', '1.002'));
    writeFileSync(path.join(dir, 'arial.ttf'), sbFont('ArialMT', '7.03'));
    writeFileSync(path.join(dir, 'SBSansBroken.otf'), Buffer.from('garbage, not a font at all'));
    const r = scanFonts({ dirs: [dir, path.join(dir, 'missing')] });
    expect(r.fonts.map((f) => [f.postScriptName, f.version])).toEqual([['SBSansDisplay-Semibold', '1.002']]);
    expect(r.fonts[0].file).toBe(slash(path.join(dir, 'SBSansDisplay-SemiBold.otf')));
    expect(r.errors.map((e) => path.basename(e.file))).toEqual(['SBSansBroken.otf']);
    expect(r.dirs[1].exists).toBe(false);
  });
  it('with --all finds renamed SB Sans files by their PostScript name', () => {
    const dir = tmp();
    mkdirSync(path.join(dir, 'sub'));
    writeFileSync(path.join(dir, 'sub', 'font1.otf'), sbFont('SBSansText-Regular', '1.003'));
    writeFileSync(path.join(dir, 'font2.otf'), sbFont('Verdana', '5.33'));
    expect(scanFonts({ dirs: [dir] }).fonts).toEqual([]);
    expect(scanFonts({ dirs: [dir], all: true }).fonts.map((f) => f.postScriptName)).toEqual(['SBSansText-Regular']);
  });
  it('reports one face installed twice with different builds', () => {
    const a = tmp();
    const b = tmp();
    writeFileSync(path.join(a, 'SBSansDisplay-Regular.otf'), sbFont('SBSansDisplay-Regular', '1.002'));
    writeFileSync(path.join(b, 'SBSansDisplay-Regular.otf'), sbFont('SBSansDisplay-Regular', '1.000'));
    const r = scanFonts({ dirs: [a, b] });
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0].postScriptName).toBe('SBSansDisplay-Regular');
    expect(r.conflicts[0].versions.sort()).toEqual(['1.000', '1.002']);
  });
  it('lists the Windows and macOS font folders', () => {
    expect(fontDirs('win32', { WINDIR: 'C:\\Windows', LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local', CommonProgramFiles: 'C:\\Program Files\\Common Files' }))
      .toEqual(['C:/Windows/Fonts', 'C:/Users/u/AppData/Local/Microsoft/Windows/Fonts', 'C:/Program Files/Common Files/Adobe/Fonts']);
    expect(fontDirs('darwin', { HOME: '/Users/u' }))
      .toEqual(['/Library/Fonts', '/Users/u/Library/Fonts', '/Library/Application Support/Adobe/Fonts']);
  });
});
```

- [ ] **Step 7: Убедиться, что тест падает**

Run: `npx vitest run tests/tools/scan-fonts.test.mjs`
Expected: FAIL — `Cannot find module '../../tools/fonts/scan-fonts.mjs'`.

- [ ] **Step 8: Создать `tools/fonts/scan-fonts.mjs`**

```js
#!/usr/bin/env node
// Finds SB Sans font files and reads their PostScript names and builds from the name table.
//   node tools/fonts/scan-fonts.mjs [--all] [--out docs/decisions/fonts-this-pc.json]
// By default only files whose name contains "SBSans" / "SB Sans" are parsed. --all parses every
// font file and keeps faces whose PostScript name starts with SBSans (slower; for renamed files).
// The file name is not trusted: SBSansDisplay-SemiBold.otf holds SBSansDisplay-Semibold (quirk 187).
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFontNames } from './opentype-name.mjs';

const FONT_EXT = /\.(otf|ttf|ttc)$/i;
const SB_FILE = /sb[\s_-]?sans/i;
const slash = (p) => String(p).replace(/\\/g, '/');

export function fontDirs(platform = process.platform, env = process.env) {
  if (platform === 'win32') {
    const dirs = [slash(env.WINDIR || 'C:/Windows') + '/Fonts'];
    if (env.LOCALAPPDATA) dirs.push(slash(env.LOCALAPPDATA) + '/Microsoft/Windows/Fonts');
    dirs.push(slash(env.CommonProgramFiles || 'C:/Program Files/Common Files') + '/Adobe/Fonts');
    return dirs;
  }
  const home = env.HOME || os.homedir();
  if (platform === 'darwin') {
    return ['/Library/Fonts', home + '/Library/Fonts', '/Library/Application Support/Adobe/Fonts'];
  }
  return ['/usr/share/fonts', '/usr/local/share/fonts', home + '/.local/share/fonts'];
}

// Adobe's font folder keeps faces in subfolders; system folders are flat.
function listFiles(dir) {
  for (const opts of [{ recursive: true }, {}]) {
    try {
      return readdirSync(dir, opts).map((n) => path.join(dir, String(n)));
    } catch {
      // fall through to a flat listing, then to nothing
    }
  }
  return [];
}

export function findConflicts(fonts) {
  const byName = new Map();
  for (const f of fonts) {
    if (!byName.has(f.postScriptName)) byName.set(f.postScriptName, []);
    byName.get(f.postScriptName).push(f);
  }
  const out = [];
  for (const [postScriptName, list] of byName) {
    if (list.length > 1) {
      out.push({ postScriptName, versions: [...new Set(list.map((f) => f.version))], files: list.map((f) => f.file) });
    }
  }
  return out;
}

export function scanFonts({ dirs = fontDirs(), all = false } = {}) {
  const fonts = [];
  const errors = [];
  const dirInfo = dirs.map((d) => ({ dir: slash(d), exists: existsSync(d) }));
  for (const { dir, exists } of dirInfo) {
    if (!exists) continue;
    for (const file of listFiles(dir)) {
      if (!FONT_EXT.test(file) || (!all && !SB_FILE.test(path.basename(file)))) continue;
      try {
        if (!statSync(file).isFile()) continue;
        const n = readFontNames(file);
        if (all && !/^SBSans/.test(n.postScriptName || '')) continue;
        fonts.push({
          file: slash(file),
          postScriptName: n.postScriptName,
          version: n.versionNumber,
          versionString: n.version,
          family: n.typoFamily || n.family,
          style: n.typoSubfamily || n.subfamily,
        });
      } catch (e) {
        errors.push({ file: slash(file), error: e.message });
      }
    }
  }
  fonts.sort((a, b) => String(a.postScriptName).localeCompare(String(b.postScriptName)) || a.file.localeCompare(b.file));
  return { platform: process.platform, scannedAt: new Date().toISOString(), dirs: dirInfo, fonts, conflicts: findConflicts(fonts), errors };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf('--out');
  const r = scanFonts({ all: argv.includes('--all') });
  const json = JSON.stringify(r, null, 2) + '\n';
  if (outIdx !== -1) {
    writeFileSync(argv[outIdx + 1], json, 'utf8');
    console.error(`written ${argv[outIdx + 1]}`);
  } else {
    process.stdout.write(json);
  }
  console.error(`${r.fonts.length} SB Sans faces, ${r.conflicts.length} conflicts, ${r.errors.length} unreadable files`);
}
```

- [ ] **Step 9: Запустить тесты шрифтов**

Run: `npx vitest run tests/tools/opentype-name.test.mjs tests/tools/scan-fonts.test.mjs`
Expected: `11 passed`.

- [ ] **Step 10: Записать сборки SB Sans этой машины**

Run: `node tools/fonts/scan-fonts.mjs --out docs/decisions/fonts-this-pc.json`
Expected (stderr):
```text
written docs/decisions/fonts-this-pc.json
35 SB Sans faces, 0 conflicts, 0 unreadable files
```

Run: `node -e "const r=require('./docs/decisions/fonts-this-pc.json'); for (const f of r.fonts) if (/^SBSans(Display-(Regular|Semibold|Bold)|Text-Regular)$/.test(f.postScriptName)) console.log(f.postScriptName, f.version, f.file)"`
Expected (по скану 2026-10-02):
```text
SBSansDisplay-Bold 1.002 C:/Windows/Fonts/SBSansDisplay-Bold.otf
SBSansDisplay-Regular 1.002 C:/Windows/Fonts/SBSansDisplay-Regular.otf
SBSansDisplay-Semibold 1.002 C:/Windows/Fonts/SBSansDisplay-SemiBold.otf
SBSansText-Regular 1.003 C:/Windows/Fonts/SBSansText-Regular.otf
```

Другие числа не ошибка: записать их как есть, тогда в задаче 26 `seenOnThisPc` берётся из этого файла.

- [ ] **Step 11: Commit**

```bash
git add tests/helpers/make-font.mjs tools/fonts/opentype-name.mjs tools/fonts/scan-fonts.mjs tests/tools/opentype-name.test.mjs tests/tools/scan-fonts.test.mjs docs/decisions/fonts-this-pc.json
git commit -m "feat(fonts): OpenType name reader and SB Sans scanner" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 25: Инвентаризация машин команды

Инвентаризация для D20 и выбора машины для S8 (spec §3.3 п. 4). Два скрипта собирают одинаковый JSON: `inventory.ps1` на Windows, `inventory.sh` на macOS. Оба только читают систему. `merge.mjs` сводит файлы в таблицу и выбирает самую слабую машину: меньше RAM, при равной RAM — слабее GPU.

Ответы, которых скрипт не знает (вход в Adobe ID, доступ к обновлениям), правятся руками в блоке `manual` JSON-файла, затем таблица пересобирается.

**Files:**
- Create: `tools/inventory/merge.mjs`, `tools/inventory/inventory.ps1`, `tools/inventory/inventory.sh`, `.gitattributes`, `docs/decisions/inventory/main-pc.json`, `docs/decisions/inventory.md`
- Test: `tests/tools/inventory-merge.test.mjs`

- [ ] **Step 1: Написать падающий тест `tests/tools/inventory-merge.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gpuScore, pickWeakest, renderInventory, loadInventories, fontBuilds } from '../../tools/inventory/merge.mjs';

const fonts = (semibold) => [
  { postScriptName: 'SBSansDisplay-Regular', version: '1.002' },
  { postScriptName: 'SBSansDisplay-Semibold', version: semibold },
  { postScriptName: 'SBSansDisplay-Bold', version: '1.002' },
  { postScriptName: 'SBSansText-Regular', version: '1.003' },
];
const machine = (label, ramGB, gpus, extra = {}) => ({
  schema: 'brandkit-inventory/1',
  label,
  os: { name: 'Windows 11 Pro', version: '24H2', build: '10.0.26100' },
  cpu: { name: 'CPU', cores: 8, threads: 16 },
  ramGB,
  gpus,
  adobe: { afterEffects: [{ version: '26.3' }], premiere: [{ version: '26.3.2' }], mediaEncoder: [{ version: '26.3.2' }] },
  creativeCloud: { present: true, version: '6.10.0.253' },
  upia: { present: true },
  cep: { 'CSXS.11': '1', 'CSXS.12': '1' },
  fonts: fonts('1.002'),
  manual: { adobeIdSignedIn: null },
  ...extra,
});

const strong = machine('edit-strong', 64, [{ name: 'NVIDIA GeForce RTX 4070', vramGB: 12 }]);
const weakPc = machine('edit-weak', 16, [{ name: 'Intel(R) UHD Graphics 770', vramGB: 2 }], { fonts: fonts('1.000') });
const mac = machine('edit-mac', 16, [{ name: 'Apple M1', vramGB: null, cores: 8 }], {
  os: { name: 'macOS', version: '15.6.1', build: '24G90' },
  adobe: { afterEffects: [{ version: '26.5' }], premiere: [{ version: '26.3.2' }], mediaEncoder: [] },
});

describe('inventory merge', () => {
  it('scores GPUs: dedicated VRAM, Apple cores / 2, integrated 0', () => {
    expect(gpuScore(strong)).toBe(12);
    expect(gpuScore(weakPc)).toBe(0);
    expect(gpuScore(mac)).toBe(4);
    expect(gpuScore(machine('two', 32, [{ name: 'AMD Radeon(TM) Graphics', vramGB: 2 }, { name: 'NVIDIA GeForce RTX 5060 Ti', vramGB: 15.9 }]))).toBe(15.9);
  });
  it('picks the weakest machine by RAM, then by GPU', () => {
    expect(pickWeakest([strong, mac, weakPc]).label).toBe('edit-weak');
    expect(pickWeakest([strong, mac]).label).toBe('edit-mac');
    expect(pickWeakest([])).toBeNull();
  });
  it('reads key SB Sans builds or reports that they were not read', () => {
    expect(fontBuilds(weakPc)['SBSansDisplay-Semibold']).toBe('1.000');
    expect(fontBuilds({ ...strong, fonts: null })).toBeNull();
  });
  it('renders a table, the S8 choice and the discrepancies', () => {
    const md = renderInventory([strong, weakPc, mac]);
    expect(md).toContain('| edit-strong | Windows 11 Pro 24H2 (10.0.26100) |');
    expect(md).toContain('**edit-weak**: RAM 16 ГБ');
    expect(md).toContain('- SBSansDisplay-Semibold: 1.002 — edit-strong, edit-mac; 1.000 — edit-weak');
    expect(md).toContain('- After Effects: edit-strong 26.3; edit-weak 26.3; edit-mac 26.5');
    expect(md).toContain('| спросить |');
  });
  it('loads a folder of JSON files, BOM included', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-inv-'));
    writeFileSync(path.join(dir, 'a.json'), String.fromCharCode(0xfeff) + JSON.stringify(strong));
    writeFileSync(path.join(dir, 'b.json'), JSON.stringify(mac));
    writeFileSync(path.join(dir, 'notes.txt'), 'ignored');
    expect(loadInventories([dir]).map((m) => m.label)).toEqual(['edit-strong', 'edit-mac']);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run tests/tools/inventory-merge.test.mjs`
Expected: FAIL — `Cannot find module '../../tools/inventory/merge.mjs'`.

- [ ] **Step 3: Создать `tools/inventory/merge.mjs`**

```js
#!/usr/bin/env node
// Merges per-machine inventory JSON (tools/inventory/inventory.ps1 / inventory.sh) into one table and
// picks the weakest machine for S8: least RAM first, then the weakest GPU.
//   node tools/inventory/merge.mjs [docs/decisions/inventory] [more.json ...] [--out docs/decisions/inventory.md]
// A directory argument means every *.json inside it.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const KEY_FONTS = ['SBSansDisplay-Regular', 'SBSansDisplay-Semibold', 'SBSansDisplay-Bold', 'SBSansText-Regular'];
const INTEGRATED = /intel|uhd|iris|radeon\(tm\) graphics|microsoft basic/i;

const stripBom = (t) => (t.charCodeAt(0) === 0xfeff ? t.slice(1) : t);

export function loadInventories(args) {
  const files = [];
  for (const a of args) {
    if (statSync(a).isDirectory()) {
      for (const n of readdirSync(a).filter((x) => x.endsWith('.json')).sort()) files.push(path.join(a, n));
    } else {
      files.push(a);
    }
  }
  return files.map((f) => ({ ...JSON.parse(stripBom(readFileSync(f, 'utf8'))), sourceFile: f }));
}

// Dedicated VRAM in GB; Apple GPUs report cores, not VRAM: cores / 2 puts an 8-core M1 at 4 and a
// 19-core M2 Pro at 9.5. Integrated PC graphics count as 0. A machine scores by its best GPU.
function scoreOf(g) {
  if (/apple/i.test(g.name || '') && g.cores) return g.cores / 2;
  if (!INTEGRATED.test(g.name || '') && g.vramGB) return g.vramGB;
  return 0;
}

export function bestGpu(m) {
  let best = null;
  for (const g of m.gpus || []) if (!best || scoreOf(g) > scoreOf(best)) best = g;
  return best;
}

export function gpuScore(m) {
  const g = bestGpu(m);
  return g ? scoreOf(g) : 0;
}

export function pickWeakest(machines) {
  const sorted = [...machines].sort((a, b) => (a.ramGB ?? Infinity) - (b.ramGB ?? Infinity) || gpuScore(a) - gpuScore(b));
  return sorted[0] || null;
}

const versions = (list) => (list || []).map((a) => a.version || '?').join(', ') || 'нет';
const esc = (s) => String(s == null ? '—' : s).replace(/\|/g, '\\|');

export function fontBuilds(m) {
  if (!Array.isArray(m.fonts)) return null;
  const out = {};
  for (const ps of KEY_FONTS) {
    const f = m.fonts.find((x) => x.postScriptName === ps);
    out[ps] = f ? f.version : null;
  }
  return out;
}

function fontCell(m) {
  const b = fontBuilds(m);
  if (!b) return `файлов SBSans: ${(m.sbSansFiles || []).length} (сборки без Node не читались)`;
  return KEY_FONTS.map((ps) => `${ps.replace('SBSans', '')} ${b[ps] || 'НЕТ'}`).join('; ');
}

export function renderInventory(machines) {
  const lines = [
    '# Инвентаризация машин команды (D20)',
    '',
    'Собрано командой `node tools/inventory/merge.mjs`; исходники — `docs/decisions/inventory/*.json`. Руками не править: поправить JSON и пересобрать.',
    '',
    '| Машина | ОС | Модель | CPU | GPU | RAM, ГБ | AE | Pr | AME | CC desktop | UPIA | PlayerDebugMode 11/12 | SB Sans (сборки) | Вход Adobe ID |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const m of machines) {
    const gpu = (m.gpus || []).map((g) => g.name + (g.vramGB ? ` ${g.vramGB} ГБ` : g.cores ? ` ${g.cores} ядер` : '')).join(' + ');
    const os = m.os ? `${m.os.name || ''} ${m.os.version || ''} (${m.os.build || ''})`.trim() : null;
    const cpu = m.cpu ? `${m.cpu.name} (${m.cpu.cores}/${m.cpu.threads})` : null;
    const cep = m.cep ? `${m.cep['CSXS.11'] || '—'}/${m.cep['CSXS.12'] || '—'}` : null;
    const signed = m.manual && m.manual.adobeIdSignedIn != null ? (m.manual.adobeIdSignedIn ? 'да' : 'нет') : 'спросить';
    lines.push(`| ${esc(m.label || m.hostname)} | ${esc(os)} | ${esc(m.model)} | ${esc(cpu)} | ${esc(gpu)} | ${esc(m.ramGB)} | ` +
      `${esc(versions(m.adobe && m.adobe.afterEffects))} | ${esc(versions(m.adobe && m.adobe.premiere))} | ${esc(versions(m.adobe && m.adobe.mediaEncoder))} | ` +
      `${m.creativeCloud && m.creativeCloud.present ? esc(m.creativeCloud.version || 'есть') : 'нет'} | ${m.upia && m.upia.present ? 'есть' : 'нет'} | ` +
      `${esc(cep)} | ${esc(fontCell(m))} | ${signed} |`);
  }

  const weakest = pickWeakest(machines);
  lines.push('', '## Самая слабая машина для S8', '');
  if (weakest) {
    lines.push(`**${weakest.label || weakest.hostname}**: RAM ${weakest.ramGB} ГБ, GPU ${(bestGpu(weakest) || {}).name || '—'} (оценка GPU ${gpuScore(weakest)}).`);
  }
  lines.push('', 'Правило: меньше RAM; при равной RAM — слабее GPU (выделенная VRAM в ГБ; у Apple — число ядер GPU / 2; встроенная графика ПК = 0). Пользователь может выбрать другую машину в D20.');

  lines.push('', '## Расхождения', '');
  const diffs = [];
  for (const ps of KEY_FONTS) {
    const seen = new Map();
    for (const m of machines) {
      const b = fontBuilds(m);
      if (!b) continue;
      const v = b[ps] || 'нет';
      if (!seen.has(v)) seen.set(v, []);
      seen.get(v).push(m.label || m.hostname);
    }
    if (seen.size > 1) diffs.push(`- ${ps}: ` + [...seen].map(([v, who]) => `${v} — ${who.join(', ')}`).join('; '));
  }
  for (const [key, title] of [['afterEffects', 'After Effects'], ['premiere', 'Premiere']]) {
    const set = new Set(machines.map((m) => versions(m.adobe && m.adobe[key])));
    if (set.size > 1) diffs.push(`- ${title}: ` + machines.map((m) => `${m.label || m.hostname} ${versions(m.adobe && m.adobe[key])}`).join('; '));
  }
  lines.push(diffs.length ? diffs.join('\n') : 'Нет.');
  return lines.join('\n') + '\n';
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf('--out');
  const out = outIdx === -1 ? null : argv[outIdx + 1];
  const inputs = argv.filter((a, i) => outIdx === -1 || (i !== outIdx && i !== outIdx + 1));
  const machines = loadInventories(inputs.length ? inputs : ['docs/decisions/inventory']);
  const md = renderInventory(machines);
  if (out) {
    writeFileSync(out, md, 'utf8');
    const w = pickWeakest(machines);
    console.log(`written ${out}: ${machines.length} machines; weakest for S8: ${w ? w.label || w.hostname : '—'}`);
  } else {
    process.stdout.write(md);
  }
}
```

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/tools/inventory-merge.test.mjs`
Expected: `5 passed`.

- [ ] **Step 5: Создать `tools/inventory/inventory.ps1` (Windows)**

Совместим с Windows PowerShell 5.1. Объём видеопамяти берётся из реестра: у `Win32_VideoController.AdapterRAM` потолок 4 ГБ.

```powershell
# Machine inventory for phase 0 (spec 3.3 item 4, D20). Prints one JSON object; with -Out it also
# writes it as UTF-8 without BOM. Read-only: CIM, registry, file versions; it changes nothing.
#   powershell -ExecutionPolicy Bypass -File tools/inventory/inventory.ps1 [-Label "edit-1"] [-Out docs/decisions/inventory/edit-1.json]
# Works in Windows PowerShell 5.1 and PowerShell 7.
param(
  [string]$Label = '',
  [string]$Out = ''
)
$ErrorActionPreference = 'Stop'
$errors = New-Object System.Collections.ArrayList

function Invoke-Safe([string]$What, [scriptblock]$Block, $Default) {
  try { return (& $Block) } catch { [void]$errors.Add("${What}: $($_.Exception.Message)"); return $Default }
}

function Get-ProductVersion([string]$Path) {
  if ($Path -and (Test-Path -LiteralPath $Path)) { return (Get-Item -LiteralPath $Path).VersionInfo.ProductVersion }
  return $null
}

# Every installed copy, e.g. "Adobe After Effects 2026" and "Adobe After Effects (Beta)".
function Find-AdobeApp([string]$DirFilter, [string]$SubDir, [string]$ExeFilter) {
  $found = @()
  $root = Join-Path $env:ProgramFiles 'Adobe'
  if (-not (Test-Path -LiteralPath $root)) { return ,$found }
  foreach ($d in Get-ChildItem -LiteralPath $root -Directory -Filter $DirFilter) {
    $dir = if ($SubDir) { Join-Path $d.FullName $SubDir } else { $d.FullName }
    if (-not (Test-Path -LiteralPath $dir)) { continue }
    $exe = Get-ChildItem -LiteralPath $dir -File -Filter $ExeFilter | Select-Object -First 1
    if ($exe) { $found += [ordered]@{ name = $d.Name; version = (Get-ProductVersion $exe.FullName); path = $exe.FullName } }
  }
  return ,$found
}

# Win32_VideoController.AdapterRAM is 32-bit and stops at 4 GB; the display class key has the real size.
function Get-Gpus {
  $vram = @{}
  $class = 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}'
  foreach ($k in (Get-ChildItem -LiteralPath $class -ErrorAction SilentlyContinue)) {
    if ($k.PSChildName -notmatch '^\d{4}$') { continue }
    $p = Get-ItemProperty -LiteralPath $k.PSPath -ErrorAction SilentlyContinue
    if ($p -and $p.DriverDesc -and $p.'HardwareInformation.qwMemorySize') { $vram[$p.DriverDesc] = [double]$p.'HardwareInformation.qwMemorySize' }
  }
  $gpus = @()
  foreach ($g in Get-CimInstance Win32_VideoController) {
    $bytes = if ($vram.ContainsKey($g.Name)) { $vram[$g.Name] } else { [double]$g.AdapterRAM }
    $gpus += [ordered]@{ name = $g.Name; vramGB = [math]::Round($bytes / 1GB, 1); cores = $null; driver = $g.DriverVersion }
  }
  return ,$gpus
}

$os = Invoke-Safe 'os' {
  $o = Get-CimInstance Win32_OperatingSystem
  $cv = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
  [ordered]@{ name = $o.Caption.Trim(); version = $cv.DisplayVersion; build = $o.Version }
} $null
$cs = Invoke-Safe 'model' { Get-CimInstance Win32_ComputerSystem } $null
$ramGB = Invoke-Safe 'ram' {
  $sum = (Get-CimInstance Win32_PhysicalMemory | Measure-Object -Property Capacity -Sum).Sum
  if (-not $sum) { $sum = $cs.TotalPhysicalMemory }
  [math]::Round($sum / 1GB)
} $null
$cpu = Invoke-Safe 'cpu' {
  $c = Get-CimInstance Win32_Processor | Select-Object -First 1
  [ordered]@{ name = $c.Name.Trim(); cores = $c.NumberOfCores; threads = $c.NumberOfLogicalProcessors }
} $null
# @(...) keeps one-element lists as JSON arrays in Windows PowerShell 5.1.
$gpus = @(Invoke-Safe 'gpu' { Get-Gpus } @())

$adobe = [ordered]@{
  afterEffects = @(Invoke-Safe 'ae' { Find-AdobeApp 'Adobe After Effects*' 'Support Files' 'AfterFX*.exe' } @())
  premiere = @(Invoke-Safe 'pr' { Find-AdobeApp 'Adobe Premiere Pro*' '' 'Adobe Premiere Pro*.exe' } @())
  mediaEncoder = @(Invoke-Safe 'ame' { Find-AdobeApp 'Adobe Media Encoder*' '' 'Adobe Media Encoder*.exe' } @())
}

$ccExe = @(
  (Join-Path $env:ProgramFiles 'Adobe\Adobe Creative Cloud\ACC\Creative Cloud.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Adobe\Adobe Creative Cloud\ACC\Creative Cloud.exe')
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
$upiaExe = Join-Path $env:CommonProgramFiles 'Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent\UnifiedPluginInstallerAgent.exe'

$cep = [ordered]@{}
foreach ($v in '11', '12') {
  $mode = (Get-ItemProperty -Path "HKCU:\Software\Adobe\CSXS.$v" -Name PlayerDebugMode -ErrorAction SilentlyContinue).PlayerDebugMode
  $cep["CSXS.$v"] = if ($null -ne $mode) { [string]$mode } else { $null }
}

# Font files by name (always) and PostScript names with builds through Node (when Node exists).
$fontDirs = @((Join-Path $env:WINDIR 'Fonts'), (Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\Fonts'))
$sbSansFiles = @()
foreach ($d in $fontDirs) {
  if (Test-Path -LiteralPath $d) { $sbSansFiles += @(Get-ChildItem -LiteralPath $d -File -Filter 'SBSans*' | ForEach-Object { $_.Name }) }
}
$fonts = $null
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
  $fonts = Invoke-Safe 'fonts' {
    # The scanner writes UTF-8 to a temp file: console decoding would mangle Cyrillic paths, and
    # under 'Stop' Windows PowerShell 5.1 turns any stderr line of a native command into an error.
    $ErrorActionPreference = 'Continue'
    $tmp = [System.IO.Path]::GetTempFileName()
    & $node.Source (Join-Path $PSScriptRoot '..\fonts\scan-fonts.mjs') --out $tmp 2>$null | Out-Null
    $scan = [System.IO.File]::ReadAllText($tmp, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    Remove-Item -LiteralPath $tmp -Force
    $list = @()
    foreach ($f in $scan.fonts) { $list += [ordered]@{ postScriptName = $f.postScriptName; version = $f.version; file = $f.file } }
    ,$list
  } $null
}

$inv = [ordered]@{
  schema = 'brandkit-inventory/1'
  collectedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  hostname = $env:COMPUTERNAME
  label = if ($Label) { $Label } else { $env:COMPUTERNAME }
  os = $os
  model = if ($cs) { ("$($cs.Manufacturer) $($cs.Model)").Trim() } else { $null }
  cpu = $cpu
  gpus = $gpus
  ramGB = $ramGB
  adobe = $adobe
  creativeCloud = [ordered]@{ present = [bool]$ccExe; version = (Get-ProductVersion $ccExe) }
  upia = [ordered]@{ present = (Test-Path -LiteralPath $upiaExe); version = (Get-ProductVersion $upiaExe) }
  cep = $cep
  sbSansFiles = @($sbSansFiles)
  fonts = if ($null -ne $fonts) { @($fonts) } else { $null }
  manual = [ordered]@{ adobeIdSignedIn = $null; updatesAvailable = ''; notes = '' }
  errors = @($errors)
}

$json = $inv | ConvertTo-Json -Depth 6
if ($Out) {
  $full = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Out)
  [void](New-Item -ItemType Directory -Force -Path (Split-Path -Parent $full))
  [System.IO.File]::WriteAllText($full, $json, (New-Object System.Text.UTF8Encoding $false))
  Write-Output "written $full"
} else {
  Write-Output $json
}
```

- [ ] **Step 6: Создать `tools/inventory/inventory.sh` (macOS)**

Только bash 3.2 и штатные утилиты macOS. `BK_APPS_ROOT` подменяет `/Applications` для пробного прогона.

```bash
#!/bin/bash
# Machine inventory for phase 0 (spec 3.3 item 4, D20), macOS. Prints one JSON object in the same
# shape as inventory.ps1; with --out it also writes it. Read-only: sw_vers, sysctl, system_profiler,
# defaults, Info.plist versions. Uses bash 3.2 and stock macOS tools; Node is optional (SB Sans builds).
#   bash tools/inventory/inventory.sh [--label edit-mac-1] [--out docs/decisions/inventory/edit-mac-1.json]
set -u
label=""
out=""
while [ $# -gt 0 ]; do
  case "$1" in
    --label) label="$2"; shift 2 ;;
    --out) out="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
here="$(cd "$(dirname "$0")" && pwd)"
apps="${BK_APPS_ROOT:-/Applications}" # overridable for a dry run on another machine

# A JSON string, or null for an empty value. Control characters are dropped.
js() {
  if [ -z "${1-}" ]; then printf 'null'; return; fi
  printf '"%s"' "$(printf '%s' "$1" | tr -d '\000-\037' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')"
}
# A JSON number, or null.
jn() {
  case "${1-}" in
    ''|*[!0-9.]*) printf 'null' ;;
    *) printf '%s' "$1" ;;
  esac
}

plist_version() {
  /usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$1/Contents/Info.plist" 2>/dev/null
}

# Every installed copy: apps_json "<folder glob>" "<app glob>", e.g. "Adobe Premiere Pro*" "Adobe Premiere Pro*.app".
apps_json() {
  local IFS=$'\n'
  local first=1 app
  printf '['
  for app in $apps/$1/$2; do
    [ -d "$app" ] || continue
    case "$(basename "$app")" in *Uninstall*|*"Render Engine"*) continue ;; esac
    [ $first -eq 1 ] || printf ','
    first=0
    printf '{"name":%s,"version":%s,"path":%s}' "$(js "$(basename "$app" .app)")" "$(js "$(plist_version "$app")")" "$(js "$app")"
  done
  printf ']'
}

gpus_json() {
  system_profiler SPDisplaysDataType 2>/dev/null | awk '
    function flush() {
      if (name != "") {
        if (n++) printf ","
        printf "{\"name\":\"%s\",\"vramGB\":%s,\"cores\":%s,\"driver\":null}", name, (vram == "" ? "null" : vram), (cores == "" ? "null" : cores)
      }
      name = ""; vram = ""; cores = ""
    }
    BEGIN { printf "[" }
    /Chipset Model:/ { flush(); sub(/.*Chipset Model: */, ""); gsub(/"/, ""); name = $0 }
    /Total Number of Cores:/ { sub(/.*Cores: */, ""); cores = $0 + 0 }
    /VRAM/ { v = $0; sub(/.*: */, "", v); split(v, a, " "); vram = (a[2] == "MB" ? a[1] / 1024 : a[1] + 0) }
    END { flush(); printf "]" }'
}

app_json() {
  if [ -d "$1" ]; then
    printf '{"present":true,"version":%s}' "$(js "$(plist_version "$1")")"
  else
    printf '{"present":false,"version":null}'
  fi
}

host="$(hostname -s 2>/dev/null)"
[ -n "$label" ] || label="$host"
mem_bytes="$(sysctl -n hw.memsize 2>/dev/null)"
ram_gb=""
[ -n "$mem_bytes" ] && ram_gb=$((mem_bytes / 1073741824))
model="$(system_profiler SPHardwareDataType 2>/dev/null | awk -F': ' '/Model Name/ {n = $2} /Model Identifier/ {i = $2} END {if (n != "") print n " (" i ")"}')"

sb_files="["
first=1
for d in /Library/Fonts "$HOME/Library/Fonts" "/Library/Application Support/Adobe/Fonts"; do
  [ -d "$d" ] || continue
  for f in "$d"/SBSans*; do
    [ -f "$f" ] || continue
    [ $first -eq 1 ] || sb_files="$sb_files,"
    first=0
    sb_files="$sb_files$(js "$(basename "$f")")"
  done
done
sb_files="$sb_files]"

fonts="null"
if command -v node >/dev/null 2>&1; then
  tmp="$(mktemp)"
  if node "$here/../fonts/scan-fonts.mjs" --out "$tmp" 2>/dev/null; then
    fonts="$(node -e 'const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); process.stdout.write(JSON.stringify(r.fonts.map((f) => ({ postScriptName: f.postScriptName, version: f.version, file: f.file }))))' "$tmp")"
  fi
  rm -f "$tmp"
fi

json="$(printf '{"schema":"brandkit-inventory/1","collectedAt":%s,"hostname":%s,"label":%s,' \
  "$(js "$(date -u +%Y-%m-%dT%H:%M:%SZ)")" "$(js "$host")" "$(js "$label")")"
json="$json$(printf '"os":{"name":%s,"version":%s,"build":%s},' \
  "$(js "$(sw_vers -productName 2>/dev/null)")" "$(js "$(sw_vers -productVersion 2>/dev/null)")" "$(js "$(sw_vers -buildVersion 2>/dev/null)")")"
json="$json$(printf '"model":%s,"cpu":{"name":%s,"cores":%s,"threads":%s},"gpus":%s,"ramGB":%s,' \
  "$(js "$model")" "$(js "$(sysctl -n machdep.cpu.brand_string 2>/dev/null)")" \
  "$(jn "$(sysctl -n hw.physicalcpu 2>/dev/null)")" "$(jn "$(sysctl -n hw.logicalcpu 2>/dev/null)")" \
  "$(gpus_json)" "$(jn "$ram_gb")")"
json="$json$(printf '"adobe":{"afterEffects":%s,"premiere":%s,"mediaEncoder":%s},' \
  "$(apps_json 'Adobe After Effects*' 'Adobe After Effects*.app')" \
  "$(apps_json 'Adobe Premiere Pro*' 'Adobe Premiere Pro*.app')" \
  "$(apps_json 'Adobe Media Encoder*' 'Adobe Media Encoder*.app')")"
json="$json$(printf '"creativeCloud":%s,"upia":%s,' \
  "$(app_json "$apps/Utilities/Adobe Creative Cloud/ACC/Creative Cloud.app")" \
  "$(app_json '/Library/Application Support/Adobe/Adobe Desktop Common/RemoteComponents/UPI/UnifiedPluginInstallerAgent/UnifiedPluginInstallerAgent.app')")"
json="$json$(printf '"cep":{"CSXS.11":%s,"CSXS.12":%s},' \
  "$(js "$(defaults read com.adobe.CSXS.11 PlayerDebugMode 2>/dev/null)")" "$(js "$(defaults read com.adobe.CSXS.12 PlayerDebugMode 2>/dev/null)")")"
json="$json$(printf '"sbSansFiles":%s,"fonts":%s,"manual":{"adobeIdSignedIn":null,"updatesAvailable":"","notes":""},"errors":[]}' \
  "$sb_files" "$fonts")"

if [ -n "$out" ]; then
  mkdir -p "$(dirname "$out")"
  printf '%s\n' "$json" > "$out"
  echo "written $out"
else
  printf '%s\n' "$json"
fi
```

- [ ] **Step 7: Закрепить LF для shell-скриптов: создать `.gitattributes`**

На Windows-машинах `core.autocrlf=true`; с CRLF bash на Mac ломается на первой строке.

```gitattributes
# Shell scripts also run on macOS: keep LF in every checkout.
*.sh text eol=lf
*.command text eol=lf
```

Run: `bash -n tools/inventory/inventory.sh && echo syntax-ok`
Expected: `syntax-ok`.

- [ ] **Step 8: Снять инвентаризацию этой машины и собрать таблицу**

Run (PowerShell): `powershell -NoProfile -ExecutionPolicy Bypass -File tools/inventory/inventory.ps1 -Label main-pc -Out docs/decisions/inventory/main-pc.json`
Expected: `written C:\Users\Глеб\Documents\Cloud.ru Preset plugin\docs\decisions\inventory\main-pc.json`.

Run: `node -e "const j=require('./docs/decisions/inventory/main-pc.json'); console.log(j.ramGB, j.gpus.map(g=>g.name).join(' + '), j.adobe.afterEffects.map(a=>a.version), j.adobe.premiere.map(a=>a.version), j.fonts && j.fonts.length, j.errors)"`
Expected (на 2026-10-02): `96 NVIDIA GeForce RTX 5060 Ti + AMD Radeon(TM) Graphics [ '26.5' ] [ '26.5.2' ] 35 []`.

AE 26.5, Pr 26.5.2 и AME 26.5.2 пришли на эту машину 2 октября 2026 (spec §1.1 п. 6). Есть ли они на машинах команды и по какому каналу, спрашивает вопрос 2 к D20 (задача 27). Если здесь версии другие, поправить этот вопрос.

Run: `node tools/inventory/merge.mjs docs/decisions/inventory --out docs/decisions/inventory.md`
Expected: `written docs/decisions/inventory.md: 1 machines; weakest for S8: main-pc`.

- [ ] **Step 9: Mac и машины команды (вручную)**

1. На Mac в корне репозитория: `bash tools/inventory/inventory.sh --label <имя-машины> --out docs/decisions/inventory/<имя-машины>.json`. Ожидается `written docs/decisions/inventory/<имя-машины>.json`.
2. Проверить, что это JSON: `node -e "JSON.parse(require('fs').readFileSync('docs/decisions/inventory/<имя-машины>.json','utf8')); console.log('json ok')"`. Если Node на Mac нет, `fonts` будет `null`, а сборки шрифтов не прочитаются; список файлов `sbSansFiles` всё равно будет.
3. Монтажёрам на Windows отправить `tools/inventory/inventory.ps1` и `tools/fonts/` с командой из шага 8 (своя `-Label`). Полученные JSON положить в `docs/decisions/inventory/`.
4. В каждом JSON заполнить `manual.adobeIdSignedIn` (`true` или `false`) и `manual.updatesAvailable` по ответам людей.
5. Пересобрать таблицу командой из шага 8. Машина из раздела «Самая слабая машина для S8» идёт в A6 листа решений и в S8 (часть E).

- [ ] **Step 10: Commit**

```bash
git add tools/inventory/merge.mjs tools/inventory/inventory.ps1 tools/inventory/inventory.sh .gitattributes tests/tools/inventory-merge.test.mjs docs/decisions/inventory docs/decisions/inventory.md
git commit -m "feat(inventory): machine inventory scripts and merge" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 26: Черновик бренд-канона и правила брендбука

Канон фазы 0 (spec §3.3 п. 1): `brand/tokens.json` и выписка правил брендбука для D22. Всё со статусом `draft` до утверждения листа решений.

**Где смотреть в брендбуке.** Файл `C:/Users/Глеб/Documents/Брендбук/Материалы на анализ/Брендбук_Cloud.ru_2.0_cond.pdf`, 49 страниц. Номера ниже — страницы PDF; автор плана сверил их по тексту и картинкам страниц 2026-10-02.

| Что | Страницы |
|---|---|
| Оглавление: раздел «Motion» указан, но страниц нет | 2 |
| Look & feel: прямые углы, квадратные окончания штрихов | 4 |
| Охранное поле (модуль X), выравнивание, минимальный размер 20 px, подложка = охранное поле | 7 |
| Логотип на подложке и без неё | 8 |
| Цветовые версии логотипа на фонах; монохромный белый — только на фотофоне | 9 |
| Запреты | 10 |
| Логоблок с дескриптором: термин «дескриптор», текст «облачные сервисы и AI-технологии», 1 и 2 строки, отступ X, 1 px, иностранные слоганы | 11 |
| Вертикальный логоблок, длина зависит от дескриптора | 12 |
| Растянутый логоблок с линейным паттерном | 13 |
| Правила паттерна между логотипом и дескриптором | 14 |
| Все разрешённые покраски логоблока | 15 |
| Примеры логоблока | 16 |
| Кобрендинг | 17 |
| Базовая палитра | 18 |
| Дополнительная палитра | 19 |
| Шрифты: подсемейства и начертания, Verdana | 20 |
| Крупные цифры, трекинг | 22 |
| Интерлиньяж | 23 |
| Сетка: микромодуль 2 px, отступы кратны 10 | 24 |

Слоганов «умное облако» и «есть где развернуться» и разрешения ставить свой текст рядом с логотипом в файле нет. Это вопросы к владельцу бренда в D22 и D5.

**Files:**
- Create: `brand/tokens.json`, `docs/decisions/brandbook-rules.md`, `tests/docs/markdown.mjs`
- Test: `tests/tools/tokens.test.mjs`, `tests/docs/brandbook-rules.test.mjs`

- [ ] **Step 1: Написать падающий тест `tests/tools/tokens.test.mjs`**

Тест сверяет форматы с `FORMATS` оценки веса (задача 23), чтобы у канона и оценки была одна таблица размеров.

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { FORMATS } from '../../tools/library/estimate-weight.mjs';

const raw = readFileSync(new URL('../../brand/tokens.json', import.meta.url), 'utf8');
const tokens = JSON.parse(raw);
const data = (obj) => Object.fromEntries(Object.entries(obj).filter(([k]) => !k.startsWith('_')));

describe('brand/tokens.json', () => {
  it('is a draft', () => {
    expect(tokens.status).toBe('draft');
  });
  it('holds the D1 palette from brandbook page 18', () => {
    const hex = Object.values(tokens.color.base).map((c) => c.hex);
    expect(hex).toEqual(['#26D07C', '#222222', '#FFFFFF', '#F2F2F2', '#CFF500', '#A068FF', '#C0E0FC']);
  });
  it('writes every colour as #RRGGBB in upper case', () => {
    const all = raw.match(/#[0-9A-Fa-f]{3,8}\b/g);
    for (const h of all) expect(h).toMatch(/^#[0-9A-F]{6}$/);
  });
  it('maps replaced colours to base tokens', () => {
    for (const target of Object.values(data(tokens.color.replace))) expect(Object.keys(tokens.color.base)).toContain(target);
  });
  it('uses the exact PostScript names, Semibold with a lower-case b', () => {
    const names = Object.values(tokens.type.fonts).map((f) => f.postScriptName);
    expect(names).toEqual(['SBSansDisplay-Regular', 'SBSansDisplay-Semibold', 'SBSansDisplay-Bold', 'SBSansText-Regular']);
    expect(names.join()).not.toMatch(/SemiBold/);
  });
  it('keeps 25 fps and the formats of the weight estimate', () => {
    expect(tokens.video.fps.default).toBe(25);
    const formats = Object.fromEntries(Object.entries(data(tokens.video.formats)).map(([k, v]) => [k, [v.w, v.h]]));
    expect(formats).toEqual(FORMATS);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run tests/tools/tokens.test.mjs`
Expected: FAIL — `ENOENT: no such file or directory, open '…\brand\tokens.json'`.

- [ ] **Step 3: Создать `brand/tokens.json`**

Палитра — по D1, шрифты — PostScript-имена из контракта, форматы и fps — по D2 и D3. Поле `seenOnThisPc` заполняется по скану задачи 24: если там другие сборки, вписать их. Эталонная сборка (`build`) остаётся `null` до решения D16/D20.

```json
{
  "status": "draft",
  "meta": {
    "name": "Cloud.ru BrandKit canon",
    "version": "0.1.0",
    "updated": "2026-10-02",
    "source": "Брендбук Cloud.ru 2.0 (Брендбук_Cloud.ru_2.0_cond.pdf, 49 стр.): логотип с. 7–10, логоблок с дескриптором с. 11–16, кобрендинг с. 17, палитра с. 18–19, шрифт с. 20–23, сетка с. 24",
    "decisions": "docs/decisions/phase0-decisions.md: D1 палитра, D2 fps, D3 разрешения, D15 стили, D16 лицензия шрифта, D19 канон движения, D22 правила брендбука",
    "_note": "Черновик: ключи с _ — пояснения. Значения не идут в релизные сборки до утверждения решений фазы 0; утверждённое значение получает \"status\": \"approved\" и дату."
  },
  "color": {
    "base": {
      "green": { "hex": "#26D07C", "page": 18, "role": "акцент, знак логотипа" },
      "black": { "hex": "#222222", "page": 18, "role": "текст, тёмная подложка" },
      "white": { "hex": "#FFFFFF", "page": 18, "role": "фон, текст на тёмном" },
      "gray": { "hex": "#F2F2F2", "page": 18, "role": "светлая подложка" },
      "yellow": { "hex": "#CFF500", "page": 18, "role": "акцент; лаймовый текст на тёмных плашках SMM (D1)" },
      "purple": { "hex": "#A068FF", "page": 18, "role": "акцент" },
      "blue": { "hex": "#C0E0FC", "page": 18, "role": "акцент" }
    },
    "extended": {
      "_note": "Брендбук с. 19: дополнительная палитра, не рекомендуется вместе с базовой. В шаблоны и вкладку «Цвета» не входит без отдельного решения. У Aquamarine 2 в брендбуке HEX C9F2EA, а RGB 117, 249, 227 (= #75F9E3) — расхождение, уточнить у дизайнера.",
      "aquamarine": { "hex": "#18F4CF", "muted": "#C9F2EA" },
      "ultramarine": { "hex": "#0063FF", "muted": "#C9D9F2" },
      "magenta": { "hex": "#FF00FF", "muted": "#C067C0" },
      "carrot": { "hex": "#FF4517", "muted": "#DD7D64" },
      "coral": { "hex": "#FF0642", "muted": "#E25B7C" }
    },
    "replace": {
      "_note": "D1: чем заменить небрендовые цвета пакетов при починке (фаза 1). Серые подкаста — только после проверки на видео.",
      "#31D383": "green",
      "#F7F7F7": "white",
      "#F8F8F8": "white",
      "#D3D3D3": "gray",
      "#CECECE": "gray"
    },
    "pending": {
      "_note": "D1: сопоставить с брендбуком или утвердить как служебные.",
      "#8EE7BB": "мятный вебинаров",
      "#6CDFA6": "мятный вебинаров",
      "#343F48": "графит ae-motion-live, в брендбуке нет",
      "#8C959E": "серый стрелок ae-motion-live, в брендбуке нет"
    },
    "logoVariants": {
      "_note": "Брендбук с. 9 и 15: разрешённые сочетания логотипа и фона; другие запрещены. Монохромный белый логотип — только на фотофоне.",
      "onWhite": { "plate": "white", "wordmark": "black", "mark": "green" },
      "onGreen": { "plate": "green", "wordmark": "black", "mark": "black" },
      "onBlack": { "plate": "black", "wordmark": "white", "mark": "green" },
      "onBlackMono": { "plate": "black", "wordmark": "white", "mark": "white" }
    }
  },
  "type": {
    "_note": "PostScript-имена, как их ждёт AE в TextDocument.font. Semibold — со строчной b: файл называется SBSansDisplay-SemiBold.otf, а имя внутри — SBSansDisplay-Semibold (ae-quirks 187). Эталонная сборка (build) выбирается в фазе 0 по D16/D20; null — ещё не выбрана.",
    "fonts": {
      "displayRegular": { "postScriptName": "SBSansDisplay-Regular", "build": null, "seenOnThisPc": "1.002" },
      "displaySemibold": { "postScriptName": "SBSansDisplay-Semibold", "build": null, "seenOnThisPc": "1.002", "candidates": ["1.000", "1.002"] },
      "displayBold": { "postScriptName": "SBSansDisplay-Bold", "build": null, "seenOnThisPc": "1.002", "_note": "Брендбук с. 20 называет для SB Sans Display только Regular и SemiBold; Bold нужен стилю «Подкаст» (D15) — подтвердить" },
      "textRegular": { "postScriptName": "SBSansText-Regular", "build": null, "seenOnThisPc": "1.003" }
    },
    "fallback": "Verdana",
    "leading": { "normal": 1.2, "dense": 1.0, "_note": "Брендбук с. 23: обычный набор 120 %, плотный — интерлиньяж равен кеглю и отрицательный трекинг" },
    "scaleRule": "k = min(w, h) / 1080"
  },
  "video": {
    "fps": {
      "default": 25,
      "smm": 25,
      "_note": "D2: все шаблоны 25 fps; пресеты AME вебинаров 24 → 25; SMM 25, если площадки принимают, иначе SMM-мастера 30"
    },
    "formats": {
      "_note": "D3 и spec §4.3: FHD-мастер плюс 4K-вариант; SMM 1:1 — 1080×1080; 4:5 и 4:3 — по запросу. Совпадает с FORMATS в tools/library/estimate-weight.mjs.",
      "16x9": { "w": 1920, "h": 1080 },
      "16x9_4K": { "w": 3840, "h": 2160 },
      "9x16": { "w": 1080, "h": 1920 },
      "1x1": { "w": 1080, "h": 1080 },
      "4x5": { "w": 1080, "h": 1350, "onRequest": true },
      "4x3": { "w": 1440, "h": 1080, "onRequest": true }
    }
  },
  "logo": {
    "minHeightPx": 20,
    "clearSpaceOfMarkHeight": 0.5,
    "_note": "Брендбук с. 7: минимальный размер 20 px (по рисунку — высота знака); охранное поле X со всех сторон, X по рисунку — половина высоты знака; подложка совпадает с охранным полем. Логоблок с дескриптором — с. 11–15: отступ X одинаковый, между блоками 1 px."
  },
  "terms": {
    "descriptor": {
      "brandbook": "облачные сервисы и AI-технологии",
      "packages": "облачные и ИИ-сервисы",
      "_note": "Брендбук с. 11–16 называет строку рядом с логотипом дескриптором; текст в брендбуке отличается от текста в пакетах. Какой текст ставить — D22 / D5."
    },
    "slogans": {
      "values": ["умное облако", "есть где развернуться"],
      "_note": "В брендбуке 2.0 (cond) этих слоганов нет; брендбук упоминает только иностранные слоганы, построенные как логоблок (с. 11–12). Статус — D5 / D22."
    }
  },
  "qa": {
    "deltaE2000Max": 2,
    "ssimMin": 0.98,
    "_note": "Исходные пороги spec §4.4; утверждаются вместе с контрактом. Бюджет производительности — после повтора S8."
  }
}
```

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/tools/tokens.test.mjs`
Expected: `6 passed`.

- [ ] **Step 5: Отрендерить страницы брендбука для чтения**

Инструмент Read на этой машине PDF не рендерит (нет `pdftoppm`), поэтому страницы переводятся в PNG через PyMuPDF; он стоит в системном Python. Можно и просто открыть PDF в Acrobat на тех же страницах.

Run:
```bash
python -c "import fitz, os; d = fitz.open(r'C:/Users/Глеб/Documents/Брендбук/Материалы на анализ/Брендбук_Cloud.ru_2.0_cond.pdf'); os.makedirs('C:/CRBK/work/brandbook', exist_ok=True); [d[n - 1].get_pixmap(dpi=100).save('C:/CRBK/work/brandbook/p%02d.png' % n) for n in (2, 4, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24)]; print('pages', d.page_count)"
```
Expected: `pages 49`; в `C:/CRBK/work/brandbook/` — 19 файлов `pNN.png`.

- [ ] **Step 6: Создать помощник `tests/docs/markdown.mjs` и падающий тест `tests/docs/brandbook-rules.test.mjs`**

`tests/docs/markdown.mjs` — строки markdown-таблиц, ячейки делятся по неэкранированной `|`:

```js
// Table rows of a markdown document whose first cell matches `id`; cells split on unescaped pipes.
import { readFileSync } from 'node:fs';

export function readDoc(rel) {
  return readFileSync(new URL('../../' + rel, import.meta.url), 'utf8');
}

export function tableRows(md, id) {
  return md
    .split('\n')
    .filter((l) => l.startsWith('|'))
    .map((l) => l.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim()))
    .filter((cells) => id.test(cells[0]));
}
```

`tests/docs/brandbook-rules.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { readDoc, tableRows } from './markdown.mjs';

const md = readDoc('docs/decisions/brandbook-rules.md');

describe('docs/decisions/brandbook-rules.md', () => {
  it('gives every rule a brandbook page', () => {
    const rows = tableRows(md, /^[LBKPFG]\d+$/);
    expect(rows.length).toBeGreaterThanOrEqual(20);
    for (const r of rows) expect(r[2]).toMatch(/^\d+([–,] ?\d+)*$/);
  });
  it('names the descriptor and asks the owner six questions', () => {
    expect(md).toContain('облачные сервисы и AI-технологии');
    expect(md.match(/^\d\. /gm)).toHaveLength(6);
  });
});
```

Run: `npx vitest run tests/docs/brandbook-rules.test.mjs`
Expected: FAIL — `ENOENT: no such file or directory, open '…\docs\decisions\brandbook-rules.md'`.

- [ ] **Step 7: Создать `docs/decisions/brandbook-rules.md`**

```markdown
# Правила брендбука для BrandKit (D22)

**Источник:** `C:/Users/Глеб/Documents/Брендбук/Материалы на анализ/Брендбук_Cloud.ru_2.0_cond.pdf` — 49 страниц, PDF от 09.12.2025, на обложке «WIP». Номера — страницы PDF.

**Статус:** черновик. У каждой строки — номер страницы. Пометка «по рисунку» значит: в тексте брендбука правила нет, оно снято с иллюстрации; такие строки подтверждает дизайнер.

**Чего в файле нет:** раздела «Motion» (в оглавлении на с. 2 он есть, страниц нет) и слоганов «умное облако» и «есть где развернуться».

## Логотип

| # | Правило | Стр. | Как применяем |
|---|---|---|---|
| L1 | Логотип всегда в исходном виде, не искажается и не меняет построение | 7, 10 | Логотип в шаблонах — только из мастера (D18), без деформаций и эффектов |
| L2 | Охранное поле — модуль X со всех сторон; по рисунку X равен половине высоты знака | 7 | Плашки, текст и край кадра не заходят в охранное поле |
| L3 | Подложка под логотипом совпадает с габаритами охранного поля | 7 | Подложка логошота (D6) строится по охранному полю |
| L4 | Минимальный размер — 20 px; по рисунку меряется высота | 7 | Контракт C42: высота знака не меньше 20 px в каждом формате |
| L5 | Без подложки — только на контрастном однотонном фоне; рекомендуемый вариант — с белой подложкой; на пёстром фоне — только с подложкой | 8 | D6: прозрачный логошот поверх пёстрого видео нарушает правило — нужна подсказка или подложка по умолчанию |
| L6 | С фирменными фонами — только три сочетания: зелёный знак и чёрные буквы на белом; зелёный знак и белые буквы на чёрном; чёрный логотип на зелёном. Монохромный белый — только на фотофоне | 9 | `brand/tokens.json` → `color.logoVariants` |
| L7 | Нельзя: произвольно менять цвет букв, брать шрифтовую часть без знака, менять шрифт, искажать знак и логотип, менять композицию, применять эффекты | 10 | Вопрос дизайнеру: допустимы ли поп и флип куба (D19) как движение |

## Логоблок с дескриптором

| # | Правило | Стр. | Как применяем |
|---|---|---|---|
| B1 | Строка рядом с логотипом называется **дескриптор**; базовый логоблок — логотип и дескриптор на контрастной подложке, в одну или две строки | 11 | Термин «дескриптор» во всех документах (D22) |
| B2 | Текст дескриптора в брендбуке — «облачные сервисы и AI-технологии»; в пакетах — «облачные и ИИ-сервисы» | 11–16 | Вопрос владельцу бренда (ниже, п. 1) |
| B3 | Отступ X одинаковый для всего логоблока; между блоками 1 px | 11 | Риг шапки и логошота |
| B4 | Логоблок с иностранными слоганами строится так же | 11, 12 | Слоганы D5 — в той же схеме |
| B5 | Допустимо вертикальное построение; общая длина зависит от длины дескриптора; пропорции не нарушать | 12 | Логошот 9:16 |
| B6 | Растянутый логоблок: между логотипом и дескриптором линейный паттерн, блок тянется до края листа | 13 | «Шапка с бегущей штриховкой» вебинаров и курсов — это растянутый логоблок |
| B7 | a — ширина блока дескриптора вместе с отступами X, b — промежуток между логотипом и этим блоком. Если b меньше a, паттерна нет; если b не меньше a, паттерн обязателен. Высота штрихов равна высоте текста дескриптора; шаг около 1/4 ширины знака | 14 | Риг штриховки шапки |
| B8 | Покраска логоблока — только 4 варианта: белая подложка; зелёная; чёрная с зелёным знаком; чёрная с белым знаком. Другие запрещены | 15 | Список «тема» у логошота и шапки |
| B9 | Своего текста рядом с логотипом брендбук не разрешает явно: есть только дескриптор и иностранные слоганы той же схемы | 10–15 | D5: свой текст по умолчанию выключен (вопрос п. 3) |

## Кобрендинг

| # | Правило | Стр. | Как применяем |
|---|---|---|---|
| K1 | Логотипы партнёров равны по массе и разделены вертикальной линией толщиной в просвет знака; расстояние от x до 2x, x — высота знака | 17 | В v1 кобрендинга нет; правило — для будущих шаблонов |

## Палитра

| # | Правило | Стр. | Как применяем |
|---|---|---|---|
| P1 | Базовая палитра: Green #26D07C, Yellow #CFF500, Purple #A068FF, Blue #C0E0FC, Black #222222, White #FFFFFF, Gray #F2F2F2. Менять значения и брать нефирменные цвета запрещено | 18 | `color.base` в `brand/tokens.json` (D1) |
| P2 | Green, Yellow, Black и White — корневые цвета бренда | 18 | Лаймовый (#CFF500) текст SMM допустим (D1) |
| P3 | Дополнительная палитра — только по необходимости; сочетать её с базовой не рекомендуется | 19 | Не входит в шаблоны v1 |
| P4 | Опечатка: у Aquamarine 2 HEX C9F2EA, а RGB 117, 249, 227 (#75F9E3) | 19 | Уточнить у дизайнера, если цвет понадобится |

## Шрифты и сетка

| # | Правило | Стр. | Как применяем |
|---|---|---|---|
| F1 | SB Sans Display — Regular и SemiBold (заголовки, крупные цифры); SB Sans Text — Regular, Medium, SemiBold (подзаголовки, текст); SB Sans Interface — Regular и SemiBold (инфографика) | 20 | D15: стиль «Подкаст» берёт Display Bold — вне списка, вопрос п. 4 |
| F2 | Verdana — только если SB Sans использовать нельзя; SimSun и Pingfang — только иероглифы | 20 | Шаблоны без SB Sans не вставляются (spec §8.1) |
| F3 | Обычный набор: интерлиньяж 120 % кегля, трекинг 0. Плотный: интерлиньяж равен кеглю (100 %), трекинг −2. Значения даны для Figma | 23 | `type.leading` в `brand/tokens.json` |
| F4 | Крупные цифры — Display Regular или SemiBold; интерлиньяж 100 %, трекинг от −4 до −7. Значения даны для Figma | 22 | Таймер вебинара |
| G1 | Микромодуль 2 px: все размеры кратны 2; отступы от края кратны 10 px | 24 | Отступы в выражениях вёрстки (контракт C19) |
| G2 | Прямые углы — везде, где возможно; окончания штрихов квадратные, не круглые; скругления — только если они принципиальная часть метафоры или объекта | 4 | Контракт C43: проверка обводок и прямоугольников скриптом |

## Вопросы владельцу бренда (D22, D5, D15)

1. Какой текст дескриптора верный: «облачные сервисы и AI-технологии» (брендбук, с. 11–16) или «облачные и ИИ-сервисы» (пакеты)?
2. «Умное облако» и «есть где развернуться» — утверждённые слоганы? В брендбуке 2.0 (cond) их нет.
3. Можно ли ставить рядом с логотипом свой текст, например название вебинара? Брендбук этого не разрешает явно (с. 10–15).
4. Допустим ли SB Sans Display Bold в стиле подписи «Подкаст»? На с. 20 для Display указаны только Regular и SemiBold.
5. Поп и флип куба логотипа в анимации не нарушают запрет «менять композицию логотипа» (с. 10)?
6. Есть ли полная версия брендбука с разделом «Motion» (оглавление, с. 2)?

Сверил: ________, дата: ________

Сверено с PNG страниц брендбука: агент, 2026-10-02. Исправлено строк: 8 (L6, L7, B7, P1, P3, F3, F4, G2).
```

- [ ] **Step 8: Сверить каждую строку со страницей (вручную или агентом по PNG из шага 5)**

1. Открыть `C:/CRBK/work/brandbook/pNN.png` для каждой строки таблиц. Номер — в колонке «Стр.».
2. Если правило на странице другое, поправить строку. Строки с пометкой «по рисунку» сверить по иллюстрации (с. 7) и показать дизайнеру.
3. В конце файла вписать, кто сверил и когда.

- [ ] **Step 9: Запустить тесты канона**

Run: `npx vitest run tests/tools/tokens.test.mjs tests/docs/brandbook-rules.test.mjs`
Expected: `8 passed`.

- [ ] **Step 10: Commit**

```bash
git add brand/tokens.json docs/decisions/brandbook-rules.md tests/tools/tokens.test.mjs tests/docs/markdown.mjs tests/docs/brandbook-rules.test.mjs
git commit -m "docs(brand): draft brand tokens and brandbook rules" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 27: Лист решений D1–D25

Таблица решений spec §9: рекомендация, варианты, где доказательства, пустые колонки для решения пользователя и даты. Под ней — правило D19 для каждого из 12 типов движения (spec §3.3 п. 1). Ниже — другие утверждения фазы 0 (A1–A6) и вопросы владельцу по D16, D20, D21. Часть G (задача 30) закрывает фазу по этому листу.

**Files:**
- Create: `docs/decisions/phase0-decisions.md`
- Test: `tests/docs/decisions.test.mjs`

- [ ] **Step 1: Написать падающий тест `tests/docs/decisions.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { readDoc, tableRows } from './markdown.mjs';

const md = readDoc('docs/decisions/phase0-decisions.md');

describe('docs/decisions/phase0-decisions.md', () => {
  it('lists D1..D25 once each, with seven cells and empty decision columns', () => {
    const rows = tableRows(md, /^D\d+$/);
    expect(rows.map((r) => r[0])).toEqual(Array.from({ length: 25 }, (_, i) => 'D' + (i + 1)));
    for (const r of rows) {
      expect(r).toHaveLength(7);
      expect(r[2]).not.toBe('');
      expect(r[4]).not.toBe('');
    }
  });
  it('gives each of the 12 movement types rule 1 or 2 (D19)', () => {
    const section = md.split('### D19.')[1];
    expect(section).toBeDefined();
    const types = tableRows(section.split('\n## ')[0], /^M\d+$/);
    expect(types.map((r) => r[0])).toEqual(Array.from({ length: 12 }, (_, i) => 'M' + (i + 1)));
    for (const r of types) {
      expect(r).toHaveLength(6);
      expect(r[3]).toMatch(/^[12] — /);
    }
    expect(tableRows(md, /^D19$/)[0][2]).toContain('«D19. Канон движения по типам»');
  });
  it('lists the other phase 0 approvals', () => {
    expect(tableRows(md, /^A\d+$/).map((r) => r[0])).toEqual(['A1', 'A2', 'A3', 'A4', 'A5', 'A6']);
  });
  it('asks the owner concrete questions on D16, D20 and D21', () => {
    for (const id of ['D16', 'D20', 'D21']) {
      const section = md.split(`### ${id}.`)[1];
      expect(section).toBeDefined();
      const questions = section.split('\n### ')[0].match(/^\d\. .*\?/gm);
      expect(questions.length).toBeGreaterThanOrEqual(4);
    }
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run tests/docs/decisions.test.mjs`
Expected: FAIL — `ENOENT: no such file or directory, open '…\docs\decisions\phase0-decisions.md'`.

- [ ] **Step 3: Создать `docs/decisions/phase0-decisions.md`**

Если инвентаризация (задача 25) показала другие версии AE и Pr, поправить вопрос 2 к D20.

```markdown
# Решения фазы 0 (D1–D25)

**Как пользоваться.** Рекомендация — вариант по умолчанию из спецификации (§9). Пользователь вписывает в «Решение» номер варианта или свой текст и дату. Пустая ячейка значит, что решение не принято. Ссылки — относительно `docs/decisions/`.

**Статус:** черновик от 2026-10-02.

## Решения

| # | Решение | Рекомендация | Варианты | Доказательства | Решение пользователя | Дата |
|---|---|---|---|---|---|---|
| D1 | Палитра | Канон — брендбук 2.0: #26D07C, #222222, #FFFFFF, #F2F2F2, акценты #CFF500, #A068FF, #C0E0FC. Куб #31D383 → #26D07C; #F7F7F7 и #F8F8F8 → #FFFFFF; серый подкаста #D3D3D3 и #CECECE → #F2F2F2 после проверки на видео. Мятные #8EE7BB и #6CDFA6, а также #343F48 и #8C959E из ae-motion-live — сопоставить с брендбуком или утвердить служебными. Лаймовый текст SMM сохранить | 1) рекомендация; 2) серые подкаста оставить служебными; 3) мятные вебинаров заменить на #26D07C | `brandbook-rules.md` P1–P4 (с. 18–19); `../../brand/tokens.json`; `../research/2026-10-02/audit_*.json` (brand_elements) | | |
| D2 | Частоты кадров | Все шаблоны 25 fps; пресеты AME вебинаров 24 → 25; SMM-экспорт 25, если площадки принимают, иначе SMM-мастера в 30 | 1) 25 везде; 2) SMM в 30; 3) оставить как есть | spec §2 «Частоты кадров»; `../research/2026-10-02/media_inventory.txt`; `../research/2026-10-02/audit_reuse_ame.json` | | |
| D3 | Разрешения | MOGRT — FHD-мастер плюс 4K-вариант от конвейера, плагин выбирает по секвенции; SMM 1:1 — 1080×1080, как пресет экспорта | 1) рекомендация; 2) 1:1 в 1440×1440, как рендеры SMM; 3) без 4K | spec §4.3; `../research/2026-10-02/audit_smm.json`; `weight-estimate.md` | | |
| D4 | Выход подписи спикера | Дизайнерский из оригинала Titles: схлопывание вправо, вторая строка первой | 1) рекомендация; 2) зеркальный вход | `../research/2026-10-02/audit_logoshots_titles.json` | | |
| D5 | Подписи логошота | Дескриптор и слоганы «умное облако», «есть где развернуться»; свой текст — только если брендбук разрешает (явно не разрешает); добавить 9:16 для «есть где развернуться». Текст дескриптора — по D22 | 1) рекомендация; 2) только дескриптор; 3) плюс свой текст | `brandbook-rules.md` B1–B9 (с. 10–15), вопросы 1–3; `../research/2026-10-02/audit_logoshots_titles.json` | | |
| D6 | Фон логошота | Прозрачный по умолчанию; опция #222222 и #F2F2F2. Брендбук (с. 8): без подложки — только на однотонном контрастном фоне, поэтому панель подсказывает подложку на пёстром видео | 1) рекомендация; 2) подложка по умолчанию | `brandbook-rules.md` L3, L5 | | |
| D7 | QR вебинаров | Слот с QR канала Cloud.ru в Telegram по умолчанию | 1) рекомендация; 2) пустой слот | `../research/2026-10-02/audit_webinars.json` | | |
| D8 | Таймер | 1–15 минут, конечное состояние «Начинаем»; длину клипа задаёт поле «минуты» (`fit: trim`) | 1) рекомендация; 2) фиксированные 5 минут, как сейчас | spec §4.2 «Время»; `../research/2026-10-02/audit_webinars.json` (реверс таймера) | | |
| D9 | Рамка лекции | Статичный кадр и необязательная петля дрейфа 60 с; окно экрана в пропорции записи; окно спикера — по §6.1 | 1) рекомендация; 2) только статичный кадр | spec §6.1; `../research/2026-10-02/audit_courses.json`; `weight-estimate.md` (вес дрейфа) | | |
| D10 | Раскладки «со спикером» | Обе стороны через переключатель; 3:2 сохраняем | 1) рекомендация; 2) одна сторона | `../research/2026-10-02/audit_courses.json` | | |
| D11 | Размытие полей подкаста в Premiere | Клип корректирующего слоя из `prproj/CR_Templates.prproj`; запасной путь — `.prfpset` для ручного применения | 1) клип; 2) `.prfpset` | итог S7: `../../spikes/RESULTS.md` | | |
| D12 | Вертикальное интро подкаста | Найти исходник на Mac или T7; иначе пересобрать 1080×1920 по рендеру | 1) найти исходник; 2) пересобрать | `../research/2026-10-02/media_inventory.txt` (QuickTime Animation, 413 Мбит/с) | | |
| D13 | AI-ролики как визуал по умолчанию | Нет: пустые слоты с нейтральной заглушкой; ролики — отдельными медиа, если права позволяют (D21) | 1) рекомендация; 2) ролики по умолчанию | `../research/2026-10-02/audit_webinars.json`, `audit_smm.json` | | |
| D14 | Звук | Галочка «Музыка» по умолчанию выключена; «Звуковые эффекты» включена | 1) рекомендация; 2) обе выключены | spec §7 | | |
| D15 | Стили подписи спикера | «Титры» — SB Sans Text Regular; «Подкаст» — SB Sans Display Bold (имя) и Semibold (должность); «Вебинар» — SB Sans Display Regular. Шрифт закреплён за стилем | 1) рекомендация; 2) «Подкаст» на Display Semibold — Bold нет в списке брендбука | `brandbook-rules.md` F1 (с. 20), вопрос 4; `../research/2026-10-02/audit_podcast.json` | | |
| D16 | Лицензия SB Sans | Получить подтверждение на установку командой | — | вопросы владельцу ниже; `fonts-this-pc.json` | | |
| D17 | «Логошот нестандартный_оба сообщения» | Не восстанавливаем, если не найдётся исходник | 1) рекомендация; 2) пересобрать по описанию | `../research/2026-10-02/audit_logoshots_titles.json` | | |
| D18 | Мастер логотипа и подписей | Figma BAZIS (нужна авторизация коннектора Figma); сверить с ним геометрию 7 копий логотипа; иначе мастер — SVG из ae-motion-live после сверки | 1) Figma BAZIS; 2) SVG ae-motion-live | `../research/logo-geometry.md` (геометрия 7 копий логотипа против мастера, `tools/dump/logo-diff.mjs`); spec §2 «Дубли»; `brandbook-rules.md` L1 | | |
| D19 | Канон движения | Правило для каждого из 12 типов движения — в разделе «D19. Канон движения по типам» ниже: 1) одна каноническая кривая, кривые других пакетов заменяются; 2) кривая пакета остаётся стилем, риг берёт её по стилю. Поп куба сохраняется; правила ae-motion-live не переопределяют пакет. Числа — в фазе 1 по JSX-дампам | по типу движения: 1 или 2 (раздел ниже) | раздел «D19. Канон движения по типам»; spec §3.3 п. 1, §5, §9 D19; `../research/2026-10-02/audit_*.json` (animation_patterns); `brandbook-rules.md` вопрос 5 | | |
| D20 | Лицензии, обновления, парк | Выяснить тип лицензии, доступность обновлений до 26.5 и 27, срок работы без подписки; инвентаризация всех машин | — | вопросы владельцу ниже; `inventory.md` | | |
| D21 | Права на ассеты | Проверить стоковые SFX (SoundsCrate, SCIMach) и AI-ролики; персональные данные убрать из шаблонов; QR канала Cloud.ru в Telegram остаётся значением слота по умолчанию | — | вопросы владельцу ниже; `../research/2026-10-02/media_inventory.txt` | | |
| D22 | Правила брендбука | Охранное поле, минимальный размер, связки, свой текст и термин «дескриптор» — выписаны в `brandbook-rules.md`; один термин во всех документах | 1) принять `brandbook-rules.md`; 2) поправить | `brandbook-rules.md` (с. 7–24), вопросы 1–6 | | |
| D23 | Старые панели | `brandcolors` вливается во вкладку «Цвета»; Cloud.ru Motion Presets выводится из работы после v1; Cloud.ru Motion Export остаётся отдельным | 1) рекомендация; 2) оставить всё | spec §10 | | |
| D24 | Бюджет веса установщика | Утвердить бюджет на установку по умолчанию; 4K-петли и редкие форматы — отдельной опцией того же установщика; полный размер указывать отдельно. Черновая оценка: 5,25 ГБ по умолчанию и 12,56 ГБ опция в ProRes 4444; 1,34 и 2,09 ГБ в PNG в MOV | 1) бюджет = оценка по умолчанию с запасом; 2) сократить матрицу T2; 3) PNG в MOV по итогам S11 | `weight-estimate.md`, `weight-estimate-png.md`; `t2-matrix.draft.json`; итог S11: `../../spikes/RESULTS.md` | | |
| D25 | Субтитры курсов | Premiere: стиль «CR Субтитры» (SB Sans Text, белый, плашка #222222) в `prproj/CR_Templates.prproj`; AE: двухстрочная плашка на общем риге | 1) рекомендация; 2) только AE | итог S7: `../../spikes/RESULTS.md`; `../research/2026-10-02/audit_courses.json` | | |

### D19. Канон движения по типам

Правило выбирается для каждого типа движения (spec §3.3 п. 1, §9 D19):
- **1** — одна каноническая кривая: кривые других пакетов заменяются, эталоны этих пакетов в движении сверяются только просмотром;
- **2** — кривая пакета остаётся стилем: общий риг берёт её из выражения по выбранному стилю, а не из ключей.

Типы — 11 движений `.ffx` из spec §5 и поп куба логотипа. «Где встречается» — по `animation_patterns` в `../research/2026-10-02/audit_*.json`; полный список мест дадут JSX-дампы фазы 1. Числа кривых и таймингов вносятся в `../../brand/tokens.json` в фазе 1 по этим дампам, до сборки общих узлов. Там же правило подтверждается вместе со «Слиянием дизайнов» (spec §5). Поп и флип куба (M6, M12) — ещё и вопрос 5 владельцу бренда в `brandbook-rules.md`.

Пользователь вписывает в каждую строку 1, 2 или свой текст и дату.

| # | Тип движения | Где встречается | Рекомендация | Решение пользователя | Дата |
|---|---|---|---|---|---|
| M1 | Рост и схлопывание плашки по X | титры (подпись спикера), логошоты (подложка, плашки слоганов), подкаст (текст на плашке, булиты, CTA, QR, подпись спикера), SMM (плашки) | 2 — стиль: у пакетов разные кривые, а подпись спикера (D15) и «текст на плашке» (spec §5) и так выбирают стиль | | |
| M2 | Подъём текста по словам и по строкам (вход и выход) | титры (имя по словам, должность по строкам), подкаст (текст на плашке, булиты, подпись спикера, теги), SMM (плашки: вход и выход по словам; интро шортсов: по строкам), курсы (заголовки обложек по строкам) | 2 — стиль: семейство подъёма текста берёт кривую по тому же стилю, что и плашка (M1) | | |
| M3 | Подъём строк с затуханием | подкаст (CTA «Подписывайся!» по строкам, «О госте» по словам) | 1 — одна кривая: движение есть только в подкасте | | |
| M4 | Вскрытие маской (горизонтальное и вертикальное) | подкаст (по горизонтали — теги «Подкаст» и «Cloud.ru»; по вертикали — QR, окна контента, «О госте») | 1 — одна кривая на оба направления: движение есть только в подкасте | | |
| M5 | Поп с упругим ease | подкаст (точки заставки и дисклеймера, кубы Pattern_1). Упругий перелёт аудиты нашли только у попа куба (M12) | 1 — одна кривая на пресет; образец упругой кривой — поп куба (M12) | | |
| M6 | Флип куба | логошоты («Умное облако», «Есть где развернуться»), подкаст (копия «Есть где развернуться» в OUTRO) | 1 — одна кривая: подкаст повторяет логошот | | |
| M7 | Блочное проявление (Fractal Noise Block, бесшовное) | SMM (паттерн стрелок Pattern_strelki в интро шортсов); та же матта Fractal Noise Block — у мерцающей сетки (M9) | 1 — один тайминг смены блоков; цикл бесшовный | | |
| M8 | Пролёт рамки по Z с утончением обводки | подкаст (13 рамок-оверлеев) | 1 — одна кривая: движение есть только в подкасте | | |
| M9 | Мерцающая сетка | вебинары (PATTERN RACK в заставке и таймере со спикером), SMM (сетка «+» фонов) | 1 — одна скорость мерцания: техника одна, скорость разная (`time*40` и `time*50`) | | |
| M10 | Бесшовный дрейф | курсы (уголки оверлеев, петля 60 с), SMM (вырезы рамок-оверлеев), вебинары (портал заставок, таймеров и анонса 1:1) | 1 — одна кривая дрейфа; период и амплитуда — параметры шаблона | | |
| M11 | Бегущая штриховка | вебинары («Логоблок с челкой»), курсы (шапки обложек) | 1 — одна кривая: в обоих пакетах штриховка одинаковая | | |
| M12 | Поп куба логотипа | логошоты («без саблайна» и «без саблайна с плашкой», вертикальные обёртки) | 1 — канон бренда, закреплён spec D19: поп сохраняется как есть, вместе с перелётом; стоп-лист ae-motion-live его не отменяет | | |

## Другие утверждения фазы 0

| # | Что | Где | Решение пользователя | Дата |
|---|---|---|---|---|
| A1 | Бренд-канон (`brand/tokens.json`): палитра, шрифты, форматы, fps; эталонная сборка шрифта | `../../brand/tokens.json`, `fonts-this-pc.json` | | |
| A2 | Контракт шаблона | `../contract/template-contract.md` | | |
| A3 | Схема `library.src.json` и `library.json` | `../../tools/library/schema/`, `../library/example.src.json` | | |
| A4 | Пороги QA: ΔE2000 ≤ 2, SSIM ≥ 0,98 на неизменённых областях; бюджет производительности — после повтора S8 | spec §4.4; `../contract/template-contract.md` | | |
| A5 | Каркас панели: Bolt CEP или свой Vite (мульти-хост `manifest.xml`, подписанный ZXP) | `panel-framework.md`; spec §6 | | |
| A6 | Самая слабая машина для S8 | `inventory.md` | | |

## Вопросы владельцу

### D16. Лицензия SB Sans

1. Кто держатель лицензии на SB Sans у Cloud.ru (договор с ParaType или со Сбером) и на сколько рабочих мест?
2. Распространяется ли лицензия на видеопроизводство: текст в роликах и рендерах? Файлы шрифтов в библиотеку и MOGRT не кладутся.
3. Можно ли IT ставить SB Sans «для всех пользователей» на все машины видеокоманды, включая подрядчиков?
4. Какая сборка официальная и где взять дистрибутив? На этой машине: Display Regular, Semibold и Bold — 1.002, Text Regular — 1.003 (`fonts-this-pc.json`); в проектах с Mac записана 1.000.

### D20. Лицензии, обновления, парк

1. Какой тип подписки Adobe у команды (корпоративная VIP, Enterprise, личные) и активна ли она после 7 июля 2026?
2. На этой машине AE 26.5, Pr 26.5.2 и AME 26.5.2 пришли 2 октября 2026 (spec §1.1 п. 6; `inventory.md`). Есть ли эти версии на машинах команды и по какому каналу они пришли: Creative Cloud desktop, установщик от IT или другой? Доступно ли обновление до 27.0?
3. Если подписка отключена: сколько программы проработают без неё и кто это проверял?
4. Кто запускает `tools/inventory/inventory.ps1` и `inventory.sh` на машинах команды и к какой дате JSON-файлы лежат в `docs/decisions/inventory/`?
5. Разрешает ли IT самоподписанное CEP-расширение и ключ PlayerDebugMode на машинах команды?
6. Есть ли у монтажёров права администратора (установка шрифтов, UDT для S9)?

### D21. Права на ассеты

1. Есть ли лицензии на звуки SoundsCrate и SCIMach из пакета подкаста и на каких условиях (бессрочно, на проект, на команду)?
2. AI-ролики (Seedance, Kling, «robotic arm…»): какой тариф сервиса был при генерации, разрешено ли коммерческое и повторное использование в шаблонах?
3. Музыка вебинаров и курсов (`Music vebinar.mp3`, `Музыка вебинар 5 минут.mp3`, `Music Intro.mp3`): откуда она и какая лицензия?
4. Фото спикеров и QR гостей и ведущих (папки `2_Вебинары/(Footage)/Folder/Img` и `6_Podcast_Cloud.ru_Pack/(Footage)/QR`): согласны ли убрать их из шаблонов как персональные данные?
5. QR канала Cloud.ru в Telegram: актуальная ссылка и кто её владелец?
6. Кто подписывает итоговый список ассетов, которые можно класть в библиотеку?
```

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/docs/decisions.test.mjs`
Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add docs/decisions/phase0-decisions.md tests/docs/decisions.test.mjs
git commit -m "docs(decisions): phase 0 decision sheet D1-D25" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 28: Контракт шаблона — нумерованный чек-лист

Spec §4.2 превращается в 43 правила. У каждого — режим проверки:
- `авто: tplProblems` — скриптом в AE, расширенный `G.tplProblems` из ae-motion-live, пишется в фазах 1–2;
- `авто: QA-гейт` — шагом конвейера; часть правил уже проверяет `validate.mjs` из задачи 22;
- `просмотр` — человеком.

Правила C42 и C43 добавлены из брендбука (D22). В C27 механизм длины экземпляра в AE вписывается при закрытии фазы 0 (задача 30) из итога S3 (задача 14, часть C). Внизу — пороги QA и ссылки на документацию API, на которых стоят проверки. Идентификатор Classic 3D (`ADBE Advanced 3d`) взят из ответа сообщества и подтверждается на AE 26.x при написании проверки.

**Files:**
- Create: `docs/contract/template-contract.md`
- Test: `tests/docs/contract.test.mjs`

- [ ] **Step 1: Написать падающий тест `tests/docs/contract.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { readDoc, tableRows } from './markdown.mjs';

const md = readDoc('docs/contract/template-contract.md');
const rules = tableRows(md, /^C\d\d$/);
const MODES = ['авто: tplProblems', 'авто: QA-гейт', 'просмотр'];

describe('docs/contract/template-contract.md', () => {
  it('numbers the rules C01..Cnn without gaps', () => {
    expect(rules.length).toBeGreaterThanOrEqual(40);
    rules.forEach((r, i) => expect(r[0]).toBe('C' + String(i + 1).padStart(2, '0')));
  });
  it('marks every rule with one check mode and a planned check', () => {
    for (const r of rules) {
      expect(r).toHaveLength(5);
      expect(MODES).toContain(r[2]);
      expect(r[3]).not.toBe('');
      expect(r[4]).not.toBe('');
    }
  });
  it('keeps the font names exact', () => {
    expect(md).toContain('`SBSansDisplay-Semibold` (строчная b)');
    expect(md).not.toMatch(/SBSansDisplay-SemiBold/);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run tests/docs/contract.test.mjs`
Expected: FAIL — `ENOENT: no such file or directory, open '…\docs\contract\template-contract.md'`.

- [ ] **Step 3: Создать `docs/contract/template-contract.md`**

```markdown
# Контракт шаблона BrandKit

**Статус:** черновик от 2026-10-02, утверждается в фазе 0 (лист решений, A2). Источник — spec §4.2; пороги — spec §4.4; правила бренда — `docs/decisions/brandbook-rules.md`.

**Режимы проверки:**
- `авто: tplProblems` — скрипт в AE читает мастер и его варианты. Это расширенный `G.tplProblems` из ae-motion-live; пишется в фазах 1–2. Сейчас он умеет C21 и C34 и половину C07.
- `авто: QA-гейт` — шаг конвейера (spec §4.4, п. 6): настройки проекта, рендер, файлы. Сюда же входит валидатор библиотеки `tools/library/validate.mjs`, он уже готов.
- `просмотр` — проверяет человек: дизайнер или ревьюер мастера.

Слои и контролы называются так же, как в фикстуре пробных сборок: `TXT_<ПОЛЕ>`, `CTRL`, `SLOT_<ПОЛЕ>`, `QA_PATCH`. Внутренние имена эффектов на `CTRL` — ASCII (`Duration`, `QA`, `Style`).

| № | Правило | Проверка | Как проверяем | Источник |
|---|---|---|---|---|
| C01 | Мастер-композиция называется `CR_<КОД>_<Элемент>`, код — LOGO, TTL, WEB, CRS, SMM, POD, TRN или BG; пресеты — `CR_FX_<Имя>` | авто: tplProblems | имя мастера соответствует `^CR_(LOGO\|TTL\|WEB\|CRS\|SMM\|POD\|TRN\|BG)_[A-Za-z0-9]+$`; имена `.ffx` — шаблону `CR_FX_<Имя>` | §4.2 «Имена» |
| C02 | Вложенные композиции называются от мастера: `CR_<КОД>_<Элемент>_<Часть>` | авто: tplProblems | каждая композиция, до которой можно дойти от мастера через `layer.source`, начинается с имени мастера и `_` | §4.2 «Имена» |
| C03 | У вариантов и зависящих от формата вложенных композиций — суффикс формата (`_16x9`, `_16x9_4K`, `_9x16`, `_1x1`), у всех композиций шаблона — суффикс версии `_v<N>`; ставит конвейер | авто: QA-гейт | после нарезки (шаг 2): все композиции `<id>_v<N>.aep` оканчиваются на `_v<N>`; композиции вариантов — на `_<формат>_v<N>`; в `library.json` `aeComp` оканчивается на `_v<version>` (validate.mjs, правило `ae-comp`) | §4.2, §4.4 шаги 1–2 |
| C04 | Имена всех элементов проекта уникальны | авто: tplProblems | нет двух элементов проекта с одним именем и двух слоёв с одним именем в одной композиции | §4.2 «Имена» |
| C05 | Слои `TXT_` и `CTRL` лежат на верхнем уровне мастера | авто: tplProblems | `TXT_*` и `CTRL` есть в мастере и не встречаются во вложенных композициях | §4.2 «Структура» |
| C06 | Мастер плоский: раскладочные слои наверху, прекомпы только для частей, не зависящих от формата | просмотр | ревью мастера по JSX-дампу: прекомп с выражениями от `thisComp.width/height` — повод разобрать | §4.2 «Структура» |
| C07 | Каждому полю `library.src.json` типа text соответствует слой `TXT_<ПОЛЕ>`, и наоборот | авто: tplProblems | ключи полей в верхнем регистре против имён слоёв `TXT_*`; нынешний `G.tplProblems` ловит только пропавшие слои, обратную сторону добавить | §4.2 «Тексты» |
| C08 | Один стиль на поле | авто: tplProblems | `TextDocument.characterRange(0, длина)` (AE 24.3+): `font`, `fontSize`, `fillColor` не `undefined` (смешанное значение читается как `undefined`) | §4.2 «Тексты» |
| C09 | Point-текст, без пустых абзацев для отступа | авто: tplProblems | `TextDocument.pointText === true`; текст не начинается и не кончается переносом и не содержит двух переносов подряд | §4.2 «Тексты» |
| C10 | Если у каждой строки своя плашка, строки — отдельные поля и слои `TXT_LINE1…TXT_LINE3`, без переносов внутри | авто: tplProblems | в тексте слоёв `TXT_LINE<n>` нет переносов строки | §4.2 «Тексты» |
| C11 | Пустая строка скрывает свою плашку; явные переносы внутри поля — только там, где у строк нет своих плашек | просмотр | случай с пустой строкой в `<id>.ref.json`, рендер и просмотр бок о бок | §4.2 «Тексты», §3.2 |
| C12 | Слой `CTRL`, не больше 8 контролов: dropdown, checkbox, slider. Текстовые поля, слоты, флажок `QA` и слайдер `Duration` в лимит не входят | авто: tplProblems | на `CTRL` эффектов-списков (`property(1).isDropdownEffect === true`: в AE 26.5 match name списка — `Pseudo/@@<id>`, свой у каждого экземпляра) и эффектов с match name `ADBE Checkbox Control`, `ADBE Slider Control`, кроме `QA` и `Duration`, не больше 8 | §4.2 «Контролы» |
| C13 | У каждого слайдера есть границы | авто: QA-гейт | в `library.src.json` у поля slider есть `min` и `max`, `min < max` (validate.mjs: схема и правило `field-default`) | §4.2, §4.4 |
| C14 | Внутренние имена контролов ASCII; в Essential Graphics — русские имена из `egpName` | авто: tplProblems | имена эффектов на `CTRL` соответствуют `^[A-Za-z0-9_]+$`; множество `comp.getMotionGraphicsTemplateControllerName(i)` (AE 16.1+; индексы с 1, новейший контроллер первым — S1 на AE 26.5) равно множеству `egpName` элемента | §4.2 «Контролы», §4.4 |
| C15 | Point- и angle-контролы не используются | авто: tplProblems | на `CTRL` нет `ADBE Point Control`, `ADBE Point3D Control`, `ADBE Angle Control` | §4.2 «Контролы» |
| C16 | Цвет — только выпадающим списком палитры, без color picker | авто: tplProblems | на `CTRL` нет `ADBE Color Control` | §4.2 «Контролы» |
| C17 | Source Text без управления шрифтом: шрифт закреплён за стилем | просмотр | в панели Essential Graphics у свойств Source Text выключены переключатели шрифта (скриптом не задаются, spec §1.1) | §4.2 «Контролы» |
| C18 | Плашки и окна подстраиваются под текст через `sourceRectAtTime`, замер в момент покоя или по скрытой копии `MEASURE_<ПОЛЕ>` | авто: tplProblems | вызов `sourceRectAtTime` с текущим временем (`time` или без аргумента) идёт только к слою `MEASURE_*` без аниматоров; у остальных вызовов время — константа | §4.2 «Вёрстка» |
| C19 | Отступы — выражениями от размера кадра; размеры кратны 2 px, отступы от края кратны 10 px | просмотр | ревью выражений вёрстки по JSX-дампу варианта; сетка брендбука, с. 24 | §4.2 «Вёрстка», `brandbook-rules.md` G1 |
| C20 | Кегли под формат ставит конвейер: кегль варианта = кегль мастера × k, k = min(ширина, высота) / 1080 | авто: QA-гейт | после шага 1 `TextDocument.fontSize` каждого `TXT_` в варианте равен значению мастера × k с точностью 0,5 px | §4.2, §4.4 шаг 1 |
| C21 | Маркеры `in` и `out` на мастере: 0 < in < out ≤ длительность | авто: tplProblems | есть в нынешнем `G.tplProblems` | §4.2 «Время» |
| C22 | `fit: rdt` — только со статичной серединой: защищённые интро и аутро, середина растягивается | авто: tplProblems | маркеры с `MarkerValue.protectedRegion === true` (AE 16.0+) покрывают [0, in] и [out, конец]; QA-гейт сравнивает кадры in+1 и out−1 (SSIM ≥ 0,999 — середина статична) | §4.2 «Время» |
| C23 | `fit: trim` — у шаблонов с движением в середине и со слотом, принимающим видео; композиция максимальной длины, панель обрезает клип | авто: tplProblems | у `trim`-мастера нет защищённых областей, длительность не меньше максимальной длины вставки; слот с видео требует `trim` (validate.mjs, правило `media-fit`) | §4.2 «Время» |
| C24 | Служебный слайдер `Duration` («Длительность (служебное, не менять)») выведен в Essential Graphics, в форме панели скрыт; выражения считают время от него | авто: tplProblems | на `CTRL` есть `ADBE Slider Control` с именем `Duration`, в EGP есть контроллер с его `egpName`; в `library.src.json` поле `service: true`, `editable: false` (validate.mjs, `service-field`) | §4.2 «Время», §4.4 |
| C25 | Поле с `drivesDuration` (минуты таймера) задаёт и контрол, и длину вставки; такое поле одно | авто: QA-гейт | validate.mjs, правило `drives-duration` | §4.2 «Время», §6.1 |
| C26 | Внутри мастера нет удержаний через time remap и обратного воспроизведения; у слоёв нулевой старт и растяжение 100 % | авто: tplProblems | у всех слоёв мастера и его вложенных композиций `timeRemapEnabled === false`, `stretch === 100`, `startTime === 0` | §4.2 «Время» |
| C27 | Длина на слое экземпляра в композиции пользователя подгоняется одним механизмом по `fit`; механизм выбирает S3 | авто: QA-гейт | приёмочная часть: каждый вариант вставляется в тестовую композицию длиннее и короче шаблона, кадры на in и out совпадают с мастером (SSIM ≥ 0,98). Механизм (растяжение слоя, сдвиг out point или time remap) берётся из поля `mechanism` в `spikes/results/S3.data.json` (S3, часть C) и вписывается сюда при закрытии фазы 0 | §4.2 «Время», S3 |
| C28 | Фото, QR и видео — только через слоты Media Replacement; футажа вне слотов нет | авто: tplProblems | каждый слой с файловым футажом называется `SLOT_<ПОЛЕ>` и соответствует полю type media; число таких слоёв равно числу полей media | §4.2 «Медиа» |
| C29 | Опорные кадры — только guide-слоями в рабочих копиях; в файлах библиотеки их нет | авто: QA-гейт | в `<id>_v<N>.aep` нет слоёв с `guideLayer === true` и футажом | §4.2 «Медиа» |
| C30 | Classic 3D | авто: QA-гейт | `comp.renderer` у всех композиций элемента равен идентификатору Classic 3D: по сообществу Adobe это `ADBE Advanced 3d`, значение подтвердить по `comp.renderers` на AE 26.x | §4.2 «Техника» |
| C31 | Только встроенные эффекты, поддерживаемые в MOGRT: без Camera-Shake Deblur, Synthetic Aperture Color Finesse, Maxon CINEWARE, Puppet, Warp Stabilizer; без футажа через Dynamic Link и FLV | авто: QA-гейт | match name каждого эффекта входит в список встроенных (дамп `app.effects` на AE 26.x без сторонних плагинов; на машине разработки стоит ReelSmart Motion Blur — в список не берётся) и не входит в пять запрещённых; у футажа нет расширения `.flv` и ссылок Dynamic Link | §4.2, §1.1 п. 5 |
| C32 | Выражения пишутся под JavaScript-движок и проверяются в обоих движках | авто: QA-гейт | `app.project.expressionEngine` по очереди `javascript-1.0` и `extendscript` (AE 16.0+): `Property.expressionError` пуст везде, ключевые кадры рендерятся в обоих | §4.2, §4.4 шаг 6 |
| C33 | Эффекты в выражениях — по своему ASCII-имени или match name, параметры — по индексу; локализованные имена запрещены | авто: tplProblems | в тексте выражений нет `effect("…")("…")` (параметр по имени) и стандартных имён вроде `"Slider Control"`, `"Ползунок"`; пример правильного обращения: `effect("Duration")(1)` | §4.2 «Техника» |
| C34 | Без звука внутри | авто: tplProblems | есть в нынешнем `G.tplProblems`: нет слоёв с `hasAudio && audioEnabled` | §4.2 «Техника» |
| C35 | Motion blur выключен по умолчанию | авто: tplProblems | `comp.motionBlur === false` и `layer.motionBlur === false` у всех слоёв | §4.2 «Техника» |
| C36 | Нативные размеры: текст 100 %, реальные кегли, без масштабирующих нулей | авто: tplProblems | масштаб слоёв `TXT_` — 100 %; ни один нуль-родитель слоёв `TXT_` не масштабирован | §4.2 «Техника» |
| C37 | Шрифты по PostScript-именам: `SBSansDisplay-Semibold` (строчная b), `SBSansDisplay-Regular`, `SBSansDisplay-Bold`, `SBSansText-Regular`; сборка — эталонная из `brand/tokens.json` | авто: QA-гейт | `app.project.usedFonts` (AE 24.5+) входит в `requiredFonts` элемента; `FontObject.version` совпадает со сборкой; `isSubstitute === false` (AE 24.0+) | §4.2 «Шрифты», §8.1 |
| C38 | Цветовой патч `QA_PATCH` в каждом мастере — обычный слой, не guide; включается скрытым флажком `QA` на `CTRL`, который не выводится в Essential Graphics и не входит в лимит; в релизных файлах выключен | авто: tplProblems | `QA_PATCH` есть, `guideLayer === false`, его выражение непрозрачности ссылается на `QA`; среди контроллеров EGP нет `QA`; QA-гейт: в релизных `.aep` и MOGRT флажок `QA` выключен | §4.2 «Цветовой патч» |
| C39 | Имена файлов библиотеки и шаблонов — ASCII (латиница, цифры, `_`, `-`), не длиннее 64 символов | авто: QA-гейт | validate.mjs, правило `file-name`, и обход папки релиза | §4.2 «Файлы» |
| C40 | Один элемент на `.aep` со всеми форматами; сохранение в AE 26 | авто: QA-гейт | все композиции `<id>_v<N>.aep` начинаются с имени мастера элемента; при сохранении `app.version` начинается с `26.` | §4.2 «Файлы» |
| C41 | NFC — в рабочих копиях пакетов, где остаётся кириллица | авто: QA-гейт | «доктор пакета» (spec §3.2): у каждого имени файла `name === name.normalize('NFC')` | §4.2 «Файлы» |
| C42 | Логотип — только из мастера (D18); охранное поле X = половина высоты знака; высота знака не меньше 20 px в каждом формате | просмотр | ревью мастера; правила `brandbook-rules.md` L1–L4 (с. 7) | D22 |
| C43 | Прямые углы и квадратные окончания: обводки без скруглений, прямоугольники без радиуса | авто: tplProblems | у обводок `ADBE Vector Stroke Line Cap` и `ADBE Vector Stroke Line Join` не «Round» (номер пункта снять с эталонного слоя на AE 26.x); у прямоугольников `ADBE Vector Rect Roundness` = 0 | `brandbook-rules.md` G2 (с. 4) |

## Пороги QA

Утверждаются вместе с контрактом (A4), исходные значения — spec §4.4.

| Порог | Значение | Где проверяется |
|---|---|---|
| ΔE2000 цветового патча: рендер AE против T2-рендера и MOGRT в Premiere | ≤ 2 | QA-гейт (автоматическая и приёмочная части) |
| SSIM с эталоном на неизменённых областях | ≥ 0,98 | QA-гейт, сверка по spec §3.2 |
| Бесшовность петли: кадр N против кадра 0 | SSIM ≥ 0,999 (предложение; в spec «≈ 1») | QA-гейт, шаг 5 |
| Бюджет производительности | число после повтора S8 на первых мастерах | приёмочная часть |
| Вес установки по умолчанию | бюджет D24 | приёмочная часть |

## API, на которые опираются проверки

Сверено с документацией 2026-10-02. Версия в скобках — с какой версии AE есть вызов.

- `TextDocument.characterRange()` (24.3), смешанное значение — `undefined`: <https://ae-scripting.docsforadobe.dev/text/characterrange/> — C08.
- `TextDocument.pointText`, `fontSize`: <https://ae-scripting.docsforadobe.dev/text/textdocument/> — C09, C20.
- `CompItem.renderer`, `motionBlur`, `getMotionGraphicsTemplateControllerName()` (16.1): <https://ae-scripting.docsforadobe.dev/item/compitem/> — C14, C30, C35.
- Идентификатор Classic 3D `ADBE Advanced 3d` — ответ сообщества, не документация: <https://community.adobe.com/t5/after-effects-discussions/is-it-possible-to-modify-render-engine-with-script/m-p/10498490> — C30.
- `MarkerValue.protectedRegion` (16.0): <https://ae-scripting.docsforadobe.dev/other/markervalue/> — C22.
- `Layer.startTime`, `stretch`: <https://ae-scripting.docsforadobe.dev/layer/layer/> — C26.
- `AVLayer.timeRemapEnabled`, `guideLayer`, `hasAudio`, `audioEnabled`, `motionBlur`: <https://ae-scripting.docsforadobe.dev/layer/avlayer/> — C26, C29, C34, C35.
- `Project.expressionEngine` (16.0), `usedFonts` (24.5): <https://ae-scripting.docsforadobe.dev/general/project/> — C32, C37.
- `FontObject.version`, `isSubstitute` (24.0): <https://ae-scripting.docsforadobe.dev/text/fontobject/> — C37.
- `app.effects`, `app.version`: <https://ae-scripting.docsforadobe.dev/general/application/> — C31, C40.
- `Property.expressionError`: <https://ae-scripting.docsforadobe.dev/property/property/> — C32.
- Match names обводки и прямоугольника: <https://ae-scripting.docsforadobe.dev/matchnames/layer/shapelayer/> — C43.
```

- [ ] **Step 4: Запустить тест и весь набор**

Run: `npx vitest run tests/docs/contract.test.mjs`
Expected: `3 passed`.

Run: `npm test`
Expected: все тесты зелёные; из них 65 — тесты части F (9 файлов).

- [ ] **Step 5: Commit**

```bash
git add docs/contract/template-contract.md tests/docs/contract.test.mjs
git commit -m "docs(contract): template contract checklist" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Часть G. Каркас панели и закрытие фазы 0

Задача 29 выбирает каркас панели: Bolt CEP или свой конфиг Vite (spec §3.3 п. 6, §6, строка A5 листа решений). Задача 30 закрывает фазу 0: итог каждой пробной сборки сводится к «да» или «нет» с выбранным путём, пользователь подписывает решения D1–D25 и A1–A6, правило C27 контракта получает механизм длины из S3.

**Зависимости.**
- Часть A: vitest и adm-zip (задача 1), dev-панель и её манифест (задача 4) — образец манифеста для своего Vite, `readResults` и `RESULTS_DIR` (задача 6).
- Части B–E: итоги S1–S11 в `spikes/results/`. S3 (задача 14) пишет в `spikes/results/S3.data.json` поле `mechanism` (`rdt`, `remap` или `trim-only`) — его берёт C27.
- Часть F: `tests/docs/markdown.mjs` (задача 26), лист решений `docs/decisions/phase0-decisions.md` (задача 27), контракт `docs/contract/template-contract.md` (задача 28).
- План 2, задача 7: `docs/research/logo-geometry.md` (D18).

**Проверенные факты для задачи 29** (2 октября 2026):
- **Bolt CEP** (github.com/hyperbrew/bolt-cep, `create-bolt-cep` 2.2.3, `vite-cep-plugin` 2.2.3).
  - Проект создаёт `npx create-bolt-cep`: вопросы о папке, Display Name, id, фреймворке (Svelte, React, Vue) и приложениях (`aeft`, `ppro` и др.), установке зависимостей и примерах кода. Аргументы описаны и флагами (`--displayName`, `--id`, `--framework`, `--apps`, `--installDeps`, `--sampleCode`), но без вопросов он запускается не наверняка.
  - `npm run build` собирает `dist/cep` и делает ссылку в папку расширений; `npm run zxp` кладёт подписанный ZXP в `dist/zxp/`.
  - Настройки — в `cep.config.ts`: `hosts: [{ name: "AEFT", version: "[0.0,99.9]" }, …]`, `panels`, `zxp: { country, province, org, password, tsa: ["http://timestamp.digicert.com/", "http://timestamp.apple.com/ts01"], allowSkipTSA: false, … }`. Нужны Node 18+ и Adobe 2024+.
  - ZXPSignCmd встроен в `node_modules/vite-cep-plugin/lib/bin`. С `vite-cep-plugin` 1.2.9 в нём исправление Adobe после поломки меток времени 18 апреля 2025.
- **ZXPSignCmd 4.1.3** — github.com/Adobe-CEP/CEP-Resources, ветка `master`, папка `ZXPSignCMD/4.1.3/` (`Win32`, `macOS`, `x64/ZXPSignCmd.exe`). Команды:
  - `-selfSignedCert <страна> <регион> <организация> <имя> <пароль> <файл.p12> [-validityDays N]`;
  - `-sign <папка> <файл.zxp> <файл.p12> <пароль> -tsa <url>`;
  - `-verify <файл.zxp> -certinfo`.
- **Шаблона Preact в Bolt нет.** Проверяется шаблон React с алиасом `react` → `preact/compat` (spec §6: Preact).

**Файлы части G:**

```text
tools/panel/manifest-info.mjs, tools/panel/zxp-info.mjs, tools/panel/inspect.mjs
tools/decisions/closure.mjs, tools/decisions/closure-cli.mjs
spikes/panel-trial/vite/   package.json, vite.config.mjs, index.html, src/main.js, public/CSXS/manifest.xml
docs/decisions/            panel-framework.md, phase0-closure.md (создаёт closure-cli.mjs)
tests/tools/               panel-manifest.test.mjs, panel-zxp.test.mjs, closure.test.mjs
tests/docs/                panel-framework.test.mjs
вне репозитория            C:/CRBK/tools/ZXPSignCmd/4.1.3/, C:/CRBK/work/panel-trial/ (проба Bolt, сертификат и пароль пробы)
```

### Task 29: Каркас панели — Bolt CEP или свой Vite (A5)

Два критерия spec §6:
- **K1** — один `CSXS/manifest.xml`, и панель работает в AE и в Premiere;
- **K2** — подписанный ZXP: самоподписанный сертификат, метка времени, `ZXPSignCmd -verify` проходит.

Остальное — наблюдения для выбора, если оба варианта проходят оба критерия: Preact, цель сборки Chromium 99, размер ZXP, число зависимостей, какой ZXPSignCmd подписывает.

В репозиторий идут две проверки с тестами — манифест и ZXP; на них же потом опирается сборка релиза. Ещё в репозиторий идёт проба своего Vite (пять маленьких файлов) и запись решения `docs/decisions/panel-framework.md`. Проба Bolt генерируется в `C:/CRBK/work/panel-trial/bolt` и в git не попадает. Сертификат пробы и пароль лежат в `C:/CRBK/work/panel-trial/` и в git не попадают никогда.

**Files:**
- Create: `tools/panel/manifest-info.mjs`, `tools/panel/zxp-info.mjs`, `tools/panel/inspect.mjs`
- Create: `spikes/panel-trial/vite/package.json`, `spikes/panel-trial/vite/vite.config.mjs`, `spikes/panel-trial/vite/index.html`, `spikes/panel-trial/vite/src/main.js`, `spikes/panel-trial/vite/public/CSXS/manifest.xml`
- Create: `docs/decisions/panel-framework.md`
- Test: `tests/tools/panel-manifest.test.mjs`, `tests/tools/panel-zxp.test.mjs`, `tests/docs/panel-framework.test.mjs`

- [ ] **Step 1: Написать падающий тест `tests/tools/panel-manifest.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { manifestInfo, readManifest, coversHosts, effectiveHosts } from '../../tools/panel/manifest-info.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// A CEP manifest: bundle hosts, and extensions that may carry their own HostList.
function manifest({ hosts, extensions }) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ExtensionManifest ExtensionBundleId="ru.cloud.brandkit.trial" ExtensionBundleVersion="0.0.1" Version="11.0">',
    '  <ExtensionList>',
    ...extensions.map((e) => '    <Extension Id="' + e.id + '" Version="0.0.1" />'),
    '  </ExtensionList>',
    '  <ExecutionEnvironment>',
    '    <HostList>',
    ...hosts.map((h) => '      <Host Name="' + h + '" Version="[26.0,99.9]" />'),
    '    </HostList>',
    '    <RequiredRuntimeList><RequiredRuntime Name="CSXS" Version="11.0" /></RequiredRuntimeList>',
    '  </ExecutionEnvironment>',
    '  <DispatchInfoList>',
    ...extensions.map((e) => [
      '    <Extension Id="' + e.id + '">',
      e.own ? '      <HostList>' + e.own.map((h) => '<Host Name="' + h + '" Version="[26.0,99.9]" />').join('') + '</HostList>' : '',
      '      <DispatchInfo>',
      '        <Resources>',
      '          <MainPath>./' + e.id + '/index.html</MainPath>',
      '          <CEFCommandLine><Parameter>--enable-nodejs</Parameter><Parameter>--mixed-context</Parameter></CEFCommandLine>',
      '        </Resources>',
      '        <UI><Type>Panel</Type></UI>',
      '      </DispatchInfo>',
      '    </Extension>',
    ].join('\n')),
    '  </DispatchInfoList>',
    '</ExtensionManifest>',
  ].join('\n');
}

describe('manifestInfo', () => {
  it('reads the bundle, the runtime, the hosts and each extension', () => {
    const info = manifestInfo(manifest({ hosts: ['AEFT', 'PPRO'], extensions: [{ id: 'ru.cloud.brandkit.trial.main' }] }));
    expect(info).toMatchObject({ bundleId: 'ru.cloud.brandkit.trial', bundleVersion: '0.0.1', manifestVersion: '11.0', csxs: '11.0' });
    expect(info.hosts.map((h) => h.name)).toEqual(['AEFT', 'PPRO']);
    expect(info.extensions).toEqual([{
      id: 'ru.cloud.brandkit.trial.main',
      mainPath: './ru.cloud.brandkit.trial.main/index.html',
      scriptPath: null,
      type: 'Panel',
      hosts: null,
      parameters: ['--enable-nodejs', '--mixed-context'],
    }]);
  });
  it('one extension in both hosts covers AEFT and PPRO', () => {
    const info = manifestInfo(manifest({ hosts: ['AEFT', 'PPRO'], extensions: [{ id: 'a' }] }));
    expect(coversHosts(info, ['AEFT', 'PPRO'])).toEqual({ ok: true, missing: [] });
  });
  it('an extension limited by its own HostList does not', () => {
    const info = manifestInfo(manifest({ hosts: ['AEFT', 'PPRO'], extensions: [{ id: 'a', own: ['AEFT'] }, { id: 'b', own: ['PPRO'] }] }));
    expect(effectiveHosts(info, info.extensions[0])).toEqual(['AEFT']);
    expect(coversHosts(info, ['AEFT', 'PPRO'])).toEqual({ ok: false, missing: ['a: PPRO', 'b: AEFT'] });
  });
  it('ignores comments and rejects other XML', () => {
    const info = manifestInfo('<!-- <Host Name="ILST" Version="[0,99]" /> -->\n' + manifest({ hosts: ['AEFT'], extensions: [{ id: 'a' }] }));
    expect(info.hosts.map((h) => h.name)).toEqual(['AEFT']);
    expect(() => manifestInfo('<foo/>')).toThrow(/not a CEP manifest/);
  });
  it('reads the dev harness manifest of task 4', () => {
    const info = readManifest(path.join(REPO, 'dev/harness/CSXS/manifest.xml'));
    expect(info.bundleId).toBe('ru.cloud.brandkit.dev');
    expect(coversHosts(info, ['AEFT', 'PPRO']).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run tests/tools/panel-manifest.test.mjs`
Expected: FAIL — `Cannot find module '../../tools/panel/manifest-info.mjs'`.

- [ ] **Step 3: Создать `tools/panel/manifest-info.mjs`**

```js
// Reads a CEP manifest (CSXS/manifest.xml) without an XML library: bundle id and version, manifest version,
// CSXS runtime, bundle hosts, and every extension with its main path, own HostList and CEF parameters.
// Task 29 checks with it that one manifest runs the panel in AE and Premiere; the release build reuses it.
import { readFileSync } from 'node:fs';

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function attr(tag, name) {
  const m = new RegExp('\\b' + name + '\\s*=\\s*"([^"]*)"').exec(tag);
  return m ? m[1] : null;
}

// Inner XML of the first <tag ...>...</tag>, or '' when there is none.
function block(xml, tag) {
  const m = new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)</' + tag + '>').exec(xml);
  return m ? m[1] : '';
}

function text(xml, tag) {
  const m = new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)</' + tag + '>').exec(xml);
  return m ? m[1].trim() : null;
}

function hostsIn(xml) {
  const out = [];
  const re = /<Host\b[^>]*>/g;
  let m;
  while ((m = re.exec(xml))) out.push({ name: attr(m[0], 'Name'), version: attr(m[0], 'Version') });
  return out;
}

export function manifestInfo(xml) {
  const src = String(xml).replace(/<!--[\s\S]*?-->/g, '');
  const root = /<ExtensionManifest\b[^>]*>/.exec(src);
  if (!root) throw new Error('not a CEP manifest: no <ExtensionManifest>');
  const env = block(src, 'ExecutionEnvironment');
  const runtime = /<RequiredRuntime\b[^>]*\bName\s*=\s*"CSXS"[^>]*>/.exec(env);
  const ids = [];
  const reList = /<Extension\b[^>]*>/g;
  const list = block(src, 'ExtensionList');
  let m;
  while ((m = reList.exec(list))) ids.push(attr(m[0], 'Id'));
  const dispatch = block(src, 'DispatchInfoList');
  const extensions = ids.map((id) => {
    const re = new RegExp('<Extension\\b[^>]*\\bId\\s*=\\s*"' + escapeRe(id) + '"[^>]*>([\\s\\S]*?)</Extension>');
    const body = (re.exec(dispatch) || [])[1] || '';
    const own = block(body, 'HostList');
    return {
      id,
      mainPath: text(body, 'MainPath'),
      scriptPath: text(body, 'ScriptPath'),
      type: text(body, 'Type'),
      hosts: own ? hostsIn(own) : null,
      parameters: (block(body, 'CEFCommandLine').match(/<Parameter>[\s\S]*?<\/Parameter>/g) || [])
        .map((p) => p.replace(/<\/?Parameter>/g, '').trim()),
    };
  });
  return {
    bundleId: attr(root[0], 'ExtensionBundleId'),
    bundleVersion: attr(root[0], 'ExtensionBundleVersion'),
    manifestVersion: attr(root[0], 'Version'),
    csxs: runtime ? attr(runtime[0], 'Version') : null,
    hosts: hostsIn(block(env, 'HostList')),
    extensions,
  };
}

export function readManifest(file) {
  return manifestInfo(readFileSync(file, 'utf8'));
}

// Hosts an extension runs in: its own HostList when it has one, else the bundle HostList.
export function effectiveHosts(info, ext) {
  return (ext.hosts || info.hosts).map((h) => h.name);
}

// Criterion K1 of task 29: every extension of the bundle runs in all the given hosts.
export function coversHosts(info, names) {
  const missing = [];
  for (const ext of info.extensions) {
    const hosts = effectiveHosts(info, ext);
    for (const n of names) if (!hosts.includes(n)) missing.push(ext.id + ': ' + n);
  }
  return { ok: info.extensions.length > 0 && missing.length === 0, missing };
}
```

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/tools/panel-manifest.test.mjs`
Expected: `5 passed`.

- [ ] **Step 5: Написать падающий тест `tests/tools/panel-zxp.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import { zxpInfo } from '../../tools/panel/zxp-info.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MANIFEST = readFileSync(path.join(REPO, 'dev/harness/CSXS/manifest.xml'), 'utf8');

function makeZxp(entries) {
  const zip = new AdmZip();
  for (const [name, body] of Object.entries(entries)) zip.addFile(name, Buffer.from(body, 'utf8'));
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), 'bk-zxp-')), 'trial.zxp');
  zip.writeZip(file);
  return file;
}

describe('zxpInfo', () => {
  it('sees a signed package with its manifest', () => {
    const z = zxpInfo(makeZxp({
      'CSXS/manifest.xml': MANIFEST, 'META-INF/signatures.xml': '<signatures/>', 'index.html': '<html></html>',
    }));
    expect(z).toMatchObject({ entries: 3, signed: true, hasManifest: true, hasDebugFile: false });
    expect(z.manifest.bundleId).toBe('ru.cloud.brandkit.dev');
    expect(z.sizeBytes).toBeGreaterThan(0);
  });
  it('flags an unsigned package and a leftover .debug', () => {
    const z = zxpInfo(makeZxp({ 'CSXS/manifest.xml': MANIFEST, '.debug': '<ExtensionList/>' }));
    expect(z.signed).toBe(false);
    expect(z.hasDebugFile).toBe(true);
  });
  it('reports a package without a manifest', () => {
    const z = zxpInfo(makeZxp({ 'index.html': '<html></html>' }));
    expect(z.hasManifest).toBe(false);
    expect(z.manifest).toBe(null);
  });
});
```

- [ ] **Step 6: Убедиться, что тест падает**

Run: `npx vitest run tests/tools/panel-zxp.test.mjs`
Expected: FAIL — `Cannot find module '../../tools/panel/zxp-info.mjs'`.

- [ ] **Step 7: Создать `tools/panel/zxp-info.mjs` и `tools/panel/inspect.mjs`**

`tools/panel/zxp-info.mjs`:

```js
// Looks inside a .zxp (a zip): is it signed (META-INF/signatures.xml), does it carry CSXS/manifest.xml,
// did a .debug file slip in, how many entries and bytes. The signature itself is checked by
// ZXPSignCmd -verify; this shows the package is complete and hands its manifest to manifest-info.mjs.
import { statSync } from 'node:fs';
import AdmZip from 'adm-zip';
import { manifestInfo } from './manifest-info.mjs';

export function zxpInfo(file) {
  const zip = new AdmZip(file);
  const names = zip.getEntries().filter((e) => !e.isDirectory).map((e) => e.entryName);
  const entry = zip.getEntry('CSXS/manifest.xml');
  return {
    file,
    sizeBytes: statSync(file).size,
    entries: names.length,
    signed: names.includes('META-INF/signatures.xml'),
    hasManifest: Boolean(entry),
    hasDebugFile: names.includes('.debug'),
    manifest: entry ? manifestInfo(zip.readAsText(entry, 'utf8')) : null,
  };
}
```

`tools/panel/inspect.mjs`:

```js
#!/usr/bin/env node
// Summary of a CEP manifest or a .zxp for task 29 (criteria K1 and K2):
//   node tools/panel/inspect.mjs <CSXS/manifest.xml | file.zxp> [--hosts AEFT,PPRO]
// Exit code 1 when the hosts are not covered or a .zxp is unsigned or has no manifest.
import { readManifest, coversHosts } from './manifest-info.mjs';
import { zxpInfo } from './zxp-info.mjs';

const argv = process.argv.slice(2);
const file = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--hosts');
const h = argv.indexOf('--hosts');
const hosts = (h === -1 ? 'AEFT,PPRO' : String(argv[h + 1] || '')).split(',').filter(Boolean);

if (!file) {
  console.error('usage: node tools/panel/inspect.mjs <CSXS/manifest.xml | file.zxp> [--hosts AEFT,PPRO]');
  process.exitCode = 2;
} else {
  const z = /\.zxp$/i.test(file) ? zxpInfo(file) : null;
  const info = z ? z.manifest : readManifest(file);
  if (z) console.log('zxp: ' + z.sizeBytes + ' bytes, ' + z.entries + ' entries, signed ' + z.signed + ', .debug ' + z.hasDebugFile);
  if (!info) {
    console.log('manifest: missing');
    process.exitCode = 1;
  } else {
    const c = coversHosts(info, hosts);
    console.log('manifest: ' + info.bundleId + ' ' + info.bundleVersion + ', CSXS ' + info.csxs + ', '
      + info.extensions.length + ' extension(s), hosts ' + info.hosts.map((x) => x.name + ' ' + x.version).join(', '));
    console.log('covers ' + hosts.join('+') + ': ' + c.ok + (c.missing.length ? ' (missing ' + c.missing.join('; ') + ')' : ''));
    if (!c.ok || (z && !z.signed)) process.exitCode = 1;
  }
}
```

- [ ] **Step 8: Запустить тесты и CLI**

Run: `npx vitest run tests/tools/panel-zxp.test.mjs tests/tools/panel-manifest.test.mjs`
Expected: `8 passed`.

Run: `node tools/panel/inspect.mjs dev/harness/CSXS/manifest.xml`
Expected:
```text
manifest: ru.cloud.brandkit.dev 0.0.1, CSXS 11.0, 2 extension(s), hosts AEFT [26.0,99.9], PPRO [26.0,99.9]
covers AEFT+PPRO: true
```

Run: `node tools/panel/inspect.mjs; echo "exit $?"`
Expected: строка `usage: …` и `exit 2`.

- [ ] **Step 9: Commit**

```bash
git add tools/panel tests/tools/panel-manifest.test.mjs tests/tools/panel-zxp.test.mjs
git commit -m "feat(panel): CEP manifest and ZXP inspection for the framework choice" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 10: Написать падающий тест `tests/docs/panel-framework.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { readDoc, tableRows } from './markdown.mjs';

const md = readDoc('docs/decisions/panel-framework.md');

describe('docs/decisions/panel-framework.md', () => {
  it('has both criteria and the observations, one column per variant', () => {
    const rows = tableRows(md, /^[KN]\d+$/);
    expect(rows.map((r) => r[0])).toEqual(['K1', 'K2', 'N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8', 'N9']);
    for (const r of rows) {
      expect(r).toHaveLength(5);
      expect(r[2]).not.toBe('');
      expect(r[3]).not.toBe('');
      expect(r[4]).not.toBe('');
    }
  });
  it('answers the criteria with да, нет or — (not checked yet)', () => {
    for (const r of tableRows(md, /^K\d+$/)) {
      expect(r[2]).toMatch(/^(да|нет|—)/);
      expect(r[3]).toMatch(/^(да|нет|—)/);
    }
  });
  it('states a recommendation', () => {
    expect(md).toMatch(/^\*\*Рекомендация:\*\* \S/m);
  });
});
```

Run: `npx vitest run tests/docs/panel-framework.test.mjs`
Expected: FAIL — `ENOENT: no such file or directory, open '…\docs\decisions\panel-framework.md'`.

- [ ] **Step 11: Создать `docs/decisions/panel-framework.md`**

Ячейки результатов пока «—»: их заполняют шаги 14–22.

```markdown
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
```

Run: `npx vitest run tests/docs/panel-framework.test.mjs`
Expected: `3 passed`.

- [ ] **Step 12: Создать пробу своего Vite**

`spikes/panel-trial/vite/package.json`:

```json
{
  "name": "brandkit-panel-trial-vite",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "description": "Task 29 trial: a Preact CEP panel built by plain Vite and signed by ZXPSignCmd 4.1.3",
  "scripts": {
    "build": "vite build"
  }
}
```

`spikes/panel-trial/vite/vite.config.mjs`:

```js
// Own-Vite trial of task 29: a Preact panel for CEP 12 (Chromium 99) with relative paths.
// public/CSXS/manifest.xml is copied to dist/CSXS/manifest.xml as is, so dist/ is the extension root.
// CEP opens the panel from file://, where module scripts need CORS; the bundle is therefore an IIFE
// loaded by a classic deferred script.
import { defineConfig } from 'vite';

const classicScripts = {
  name: 'cep-classic-scripts',
  enforce: 'post',
  generateBundle(_options, bundle) {
    for (const f of Object.values(bundle)) {
      if (f.type === 'asset' && f.fileName.endsWith('.html')) {
        f.source = String(f.source).replace(/<script type="module" crossorigin/g, '<script defer');
      }
    }
  },
};

export default defineConfig({
  base: './',
  plugins: [classicScripts],
  build: {
    target: 'chrome99',
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: false,
    rollupOptions: { output: { format: 'iife' } },
  },
});
```

`spikes/panel-trial/vite/index.html`:

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <title>BrandKit Trial Vite</title>
  </head>
  <body style="background: #232323">
    <div id="app"></div>
    <script type="module" src="./src/main.js"></script>
  </body>
</html>
```

`spikes/panel-trial/vite/src/main.js`:

```js
// Own-Vite trial panel (task 29): Preact renders in CEP and shows which host and Chromium loaded it.
import { h, render } from 'preact';

function hostInfo() {
  try {
    const env = JSON.parse(window.__adobe_cep__.getHostEnvironment());
    return env.appName + ' ' + env.appVersion;
  } catch (e) {
    return 'no CEP host (' + String(e && e.message) + ')';
  }
}

const chrome = (navigator.userAgent.match(/Chrome\/[\d.]+/) || ['Chrome ?'])[0];

render(
  h('div', { style: 'font: 13px sans-serif; color: #ddd; padding: 8px' },
    h('b', null, 'BrandKit Trial Vite'),
    h('div', null, 'host: ' + hostInfo()),
    h('div', null, chrome)),
  document.getElementById('app'),
);
```

`spikes/panel-trial/vite/public/CSXS/manifest.xml` — как у dev-панели (задача 4), со своим id и параметрами CEF будущей панели (Node и доступ к файлам):

```xml
<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<ExtensionManifest xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   ExtensionBundleId="ru.cloud.brandkit.trial.vite"
                   ExtensionBundleVersion="0.0.1"
                   ExtensionBundleName="BrandKit Trial Vite"
                   Version="11.0">
  <ExtensionList>
    <Extension Id="ru.cloud.brandkit.trial.vite.panel" Version="0.0.1" />
  </ExtensionList>
  <ExecutionEnvironment>
    <HostList>
      <Host Name="AEFT" Version="[26.0,99.9]" />
      <Host Name="PPRO" Version="[26.0,99.9]" />
    </HostList>
    <LocaleList>
      <Locale Code="All" />
    </LocaleList>
    <RequiredRuntimeList>
      <RequiredRuntime Name="CSXS" Version="11.0" />
    </RequiredRuntimeList>
  </ExecutionEnvironment>
  <DispatchInfoList>
    <Extension Id="ru.cloud.brandkit.trial.vite.panel">
      <DispatchInfo>
        <Resources>
          <MainPath>./index.html</MainPath>
          <CEFCommandLine>
            <Parameter>--enable-nodejs</Parameter>
            <Parameter>--mixed-context</Parameter>
            <Parameter>--allow-file-access-from-files</Parameter>
            <Parameter>--allow-file-access</Parameter>
          </CEFCommandLine>
        </Resources>
        <Lifecycle>
          <AutoVisible>true</AutoVisible>
        </Lifecycle>
        <UI>
          <Type>Panel</Type>
          <Menu>BrandKit Trial Vite</Menu>
          <Geometry>
            <Size>
              <Height>200</Height>
              <Width>320</Width>
            </Size>
          </Geometry>
        </UI>
      </DispatchInfo>
    </Extension>
  </DispatchInfoList>
</ExtensionManifest>
```

Run: `node tools/panel/inspect.mjs spikes/panel-trial/vite/public/CSXS/manifest.xml`
Expected: `manifest: ru.cloud.brandkit.trial.vite 0.0.1, CSXS 11.0, 1 extension(s), hosts AEFT [26.0,99.9], PPRO [26.0,99.9]` и `covers AEFT+PPRO: true`.

- [ ] **Step 13: Спросить разрешение на скачивание**

Дальше нужны файлы из сети. Перед скачиванием спросить пользователя в чате и назвать источник и размер:
1. `ZXPSignCmd.exe` 4.1.3 для Windows x64 — `https://github.com/Adobe-CEP/CEP-Resources/raw/master/ZXPSignCMD/4.1.3/x64/ZXPSignCmd.exe`. Размер виден на странице файла `https://github.com/Adobe-CEP/CEP-Resources/blob/master/ZXPSignCMD/4.1.3/x64/ZXPSignCmd.exe`. Файл кладётся в `C:/CRBK/tools/ZXPSignCmd/4.1.3/`.
2. npm-пакеты двух проб: `create-bolt-cep@2.2.3` с зависимостями шаблона Bolt (React, Vite, `vite-cep-plugin`), затем `preact` в обе пробы и `vite` в пробу своего Vite. Размер покажет `npm install`.

Без разрешения задача останавливается здесь. В строках K и N `panel-framework.md` остаётся «—», в «Рекомендации» — «не проверено: нет разрешения на скачивание», затем Step 23. Закрытие фазы (задача 30) покажет эти строки, и пользователь решит A5 без пробы.

- [ ] **Step 14: Скачать ZXPSignCmd 4.1.3 и проверить**

```bash
mkdir -p C:/CRBK/tools/ZXPSignCmd/4.1.3
curl -fL -o C:/CRBK/tools/ZXPSignCmd/4.1.3/ZXPSignCmd.exe https://github.com/Adobe-CEP/CEP-Resources/raw/master/ZXPSignCMD/4.1.3/x64/ZXPSignCmd.exe
sha256sum C:/CRBK/tools/ZXPSignCmd/4.1.3/ZXPSignCmd.exe
C:/CRBK/tools/ZXPSignCmd/4.1.3/ZXPSignCmd.exe
```

Expected: файл скачан; печатается его sha256 — записать в строку N7, колонка «Свой Vite». Запуск без аргументов печатает справку со строками `-selfSignedCert`, `-sign` и `-verify`.

- [ ] **Step 15: Сертификат пробы**

Пароль генерируется и лежит в файле вне репозитория. В чат его не выводить.

```bash
mkdir -p C:/CRBK/work/panel-trial
node -e "console.log(require('node:crypto').randomBytes(18).toString('base64url'))" > C:/CRBK/work/panel-trial/cert-password.txt
C:/CRBK/tools/ZXPSignCmd/4.1.3/ZXPSignCmd.exe -selfSignedCert RU Moscow "Cloud.ru" "Cloud.ru BrandKit Trial" "$(cat C:/CRBK/work/panel-trial/cert-password.txt)" C:/CRBK/work/panel-trial/brandkit-trial.p12 -validityDays 3650
```

Expected: сообщение об успешном создании сертификата; появился `C:/CRBK/work/panel-trial/brandkit-trial.p12`.

- [ ] **Step 16: Проба Bolt CEP — создать проект**

Сначала попробовать без вопросов, флагами:

```bash
cd C:/CRBK/work/panel-trial
npx create-bolt-cep@2.2.3 bolt --displayName "BrandKit Trial Bolt" --id ru.cloud.brandkit.trial.bolt --framework react --apps aeft --apps ppro --installDeps --no-sampleCode
```

Если CLI всё равно задаёт вопросы (в оболочке агента ответить на них нельзя) или не понимает флаги — остановить его. Тогда попросить пользователя выполнить в своём терминале из `C:\CRBK\work\panel-trial` команду `npx create-bolt-cep@2.2.3` и ответить так:
- папка — `bolt`;
- Display Name — `BrandKit Trial Bolt`;
- id — `ru.cloud.brandkit.trial.bolt`;
- фреймворк — React;
- приложения — After Effects и Premiere Pro;
- установить зависимости — да;
- оставить примеры кода — нет.

Expected: папка `C:/CRBK/work/panel-trial/bolt` с `cep.config.ts`, `package.json`, `src/` и `node_modules/`.

- [ ] **Step 17: Проба Bolt CEP — настроить `cep.config.ts` и Preact**

В `C:/CRBK/work/panel-trial/bolt/cep.config.ts`:
- в начало файла — `import { readFileSync } from "fs";`;
- поля конфигурации — значения ниже; остальные поля шаблона не трогать.

```ts
  id: "ru.cloud.brandkit.trial.bolt",
  displayName: "BrandKit Trial Bolt",
  symlink: "local",
  requiredRuntimeVersion: 11.0,
  hosts: [
    { name: "AEFT", version: "[26.0,99.9]" },
    { name: "PPRO", version: "[26.0,99.9]" },
  ],
  zxp: {
    country: "RU",
    province: "Moscow",
    org: "Cloud.ru",
    password: readFileSync("C:/CRBK/work/panel-trial/cert-password.txt", "utf8").trim(),
    tsa: ["http://timestamp.digicert.com/", "http://timestamp.apple.com/ts01"],
    allowSkipTSA: false,
    sourceMap: false,
    jsxBin: "off",
  },
```

Preact (наблюдение N2): `npm install preact@latest` в папке пробы. Затем в `vite.config.ts`, в `resolve.alias`, добавить четыре замены: `react` → `preact/compat`, `react-dom` → `preact/compat`, `react-dom/client` → `preact/compat/client`, `react/jsx-runtime` → `preact/jsx-runtime`. Если сборка с алиасами падает — убрать их, записать в N2 «нет:» и текст ошибки и собрать без них.

- [ ] **Step 18: Проба Bolt CEP — сборка и манифест (K1, N1)**

```bash
cd C:/CRBK/work/panel-trial/bolt
npm run build
cd "C:/Users/Глеб/Documents/Cloud.ru Preset plugin"
node tools/panel/inspect.mjs C:/CRBK/work/panel-trial/bolt/dist/cep/CSXS/manifest.xml
```

Expected:
- сборка без ошибок (N1);
- `covers AEFT+PPRO: true` (K1);
- ссылка `%APPDATA%\Adobe\CEP\extensions\ru.cloud.brandkit.trial.bolt` на `dist/cep`. Если ссылки нет, создать её в PowerShell: `New-Item -ItemType Junction -Path "$env:APPDATA\Adobe\CEP\extensions\ru.cloud.brandkit.trial.bolt" -Target "C:\CRBK\work\panel-trial\bolt\dist\cep"`.

- [ ] **Step 19: Проба Bolt CEP — подписанный ZXP (K2, N5–N8)**

```bash
cd C:/CRBK/work/panel-trial/bolt
npm run zxp
ls dist/zxp node_modules/vite-cep-plugin/lib/bin
sha256sum node_modules/vite-cep-plugin/lib/bin/*
npm ls --all --parseable | wc -l
C:/CRBK/tools/ZXPSignCmd/4.1.3/ZXPSignCmd.exe -verify dist/zxp/ru.cloud.brandkit.trial.bolt.zxp -certinfo
cd "C:/Users/Глеб/Documents/Cloud.ru Preset plugin"
node tools/panel/inspect.mjs C:/CRBK/work/panel-trial/bolt/dist/zxp/ru.cloud.brandkit.trial.bolt.zxp
```

Expected:
- `-verify` сообщает об успешной проверке подписи, а `-certinfo` показывает метку времени (K2);
- `inspect.mjs` печатает `signed true`, `.debug false` и `covers AEFT+PPRO: true`.

Записать:
- размер (N5) и число пакетов (N6);
- N7: sha256 встроенного ZXPSignCmd. Совпал с 4.1.3 из шага 14 — «4.1.3», нет — «другая сборка» и sha256.

- [ ] **Step 20: Проба своего Vite — сборка, подпись (K1, K2, N1, N2, N5–N8)**

```bash
cd "C:/Users/Глеб/Documents/Cloud.ru Preset plugin/spikes/panel-trial/vite"
npm install preact@latest
npm install -D vite@latest
npm run build
npm ls --all --parseable | wc -l
cd "C:/Users/Глеб/Documents/Cloud.ru Preset plugin"
node tools/panel/inspect.mjs spikes/panel-trial/vite/dist/CSXS/manifest.xml
C:/CRBK/tools/ZXPSignCmd/4.1.3/ZXPSignCmd.exe -sign spikes/panel-trial/vite/dist C:/CRBK/work/panel-trial/trial-vite.zxp C:/CRBK/work/panel-trial/brandkit-trial.p12 "$(cat C:/CRBK/work/panel-trial/cert-password.txt)" -tsa http://timestamp.digicert.com/
C:/CRBK/tools/ZXPSignCmd/4.1.3/ZXPSignCmd.exe -verify C:/CRBK/work/panel-trial/trial-vite.zxp -certinfo
node tools/panel/inspect.mjs C:/CRBK/work/panel-trial/trial-vite.zxp
```

Expected:
- сборка без ошибок (N1, N2);
- в `dist/` лежат `index.html` с `<script defer`, бандл в `assets/` и `CSXS/manifest.xml`;
- `covers AEFT+PPRO: true` (K1);
- `-verify` проходит, метка времени есть (K2);
- `inspect.mjs` по ZXP печатает `signed true` и `.debug false`.

Записать N5 и N6. В N7 — «4.1.3 из CEP-Resources».

- [ ] **Step 21: Обе панели в AE и Premiere (N3, N4; вручную)**

1. Ссылка для своего Vite (PowerShell): `New-Item -ItemType Junction -Path "$env:APPDATA\Adobe\CEP\extensions\ru.cloud.brandkit.trial.vite" -Target "$PWD\spikes\panel-trial\vite\dist"` — из корня репозитория.
2. Перезапустить After Effects 2026 → Window → Extensions:
   - «BrandKit Trial Bolt» открывается без белого экрана;
   - «BrandKit Trial Vite» показывает `host: AEFT 26.5…` и `Chrome/99…`.
3. То же в Premiere Pro 2026: `host: PPRO 26.5.2…`.
4. Записать N3 и N4 по каждому варианту. Пустая панель — «нет», причина — из `%TEMP%\CEP12-AEFT.log` или `CEP12-PPRO.log`.
5. Убрать обе ссылки (PowerShell), чтобы пробные панели не висели в меню. `Delete()` удаляет только ссылку, не папку:

```powershell
(Get-Item "$env:APPDATA\Adobe\CEP\extensions\ru.cloud.brandkit.trial.vite").Delete()
(Get-Item "$env:APPDATA\Adobe\CEP\extensions\ru.cloud.brandkit.trial.bolt").Delete()
```

- [ ] **Step 22: Без PlayerDebugMode (N9; необязательно, только пользователь)**

Агент ключи реестра не меняет. Если пользователь хочет проверить:
1. Сам ставит `PlayerDebugMode` = 0 в `HKCU\Software\Adobe\CSXS.12`.
2. Распаковывает `C:\CRBK\work\panel-trial\trial-vite.zxp` (это zip) в `%APPDATA%\Adobe\CEP\extensions\ru.cloud.brandkit.trial.vite`.
3. Перезапускает AE и открывает панель.
4. Возвращает `PlayerDebugMode` = 1 и удаляет папку.

Итог — в N9: открылась или нет. Если проверку не делали — «— (не проверяли)».

- [ ] **Step 23: Записать итог и рекомендацию**

В `docs/decisions/panel-framework.md` заменить «—» результатами шагов 14–22. Вписать «Рекомендацию» одной фразой:
- кто прошёл K1 и K2;
- что решило выбор, если прошли оба.

В строку A5 листа решений ничего не вписывать: её подписывает пользователь при закрытии фазы (задача 30).

Run: `npx vitest run tests/docs/panel-framework.test.mjs`
Expected: `3 passed`.

- [ ] **Step 24: Commit**

```bash
git add docs/decisions/panel-framework.md tests/docs/panel-framework.test.mjs spikes/panel-trial/vite/package.json spikes/panel-trial/vite/package-lock.json spikes/panel-trial/vite/vite.config.mjs spikes/panel-trial/vite/index.html spikes/panel-trial/vite/src/main.js spikes/panel-trial/vite/public/CSXS/manifest.xml
git commit -m "docs(decisions): panel framework trial, Bolt CEP vs own Vite (A5)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Если шаг 13 остановил пробу, `package-lock.json` нет: убрать его из `git add`.

### Task 30: Закрытие фазы 0

Выход фазы 0 (spec §3, §3.3) состоит из четырёх частей:
- итог «да» или «нет» по каждой пробной сборке. Исключения: S8 — замер без вердикта, S9 — «не проводилась», если беты нет;
- подписанные решения D1–D25, канон движения D19 по типам и утверждения A1–A6;
- механизм длины экземпляра в C27;
- обновлённые факты спецификации.

Задача делает инструменты закрытия, сводит итоги с пользователем и передаёт работу плану первого пакета.

**Решает пользователь, агент только записывает.**
- `partial` сводится к «да» или «нет». «Да» — если не прошли только проверки, которые не трогают основной путь. Иначе «нет», и выбирается запасной путь из итога сборки.
- Ни одна ячейка «Решение пользователя» не заполняется без его слов в чате.

**Files:**
- Create: `tools/decisions/closure.mjs`, `tools/decisions/closure-cli.mjs`
- Create (командой `--write`, заполняется с пользователем): `docs/decisions/phase0-closure.md`
- Modify: `docs/contract/template-contract.md` (C27, командой `--fill-c27`), `docs/decisions/phase0-decisions.md` (решения и даты), `docs/superpowers/specs/2026-10-02-cloudru-brandkit-design.md` (факты после проб), `spikes/RESULTS.md`
- Test: `tests/tools/closure.test.mjs`
- Вне репозитория: заметка проекта в vault «Cloud.ru BrandKit»

- [ ] **Step 1: Написать падающий тест `tests/tools/closure.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import {
  SPIKES, suggest, closureRows, renderClosure, parseTables, unsignedRows, fillC27, c27Filled, closureProblems,
} from '../../tools/decisions/closure.mjs';

const res = (id, verdict, extra = {}) => ({ id, title: 'T ' + id, verdict, checks: [], fallback: 'fb ' + id, ...extra });

describe('closure table', () => {
  it('suggests the phase outcome from the spike verdict', () => {
    expect(suggest(res('S1', 'yes'))).toMatchObject({ outcome: 'да', path: 'основной' });
    expect(suggest(res('S2', 'no'))).toMatchObject({ outcome: 'нет', path: 'запасной: fb S2' });
    expect(suggest(res('S8', 'measured')).outcome).toBe('замер');
    expect(suggest(res('S9', 'not-run'))).toMatchObject({ outcome: 'не проводилась', path: 'запасной: fb S9' });
    const p = suggest(res('S3', 'partial', {
      checks: [{ name: 'a', pass: true }, { name: 'linear: dE', pass: false, required: false }],
    }));
    expect(p).toEqual({ outcome: '—', path: '—', failed: ['linear: dE'] });
  });
  it('lists S1..S11 and marks a missing result', () => {
    const rows = closureRows([res('S1', 'yes'), res('S11', 'no')]);
    expect(rows.map((r) => r.id)).toEqual(SPIKES);
    expect(rows[1]).toMatchObject({ id: 'S2', verdict: 'нет итога', outcome: '—', path: '—' });
  });
  it('renders a table with empty decision columns and escaped pipes', () => {
    const md = renderClosure(closureRows([res('S1', 'no', { title: 'a | b', checks: [{ name: 'x|y', pass: false }] })]),
      { date: '2026-10-20' });
    const t = parseTables(md)[0];
    expect(t.header).toEqual(['#', 'Что', 'Итог сборки', 'Не прошли', 'Итог фазы', 'Путь', 'Решение пользователя', 'Дата']);
    expect(t.rows).toHaveLength(11);
    expect(t.rows[0].slice(0, 4)).toEqual(['S1', 'a \\| b', 'no', 'x\\|y']);
    expect(unsignedRows(md)).toEqual(SPIKES);
  });
});

describe('sign-off', () => {
  it('finds rows with an empty decision or date in tables that have both columns', () => {
    const md = [
      '| # | Решение | Решение пользователя | Дата |', '|---|---|---|---|',
      '| D1 | x | принято | 2026-10-20 |', '| D2 | y | | |', '| D3 | z | 2 | |', '',
      '| # | Что |', '|---|---|', '| A1 | no sign-off columns |',
    ].join('\n');
    expect(unsignedRows(md)).toEqual(['D2', 'D3']);
  });
});

const CONTRACT = [
  '| № | Правило | Проверка | Как проверяем | Источник |', '|---|---|---|---|---|',
  '| C27 | Длина на слое экземпляра | авто: QA-гейт | приёмочная часть: кадры совпадают (SSIM ≥ 0,98). Механизм (растяжение слоя, '
    + 'сдвиг out point или time remap) берётся из итога S3 и вписывается сюда при закрытии фазы 0 | §4.2 «Время», S3 |',
].join('\n');

describe('C27 from S3', () => {
  it('replaces the mechanism sentence and keeps the acceptance part and the source', () => {
    expect(c27Filled(CONTRACT)).toBe(false);
    const md = fillC27(CONTRACT, 'remap');
    const row = parseTables(md)[0].rows[0];
    expect(row).toHaveLength(5);
    expect(row[3]).toMatch(/^приёмочная часть: кадры совпадают \(SSIM ≥ 0,98\)\. Механизм длины `fit: rdt` в AE: time remap/);
    expect(row[3]).toContain('итог S3: mechanism = remap');
    expect(row[4]).toBe('§4.2 «Время», S3');
    expect(c27Filled(md)).toBe(true);
    expect(fillC27(md, 'rdt')).toContain('mechanism = rdt');
  });
  it('rejects an unknown mechanism and a contract without C27', () => {
    expect(() => fillC27(CONTRACT, 'stretch')).toThrow(/unknown S3 mechanism/);
    expect(() => fillC27('| C26 | x |', 'rdt')).toThrow(/C27 not found/);
  });
});

describe('closureProblems', () => {
  const all = SPIKES.map((id) => res(id, 'yes'));
  const closed = renderClosure(closureRows(all)).replace(/основной \|  \|  \|/g, 'основной | принято | 2026-10-20 |');
  const panel = '| # | Что | Bolt CEP | Свой Vite | Как |\n|---|---|---|---|---|\n'
    + '| K1 | m | да | да | x |\n| K2 | z | да | нет: без метки времени | x |';
  const complete = {
    results: all,
    closureMd: closed,
    decisionsMd: '| # | Решение пользователя | Дата |\n|---|---|---|\n| D1 | 1 | 2026-10-20 |',
    contractMd: fillC27(CONTRACT, 'rdt'),
    panelMd: panel,
    logoGeometry: true,
  };
  it('is empty when everything is decided', () => {
    expect(closureProblems(complete)).toEqual([]);
  });
  it('lists what is still open', () => {
    expect(closureProblems({
      ...complete,
      results: all.slice(1),
      closureMd: null,
      contractMd: CONTRACT,
      panelMd: panel.replace('| K1 | m | да |', '| K1 | m | — |'),
      logoGeometry: false,
    })).toEqual([
      'spike S1: no spikes/results/S1.json',
      'docs/decisions/phase0-closure.md: missing (run --write)',
      'template-contract.md C27: mechanism from S3 not filled (run --fill-c27)',
      'panel-framework.md K1: not checked',
      'docs/research/logo-geometry.md: missing (plan 2, task 7)',
    ]);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run tests/tools/closure.test.mjs`
Expected: FAIL — `Cannot find module '../../tools/decisions/closure.mjs'`.

- [ ] **Step 3: Создать `tools/decisions/closure.mjs`**

```js
// Phase 0 closure (task 30): the closure table of the spikes, the sign-off check of the decision sheets
// and contract rule C27 from the S3 result. Pure functions on strings and result objects; the CLI
// (closure-cli.mjs) reads and writes the files.

export const SPIKES = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11'];
export const PENDING = '—';

const esc = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

// Suggested phase outcome per spike verdict; partial is left to the user.
export function suggest(result) {
  const failed = (result.checks || []).filter((c) => !c.pass).map((c) => c.name);
  const fallback = result.fallback ? 'запасной: ' + result.fallback : 'запасной путь не записан';
  switch (result.verdict) {
    case 'yes': return { outcome: 'да', path: 'основной', failed };
    case 'no': return { outcome: 'нет', path: fallback, failed };
    case 'measured': return { outcome: 'замер', path: 'бюджет — после повтора на мастерах (A4)', failed };
    case 'not-run': return { outcome: 'не проводилась', path: fallback, failed };
    default: return { outcome: PENDING, path: PENDING, failed };
  }
}

export function closureRows(results) {
  const byId = new Map(results.map((r) => [r.id, r]));
  return SPIKES.map((id) => {
    const r = byId.get(id);
    if (!r) return { id, title: '', verdict: 'нет итога', failed: [], outcome: PENDING, path: PENDING };
    const s = suggest(r);
    return { id, title: r.title, verdict: r.verdict, failed: s.failed, outcome: s.outcome, path: s.path };
  });
}

export function renderClosure(rows, { date = '' } = {}) {
  const lines = [
    '# Закрытие фазы 0: итоги пробных сборок',
    '',
    '**Как заполнять.** «Итог фазы» — да, нет, замер или не проводилась. `partial` решает пользователь: да, если не '
      + 'прошли только проверки, которые не трогают основной путь; иначе нет и запасной путь. «Путь» — основной или '
      + 'запасной. «Решение пользователя» — «принято» или своё решение, с датой. «—» — решения ещё нет.',
    '',
    '**Сформировано:** ' + (date || 'дата прогона') + ' из `spikes/results/*.json` командой '
      + '`node tools/decisions/closure-cli.mjs --write`.',
    '',
    '| # | Что | Итог сборки | Не прошли | Итог фазы | Путь | Решение пользователя | Дата |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    const cells = [r.id, esc(r.title), esc(r.verdict), esc(r.failed.join('; ')), esc(r.outcome), esc(r.path), '', ''];
    lines.push('| ' + cells.join(' | ') + ' |');
  }
  return lines.join('\n') + '\n';
}

// Markdown tables: header cells and data rows; cells split on unescaped pipes.
export function parseTables(md) {
  const tables = [];
  let cur = null;
  for (const line of String(md).split(/\r?\n/)) {
    if (!line.startsWith('|')) {
      cur = null;
      continue;
    }
    const cells = line.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim());
    if (!cur) {
      cur = { header: cells, rows: [] };
      tables.push(cur);
    } else if (!cells.every((c) => /^:?-{3,}:?$/.test(c))) {
      cur.rows.push(cells);
    }
  }
  return tables;
}

// First cells of the rows that lack a decision or a date, in every table with both columns
// (header names compared case-insensitively).
export function unsignedRows(md) {
  const out = [];
  for (const t of parseTables(md)) {
    const header = t.header.map((h) => h.toLowerCase());
    const d = header.indexOf('решение пользователя');
    const dt = header.indexOf('дата');
    if (d === -1 || dt === -1) continue;
    for (const r of t.rows) if (!r[d] || r[d].startsWith(PENDING) || !r[dt]) out.push(r[0]);
  }
  return out;
}

// Contract rule C27: how AE fits an instance of a fit: rdt template to the insert length (S3 decides).
export const MECHANISMS = {
  rdt: 'растяжение слоя экземпляра (Time Stretch) до длины вставки; защищённые области шаблона '
    + '(интро и аутро) играют с исходной скоростью',
  remap: 'time remap на слое экземпляра: ключи 0→0, in→in, (L − (D − out))→out, L→D, где D — длина шаблона, '
    + 'L — длина вставки',
  'trim-only': 'не подгоняется: шаблон с `fit: rdt` вставляется в AE в своей длине, длину в AE меняет только '
    + '`fit: trim`; в Premiere RDT работает штатно',
};

export function fillC27(md, mechanism) {
  const text = MECHANISMS[mechanism];
  if (!text) throw new Error('unknown S3 mechanism: ' + mechanism + ' (expected ' + Object.keys(MECHANISMS).join(', ') + ')');
  const lines = String(md).split('\n');
  const i = lines.findIndex((l) => /^\|\s*C27\s*\|/.test(l));
  if (i === -1) throw new Error('rule C27 not found');
  const eol = lines[i].endsWith('\r') ? '\r' : '';
  const cells = lines[i].replace(/\r$/, '').split(/(?<!\\)\|/);
  if (cells.length < 7) throw new Error('rule C27 has fewer cells than expected');
  const how = cells[4];
  const k = how.indexOf('Механизм');
  const head = (k === -1 ? how : how.slice(0, k)).trim();
  cells[4] = ' ' + (head ? head + ' ' : '') + 'Механизм длины `fit: rdt` в AE: ' + text
    + ' (итог S3: mechanism = ' + mechanism + '). `fit: trim` — обрезка out point и запись «Длительности». ';
  lines[i] = cells.join('|') + eol;
  return lines.join('\n');
}

export const c27Filled = (md) => /^\|\s*C27\s*\|.*итог S3: mechanism = /m.test(String(md));

// Everything phase 0 needs before it closes; an empty list means it can close.
export function closureProblems({ results, closureMd, decisionsMd, contractMd, panelMd, logoGeometry }) {
  const problems = [];
  const have = new Set(results.map((r) => r.id));
  for (const id of SPIKES) if (!have.has(id)) problems.push('spike ' + id + ': no spikes/results/' + id + '.json');
  if (closureMd == null) {
    problems.push('docs/decisions/phase0-closure.md: missing (run --write)');
  } else {
    const t = parseTables(closureMd).find((x) => x.header.includes('Итог фазы'));
    for (const id of SPIKES) {
      const r = t && t.rows.find((x) => x[0] === id);
      if (!r) {
        problems.push('phase0-closure.md: no row ' + id);
        continue;
      }
      const outcome = r[t.header.indexOf('Итог фазы')];
      const way = r[t.header.indexOf('Путь')];
      if (!outcome || outcome.startsWith(PENDING)) problems.push('phase0-closure.md ' + id + ': «Итог фазы» not decided');
      if (!way || way.startsWith(PENDING)) problems.push('phase0-closure.md ' + id + ': «Путь» not decided');
    }
    for (const id of unsignedRows(closureMd)) problems.push('phase0-closure.md ' + id + ': not signed');
  }
  if (decisionsMd == null) problems.push('docs/decisions/phase0-decisions.md: missing');
  else for (const id of unsignedRows(decisionsMd)) problems.push('phase0-decisions.md ' + id + ': not signed');
  if (contractMd == null || !c27Filled(contractMd)) {
    problems.push('template-contract.md C27: mechanism from S3 not filled (run --fill-c27)');
  }
  if (panelMd == null) {
    problems.push('docs/decisions/panel-framework.md: missing (task 29)');
  } else {
    for (const t of parseTables(panelMd)) {
      for (const r of t.rows) {
        if (/^K\d+$/.test(r[0]) && (String(r[2]).startsWith(PENDING) || String(r[3]).startsWith(PENDING))) {
          problems.push('panel-framework.md ' + r[0] + ': not checked');
        }
      }
    }
  }
  if (!logoGeometry) problems.push('docs/research/logo-geometry.md: missing (plan 2, task 7)');
  return problems;
}
```

- [ ] **Step 4: Создать `tools/decisions/closure-cli.mjs`**

```js
#!/usr/bin/env node
// Phase 0 closure (task 30):
//   node tools/decisions/closure-cli.mjs --write      docs/decisions/phase0-closure.md from spikes/results (never overwrites)
//   node tools/decisions/closure-cli.mjs --fill-c27   contract rule C27 from spikes/results/S3.data.json (field mechanism)
//   node tools/decisions/closure-cli.mjs --check      what phase 0 still lacks; exit 1 while anything is open
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readResults, RESULTS_DIR } from '../spike/result.mjs';
import { closureRows, renderClosure, fillC27, closureProblems } from './closure.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILES = {
  closure: path.join(REPO, 'docs/decisions/phase0-closure.md'),
  decisions: path.join(REPO, 'docs/decisions/phase0-decisions.md'),
  contract: path.join(REPO, 'docs/contract/template-contract.md'),
  panel: path.join(REPO, 'docs/decisions/panel-framework.md'),
  logo: path.join(REPO, 'docs/research/logo-geometry.md'),
  s3data: path.join(RESULTS_DIR, 'S3.data.json'),
};
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : null);
const mode = process.argv[2];

if (mode === '--write') {
  if (existsSync(FILES.closure)) {
    console.log('exists: ' + FILES.closure + ' (edit it by hand; to regenerate, delete it yourself first)');
  } else {
    const md = renderClosure(closureRows(readResults()), { date: new Date().toISOString().slice(0, 10) });
    writeFileSync(FILES.closure, md, 'utf8');
    console.log('written ' + FILES.closure);
  }
} else if (mode === '--fill-c27') {
  const data = JSON.parse(readFileSync(FILES.s3data, 'utf8'));
  writeFileSync(FILES.contract, fillC27(readFileSync(FILES.contract, 'utf8'), data.mechanism), 'utf8');
  console.log('C27: ' + data.mechanism);
} else if (mode === '--check') {
  const problems = closureProblems({
    results: readResults(),
    closureMd: read(FILES.closure),
    decisionsMd: read(FILES.decisions),
    contractMd: read(FILES.contract),
    panelMd: read(FILES.panel),
    logoGeometry: existsSync(FILES.logo),
  });
  for (const p of problems) console.log('- ' + p);
  console.log(problems.length ? 'phase 0 closure: ' + problems.length + ' open item(s)' : 'phase 0 closure: OK');
  process.exitCode = problems.length ? 1 : 0;
} else {
  console.error('usage: node tools/decisions/closure-cli.mjs --write | --fill-c27 | --check');
  process.exitCode = 2;
}
```

- [ ] **Step 5: Запустить тесты и CLI без аргументов**

Run: `npx vitest run tests/tools/closure.test.mjs`
Expected: `8 passed`.

Run: `node tools/decisions/closure-cli.mjs; echo "exit $?"`
Expected: `usage: node tools/decisions/closure-cli.mjs --write | --fill-c27 | --check` и `exit 2`.

- [ ] **Step 6: Commit**

```bash
git add tools/decisions/closure.mjs tools/decisions/closure-cli.mjs tests/tools/closure.test.mjs
git commit -m "feat(decisions): phase 0 closure table, sign-off check and C27 fill" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Что ещё открыто**

Run: `node tools/decisions/closure-cli.mjs --check; echo "exit $?"`
Expected: список открытых пунктов, затем `phase 0 closure: N open item(s)` и `exit 1`.

Пункт «no spikes/results/SN.json» значит, что сборка не записала итог: вернуться к её задаче. `manual.mjs` итог не создаёт, он только дописывает проверки. Если провести сборку нельзя (нет беты, нет машины), итог `not-run` пишет её задача; для S9 это `record-not-run.mjs`.

Пункт `logo-geometry.md: missing` значит, что не выполнена задача 7 плана 2. Порядок планов — в шапке этого плана.

- [ ] **Step 8: Таблица закрытия**

```bash
npm run spike:report
node tools/decisions/closure-cli.mjs --write
```

Expected: `written …\spikes\RESULTS.md` и `written …\docs\decisions\phase0-closure.md`. В таблице 11 строк. У `yes`, `no`, `measured` и `not-run` «Итог фазы» и «Путь» уже предложены. У `partial` стоит «—», а в «Не прошли» перечислены проваленные проверки.

- [ ] **Step 9: Разбор с пользователем (S1–S11)**

Пройти с пользователем `spikes/RESULTS.md` и `docs/decisions/phase0-closure.md` по строкам. По каждой строке `partial` показать:
- проваленные проверки и их `detail` из `spikes/results/SN.json`;
- запасной путь.

Записать за пользователем в `phase0-closure.md`:
- «Итог фазы» — да или нет;
- «Путь» — основной или запасной (каким именно);
- «Решение пользователя» — «принято» или его формулировку;
- «Дата» — сегодняшнюю дату.

Предложенные значения в строках `yes`, `no`, `measured`, `not-run` пользователь подтверждает или меняет.

- [ ] **Step 10: C27 из итога S3**

```bash
node -e "const d = require('./spikes/results/S3.data.json'); console.log(d.mechanism, '-', d.mechanismReason)"
node tools/decisions/closure-cli.mjs --fill-c27
npx vitest run tests/docs/contract.test.mjs
```

Expected:
- первая команда печатает `rdt`, `remap` или `trim-only` и причину;
- вторая — `C27: <тот же механизм>`;
- тест контракта — `3 passed`: формат строки C27 не сломан.

Если в разборе (шаг 9) пользователь выбрал для S3 другой путь, чем `mechanism`, поправить C27 по его решению руками.

- [ ] **Step 11: Подписи в листе решений**

В `docs/decisions/phase0-decisions.md` пользователь вписывает «Решение пользователя» и «Дату»:
- D1–D25;
- канон движения по типам (раздел D19);
- A1–A6. В A5 — по `panel-framework.md`.

Ответы владельцев на вопросы D16, D20 и D21 записать под каждым вопросом строкой «Ответ (дата, кто): …». Нет ответа — «нет ответа на <дата>». Тогда в строке решения пользователь пишет, как работаем до ответа.

Run: `npx vitest run tests/docs/decisions.test.mjs`
Expected: все тесты листа решений зелёные: структура таблиц не сломана.

- [ ] **Step 12: Факты спецификации после проб**

Run: `grep -n "проверяется в S\|гипотез\|до S9\|до пробной сборки" docs/superpowers/specs/2026-10-02-cloudru-brandkit-design.md`
Expected: строки §1.1, §5, §6 и §9 с пометками о пробах.

Каждую пометку заменить итогом из `phase0-closure.md`:
- «подтверждено SN, <дата>»;
- или «не подтвердилось в SN: <выбранный путь>».

Где итог меняет решение (например, вставка в Premiere идёт запасным путём), поправить и сам абзац. В §3.1 под таблицей пробных сборок добавить строку: «Итоги — `spikes/RESULTS.md`, решения по ним — `docs/decisions/phase0-closure.md`».

- [ ] **Step 13: Проверка закрытия**

Run: `node tools/decisions/closure-cli.mjs --check; echo "exit $?"`
Expected: `phase 0 closure: OK` и `exit 0`.

Run: `npm test`
Expected: все тесты зелёные.

- [ ] **Step 14: Commit**

```bash
git add docs/decisions/phase0-closure.md docs/decisions/phase0-decisions.md docs/contract/template-contract.md docs/superpowers/specs/2026-10-02-cloudru-brandkit-design.md spikes/RESULTS.md
git commit -m "docs(phase0): close phase 0 with signed decisions and spike outcomes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 15: Заметка проекта в vault**

По правилам `AGENTS.md` в корне vault (`C:\Users\Глеб\Downloads\2nd brain`) обновить folder note `01 Projects/Cloud.ru BrandKit/Cloud.ru BrandKit.md`:
- **Статус** — «фаза 0 закрыта <дата>»;
- **итоги** — по строке на сборку S1–S11: да, нет или замер и выбранный путь;
- **ссылки** — на `docs/decisions/phase0-closure.md`, `phase0-decisions.md` и `panel-framework.md` в репозитории;
- **🎯 Next action** — «план первого пакета: логошоты и титры».

Добавить запись в хронологию мастер-индекса `01 Projects/Экосистема Claude.md` в формате соседних записей. Vault не коммитится.

- [ ] **Step 16: Передача плану первого пакета**

Сообщить пользователю итог фазы: что подтвердилось, какие запасные пути выбраны, какой каркас панели. Предложить следующий шаг — план первого пакета: логошоты и титры, фаза 1, пп. 4–5 spec §3.3. Он пишется по этим материалам:
- `phase0-closure.md`;
- лист решений;
- контракт;
- `brand/tokens.json`;
- JSX-дампы и эталоны плана 2.
