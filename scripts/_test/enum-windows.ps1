Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public class Enumr {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left,Top,Right,Bottom; }
  public static List<string> Find(uint targetPid) {
    var results = new List<string>();
    EnumWindows((h, l) => {
      uint pid;
      GetWindowThreadProcessId(h, out pid);
      if (pid == targetPid) {
        var sb = new StringBuilder(256);
        GetWindowText(h, sb, 256);
        var visible = IsWindowVisible(h);
        RECT r; GetWindowRect(h, out r);
        results.Add(string.Format("hwnd={0} visible={1} rect={2},{3} {4}x{5} title='{6}'", h, visible, r.Left, r.Top, r.Right-r.Left, r.Bottom-r.Top, sb.ToString()));
      }
      return true;
    }, IntPtr.Zero);
    return results;
  }
}
'@
$pid_target = (Get-Process claude-manager).Id
[Enumr]::Find($pid_target) | ForEach-Object { Write-Host $_ }
