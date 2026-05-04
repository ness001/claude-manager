. "$PSScriptRoot/helper.ps1"

Add-Type @'
using System;
using System.Runtime.InteropServices;
public class WinPrint {
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);
}
'@ -ErrorAction SilentlyContinue

$h = Get-AppHwnd
if ($h -eq [IntPtr]::Zero) { Write-Host "NO_WINDOW"; exit 1 }
[Win]::ShowWindow($h, 9) | Out-Null
[Win]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 500
$r = Get-Rect $h
$w = $r.Right - $r.Left
$ht = $r.Bottom - $r.Top
Write-Host "RECT $($r.Left),$($r.Top) ${w}x${ht}"

Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap $w, $ht
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
# PW_RENDERFULLCONTENT = 0x2 — captures DirectComposition / WebView2 content
$ok = [WinPrint]::PrintWindow($h, $hdc, 2)
$g.ReleaseHdc($hdc)
$bmp.Save($args[0], [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Host "PRINT_OK=$ok SAVED $($args[0])"
