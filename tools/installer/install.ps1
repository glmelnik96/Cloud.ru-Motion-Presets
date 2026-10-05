# Cloud.ru BrandKit installer for Windows (spec 8.1). No admin rights, no Creative Cloud app, no Adobe ID.
# Windows PowerShell 5.1 and PowerShell 7. install.cmd runs it with -ExecutionPolicy Bypass.
#   install.cmd [-WithAme] [-Sandbox <dir>]
# -WithAme   also copies the brand .epr presets into the user presets of Adobe Media Encoder
# -Sandbox   installs into <dir>\... instead of the real folders (a dry run for checks); skips the check for
#            running apps and the folder rights
# Exit codes: 0 installed, 2 refused (After Effects or Premiere is running), 1 error.
# The same steps as install.command (macOS); keep the two in step.
param(
  [switch]$WithAme,
  [string]$Sandbox = ''
)
$ErrorActionPreference = 'Stop'
$BundleId = 'ru.cloud.brandkit'
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Payload = Join-Path $Here 'payload'

function Say([string]$Text) { Write-Host $Text }
function Fail([string]$Text) { Write-Host "ОШИБКА: $Text"; exit 1 }

try {
  $versionFile = Join-Path $Payload 'VERSION'
  if (-not (Test-Path -LiteralPath $versionFile)) { Fail 'нет payload\VERSION рядом с установщиком: распакуйте архив целиком' }
  $ver = @{}
  foreach ($line in Get-Content -LiteralPath $versionFile) {
    if ($line -match '^([a-z]+)=(.*)$') { $ver[$Matches[1]] = $Matches[2] }
  }

  if ($Sandbox) {
    New-Item -ItemType Directory -Force -Path $Sandbox | Out-Null
    $Sandbox = (Resolve-Path -LiteralPath $Sandbox).Path
    $AppData = Join-Path $Sandbox 'AppData\Roaming'
    $LocalAppData = Join-Path $Sandbox 'AppData\Local'
    $SharedRoot = Join-Path $Sandbox 'ProgramData\CloudRuBrandKit'
    $Documents = Join-Path $Sandbox 'Documents'
  } else {
    $AppData = $env:APPDATA
    $LocalAppData = $env:LOCALAPPDATA
    $SharedRoot = Join-Path $env:ProgramData 'CloudRuBrandKit'
    $Documents = [Environment]::GetFolderPath('MyDocuments')
  }
  $CepDir = Join-Path $AppData "Adobe\CEP\extensions\$BundleId"
  $TemplatesDir = Join-Path $AppData 'Adobe\Common\Motion Graphics Templates'
  $StateDir = Join-Path $AppData 'CloudRuBrandKit'
  $LibraryDir = Join-Path $SharedRoot 'library'
  $CepCache = Join-Path $LocalAppData 'Temp\cep_cache'
  $AmeRoot = Join-Path $Documents 'Adobe\Adobe Media Encoder'

  Say "Cloud.ru BrandKit: панель $($ver['plugin']), библиотека $($ver['library'])"

  # 1. After Effects and Premiere read extensions and templates at start: refuse while they run.
  if (-not $Sandbox) {
    $running = @()
    if (Get-Process -Name 'AfterFX' -ErrorAction SilentlyContinue) { $running += 'After Effects' }
    if (Get-Process -Name 'Adobe Premiere Pro' -ErrorAction SilentlyContinue) { $running += 'Premiere' }
    if ($running.Count) {
      Say "Закройте $($running -join ' и ') и запустите установщик снова."
      exit 2
    }
  }

  # 2. Files downloaded by a browser carry the Mark of the Web; the copies must not.
  Get-ChildItem -LiteralPath $Here -Recurse -File | Unblock-File -ErrorAction SilentlyContinue

  # 3. Extension: replaced as a whole; a folder of the same name that is not ours stays untouched.
  if (Test-Path -LiteralPath $CepDir) {
    $manifest = Join-Path $CepDir 'CSXS\manifest.xml'
    if (-not ((Test-Path -LiteralPath $manifest) -and (Select-String -LiteralPath $manifest -SimpleMatch "ExtensionBundleId=`"$BundleId`"" -Quiet))) {
      Fail "$CepDir занята другим расширением: удалите её вручную"
    }
    Remove-Item -LiteralPath $CepDir -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $CepDir) | Out-Null
  Copy-Item -LiteralPath (Join-Path $Payload 'extension') -Destination $CepDir -Recurse
  Say "Панель: $CepDir"

  # 4. Library in the shared folder, opened for writing to every user of the machine (Users group by SID,
  #    the same in any Windows language). On every install, not only when the folder is new: a folder left by
  #    an earlier install or a dev copy keeps the inherited ProgramData rights, read only (installer check
  #    2026-10-05). Only the owner of the folder can grant; for anyone else it is a warning, not a stop.
  New-Item -ItemType Directory -Force -Path $SharedRoot | Out-Null
  if (-not $Sandbox) {
    & icacls "$SharedRoot" /grant "*S-1-5-32-545:(OI)(CI)M" | Out-Null
    if ($LASTEXITCODE -ne 0) { Say "Внимание: icacls не открыл $SharedRoot на запись всем пользователям (код $LASTEXITCODE). Попросите владельца папки или IT выполнить: icacls `"$SharedRoot`" /grant `"*S-1-5-32-545:(OI)(CI)M`"" }
  }
  $libraryNew = "$LibraryDir.new"
  if (Test-Path -LiteralPath $libraryNew) { Remove-Item -LiteralPath $libraryNew -Recurse -Force }
  Copy-Item -LiteralPath (Join-Path $Payload 'library') -Destination $libraryNew -Recurse
  if (Test-Path -LiteralPath $LibraryDir) { Remove-Item -LiteralPath $LibraryDir -Recurse -Force }
  Rename-Item -LiteralPath $libraryNew -NewName 'library'
  Say "Библиотека: $LibraryDir"

  # 5. MOGRT copies flat in Local Templates: the Graphics Templates panel does not see subfolders. Our copies of
  #    the previous install that the new one does not carry are removed (the state file lists them).
  New-Item -ItemType Directory -Force -Path $TemplatesDir, $StateDir | Out-Null
  $installed = @()
  foreach ($rel in Get-Content -LiteralPath (Join-Path $Payload 'mogrt.txt')) {
    if (-not $rel.Trim()) { continue }
    $name = Split-Path -Leaf $rel
    Copy-Item -LiteralPath (Join-Path (Join-Path $Payload 'library') $rel) -Destination (Join-Path $TemplatesDir $name) -Force
    $installed += $name
  }
  $stateFile = Join-Path $StateDir 'installed-mogrt.txt'
  $removed = 0
  if (Test-Path -LiteralPath $stateFile) {
    foreach ($old in Get-Content -LiteralPath $stateFile) {
      if (-not ($old -match '^[A-Za-z0-9_-]+\.mogrt$')) { continue }
      if ($installed -notcontains $old) {
        $p = Join-Path $TemplatesDir $old
        if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Force; $removed++ }
      }
    }
  }
  [IO.File]::WriteAllLines($stateFile, [string[]]$installed)
  Say "Шаблоны MOGRT: $($installed.Count) в $TemplatesDir, убрано прежних: $removed"

  # 6. Brand export presets for Adobe Media Encoder, on request: into every version folder that exists.
  if ($WithAme) {
    $ame = Join-Path $Payload 'library\ame'
    if ((Test-Path -LiteralPath $ame) -and (Test-Path -LiteralPath $AmeRoot)) {
      foreach ($v in Get-ChildItem -LiteralPath $AmeRoot -Directory) {
        $presets = Join-Path $v.FullName 'Presets'
        New-Item -ItemType Directory -Force -Path $presets | Out-Null
        Copy-Item -Path (Join-Path $ame '*.epr') -Destination $presets -Force
        Say "Пресеты AME: $presets"
      }
    } else {
      Say "Пресеты AME: нечего ставить или нет папки $AmeRoot"
    }
  }

  # 7. Cached pages of earlier versions of the panel.
  if (Test-Path -LiteralPath $CepCache) {
    Get-ChildItem -LiteralPath $CepCache -Directory -Filter "*$BundleId*" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  }

  [IO.File]::WriteAllLines((Join-Path $StateDir 'installed.txt'), [string[]]@(
    "plugin=$($ver['plugin'])", "library=$($ver['library'])", "installed=$((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'))"))
  if ($ver['signed'] -ne '1') {
    Say 'Внимание: панель без подписи. Она загрузится только с PlayerDebugMode: reg add HKCU\Software\Adobe\CSXS.11 /v PlayerDebugMode /t REG_SZ /d 1 /f (и CSXS.12)'
  }
  Say 'Готово. Запустите After Effects или Premiere: Window > Extensions > Cloud.ru BrandKit.'
  exit 0
} catch {
  Fail $_.Exception.Message
}
