// Regenerate the raster app icons from icon.svg using Electron's own renderer
// (no extra dependencies). Run: npx electron build/gen-icons.cjs
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const DIR = __dirname;
const SVG = fs.readFileSync(path.join(DIR, "icon.svg"), "utf8");
const ICO_SIZES = [256, 128, 64, 48, 32, 16];

// Build a .ico that embeds PNG images (supported on Windows Vista+).
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  const entries = Buffer.alloc(16 * images.length);
  let offset = 6 + 16 * images.length;
  images.forEach((im, i) => {
    const e = i * 16;
    entries.writeUInt8(im.size >= 256 ? 0 : im.size, e + 0); // width (0 = 256)
    entries.writeUInt8(im.size >= 256 ? 0 : im.size, e + 1); // height
    entries.writeUInt8(0, e + 2); // palette
    entries.writeUInt8(0, e + 3); // reserved
    entries.writeUInt16LE(1, e + 4); // color planes
    entries.writeUInt16LE(32, e + 6); // bits per pixel
    entries.writeUInt32LE(im.buf.length, e + 8); // image size
    entries.writeUInt32LE(offset, e + 12); // image offset
    offset += im.buf.length;
  });
  return Buffer.concat([header, entries, ...images.map((im) => im.buf)]);
}

app.whenReady().then(async () => {
  // Must be on-screen + composited for capturePage to work (a fully off-screen
  // window throws UnknownVizError). Sits at 0,0 for a moment, then closes.
  const win = new BrowserWindow({
    width: 512,
    height: 512,
    x: 0,
    y: 0,
    show: true,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {},
  });
  const html =
    "<!doctype html><html><head><meta charset='utf-8'><style>" +
    "html,body{margin:0;padding:0;background:transparent}" +
    "svg{display:block;width:512px;height:512px}</style></head><body>" +
    SVG +
    "</body></html>";
  try {
    await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
    await new Promise((r) => setTimeout(r, 500));

    const img = await win.webContents.capturePage();
    const png = (n) => img.resize({ width: n, height: n, quality: "best" }).toPNG();

    fs.writeFileSync(path.join(DIR, "icon.png"), png(512));
    fs.writeFileSync(path.join(DIR, "preview-256.png"), png(256));
    fs.writeFileSync(
      path.join(DIR, "icon.ico"),
      buildIco(ICO_SIZES.map((size) => ({ size, buf: png(size) })))
    );
    console.log("ICONS_DONE");
  } catch (e) {
    console.error("ICONS_FAIL", e && e.message);
  } finally {
    win.destroy();
    app.quit();
  }
});
