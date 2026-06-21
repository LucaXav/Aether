const {
  app,
  BrowserWindow,
  session,
  desktopCapturer,
  screen,
  globalShortcut,
  ipcMain,
  systemPreferences,
} = require("electron");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

// A broken stdout/stderr pipe must never take the app down. When Aether is
// launched detached, or its parent closes the pipe, the next console.log/error
// would otherwise throw an uncaught `write EPIPE` and crash the whole app — which
// showed up as every button (move, clear, …) "breaking" the moment its handler
// logged. Swallow EPIPE on the std streams and on the process so logging is
// always safe.
for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (err) => {
    if (err && err.code === "EPIPE") return;
    throw err;
  });
}
process.on("uncaughtException", (err) => {
  if (err && err.code === "EPIPE") return; // ignore broken-pipe logging errors
  // Last-resort log; guarded so logging the error can't itself re-crash us.
  try {
    process.stderr.write("AETHER_UNCAUGHT " + (err && (err.stack || err.message || err)) + "\n");
  } catch (_) {
    /* nothing we can do */
  }
});

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

function setupAudioCapture() {
  // Electron denies renderer media requests unless we approve them — without
  // this, both the mic (getUserMedia) and device audio (getDisplayMedia) modes
  // silently fail, which is why tapping the motion button "did nothing".
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(true));
  session.defaultSession.setPermissionCheckHandler(() => true);

  // On macOS, proactively trigger the system microphone prompt so "◉ mic" mode
  // can actually capture (music played out loud is picked up by the mic). Safe
  // no-op elsewhere.
  if (process.platform === "darwin" && systemPreferences.askForMediaAccess) {
    systemPreferences.askForMediaAccess("microphone").catch(() => {});
  }

  // Device-audio ("● audio") mode: capture the system audio mix via
  // getDisplayMedia. On macOS we prefer the native system picker, which shows
  // the proper Screen Recording / audio permission UI and lets the user grant
  // access — without it, capture just silently fails so you're stuck on self/mic.
  // The fallback handler auto-picks a screen source with loopback audio for
  // platforms/OS versions without the picker (and hands back an empty response
  // when nothing is available, so the renderer can tell the user what to allow).
  const useSystemPicker = process.platform === "darwin";
  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer
        .getSources({ types: ["screen"] })
        .then((sources) =>
          sources && sources.length
            ? callback({ video: sources[0], audio: "loopback" })
            : callback({})
        )
        .catch(() => callback({}));
    },
    { useSystemPicker }
  );
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
  // Whatever the window's always-on-top state was when we hooked it up — the
  // overlay starts on, the framed in-app window starts off. We restore this
  // baseline whenever click-through is turned off so toggling through doesn't
  // accidentally un-pin the overlay or leave the framed window stuck on top.
  const baselineOnTop = win.isAlwaysOnTop();
  // Forwarded DOM mouse events are unreliable on Windows once a window is
  // click-through, so while it's on we poll the real cursor position in the main
  // process and push client-relative coords to the renderer. That's what lets it
  // pop the edit handle back when the cursor reaches the handle's corner.
  let cursorTimer = null;
  const stopCursorPoll = () => {
    if (cursorTimer) clearInterval(cursorTimer);
    cursorTimer = null;
  };
  const startCursorPoll = () => {
    stopCursorPoll();
    cursorTimer = setInterval(() => {
      if (win.isDestroyed()) return stopCursorPoll();
      const pt = screen.getCursorScreenPoint();
      const b = win.getBounds();
      const x = pt.x - b.x;
      const y = pt.y - b.y;
      win.webContents.send("aether:cursor", {
        x,
        y,
        inside: x >= 0 && y >= 0 && x <= b.width && y <= b.height,
      });
    }, 90);
  };
  const setThrough = (on) => {
    through = !!on;
    // forward:true keeps mouse-move events flowing to the page so its own UI can
    // react, while clicks still pass through to the windows underneath.
    win.setIgnoreMouseEvents(through, { forward: true });
    // The whole point of "▷ through" mode is that the slime keeps painting on
    // top of whatever you click on. Without forcing always-on-top here, the
    // clicked app's window comes above the visualizer and the slime "disappears"
    // — which is exactly what the user reported. "screen-saver" is the highest
    // practical Windows topmost level. When through goes back off we restore
    // the baseline so the framed in-app window doesn't stay stuck on top.
    win.setAlwaysOnTop(through || baselineOnTop, "screen-saver");
    if (through) startCursorPoll();
    else stopCursorPoll();
    if (!win.isDestroyed()) win.webContents.send("aether:click-through", through);
  };
  // Windows occasionally demotes a topmost window when another window grabs
  // focus. While through-mode is on, re-assert our top spot every time we lose
  // focus so the slime stays above whatever the user just clicked into.
  win.on("blur", () => {
    if (win.isDestroyed()) return;
    if (through) win.setAlwaysOnTop(true, "screen-saver");
  });
  win.on("closed", stopCursorPoll);
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

