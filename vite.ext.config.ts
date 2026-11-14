import { defineConfig } from "vite";
import { resolve } from "node:path";
import { cpSync, existsSync, readFileSync } from "node:fs";

// Builds the Chrome extension into dist-ext/: one content script (IIFE) + its CSS + manifest.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist-ext",
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: resolve(import.meta.dirname, "src/ext/content.ts"),
      name: "CampusLens",
      formats: ["iife"],
      fileName: () => "content.js",
      cssFileName: "content",
    },
  },
  plugins: [
    {
      name: "copy-extension-files",
      closeBundle() {
        for (const f of ["manifest.json", "background.js"]) cpSync(resolve(import.meta.dirname, "ext", f), resolve(import.meta.dirname, "dist-ext", f));
        // The App Check debug token is for local development only and must never ship in the extension.
        const bundle = readFileSync(resolve(import.meta.dirname, "dist-ext/content.js"), "utf8");
        const tokenFile = resolve(import.meta.dirname, ".appcheck-debug-token.txt");
        const token = existsSync(tokenFile) ? readFileSync(tokenFile, "utf8").trim() : "";
        if (bundle.includes("FIREBASE_APPCHECK_DEBUG_TOKEN") || (token && bundle.includes(token))) {
          throw new Error("dist-ext/content.js contains App Check debug code or the debug token. Refusing to build.");
        }
      },
    },
  ],
});
