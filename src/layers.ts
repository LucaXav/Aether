import * as THREE from "three";
import { particleVert, particleFrag } from "./shaders";
import type { AudioData } from "./audio";

const R = 46; // world radius particles live within

function randomOnSphere(radius: number, out: Float32Array, i: number) {
  const th = Math.random() * Math.PI * 2;
  const ph = Math.acos(Math.random() * 2 - 1);
  const s = Math.sin(ph);
  out[i] = radius * s * Math.cos(th);
  out[i + 1] = radius * s * Math.sin(th);
  out[i + 2] = radius * Math.cos(ph);
}

/** Deep, slowly-drifting starfield for spatial depth. */
export class Starfield {
  object: THREE.Points;
  private mat: THREE.PointsMaterial;

  constructor(count = 1500) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      randomOnSphere(90 + Math.random() * 130, pos, i * 3);
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.mat = new THREE.PointsMaterial({
      size: 0.9,
      sizeAttenuation: true,
      color: 0xffffff,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
    });
    this.object = new THREE.Points(geo, this.mat);
  }

  update(dt: number, a: AudioData, color: THREE.Color) {
    this.object.rotation.y += dt * 0.008;
    this.object.rotation.x += dt * 0.003;
    this.mat.color.lerp(color, 0.04);
    this.mat.opacity = 0.22 + a.treble * 0.4;
  }
}

/** Thousands of particles streaming along a curl-ish 3D flow field. */
export class Particles {
  object: THREE.Points;
  private mat: THREE.ShaderMaterial;
  private geo: THREE.BufferGeometry;
  private pos: Float32Array;
  private burst: Float32Array;
  private count: number;

  constructor(count = 4000) {
    this.count = count;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(count * 3);
    this.burst = new Float32Array(count * 3);
    const rand = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      randomOnSphere(Math.random() * R, this.pos, i * 3);
      rand[i] = Math.random();
    }
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute("aRand", new THREE.BufferAttribute(rand, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uSize: { value: 1.8 },
        uTreble: { value: 0 },
        uBeat: { value: 0 },
        uColorA: { value: new THREE.Color(0x16407a) },
        uColorB: { value: new THREE.Color(0x7be8ff) },
      },
      vertexShader: particleVert,
      fragmentShader: particleFrag,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    this.object = new THREE.Points(this.geo, this.mat);
    this.object.frustumCulled = false;
  }

  private respawn(i: number) {
    randomOnSphere(Math.random() * 10, this.pos, i * 3);
    this.burst[i * 3] = this.burst[i * 3 + 1] = this.burst[i * 3 + 2] = 0;
  }

  update(dt: number, t: number, a: AudioData, cA: THREE.Color, cB: THREE.Color) {
    // ambient drift so the field always moves, not just on beats
    this.object.rotation.y += dt * 0.03;
    const pos = this.pos;
    const burst = this.burst;
    const flow = 1.3 + a.mid * 2.4;
    const speed = 1.6 + a.bass * 3.2;
    const impulse = (a.beat * 16 + a.bigBeat * 48) * dt;
    const maxSq = R * R * 1.4;

    for (let i = 0; i < this.count; i++) {
      const ix = i * 3;
      const iy = ix + 1;
      const iz = ix + 2;
      const x = pos[ix];
      const y = pos[iy];
      const z = pos[iz];

      // curl-ish flow field (cheap, organic swirling)
      const fx = Math.sin(y * 0.12 + t * 0.3) + Math.cos(z * 0.1 - t * 0.2);
      const fy = Math.sin(z * 0.12 + t * 0.25) + Math.cos(x * 0.1 + t * 0.22);
      const fz = Math.sin(x * 0.12 - t * 0.2) + Math.cos(y * 0.1 + t * 0.18);

      if (impulse > 0) {
        const inv = 1 / (Math.hypot(x, y, z) || 1);
        burst[ix] += x * inv * impulse;
        burst[iy] += y * inv * impulse;
        burst[iz] += z * inv * impulse;
      }
      burst[ix] *= 0.9;
      burst[iy] *= 0.9;
      burst[iz] *= 0.9;

      pos[ix] += (fx * flow * speed + burst[ix]) * dt;
      pos[iy] += (fy * flow * speed + burst[iy]) * dt;
      pos[iz] += (fz * flow * speed + burst[iz]) * dt;

      if (x * x + y * y + z * z > maxSq) this.respawn(i);
    }

    (this.geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    this.mat.uniforms.uTreble.value = a.treble;
    this.mat.uniforms.uBeat.value = a.beat;
    (this.mat.uniforms.uColorA.value as THREE.Color).lerp(cA, 0.04);
    (this.mat.uniforms.uColorB.value as THREE.Color).lerp(cB, 0.04);
  }
}

/** A wireframe core plus orbiting shards that explode outward on big beats. */
export class Structures {
  object: THREE.Group;
  private core: THREE.Mesh;
  private coreMat: THREE.MeshBasicMaterial;
  private shards: THREE.InstancedMesh;
  private shardMat: THREE.MeshBasicMaterial;
  private dirs: THREE.Vector3[] = [];
  private dummy = new THREE.Object3D();
  private explode = 0;
  private readonly N = 80;

  constructor() {
    this.object = new THREE.Group();

    this.coreMat = new THREE.MeshBasicMaterial({
      color: 0x8a5cff,
      wireframe: true,
      transparent: true,
      opacity: 0.5,
    });
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(7, 1), this.coreMat);
    this.object.add(this.core);

    this.shardMat = new THREE.MeshBasicMaterial({
      color: 0x8a5cff,
      wireframe: true,
      transparent: true,
      opacity: 0.85,
    });
    this.shards = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.8, 0),
      this.shardMat,
      this.N
    );
    for (let i = 0; i < this.N; i++) {
      this.dirs.push(
        new THREE.Vector3(
          Math.random() * 2 - 1,
          Math.random() * 2 - 1,
          Math.random() * 2 - 1
        ).normalize()
      );
    }
    this.object.add(this.shards);
  }

  update(dt: number, t: number, a: AudioData, color: THREE.Color) {
    this.core.rotation.x += dt * 0.15;
    this.core.rotation.y += dt * 0.22;
    this.core.scale.setScalar(1 + a.bass * 0.5 + a.bigBeat * 0.9);
    this.coreMat.color.lerp(color, 0.05);
    this.coreMat.opacity = 0.3 + a.mid * 0.5;
    this.shardMat.color.lerp(color, 0.05);

    // explode jumps on a big beat, then settles back
    this.explode = Math.max(this.explode * 0.94, a.bigBeat);

    const d = this.dummy;
    for (let i = 0; i < this.N; i++) {
      const dir = this.dirs[i];
      const rr = 11 + this.explode * 24 + Math.sin(t * 0.5 + i) * 0.7;
      d.position.set(dir.x * rr, dir.y * rr, dir.z * rr);
      d.rotation.set(t * 0.5 + i, t * 0.3 + i, 0);
      d.scale.setScalar(0.55 + a.treble * 0.8 + this.explode * 0.6);
      d.updateMatrix();
      this.shards.setMatrixAt(i, d.matrix);
    }
    this.shards.instanceMatrix.needsUpdate = true;
  }
}