// Custom edge/corner resize driven by the renderer. Frameless transparent
// windows don't resize reliably from the native edges once -webkit-app-region
// drag regions are in play (only one edge tended to work), so the renderer puts
// invisible grips on every edge/corner and we compute the new bounds here from
// the original bounds + the cursor delta. Anchors the opposite edge so dragging
// the top/left grows from that side instead of shifting the whole window.
function setupResize(win) {
  let rz = null;
  ipcMain.on("aether:resize-start", (_e, p) => {
    rz = { edge: String(p.edge), b: win.getBounds(), x: p.x, y: p.y };
  });
  ipcMain.on("aether:resize-move", (_e, p) => {
    if (!rz || win.isDestroyed()) return;
    const [minW, minH] = win.getMinimumSize();
    const mw = minW || 220;
    const mh = minH || 220;
    const dx = Math.round(p.x - rz.x);
    const dy = Math.round(p.y - rz.y);
    const b = { x: rz.b.x, y: rz.b.y, width: rz.b.width, height: rz.b.height };
    const e = rz.edge;
    if (e.includes("e")) b.width = Math.max(mw, rz.b.width + dx);
    if (e.includes("s")) b.height = Math.max(mh, rz.b.height + dy);
    if (e.includes("w")) {
      b.width = Math.max(mw, rz.b.width - dx);
      b.x = rz.b.x + (rz.b.width - b.width); // keep the right edge fixed
    }
    if (e.includes("n")) {
      b.height = Math.max(mh, rz.b.height - dy);
      b.y = rz.b.y + (rz.b.height - b.height); // keep the bottom edge fixed
    }
    win.setBounds(b);
  });
  ipcMain.on("aether:resize-end", () => {
    rz = null;
  });
  win.on("closed", () => {
    rz = null;
  });
}

// Overlay-only: click-through + a "cover the screen" (maximize) toggle and a
// custom window move, driven by the renderer.
function setupOverlayInteractions(win) {
  // Bump the topmost level so clicking another app in "▷ through" mode can't
  // bring that app above the slime. Default `alwaysOnTop: true` maps to
  // "floating" on Windows (HWND_TOPMOST), which other topmost windows can
  // still cover; "screen-saver" sits above normal topmost windows.
  // visibleOnFullScreen lets it also paint over fullscreen apps on macOS;
  // on Windows it's a no-op but harmless.
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Windows occasionally demotes a topmost window when a different one gains
  // focus. Re-assert every time we lose focus so the slime stays on top while
  // the user works in apps behind it.
  win.on("blur", () => {
    if (win.isDestroyed()) return;
    win.setAlwaysOnTop(true, "screen-saver");
  });

  setupClickThrough(win);
  setupResize(win);

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
  setupResize(win);
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
  setupAudioCapture();

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
    // The window is also focus-skipping (skipTaskbar + focusable:false), so
    // clicking another app in "▷ through" mode never raises that app above the
    // overlay — the slime keeps painting on top while you work in whatever's
    // behind it. We promote the topmost level to "screen-saver" below.
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
      skipTaskbar: true,
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
      // grab the uncovered 14px border (see #drag-layer inset) to reshape it
      resizable: true,
      maximizable: true,
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
