# Audio-Reactive Shader Visualizer — Build Plan

> A web app: drop in a song (or live mic) → beat-synced WebGL shader visuals → record straight to a 9:16 clip.
> **The thesis:** the *output* is reel B-roll and the *build* is a timelapse reel. One project, two content streams.

---

## 1. Why this project (the content angle)

Reels are music + visual. A visualizer's output drops directly into your edits as B-roll, and "I vibe-coded a music visualizer this weekend" is itself a timelapse reel (your proven 494k format). Every new preset = a new clip = a new post. The project never "finishes" — it's a content engine.

Two content streams from one build:
- **Build content:** timelapse of the code + canvas evolving, hook = "I built X in a weekend."
- **Output content:** the rendered 9:16 visuals as B-roll behind your talking reels, or standalone "watch this react to [song]" clips.

---

## 2. Tech stack (recommended)

| Layer | Choice | Why |
|---|---|---|
| Build tool | **Vite + TypeScript** | Instant HMR — shader tweaks show live, huge for vibe-coding flow |
| Rendering | **Three.js** (`ShaderMaterial` on a fullscreen plane) | Less WebGL boilerplate, easy bloom/post via `EffectComposer`, AI tools know it cold |
| Visuals | **GLSL fragment shaders** | Where all the "cool" lives — one full-screen quad, audio drives uniforms |
| Audio | **Web Audio API** (`AnalyserNode`) | Built-in FFT, zero deps, file + mic input |
| Recording | **`canvas.captureStream()` + `MediaRecorder`** | One-click record to webm; upgrade to CCapture.js later for frame-perfect export |
| UI/controls | **lil-gui** or **Tweakpane** | Drop-in sliders for live params; Tweakpane looks nicer on camera |

Alternative for max control / min deps: raw WebGL2 + a hand-rolled fullscreen quad. Only go here if you want the "no framework" flex — Three.js gets you to "looks sick" faster.

---

## 3. How it works (the pipeline)

```
audio file / mic
      │
      ▼
 AudioContext ──► AnalyserNode.getByteFrequencyData()  // FFT, 256–1024 bins
      │
      ▼
 split into bands:  bass | mid | treble  (avg the bin ranges)
      │
      ▼
 write FFT array → a 1D DataTexture  (shader can sample the whole spectrum)
 + pass bass/mid/treble + beat-pulse as float uniforms
      │
      ▼
 fragment shader (fullscreen plane) reads uniforms → animates color/shape/distortion
      │
      ▼
 EffectComposer: bloom + vignette  ──►  canvas
      │
      ▼
 captureStream(60) → MediaRecorder → download .webm  (or 9:16 export pipeline)
```

**Key uniforms the shader consumes each frame:**
- `uTime` (float, seconds)
- `uBass`, `uMid`, `uTreble` (0–1 smoothed band energy)
- `uBeat` (0–1 pulse — spikes on kick, decays — drives the "punch")
- `uSpectrum` (sampler2D — the full FFT as a texture, for bar/waveform looks)
- `uResolution`, `uAspect`

---

## 4. MVP scope (v0.1 — already reel-worthy)

Ship the smallest thing that looks good on camera:

- [x] Vite + Three.js + TS scaffold, fullscreen shader plane
- [x] Load an audio file (drag-drop or file picker) + play/pause
- [x] AnalyserNode wired up; bass/mid/treble extracted and smoothed
- [x] **One** great shader preset reacting to the bands (nebula: domain-warped fbm + IQ palette)
- [x] Bloom post-processing (UnrealBloomPass + OutputPass + ACES tone mapping)
- [x] Record button → downloads a .webm (MediaRecorder, timesliced)
- [x] Bonus: mic input + synthetic demo mode + beat detection (spectral-flux onset)

✅ **Done & validated** with real playing audio via agent-browser. The moment bloom + bass-reactive distortion is on screen, you have a clip.

---

## 5. Roadmap (each phase = a content moment)

**Phase 1 — MVP** (above). Reel: "I built a music visualizer in a weekend."

**Phase 2 — Preset system.** Refactor so presets are swappable shaders + param sets. Add 3–4 presets. Reel: "I gave my visualizer 5 moods."

