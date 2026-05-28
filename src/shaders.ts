// Fullscreen quad: the vertex shader writes clip space directly.
export const fullscreenVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Shared fragment prelude: uniforms + noise + helpers. Every style declares the
// same uniform block (unused ones are harmless) so the visualizer can hot-swap
// the fragment shader without touching the uniform setup.
//
// Shared design rules across all styles:
//  - the frame is ANCHORED — never translate / rotate / zoom the whole field.
//  - beats change COLOR (hue rotation), never brightness or position.
//  - only the internal texture flows; uPace (tempo) sets how fast it flows.
const PRELUDE = /* glsl */ `
varying vec2 vUv;
uniform float uTime;
uniform vec2 uRes;
uniform float uEnergy;   // slow overall level
uniform float uMid;      // smoothed
uniform float uTreble;   // smoothed
uniform float uPace;     // 0..1 tempo -> motion speed
uniform float uAccent;   // 0..1 latest beat strength (snappy) -> direct hit
uniform float uAggr;     // 0..1 intensity -> turbulence / "angry" motion
uniform vec3 uC1;        // deep shadow
uniform vec3 uC2;        // body
uniform vec3 uC3;        // highlight
uniform float uHueShift; // beat-driven hue rotation (radians)
uniform float uShape;    // 0..1 in-place shape morph

float hash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.5);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
const mat2 M = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = M * p;
    a *= 0.5;
  }
  return v;
}
// Rotate a color's hue around the luminance axis: recolors without changing
// brightness, so beats shift color instead of flashing.
vec3 hueShift(vec3 c, float a) {
  const vec3 k = vec3(0.57735);
  float ca = cos(a);
  float sa = sin(a);
  return c * ca + cross(k, c) * sa + k * dot(k, c) * (1.0 - ca);
}
// aspect-corrected, screen-centered coordinates
vec2 aspect(vec2 uv) {
  vec2 p = uv - 0.5;
  p.x *= uRes.x / uRes.y;
  return p;
}
`;

// --- Style: FLOW — domain-warped liquid ink (calm, organic) ---
const FLOW_MAIN = /* glsl */ `
void main() {
  // bigger features (lower scale) -> thick, gooey blobs
  vec2 p = aspect(vUv) * 2.3;
  // slow, viscous flow; tempo/intensity nudge the pace only a little so it
  // oozes rather than churning fast (no quick up/down)
  float t = uTime * (0.035 + uPace * 0.03 + uAggr * 0.05);
  // thick domain warp = stretchy, slime-like folds; intensity adds turbulence
  float warp = mix(1.9, 2.5, uShape) + uAggr * 0.5;

  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t * 0.3));
  vec2 r = vec2(
    fbm(p + warp * q + vec2(1.7, 9.2) + t * 0.2),
    fbm(p + warp * q + vec2(8.3, 2.8) - t * 0.15)
  );
  float f = fbm(p + (warp + 0.4) * r);

  vec3 col = mix(uC1, uC2, smoothstep(0.05, 0.7, f));
  col = mix(col, uC3, smoothstep(0.5, 0.95, f) * (0.5 + 0.5 * length(r)));
  col = mix(col, uC3, uMid * 0.10 * smoothstep(0.3, 0.8, f));
  // wet sheen: a tight glossy highlight on the thickest globs -> slime look
  col += smoothstep(0.8, 0.96, f) * 0.22 * uC3;
  col += uTreble * 0.08 * smoothstep(0.6, 0.95, f) * uC3;

  col = hueShift(col, uHueShift);
  // steady brightness — no per-beat pulsing up/down
  col *= 0.85 + 0.45 * f;

  float d = length(aspect(vUv));
  col *= mix(0.45, 1.0, smoothstep(1.7, 0.2, d));
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;

// --- Style: AURORA — soft flowing ribbons/curtains of light (calm, dreamy) ---
const AURORA_MAIN = /* glsl */ `
void main() {
  vec2 p = aspect(vUv);
  float t = uTime * (0.04 + uPace * 0.03 + uAggr * 0.05);

  vec3 col = uC1 * 0.5;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    // each ribbon's centre line wavers with low-freq noise -> flowing curtain
    float yc = (fi / 4.0 - 0.5) * 1.0;
    float wav = (fbm(vec2(p.x * 1.4 + t + fi * 3.1, t * 0.5 + fi)) - 0.5) * 0.6;
    float w = 4.5 + uAggr * 2.0;                  // tight ribbons with dark gaps
    float band = exp(-pow((p.y - yc - wav) * w, 2.0));
    // colour drifts along the ribbon
    float cv = 0.25 + 0.7 * fbm(vec2(p.x * 0.9 + t * 0.6, fi * 2.0));
    col += mix(uC2, uC3, cv) * band * 0.5;
  }
  col += uTreble * 0.07 * uC3;

  col = hueShift(col, uHueShift);
  col *= mix(0.5, 1.0, smoothstep(1.8, 0.2, length(p)));
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;

// --- Style: BOKEH — soft floating orbs of light (dreamy, comforting) ---
const BOKEH_MAIN = /* glsl */ `
void main() {
  vec2 p = aspect(vUv);
  vec3 col = uC1 * 0.6;
  // tempo + intensity nudge the orb drift — kept slow so they glide, not jitter
  float spd = 0.03 + uPace * 0.04 + uAggr * 0.06;

  for (int i = 0; i < 16; i++) {
    float fi = float(i);
    float s1 = hash(vec2(fi, 1.3));
    float s2 = hash(vec2(fi, 7.7));
    float s3 = hash(vec2(fi, 3.1));
    // anchored spread + a small in-place orbit (the field never slides)
    vec2 c = vec2(
      (s1 - 0.5) * 2.2 + 0.22 * sin(uTime * spd * (0.6 + s2) + s1 * 6.2831),
      (s2 - 0.5) * 1.4 + 0.22 * cos(uTime * spd * (0.5 + s3) + s2 * 6.2831)
    );
    float rad = 0.14 + 0.26 * s3;
    float dd = length(p - c) / rad;
    // tighter falloff -> more defined orbs (less blurry); gentle beat lift
    float orb = exp(-dd * dd * 7.0) * (0.65 + 0.4 * uEnergy + uAccent * 0.25);
    col += mix(uC2, uC3, s1) * orb * 0.6;
  }

  col += uTreble * 0.10 * uC3;
  col = hueShift(col, uHueShift);
  col *= mix(0.55, 1.0, smoothstep(1.8, 0.2, length(p)));
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;

export interface VizStyle {
  name: string;
  frag: string;
}

export const STYLES: VizStyle[] = [
  { name: "flow", frag: PRELUDE + FLOW_MAIN },
  { name: "aurora", frag: PRELUDE + AURORA_MAIN },
  { name: "bokeh", frag: PRELUDE + BOKEH_MAIN },
];
