// Fullscreen-quad vertex shader. We bypass the camera entirely and write clip
// space directly, so the plane always fills the screen regardless of camera.
export const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// "Nebula" preset: domain-warped fractal noise, colored with an Inigo Quilez
// cosine palette, energized by the audio bands and the beat pulse.
export const fragmentShader = /* glsl */ `
varying vec2 vUv;
uniform float uTime;
uniform vec2  uResolution;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uBeat;

vec3 palette(float t) {
  vec3 a = vec3(0.5);
  vec3 b = vec3(0.5);
  vec3 c = vec3(1.0);
  vec3 d = vec3(0.00, 0.33, 0.67);
  return a + b * cos(6.28318 * (c * t + d));
}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
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

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.55;
  for (int i = 0; i < 6; i++) {
    v += amp * noise(p);
    p = p * 2.0 + 1.7;
    amp *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = vUv - 0.5;
  uv.x *= uResolution.x / uResolution.y;

  float t = uTime * 0.12;
  float energy = uBass * 0.5 + uBeat * 0.5;

  // bass + beat pull the camera "in" for a breathing zoom
  float zoom = 3.0 - uBass * 0.9 - uBeat * 0.6;
  vec2 p = uv * zoom;

  // domain warping: noise drives the lookup of more noise
  float w = fbm(p + t);
  float n = fbm(p + 1.5 * w + vec2(t * 0.6, -t * 0.4) + uMid * 0.8);

  float shade = n + energy * 0.5;
  vec3 col = palette(shade * 0.7 + t * 0.1 + uTreble * 0.3);

  // colored core that flares on the beat (tone mapping keeps it from clipping)
  float d = length(uv);
  col += (0.05 + uBeat * 0.45) * exp(-d * 2.6) * vec3(0.65, 0.35, 1.0);

  // brightness rides the low end, with a clear kick on each beat
  col *= 0.5 + uBass * 0.45 + uBeat * 0.5;

  // vignette
  col *= smoothstep(1.2, 0.2, d);

  // Output linear color; tone mapping + sRGB happen in the OutputPass.
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;
