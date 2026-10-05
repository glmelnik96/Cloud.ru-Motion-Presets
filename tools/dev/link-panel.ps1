# Links panel\dist into the per-user CEP extensions folder as ru.cloud.brandkit (a junction: no admin rights)
# and points the panel at a library root through %LOCALAPPDATA%\CloudRuBrandKit\settings.json (plan 2026-10-05 P6).
# Build first: node tools/panel/build.mjs --dev. The host sees a new extension only after a restart.
# Run it from an ordinary terminal: a PowerShell started by a packaged app (the Claude desktop app) gets AppData
# virtualization, and the hosts never see the settings.json it writes; then use tools/dev/panel-settings.mjs.
param([string]$LibraryRoot = 'C:/CRBK/work/library')
$ErrorActionPreference = 'Stop'
$repo = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$src = Join-Path $repo 'panel\dist'
if (-not (Test-Path (Join-Path $src 'CSXS\manifest.xml'))) { throw "$src has no CSXS\manifest.xml; run node tools/panel/build.mjs --dev first" }
$dst = Join-Path $env:APPDATA 'Adobe\CEP\extensions\ru.cloud.brandkit'
if (Test-Path $dst) {
  $item = Get-Item $dst -Force
  if ($item.LinkType -ne 'Junction') { throw "$dst exists and is not a junction; remove it by hand" }
  cmd /c rmdir "$dst" | Out-Null
}
cmd /c mklink /J "$dst" "$src" | Out-Null
Write-Output "linked: $dst -> $src"

$dir = Join-Path $env:LOCALAPPDATA 'CloudRuBrandKit'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$file = Join-Path $dir 'settings.json'
$settings = @{}
if (Test-Path $file) {
  $old = Get-Content -Raw -Encoding UTF8 $file | ConvertFrom-Json
  foreach ($p in $old.PSObject.Properties) { $settings[$p.Name] = $p.Value }
}
$settings['libraryRoot'] = $LibraryRoot
$json = $settings | ConvertTo-Json
[System.IO.File]::WriteAllText($file, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Output "settings: $file libraryRoot=$LibraryRoot"

foreach ($v in '11', '12') {
  $key = "HKCU:\Software\Adobe\CSXS.$v"
  $mode = (Get-ItemProperty -Path $key -Name PlayerDebugMode -ErrorAction SilentlyContinue).PlayerDebugMode
  if ($mode -eq '1') { Write-Output "CSXS.$v PlayerDebugMode=1" }
  else { Write-Output "CSXS.$v PlayerDebugMode is not set. Run: reg add HKCU\Software\Adobe\CSXS.$v /v PlayerDebugMode /t REG_SZ /d 1 /f" }
}
