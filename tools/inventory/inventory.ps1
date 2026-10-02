# Machine inventory for phase 0 (spec 3.3 item 4, D20). Prints one JSON object; with -Out it also
# writes it as UTF-8 without BOM. Read-only: CIM, registry, file versions; it changes nothing.
#   powershell -ExecutionPolicy Bypass -File tools/inventory/inventory.ps1 [-Label "edit-1"] [-Out docs/decisions/inventory/edit-1.json]
# Works in Windows PowerShell 5.1 and PowerShell 7.
param(
  [string]$Label = '',
  [string]$Out = ''
)
$ErrorActionPreference = 'Stop'
$errors = New-Object System.Collections.ArrayList

function Invoke-Safe([string]$What, [scriptblock]$Block, $Default) {
  try { return (& $Block) } catch { [void]$errors.Add("${What}: $($_.Exception.Message)"); return $Default }
}

function Get-ProductVersion([string]$Path) {
  if ($Path -and (Test-Path -LiteralPath $Path)) { return (Get-Item -LiteralPath $Path).VersionInfo.ProductVersion }
  return $null
}

# Every installed copy, e.g. "Adobe After Effects 2026" and "Adobe After Effects (Beta)".
function Find-AdobeApp([string]$DirFilter, [string]$SubDir, [string]$ExeFilter) {
  $found = @()
  $root = Join-Path $env:ProgramFiles 'Adobe'
  if (-not (Test-Path -LiteralPath $root)) { return ,$found }
  foreach ($d in Get-ChildItem -LiteralPath $root -Directory -Filter $DirFilter) {
    $dir = if ($SubDir) { Join-Path $d.FullName $SubDir } else { $d.FullName }
    if (-not (Test-Path -LiteralPath $dir)) { continue }
    $exe = Get-ChildItem -LiteralPath $dir -File -Filter $ExeFilter | Select-Object -First 1
    if ($exe) { $found += [ordered]@{ name = $d.Name; version = (Get-ProductVersion $exe.FullName); path = $exe.FullName } }
  }
  return ,$found
}

# Win32_VideoController.AdapterRAM is 32-bit and stops at 4 GB; the display class key has the real size.
function Get-Gpus {
  $vram = @{}
  $class = 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}'
  foreach ($k in (Get-ChildItem -LiteralPath $class -ErrorAction SilentlyContinue)) {
    if ($k.PSChildName -notmatch '^\d{4}$') { continue }
    $p = Get-ItemProperty -LiteralPath $k.PSPath -ErrorAction SilentlyContinue
    if ($p -and $p.DriverDesc -and $p.'HardwareInformation.qwMemorySize') { $vram[$p.DriverDesc] = [double]$p.'HardwareInformation.qwMemorySize' }
  }
  $gpus = @()
  foreach ($g in Get-CimInstance Win32_VideoController) {
    $bytes = if ($vram.ContainsKey($g.Name)) { $vram[$g.Name] } else { [double]$g.AdapterRAM }
    $gpus += [ordered]@{ name = $g.Name; vramGB = [math]::Round($bytes / 1GB, 1); cores = $null; driver = $g.DriverVersion }
  }
  return ,$gpus
}

$os = Invoke-Safe 'os' {
  $o = Get-CimInstance Win32_OperatingSystem
  $cv = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
  [ordered]@{ name = $o.Caption.Trim(); version = $cv.DisplayVersion; build = $o.Version }
} $null
$cs = Invoke-Safe 'model' { Get-CimInstance Win32_ComputerSystem } $null
$ramGB = Invoke-Safe 'ram' {
  $sum = (Get-CimInstance Win32_PhysicalMemory | Measure-Object -Property Capacity -Sum).Sum
  if (-not $sum) { $sum = $cs.TotalPhysicalMemory }
  [math]::Round($sum / 1GB)
} $null
$cpu = Invoke-Safe 'cpu' {
  $c = Get-CimInstance Win32_Processor | Select-Object -First 1
  [ordered]@{ name = $c.Name.Trim(); cores = $c.NumberOfCores; threads = $c.NumberOfLogicalProcessors }
} $null
# @(...) keeps one-element lists as JSON arrays in Windows PowerShell 5.1.
$gpus = @(Invoke-Safe 'gpu' { Get-Gpus } @())

