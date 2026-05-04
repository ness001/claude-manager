. "$PSScriptRoot/helper.ps1"
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Resize {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int hh, bool r);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int nIndex);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left,Top,Right,Bottom; }
}
'@

$pid_target = (Get-Process claude-manager).Id
$found = [IntPtr]::Zero
$cb = [Resize+EnumProc]{
  param($h, $l)
  $pid_out = 0
  [Resize]::GetWindowThreadProcessId($h, [ref]$pid_out) | Out-Null
  if ($pid_out -eq $script:pid_target) {
    $sb = New-Object System.Text.StringBuilder 256
    [Resize]::GetWindowText($h, $sb, 256) | Out-Null
    if ($sb.ToString() -eq 'Claude Manager') {
      $script:found = $h
      return $false
    }
  }
  return $true
}
[Resize]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null

# GWL_STYLE = -16
$style = [Resize]::GetWindowLong($found, -16)
Write-Host ("STYLE: 0x{0:X8}" -f $style)
# WS_THICKFRAME = 0x40000 (resizable border)
# WS_CAPTION = 0xC00000
# WS_SIZEBOX = 0x40000
$WS_THICKFRAME = 0x40000
$WS_CAPTION = 0xC00000
$WS_SYSMENU = 0x80000
$hasThick = ($style -band $WS_THICKFRAME) -ne 0
$hasCaption = ($style -band $WS_CAPTION) -ne 0
$hasSysmenu = ($style -band $WS_SYSMENU) -ne 0
Write-Host "WS_THICKFRAME (resizable): $hasThick"
Write-Host "WS_CAPTION (titlebar): $hasCaption"
Write-Host "WS_SYSMENU: $hasSysmenu"

# Try MoveWindow to verify the window can be resized programmatically
$r = New-Object Resize+RECT
[Resize]::GetWindowRect($found, [ref]$r) | Out-Null
Write-Host "Before: $($r.Left),$($r.Top) $($r.Right - $r.Left)x$($r.Bottom - $r.Top)"
[Resize]::MoveWindow($found, 100, 100, 1000, 700, $true) | Out-Null
Start-Sleep -Milliseconds 300
[Resize]::GetWindowRect($found, [ref]$r) | Out-Null
Write-Host "After:  $($r.Left),$($r.Top) $($r.Right - $r.Left)x$($r.Bottom - $r.Top)"
[Resize]::SetForegroundWindow($found) | Out-Null
Start-Sleep -Milliseconds 200
Snap-Region 100 100 1000 700 "$PSScriptRoot/out/post-resize.png"
Write-Host "SAVED"
