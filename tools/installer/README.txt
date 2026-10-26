Cloud.ru BrandKit {plugin}, библиотека {library} — для IT

Монтажёрам: «Как установить» в папке выше. Здесь — то же без окна, для тихой установки.

Перед установкой закройте After Effects и Premiere (с пресетами — и Media Encoder). Права администратора не нужны.
Установщик запускают в каждой учётной записи компьютера, где работают с панелью.
Если он ответит, что библиотека или панель заняты, подождите полминуты после закрытия программ и запустите
его снова: он ничего не меняет, пока не может заменить всё целиком.

Windows
  files\install.cmd [-With4K | -No4K] [-WithMusic | -NoMusic] [-WithAme]
  Окно установщика («Установить (Windows)») запускает files\install.ps1 с этими же ключами.

macOS
  bash files/install.command [--with-4k | --no-4k] [--with-music | --no-music] [--with-ame]
  «Установить (Mac).command» запускает его с этими же ключами после окон выбора.

Опции
[4K]
  -With4K / --with-4k          4K-фоны и клипы, {size4k} на диске: фоны, фон экрана вебинара, дрейф рамки лекции,
                               интро и аутро подкаста в 4K. Без них в 4K-проекте панель берёт FHD-версию и вписывает
                               её в кадр.
[/4K]
[MUSIC]
  -WithMusic / --with-music    Стоковая музыка, {sizemusic} на диске: треки для роликов в категории «Музыка». Музыка
                               пакетов Cloud.ru (вебинары, курсы, подкаст) ставится всегда.
[/MUSIC]
  -WithAme / --with-ame        Брендовые пресеты «CR …» в Media Encoder. Прежний список пресетов установщик сохраняет
                               рядом (PresetTree.xml.brandkit-<время>.bak), Media Encoder перестроит его при запуске.
  Повторная установка сохраняет опции, поставленные раньше; -No4K / --no-4k и -NoMusic / --no-music их убирают.

Коды выхода: 0 — установлено; 2 — открыты After Effects или Premiere (с -WithAme — и Media Encoder), ничего
не изменено; 1 — ошибка, текст после «ОШИБКА:».

Что ставится
  панель           в папку расширений CEP пользователя (ru.cloud.brandkit)
  библиотека       Windows: C:\ProgramData\CloudRuBrandKit\library   macOS: /Users/Shared/CloudRuBrandKit/library
  шаблоны MOGRT    плоско в Local Templates пользователя, их видит и штатная панель Graphics Templates
  пресеты AME      с -WithAme / --with-ame: в пользовательские пресеты Media Encoder

Экспорт из After Effects
  Шаблоны вывода «CR …» скриптом не ставятся. Один раз на компьютере загрузите их в AE:
  Edit > Templates > Output Module > Load... и выберите файл из библиотеки
  library\items\AME_Templates\AME_Templates_aom_v1.aom (установщик печатает полный путь).

Шрифты SB Sans в комплект не входят: их ставит IT, одна сборка для всех пользователей.
