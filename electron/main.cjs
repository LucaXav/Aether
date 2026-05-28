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

// Serve the built app over localhost (a secure context, so getDisplayMedia /
// getUserMedia work) instead of file:// (which blocks those APIs).
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

// Feed system (loopback) audio to getDisplayMedia with no picker, so it reacts
// to whatever is playing on the device.
function setupLoopbackAudio() {
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer
      .getSources({ types: ["screen"] })
      .then((sources) => callback({ video: sources[0], audio: "loopback" }))
      .catch(() => callback({}));
  });
}

// Reparent our window behind the desktop icons (Windows WorkerW technique) via
// a PowerShell helper. Fully reversible: closing the app restores the desktop.
function attachAsWallpaper() {
  if (process.platform !== "win32") {
    console.error("CAPCLU_WALLPAPER_UNSUPPORTED (Windows only)");
    return;
  }
  const ps = path.join(__dirname, "attach-wallpaper.ps1");
  const child = spawn(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps, "-Title", WP_TITLE],
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
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      backgroundThrottling: false, // keep animating when unfocused / behind icons
    },
  };

  if (WALLPAPER) {
    const b = screen.getPrimaryDisplay().bounds;
    Object.assign(opts, {
      x: 0,
      y: 0,
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
    Object.assign(opts, { width: 1280, height: 720 });
  }

  const win = new BrowserWindow(opts);

  if (WALLPAPER) {
    // keep a stable window title for the PowerShell helper to find
    win.on("page-title-updated", (e) => e.preventDefault());
  }

  win.webContents.on("did-finish-load", () => {
    console.log("CAPCLU_LOADED");
    if (SMOKE) {
      setTimeout(() => app.quit(), 400);
      return;
    }
    if (WALLPAPER) {
      win.setTitle(WP_TITLE);
      setTimeout(attachAsWallpaper, 600);
    }
  });
  win.webContents.on("did-fail-load", (_e, code, desc) => {
    console.error("CAPCLU_LOAD_FAIL", code, desc);
    if (SMOKE) app.quit();
  });

  await win.loadURL(`http://127.0.0.1:${port}/${WALLPAPER ? "?wallpaper=1" : ""}`);

  if (WALLPAPER && !SMOKE) {
    // frameless + behind icons has no close button — always allow a clean exit
    globalShortcut.register("CommandOrControl+Shift+Q", () => app.quit());
  }
}

app.whenReady().then(createWindow);
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
