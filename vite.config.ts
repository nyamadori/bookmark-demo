import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/client",
    emptyOutDir: true
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8787",
      // Thumbnails are served by the API server, not by Vite's static files.
      "/ogp": "http://127.0.0.1:8787"
    }
  }
});
