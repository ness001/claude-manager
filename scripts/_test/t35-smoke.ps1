. "$PSScriptRoot/helper.ps1"

Add-Type @'
using System;
using System.Runtime.InteropServices;
public class WinPrint35 {
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);
}
public class Kbd35 {
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
  $ok = [WinPrint35]::PrintWindow($h, $hdc, 2)
  $g.ReleaseHdc($hdc)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Host "PRINT_OK=$ok SAVED=$path"
}

$h = Focus-App
if ($null -eq $h) { Write-Host "NO_WINDOW"; exit 1 }

Start-Sleep -Seconds 4

# Navigate to Plugins via Ctrl+3
[Kbd35]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero) | Out-Null
[Kbd35]::keybd_event(0x33, 0, 0, [UIntPtr]::Zero) | Out-Null
Start-Sleep -Milliseconds 80
[Kbd35]::keybd_event(0x33, 0, 2, [UIntPtr]::Zero) | Out-Null
[Kbd35]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero) | Out-Null
Start-Sleep -Milliseconds 4000

Snap-Print "$PSScriptRoot/out/t35-plugins-light.png"

# Toggle dark via Ctrl+, then click theme — easier: set dark via document directly is not possible, so just snap light.
Write-Host "DONE"
