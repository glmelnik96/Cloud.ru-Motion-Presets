#!/bin/bash
# The macOS launcher of the package («Установить (Mac).command», user 2026-10-26): dialogs of macOS ask what to put,
# files/install.command does the work in this Terminal window, a dialog says how it went and what comes next.
# A file downloaded by a browser or a messenger is quarantined and macOS refuses its double click; from Terminal:
#   bash "<this file>"        (type «bash », drag the file into the window, press Return)
# BRANDKIT_SETUP_CHOICES=4k,music,ame   answers the dialogs (none is shown); BRANDKIT_SETUP_ARGS adds arguments to
# install.command (installer tests: --sandbox <dir>).
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
FILES="$HERE/files"
ENGINE="$FILES/install.command"
TITLE="Cloud.ru BrandKit"
QUIET="${BRANDKIT_SETUP_CHOICES+x}"

# A dialog of macOS: the texts go to osascript as arguments, so quotes in them need no escaping.
# dialog <text> <buttons, comma-separated> <default button> -> the button pressed, empty when it was closed
dialog() {
  [ -n "$QUIET" ] && return 0
  osascript - "$1" "$2" "$3" "$TITLE" <<'EOF' 2>/dev/null
on run argv
  set AppleScript's text item delimiters to ","
  set bs to text items of (item 2 of argv)
  try
    return button returned of (display dialog (item 1 of argv) buttons bs default button (item 3 of argv) with title (item 4 of argv))
  on error
    return ""
  end try
end run
EOF
}

# choose <prompt> <items, |-separated> <items ticked, |-separated> -> the items chosen, |-separated; "false" when cancelled
choose() {
  osascript - "$1" "$2" "$3" "$TITLE" <<'EOF' 2>/dev/null
on run argv
  set AppleScript's text item delimiters to "|"
  set its to text items of (item 2 of argv)
  set ticked to {}
  if (item 3 of argv) is not "" then set ticked to text items of (item 3 of argv)
  set r to choose from list its with title (item 4 of argv) with prompt (item 1 of argv) default items ticked OK button name "Установить" cancel button name "Отмена" with multiple selections allowed and empty selection allowed
  if r is false then return "false"
  return r as text
end run
EOF
}

if [ ! -f "$FILES/payload/VERSION" ] || [ ! -f "$ENGINE" ]; then
  dialog "Сначала распакуйте архив целиком, потом запустите установщик из распакованной папки." "OK" "OK" >/dev/null
  echo "Рядом нет папки files: распакуйте архив целиком и запустите установщик из распакованной папки."
  exit 1
fi
PLUGIN="$(sed -n 's/^plugin=//p' "$FILES/payload/VERSION")"
LIBRARY="$(sed -n 's/^library=//p' "$FILES/payload/VERSION")"
gb() { awk -v b="${1:-0}" 'BEGIN { printf "%.1f ГБ", b / 1073741824 }' | tr . ,; }

# What an earlier install put: an update keeps the same choice; the first install takes everything
STATE="$HOME/Library/Application Support/CloudRuBrandKit/installed.txt"
HAD=""
[ -f "$STATE" ] && HAD=",$(sed -n 's/^packs=//p' "$STATE"),"
ITEMS=""; KEYS=""; TICKED=""
add() { # add <key> <text>
  ITEMS="${ITEMS:+$ITEMS|}$2"; KEYS="$KEYS $1"
  if [ -z "$HAD" ] || [ "$1" = ame ] || case "$HAD" in *",$1,"*) true ;; *) false ;; esac; then TICKED="${TICKED:+$TICKED|}$2"; fi
}
for k in 4k music; do
  if [ -d "$FILES/payload/library-$k" ]; then
    b="$(sed -n 's/^bytes=//p' "$FILES/payload/VERSION-$k" 2>/dev/null)"
    case "$k" in 4k) add 4k "4K-фоны и клипы для проектов 4K ($(gb "$b"))" ;; music) add music "Стоковая музыка для роликов ($(gb "$b"))" ;; esac
  fi
done
add ame "Пресеты экспорта «CR …» для Media Encoder"

if [ -n "$QUIET" ]; then
  CHOSEN=",$BRANDKIT_SETUP_CHOICES,"
else
  ok="$(dialog "Cloud.ru BrandKit $PLUGIN, библиотека $LIBRARY.

Перед установкой закройте After Effects, Premiere и Media Encoder. Права администратора не нужны." "Отмена,Продолжить" "Продолжить")"
  [ "$ok" = "Продолжить" ] || exit 0
  picked="$(choose "Панель и библиотека ставятся всегда. Что поставить вместе с ними? Несколько пунктов — с клавишей ⌘." "$ITEMS" "$TICKED")"
  [ "$picked" = "false" ] && exit 0
  CHOSEN=","
  i=0
  IFS='|' read -r -a texts <<< "$ITEMS"
  for k in $KEYS; do
    case "|$picked|" in *"|${texts[$i]}|"*) CHOSEN="$CHOSEN$k," ;; esac
    i=$((i + 1))
  done
fi

ARGS=()
case "$CHOSEN" in *,4k,*) ARGS+=(--with-4k) ;; *) ARGS+=(--no-4k) ;; esac
case "$CHOSEN" in *,music,*) ARGS+=(--with-music) ;; *) ARGS+=(--no-music) ;; esac
case "$CHOSEN" in *,ame,*) ARGS+=(--with-ame) ;; esac

echo "Устанавливаю… Это займёт несколько минут."
OUT="$(mktemp -t brandkit-setup.XXXXXX)"
# shellcheck disable=SC2086
bash "$ENGINE" "${ARGS[@]}" ${BRANDKIT_SETUP_ARGS:-} 2>&1 | tee "$OUT"
CODE=${PIPESTATUS[0]}

if [ "$CODE" = 0 ]; then
  AOM="$(sed -n 's/.*Load\.\.\. файл \(.*\.aom\)$/\1/p' "$OUT" | head -n 1)"
  while :; do
    b="$(dialog "Готово.

1. Запустите After Effects или Premiere: Window → Extensions → Cloud.ru BrandKit. В Premiere панели видны при открытом проекте.

2. В After Effects один раз загрузите шаблоны экспорта: Edit → Templates → Output Module… → Load… и выберите файл, который покажет кнопка «Шаблоны экспорта AE».

3. Пресеты «CR …» появятся в Media Encoder при следующем запуске." "Шаблоны экспорта AE,Руководство,Готово" "Готово")"
    case "$b" in
      "Шаблоны экспорта AE") [ -n "$AOM" ] && open -R "$AOM" ;;
      "Руководство") for g in "$HERE"/Руководство*; do open "$g"; break; done ;;
      *) break ;;
    esac
  done
elif [ "$CODE" = 2 ]; then
  line="$(grep '^Закройте' "$OUT" | tail -n 1)"
  dialog "${line:-Закройте After Effects, Premiere и Media Encoder и запустите установщик снова.}" "OK" "OK" >/dev/null
else
  dialog "Не получилось. Подробности — в окне Терминала. Если не ясно, что делать, отправьте их текстом тому, кто дал вам установщик." "OK" "OK" >/dev/null
fi
rm -f "$OUT"
exit "$CODE"
