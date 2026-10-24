Cloud.ru BrandKit {plugin}, библиотека {library}

Перед установкой закройте After Effects и Premiere. Права администратора не нужны.
Если установщик ответит, что библиотека или панель заняты, подождите полминуты после закрытия программ
и запустите его снова: он ничего не меняет, пока не может заменить всё целиком.
Установщик запускают в каждой учётной записи компьютера, где работают с панелью.

Windows
  Двойной щелчок по install.cmd.
  Пресеты Adobe Media Encoder тоже: в командной строке  install.cmd -WithAme

macOS
  Откройте Терминал и выполните:  bash install.command
  (двойной щелчок по файлу, скачанному из браузера или мессенджера, macOS не откроет)
  Пресеты Adobe Media Encoder тоже:  bash install.command --with-ame

[4K]
4K-петли и клипы (по желанию, {size4k} на диске)
  Фоны, фон экрана вебинара, дрейф рамки лекции, интро и аутро подкаста в 4K лежат в отдельном архиве
  {name}-4k.zip. Распакуйте его туда же, где этот: его папка {name} совпадёт с этой.
  Windows: двойной щелчок по install-4k.cmd.   macOS: bash install.command --with-4k
  Следующие установки сохраняют 4K, пока архив распакован рядом; убрать 4K: install.cmd -No4K / --no-4k.
  Без 4K в 4K-проекте панель берёт FHD-версию и вписывает её в кадр.

[/4K]
Что ставится
  панель           в папку расширений CEP пользователя (ru.cloud.brandkit)
  библиотека       Windows: C:\ProgramData\CloudRuBrandKit\library   macOS: /Users/Shared/CloudRuBrandKit/library
  шаблоны MOGRT    плоско в Local Templates, их видит и штатная панель Graphics Templates
  пресеты AME      с ключом -WithAme / --with-ame: брендовые пресеты «CR …» в Media Encoder

Экспорт из After Effects
  Шаблоны вывода «CR …» скриптом не ставятся. Один раз на компьютере загрузите их в AE:
  Edit > Templates > Output Module > Load... и выберите файл из библиотеки
  library\items\AME_Templates\AME_Templates_aom_v1.aom (установщик печатает полный путь).

Шрифты SB Sans в комплект не входят: их ставит IT, одна сборка для всех пользователей.

После установки: After Effects или Premiere > Window > Extensions > Cloud.ru BrandKit.
Руководство монтажёра — guide.md рядом с этим файлом.
