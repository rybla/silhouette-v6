import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";
import { defineConfig } from "vite";
import packageConfig from "./package.json";

// Plugin to copy built index.html for all static router entrypoints to support static hosting fallbacks
function multiPageEntrypointsPlugin() {
  return {
    name: "multi-page-entrypoints",
    closeBundle() {
      const routerPath = path.resolve(__dirname, "src/Router.tsx");
      if (!fs.existsSync(routerPath)) {
        console.warn(
          "src/Router.tsx not found, skipping multi-page entrypoints generation."
        );
        return;
      }

      const routerContent = fs.readFileSync(routerPath, "utf-8");
      const paths = [];
      const pathRegex = /path:\s*["'](\/[^"']*)["']/g;
      let match;
      while ((match = pathRegex.exec(routerContent)) !== null) {
        const routePath = match[1];
        // Ignore the root path as it is built as index.html
        if (routePath && routePath !== "/") {
          paths.push(routePath);
        }
      }

      const outDir = path.resolve(__dirname, "dist");
      const indexPath = path.resolve(outDir, "index.html");
      if (!fs.existsSync(indexPath)) {
        console.warn(
          "dist/index.html not found, skipping multi-page entrypoints generation."
        );
        return;
      }

      const indexContent = fs.readFileSync(indexPath, "utf-8");

      console.log(`\nGenerating fallback entrypoints in ${outDir}:`);
      for (const routePath of paths) {
        // Clean leading slash for directory/file naming
        const cleanPath = routePath.replace(/^\//, "");
        if (!cleanPath) continue;

        // 1. Generate clean [route].html file (e.g. TextualEmulatorV1.html)
        const htmlFilePath = path.resolve(outDir, `${cleanPath}.html`);
        fs.writeFileSync(htmlFilePath, indexContent, "utf-8");
        console.log(`  ✓ Created ${cleanPath}.html`);

        // 2. Generate [route]/index.html file (e.g. TextualEmulatorV1/index.html)
        const subDirPath = path.resolve(outDir, cleanPath);
        if (!fs.existsSync(subDirPath)) {
          fs.mkdirSync(subDirPath, { recursive: true });
        }
        const subIndexFilePath = path.resolve(subDirPath, "index.html");
        fs.writeFileSync(subIndexFilePath, indexContent, "utf-8");
        console.log(`  ✓ Created ${cleanPath}/index.html`);
      }
      console.log("");
    },
  };
}

export default defineConfig({
  plugins: [react(), multiPageEntrypointsPlugin()],

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
