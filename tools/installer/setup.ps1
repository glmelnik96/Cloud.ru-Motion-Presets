# The window of the installer for Windows (the editors' installer, user 2026-10-26): what to put, one button, the
# result in words. install.ps1 next to it does the work, with the switches the boxes ask for; it stays the way IT
# installs without a window (files\install.cmd -With4K -WithMusic -WithAme).
#   «Установить (Windows).cmd» starts it: powershell -STA -WindowStyle Hidden -File files\setup.ps1
#   setup.ps1 -Plan '4k,music,ame'   prints the switches the boxes would pass, no window (installer tests)
param([string]$Plan = $null)
$ErrorActionPreference = 'Stop'
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent $Here
$Payload = Join-Path $Here 'payload'

# The switches of install.ps1 for the chosen boxes: an option left out is removed, so a box unticked on an update
# takes its files away; the AME presets are only ever added.
function Get-Switches([string[]]$Chosen) {
  $s = @()
  $s += if ($Chosen -contains '4k') { '-With4K' } else { '-No4K' }
  $s += if ($Chosen -contains 'music') { '-WithMusic' } else { '-NoMusic' }
  if ($Chosen -contains 'ame') { $s += '-WithAme' }
  return $s
}

if ($PSBoundParameters.ContainsKey('Plan')) {
  (Get-Switches @($Plan -split ',' | Where-Object { $_ })) -join ' '
  exit 0
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

function Read-Pairs([string]$File) {
  $v = @{}
  if (Test-Path -LiteralPath $File) {
    foreach ($line in Get-Content -LiteralPath $File -Encoding UTF8) { if ($line -match '^([a-z]+)=(.*)$') { $v[$Matches[1]] = $Matches[2] } }
  }
  return $v
}
function Gb([double]$Bytes) { ('{0:N1} ГБ' -f ($Bytes / 1GB)) }

# Run from inside the zip (Explorer opens a file of an archive in a temporary folder): nothing to install from.
if (-not (Test-Path -LiteralPath (Join-Path $Payload 'VERSION'))) {
  [System.Windows.Forms.MessageBox]::Show("Сначала распакуйте архив целиком: правый щелчок по архиву → «Извлечь все…». Потом запустите «Установить (Windows)» из распакованной папки.", 'Cloud.ru BrandKit', 'OK', 'Warning') | Out-Null
  exit 1
}
$ver = Read-Pairs (Join-Path $Payload 'VERSION')
$options = @(
  @{ key = '4k'; text = '4K-фоны и клипы (для проектов 4K)' },
  @{ key = 'music'; text = 'Стоковая музыка для роликов' }
)
foreach ($o in $options) {
  $v = Read-Pairs (Join-Path $Payload "VERSION-$($o.key)")
  $o.here = (Test-Path -LiteralPath (Join-Path $Payload "library-$($o.key)")) -and $v.ContainsKey('bytes')
  $o.bytes = if ($o.here) { [double]$v['bytes'] } else { 0 }
}
$baseBytes = (Get-ChildItem -LiteralPath (Join-Path $Payload 'library'), (Join-Path $Payload 'extension') -Recurse -File | Measure-Object -Property Length -Sum).Sum
# What an earlier install put: an update keeps the same choice; the first install takes everything
$installed = Read-Pairs (Join-Path $env:APPDATA 'CloudRuBrandKit\installed.txt')
$hadPacks = if ($installed.ContainsKey('packs')) { @($installed['packs'] -split ',' | Where-Object { $_ }) } else { $null }

$green = [System.Drawing.Color]::FromArgb(38, 208, 124)
$dark = [System.Drawing.Color]::FromArgb(34, 34, 34)
$red = [System.Drawing.Color]::FromArgb(200, 40, 40)
$font = New-Object System.Drawing.Font('Segoe UI', 10)

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Cloud.ru BrandKit — установка'
$form.ClientSize = New-Object System.Drawing.Size(560, 470)
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.StartPosition = 'CenterScreen'
$form.Font = $font
$form.BackColor = [System.Drawing.Color]::White

$head = New-Object System.Windows.Forms.Panel
$head.BackColor = $dark
$head.SetBounds(0, 0, 560, 74)
$form.Controls.Add($head)
$title = New-Object System.Windows.Forms.Label
$title.Text = "Cloud.ru BrandKit $($ver['plugin'])"
$title.ForeColor = $green
$title.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 16)
$title.SetBounds(20, 10, 520, 32)
$head.Controls.Add($title)
$sub = New-Object System.Windows.Forms.Label
$sub.Text = "Фирменная графика для After Effects и Premiere · библиотека $($ver['library'])"
$sub.ForeColor = [System.Drawing.Color]::White
$sub.SetBounds(22, 44, 520, 22)
$head.Controls.Add($sub)

