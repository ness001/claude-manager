. "$PSScriptRoot/helper.ps1"

Add-Type @'
using System;
using System.Runtime.InteropServices;
public class WinPrint35k {
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);
}
public class Kbd35k {
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
  $ok = [WinPrint35k]::PrintWindow($h, $hdc, 2)
  $g.ReleaseHdc($hdc)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Host "PRINT_OK=$ok SAVED=$path"
}

function Press($vk) {
  [Kbd35k]::keybd_event($vk, 0, 0, [UIntPtr]::Zero) | Out-Null
  Start-Sleep -Milliseconds 50
  [Kbd35k]::keybd_event($vk, 0, 2, [UIntPtr]::Zero) | Out-Null
  Start-Sleep -Milliseconds 80
}

$h = Focus-App
if ($null -eq $h) { Write-Host "NO_WINDOW"; exit 1 }
Start-Sleep -Seconds 2

# Ctrl+3 → Plugins
[Kbd35k]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero) | Out-Null
Press 0x33
[Kbd35k]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero) | Out-Null
Start-Sleep -Milliseconds 2500

# Tab through: Install Plugin, Check for Updates, search input, then first card body
Press 0x09
Press 0x09
Press 0x09
Press 0x09
Start-Sleep -Milliseconds 500

# Activate
Press 0x0D
Start-Sleep -Milliseconds 1500

Snap-Print "$PSScriptRoot/out/t35-kbd-detail.png"

# Back: Shift+Tab to back button (it's the only thing before tabs/buttons in detail)
# Or just navigate back via clicking — but better: focus first interactive (back btn) then Enter
# Actually after pressing Enter, focus may have moved. Try Tab back to top:
# Press Shift+Tab a few times
[Kbd35k]::keybd_event(0x10, 0, 0, [UIntPtr]::Zero) | Out-Null
Press 0x09
Press 0x09
Press 0x09
Press 0x09
Press 0x09
[Kbd35k]::keybd_event(0x10, 0, 2, [UIntPtr]::Zero) | Out-Null
Start-Sleep -Milliseconds 300
Press 0x0D
Start-Sleep -Milliseconds 1500

Snap-Print "$PSScriptRoot/out/t35-kbd-back.png"
Write-Host "DONE"