$adobe = [ordered]@{
  afterEffects = @(Invoke-Safe 'ae' { Find-AdobeApp 'Adobe After Effects*' 'Support Files' 'AfterFX*.exe' } @())
  premiere = @(Invoke-Safe 'pr' { Find-AdobeApp 'Adobe Premiere Pro*' '' 'Adobe Premiere Pro*.exe' } @())
  mediaEncoder = @(Invoke-Safe 'ame' { Find-AdobeApp 'Adobe Media Encoder*' '' 'Adobe Media Encoder*.exe' } @())
}

$ccExe = @(
  (Join-Path $env:ProgramFiles 'Adobe\Adobe Creative Cloud\ACC\Creative Cloud.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Adobe\Adobe Creative Cloud\ACC\Creative Cloud.exe')
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
$upiaExe = Join-Path $env:CommonProgramFiles 'Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent\UnifiedPluginInstallerAgent.exe'

$cep = [ordered]@{}
foreach ($v in '11', '12') {
  $mode = (Get-ItemProperty -Path "HKCU:\Software\Adobe\CSXS.$v" -Name PlayerDebugMode -ErrorAction SilentlyContinue).PlayerDebugMode
  $cep["CSXS.$v"] = if ($null -ne $mode) { [string]$mode } else { $null }
}

# Font files by name (always) and PostScript names with builds through Node (when Node exists).
$fontDirs = @((Join-Path $env:WINDIR 'Fonts'), (Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\Fonts'))
$sbSansFiles = @()
foreach ($d in $fontDirs) {
  if (Test-Path -LiteralPath $d) { $sbSansFiles += @(Get-ChildItem -LiteralPath $d -File -Filter 'SBSans*' | ForEach-Object { $_.Name }) }
}
$fonts = $null
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
  $fonts = Invoke-Safe 'fonts' {
    # The scanner writes UTF-8 to a temp file: console decoding would mangle Cyrillic paths, and
    # under 'Stop' Windows PowerShell 5.1 turns any stderr line of a native command into an error.
    $ErrorActionPreference = 'Continue'
    $tmp = [System.IO.Path]::GetTempFileName()
    & $node.Source (Join-Path $PSScriptRoot '..\fonts\scan-fonts.mjs') --out $tmp 2>$null | Out-Null
    $scan = [System.IO.File]::ReadAllText($tmp, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    Remove-Item -LiteralPath $tmp -Force
    $list = @()
    foreach ($f in $scan.fonts) { $list += [ordered]@{ postScriptName = $f.postScriptName; version = $f.version; file = $f.file } }
    ,$list
  } $null
}

$inv = [ordered]@{
  schema = 'brandkit-inventory/1'
  collectedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  hostname = $env:COMPUTERNAME
  label = if ($Label) { $Label } else { $env:COMPUTERNAME }
  os = $os
  model = if ($cs) { ("$($cs.Manufacturer) $($cs.Model)").Trim() } else { $null }
  cpu = $cpu
  gpus = $gpus
  ramGB = $ramGB
  adobe = $adobe
  creativeCloud = [ordered]@{ present = [bool]$ccExe; version = (Get-ProductVersion $ccExe) }
  upia = [ordered]@{ present = (Test-Path -LiteralPath $upiaExe); version = (Get-ProductVersion $upiaExe) }
  cep = $cep
  sbSansFiles = @($sbSansFiles)
  fonts = if ($null -ne $fonts) { @($fonts) } else { $null }
  manual = [ordered]@{ adobeIdSignedIn = $null; updatesAvailable = ''; notes = '' }
  errors = @($errors)
}

$json = $inv | ConvertTo-Json -Depth 6
if ($Out) {
  $full = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Out)
  [void](New-Item -ItemType Directory -Force -Path (Split-Path -Parent $full))
  [System.IO.File]::WriteAllText($full, $json, (New-Object System.Text.UTF8Encoding $false))
  Write-Output "written $full"
} else {
  Write-Output $json
}
