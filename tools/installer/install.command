#!/bin/bash
# Cloud.ru BrandKit installer for macOS (spec 8.1). No admin rights, no Creative Cloud app, no Adobe ID.
# The launcher of the package («Установить (Mac).command», tools/installer/setup.command) runs it after its dialogs;
# IT runs it from Terminal (a file downloaded by a browser or a messenger is quarantined, a double click does not
# open it on macOS 15+):
#   bash files/install.command [--with-ame] [--with-4k | --no-4k] [--with-music | --no-music] [--sandbox <dir>]
# --with-ame   also copies the brand .epr presets into the user presets of Adobe Media Encoder
# --with-4k    also installs the 4K loops and clips (D24): payload/library-4k of the package. A later install keeps them
# --no-4k      leaves the 4K files out although an earlier install had them
# --with-music, --no-music   the same for the stock music (payload/library-music)
# --sandbox    installs into <dir>/... instead of the real folders (a dry run for checks); skips the
#              check for running apps
# Exit codes: 0 installed, 2 refused (After Effects or Premiere is running, or Media Encoder with --with-ame), 1 error.
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
PAYLOAD="$HERE/payload"
BUNDLE_ID="ru.cloud.brandkit"
WITH_AME=0
WITH_PACKS=""
NO_PACKS=""
SANDBOX=""

while [ $# -gt 0 ]; do
  case "$1" in
    --with-ame) WITH_AME=1 ;;
    --with-4k) WITH_PACKS="$WITH_PACKS 4k" ;;
    --no-4k) NO_PACKS="$NO_PACKS 4k" ;;
    --with-music) WITH_PACKS="$WITH_PACKS music" ;;
    --no-music) NO_PACKS="$NO_PACKS music" ;;
    --sandbox) SANDBOX="$2"; shift ;;
    *) echo "Неизвестный параметр: $1"; exit 1 ;;
  esac
  shift
done

say() { printf '%s\n' "$*"; }
fail() { say "ОШИБКА: $*"; exit 1; }
# has "<words>" <word>: the list of option keys holds the key
has() { case " $1 " in *" $2 "*) return 0 ;; esac; return 1; }
pack_name() { case "$1" in 4k) printf '4K-фоны и клипы' ;; music) printf 'Стоковая музыка' ;; esac; }

[ -f "$PAYLOAD/VERSION" ] || fail "нет payload/VERSION рядом с установщиком: распакуйте архив целиком"
PLUGIN_VERSION="$(sed -n 's/^plugin=//p' "$PAYLOAD/VERSION")"
LIBRARY_VERSION="$(sed -n 's/^library=//p' "$PAYLOAD/VERSION")"
SIGNED="$(sed -n 's/^signed=//p' "$PAYLOAD/VERSION")"

if [ -n "$SANDBOX" ]; then
  mkdir -p "$SANDBOX" || fail "не создаётся $SANDBOX"
  SANDBOX="$(cd "$SANDBOX" && pwd)"
  USER_SUPPORT="$SANDBOX/home/Library/Application Support"
  SHARED_ROOT="$SANDBOX/Users/Shared/CloudRuBrandKit"
  CEP_CACHE="$SANDBOX/home/Library/Caches/CSXS/cep_cache"
  AME_ROOT="$SANDBOX/home/Documents/Adobe/Adobe Media Encoder"
else
  USER_SUPPORT="$HOME/Library/Application Support"
  SHARED_ROOT="/Users/Shared/CloudRuBrandKit"
  CEP_CACHE="$HOME/Library/Caches/CSXS/cep_cache"
  AME_ROOT="$HOME/Documents/Adobe/Adobe Media Encoder"
fi
CEP_DIR="$USER_SUPPORT/Adobe/CEP/extensions/$BUNDLE_ID"
TEMPLATES_DIR="$USER_SUPPORT/Adobe/Common/Motion Graphics Templates"
STATE_DIR="$USER_SUPPORT/CloudRuBrandKit"
LIBRARY_DIR="$SHARED_ROOT/library"

