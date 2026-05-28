param([string]$Title = "capclu-wallpaper")

# Reparent a window behind the desktop icons using the Windows "WorkerW"
# technique. This is the same approach live-wallpaper apps use. It is fully
# reversible: closing the owning app removes the window and restores the desktop.

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Wp {
  [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Auto)]
  public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
  [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Auto)]
  public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr childAfter, string className, string windowTitle);
  [DllImport("user32.dll", SetLastError=true)]
  public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);
  [DllImport("user32.dll")]
  public static extern IntPtr SetParent(IntPtr hWndChild, IntPtr hWndNewParent);
  [DllImport("user32.dll")]
  public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
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

$hwnd = [Wp]::FindWindow($null, $Title)
if ($hwnd -eq [IntPtr]::Zero) { Write-Output "window-not-found ($Title)"; exit 1 }

# Ask Progman to spin up the WorkerW that hosts the wallpaper.
$progman = [Wp]::FindWindow("Progman", $null)
$res = [IntPtr]::Zero
[void][Wp]::SendMessageTimeout($progman, 0x052C, [IntPtr]::Zero, [IntPtr]::Zero, 0, 1000, [ref]$res)

# Locate the WorkerW sitting behind the desktop icons.
$cb = [Wp+EnumWindowsProc]{ param($h, $l) [Wp]::EnumProc($h, $l) }
[void][Wp]::EnumWindows($cb, [IntPtr]::Zero)
$worker = [Wp]::workerw

# On builds where SHELLDLL_DefView lives under Progman, parenting to Progman
# also places the window behind the icons.
if ($worker -eq [IntPtr]::Zero) { $worker = $progman }

[void][Wp]::SetParent($hwnd, $worker)

Add-Type -AssemblyName System.Windows.Forms
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
[void][Wp]::MoveWindow($hwnd, 0, 0, $b.Width, $b.Height, $true)

Write-Output "attached"
