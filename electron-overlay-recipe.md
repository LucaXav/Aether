# Click‑Through Transparent Desktop Overlay (Electron)

Goal: a frameless, always‑on‑top window that shows graphics (canvas / WebGL / CSS)
floating over the whole screen, where you can **click and type into the apps
behind it**. Toggle "see‑through" on/off, and always have a way back in.

## 1. The window (main process)

```js
const win = new BrowserWindow({
  transparent: true,          // let the desktop show through
  backgroundColor: "#00000000",
  frame: false,               // no title bar / chrome
  alwaysOnTop: true,          // float above other apps
  hasShadow: false,
  resizable: true,
  webPreferences: { preload, backgroundThrottling: false },
});
```

## 2. Make it transparent for real

Transparency only works if **every layer** is transparent:

- Page: `html, body { background: transparent; }`
- If using `<canvas>`/WebGL: create the context with `alpha: true` and clear to
  alpha 0 (`renderer.setClearColor(0x000000, 0)`); output **premultiplied alpha**
  (`gl_FragColor = vec4(rgb * a, a)`), and don't run post‑FX passes that drop alpha
  (e.g. bloom) in this mode.
- Draw only the "subject"; leave the rest at alpha 0 so the desktop shows through.

## 3. Click‑through (input falls through to apps behind)

The key API: `win.setIgnoreMouseEvents(true, { forward: true })`.
`forward: true` still sends mouse‑move events to your page (for hover) while
clicks pass to the window underneath. Keyboard follows focus — once a click lands
on the app behind, that app gets the keystrokes.

```js
// main.js
const setThrough = (on) => {
  win.setIgnoreMouseEvents(on, { forward: true });
  win.webContents.send("through", on); // tell the UI to hide its chrome
};
ipcMain.on("set-through", (_e, on) => setThrough(on));
```

```js
// preload.js  (contextBridge)
setThrough: (on) => ipcRenderer.send("set-through", on),
onThrough:  (cb) => ipcRenderer.on("through", (_e, on) => cb(on)),
```

## 4. Always have a way back (critical)

Once click‑through is on, you can't click the window's own buttons. Provide BOTH:

- **Global shortcut** (works while unfocused): `globalShortcut.register("CommandOrControl+Shift+O", toggle)`. Try a few combos and check the boolean return — registration silently fails if another app owns the key.
- **A clickable widget inside the click‑through window.** Trick: keep one small
  element visible, forward mouse‑move to the renderer, hit‑test the element, and
  flip ignore off only while the cursor is over it:

```js
// renderer, only while through === true
el.getBoundingClientRect(); // -> over?
aether.setInteractive(over); // main: win.setIgnoreMouseEvents(!over, { forward:true })
el.onclick = () => aether.setThrough(false);
```

Frameless windows have no native ✕ — add a global **quit** shortcut
(`CommandOrControl+Shift+Q`) and/or an IPC quit button.

## 5. Cover the whole screen

```js
const d = screen.getDisplayMatching(win.getBounds());
win.setBounds(d.workArea); // workArea = excludes taskbar; .bounds = full
```

## 6. Gotchas

- **Resize on a frameless window:** `-webkit-app-region: drag` over the whole body
  blocks edge‑resizing. Make the body `no-drag` and put a `drag` layer **inset**
  (e.g. `inset: 14px`) so the OS keeps the outer edge for resize.
- **`app.requestSingleInstanceLock()`** — a relaunch no‑ops if one is running;
  fully quit before restarting.
- **Electron loads built files, not your dev source** if you serve `dist/`. Run
  the build before launching, or you'll see stale output.
- Toggle the page's chrome (controls, outlines) off in click‑through so only the
  graphics sit over your work.

## Minimal flow

`build → launch transparent always‑on‑top window → render graphics with alpha 0
background → toggle setIgnoreMouseEvents to code behind it → global shortcut +
small hover‑clickable handle to come back.`