# The page of the choice
$choice = New-Object System.Windows.Forms.Panel
$choice.SetBounds(0, 80, 560, 330)
$form.Controls.Add($choice)
$note = New-Object System.Windows.Forms.Label
$note.Text = "Перед установкой закройте After Effects, Premiere и Media Encoder. Права администратора не нужны."
$note.SetBounds(20, 8, 520, 40)
$choice.Controls.Add($note)
$what = New-Object System.Windows.Forms.Label
$what.Text = 'Что поставить:'
$what.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 10)
$what.SetBounds(20, 54, 520, 22)
$choice.Controls.Add($what)
$y = 80
$baseBox = New-Object System.Windows.Forms.CheckBox
$baseBox.Text = "Панель и библиотека — $(Gb $baseBytes)"
$baseBox.Checked = $true
$baseBox.Enabled = $false
$baseBox.SetBounds(24, $y, 500, 26)
$choice.Controls.Add($baseBox)
$y += 30
foreach ($o in $options) {
  if (-not $o.here) { continue }
  $b = New-Object System.Windows.Forms.CheckBox
  $b.Text = "$($o.text) — $(Gb $o.bytes)"
  $b.Checked = if ($null -eq $hadPacks) { $true } else { $hadPacks -contains $o.key }
  $b.SetBounds(24, $y, 500, 26)
  $choice.Controls.Add($b)
  $o.box = $b
  $y += 30
}
$ameBox = New-Object System.Windows.Forms.CheckBox
$ameBox.Text = 'Пресеты экспорта «CR …» для Media Encoder'
$ameBox.Checked = $true
$ameBox.SetBounds(24, $y, 500, 26)
$choice.Controls.Add($ameBox)
$y += 40
$space = New-Object System.Windows.Forms.Label
$space.SetBounds(20, $y, 520, 22)
$space.ForeColor = [System.Drawing.Color]::DimGray
$choice.Controls.Add($space)
$warn = New-Object System.Windows.Forms.Label
$warn.SetBounds(20, ($y + 28), 520, 44)
$warn.ForeColor = $red
$choice.Controls.Add($warn)

$drive = New-Object System.IO.DriveInfo ([System.IO.Path]::GetPathRoot($env:ProgramData))
function Update-Space {
  $need = $baseBytes
  foreach ($o in $options) { if ($o.box -and $o.box.Checked) { $need += $o.bytes } }
  $space.Text = "Нужно на диске $($drive.Name.TrimEnd('\')) $(Gb $need), свободно $(Gb $drive.AvailableFreeSpace)"
  $space.ForeColor = if ($need -gt $drive.AvailableFreeSpace) { $red } else { [System.Drawing.Color]::DimGray }
}
foreach ($o in $options) { if ($o.box) { $o.box.Add_CheckedChanged({ Update-Space }) } }
Update-Space

# The page of the work: the running line and the installer's own words
$work = New-Object System.Windows.Forms.Panel
$work.SetBounds(0, 80, 560, 330)
$work.Visible = $false
$form.Controls.Add($work)
$state = New-Object System.Windows.Forms.Label
$state.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 11)
$state.SetBounds(20, 8, 520, 26)
$work.Controls.Add($state)
$bar = New-Object System.Windows.Forms.ProgressBar
$bar.Style = 'Marquee'
$bar.SetBounds(20, 40, 520, 14)
$work.Controls.Add($bar)
$steps = New-Object System.Windows.Forms.Label
$steps.SetBounds(20, 62, 520, 250)
$steps.Visible = $false
$work.Controls.Add($steps)
$logBox = New-Object System.Windows.Forms.TextBox
$logBox.Multiline = $true
$logBox.ReadOnly = $true
$logBox.ScrollBars = 'Vertical'
$logBox.Font = New-Object System.Drawing.Font('Consolas', 8.5)
$logBox.SetBounds(20, 62, 520, 262)
$work.Controls.Add($logBox)

