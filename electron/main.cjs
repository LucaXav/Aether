const {
  app,
  BrowserWindow,
  session,
  desktopCapturer,
  screen,
  globalShortcut,
  ipcMain,
} = require("electron");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const DIST = path.join(__dirname, "..", "dist");
const SMOKE = process.env.AETHER_SMOKE === "1";
const WALLPAPER =
  process.argv.includes("--wallpaper") || process.env.AETHER_WALLPAPER === "1";
const OVERLAY =
  process.argv.includes("--overlay") || process.env.AETHER_OVERLAY === "1";
const WP_TITLE = "aether-wallpaper";

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      if (urlPath === "/") urlPath = "/index.html";
      const safe = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
      const filePath = path.join(DIST, safe);
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        res.setHeader(
          "Content-Type",
          MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream"
        );
        res.end(data);
      });
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function setupLoopbackAudio() {
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer
      .getSources({ types: ["screen"] })
      .then((sources) => callback({ video: sources[0], audio: "loopback" }))
      .catch(() => callback({}));
  });
}

function attachAsWallpaper(win) {
  if (process.platform !== "win32") {
    console.error("AETHER_WALLPAPER_UNSUPPORTED (Windows only)");
    return;
  }
  let hwnd = "";
  try {
    const buf = win.getNativeWindowHandle();
    hwnd = buf.length >= 8 ? buf.readBigUInt64LE(0).toString() : String(buf.readUInt32LE(0));
  } catch (e) {
    console.error("WP-ERR: handle", e && e.message);
  }
  const ps = path.join(__dirname, "attach-wallpaper.ps1");
  const child = spawn(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps, "-Hwnd", hwnd, "-Title", WP_TITLE],
    { windowsHide: true }
  );
  child.stdout.on("data", (d) => console.log("WP:", String(d).trim()));
  child.stderr.on("data", (d) => console.error("WP-ERR:", String(d).trim()));
}

// Click-through: input falls through to whatever's behind (e.g. your editor),
// so you can keep working while the visuals float on top. Driven by the renderer
// + a global shortcut that still works while the window is click-through/
// unfocused. Used by BOTH the floating overlay and the default in-app window —
// the window must be transparent for it to be useful, which both now are.
function setupClickThrough(win) {
  let through = false;
  const setThrough = (on) => {
    through = !!on;
    // forward:true keeps mouse-move events flowing to the page so its own UI can
    // react, while clicks still pass through to the windows underneath.
    win.setIgnoreMouseEvents(through, { forward: true });
    if (!win.isDestroyed()) win.webContents.send("aether:click-through", through);
  };
  ipcMain.on("aether:set-click-through", (_e, on) => setThrough(on));
  // While click-through, the renderer flips this as the cursor enters/leaves the
  // little "edit" handle, so that handle alone stays clickable (a mouse-only way
  // back). Ignored unless we're actually in click-through.
  ipcMain.on("aether:set-interactive", (_e, on) => {
    if (through) win.setIgnoreMouseEvents(!on, { forward: true });
  });

  // Register a global toggle, trying a few combos in case one is taken by
  // another app (a silent failure was leaving Ctrl+Shift+Q as the only exit).
  const TOGGLE_KEYS = [
    "CommandOrControl+Shift+O",
    "Alt+Shift+O",
    "CommandOrControl+Alt+O",
  ];
  let toggleKey = null;
  for (const k of TOGGLE_KEYS) {
    try {
      if (globalShortcut.register(k, () => setThrough(!through))) {
        toggleKey = k;
        break;
      }
    } catch (_) {
      /* try the next one */
    }
  }
  console.log("AETHER_TOGGLE_KEY", toggleKey || "none");
  if (!win.isDestroyed()) win.webContents.send("aether:toggle-key", toggleKey);
}

// Overlay-only: click-through + a "cover the screen" (maximize) toggle and a
// custom window move, driven by the renderer.
function setupOverlayInteractions(win) {
  setupClickThrough(win);

  // Double-click maximize toggle + custom window move. We move/maximize the
  // window from here (via setBounds/setPosition) because transparent windows
  // don't maximize on the native caption double-click, and OS drag regions
  // swallow the dblclick — so the renderer drives both with plain DOM events.
  let prevBounds = null;
  ipcMain.on("aether:toggle-max", () => {
    if (prevBounds) {
      win.setBounds(prevBounds);
      prevBounds = null;
    } else {
      prevBounds = win.getBounds();
      win.setBounds(screen.getDisplayMatching(win.getBounds()).workArea);
    }
  });
  let dragOffset = null;
  ipcMain.on("aether:drag-start", (_e, c) => {
    const [wx, wy] = win.getPosition();
    dragOffset = { x: c.x - wx, y: c.y - wy };
  });
  ipcMain.on("aether:drag-move", (_e, c) => {
    if (!dragOffset || prevBounds) return; // don't drag while maximized
    win.setPosition(Math.round(c.x - dragOffset.x), Math.round(c.y - dragOffset.y));
  });
  ipcMain.on("aether:drag-end", () => {
    dragOffset = null;
  });
}

