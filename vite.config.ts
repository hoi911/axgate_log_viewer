import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      name: "electron-no-crossorigin",
      transformIndexHtml(html) {
        return html.replace(/ crossorigin/g, "");
      },
    },
    {
      name: "drop-legacy-woff",
      generateBundle(_opts, bundle) {
        for (const [fileName, file] of Object.entries(bundle)) {
          if (fileName.endsWith(".woff") && !fileName.endsWith(".woff2")) {
            delete bundle[fileName];
            continue;
          }
          if (file.type === "asset" && fileName.endsWith(".css")) {
            const css = typeof file.source === "string" ? file.source : Buffer.from(file.source).toString("utf8");
            file.source = css
              .replace(/,url\([^)]+\.woff\) format\(["']woff["']\)/g, "")
              .replace(/url\([^)]+\.woff\) format\(["']woff["']\),?/g, "");
          }
        }
      },
    },
  ],
  publicDir: false,
  build: {
    target: "chrome128",
    sourcemap: false,
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    reportCompressedSize: false,
    modulePreload: false,
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      allow: [path.resolve(__dirname), path.resolve(__dirname, "adb_ex")],
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 20000,
  },
});