# Buttons
$install = New-Object System.Windows.Forms.Button
$install.Text = 'Установить'
$install.SetBounds(296, 420, 120, 34)
$install.BackColor = $green
$install.FlatStyle = 'Flat'
$form.Controls.Add($install)
$form.AcceptButton = $install
$close = New-Object System.Windows.Forms.Button
$close.Text = 'Закрыть'
$close.SetBounds(424, 420, 116, 34)
$close.Add_Click({ $form.Close() })
$form.Controls.Add($close)
$guide = New-Object System.Windows.Forms.Button
$guide.Text = 'Руководство'
$guide.SetBounds(20, 420, 130, 34)
$guide.Add_Click({
  $doc = Get-ChildItem -LiteralPath $Root -File | Where-Object { $_.BaseName -eq 'Руководство монтажёра' } | Select-Object -First 1
  if ($doc) { Start-Process -FilePath $doc.FullName }
})
$form.Controls.Add($guide)
$aomButton = New-Object System.Windows.Forms.Button
$aomButton.Text = 'Шаблоны экспорта AE'
$aomButton.SetBounds(158, 420, 190, 34)
$aomButton.Visible = $false
$form.Controls.Add($aomButton)

function Running {
  $r = @()
  if (Get-Process -Name 'AfterFX' -ErrorAction SilentlyContinue) { $r += 'After Effects' }
  if (Get-Process -Name 'Adobe Premiere Pro' -ErrorAction SilentlyContinue) { $r += 'Premiere' }
  if ($ameBox.Checked -and (Get-Process -Name 'Adobe Media Encoder' -ErrorAction SilentlyContinue)) { $r += 'Media Encoder' }
  return $r
}

$script:proc = $null
$script:log = $null
$script:done = $null
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 400

function Read-Log {
  if (-not (Test-Path -LiteralPath $script:log)) { return '' }
  $fs = [System.IO.File]::Open($script:log, 'Open', 'Read', 'ReadWrite')
  try { $text = (New-Object System.IO.StreamReader($fs, [System.Text.Encoding]::UTF8)).ReadToEnd() } finally { $fs.Close() }
  return $text
}

function Show-Choice([string]$Problem) {
  $timer.Stop()
  $work.Visible = $false
  $choice.Visible = $true
  $install.Enabled = $true
  $install.Visible = $true
  $warn.Text = $Problem
}

$install.Add_Click({
  $busy = Running
  if ($busy.Count) { $warn.Text = "Закройте $($busy -join ', ') и нажмите «Установить» ещё раз."; return }
  $chosen = @()
  foreach ($o in $options) { if ($o.box -and $o.box.Checked) { $chosen += $o.key } }
  if ($ameBox.Checked) { $chosen += 'ame' }
  $switches = Get-Switches $chosen
  $script:log = Join-Path $env:TEMP "brandkit-setup-$PID.log"
  $script:done = Join-Path $env:TEMP "brandkit-setup-$PID.done"
  Remove-Item -LiteralPath $script:log, $script:done -ErrorAction SilentlyContinue
  $engine = Join-Path $Here 'install.ps1'
  # install.ps1 with -File: its words come in UTF-8 (it switches when its output goes to a file), errors as plain text.
  # Not -EncodedCommand: 360 Total Security took that chain for malware and killed the window with the cleanup
  # (2026-10-26), and PowerShell 5.1 writes the streams of such a run to stderr as CLIXML.
  $script:proc = Start-Process -FilePath 'powershell.exe' -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$engine`" $($switches -join ' ') -Done `"$($script:done)`"" -WindowStyle Hidden -PassThru -RedirectStandardOutput $script:log -RedirectStandardError "$($script:log).err"
  # ExitCode of a Start-Process stays empty unless its handle is taken while it runs (Windows PowerShell 5.1)
  $null = $script:proc.Handle
  $install.Text = 'Установить'
  $install.Visible = $false
  $close.Enabled = $false
  $choice.Visible = $false
  $work.Visible = $true
  $steps.Visible = $false
  $logBox.Visible = $true
  $logBox.Text = ''
  $bar.Visible = $true
  $state.ForeColor = $dark
  $state.Text = 'Устанавливаю… Это займёт несколько минут.'
  $install.Enabled = $false
  $timer.Start()
})

