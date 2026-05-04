$ps = Get-Process claude-manager -ErrorAction SilentlyContinue
foreach ($p in $ps) {
  Write-Host "PID=$($p.Id) MainHwnd=$($p.MainWindowHandle) Title='$($p.MainWindowTitle)'"
}
