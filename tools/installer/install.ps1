# Cloud.ru BrandKit installer for Windows (spec 8.1). No admin rights, no Creative Cloud app, no Adobe ID.
# Windows PowerShell 5.1 and PowerShell 7. install.cmd runs it with -ExecutionPolicy Bypass.
#   install.cmd [-WithAme] [-With4K | -No4K] [-Sandbox <dir>]
# -WithAme   also copies the brand .epr presets into the user presets of Adobe Media Encoder
# -With4K    also installs the 4K loops and clips (D24): payload\library-4k, from the archive <folder>-4k.zip unpacked
#            over this folder; install-4k.cmd passes it. A later install keeps them while they are unpacked here
# -No4K      leaves the 4K files out although an earlier install had them
# -Sandbox   installs into <dir>\... instead of the real folders (a dry run for checks); skips the check for
#            running apps and the folder rights
# -Done <file>  written as the very last step; install.cmd passes it and reports a run that ended without it
# -Interrupted  only says that the run before stopped half-way (install.cmd calls it, its text lives here)
# Exit codes: 0 installed, 2 refused (After Effects or Premiere is running, or Media Encoder with -WithAme), 1 error.
# The same steps as install.command (macOS); keep the two in step.
# BRANDKIT_INSTALL_TEST_STOP=swap ends the process right after the swap, as an antivirus does (installer tests only).
param(
  [switch]$WithAme,
  [switch]$With4K,
  [switch]$No4K,
  [string]$Sandbox = '',
  [string]$Done = '',
  [switch]$Interrupted
)
$ErrorActionPreference = 'Stop'
$BundleId = 'ru.cloud.brandkit'
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Payload = Join-Path $Here 'payload'

function Say([string]$Text) { Write-Host $Text }
function Fail([string]$Text) { Write-Host "ОШИБКА: $Text"; exit 1 }
function Busy([string]$What, [string]$Path) { "$What занята ($Path): закройте After Effects, Premiere и Media Encoder, подождите полминуты и запустите установщик снова. Ничего не изменено." }

