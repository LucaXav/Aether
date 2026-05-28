const {
  app,
  BrowserWindow,
  session,
  desktopCapturer,
  screen,
  globalShortcut,
} = require("electron");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const DIST = path.join(__dirname, "..", "dist");
const SMOKE = process.env.CAPCLU_SMOKE === "1";
const WALLPAPER =
  process.argv.includes("--wallpaper") || process.env.CAPCLU_WALLPAPER === "1";
const WP_TITLE = "capclu-wallpaper";

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
    console.error("CAPCLU_WALLPAPER_UNSUPPORTED (Windows only)");
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
  } else {
    // chromeless, movable window: no title bar / no X. Drag it (by the visual)
    // onto any monitor, then use the Fullscreen button (or double-click) to make
    // it take the whole screen. Quit with Ctrl+Shift+Q or Alt+F4.
    Object.assign(opts, {
      width: 1280,
      height: 800,
      minWidth: 480,
      minHeight: 320,
      frame: false,
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
    console.log("CAPCLU_LOADED");
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
    console.error("CAPCLU_LOAD_FAIL", code, desc);
    if (SMOKE) app.quit();
  });

  await win.loadURL(`http://127.0.0.1:${port}/${WALLPAPER ? "?wallpaper=1" : ""}`);

  if (!SMOKE) {
    // frameless windows have no X button — always provide a quit shortcut
    globalShortcut.register("CommandOrControl+Shift+Q", () => app.quit());
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
