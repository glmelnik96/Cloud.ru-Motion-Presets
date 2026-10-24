#!/bin/bash
# Cloud.ru BrandKit installer for macOS (spec 8.1). No admin rights, no Creative Cloud app, no Adobe ID.
# Run from Terminal: bash install.command  (a file downloaded by a browser or a messenger is quarantined,
# and a double click does not open it on macOS 15+).
#   bash install.command [--with-ame] [--with-4k | --no-4k] [--sandbox <dir>]
# --with-ame   also copies the brand .epr presets into the user presets of Adobe Media Encoder
# --with-4k    also installs the 4K loops and clips (D24): payload/library-4k, from the archive <folder>-4k.zip
#              unpacked over this folder. A later install keeps them while they are unpacked here
# --no-4k      leaves the 4K files out although an earlier install had them
# --sandbox    installs into <dir>/... instead of the real folders (a dry run for checks); skips the
#              check for running apps
# Exit codes: 0 installed, 2 refused (After Effects or Premiere is running, or Media Encoder with --with-ame), 1 error.
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
PAYLOAD="$HERE/payload"
BUNDLE_ID="ru.cloud.brandkit"
WITH_AME=0
WITH_4K=0
NO_4K=0
SANDBOX=""

while [ $# -gt 0 ]; do
  case "$1" in
    --with-ame) WITH_AME=1 ;;
    --with-4k) WITH_4K=1 ;;
    --no-4k) NO_4K=1 ;;
    --sandbox) SANDBOX="$2"; shift ;;
    *) echo "Неизвестный параметр: $1"; exit 1 ;;
  esac
  shift
done

say() { printf '%s\n' "$*"; }
fail() { say "ОШИБКА: $*"; exit 1; }

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

# 1a. The 4K option (D24): asked for, or installed before and not turned off. Its files are checked to belong to this
#     library before anything changes.
PACK_4K="$PAYLOAD/library-4k"
VERSION_4K="$PAYLOAD/VERSION-4k"
HAD_4K=0
grep -qxF 'packs=4k' "$STATE_DIR/installed.txt" 2>/dev/null && HAD_4K=1
WANT_4K=0
if [ "$WITH_4K" = 1 ] || { [ "$HAD_4K" = 1 ] && [ "$NO_4K" = 0 ]; }; then WANT_4K=1; fi
PACK_HERE=0
[ -d "$PACK_4K" ] && [ -f "$VERSION_4K" ] && PACK_HERE=1
SIZE_4K=""
if [ "$PACK_HERE" = 1 ]; then
  BYTES_4K="$(sed -n 's/^bytes=//p' "$VERSION_4K")"
  [ -n "$BYTES_4K" ] && SIZE_4K="$(awk -v b="$BYTES_4K" 'BEGIN { printf "%.1f ГБ", b / 1073741824 }')"
fi
USE_4K=0
if [ "$WANT_4K" = 1 ]; then
  if [ "$PACK_HERE" = 1 ]; then
    LIB_4K="$(sed -n 's/^library=//p' "$VERSION_4K")"
    [ "$LIB_4K" = "$LIBRARY_VERSION" ] || fail "4K-файлы рядом — от библиотеки $LIB_4K, а ставится $LIBRARY_VERSION: распакуйте сюда архив 4K той же версии"
    USE_4K=1
  elif [ "$WITH_4K" = 1 ]; then
    fail "нет 4K-файлов (payload/library-4k): распакуйте сюда архив $(basename "$HERE")-4k.zip — его папка совпадёт с этой — и запустите установщик снова"
  fi
fi

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
# the 4K files into the new copy under the same paths (items/<id>/...)
N_4K=0
if [ "$USE_4K" = 1 ]; then
  cp -R "$PACK_4K/." "$LIBRARY_NEW/" || fail "4K-файлы не скопировались"
  N_4K="$(find "$PACK_4K" -type f | wc -l | tr -d ' ')"
fi
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
if [ "$USE_4K" = 1 ]; then
  say "4K-петли и клипы: $N_4K файлов, $SIZE_4K"
elif [ "$HAD_4K" = 1 ] && [ "$NO_4K" = 0 ]; then
  say "Внимание: 4K-петли и клипы стояли раньше, но в этой папке их нет — они не поставлены. Чтобы вернуть: распакуйте сюда архив $(basename "$HERE")-4k.zip и запустите bash install.command --with-4k"
elif [ "$PACK_HERE" = 1 ]; then
  say "4K-петли и клипы не ставились ($SIZE_4K): их поставит bash install.command --with-4k"
fi

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

PACKS=""
[ "$USE_4K" = 1 ] && PACKS="4k"
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
