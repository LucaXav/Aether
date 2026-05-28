// Fullscreen quad: the vertex shader writes clip space directly.
export const liquidVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Flowing "liquid light" field: animated Inigo-Quilez-style domain warping so
// the surface is always undulating. Audio shapes it gently — beats rotate the
// HUE (color shifts, not brightness flashes), nudge the flow direction, and
// morph the shapes, while continuous drift + swirl keep it moving across the
// screen. Wavy and liquid, never punchy.
export const liquidFrag = /* glsl */ `
varying vec2 vUv;
uniform float uTime;
uniform vec2 uRes;
uniform float uEnergy;   // smoothed overall level (slow)
uniform float uBass;     // smoothed
uniform float uMid;      // smoothed
uniform float uTreble;   // smoothed
uniform vec3 uC1;        // deep shadow
uniform vec3 uC2;        // body
uniform vec3 uC3;        // highlight
uniform float uHueShift; // beat-driven hue rotation (radians)
uniform float uSwirl;    // slowly evolving rotation of the field
uniform vec2 uFlowDir;   // gliding drift impulse (beats push this)
uniform float uShape;    // 0..1 morph between blobby and filamentary
uniform vec2 uRipplePos[5];
uniform float uRippleAge[5];
uniform float uRippleAmp[5];

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

// Rotate a color's hue around the luminance axis — shifts color without
// touching brightness (so beats recolor the scene instead of flashing it).
vec3 hueShift(vec3 c, float a) {
  const vec3 k = vec3(0.57735);
  float ca = cos(a);
  float sa = sin(a);
  return c * ca + cross(k, c) * sa + k * dot(k, c) * (1.0 - ca);
}

void main() {
  vec2 uv = vUv;
  vec2 p = (uv - 0.5);
  p.x *= uRes.x / uRes.y;
  p *= 3.0;

  // base flow always moves; energy only nudges the pace
  float t = uTime * (0.05 + uEnergy * 0.05);

  // --- evolving movement: slow drift across the screen + beat glide ---
  p += uFlowDir + 0.45 * vec2(sin(uTime * 0.045), cos(uTime * 0.061));

  // gentle, evolving rotation with a soft vortex toward the center
  float ang = uSwirl + 0.18 * sin(uTime * 0.05);
  ang += 0.35 * exp(-length(p) * 0.7);
  float cs = cos(ang), sn = sin(ang);
  p = mat2(cs, -sn, sn, cs) * p;

  // soft ripples (waves traveling across the liquid)
  vec2 disp = vec2(0.0);
  for (int i = 0; i < 5; i++) {
    if (uRippleAmp[i] > 0.001) {
      vec2 dv = p - uRipplePos[i];
      float dist = length(dv) + 1e-4;
      float age = uRippleAge[i];
      float wave = sin(dist * 4.5 - age * 3.5) * exp(-dist * 1.1) * exp(-age * 0.8) * uRippleAmp[i];
      disp += (dv / dist) * wave;
    }
  }

  // shape morph: the warp scale + strength breathe between blobby and stringy
  float freq = mix(0.85, 1.3, uShape);
  float warp = mix(1.5, 2.4, uShape);
  vec2 sp = p * freq;

  // domain warping (flowing ink / aurora)
  vec2 q = vec2(
    fbm(sp + disp + vec2(0.0, t)),
    fbm(sp + disp + vec2(5.2, 1.3) - t * 0.3)
  );
  vec2 r = vec2(
    fbm(sp + warp * q + vec2(1.7, 9.2) + t * 0.2),
    fbm(sp + warp * q + vec2(8.3, 2.8) - t * 0.15)
  );
  float f = fbm(sp + (warp + 0.4) * r + disp * 1.5);

  // color comes from the flowing field, not the beat
  vec3 col = mix(uC1, uC2, smoothstep(0.05, 0.7, f));
  col = mix(col, uC3, smoothstep(0.5, 0.95, f) * (0.5 + 0.5 * length(r)));

  // mid fills the body with a touch more color; treble shimmers the filaments
  col = mix(col, uC3, uMid * 0.10 * smoothstep(0.3, 0.8, f));
  col += uTreble * 0.12 * smoothstep(0.6, 0.95, f) * uC3;

  // beats rotate the hue: the whole scene recolors smoothly, no brightness pop
  col = hueShift(col, uHueShift);

  // lifted luminance floor so it's clearly visible (not near-black)
  col *= 0.85 + 0.42 * f + uBass * 0.12;

  // soft vignette for depth, but the edges never go fully black
  float d = length((uv - 0.5) * vec2(uRes.x / uRes.y, 1.0));
  col *= mix(0.45, 1.0, smoothstep(1.7, 0.2, d));

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;
