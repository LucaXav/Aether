import "./style.css";
import { AudioEngine } from "./audio";
import { Visualizer } from "./visualizer";
import { Recorder } from "./recorder";

const canvas = document.getElementById("view") as HTMLCanvasElement;
const audio = new AudioEngine();
const viz = new Visualizer(canvas);
const recorder = new Recorder(canvas);

const byId = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

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

function reflectMode(mode: "demo" | "file" | "mic") {
  btnDemo.classList.toggle("active", mode === "demo");
  btnMic.classList.toggle("active", mode === "mic");
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
  viz.render(time, d);
  Object.assign(liveBands, d);

  barBass.style.setProperty("--v", d.bass.toFixed(3));
  barMid.style.setProperty("--v", d.mid.toFixed(3));
  barTreble.style.setProperty("--v", d.treble.toFixed(3));
  beatEl.style.opacity = (0.25 + d.beat * 0.75).toFixed(3);
  beatEl.style.transform = `scale(${(1 + d.beat * 0.18).toFixed(3)})`;

  requestAnimationFrame(loop);
}
loop();
