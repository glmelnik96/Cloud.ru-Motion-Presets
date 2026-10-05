# Closes the dialog boxes (#32770) of a host process with WM_CLOSE, without taking the focus or sending keys: a dev
# tool for the script-error alert that an uncaught error of a dev script leaves in AE (the bridge then times out with
# CDP_TIMEOUT). WM_CLOSE is the title bar's close button; WM_COMMAND IDOK does not close AE's dialogs. Lists the
# dialogs first; use it only after your own script failed, never on a dialog the user is working with.
#   powershell -ExecutionPolicy Bypass -File tools/dev/close-host-dialog.ps1 -App ae [-List]
param(
  [ValidateSet('ae', 'pr')][string]$App = 'ae',
  [switch]$List
)
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Collections.Generic;
using System.Text;
using System.Runtime.InteropServices;
public class CrbkDialogs {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  public static List<IntPtr> Of(uint pid) {
    var r = new List<IntPtr>();
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p); var s = new StringBuilder(64); GetClassName(h, s, 64);
      if (p == pid && IsWindowVisible(h) && s.ToString() == "#32770") r.Add(h); return true; }, IntPtr.Zero);
    return r;
  }
}
"@
$procName = if ($App -eq 'ae') { 'AfterFX' } else { 'Adobe Premiere Pro' }
# the GUI instance has a main window; Premiere's headless Dynamic Link AE does not
$proc = Get-Process -Name $procName -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } | Select-Object -First 1
if (-not $proc) { throw "no running $procName with a main window" }
$dialogs = [CrbkDialogs]::Of([uint32]$proc.Id)
Write-Output "$procName pid $($proc.Id): $($dialogs.Count) dialog(s)"
if ($List) { return }
foreach ($h in $dialogs) {
  [void][CrbkDialogs]::PostMessage($h, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)
  Write-Output ("WM_CLOSE -> 0x{0:X}" -f $h.ToInt64())
}
Start-Sleep -Milliseconds 800
Write-Output "left: $([CrbkDialogs]::Of([uint32]$proc.Id).Count)"
