. "$PSScriptRoot/helper.ps1"

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type @'
using System;
using System.Runtime.InteropServices;
public class WinPrint313 {
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);
}
'@ -ErrorAction SilentlyContinue

function Snap-Print($path) {
  $h = Get-AppHwnd
  if ($h -eq [IntPtr]::Zero) { Write-Host "NO_WINDOW"; return }
  $r = Get-Rect $h
  $w = $r.Right - $r.Left
  $ht = $r.Bottom - $r.Top
  Add-Type -AssemblyName System.Drawing
  $bmp = New-Object System.Drawing.Bitmap $w, $ht
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $hdc = $g.GetHdc()
  $ok = [WinPrint313]::PrintWindow($h, $hdc, 2)
  $g.ReleaseHdc($hdc)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Host "PRINT_OK=$ok SAVED=$path"
}

function Invoke-Rail($label) {
  $h = Get-AppHwnd
  $root = [System.Windows.Automation.AutomationElement]::FromHandle($h)
  $nameCond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::NameProperty, $label)
  $btnCond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Button)
  $cond = New-Object System.Windows.Automation.AndCondition($nameCond, $btnCond)
  $el = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
  if ($null -eq $el) { Write-Host "NOT_FOUND: $label"; return $false }
  $pat = $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
  $pat.Invoke()
  Write-Host "INVOKED: $label"
  Start-Sleep -Milliseconds 1500
  return $true
}

$h = Focus-App
if ($null -eq $h) { Write-Host "NO_WINDOW"; exit 1 }
Start-Sleep -Seconds 2

Invoke-Rail "Plugins" | Out-Null
Snap-Print "$PSScriptRoot/out/t313-plugins.png"

Invoke-Rail "Skills" | Out-Null
Snap-Print "$PSScriptRoot/out/t313-skills.png"

Invoke-Rail "MCP Servers" | Out-Null
Snap-Print "$PSScriptRoot/out/t313-mcp.png"

Write-Host "DONE"
