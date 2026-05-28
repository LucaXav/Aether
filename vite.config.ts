import { defineConfig } from "vite";

// base: "./" keeps asset URLs relative so the build also works when loaded
// outside a web root (e.g. packaged in Electron / a wallpaper host).
export default defineConfig({
  base: "./",
});
