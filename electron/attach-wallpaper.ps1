param([string]$Hwnd, [string]$Title = "capclu-wallpaper")

# Reparent a window behind the desktop icons using the Windows "WorkerW"
# technique (same approach live-wallpaper apps use). Fully reversible: closing
# the owning app removes the window and restores the desktop.

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Wp {
  [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
  [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr childAfter, string className, string windowTitle);
  [DllImport("user32.dll", SetLastError=true)]
  public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);
  [DllImport("user32.dll")]
  public static extern IntPtr SetParent(IntPtr hWndChild, IntPtr hWndNewParent);
  [DllImport("user32.dll")]
  public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
  [DllImport("user32.dll")]
  public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")]
  public static extern int GetSystemMetrics(int nIndex);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  public static IntPtr workerw = IntPtr.Zero;
  public static bool EnumProc(IntPtr top, IntPtr l) {
    IntPtr shell = FindWindowEx(top, IntPtr.Zero, "SHELLDLL_DefView", null);
    if (shell != IntPtr.Zero) {
      workerw = FindWindowEx(IntPtr.Zero, top, "WorkerW", null);
    }
    return true;
  }
}
"@

# Resolve the target window: prefer the handle passed by Electron; fall back to
# title lookup. Note: pass [NullString]::Value (not $null) so the unused string
# arg marshals as a real NULL rather than an empty string.
$target = [IntPtr]::Zero
if ($Hwnd) { try { $target = [IntPtr][int64]$Hwnd } catch {} }
if ($target -eq [IntPtr]::Zero) { $target = [Wp]::FindWindow([NullString]::Value, $Title) }
if ($target -eq [IntPtr]::Zero) { Write-Output "window-not-found"; exit 1 }

# Ask Progman to spin up the WorkerW that hosts the wallpaper.
$progman = [Wp]::FindWindow("Progman", [NullString]::Value)
$res = [IntPtr]::Zero
[void][Wp]::SendMessageTimeout($progman, 0x052C, [IntPtr]::Zero, [IntPtr]::Zero, 0, 1000, [ref]$res)

# Find the WorkerW sitting behind the desktop icons.
$cb = [Wp+EnumWindowsProc]{ param($h, $l) [Wp]::EnumProc($h, $l) }
[void][Wp]::EnumWindows($cb, [IntPtr]::Zero)
$worker = [Wp]::workerw

# On builds where SHELLDLL_DefView lives under Progman, parenting to Progman
# also places the window behind the icons.
if ($worker -eq [IntPtr]::Zero) { $worker = $progman }

[void][Wp]::SetParent($target, $worker)

# Size to the PHYSICAL primary-monitor resolution so it fills the screen on
# high-DPI displays (SetProcessDPIAware makes GetSystemMetrics report real px).
[void][Wp]::SetProcessDPIAware()
$w = [Wp]::GetSystemMetrics(0) # SM_CXSCREEN
$h = [Wp]::GetSystemMetrics(1) # SM_CYSCREEN
[void][Wp]::MoveWindow($target, 0, 0, $w, $h, $true)

Write-Output "attached target=$target worker=$worker size=${w}x${h}"
