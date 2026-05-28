import { Color } from "three";

/** A distinct visual "look" the visualizer cycles through. */
export interface ScenePalette {
  name: string;
  bg: Color; // background / fog
  pA: Color; // particle color near center
  pB: Color; // particle color far out
  star: Color; // starfield tint
  struct: Color; // structure (core + shards) color
}

export const SCENES: ScenePalette[] = [
  {
    name: "aurora",
    bg: new Color(0x02030a),
    pA: new Color(0x16407a),
    pB: new Color(0x7be8ff),
    star: new Color(0xbfe3ff),
    struct: new Color(0x8a5cff),
  },
  {
    name: "ember",
    bg: new Color(0x0a0402),
    pA: new Color(0x7a2a16),
    pB: new Color(0xffd07b),
    star: new Color(0xffcaa0),
    struct: new Color(0xff5c8a),
  },
  {
    name: "orchid",
    bg: new Color(0x07020e),
    pA: new Color(0x5a167a),
    pB: new Color(0xff8ae8),
    star: new Color(0xe9b8ff),
    struct: new Color(0x6c7bff),
  },
  {
    name: "viridis",
    bg: new Color(0x02080a),
    pA: new Color(0x167a55),
    pB: new Color(0x9bffcf),
    star: new Color(0xb8ffe6),
    struct: new Color(0x5cffb0),
  },
];
