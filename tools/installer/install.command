#!/bin/bash
# Cloud.ru BrandKit installer for macOS (spec 8.1). No admin rights, no Creative Cloud app, no Adobe ID.
# Run from Terminal: bash install.command  (a file downloaded by a browser or a messenger is quarantined,
# and a double click does not open it on macOS 15+).
#   bash install.command [--with-ame] [--sandbox <dir>]
# --with-ame   also copies the brand .epr presets into the user presets of Adobe Media Encoder
# --sandbox    installs into <dir>/... instead of the real folders (a dry run for checks); skips the
#              check for running apps
# Exit codes: 0 installed, 2 refused (After Effects or Premiere is running), 1 error.
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
PAYLOAD="$HERE/payload"
BUNDLE_ID="ru.cloud.brandkit"
WITH_AME=0
SANDBOX=""

while [ $# -gt 0 ]; do
  case "$1" in
    --with-ame) WITH_AME=1 ;;
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
  if [ -n "$RUNNING" ]; then
    say "Закройте $RUNNING и запустите установщик снова."
    exit 2
  fi
fi

# 2. Quarantine off the files of the package, so the copies do not carry it (spec 8.1 «Mac»).
if command -v xattr >/dev/null 2>&1; then
  xattr -dr com.apple.quarantine "$HERE" 2>/dev/null || true
fi

# 3. Extension: replaced as a whole; a folder of the same name that is not ours stays untouched.
if [ -d "$CEP_DIR" ]; then
  grep -q "ExtensionBundleId=\"$BUNDLE_ID\"" "$CEP_DIR/CSXS/manifest.xml" 2>/dev/null \
    || fail "$CEP_DIR занята другим расширением: удалите её вручную"
  rm -rf "$CEP_DIR" || fail "не удаляется прежняя версия панели $CEP_DIR"
fi
mkdir -p "$(dirname "$CEP_DIR")" && cp -R "$PAYLOAD/extension" "$CEP_DIR" || fail "панель не скопировалась в $CEP_DIR"
say "Панель: $CEP_DIR"

# 4. Library in the shared folder, open to every user of the Mac: chmod can be done by the owner only,
#    so only our own files get it, errors on other users' files do not stop the install.
mkdir -p "$SHARED_ROOT" || fail "не создаётся $SHARED_ROOT"
rm -rf "$LIBRARY_DIR.new" && cp -R "$PAYLOAD/library" "$LIBRARY_DIR.new" || fail "библиотека не скопировалась"
rm -rf "$LIBRARY_DIR" && mv "$LIBRARY_DIR.new" "$LIBRARY_DIR" || fail "библиотека не заменилась в $LIBRARY_DIR"
find "$SHARED_ROOT" -user "$(id -u)" -exec chmod a+rwX {} + 2>/dev/null || true
say "Библиотека: $LIBRARY_DIR"

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

printf 'plugin=%s\nlibrary=%s\ninstalled=%s\n' "$PLUGIN_VERSION" "$LIBRARY_VERSION" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STATE_DIR/installed.txt"
if [ "$SIGNED" != 1 ]; then
  say "Внимание: панель без подписи. Она загрузится только с PlayerDebugMode: defaults write com.adobe.CSXS.11 PlayerDebugMode 1 (и .12)"
fi
say "Готово. Запустите After Effects или Premiere: Window > Extensions > Cloud.ru BrandKit."
exit 0
