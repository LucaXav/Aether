import "./style.css";
import { AudioEngine, type AudioMode } from "./audio";
import { Visualizer } from "./visualizer";
import { Recorder } from "./recorder";

const canvas = document.getElementById("view") as HTMLCanvasElement;
const audio = new AudioEngine();
const viz = new Visualizer(canvas);
const recorder = new Recorder(canvas);

const byId = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const btnSystem = byId<HTMLButtonElement>("btn-system");
const btnLoad = byId<HTMLButtonElement>("btn-load");
const btnPlay = byId<HTMLButtonElement>("btn-play");
const btnMic = byId<HTMLButtonElement>("btn-mic");
const btnDemo = byId<HTMLButtonElement>("btn-demo");
const btnRec = byId<HTMLButtonElement>("btn-rec");
const fileInput = byId<HTMLInputElement>("file");
const dropHint = byId<HTMLDivElement>("drop-hint");

const barBass = byId<HTMLSpanElement>("bar-bass");
const barMid = byId<HTMLSpanElement>("bar-mid");
const barTreble = byId<HTMLSpanElement>("bar-treble");
const beatEl = byId<HTMLDivElement>("beat");

function reflectMode(mode: AudioMode) {
  btnDemo.classList.toggle("active", mode === "demo");
  btnMic.classList.toggle("active", mode === "mic");
  btnSystem.classList.toggle("active", mode === "system");
  btnPlay.disabled = mode !== "file";
}

async function onFile(file: File) {
  await audio.loadFile(file);
  reflectMode("file");
  btnPlay.textContent = "⏸";
  dropHint.classList.add("hidden");
}

btnLoad.onclick = () => fileInput.click();
fileInput.onchange = () => {
  const f = fileInput.files?.[0];
  if (f) void onFile(f);
};
btnPlay.onclick = () => {
  audio.playPause();
  btnPlay.textContent = audio.isPlaying ? "⏸" : "▶";
};
btnMic.onclick = async () => {
  try {
    await audio.useMic();
    reflectMode("mic");
    dropHint.classList.add("hidden");
  } catch {
    alert("Could not access the microphone.");
  }
};
btnSystem.onclick = async () => {
  try {
    await audio.useSystemAudio();
    reflectMode("system");
    dropHint.classList.add("hidden");
  } catch (e) {
    const why = (e as Error)?.message === "no_audio_track";
    alert(
      why
        ? 'No audio was shared. In the prompt, pick a screen or tab and turn ON "Share audio / share tab audio".'
        : "System audio capture was cancelled or is unavailable in this browser."
    );
  }
};
btnDemo.onclick = () => {
  audio.setDemo();
  reflectMode("demo");
  btnPlay.textContent = "▶";
};
btnRec.onclick = () => {
  recorder.toggle();
  btnRec.classList.toggle("recording", recorder.recording);
  btnRec.textContent = recorder.recording ? "■ Stop" : "● Rec";
};

// drag & drop anywhere on the window
window.addEventListener("dragover", (e) => {
  e.preventDefault();
  document.body.classList.add("dragging");
});
window.addEventListener("dragleave", (e) => {
  if (e.relatedTarget === null) document.body.classList.remove("dragging");
});
window.addEventListener("drop", (e) => {
  e.preventDefault();
  document.body.classList.remove("dragging");
  const f = e.dataTransfer?.files?.[0];
  if (f && f.type.startsWith("audio")) void onFile(f);
});

// Auto-hide the UI when idle (ambient background mode); double-click = fullscreen.
let idleTimer: number | undefined;
function poke() {
  document.body.classList.remove("idle");
  clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => document.body.classList.add("idle"), 3000);
}
window.addEventListener("mousemove", poke);
window.addEventListener("keydown", poke);
poke();
canvas.addEventListener("dblclick", () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen();
  else document.exitFullscreen();
});

// In Electron wallpaper mode: hide the UI and auto-capture system (loopback)
// audio so it reacts to whatever's playing with no interaction.
const env = (
  window as Window & { capcluEnv?: { electron?: boolean; wallpaper?: boolean } }
).capcluEnv;
if (env?.wallpaper) {
  document.body.classList.add("idle");
  dropHint.classList.add("hidden");
  audio
    .useSystemAudio()
    .then(() => reflectMode("system"))
    .catch(() => {});
}

// Debug hook for automated validation (read live audio state from the console).
const liveBands = { bass: 0, mid: 0, treble: 0, beat: 0 };
(window as Window & { __capclu?: unknown }).__capclu = {
  audio,
  bands: () => liveBands,
  snapshot: () => ({ ...audio.debugSnapshot(), ...liveBands }),
};

// ---- render loop ----
const start = performance.now();
function loop() {
  const time = (performance.now() - start) / 1000;
  const d = audio.update(time);
  viz.render(d);
  Object.assign(liveBands, d);

  barBass.style.setProperty("--v", d.bass.toFixed(3));
  barMid.style.setProperty("--v", d.mid.toFixed(3));
  barTreble.style.setProperty("--v", d.treble.toFixed(3));
  beatEl.style.opacity = (0.25 + d.beat * 0.75).toFixed(3);
  beatEl.style.transform = `scale(${(1 + d.beat * 0.18).toFixed(3)})`;

  requestAnimationFrame(loop);
}
loop();
