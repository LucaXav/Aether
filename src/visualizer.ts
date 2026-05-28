import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Starfield, Particles, Structures } from "./layers";
import { SCENES } from "./palette";
import type { AudioData } from "./audio";

export class Visualizer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private clock = new THREE.Clock();

  private star: Starfield;
  private particles: Particles;
  private structures: Structures;

  private sceneIdx = 0;
  private bigBeatCount = 0;
  private bigLatch = false;
  private camAngle = 0;
  private bg = new THREE.Color();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;

    this.scene = new THREE.Scene();
    this.bg.copy(SCENES[0].bg);
    this.scene.background = this.bg;
    this.scene.fog = new THREE.FogExp2(SCENES[0].bg.getHex(), 0.006);

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
    this.camera.position.set(0, 0, 40);

    this.star = new Starfield();
    this.particles = new Particles();
    this.structures = new Structures();
    this.scene.add(this.star.object, this.particles.object, this.structures.object);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      0.45, // strength
      0.6, // radius
      0.35 // threshold
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(a: AudioData) {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    // advance the look on the rising edge of a big beat (every 4th)
    if (a.bigBeat > 0.6 && !this.bigLatch) {
      this.bigLatch = true;
      this.bigBeatCount++;
      if (this.bigBeatCount % 4 === 0) {
        this.sceneIdx = (this.sceneIdx + 1) % SCENES.length;
      }
    } else if (a.bigBeat < 0.3) {
      this.bigLatch = false;
    }

    const S = SCENES[this.sceneIdx];
    this.bg.lerp(S.bg, 0.03);
    (this.scene.fog as THREE.FogExp2).color.copy(this.bg);

    // slow orbit, pulled in by bass / big beats; gentle vertical drift
    this.camAngle += dt * (0.06 + a.bass * 0.05);
    const r = 40 - a.bass * 4 - a.bigBeat * 6;
    this.camera.position.set(
      Math.sin(this.camAngle) * r,
      Math.sin(t * 0.15) * 10,
      Math.cos(this.camAngle) * r
    );
    this.camera.lookAt(0, 0, 0);
    this.camera.fov = 62 - a.beat * 5;
    this.camera.updateProjectionMatrix();

    this.star.update(dt, a, S.star);
    this.particles.update(dt, t, a, S.pA, S.pB);
    this.structures.update(dt, t, a, S.struct);

    this.composer.render();
  }
}
