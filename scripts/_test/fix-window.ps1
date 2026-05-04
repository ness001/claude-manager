Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class WinFix {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int hh, bool r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
}
'@
$pid_target = (Get-Process claude-manager).Id
$found = [IntPtr]::Zero
$cb = [WinFix+EnumProc]{
  param($h, $l)
  $pid_out = 0
  [WinFix]::GetWindowThreadProcessId($h, [ref]$pid_out) | Out-Null
  if ($pid_out -eq $script:pid_target) {
    $sb = New-Object System.Text.StringBuilder 256
    [WinFix]::GetWindowText($h, $sb, 256) | Out-Null
    if ($sb.ToString() -eq 'Claude Manager') {
      $script:found = $h
      return $false
    }
  }
  return $true
}
[WinFix]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
if ($found -eq [IntPtr]::Zero) { Write-Host "NOT FOUND"; exit 1 }
Write-Host "Found Claude Manager hwnd=$found"
[WinFix]::MoveWindow($found, 100, 100, 1200, 800, $true) | Out-Null
[WinFix]::ShowWindow($found, 9) | Out-Null
[WinFix]::SetForegroundWindow($found) | Out-Null
Start-Sleep -Milliseconds 500
. "$PSScriptRoot/helper.ps1"
Snap-Region 100 100 1200 800 "$PSScriptRoot/out/regression-restored.png"
Write-Host "SAVED"
