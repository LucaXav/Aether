const { contextBridge, ipcRenderer } = require("electron");

// Expose a small flag so the renderer knows it's running inside Electron and
// whether it's in wallpaper mode (so it can auto-start system audio + hide UI).
const params = new URLSearchParams(location.search);
contextBridge.exposeInMainWorld("aetherEnv", {
  electron: true,
  wallpaper: params.get("wallpaper") === "1",
  overlay: params.get("overlay") === "1",
});

// Overlay controls that need the main process: click-through (input passes to
// apps behind the overlay) and covering the whole screen.
contextBridge.exposeInMainWorld("aether", {
  setClickThrough: (on) => ipcRenderer.send("aether:set-click-through", !!on),
  onClickThrough: (cb) =>
    ipcRenderer.on("aether:click-through", (_e, on) => cb(!!on)),
  setInteractive: (on) => ipcRenderer.send("aether:set-interactive", !!on),
  // While click-through, the main process polls the real cursor position and
  // pushes it here — forwarded DOM mouse events are unreliable once a window is
  // click-through on Windows, so this is how the renderer knows to pop the
  // edit handle back when the cursor reaches its corner.
  onCursor: (cb) =>
    ipcRenderer.on("aether:cursor", (_e, p) => cb(p)),
  onToggleKey: (cb) =>
    ipcRenderer.on("aether:toggle-key", (_e, k) => cb(k)),
  toggleMax: () => ipcRenderer.send("aether:toggle-max"),
  toggleFullscreen: () => ipcRenderer.send("aether:toggle-fullscreen"),
  dragStart: (p) => ipcRenderer.send("aether:drag-start", p),
  dragMove: (p) => ipcRenderer.send("aether:drag-move", p),
  dragEnd: () => ipcRenderer.send("aether:drag-end"),
  // Custom edge/corner resize (frameless transparent windows don't resize
  // reliably from the native edges once drag regions are involved).
  resizeStart: (p) => ipcRenderer.send("aether:resize-start", p),
  resizeMove: (p) => ipcRenderer.send("aether:resize-move", p),
  resizeEnd: () => ipcRenderer.send("aether:resize-end"),
  quit: () => ipcRenderer.send("aether:quit"),
});
