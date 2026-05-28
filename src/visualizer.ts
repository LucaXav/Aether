import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { vertexShader, fragmentShader } from "./shaders";
import type { AudioData } from "./audio";

export class Visualizer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private material: THREE.ShaderMaterial;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: true, // lets the canvas be snapshotted / recorded
    });
    // Tone mapping tames the bloom highlights so nothing blows out to white.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    // Camera transform is irrelevant — the vertex shader writes clip space.
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uBass: { value: 0 },
        uMid: { value: 0 },
        uTreble: { value: 0 },
        uBeat: { value: 0 },
      },
    });

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false; // shader repositions verts; don't let three cull it
    this.scene.add(quad);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      0.45, // strength
      0.5, // radius
      0.7 // threshold — only the brightest bits bloom
    );
    this.composer.addPass(this.bloom);
    // OutputPass applies tone mapping + sRGB conversion at the end of the chain.
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
    this.material.uniforms.uResolution.value.set(w, h); // only aspect matters
  }

  render(time: number, d: AudioData) {
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uBass.value = d.bass;
    u.uMid.value = d.mid;
    u.uTreble.value = d.treble;
    u.uBeat.value = d.beat;
    this.composer.render();
  }
}