say "Cloud.ru BrandKit: панель $PLUGIN_VERSION, библиотека $LIBRARY_VERSION"

# 1. After Effects and Premiere read extensions and templates at start: refuse while they run.
if [ -z "$SANDBOX" ]; then
  RUNNING=""
  pgrep -f "Adobe After Effects" >/dev/null 2>&1 && RUNNING="After Effects"
  pgrep -f "Adobe Premiere Pro" >/dev/null 2>&1 && RUNNING="${RUNNING:+$RUNNING и }Premiere"
  # --with-ame rewrites the preset list of Media Encoder (step 6): only while it is closed
  if [ "$WITH_AME" = 1 ]; then
    pgrep -f "Adobe Media Encoder" >/dev/null 2>&1 && RUNNING="${RUNNING:+$RUNNING и }Media Encoder"
  fi
  if [ -n "$RUNNING" ]; then
    say "Закройте $RUNNING и запустите установщик снова."
    exit 2
  fi
fi

# 1a. The installer options (D24): the 4K loops and clips, the stock music. Each is asked for, or installed before and
#     not turned off; its files are checked to belong to this library before anything changes.
HAD_PACKS="$(sed -n 's/^packs=//p' "$STATE_DIR/installed.txt" 2>/dev/null | tr ',' ' ')"
USE_PACKS=""
for k in 4k music; do
  if has "$WITH_PACKS" "$k" || { has "$HAD_PACKS" "$k" && ! has "$NO_PACKS" "$k"; }; then
    if [ -d "$PAYLOAD/library-$k" ] && [ -f "$PAYLOAD/VERSION-$k" ]; then
      lib="$(sed -n 's/^library=//p' "$PAYLOAD/VERSION-$k")"
      [ "$lib" = "$LIBRARY_VERSION" ] || fail "файлы опции «$(pack_name "$k")» в этой папке — от библиотеки $lib, а ставится $LIBRARY_VERSION: распакуйте архив заново целиком в пустую папку"
      USE_PACKS="$USE_PACKS $k"
    elif has "$WITH_PACKS" "$k"; then
      fail "нет файлов опции «$(pack_name "$k")» (payload/library-$k): распакуйте архив целиком и запустите установщик снова"
    fi
  fi
done

# 2. Quarantine off the files of the package, so the copies do not carry it (spec 8.1 «Mac»).
if command -v xattr >/dev/null 2>&1; then
  xattr -dr com.apple.quarantine "$HERE" 2>/dev/null || true
fi

# 3. Extension: a folder of the same name that is not ours stays untouched.
if [ -d "$CEP_DIR" ]; then
  grep -q "ExtensionBundleId=\"$BUNDLE_ID\"" "$CEP_DIR/CSXS/manifest.xml" 2>/dev/null \
    || fail "$CEP_DIR занята другим расширением: удалите её вручную"
fi

# 4. Library in the shared folder, open to every user of the Mac: chmod can be done by the owner only,
#    so only our own files get it, errors on other users' files do not stop the install.
mkdir -p "$SHARED_ROOT" || fail "не создаётся $SHARED_ROOT"

# 3-4. The panel and the library are swapped in by renames, as install.ps1 does (an old library deleted file by file
#    was left half gone on Windows, 2026-10-20): the new copies first (the panel's outside the CEP extensions folder,
#    where CEP would load a second copy of the bundle), then the old ones aside in one move each; the panel failing
#    puts the library back. What was set aside goes at the very end (step 8).
STAMP="$(date +%Y%m%d-%H%M%S)"
ASIDE="$STATE_DIR/aside"
mkdir -p "$ASIDE" || fail "не создаётся $ASIDE"
CEP_NEW="$ASIDE/panel-new-$STAMP"
cp -R "$PAYLOAD/extension" "$CEP_NEW" || fail "панель не скопировалась в $CEP_NEW"
LIBRARY_NEW="$LIBRARY_DIR.new-$STAMP"
cp -R "$PAYLOAD/library" "$LIBRARY_NEW" || fail "библиотека не скопировалась"
# the files of the options into the new copy under the same paths (items/<id>/...)
for k in $USE_PACKS; do
  cp -R "$PAYLOAD/library-$k/." "$LIBRARY_NEW/" || fail "файлы опции «$(pack_name "$k")» не скопировались"