# On the build PC an antivirus (360 Total Security) stopped the script in the middle of a delete with exit code 0 and
# no message (2026-10-20); install.cmd then saw a success. It now checks the -Done file and calls this.
if ($Interrupted) {
  Fail "установка прервалась на середине без сообщения: так бывает, когда скрипт останавливает антивирус. Запустите установщик ещё раз. Если повторится, запустите его из окна PowerShell: & `".\install.ps1`" (с теми же ключами) или попросите IT добавить папку установщика в исключения антивируса."
}

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
    # -WithAme rewrites the preset list of Media Encoder (step 6): only while it is closed
    if ($WithAme -and (Get-Process -Name 'Adobe Media Encoder' -ErrorAction SilentlyContinue)) { $running += 'Media Encoder' }
    if ($running.Count) {
      Say "Закройте $($running -join ' и ') и запустите установщик снова."
      exit 2
    }
  }

  # 1a. The 4K option (D24): asked for, or installed before and not turned off. Its files are checked to belong to this
  #     library before anything changes.
  $Pack4k = Join-Path $Payload 'library-4k'
  $Version4k = Join-Path $Payload 'VERSION-4k'
  $installedFile = Join-Path $StateDir 'installed.txt'
  $had4k = (Test-Path -LiteralPath $installedFile) -and (Select-String -LiteralPath $installedFile -SimpleMatch 'packs=4k' -Quiet)
  $want4k = $With4K -or ($had4k -and -not $No4K)
  $packHere = (Test-Path -LiteralPath $Pack4k) -and (Test-Path -LiteralPath $Version4k)
  $v4 = @{}
  if ($packHere) {
    foreach ($line in Get-Content -LiteralPath $Version4k) {
      if ($line -match '^([a-z]+)=(.*)$') { $v4[$Matches[1]] = $Matches[2] }
    }
  }
  $size4k = if ($v4['bytes']) { '{0:N1} ГБ' -f ([double]$v4['bytes'] / 1GB) } else { '' }
  $use4k = $false
  if ($want4k) {
    if ($packHere -and $v4['library'] -ne $ver['library']) {
      Fail "4K-файлы рядом — от библиотеки $($v4['library']), а ставится $($ver['library']): распакуйте сюда архив 4K той же версии"
    }
    if ($packHere) { $use4k = $true }
    elseif ($With4K) { Fail "нет 4K-файлов (payload\library-4k): распакуйте сюда архив $(Split-Path -Leaf $Here)-4k.zip — его папка совпадёт с этой — и запустите установщик снова" }
  }

  # 2. Files downloaded by a browser carry the Mark of the Web; the copies must not.
  Get-ChildItem -LiteralPath $Here -Recurse -File | Unblock-File -ErrorAction SilentlyContinue

  # 3. Extension: a folder of the same name that is not ours stays untouched.
  if (Test-Path -LiteralPath $CepDir) {
    $manifest = Join-Path $CepDir 'CSXS\manifest.xml'
    if (-not ((Test-Path -LiteralPath $manifest) -and (Select-String -LiteralPath $manifest -SimpleMatch "ExtensionBundleId=`"$BundleId`"" -Quiet))) {
      Fail "$CepDir занята другим расширением: удалите её вручную"
    }
  }

  # 4. Library in the shared folder, opened for writing to every user of the machine (Users group by SID,
  #    the same in any Windows language). On every install, not only when the folder is new: a folder left by
  #    an earlier install or a dev copy keeps the inherited ProgramData rights, read only (installer check
  #    2026-10-05). Only the owner of the folder can grant; for anyone else it is a warning, not a stop.
  New-Item -ItemType Directory -Force -Path $SharedRoot | Out-Null
  if (-not $Sandbox) {
    & icacls "$SharedRoot" /grant "*S-1-5-32-545:(OI)(CI)M" | Out-Null
    if ($LASTEXITCODE -ne 0) { Say "Внимание: icacls не открыл $SharedRoot на запись всем пользователям (код $LASTEXITCODE). Попросите владельца папки или IT выполнить: icacls `"$SharedRoot`" /grant `"*S-1-5-32-545:(OI)(CI)M`"" }
  }

  # 3-4. The panel and the library are swapped in by renames, never deleted in place: an old library deleted file by
  #    file was left half gone when a preview was held open, or when an antivirus stopped the script without a word
  #    (build PC, 2026-10-20). The new copies are made first (the panel's outside the CEP extensions folder: CEP
  #    would load a second copy of the bundle found there); the old ones move aside in one step each, a held file
  #    refuses that before anything changes, and the panel failing puts the library back. What was set aside goes
  #    at the very end (step 8).
  $Stamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
  $Aside = Join-Path $StateDir 'aside'
  New-Item -ItemType Directory -Force -Path $Aside | Out-Null
  $cepNew = Join-Path $Aside "panel-new-$Stamp"
  Copy-Item -LiteralPath (Join-Path $Payload 'extension') -Destination $cepNew -Recurse
  $libraryNew = "$LibraryDir.new-$Stamp"
  Copy-Item -LiteralPath (Join-Path $Payload 'library') -Destination $libraryNew -Recurse
  # the 4K files into the new copy, file by file under the same paths (items\<id>\...)
  $n4k = 0
  if ($use4k) {
    $from4k = (Resolve-Path -LiteralPath $Pack4k).Path
    foreach ($f in Get-ChildItem -LiteralPath $from4k -Recurse -File) {
      $to = Join-Path $libraryNew $f.FullName.Substring($from4k.Length).TrimStart('\')
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $to) | Out-Null
      Copy-Item -LiteralPath $f.FullName -Destination $to
      $n4k++
    }
  }
  $libraryOld = $null
  if (Test-Path -LiteralPath $LibraryDir) {
    $libraryOld = "$LibraryDir.old-$Stamp"
    try { Rename-Item -LiteralPath $LibraryDir -NewName (Split-Path -Leaf $libraryOld) } catch { Fail (Busy 'Библиотека' $LibraryDir) }
  }
  Rename-Item -LiteralPath $libraryNew -NewName 'library'
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $CepDir) | Out-Null
  if (Test-Path -LiteralPath $CepDir) {
    try {
      Move-Item -LiteralPath $CepDir -Destination (Join-Path $Aside "panel-old-$Stamp")
    } catch {
      Rename-Item -LiteralPath $LibraryDir -NewName (Split-Path -Leaf $libraryNew)
      if ($libraryOld) { Rename-Item -LiteralPath $libraryOld -NewName 'library' }
      Fail (Busy 'Панель' $CepDir)
    }
  }
  Move-Item -LiteralPath $cepNew -Destination $CepDir
  if ($env:BRANDKIT_INSTALL_TEST_STOP -eq 'swap') { [Environment]::Exit(0) }
  Say "Панель: $CepDir"
  Say "Библиотека: $LibraryDir"
  if ($use4k) { Say "4K-петли и клипы: $n4k файлов, $size4k" }
  elseif ($had4k -and -not $No4K) { Say "Внимание: 4K-петли и клипы стояли раньше, но в этой папке их нет — они не поставлены. Чтобы вернуть: распакуйте сюда архив $(Split-Path -Leaf $Here)-4k.zip и запустите install-4k.cmd" }
  elseif ($packHere) { Say "4K-петли и клипы не ставились ($size4k): их поставит install-4k.cmd" }

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

  # 6. Brand export presets for Adobe Media Encoder, on request: into every version folder that exists, under
  #    the names of their AE templates (payload\ame.txt: <path in the library><TAB><file name>).
  $ameList = @()
  $ameFile = Join-Path $Payload 'ame.txt'
  if (Test-Path -LiteralPath $ameFile) {
    foreach ($line in Get-Content -LiteralPath $ameFile) {
      $parts = $line -split "`t"
      if ($parts.Count -eq 2 -and $parts[1] -match '^[A-Za-z0-9 _-]+\.epr$') { $ameList += ,$parts }
    }
  }
  if ($WithAme) {
    if ($ameList.Count -and (Test-Path -LiteralPath $AmeRoot)) {
      # version folders only (25.0, 26.0): AME keeps other folders there too, such as its Audio Previews
      foreach ($v in (Get-ChildItem -LiteralPath $AmeRoot -Directory | Where-Object { $_.Name -match '^[0-9]+(\.[0-9]+)*$' })) {
        $presets = Join-Path $v.FullName 'Presets'
        New-Item -ItemType Directory -Force -Path $presets | Out-Null
        foreach ($a in $ameList) {
          Copy-Item -LiteralPath (Join-Path $LibraryDir ($a[0] -replace '/', '\')) -Destination (Join-Path $presets $a[1]) -Force
        }
        Say "Пресеты AME: $($ameList.Count) в $presets"
        # The Preset Browser lists Presets\PresetTree.xml, not the folder: a preset already there keeps its old
        # name, a new one may not show. Set aside (never deleted), the tree is rebuilt from the folder at the next
        # start of Media Encoder, with every «CR …» (AME research 2026-10-06, docs/research/export/ame-presets.json).
        $tree = Join-Path $presets 'PresetTree.xml'
        if (Test-Path -LiteralPath $tree) {
          $bak = Join-Path $presets ('PresetTree.xml.brandkit-' + (Get-Date).ToString('yyyyMMdd-HHmmss') + '.bak')
          Move-Item -LiteralPath $tree -Destination $bak
          Say "  Список пресетов Media Encoder перестроится при запуске; прежний сохранён: $bak"
        }
      }
    } else {
      Say "Пресеты AME: нечего ставить или нет папки $AmeRoot"
    }
  }

  # 6a. The AE Output Module templates cannot be loaded by a script (decision P21): say where the file is.
  $aomFile = Join-Path $Payload 'aom.txt'
  if (Test-Path -LiteralPath $aomFile) {
    $aomRel = (Get-Content -LiteralPath $aomFile | Select-Object -First 1)
    if ($aomRel) {
      Say "Шаблоны вывода After Effects: один раз загрузите в AE через Edit > Templates > Output Module > Load... файл $(Join-Path $LibraryDir ($aomRel -replace '/', '\'))"
    }
  }

  # 7. Cached pages of earlier versions of the panel.
  if (Test-Path -LiteralPath $CepCache) {
    Get-ChildItem -LiteralPath $CepCache -Directory -Filter "*$BundleId*" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  }

  [IO.File]::WriteAllLines($installedFile, [string[]]@(
    "plugin=$($ver['plugin'])", "library=$($ver['library'])", "installed=$((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'))",
    "packs=$(if ($use4k) { '4k' } else { '' })"))
  if ($Done) { [IO.File]::WriteAllText($Done, 'ok') }
  if ($ver['signed'] -ne '1') {
    Say 'Внимание: панель без подписи. Она загрузится только с PlayerDebugMode: reg add HKCU\Software\Adobe\CSXS.11 /v PlayerDebugMode /t REG_SZ /d 1 /f (и CSXS.12)'
  }
  Say 'Готово. Запустите After Effects или Premiere: Window > Extensions > Cloud.ru BrandKit.'

  # 8. What the swaps set aside, and the leftovers of runs stopped half-way, go by rmdir in a cmd of its own that this
  #    script does not wait for: an antivirus killed the installer together with such a delete (build PC, 2026-10-20),
  #    and the install is complete by now. Copies an earlier install left are named, for a manual delete.
  $old = @(Get-ChildItem -LiteralPath $SharedRoot -Directory | Where-Object { $_.Name -like 'library.old-*' -or $_.Name -like 'library.new*' })
  $old += @(Get-ChildItem -LiteralPath $Aside -Directory)
  $earlier = @($old | Where-Object { $_.Name -notlike "*-$Stamp" })
  if ($earlier.Count) {
    Say "Внимание: прежние копии панели и библиотеки не удалились после прошлой установки (так бывает, когда удаление останавливает антивирус). Если они останутся и теперь, удалите их вручную: $(($earlier | ForEach-Object { $_.FullName }) -join ', ')"
  }
  if ($old.Count) {
    $rm = ($old | ForEach-Object { "rmdir /s /q `"$($_.FullName)`"" }) -join ' & '
    Start-Process -FilePath 'cmd.exe' -ArgumentList "/d /c $rm" -WindowStyle Hidden
  }
  exit 0
} catch {
  Fail $_.Exception.Message
}
