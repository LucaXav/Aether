# capclu — Audio-Reactive Shader Visualizer

A web app: drop in a song (or live mic) → beat-synced WebGL shader visuals → record straight to a 9:16 clip.

The build doubles as content — the timelapse of building it is a reel, and the rendered output is reel B-roll.

**Stack:** Vite + TypeScript + Three.js (`ShaderMaterial`) + Web Audio API (`AnalyserNode`) + `MediaRecorder`.

See **[PLAN.md](./PLAN.md)** for the full build spec, roadmap, preset backlog, and gotchas.

## Status

🌱 Planning — scaffold not started yet.

## Getting started (planned)

```bash
npm create vite@latest . -- --template vanilla-ts
npm install three lil-gui
npm run dev
```
