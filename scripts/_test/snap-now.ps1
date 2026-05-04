. "$PSScriptRoot/helper.ps1"
$h = Get-AppHwnd
if ($h -eq [IntPtr]::Zero) { Write-Host "NO_WINDOW"; exit 1 }
# SW_RESTORE = 9
[Win]::ShowWindow($h, 9) | Out-Null
[Win]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 500
if ($null -eq $h) { Write-Host "NO_WINDOW"; exit 1 }
$r = Get-Rect $h
$w = $r.Right - $r.Left
$ht = $r.Bottom - $r.Top
Write-Host "RECT $($r.Left),$($r.Top) ${w}x${ht}"
Snap-Region $r.Left $r.Top $w $ht "$PSScriptRoot/out/regression-check.png"
Write-Host "SAVED"
