. .\scripts\_test\helper.ps1

Add-Type @'
using System;
using System.Runtime.InteropServices;
public class Mouse {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  public const uint LEFTDOWN = 0x0002;
  public const uint LEFTUP   = 0x0004;
}
'@ -ErrorAction SilentlyContinue

$h = Focus-App
if ($null -eq $h) { exit 1 }
$r = Get-Rect $h
$wx = $r.Left
$wy = $r.Top
Write-Host "WIN $wx $wy"

# Client area starts roughly at title bar (~30px). But our content uses full webview region.
# Win11 typical title bar ~32px, border ~8px. Webview is rendered inside client area.
# Sidebar items are at y=0..288 in client coords. Add title bar offset.
$titleH = 32
$borderX = 8

$names = @('dashboard','sessions','plugins','skills','mcp','settings')
$outDir = "C:\Users\lianli\claude-manager\scripts\_test\out"

for ($i = 0; $i -lt 6; $i++) {
  $cx = $wx + $borderX + 24
  $cy = $wy + $titleH + 24 + (48 * $i)
  Write-Host "CLICK $($names[$i]) at $cx,$cy"
  [Mouse]::SetCursorPos($cx, $cy) | Out-Null
  Start-Sleep -Milliseconds 100
  [Mouse]::mouse_event([Mouse]::LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 50
  [Mouse]::mouse_event([Mouse]::LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 400
  $r2 = Get-Rect $h
  # Capture the content area (skip sidebar 48px + border)
  $cropX = $r2.Left + $borderX + 48
  $cropY = $r2.Top + $titleH
  $cropW = ($r2.Right - $r2.Left) - $borderX - 48 - $borderX
  $cropH = 200
  Snap-Region $cropX $cropY $cropW $cropH "$outDir\click-$i-$($names[$i]).png"
}
Write-Host "DONE"
