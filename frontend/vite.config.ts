import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: {
    rollupOptions: {
      output: {
        // Recharts (with its d3 dependencies) and framer-motion together are
        // most of the bundle and change far less often than app code, so they
        // get their own long-cached chunks instead of one 1 MB blob.
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          charts: ["recharts"],
          motion: ["framer-motion"],
          query: ["@tanstack/react-query", "@tanstack/react-table"],
        },
      },
    },
  },
  server: {
    port: 5173,
    // The typed API client calls relative "/api/..." paths, so the dev server
    // proxies them to FastAPI. That keeps one origin in development (no
    // preflight round-trips) while CORS on the backend still covers the case
    // where the frontend is served from somewhere else entirely.
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
