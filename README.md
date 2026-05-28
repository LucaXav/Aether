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
- **3D "hybrid scene"** (not a flat pulsing shader): a deep starfield, ~4k GPU
  particles streaming along a 3D curl flow-field, and a wireframe core + orbiting
  shards. Beats burst the particles outward; **big beats** explode the shards and
  the whole look cycles through color "scenes" (aurora / ember / orchid / viridis).
  A perspective camera slowly orbits and is pulled in by the bass.
- **Audio sources:** system/tab audio (screen-share), microphone, file
  (drag-drop or picker), and a synthetic demo.
- Web Audio FFT → smoothed bass / mid / treble bands.
- Beat + big-beat detection via low-band spectral-flux onset detection.
- ACES tone mapping + bloom (`UnrealBloomPass` + `OutputPass`).
- One-click canvas recording to `.webm` (`MediaRecorder`, timesliced).

Validated end-to-end (isolated headless Chromium) with real playing audio: clean
init, live FFT data, reactive bands, beats + big beats firing in time.

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
```

- **React to music playing on your device:** click **🖥 System audio**, then in the
  prompt pick a screen or tab and turn ON "Share audio". (No mic needed.)
- Or drop an audio file onto the page, use **🎤 Mic**, or hit **✨ Demo** to see it
  run on synthetic audio immediately.
- Press **● Rec** to capture the canvas to a `.webm`.

## Next up (see [PLAN.md](./PLAN.md))

Native 9:16 export, more scene types, and a shareable deploy.
