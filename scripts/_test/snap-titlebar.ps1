. "$PSScriptRoot/helper.ps1"
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class WX {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left,Top,Right,Bottom; }
}
'@
$pid_target = (Get-Process claude-manager).Id
$found = [IntPtr]::Zero
$cb = [WX+EnumProc]{
  param($h, $l)
  $pid_out = 0
  [WX]::GetWindowThreadProcessId($h, [ref]$pid_out) | Out-Null
  if ($pid_out -eq $script:pid_target) {
    $sb = New-Object System.Text.StringBuilder 256
    [WX]::GetWindowText($h, $sb, 256) | Out-Null
    if ($sb.ToString() -eq 'Claude Manager') {
      $script:found = $h; return $false
    }
  }
  return $true
}
[WX]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
[WX]::SetForegroundWindow($found) | Out-Null
Start-Sleep -Milliseconds 300
$r = New-Object WX+RECT
[WX]::GetWindowRect($found, [ref]$r) | Out-Null
Write-Host "Window: $($r.Left),$($r.Top) $($r.Right - $r.Left)x$($r.Bottom - $r.Top)"
# Crop just title bar area: full width, 50px tall
Snap-Region $r.Left $r.Top ($r.Right - $r.Left) 50 "$PSScriptRoot/out/titlebar-only.png"
Write-Host "SAVED titlebar-only.png"
