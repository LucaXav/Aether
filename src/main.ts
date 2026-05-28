import "./style.css";
import { AudioEngine, type AudioMode } from "./audio";
import { Visualizer } from "./visualizer";

const canvas = document.getElementById("view") as HTMLCanvasElement;
const audio = new AudioEngine();
const viz = new Visualizer(canvas);

const byId = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const btnSystem = byId<HTMLButtonElement>("btn-system");
const btnMic = byId<HTMLButtonElement>("btn-mic");
const btnStyle = byId<HTMLButtonElement>("btn-style");
const btnFull = byId<HTMLButtonElement>("btn-full");
const dropHint = byId<HTMLDivElement>("drop-hint");
const brandStyle = document.querySelector(".brand span") as HTMLSpanElement | null;

const barBass = byId<HTMLSpanElement>("bar-bass");
const barMid = byId<HTMLSpanElement>("bar-mid");
const barTreble = byId<HTMLSpanElement>("bar-treble");
const beatEl = byId<HTMLDivElement>("beat");

function reflectMode(mode: AudioMode) {
  btnMic.classList.toggle("active", mode === "mic");
  btnSystem.classList.toggle("active", mode === "system");
}

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
function reflectStyle(name: string) {
  btnStyle.textContent = "◆ " + name;
  if (brandStyle) brandStyle.textContent = "· " + name;
}
btnStyle.onclick = () => reflectStyle(viz.cycleStyle());

// Auto-hide the UI when idle (ambient background mode); double-click = fullscreen.
let idleTimer: number | undefined;
function poke() {
  document.body.classList.remove("idle");
  clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => document.body.classList.add("idle"), 3000);
}
window.addEventListener("mousemove", poke);
window.addEventListener("keydown", poke);
// keyboard: S cycles styles; number keys jump straight to one
window.addEventListener("keydown", (e) => {
  if (e.key === "s" || e.key === "S") {
    reflectStyle(viz.cycleStyle());
  } else if (e.key >= "1" && e.key <= "9") {
    const n = parseInt(e.key, 10) - 1;
    if (n < viz.styleCount) reflectStyle(viz.setStyle(n));
  }
});
poke();
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    hideHint();
    document.documentElement.requestFullscreen();
  } else document.exitFullscreen();
}
btnFull.onclick = toggleFullscreen;
canvas.addEventListener("dblclick", toggleFullscreen);

// In Electron wallpaper mode: hide the UI and auto-capture system (loopback)
// audio so it reacts to whatever's playing with no interaction.
const env = (
  window as Window & { capcluEnv?: { electron?: boolean; wallpaper?: boolean } }
).capcluEnv;
if (env?.electron) {
  // auto-connect to the device's audio (loopback) so it reacts with no setup
  audio
    .useSystemAudio()
    .then(() => {
      console.log("AETHER_AUDIO ok");
      reflectMode("system");
    })
    .catch((e) => console.log("AETHER_AUDIO fail", (e as Error)?.message));
  if (env.wallpaper) {
    document.body.classList.add("idle");
    hideHint();
  } else {
    dropHint.innerHTML =
      "<strong>Aether</strong>Drag anywhere to move this onto a monitor.<br />" +
      "<b>⛶ Fullscreen</b> (or double-click) fills the screen · <b>Ctrl+Shift+Q</b> quits.<br />" +
      "Listening to your device audio · <b>🎤 Mic</b> to switch.";
  }
}

// The centre hint shows briefly on open, then goes away for good — and
// immediately when going fullscreen — so it isn't always on screen.
// (Inline !important so no CSS rule can keep it visible.)
function hideHint() {
  dropHint.style.setProperty("opacity", "0", "important");
  dropHint.style.pointerEvents = "none";
  console.log("AETHER_HINT hidden");
}
setTimeout(hideHint, 5000);
document.addEventListener("fullscreenchange", () => {
  if (document.fullscreenElement) hideHint();
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
