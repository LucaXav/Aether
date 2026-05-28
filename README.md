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
- Fullscreen GLSL nebula shader (domain-warped fbm + IQ cosine palette)
- Web Audio FFT → smoothed bass / mid / treble bands
- Beat detection via low-band spectral-flux onset detection
- ACES tone mapping + bloom (`UnrealBloomPass` + `OutputPass`)
- Audio sources: file (drag-drop or picker), microphone, synthetic demo
- One-click canvas recording to `.webm` (`MediaRecorder`, timesliced)

Validated end-to-end with real playing audio: confirmed live FFT data, reactive
bands, beats firing in time, and a non-empty recorded clip.

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
```

Then drop an audio file onto the page (or hit **Demo** to see it run on synthetic
audio immediately), and press **● Rec** to capture a clip.

## Next up (see [PLAN.md](./PLAN.md))

Preset system, native 9:16 export, and a shareable deploy.
