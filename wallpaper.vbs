' Double-click to start Aether as a live desktop wallpaper (no console window).
' Quit it anytime with Ctrl+Shift+Q.
' (Runs the already-built app. If you change the source, run "npm run wallpaper"
'  once to rebuild.)
Set fso = CreateObject("Scripting.FileSystemObject")
projDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = projDir
sh.Run "cmd /c npx electron electron\main.cjs --wallpaper", 0, False
