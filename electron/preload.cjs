const { contextBridge } = require("electron");

// Expose a small flag so the renderer knows it's running inside Electron and
// whether it's in wallpaper mode (so it can auto-start system audio + hide UI).
const wallpaper = new URLSearchParams(location.search).get("wallpaper") === "1";
contextBridge.exposeInMainWorld("capcluEnv", {
  electron: true,
  wallpaper,
});
