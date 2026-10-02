# Links dev/harness into the per-user CEP extensions folder (a junction: no admin rights needed)
# and reports PlayerDebugMode. It never changes the registry; if the key is missing it prints the command.
$ErrorActionPreference = 'Stop'
$repo = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$src = Join-Path $repo 'dev\harness'
$dst = Join-Path $env:APPDATA 'Adobe\CEP\extensions\ru.cloud.brandkit.dev'
if (Test-Path $dst) {
  $item = Get-Item $dst -Force
  if ($item.LinkType -ne 'Junction') { throw "$dst exists and is not a junction; remove it by hand" }
  cmd /c rmdir "$dst" | Out-Null
}
cmd /c mklink /J "$dst" "$src" | Out-Null
Write-Output "linked: $dst -> $src"
foreach ($v in '11', '12') {
  $key = "HKCU:\Software\Adobe\CSXS.$v"
  $mode = (Get-ItemProperty -Path $key -Name PlayerDebugMode -ErrorAction SilentlyContinue).PlayerDebugMode
  if ($mode -eq '1') { Write-Output "CSXS.$v PlayerDebugMode=1" }
  else { Write-Output "CSXS.$v PlayerDebugMode is not set. Run: reg add HKCU\Software\Adobe\CSXS.$v /v PlayerDebugMode /t REG_SZ /d 1 /f" }
}
