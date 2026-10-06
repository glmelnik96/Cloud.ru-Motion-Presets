# Задание локальному агенту: пресеты «CR …» в Media Encoder после установки

**От кого:** облачная сессия, ветка `claude/determined-cannon-eum3ei`.

**Что нашла проверка установщика 0.1.17** (`aa9a0b1`, `docs/research/installer/windows-0.1.17.json`):
1. Preset Browser показывает имя изнутри файла (`<PresetName>`), а не имя файла: «CR FullHD.epr» виден как FullHD_10-20_25fps.
2. Видны не все скопированные пресеты: FullHD, SMM 16:9 и три вебинарных не показаны, а некоторые показаны дважды.
3. Установщик положил пресеты и в `Adobe Adobe Media Encoder Audio Previews\Presets`.

**Что исправлено:**
- (1) `tools/library/export-pack.mjs` при раскладке в сборку переписывает `<PresetName>` копии на имя шаблона: «CR FullHD», «CR Webinar Timer»… Ещё он печатает строки `ids …` — теги файла, похожие на идентификаторы.
- (3) Оба установщика кладут пресеты только в папки версий (`25.0`, `26.0`).
- (2) пока не исправлено: нужно понять, как AME собирает список пользовательских пресетов. Это и есть разведка ниже.

**Код панели не чинить — описывать.** Файлы пользователя вне `C:\CRBK\work` перед удалением копируйте в `C:\CRBK\work\export\ame-backup\`.

## 1. Пересобрать пресеты, библиотеку и пакет

```bash
git pull origin claude/determined-cannon-eum3ei && npm test
node tools/library/export-pack.mjs --epr C:/CRBK/work/export/epr --aom C:/CRBK/work/export/CR_BrandKit.aom
npm run library:build
node tools/panel/package-zxp.mjs --zxpsign <ZXPSignCmd> --cert <.p12>     # пароль только через BRANDKIT_CERT_PASSWORD
node tools/installer/build.mjs --zxp C:/CRBK/work/panel/CloudRuBrandKit-0.1.17.zxp --library C:/CRBK/work/library
```

Вывод `export-pack` (строки `ids …`) приложите целиком: совпадают ли идентификаторы у разных пресетов и у старых копий.

## 2. Чистый старт Media Encoder

1. Закройте AME. Сохраните в `ame-backup`:
   - содержимое `Documents\Adobe\Adobe Media Encoder\25.0` и `26.0` (`Presets\` и все `*.xml` рядом, в том числе `PresetTree.xml`, если он там);
   - папку `Adobe Adobe Media Encoder Audio Previews\Presets`.
2. Удалите `Audio Previews\Presets` целиком: её создал установщик. Из `Presets` версий удалите `CR *.epr` и `AME_*.epr`, оставшиеся от прошлых проверок. Чужие пресеты пользователя не трогайте.
3. `install.cmd -WithAme`. Ждём «Пресеты AME: 9 в …\25.0\Presets» и «…\26.0\Presets», без строки про Audio Previews.
4. Запустите AME. Сколько строк «CR …» в Preset Browser → «Пользовательские стили и группы»? Скриншот.

## 3. Если показаны не все девять — разведка

1. Найдите, где AME хранит дерево пользовательских пресетов (`PresetTree.xml` или другой файл в `Documents\Adobe\Adobe Media Encoder\26.0\` и рядом). Как в нём записан пресет: путь к файлу, имя, идентификатор?
2. Закройте AME, переименуйте этот файл (не удаляйте), запустите AME. Появились ли все девять? Что AME записал в новый файл?
3. Отдельно: Preset Browser → Import… одного `CR Webinar Timer.epr` из `Presets`. Что изменилось в дереве и в папке `Presets`: копия, новое имя, новый идентификатор?
4. Тот же вопрос для двух копий одного пресета с разными именами файлов: показывает ли AME обе.

## Вернуть

Закоммитьте в ту же ветку `docs/research/export/ame-presets.json`:
- вывод `export-pack` со строками `ids`;
- что видно в Preset Browser после чистой установки;
- где и как записано дерево;
- что дали переименование дерева и Import;
- фрагменты файлов дерева до и после, без личных путей сверх необходимого.

Скриншоты — в `docs/research/export/`.

В ответе: при каком способе AME надёжно показывает все девять «CR …». Например, копия в `Presets` плюс сброс дерева, или только Import вручную.
