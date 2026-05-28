import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { fullscreenVert, STYLES } from "./shaders";
import { MOODS } from "./palette";
import type { AudioData } from "./audio";

export class Visualizer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private material: THREE.ShaderMaterial;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private clock = new THREE.Clock();

  private styleIndex = 0;

  // smoothed audio (decoupled from snappy beat detection for fluid motion)
  private sMid = 0;
  private sTreble = 0;
  private sEnergy = 0;
  private sPace = 0.4;
  private sAccent = 0;

  // beat-driven color (eased hue walk — recolors only, frame stays anchored)
  private hueShift = 0;
  private hueTarget = 0;
  private beatLatch = false;
  private bigLatch = false;

  // slow in-place shape morph
  private shape = 0.5;
  private shapePhase = 0;

  // mood crossfade
  private moodPos = 0;
  private moodDrift = 0;
  private c1 = new THREE.Color();
  private c2 = new THREE.Color();
  private c3 = new THREE.Color();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.c1.copy(MOODS[0].c1);
    this.c2.copy(MOODS[0].c2);
    this.c3.copy(MOODS[0].c3);

    this.material = new THREE.ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: STYLES[0].frag,
      uniforms: {
        uTime: { value: 0 },
        uRes: { value: new THREE.Vector2(1, 1) },
        uEnergy: { value: 0 },
        uMid: { value: 0 },
        uTreble: { value: 0 },
        uPace: { value: 0.4 },
        uAccent: { value: 0 },
        uAggr: { value: 0 },
        uC1: { value: this.c1 },
        uC2: { value: this.c2 },
        uC3: { value: this.c3 },
        uHueShift: { value: 0 },
        uShape: { value: 0.5 },
      },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // soft bloom — a warm glow on the bright filaments, not a flash
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.8, 0.55);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  get styleName(): string {
    return STYLES[this.styleIndex].name;
  }
  get styleCount(): number {
    return STYLES.length;
  }

  /** Switch to a style by index (clamped). Recompiles the fragment shader. */
  setStyle(i: number): string {
    this.styleIndex = THREE.MathUtils.clamp(i, 0, STYLES.length - 1);
    this.material.fragmentShader = STYLES[this.styleIndex].frag;
    this.material.needsUpdate = true;
    return this.styleName;
  }
  /** Advance to the next style, wrapping around. */
  cycleStyle(): string {
    return this.setStyle((this.styleIndex + 1) % STYLES.length);
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // cap DPR: the flow shader is fill-rate heavy
    const dpr = Math.min(window.devicePixelRatio, 1.5);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.material.uniforms.uRes.value.set(w, h);
  }

  render(a: AudioData) {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    const u = this.material.uniforms;

    // --- fluid smoothing: ease uniforms slowly toward the audio bands ---
    this.sMid += (a.mid - this.sMid) * 0.06;
    this.sTreble += (a.treble - this.sTreble) * 0.08;
    this.sEnergy += (a.energy - this.sEnergy) * 0.03;
    this.sPace += (a.pace - this.sPace) * 0.02;
    u.uTime.value = t;
    u.uMid.value = this.sMid;
    u.uTreble.value = this.sTreble;
    u.uEnergy.value = this.sEnergy;
    u.uPace.value = this.sPace;
    // How lively the whole reaction is, set by the song's intensity: a calm
    // lofi track barely reacts; an upbeat EDM track is lively (but never jumpy).
    const react = 0.3 + 0.7 * a.aggression;
    // accent drives the per-beat "hit"; lightly smoothed + scaled by intensity
    this.sAccent += (a.accent - this.sAccent) * 0.4;
    u.uAccent.value = this.sAccent * (0.15 + 0.6 * a.aggression);
    u.uAggr.value = a.aggression;

    // --- beats recolor: nudge the hue target and let it EASE there (only a tiny
    //     instant move), so color drifts on the beat instead of jumping. ---
    if (a.beat > 0.6 && !this.beatLatch) {
      this.beatLatch = true;
      const mag = (Math.random() - 0.5) * (0.3 + a.accent * 0.8) * react;
      this.hueTarget += mag;
      this.hueShift += mag * 0.15; // small immediate move; the rest eases in
    } else if (a.beat < 0.3) {
      this.beatLatch = false;
    }
    if (a.bigBeat > 0.6 && !this.bigLatch) {
      this.bigLatch = true;
      const mag = (Math.random() - 0.5) * (0.6 + a.accent * 0.9) * react;
      this.hueTarget += mag;
      this.hueShift += mag * 0.35; // softer snap on big beats
    } else if (a.bigBeat < 0.3) {
      this.bigLatch = false;
    }
    // continuous color drift: slow when calm, a bit faster when intense
    this.hueTarget += dt * (0.03 + 0.06 * a.aggression);
    this.hueShift += (this.hueTarget - this.hueShift) * 0.06; // gentle ease
    u.uHueShift.value = this.hueShift;

    // --- slow shape morph: patterns change form in place (no zoom/translate) ---
    this.shapePhase += dt * (0.05 + this.sMid * 0.05);
    const shapeTarget = THREE.MathUtils.clamp(
      0.5 + 0.4 * Math.sin(this.shapePhase) + 0.25 * (this.sMid - 0.3),
      0,
      1
    );
    this.shape += (shapeTarget - this.shape) * 0.03;
    u.uShape.value = this.shape;

    // --- mood drift: the palette slowly evolves on its own so the look is never
    //     the same for long, with a little nudge from the song's brightness.
    //     Two decorrelated slow waves make it wander across moods (not just
    //     back-and-forth); a full wander takes a few minutes. ---
    this.moodDrift += dt * 0.025;
    const wander =
      (0.5 + 0.5 * Math.sin(this.moodDrift)) * 0.6 +
      (0.5 + 0.5 * Math.sin(this.moodDrift * 0.37 + 1.3)) * 0.4;
    const target = (wander * 0.7 + a.tilt * 0.3) * (MOODS.length - 1);
    this.moodPos += (target - this.moodPos) * 0.01;
    const idx = Math.floor(this.moodPos) % MOODS.length;
    const nxt = (idx + 1) % MOODS.length;
    const frac = this.moodPos - Math.floor(this.moodPos);
    const A = MOODS[idx];
    const B = MOODS[nxt];
    this.c1.lerpColors(A.c1, B.c1, frac);
    this.c2.lerpColors(A.c2, B.c2, frac);
    this.c3.lerpColors(A.c3, B.c3, frac);

    this.composer.render();
  }
}