done
LIBRARY_OLD=""
if [ -d "$LIBRARY_DIR" ]; then
  LIBRARY_OLD="$LIBRARY_DIR.old-$STAMP"
  mv "$LIBRARY_DIR" "$LIBRARY_OLD" || fail "Библиотека занята ($LIBRARY_DIR): закройте After Effects, Premiere и Media Encoder и запустите установщик снова. Ничего не изменено."
fi
mv "$LIBRARY_NEW" "$LIBRARY_DIR" || fail "библиотека не встала на место в $LIBRARY_DIR"
mkdir -p "$(dirname "$CEP_DIR")" || fail "не создаётся $(dirname "$CEP_DIR")"
if [ -d "$CEP_DIR" ]; then
  if ! mv "$CEP_DIR" "$ASIDE/panel-old-$STAMP"; then
    mv "$LIBRARY_DIR" "$LIBRARY_NEW"
    [ -n "$LIBRARY_OLD" ] && mv "$LIBRARY_OLD" "$LIBRARY_DIR"
    fail "Панель занята ($CEP_DIR): закройте After Effects и Premiere и запустите установщик снова. Ничего не изменено."
  fi
fi
mv "$CEP_NEW" "$CEP_DIR" || fail "панель не встала на место в $CEP_DIR"
find "$SHARED_ROOT" -user "$(id -u)" -exec chmod a+rwX {} + 2>/dev/null || true
say "Панель: $CEP_DIR"
say "Библиотека: $LIBRARY_DIR"
for k in 4k music; do
  size=""
  if [ -f "$PAYLOAD/VERSION-$k" ]; then
    b="$(sed -n 's/^bytes=//p' "$PAYLOAD/VERSION-$k")"
    [ -n "$b" ] && size="$(awk -v b="$b" 'BEGIN { printf "%.1f ГБ", b / 1073741824 }')"
  fi
  if has "$USE_PACKS" "$k"; then
    say "$(pack_name "$k"): $(find "$PAYLOAD/library-$k" -type f | wc -l | tr -d ' ') файлов, $size"
  elif has "$HAD_PACKS" "$k" && ! has "$NO_PACKS" "$k"; then
    say "Внимание: опция «$(pack_name "$k")» стояла раньше, но её файлов в этой папке нет — она не поставлена. Чтобы вернуть, поставьте её из полного архива BrandKit."
  elif [ -d "$PAYLOAD/library-$k" ]; then
    say "Опция «$(pack_name "$k")» не ставилась ($size)"
  fi
done

# 5. MOGRT copies flat in Local Templates: the Graphics Templates panel does not see subfolders. Our copies of
#    the previous install that the new one does not carry are removed (the state file lists them).
mkdir -p "$TEMPLATES_DIR" "$STATE_DIR" || fail "не создаются $TEMPLATES_DIR и $STATE_DIR"
NEW_LIST="$STATE_DIR/installed-mogrt.txt.new"
: > "$NEW_LIST"
while IFS= read -r rel || [ -n "$rel" ]; do
  [ -z "$rel" ] && continue
  name="$(basename "$rel")"
  cp "$PAYLOAD/library/$rel" "$TEMPLATES_DIR/$name" || fail "не скопировался $name"
  printf '%s\n' "$name" >> "$NEW_LIST"
