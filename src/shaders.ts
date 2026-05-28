// GPU point particles. Positions are updated on the CPU each frame (flow field
// + beat bursts); the shader handles perspective sizing, soft round sprites,
// and color based on distance from the center + beat energy.
export const particleVert = /* glsl */ `
attribute float aRand;
uniform float uSize;
uniform float uTreble;
varying float vMix;
varying float vRand;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = length(position);
  vMix = clamp(dist / 48.0, 0.0, 1.0);
  vRand = aRand;
  float sz = uSize * (0.55 + aRand) * (1.0 + uTreble * 1.3);
  gl_PointSize = sz * (340.0 / -mv.z);
}
`;

export const particleFrag = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uBeat;
varying float vMix;
varying float vRand;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float alpha = smoothstep(0.5, 0.12, d); // tighter core, less overlap wash
  vec3 col = mix(uColorA, uColorB, vMix);
  col *= 0.22 + uBeat * 0.55 + vRand * 0.22;
  gl_FragColor = vec4(col, alpha);
}
`;
