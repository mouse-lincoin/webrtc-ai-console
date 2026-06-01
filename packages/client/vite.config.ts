import { defineConfig } from "vite";

const repoBase = "/webrtc-ai-console/";

export default defineConfig({
  base: process.env.GITHUB_PAGES === "true" ? repoBase : "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    host: true,
  },
});
