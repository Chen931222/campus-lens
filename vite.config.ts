import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        withdraw: resolve(import.meta.dirname, "demo/withdraw.html"),
        buildKb: resolve(import.meta.dirname, "demo/build-kb.html"),
      },
    },
  },
});
