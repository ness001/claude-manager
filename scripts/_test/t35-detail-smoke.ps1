. "$PSScriptRoot/helper.ps1"

Add-Type @'
using System;
using System.Runtime.InteropServices;
public class WinPrint35d {
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);
}
public class Mouse35 {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  public const uint LEFTDOWN = 0x0002;
  public const uint LEFTUP   = 0x0004;
}
'@ -ErrorAction SilentlyContinue

function Snap-Print($path) {
  $h = Get-AppHwnd
  if ($h -eq [IntPtr]::Zero) { Write-Host "NO_WINDOW"; return }
  [Win]::ShowWindow($h, 9) | Out-Null
  [Win]::SetForegroundWindow($h) | Out-Null
  Start-Sleep -Milliseconds 600
  $r = Get-Rect $h
  $w = $r.Right - $r.Left
  $ht = $r.Bottom - $r.Top
  Add-Type -AssemblyName System.Drawing
  $bmp = New-Object System.Drawing.Bitmap $w, $ht
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $hdc = $g.GetHdc()
  $ok = [WinPrint35d]::PrintWindow($h, $hdc, 2)
  $g.ReleaseHdc($hdc)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Host "PRINT_OK=$ok SAVED=$path"
}

$h = Focus-App
if ($null -eq $h) { Write-Host "NO_WINDOW"; exit 1 }
$r = Get-Rect $h

# Click a plugin card body (not Reinstall/Remove buttons). Approximate
# coordinates: ralph-loop card title around (200, 340) screen-relative.
$cardX = $r.Left + 230
$cardY = $r.Top + 360
[Mouse35]::SetCursorPos($cardX, $cardY) | Out-Null
Start-Sleep -Milliseconds 100
[Mouse35]::mouse_event([Mouse35]::LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 50
[Mouse35]::mouse_event([Mouse35]::LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 1500

Snap-Print "$PSScriptRoot/out/t35-plugins-detail.png"

# Click back button (top of detail view, ~ 100, 60)
$backX = $r.Left + 130
$backY = $r.Top + 70
[Mouse35]::SetCursorPos($backX, $backY) | Out-Null
Start-Sleep -Milliseconds 100
[Mouse35]::mouse_event([Mouse35]::LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 50
[Mouse35]::mouse_event([Mouse35]::LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 1000

Snap-Print "$PSScriptRoot/out/t35-plugins-back.png"
Write-Host "DONE"
