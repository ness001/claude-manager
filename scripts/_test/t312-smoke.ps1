. "$PSScriptRoot/helper.ps1"

Add-Type @'
using System;
using System.Runtime.InteropServices;
public class WinPrint312 {
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);
}
public class Kbd312 {
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
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
  $ok = [WinPrint312]::PrintWindow($h, $hdc, 2)
  $g.ReleaseHdc($hdc)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Host "PRINT_OK=$ok SAVED=$path"
}

function Press($vk) {
  [Kbd312]::keybd_event($vk, 0, 0, [UIntPtr]::Zero) | Out-Null
  Start-Sleep -Milliseconds 50
  [Kbd312]::keybd_event($vk, 0, 2, [UIntPtr]::Zero) | Out-Null
  Start-Sleep -Milliseconds 80
}

$h = Focus-App
if ($null -eq $h) { Write-Host "NO_WINDOW"; exit 1 }
Start-Sleep -Seconds 2

# Ctrl+5 → MCP
[Kbd312]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero) | Out-Null
Press 0x35
[Kbd312]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero) | Out-Null
Start-Sleep -Milliseconds 2500

Snap-Print "$PSScriptRoot/out/t312-mcp-light.png"

# Toggle dark via Ctrl+, then no — dark theme is set in settings; just use the
# document toggle via DevTools is complex. Skip dark for now and capture
# light only; theme parity is covered by the unit test.

Write-Host "DONE"