**Phase 3 — The reel pipeline.** Proper **9:16 export** at 1080×1920, 60fps, clean record UI, optional countdown. This is the feature that makes output usable in your actual edits. Reel: the visuals themselves as B-roll.

**Phase 4 — Mic / live mode.** Real-time mic input → react to your voice/room. Reel: "it reacts to me talking."

**Phase 5 — Polish + share.** Live controls on screen (Tweakpane), shareable URL that encodes preset+params, deploy to Vercel. Reel: "try it yourself, link in bio."

**Stretch:** beat detection (proper onset, not just amplitude) · MIDI/keyboard preset switching for "live VJ" clips · text/logo overlay baked into the shader · Spotify-canvas-style square export.

---

## 6. Preset / visual menu (the creative backlog)

Pick from these as you go — each is one shader file:
- **Nebula / plasma** — flowing fbm noise, palette shifts on bass *(best starter)*
- **Reactive grid / tunnel** — perspective grid that pulses + warps to the beat
- **Particle bloom** — points that scatter on kick, recohere on decay (GPGPU or instanced)
- **Liquid metal** — raymarched metaballs, treble = surface ripple *(harder, mathy)*
- **Spectrum bars / radial waveform** — literal FFT, clean + obviously "audio-reactive"
- **Kaleidoscope** — mirror any preset into n-fold symmetry; cheap, huge payoff on camera
- **ASCII / dither overlay** — stylistic post-pass, very "your aesthetic"

---

## 7. Gotchas a vibe coder will hit

- **Autoplay policy:** browsers block `AudioContext` until a user gesture. Resume the context on the play-button click — symptom is "no sound / flat FFT" until you do.
- **FFT is jumpy:** raw `getByteFrequencyData` flickers. Smooth each band with a lerp (`band = lerp(band, target, 0.2)`) or `analyser.smoothingTimeConstant = 0.8`.
- **"Beat" ≠ amplitude:** for a real punch, track a running average and fire `uBeat` when current bass exceeds avg × threshold, then decay it. Amplitude alone feels mushy.
- **Recording fps:** `captureStream(60)` only hits 60 if your render loop does. Watch perf with the bloom pass on; drop resolution before dropping the effect.
- **9:16 ≠ just CSS:** record the *canvas*, so the canvas backing store must be 1080×1920. Render at portrait dimensions (or render square/landscape and crop in your editor — decide early, §8).
- **Color > geometry:** a mediocre shape with a great palette + bloom beats a clever shape in flat colors. Steal palettes (coolors, Inigo Quilez's `palette()` cosine trick).

---

## 8. Decisions to make before/while building

1. **Aspect ratio strategy:** render natively at 9:16, or render 16:9/square and crop in your editor? (Native 9:16 = less post work; landscape = more flexible B-roll.)
2. **File-only, or mic too, in v1?** (File is simpler; mic is a better hook.)
3. **Deploy publicly (Vercel) or keep it a local content tool?** (Public = "link in bio" payoff but more polish needed.)
4. **TS strictness / framework:** plain TS + Three is enough — no React needed unless the UI grows.

---

## 9. First steps to kick off

```bash
npm create vite@latest visualizer -- --template vanilla-ts
cd visualizer
npm install three lil-gui
npm run dev
```

Then, in order:
1. Fullscreen `ShaderMaterial` plane rendering a time-animated gradient (proves the pipeline).
2. Wire `AudioContext` + file input + `AnalyserNode`; log bass/mid/treble to confirm reactivity.
3. Feed those as uniforms; make the gradient pulse to bass.
4. Swap the gradient for the nebula shader; add bloom.
5. Add the record button.

---

## Reference links
- [Awesome Creative Coding](https://github.com/terkelg/awesome-creative-coding) — generative/audio resources
- [Codrops: WebGL for Designers](https://tympanus.net/codrops/2026/03/04/webgl-for-designers-creating-interactive-shader-driven-graphics-directly-in-the-browser/) — shader effect inspiration
- [Lovable: Creative Coding Project Ideas](https://lovable.dev/guides/creative-coding-examples-project-ideas) — stack/scope reference
- Inigo Quilez — `palette()` cosine gradients & noise functions (search "iquilezles palette")
