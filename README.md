# Aether

A floating, audio-reactive **slime ball** that paints on top of your screen and
wobbles to the music. Click through it to keep working — the slime stays.

---

## Download (Windows)

1. Open the **[Releases page](https://github.com/LucaXav/Aether/releases)**.
2. Download the latest **`Aether-Setup-x.y.z.exe`**.
3. Double-click it to install, then launch **Aether** from your Start menu or
   desktop.

> Windows will warn that the installer isn't signed. Click **More info → Run
> anyway**. (Signing requires a paid certificate.)
>
> Don't want to install? Grab **`Aether-x.y.z-portable.exe`** from the same
> Releases page — it runs straight from the file, no install.

---

## How to use it

When Aether opens you get a transparent window with a row of buttons at the bottom:

| Button | What it does |
|---|---|
| **● audio** | React to your computer's audio (already on by default). Click again for mic. |
| **▢ clear** | Hide the black background — only the slime shows. |
| **▷ through** | Click and type *through* the window. The slime stays painted on top while you use other apps. |
| **◆ style** | Cycle visual styles. (`S` or `1`–`9` on the keyboard also work.) |
| **✕** | Quit. |

**Other tricks**
- **Drag** anywhere on the window to move it.
- **Double-click** to fullscreen.
- **`Ctrl+Shift+O`** toggles ▷ through from anywhere (even while it's on).
- **`Ctrl+Shift+Q`** quits from anywhere.
- While ▷ through is on, move your cursor to the **top-right corner** and click
  **✎ edit overlay** to take control back.

---

## Build from source

You need [Node.js 20+](https://nodejs.org/).

```bash
git clone https://github.com/LucaXav/Aether
cd Aether
npm install
npm run app        # desktop window
npm run overlay    # always-on-top floating slime
npm run wallpaper  # live wallpaper behind your icons (Windows)
```

To build your own installer:

```bash
npm run dist:win   # outputs release/Aether-Setup-<version>.exe
```

---

## What's inside

Electron + Vite + TypeScript + Three.js (`ShaderMaterial`) + Web Audio API.
The slime is a raymarched blob whose surface deforms to bass / mid / treble +
beat-driven ripples; the palette drifts with the song's spectral character.

See **[PLAN.md](./PLAN.md)** for the full spec and roadmap.
