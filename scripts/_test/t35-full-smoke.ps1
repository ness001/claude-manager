. "$PSScriptRoot/helper.ps1"

Add-Type @'
using System;
using System.Runtime.InteropServices;
public class WinPrint35f {
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);
}
public class Kbd35f {
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
}
public class Mouse35f {
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
  $ok = [WinPrint35f]::PrintWindow($h, $hdc, 2)
  $g.ReleaseHdc($hdc)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Host "PRINT_OK=$ok SAVED=$path"
}

$h = Focus-App
if ($null -eq $h) { Write-Host "NO_WINDOW"; exit 1 }
Start-Sleep -Seconds 2

# Ctrl+3 → Plugins
[Kbd35f]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero) | Out-Null
[Kbd35f]::keybd_event(0x33, 0, 0, [UIntPtr]::Zero) | Out-Null
Start-Sleep -Milliseconds 80
[Kbd35f]::keybd_event(0x33, 0, 2, [UIntPtr]::Zero) | Out-Null
[Kbd35f]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero) | Out-Null
Start-Sleep -Milliseconds 3000

Snap-Print "$PSScriptRoot/out/t35-list.png"

$r = Get-Rect $h
# Click first plugin card (~ y=300 area in window-relative; actual depends on layout)
$cardX = $r.Left + 300
$cardY = $r.Top + 320
[Mouse35f]::SetCursorPos($cardX, $cardY) | Out-Null
Start-Sleep -Milliseconds 100
[Mouse35f]::mouse_event([Mouse35f]::LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 50
[Mouse35f]::mouse_event([Mouse35f]::LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 1500

Snap-Print "$PSScriptRoot/out/t35-detail.png"

# Click back button (top-left area, around x=130 y=70 in window-relative)
$backX = $r.Left + 140
$backY = $r.Top + 80
[Mouse35f]::SetCursorPos($backX, $backY) | Out-Null
Start-Sleep -Milliseconds 100
[Mouse35f]::mouse_event([Mouse35f]::LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 50
[Mouse35f]::mouse_event([Mouse35f]::LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 1500

Snap-Print "$PSScriptRoot/out/t35-back.png"

# Toggle dark theme via Ctrl+, then click theme buttons would be complex;
# instead just snap dark-mode by setting via JS through devtools is not avail.
# Test code already verifies dark/light parity. Skipping live dark snap.

Write-Host "DONE"
