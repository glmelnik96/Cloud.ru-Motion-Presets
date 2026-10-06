# Задание локальному агенту: установщик 0.1.17 на Windows и «Вписать в окно» в Premiere

**От кого:** облачная сессия, ветка `claude/determined-cannon-eum3ei`.

**Если ещё идёт проверка «Показать в папке»** (`2026-10-06-phase3-export-reveal-handoff.md`), сначала закончите её на 0.1.16. Это задание — следующее.

**Что изменилось:**
- **Установщик** (`tools/installer/`):
  - сборщик пакета пишет `payload/ame.txt`: пресеты экспорта из каталога под именами шаблонов (`CR FullHD.epr`, `CR Webinar Timer.epr` и так далее);
  - `install.cmd -WithAme` ставит их в `Documents\Adobe\Adobe Media Encoder\<версия>\Presets`. Раньше ключ искал старую папку `library\ame` и ничего не ставил;
  - установщик печатает, где лежит `AME_Templates_aom_v1.aom` и как загрузить его в AE (Edit > Templates > Output Module > Load...);
  - последняя проверка на Windows была с панелью 0.1.2, теперь 0.1.17 и библиотека с пресетами экспорта.
- **«Вписать в окно»** (Premiere, spec 6.1, по итогам S7):
  - в форме шаблона с окнами (`windows[]`) появились кнопки «Вписать выделенный клип в окно»;
  - панель читает размер кадра выделенного клипа из метаданных проекта (`Column.Intrinsic.VideoInfo`), задаёт Motion Scale и Position;
  - если клип больше окна, добавляет Crop через QE и выставляет обрезку.
  - Окна пока только у примера «Экран вебинара» (`docs/library/example.src.json`): экран 1280×720 и портретное окно спикера 384×720. В рабочей библиотеке шаблонов с окнами ещё нет, поэтому рецепт проверяется живым стендом, а не из настоящей панели.

**Код панели не чинить — описывать.**

## 1. Тесты

`git pull origin claude/determined-cannon-eum3ei`, `npm ci`, `npm test`.

## 2. «Вписать в окно» — живой прогон Premiere

```bash
node tools/panel/live.mjs --host pr --media
```

Прогон медиа теперь в конце проверяет и рецепт («fit screen», «fit speaker»):
- **Шаг стенда.** Ставит на V2 однотонные PNG 1920×1080 (зелёный — для окна экрана, фиолетовый — для окна спикера) и выделяет их.
- **Вызов.** `selectedClip` и `fitClip` через мост.
- **Проверка по кадру Premiere** (±4 px): цвет заполняет ровно окно — 96,162 1280×720 и 1440,162 384×720, и больше ничего.
- **Что смотреть в отчёте** `docs/research/panel-live/pr-media-report.json`:
  - размер кадра прочитан из метаданных;
  - позиция и масштаб прочитаны обратно;
  - для спикера Crop добавлен через QE (`cropAdded`).

Если упало, приложите:
- кадры из `C:/CRBK/work/panel-live/pr/media-frames`;
- что вернул `selectedClip`, особенно `src` — откуда взялся размер кадра, или ошибка `NO_SIZE`.

Отдельно опишите, что стоит в настройке Premiere Preferences > Media > Default Media Scaling. Если там «Scale to frame size», масштаб считается от другой базы, и это надо знать.

## 3. Установщик на Windows

1. Подпишите панель 0.1.17 и соберите пакет с обычной библиотекой. В ней 3 шаблона и пресеты экспорта; соберите её, если нужно (`npm run library:build`).
   ```bash
   node tools/panel/package-zxp.mjs --zxpsign <ZXPSignCmd> --cert <.p12>     # пароль только через BRANDKIT_CERT_PASSWORD
   node tools/installer/build.mjs --zxp C:/CRBK/work/panel/CloudRuBrandKit-0.1.17.zxp --library C:/CRBK/work/library
   ```
   В выводе — число MOGRT. В `payload/ame.txt` — 9 строк, в `payload/aom.txt` — путь к `.aom`.
2. **«Песочница»:** `install.cmd -WithAme -Sandbox C:\CRBK\work\installer-sb`. Ждём:
   - код 0;
   - в `installer-sb\Documents\Adobe\Adobe Media Encoder\<версия>\Presets` — 9 файлов `CR ….epr`, если папка версии AME там есть (создайте её заранее, например `26.0`);
   - строка про шаблоны вывода с полным путём к `.aom`.
3. **Настоящая установка поверх.** Закройте AE, Premiere и AME, затем `install.cmd -WithAme`.
   - **Отказ:** при открытом AE или Premiere установщик отказывает с кодом 2.
   - **Media Encoder:** в Preset Browser, в User Presets, видны девять «CR …»; экспорт любым из них — 25 к/с.
   - **Панель:** строка состояния «панель 0.1.17 · библиотека …». Вкладка «Экспорт» есть в обоих хостах. В Premiere — очередь AME, в AE — «Рендерить» шаблоном «CR FullHD».
   - **Права:** `icacls C:\ProgramData\CloudRuBrandKit` — у `BUILTIN\Пользователи` есть `(OI)(CI)(M)`.
   - Секретов в выводе и файлах нет.
4. Запишите итог в `docs/research/installer/windows-0.1.17.json`: коды выхода, вывод установщика, `icacls`, что видно в AME и в панели.

## Вернуть

Закоммитьте в ту же ветку: отчёт `pr-media-report.json`, `windows-0.1.17.json`, кадры при сбое.

В ответе:
- легла ли запись ровно в окна, добавился ли Crop;
- откуда взялся размер кадра клипа;
- поставил ли установщик пресеты в AME и видны ли они там;
- что ещё заметили.
