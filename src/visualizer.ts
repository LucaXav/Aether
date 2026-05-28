import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { liquidVert, liquidFrag } from "./shaders";
import { MOODS } from "./palette";
import type { AudioData } from "./audio";

const RIPPLES = 5;

export class Visualizer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private material: THREE.ShaderMaterial;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private clock = new THREE.Clock();

  // smoothed audio (decoupled from snappy beat detection for fluid motion)
  private sBass = 0;
  private sMid = 0;
  private sTreble = 0;
  private sEnergy = 0;

  // ripple slots
  private ripplePos: THREE.Vector2[] = [];
  private rippleAge: number[] = [];
  private rippleAmp: number[] = [];
  private rippleCursor = 0;
  private beatLatch = false;
  private bigLatch = false;

  // beat-driven color + motion (eased, so nothing snaps)
  private hueShift = 0; // current hue rotation (rad)
  private hueTarget = 0; // beats walk this around; eased toward smoothly
  private swirl = 0; // continuous field rotation
  private swirlRate = 0.03; // rad/s, beats vary it
  private flowDir = new THREE.Vector2(); // gliding drift, beats push it
  private shape = 0.5; // morph 0..1
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

    for (let i = 0; i < RIPPLES; i++) {
      this.ripplePos.push(new THREE.Vector2());
      this.rippleAge.push(99);
      this.rippleAmp.push(0);
    }

    this.c1.copy(MOODS[0].c1);
    this.c2.copy(MOODS[0].c2);
    this.c3.copy(MOODS[0].c3);

    this.material = new THREE.ShaderMaterial({
      vertexShader: liquidVert,
      fragmentShader: liquidFrag,
      uniforms: {
        uTime: { value: 0 },
        uRes: { value: new THREE.Vector2(1, 1) },
        uEnergy: { value: 0 },
        uBass: { value: 0 },
        uMid: { value: 0 },
        uTreble: { value: 0 },
        uC1: { value: this.c1 },
        uC2: { value: this.c2 },
        uC3: { value: this.c3 },
        uHueShift: { value: 0 },
        uSwirl: { value: 0 },
        uFlowDir: { value: this.flowDir },
        uShape: { value: 0.5 },
        uRipplePos: { value: this.ripplePos },
        uRippleAge: { value: this.rippleAge },
        uRippleAmp: { value: this.rippleAmp },
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

  private spawnRipple(x: number, y: number, amp: number) {
    const i = this.rippleCursor % RIPPLES;
    this.ripplePos[i].set(x, y);
    this.rippleAge[i] = 0;
    this.rippleAmp[i] = amp;
    this.rippleCursor++;
  }

  render(a: AudioData) {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    const u = this.material.uniforms;

    // --- fluid smoothing: ease uniforms slowly toward the audio bands ---
    this.sBass += (a.bass - this.sBass) * 0.06;
    this.sMid += (a.mid - this.sMid) * 0.06;
    this.sTreble += (a.treble - this.sTreble) * 0.08;
    this.sEnergy += (a.energy - this.sEnergy) * 0.03;
    u.uTime.value = t;
    u.uBass.value = this.sBass;
    u.uMid.value = this.sMid;
    u.uTreble.value = this.sTreble;
    u.uEnergy.value = this.sEnergy;

    // --- beats: instead of a brightness pulse, each beat recolors (hue walk),
    //     glides the flow in a new direction, and nudges the shape morph ---
    for (let i = 0; i < RIPPLES; i++) this.rippleAge[i] += dt;
    if (a.beat > 0.6 && !this.beatLatch) {
      this.beatLatch = true;
      // small random hue step -> color keeps changing over the song
      this.hueTarget += (Math.random() - 0.5) * 0.9;
      // gentle directional glide (smooth, decays over ~1s) -> different movement
      const ang = Math.random() * Math.PI * 2;
      this.flowDir.x += Math.cos(ang) * 0.12;
      this.flowDir.y += Math.sin(ang) * 0.12;
      // vary the rotation speed and direction a touch
      this.swirlRate += (Math.random() - 0.5) * 0.05;
      // a soft traveling ripple for texture
      const rad = 0.6 + Math.random() * 1.4;
      this.spawnRipple(Math.cos(ang) * rad, Math.sin(ang) * rad, 0.12 + a.beat * 0.08);
    } else if (a.beat < 0.3) {
      this.beatLatch = false;
    }
    if (a.bigBeat > 0.6 && !this.bigLatch) {
      this.bigLatch = true;
      this.hueTarget += (Math.random() - 0.5) * 1.4; // bigger color shift
      this.shapePhase += 1.1; // jump the shape morph -> different shapes
      this.spawnRipple(0, 0, 0.32); // large, slow centered swell
    } else if (a.bigBeat < 0.3) {
      this.bigLatch = false;
    }

    // ease color + motion so beats glide instead of snapping
    this.hueTarget += dt * 0.06; // slow continuous drift on top of beat steps
    this.hueShift += (this.hueTarget - this.hueShift) * 0.05;
    this.swirlRate += (0.03 - this.swirlRate) * 0.01; // relax back toward baseline
    this.swirl += this.swirlRate * dt * (1 + this.sEnergy);
    this.flowDir.multiplyScalar(0.94); // glide decays smoothly
    this.flowDir.clampLength(0, 1.1);
    this.shapePhase += dt * (0.05 + this.sMid * 0.06);
    const shapeTarget = THREE.MathUtils.clamp(
      0.5 + 0.4 * Math.sin(this.shapePhase) + 0.25 * (this.sMid - 0.3),
      0,
      1
    );
    this.shape += (shapeTarget - this.shape) * 0.03;

    u.uHueShift.value = this.hueShift;
    u.uSwirl.value = this.swirl;
    u.uShape.value = this.shape;
    u.uRippleAge.value = this.rippleAge;
    u.uRippleAmp.value = this.rippleAmp;

    // --- mood drift: color follows the song's spectral character over time ---
    this.moodDrift += dt * 0.02;
    const target =
      a.tilt * (MOODS.length - 1) * 0.7 +
      (0.5 + 0.5 * Math.sin(this.moodDrift)) * (MOODS.length - 1) * 0.3;
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
