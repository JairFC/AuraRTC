import { defineConfig } from "vite";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  build: {
    outDir: "src-tauri/src",
    emptyOutDir: false,
    lib: {
      entry: path.resolve(__dirname, "src-injector/main.ts"),
      name: "AuraRTCInjector",
      formats: ["iife"],
      fileName: () => "injector.bundle.js",
    },
  },
});
