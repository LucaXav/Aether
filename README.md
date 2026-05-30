# Aether — Audio-Reactive Shader Visualizer

A desktop visualizer that paints a gooey, beat-reacting **slime ball** on top of
whatever you're doing. Run it as a floating always-on-top window, your live
wallpaper, or a plain in-app window — it reacts to your device audio (or mic)
out of the box.

![overlay demo placeholder](./build/icon.ico)

**Stack:** Electron + Vite + TypeScript + Three.js (`ShaderMaterial`) + Web Audio
API + `MediaRecorder`.

---

## Install (Windows, no setup)

1. Go to the **[Releases page](https://github.com/LucaXav/aether/releases)**.
2. Download the latest **`Aether-Setup-x.y.z.exe`** (installer) or
   **`Aether-x.y.z-portable.exe`** (no install — just double-click).
3. Run it.

> **First time:** the installer isn't code-signed, so Windows SmartScreen warns
> you. Click **More info → Run anyway**. (Code signing requires a paid
> certificate.)

After install you get three launch modes:

| Mode | What it does | How to start |
|---|---|---|
| **App** | A normal frameless window with the slime + audio controls. | Launch **Aether** from the Start menu. |
| **Overlay** | A transparent floating slime that stays on top of every window. Toggle **▷ through** to type/click through it — the slime stays painted on top while you respond to emails, code, etc. | Run `Aether --overlay`, or run `npm run overlay` from source. |
| **Wallpaper** | Reparents the window behind the desktop icons so the slime becomes your live wallpaper. | Run `Aether --wallpaper`, or run `npm run wallpaper` from source. |

**Quitting:** all three modes can be quit at any time with **`Ctrl+Shift+Q`**
(global shortcut). The default app window also has an × button.

---

## How to use it

- **React to your device audio:** click **● audio** (auto-on in the desktop app —
  uses Windows loopback, no screen-share prompt).
- **React to your mic:** click again to cycle to **◉ mic**.
- **See through the window:** click **▢ clear** to drop the background so only
  the slime shows.
- **Click through the window** (overlay mode): click **▷ through** — now mouse
  and keyboard go to whatever's behind the slime, but the slime keeps painting
  on top. Press **`Ctrl+Shift+O`** (global) or move the cursor into the
  top-right corner and click **✎ edit overlay** to take control back.
- **Change the visual:** click **◆ style** or press **`S`** / `1`-`9` to cycle.
- **Fullscreen:** double-click anywhere on the slime.
- **Move the window:** drag it (frameless — the whole window is the drag handle).
  Double-click to maximize / restore.

---

## Build from source

You need [Node.js 20+](https://nodejs.org/).

```bash
git clone https://github.com/LucaXav/aether
cd aether
npm install

npm run dev        # http://localhost:5173 (browser-only)
npm run app        # desktop app (Electron)
npm run overlay    # floating always-on-top slime
npm run wallpaper  # behind-the-icons live wallpaper (Windows)
```

To build the installer locally:

```bash
npm run dist:win   # outputs release/Aether-Setup-<version>.exe (+ portable)
```

---

## Publishing a release

A GitHub Actions workflow (`.github/workflows/release.yml`) builds the Windows
installer and attaches it to a GitHub Release automatically on tag push:

```bash
# bump the version in package.json first (e.g. 0.1.1 -> 0.1.2), then:
git tag v0.1.2
git push origin v0.1.2
```

---

## What's in the box

- **Gooey slime** — a raymarched blob that wobbles and deforms to the beat. The
  default style.
- **Audio sources:** system / loopback audio (no screen-share prompt in the
  desktop app), microphone, file drag-drop, or a synthetic demo.
- **Beat-reactive ripples** driven by spectral-flux onset detection.
- **Mood drift** — the palette evolves with the song's spectral character.
- **Ambient mode** — UI auto-hides after a few seconds idle.
- **Always-on-top overlay** with real click-through so the slime stays painted
  on top of every other window while you keep working.
- **Live wallpaper** (Windows-only, behind desktop icons via the WorkerW trick).
- **One-click recording** to `.webm` (`MediaRecorder`, timesliced).

See **[PLAN.md](./PLAN.md)** for the full build spec, roadmap, and backlog.

---

## Troubleshooting

- **The overlay vanishes when I click another app** — fixed in v0.1.2+. The
  overlay uses Windows' highest topmost level and re-asserts it on focus loss,
  so the slime stays above whatever you click on. Update to the latest release.
- **`Ctrl+Shift+O` doesn't toggle through-mode** — another app may have grabbed
  that shortcut. Aether automatically falls back to `Alt+Shift+O` then
  `Ctrl+Alt+O`; check the console log line `AETHER_TOGGLE_KEY` to see which one
  it bound.
- **Wallpaper mode shows as a normal window** — the WorkerW attach varies
  across Windows builds. `Ctrl+Shift+Q` still quits. Alternative: load the
  built `dist/` in **Wallpaper Engine**.
