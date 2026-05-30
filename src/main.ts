import "./style.css";
import { AudioEngine } from "./audio";
import { Visualizer } from "./visualizer";

const canvas = document.getElementById("view") as HTMLCanvasElement;
const audio = new AudioEngine();
const viz = new Visualizer(canvas);

// Bridge to the Electron main process (overlay only): click-through input and
// covering the whole screen. Undefined in a plain browser.
interface AetherBridge {
  setClickThrough?: (on: boolean) => void;
  onClickThrough?: (cb: (on: boolean) => void) => void;
  setInteractive?: (on: boolean) => void;
  onCursor?: (cb: (p: { x: number; y: number; inside: boolean }) => void) => void;
  onToggleKey?: (cb: (k: string | null) => void) => void;
  toggleMax?: () => void;
  toggleFullscreen?: () => void;
  dragStart?: (p: { x: number; y: number }) => void;
  dragMove?: (p: { x: number; y: number }) => void;
  dragEnd?: () => void;
  quit?: () => void;
}
const aether = (window as Window & { aether?: AetherBridge }).aether;
let clickThrough = false;
let toggleKeyLabel = "Ctrl+Shift+O";
aether?.onToggleKey?.((k) => {
  if (k) toggleKeyLabel = k.replace("CommandOrControl", "Ctrl");
});

const byId = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const btnAudio = byId<HTMLButtonElement>("btn-audio");
const btnBg = byId<HTMLButtonElement>("btn-bg");
const btnThrough = byId<HTMLButtonElement>("btn-through");
const editHandle = byId<HTMLButtonElement>("edit-handle");
const btnStyle = byId<HTMLButtonElement>("btn-style");
const btnClose = byId<HTMLButtonElement>("btn-close");
const dropHint = byId<HTMLDivElement>("drop-hint");
const brandStyle = document.querySelector(".brand span") as HTMLSpanElement | null;

const barBass = byId<HTMLSpanElement>("bar-bass");
const barMid = byId<HTMLSpanElement>("bar-mid");
const barTreble = byId<HTMLSpanElement>("bar-treble");
const beatEl = byId<HTMLDivElement>("beat");

// One simple control for how the slime moves: on its own (no audio), reacting
// to device audio, or reacting to the mic. Tapping cycles through them.
type Motion = "off" | "system" | "mic";
let motion: Motion = "off";
function reflectAudio() {
  btnAudio.textContent = { off: "○ move", system: "● audio", mic: "◉ mic" }[motion];
  btnAudio.classList.toggle("active", motion !== "off");
}
async function setMotion(next: Motion) {
  if (next !== "off") {
    try {
      if (next === "system") await audio.useSystemAudio();
      else await audio.useMic();
      console.log("AETHER_AUDIO", next);
    } catch (e) {
      // couldn't grab that source — fall back to moving on its own
      console.log("AETHER_AUDIO fail", (e as Error)?.message);
      next = "off";
    }
  }
  motion = next;
  viz.setAudioMotion(next !== "off");
  reflectAudio();
  if (next !== "off") dropHint.classList.add("hidden");
}
btnAudio.onclick = () => {
  const order: Motion[] = ["off", "system", "mic"];
  setMotion(order[(order.indexOf(motion) + 1) % order.length]);
};

// Background: transparent (subject only) vs solid black — works per style.
let transparentBg = false;
function reflectBg() {
  btnBg.textContent = transparentBg ? "▢ clear" : "▣ black";
  btnBg.classList.toggle("active", transparentBg);
}
function setBg(transparent: boolean) {
  transparentBg = transparent;
  viz.setOverlay(transparent);
  // Clear the page background too so the (transparent) window actually shows the
  // desktop behind it — otherwise only the canvas goes clear and html/body keep
  // painting solid black, so you'd just see the subject change, not see-through.
  const pageBg = transparent ? "transparent" : "#07060c";
  document.documentElement.style.background = pageBg;
  document.body.style.background = pageBg;
  reflectBg();
}
btnBg.onclick = () => setBg(!transparentBg);
reflectBg();