// The default in-app window is transparent + frameless so its "▢ clear"
// background reveals the desktop. That breaks the native double-click maximize
// (transparent windows don't maximize on the native caption double-click) and
// OS drag regions swallow the dblclick — so the renderer drives both move and
// fullscreen via plain DOM events through these channels (mirrors the overlay).
function setupFramedInteractions(win) {
  setupClickThrough(win);
  ipcMain.on("aether:toggle-fullscreen", () => {
    win.setFullScreen(!win.isFullScreen());
  });
  let dragOffset = null;
  ipcMain.on("aether:drag-start", (_e, c) => {
    const [wx, wy] = win.getPosition();
    dragOffset = { x: c.x - wx, y: c.y - wy };
  });
  ipcMain.on("aether:drag-move", (_e, c) => {
    if (!dragOffset || win.isFullScreen()) return; // don't drag while fullscreen
    win.setPosition(Math.round(c.x - dragOffset.x), Math.round(c.y - dragOffset.y));
  });
  ipcMain.on("aether:drag-end", () => {
    dragOffset = null;
  });
}

async function createWindow() {
  const port = await startServer();
  setupLoopbackAudio();

  /** @type {Electron.BrowserWindowConstructorOptions} */
  const opts = {
    backgroundColor: "#07060c",
    show: !SMOKE,
    icon: path.join(__dirname, "..", "build", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      backgroundThrottling: false,
    },
  };

  if (WALLPAPER) {
    const b = screen.getPrimaryDisplay().bounds;
    Object.assign(opts, {
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
      frame: false,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      focusable: false,
      hasShadow: false,
      title: WP_TITLE,
    });
  } else if (OVERLAY) {
    // transparent, always-on-top floating window — draws only the slime so it
    // overlays cleanly on top of anything. Drag to move; Ctrl+Shift+Q to quit.
    Object.assign(opts, {
      width: 560,
      height: 560,
      minWidth: 220,
      minHeight: 220,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      alwaysOnTop: true,
      hasShadow: false,
      resizable: true,
      maximizable: true, // double-click the draggable area to fill the screen
      title: "Aether Overlay",
    });
  } else {
    // chromeless, movable window: no title bar / no X. Drag it (by the visual)
    // onto any monitor, then double-click to make it take the whole screen.
    // Quit with Ctrl+Shift+Q or Alt+F4.
    // It's transparent so the "▢ clear" background really shows the desktop
    // behind it (the page paints a solid colour in "black" mode); the renderer
    // drives move + double-click fullscreen itself (see setupFramedInteractions).
    Object.assign(opts, {
      width: 1280,
      height: 800,
      minWidth: 480,
      minHeight: 320,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      title: "Aether",
    });
  }

  const win = new BrowserWindow(opts);

  if (WALLPAPER) win.on("page-title-updated", (e) => e.preventDefault());

  // --- crash / exit diagnostics ---
  win.webContents.on("render-process-gone", (_e, d) =>
    console.error("RENDER_GONE", JSON.stringify(d))
  );
  win.webContents.on("unresponsive", () => console.error("WINDOW_UNRESPONSIVE"));
  win.on("closed", () => console.log("WINDOW_CLOSED"));
  win.webContents.on("console-message", (_e, _lvl, msg) => {
    if (String(msg).startsWith("AETHER_")) console.log("R:", msg);
  });

  win.webContents.on("did-finish-load", () => {
    console.log("AETHER_LOADED");
    if (SMOKE) {
      setTimeout(() => app.quit(), 400);
      return;
    }
    if (WALLPAPER) {
      win.setTitle(WP_TITLE);
      setTimeout(() => attachAsWallpaper(win), 600);
    }
  });
  win.webContents.on("did-fail-load", (_e, code, desc) => {
    console.error("AETHER_LOAD_FAIL", code, desc);
    if (SMOKE) app.quit();
  });

  const query = WALLPAPER ? "?wallpaper=1" : OVERLAY ? "?overlay=1" : "";
  await win.loadURL(`http://127.0.0.1:${port}/${query}`);

  if (!SMOKE) {
    // frameless windows have no X button — always provide a quit shortcut
    globalShortcut.register("CommandOrControl+Shift+Q", () => app.quit());
    // ...and the in-UI close button (top-right ×) sends this to quit on click
    ipcMain.on("aether:quit", () => app.quit());
    if (OVERLAY) setupOverlayInteractions(win);
    else if (!WALLPAPER) setupFramedInteractions(win);
  }
}

// single instance: a second launch just focuses/no-ops instead of stacking
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // don't let Electron give up (and tear down) after repeated GPU hiccups
  app.commandLine.appendSwitch("disable-gpu-process-crash-limit");

  app.on("child-process-gone", (_e, d) =>
    console.error("CHILD_GONE", JSON.stringify(d))
  );
  app.whenReady().then(createWindow);
  app.on("will-quit", () => globalShortcut.unregisterAll());
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
