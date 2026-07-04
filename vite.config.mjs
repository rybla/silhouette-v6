import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";
import packageConfig from "./package.json";

export default defineConfig({
  plugins: [react()],

  base: `/${packageConfig.name}/`,

  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./vitest.setup.mjs",
  },

  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
  },

  resolve: {
    tsconfigPaths: true,
  },
});