// Click-through: pass mouse/keyboard to whatever's behind the overlay so you
// can keep coding while the visuals float on top. Once on, the bar can't be
// clicked — Ctrl+Shift+O (global) toggles it back. main.cjs owns the real flag.
function reflectThrough() {
  btnThrough.classList.toggle("active", clickThrough);
}
btnThrough.onclick = () => aether?.setClickThrough?.(!clickThrough);
// The edit handle is the mouse-only way out of click-through; the global
// shortcut is the keyboard way.
editHandle.onclick = () => aether?.setClickThrough?.(false);

// The handle shows briefly when click-through starts, then hides so it's out of
// the way; it pops back when the cursor reaches the top-right corner it lives in.
let handleTimer: number | undefined;
function showHandle() {
  document.body.classList.remove("handle-hidden");
  clearTimeout(handleTimer);
  handleTimer = window.setTimeout(
    () => document.body.classList.add("handle-hidden"),
    5000
  );
}

// Pass-through is only useful if you can also SEE (and aim at) what's behind, so
// turning it on forces the transparent background; turning it off restores
// whatever background you had before.
let bgBeforeThrough = false;
aether?.onClickThrough?.((on) => {
  clickThrough = on;
  document.body.classList.toggle("passthrough", on);
  reflectThrough();
  if (on) {
    bgBeforeThrough = transparentBg;
    if (!transparentBg) setBg(true);
    showHandle();
    flashHint(
      `Click-through ON — typing/clicks go to apps behind. Move to the top-right corner for <em>✎ edit overlay</em>, or press <em>${toggleKeyLabel}</em>, to come back.`
    );
  } else {
    if (!bgBeforeThrough) setBg(false);
    clearTimeout(handleTimer);
    document.body.classList.remove("handle-hidden");
    poke();
  }
});

// While click-through, the whole window ignores the mouse — except we ask main
// to make it interactive while the cursor is over the (visible) edit handle, so
// it stays clickable. Moving into the top-right corner pops the handle back.
// Only fire setInteractive on enter/leave to avoid IPC spam.
//
// The cursor coords come from TWO sources: forwarded DOM mousemove (works when
// the handle has made the window interactive) and a main-process poll over the
// `onCursor` channel (works even while fully click-through, where forwarded DOM
// events are unreliable on Windows). Both feed the same hit-test.
let overHandle = false;
function handleCursor(x: number, y: number) {
  if (!clickThrough) return;
  if (x > window.innerWidth - 130 && y < 110) showHandle();
  const r = editHandle.getBoundingClientRect();
  const over =
    !document.body.classList.contains("handle-hidden") &&
    x >= r.left &&
    x <= r.right &&
    y >= r.top &&
    y <= r.bottom;
  if (over !== overHandle) {
    overHandle = over;
    aether?.setInteractive?.(over);
  }
}
window.addEventListener("mousemove", (e) => handleCursor(e.clientX, e.clientY));
aether?.onCursor?.((p) => {
  if (p.inside) handleCursor(p.x, p.y);
});

// Frameless Electron windows (the overlay AND the default in-app window) are
// moved by an interior no-drag layer rather than an OS drag region: transparent
// windows don't maximize/fullscreen on the native caption double-click, and OS
// drag regions swallow the dblclick — so we drive move + double-click ourselves.
function setupDragLayer(onDoubleClick: () => void) {
  const dragLayer = byId<HTMLDivElement>("drag-layer");
  let dragging = false;
  dragLayer.addEventListener("mousedown", (e) => {
    if (clickThrough || e.button !== 0) return;
    dragging = true;
    aether?.dragStart?.({ x: e.screenX, y: e.screenY });
    e.preventDefault();
  });
  window.addEventListener("mousemove", (e) => {
    if (dragging) aether?.dragMove?.({ x: e.screenX, y: e.screenY });
  });
  window.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    aether?.dragEnd?.();
  });
  dragLayer.addEventListener("dblclick", () => {
    if (!clickThrough) onDoubleClick();
  });
}

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
// Double-click toggles fullscreen. In the overlay this is handled natively by
// the OS (double-clicking the draggable area maximizes/restores the window —
// see maximizable in main.cjs); here we cover the plain in-app window.
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    hideHint();
    document.documentElement.requestFullscreen();
  } else document.exitFullscreen();
}
canvas.addEventListener("dblclick", toggleFullscreen);
btnClose.onclick = () => aether?.quit?.();

