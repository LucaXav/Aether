' Double-click to open Aether as a desktop app window (no console window).
Set fso = CreateObject("Scripting.FileSystemObject")
projDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = projDir
sh.Run "cmd /c npx electron electron\main.cjs", 0, False
