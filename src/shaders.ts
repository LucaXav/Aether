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
uniform float uOverlay;  // 1 = transparent overlay: draw only the subject (no bg)

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
// Aspect-corrected, screen-centered coords with a "contain" fit: the SHORTER
// screen axis stays the [-0.5,0.5] reference and the LONGER axis is expanded,
// so the subject keeps its size and is never cropped at any window size/ratio.
vec2 aspect(vec2 uv) {
  vec2 p = uv - 0.5;
  if (uRes.x > uRes.y) p.x *= uRes.x / uRes.y;
  else                 p.y *= uRes.y / uRes.x;
  return p;
}
// Final pixel write. Normal mode = opaque (the black-background version).
// Overlay mode = premultiplied alpha keyed on coverage, so only the lit subject
// shows and the rest is transparent — works for every style.
void writeColor(vec3 col, float cov) {
  col = max(col, 0.0);
  if (uOverlay > 0.5) {
    cov = clamp(cov, 0.0, 1.0);
    gl_FragColor = vec4(col * cov, cov);
  } else {
    gl_FragColor = vec4(col, 1.0);
  }
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
  // overlay coverage: brighter ink = more opaque, dark/edge areas fade to clear
  float cov = clamp(dot(max(col, 0.0), vec3(0.34)) * 1.6, 0.0, 1.0);
  writeColor(col, cov);
}
`;

// --- Style: SLIME — a gooey raymarched metaball blob that wobbles to the beat ---
const SLIME_MAIN = /* glsl */ `
float h31(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123); }
float n3(vec3 p){
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(h31(i+vec3(0,0,0)), h31(i+vec3(1,0,0)), f.x),
        mix(h31(i+vec3(0,1,0)), h31(i+vec3(1,1,0)), f.x), f.y),
    mix(mix(h31(i+vec3(0,0,1)), h31(i+vec3(1,0,1)), f.x),
        mix(h31(i+vec3(0,1,1)), h31(i+vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm3(vec3 p){ float v=0.0, a=0.5; for(int i=0;i<3;i++){ v+=a*n3(p); p*=2.03; a*=0.5; } return v; }
float smin(float a, float b, float k){ float h=clamp(0.5+0.5*(b-a)/k, 0.0, 1.0); return mix(b,a,h) - k*h*(1.0-h); }

float mapSlime(vec3 p){
  float t = uTime;
  // gooey jiggle: wobble the sampling space, stronger on the beat
  float wob = 0.05 + uAccent * 0.12 + uEnergy * 0.04;
  p.xy += wob * vec2(sin(t*2.0 + p.z*3.0), cos(t*1.7 + p.y*3.0));
  // core blob; radius breathes with energy and swells on each beat
  float r = 0.82 + uEnergy * 0.12 + uAccent * 0.22;
  float d = length(p) - r;
  // lumpy gooey surface (animated 3D noise)
  float surf = fbm3(p * 1.7 + vec3(0.0, 0.0, t * 0.4));
  d -= (surf - 0.5) * (0.30 + uAccent * 0.30 + uShape * 0.15);
  // inner globs that orbit & merge with smooth-min -> stretchy splitting slime
  for(int i=0;i<3;i++){
    float fi = float(i);
    float a = t*(0.5 + 0.13*fi) + fi*2.4;
    vec3 c = vec3(cos(a), sin(a*1.1 + fi), sin(a*0.7)) * (0.7 + 0.12*sin(t+fi));
    float rb = 0.28 + 0.10*sin(t*1.4 + fi) + uAccent*0.12;
    d = smin(d, length(p - c) - rb, 0.40 + uShape*0.20);
  }
  return d;
}
vec3 nrmSlime(vec3 p){
  vec2 e = vec2(0.0025, 0.0);
  return normalize(vec3(
    mapSlime(p+e.xyy) - mapSlime(p-e.xyy),
    mapSlime(p+e.yxy) - mapSlime(p-e.yxy),
    mapSlime(p+e.yyx) - mapSlime(p-e.yyx)));
}
void main(){
  vec2 p = aspect(vUv);
  vec3 ro = vec3(0.0, 0.0, 3.0);
  // zoom > 1 widens the view so the blob sits centered with space around it
  float zoom = 1.8;
  vec3 rd = normalize(vec3(p * zoom, -1.7));

  float t = 0.0; float d = 0.0; float nearest = 1e9; bool hit = false;
  for(int i=0;i<64;i++){
    vec3 pos = ro + rd*t;
    d = mapSlime(pos);
    nearest = min(nearest, d);
    if(d < 0.0016){ hit = true; break; }
    t += d * 0.85;
    if(t > 6.0) break;
  }

  // shade the slime surface (only meaningful on a hit)
  vec3 slime = vec3(0.0);
  if(hit){
    vec3 pos = ro + rd*t;
    vec3 n = nrmSlime(pos);
    vec3 vd = normalize(-rd);
    vec3 ld = normalize(vec3(0.5, 0.8, 0.6));
    float diff = clamp(dot(n, ld), 0.0, 1.0);
    vec3 hv = normalize(ld + vd);
    float spec = pow(clamp(dot(n, hv), 0.0, 1.0), 50.0);      // wet glossy highlight
    float fres = pow(1.0 - clamp(dot(n, vd), 0.0, 1.0), 2.5); // translucent goo rim

    vec3 base = mix(uC1, uC2, 0.35 + 0.65*diff);
    base = mix(base, uC3, fres * 0.55);          // gooey rim glow
    base += uC3 * 0.14 * (0.5 + 0.5*diff);       // soft inner translucency
    // wet sheen — toned down + mostly tinted (not pure white) so it never blinds
    base += spec * 0.30 * mix(uC3, vec3(1.0), 0.25);
    base += uTreble * 0.05 * spec * uC3;
    slime = base;
  }

  if (uOverlay > 0.5) {
    // transparent overlay: draw ONLY the slime, with a soft anti-aliased edge.
    // Output is premultiplied alpha so it composites cleanly over anything.
    float cov = hit ? 1.0 : (1.0 - smoothstep(0.0, 0.02, nearest));
    vec3 col = max(hueShift(slime, uHueShift), 0.0);
    gl_FragColor = vec4(col * cov, cov);
  } else {
    float bgv = smoothstep(1.5, 0.0, length(p));
    vec3 col = hit ? slime : mix(uC1 * 0.22, uC1 * 0.65, bgv);
    col = hueShift(col, uHueShift);
    gl_FragColor = vec4(max(col, 0.0), 1.0);
  }
}
`;

// --- Style: BOKEH — soft floating orbs of light (dreamy, comforting) ---
const BOKEH_MAIN = /* glsl */ `
void main() {
  vec2 p = aspect(vUv);
  vec3 base = uC1 * 0.6;
  vec3 col = base;
  float glow = 0.0; // accumulated orb light -> overlay coverage
  // tempo + intensity nudge the orb drift — kept slow so they glide, not jitter
  float spd = 0.03 + uPace * 0.04 + uAggr * 0.06;

  // Spread the orbs over a stratified grid (one per cell, jittered inside it) so
  // they cover the whole screen evenly instead of clumping in a corner. The grid
  // is sized to the visible box at any window shape.
  vec2 ext = uRes.x > uRes.y ? vec2(uRes.x / uRes.y, 1.0) : vec2(1.0, uRes.y / uRes.x);
  vec2 spread = ext * 1.1;
  const float COLS = 8.0;
  const float ROWS = 6.0; // 8 x 6 = 48 orbs

  for (int i = 0; i < 48; i++) {
    float fi = float(i);
    float gx = mod(fi, COLS);
    float gy = floor(fi / COLS);
    float s1 = hash(vec2(fi, 1.3));
    float s2 = hash(vec2(fi, 7.7));
    float s3 = hash(vec2(fi, 3.1));
    // cell centre in [-0.5,0.5] + a sub-cell jitter, scaled to the visible box,
    // then the same gentle in-place orbit as before (movement unchanged).
    vec2 cell = vec2((gx + 0.5) / COLS, (gy + 0.5) / ROWS) - 0.5;
    vec2 jitter = (vec2(s1, s2) - 0.5) * vec2(0.85 / COLS, 0.85 / ROWS);
    vec2 c = (cell + jitter) * spread;
    c += 0.22 * vec2(
      sin(uTime * spd * (0.6 + s2) + s1 * 6.2831),
      cos(uTime * spd * (0.5 + s3) + s2 * 6.2831)
    );
    float rad = 0.12 + 0.24 * s3;
    float dd = length(p - c) / rad;
    // tighter falloff -> more defined orbs (less blurry); gentle beat lift
    float orb = exp(-dd * dd * 7.0) * (0.6 + 0.4 * uEnergy + uAccent * 0.25);
    col += mix(uC2, uC3, s1) * orb * 0.5;
    glow += orb;
  }

  col += uTreble * 0.10 * uC3;
  col = hueShift(col, uHueShift);
  col *= mix(0.55, 1.0, smoothstep(1.8, 0.2, length(p)));
  writeColor(col, glow);
}
`;

export interface VizStyle {
  name: string;
  frag: string;
}

export const STYLES: VizStyle[] = [
  { name: "slime", frag: PRELUDE + SLIME_MAIN },
  { name: "flow", frag: PRELUDE + FLOW_MAIN },
  { name: "bokeh", frag: PRELUDE + BOKEH_MAIN },
];
