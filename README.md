# capclu — Audio-Reactive Shader Visualizer

A web app: drop in a song (or live mic) → beat-synced WebGL shader visuals → record straight to a 9:16 clip.

The build doubles as content — the timelapse of building it is a reel, and the rendered output is reel B-roll.

**Stack:** Vite + TypeScript + Three.js (`ShaderMaterial`) + Web Audio API (`AnalyserNode`) + `MediaRecorder`.

See **[PLAN.md](./PLAN.md)** for the full build spec, roadmap, preset backlog, and gotchas.

## Status

✅ **MVP built and working.** Load a track (or use the mic / demo mode), watch the
nebula shader react to bass/mid/treble with beat-driven pulses, and record the
canvas to a `.webm`.

What's wired up:
- **Liquid "flow" field** — an always-moving, domain-warped fluid (ink-in-water /
  aurora) that flows continuously. Audio shapes it *gently and slowly* (flow pace,
  swell, shimmer) rather than punching on the beat. Beats arrive as soft expanding
  **ripples** across the surface — wavy, not flashy.
- **Mood drift** — the color palette crossfades over time based on the song's
  spectral character (energy + brightness), so the look evolves as the music
  changes. Built for leaving on a second screen as ambient visual art.
- **Ambient mode** — the UI auto-hides after a few seconds idle; double-click for
  fullscreen.
- **Audio sources:** system/tab audio (screen-share), microphone, file
  (drag-drop or picker), and a synthetic demo.
- Web Audio FFT → smoothed bass / mid / treble + slow energy/tilt signals.
- Beat / big-beat detection (spectral-flux onset) — used only for gentle ripples.
- ACES tone mapping + soft bloom (`UnrealBloomPass` + `OutputPass`).
- One-click canvas recording to `.webm` (`MediaRecorder`, timesliced).

Validated end-to-end (isolated headless Chromium) with real playing audio: clean
init, live FFT data, reactive flow, color drifting across moods.

## Download (Windows)

Grab the latest **`Aether-Setup-x.y.z.exe`** from the
[Releases page](https://github.com/LucaXav/capclu/releases) and run it.

> The installer isn't code-signed, so Windows SmartScreen will warn the first
> time: click **More info → Run anyway**. (Code signing requires a paid
> certificate.) A `portable` `.exe` that runs without installing is also attached
> to each release.

## Getting started (from source)

```bash
npm install
npm run dev      # http://localhost:5173
```

- **React to music playing on your device:** click **🖥 System audio**, then in the
  prompt pick a screen or tab and turn ON "Share audio". (No mic needed.)
- Or drop an audio file onto the page, use **🎤 Mic**, or hit **✨ Demo** to see it
  run on synthetic audio immediately.
- Press **● Rec** to capture the canvas to a `.webm`.
- **Leave it running:** move the mouse away and the UI fades; double-click for fullscreen.

## Desktop app (Electron)

```bash
npm run app        # builds, then opens the visualizer as a desktop window
```

Inside Electron, **🖥 System audio** captures the device's audio via **loopback**
(no screen-share prompt) — it just reacts to whatever's playing.

## Live wallpaper (Windows)

```bash
npm run wallpaper  # runs it as a desktop wallpaper, behind your icons
```

This reparents the window behind the desktop icons (the Windows "WorkerW"
technique) and auto-captures system audio, so your desktop background becomes a
live, music-reacting visual. It's fully reversible — **press `Ctrl+Shift+Q` to
quit** (the window is frameless and behind the icons, so there's no close button).

> Note: the wallpaper attach is Windows-specific and varies slightly across
> builds; if it ever shows as a normal fullscreen window instead of behind the
> icons, `Ctrl+Shift+Q` still quits it. Alternatives: a paid tool like
> **Wallpaper Engine** can load the built `dist/` as a web wallpaper, or install
> the Rust toolchain to use the `electron-as-wallpaper` native module.

## Publishing a release

Packaging uses [electron-builder](https://www.electron.build/). A GitHub Actions
workflow (`.github/workflows/release.yml`) builds the Windows installer and
attaches it to a GitHub Release automatically when you push a version tag:

```bash
# bump the version in package.json first (e.g. 0.1.0 -> 0.1.1), then:
git tag v0.1.1
git push origin v0.1.1
```

To build an installer locally instead:

```bash
npm run dist:win   # outputs release/Aether-Setup-<version>.exe (+ portable)
```

## Next up (see [PLAN.md](./PLAN.md))

Native 9:16 export, more flow styles, and a shareable deploy.
