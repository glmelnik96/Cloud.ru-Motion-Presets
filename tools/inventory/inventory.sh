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
