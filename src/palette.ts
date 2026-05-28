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
  { name: "abyss", c1: new Color(0x040814), c2: new Color(0x123a6b), c3: new Color(0x6fe0ff) },
  { name: "tide", c1: new Color(0x04140f), c2: new Color(0x10674a), c3: new Color(0x8effc8) },
  { name: "ink", c1: new Color(0x0a0414), c2: new Color(0x46197a), c3: new Color(0xff9cf0) },
  { name: "ember", c1: new Color(0x140703), c2: new Color(0x7a2f12), c3: new Color(0xffd58a) },
];
