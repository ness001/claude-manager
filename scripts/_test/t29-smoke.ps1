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
  Start-Sleep -Milliseconds 400
  $r = Get-Rect $h
  $w = $r.Right - $r.Left
  $ht = $r.Bottom - $r.Top
  Add-Type -AssemblyName System.Drawing
  $bmp = New-Object System.Drawing.Bitmap $w, $ht
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $hdc = $g.GetHdc()
  $ok = [WinPrint]::PrintWindow($h, $hdc, 2)
  $g.ReleaseHdc($hdc)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Host "PRINT_OK=$ok SAVED=$path"
}

$h = Focus-App
if ($null -eq $h) { Write-Host "NO_WINDOW"; exit 1 }

# Navigate to Sessions via Ctrl+2
[Kbd]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero) | Out-Null  # Ctrl down
[Kbd]::keybd_event(0x32, 0, 0, [UIntPtr]::Zero) | Out-Null  # 2 down
Start-Sleep -Milliseconds 80
[Kbd]::keybd_event(0x32, 0, 2, [UIntPtr]::Zero) | Out-Null  # 2 up
[Kbd]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero) | Out-Null  # Ctrl up
Start-Sleep -Milliseconds 1500

Snap-Print "$PSScriptRoot/out/t29-sessions-default.png"

# Click view-mode-project button. Sidebar (48px) + 12px panel padding + width
# of "My View" button. Approximate at x = 48 + 12 + 60 = 120, y = title (32) + new-session (40) + viewToggle row (~ 8 + 28).
$r = Get-Rect $h
$projX = $r.Left + 48 + 8 + 100
$projY = $r.Top + 32 + 8 + 40 + 8 + 14  # toggle vertical center approx
[Mouse]::SetCursorPos($projX, $projY) | Out-Null
Start-Sleep -Milliseconds 80
[Mouse]::mouse_event([Mouse]::LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 40
[Mouse]::mouse_event([Mouse]::LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 700

Snap-Print "$PSScriptRoot/out/t29-sessions-project.png"

# Click Timeline (further right, ~80px more)
[Mouse]::SetCursorPos(($projX + 70), $projY) | Out-Null
Start-Sleep -Milliseconds 80
[Mouse]::mouse_event([Mouse]::LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 40
[Mouse]::mouse_event([Mouse]::LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 700

Snap-Print "$PSScriptRoot/out/t29-sessions-timeline.png"

Write-Host "DONE"
