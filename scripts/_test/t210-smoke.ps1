. "$PSScriptRoot/helper.ps1"

Add-Type @'
using System;
using System.Runtime.InteropServices;
public class WinPrint {
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);
}
public class Mouse {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  public const uint LEFTDOWN = 0x0002;
  public const uint LEFTUP   = 0x0004;
}
public class Kbd {
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
}
'@ -ErrorAction SilentlyContinue

function Snap-Print($path) {
  $h = Get-AppHwnd
  if ($h -eq [IntPtr]::Zero) { Write-Host "NO_WINDOW"; return }
  [Win]::ShowWindow($h, 9) | Out-Null
  [Win]::SetForegroundWindow($h) | Out-Null
  Start-Sleep -Milliseconds 800
  $r = Get-Rect $h
  $w = $r.Right - $r.Left
  $ht = $r.Bottom - $r.Top
  Add-Type -AssemblyName System.Drawing
  $bmp = New-Object System.Drawing.Bitmap $w, $ht
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $hdc = $g.GetHdc()
  # Use flag 0x2 = PW_RENDERFULLCONTENT for WebView2 / GPU-accelerated content.
  $ok = [WinPrint]::PrintWindow($h, $hdc, 2)
  $g.ReleaseHdc($hdc)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Host "PRINT_OK=$ok SAVED=$path"
}

$h = Focus-App
if ($null -eq $h) { Write-Host "NO_WINDOW"; exit 1 }

# Allow init time for SQLite + session loading
Start-Sleep -Seconds 4

# Navigate to Sessions via Ctrl+2
[Kbd]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero) | Out-Null
[Kbd]::keybd_event(0x32, 0, 0, [UIntPtr]::Zero) | Out-Null
Start-Sleep -Milliseconds 80
[Kbd]::keybd_event(0x32, 0, 2, [UIntPtr]::Zero) | Out-Null
[Kbd]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero) | Out-Null
Start-Sleep -Milliseconds 6000

# 1. Empty state
Snap-Print "$PSScriptRoot/out/t210-empty.png"

# 2. Click a session card. Sessions are loaded async; give them time.
$r = Get-Rect $h
# Heuristic for first card position:
# - Sidebar rail ~= 48px
# - Section content padding ~= 12px
# - New Session button ~40px
# - ViewModeToggle ~32px
# - SessionSearch ~32px
# - Pinned/All Sessions header ~24px
# - First card top ~ 40 + 32 + 32 + 24 = ~140 from content top
# Title bar ~ 32, plus content padding ~ 12 = 44
# So card_y = top + 44 + 140 + 25 (mid) = top + 210
# card_x = left + 48 + 12 + 130 (mid of 260px sidebar) = left + 190
$cardX = $r.Left + 200
$cardY = $r.Top + 240
[Mouse]::SetCursorPos($cardX, $cardY) | Out-Null
Start-Sleep -Milliseconds 100
[Mouse]::mouse_event([Mouse]::LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 50
[Mouse]::mouse_event([Mouse]::LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 1500
Snap-Print "$PSScriptRoot/out/t210-selected.png"

Write-Host "DONE"