$timer.Add_Tick({
  $text = Read-Log
  if ($text -ne $logBox.Text) { $logBox.Text = $text; $logBox.SelectionStart = $logBox.Text.Length; $logBox.ScrollToCaret() }
  if (-not $script:proc.HasExited) { return }
  $timer.Stop()
  $script:proc.WaitForExit()
  $close.Enabled = $true
  $code = $script:proc.ExitCode
  $text = Read-Log
  if (Test-Path -LiteralPath "$($script:log).err") { $err = Get-Content -LiteralPath "$($script:log).err" -Raw -Encoding UTF8; if ($err) { $text += "`r`n$err" } }
  $logBox.Text = $text
  $bar.Visible = $false
  if ($code -eq 0 -and -not (Test-Path -LiteralPath $script:done)) { $code = 3 }
  if ($code -eq 0) {
    $state.ForeColor = $green
    $state.Text = 'Готово'
    $steps.Visible = $true
    # the warnings of the installer (old copies an antivirus kept, an option whose files were not there) stay in view
    $notes = @($text -split "`r?`n" | Where-Object { $_ -match '^\s*Внимание' })
    if ($notes.Count) {
      $steps.Height = 150
      $logBox.SetBounds(20, 220, 520, 104)
      $logBox.Text = $notes -join "`r`n`r`n"
    } else {
      $logBox.Visible = $false
    }
    $steps.Text = "1. Запустите After Effects или Premiere: Window → Extensions → Cloud.ru BrandKit. В Premiere панели видны при открытом проекте.`r`n`r`n2. В After Effects один раз загрузите шаблоны экспорта: Edit → Templates → Output Module… → Load… и выберите файл, который откроет кнопка «Шаблоны экспорта AE».`r`n`r`n3. Пресеты «CR …» появятся в Media Encoder при следующем запуске."
    $aom = ($text -split "`r?`n" | Where-Object { $_ -match 'Load\.\.\. файл (.+\.aom)\s*$' } | ForEach-Object { $Matches[1] } | Select-Object -First 1)
    if ($aom) {
      $aomButton.Visible = $true
      $aomButton.Tag = $aom
      $aomButton.Add_Click({ Start-Process -FilePath 'explorer.exe' -ArgumentList "/select,`"$($aomButton.Tag)`"" })
    }
    $install.Visible = $false
    $close.Text = 'Готово'
    $form.AcceptButton = $close
    return
  }
  $state.ForeColor = $red
  if ($code -eq 2) {
    $line = ($text -split "`r?`n" | Where-Object { $_ -match '^Закройте' } | Select-Object -Last 1)
    Show-Choice ($(if ($line) { $line -replace 'запустите установщик снова', 'нажмите «Установить» ещё раз' } else { 'Закройте After Effects, Premiere и Media Encoder и нажмите «Установить» ещё раз.' }))
    return
  }
  if ($code -eq 3) {
    $state.Text = 'Установка прервалась на середине'
    $logBox.Text = "Так бывает, когда установку останавливает антивирус. Нажмите «Установить» ещё раз. Если повторится, попросите IT добавить папку установщика в исключения антивируса.`r`n`r`n$text"
  } else {
    $state.Text = 'Не получилось — подробности ниже'
  }
  $install.Visible = $true
  $install.Enabled = $true
  $install.Text = 'Ещё раз'
})

# Closed in the middle, the window would leave the install running unseen: it stays to the end, and says so itself.
$form.Add_FormClosing({
  if ($script:proc -and -not $script:proc.HasExited) {
    $_.Cancel = $true
    $state.Text = 'Устанавливаю… Дождитесь конца: окно скажет «Готово».'
  }
})

[void]$form.ShowDialog()