done < "$PAYLOAD/mogrt.txt"
REMOVED=0
if [ -f "$STATE_DIR/installed-mogrt.txt" ]; then
  while IFS= read -r old || [ -n "$old" ]; do
    case "$old" in
      ''|*/*|*..*) continue ;;
      *.mogrt) ;;
      *) continue ;;
    esac
    if ! grep -qxF "$old" "$NEW_LIST"; then
      rm -f "$TEMPLATES_DIR/$old" && REMOVED=$((REMOVED + 1))
    fi
  done < "$STATE_DIR/installed-mogrt.txt"
fi
mv "$NEW_LIST" "$STATE_DIR/installed-mogrt.txt"
say "Шаблоны MOGRT: $(wc -l < "$STATE_DIR/installed-mogrt.txt" | tr -d ' ') в $TEMPLATES_DIR, убрано прежних: $REMOVED"

# 6. Brand export presets for Adobe Media Encoder, on request: into every version folder that exists, under
#    the names of their AE templates (payload/ame.txt: <path in the library><TAB><file name>).
AME_LIST="$PAYLOAD/ame.txt"
if [ "$WITH_AME" = 1 ]; then
  if [ -s "$AME_LIST" ] && [ -d "$AME_ROOT" ]; then
    for v in "$AME_ROOT"/*/; do
      # version folders only (25.0, 26.0): AME keeps other folders there too, such as its Audio Previews
      case "$(basename "$v")" in
        ''|*[!0-9.]*) continue ;;
      esac
      mkdir -p "$v/Presets"
      n=0
      while IFS="$(printf '\t')" read -r rel name || [ -n "$rel" ]; do
        case "$name" in
          *.epr) ;;
          *) continue ;;
        esac
        case "$rel$name" in
          *..*|*/) continue ;;
        esac
        cp "$LIBRARY_DIR/$rel" "$v/Presets/$name" && n=$((n + 1))
      done < "$AME_LIST"
      say "Пресеты AME: $n в ${v}Presets"
      # The Preset Browser lists Presets/PresetTree.xml, not the folder: set aside (never deleted), the tree is
      # rebuilt from the folder at the next start of Media Encoder (docs/research/export/ame-presets.json).
      if [ -f "${v}Presets/PresetTree.xml" ]; then
        BAK="${v}Presets/PresetTree.xml.brandkit-$(date +%Y%m%d-%H%M%S).bak"
        mv "${v}Presets/PresetTree.xml" "$BAK"
        say "  Список пресетов Media Encoder перестроится при запуске; прежний сохранён: $BAK"
      fi
    done
  else
    say "Пресеты AME: нечего ставить или нет папки $AME_ROOT"
  fi
fi

# 6a. The AE Output Module templates cannot be loaded by a script (decision P21): say where the file is.
if [ -s "$PAYLOAD/aom.txt" ]; then
  AOM_REL="$(head -n 1 "$PAYLOAD/aom.txt")"
  say "Шаблоны вывода After Effects: один раз загрузите в AE через Edit > Templates > Output Module > Load... файл $LIBRARY_DIR/$AOM_REL"
fi

# 7. Cached pages of earlier versions of the panel.
if [ -d "$CEP_CACHE" ]; then
  find "$CEP_CACHE" -maxdepth 1 -name "*$BUNDLE_ID*" -exec rm -rf {} + 2>/dev/null || true
fi

PACKS="$(echo $USE_PACKS | tr ' ' ',')"
printf 'plugin=%s\nlibrary=%s\ninstalled=%s\npacks=%s\n' "$PLUGIN_VERSION" "$LIBRARY_VERSION" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$PACKS" > "$STATE_DIR/installed.txt"
if [ "$SIGNED" != 1 ]; then
  say "Внимание: панель без подписи. Она загрузится только с PlayerDebugMode: defaults write com.adobe.CSXS.11 PlayerDebugMode 1 (и .12)"
fi
say "Готово. Запустите After Effects или Premiere: Window > Extensions > Cloud.ru BrandKit."

# 8. What the swaps set aside, and the leftovers of runs stopped half-way; what stays goes with the next install.
LEFT=""
for d in "$SHARED_ROOT"/library.old-* "$SHARED_ROOT"/library.new* "$ASIDE"/*; do
  [ -e "$d" ] || continue
  rm -rf "$d" 2>/dev/null
  [ -e "$d" ] && LEFT="$LEFT $d"
done
[ -n "$LEFT" ] && say "Внимание: прежние копии удалились не целиком, их уберёт следующая установка:$LEFT"
exit 0