// In Electron wallpaper mode: hide the UI and auto-capture system (loopback)
// audio so it reacts to whatever's playing with no interaction.
const env = (
  window as Window & {
    aetherEnv?: { electron?: boolean; wallpaper?: boolean; overlay?: boolean };
  }
).aetherEnv;
if (env?.electron) {
  // Show a dashed outline on the (otherwise invisible) window edges whenever you
  // move or resize a frameless window, so the bounds are easy to grab; fade it
  // out 3s after the last interaction. Used by both the floating overlay and the
  // default in-app window — both are transparent/frameless with no visible edge.
  let outlineTimer: number | undefined;
  const showOutline = () => {
    document.body.classList.remove("outline-hidden");
    clearTimeout(outlineTimer);
    outlineTimer = window.setTimeout(
      () => document.body.classList.add("outline-hidden"),
      3000
    );
  };
  const enableResizeOutline = () => {
    showOutline();
    window.addEventListener("resize", showOutline);
    window.addEventListener("mousemove", showOutline);
    window.addEventListener("pointerdown", showOutline);
  };

  // auto-connect to the device's audio (loopback) so it reacts with no setup
  setMotion("system");
  // frameless windows have no native X — show a clickable close button so users
  // can quit with the mouse (skip wallpaper mode, where it sits behind icons).
  if (!env.wallpaper) btnClose.style.display = "grid";
  if (env.overlay) {
    // transparent floating slime: draw only the subject, hide all UI, and
    // clear the page background (the canvas is alpha-0 but html/body paint
    // a near-black colour that would otherwise show behind the blob).
    setBg(true);
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.classList.add("idle", "overlay");
    hideHint();

    enableResizeOutline();

    // Move + double-click maximize on the interior (fills the work area but stays
    // a floating always-on-top window).
    setupDragLayer(() => aether?.toggleMax?.());
  } else if (env.wallpaper) {
    document.body.classList.add("idle");
    hideHint();
  } else {
    // Default in-app window: it's transparent + frameless, so move + double-click
    // fullscreen are driven via the interior layer (same reason as the overlay),
    // and the "▢ clear" button reveals the desktop behind the window.
    document.body.classList.add("framed");
    enableResizeOutline();
    setupDragLayer(() => aether?.toggleFullscreen?.());
    dropHint.innerHTML =
      "<strong>Aether</strong>Drag anywhere to move this onto a monitor.<br />" +
      "Double-click fills the screen · <b>▢ clear</b> shows the desktop behind · <b>Ctrl+Shift+Q</b> quits.<br />" +
      "Reacting to your device audio · tap <b>motion</b> to switch.";
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
// Briefly show a centre message (e.g. the click-through shortcut), then fade.
function flashHint(msg: string, ms = 2800) {
  dropHint.innerHTML = msg;
  dropHint.style.setProperty("opacity", "1", "important");
  dropHint.style.pointerEvents = "none";
  window.setTimeout(hideHint, ms);
}
setTimeout(hideHint, 5000);
document.addEventListener("fullscreenchange", () => {
  if (document.fullscreenElement) hideHint();
});

// Debug hook for automated validation (read live audio state from the console).
const liveBands = { bass: 0, mid: 0, treble: 0, beat: 0 };
(window as Window & { __aether?: unknown }).__aether = {
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
