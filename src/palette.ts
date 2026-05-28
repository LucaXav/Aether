import { Color } from "three";

/**
 * A "mood" = a 3-stop gradient for the liquid field (deep shadow -> body ->
 * bright filament). The visualizer crossfades continuously between these based
 * on the song's spectral tilt + energy, so the color drifts as the music
 * changes instead of switching on the beat.
 */
export interface Mood {
  name: string;
  c1: Color; // deep shadow / background
  c2: Color; // main body
  c3: Color; // bright filament / highlight
}

export const MOODS: Mood[] = [
  { name: "abyss", c1: new Color(0x0a1830), c2: new Color(0x1f5aa8), c3: new Color(0x7fe9ff) },
  { name: "tide", c1: new Color(0x06241a), c2: new Color(0x149a6e), c3: new Color(0x9bffd6) },
  { name: "reef", c1: new Color(0x06222a), c2: new Color(0x1f97a8), c3: new Color(0xc6ff7a) },
  { name: "ink", c1: new Color(0x1a0a2e), c2: new Color(0x6a2bb0), c3: new Color(0xff9cf0) },
  { name: "magma", c1: new Color(0x230827), c2: new Color(0xc0327f), c3: new Color(0xffc46b) },
  { name: "ember", c1: new Color(0x2a0f08), c2: new Color(0xb24a1e), c3: new Color(0xffd58a) },
  { name: "dusk", c1: new Color(0x141033), c2: new Color(0x5a45c0), c3: new Color(0xffb38a) },
];
