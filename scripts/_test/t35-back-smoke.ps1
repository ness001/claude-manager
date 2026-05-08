. "$PSScriptRoot/helper.ps1"

Add-Type @'
using System;
using System.Runtime.InteropServices;
public class WinPrint35b {
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);
}
public class Kbd35b {
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
}
public class Mouse35b {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  public const uint LEFTDOWN = 0x0002;
  public const uint LEFTUP   = 0x0004;
}
'@ -ErrorAction SilentlyContinue

function Snap-Print($path) {
  $h = Get-AppHwnd
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
  $ok = [WinPrint35b]::PrintWindow($h, $hdc, 2)
  $g.ReleaseHdc($hdc)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Host "PRINT_OK=$ok SAVED=$path"
}

function Press($vk) {
  [Kbd35b]::keybd_event($vk, 0, 0, [UIntPtr]::Zero) | Out-Null
  Start-Sleep -Milliseconds 50
  [Kbd35b]::keybd_event($vk, 0, 2, [UIntPtr]::Zero) | Out-Null
  Start-Sleep -Milliseconds 80
}

$h = Focus-App
Start-Sleep -Seconds 1

# Re-enter Plugins, open detail again
[Kbd35b]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero) | Out-Null
Press 0x33
[Kbd35b]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero) | Out-Null
Start-Sleep -Milliseconds 2000

Press 0x09; Press 0x09; Press 0x09; Press 0x09
Start-Sleep -Milliseconds 300
Press 0x0D
Start-Sleep -Milliseconds 1500

# Click the back-arrow at window-relative (170, 75)
$r = Get-Rect $h
$bx = $r.Left + 170
$by = $r.Top + 75
[Mouse35b]::SetCursorPos($bx, $by) | Out-Null
Start-Sleep -Milliseconds 100
[Mouse35b]::mouse_event([Mouse35b]::LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 50
[Mouse35b]::mouse_event([Mouse35b]::LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 1500

Snap-Print "$PSScriptRoot/out/t35-back-final.png"
Write-Host "DONE"
