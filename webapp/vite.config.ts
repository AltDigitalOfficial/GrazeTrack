import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  // Pull from .env / .env.local if you have it.
  // If you already use VITE_API_BASE_URL for your api helpers, this will match it.
  const env = loadEnv(mode, process.cwd(), "");
  const apiBase = (env.VITE_API_BASE_URL || "http://localhost:3001").replace(/\/+$/, "");

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    server: {
      proxy: {
        // Static images are served by the backend (Fastify), not Vite.
        "/images": {
          target: apiBase,
          changeOrigin: true,
        },
        "/api": {
          target: apiBase,
          changeOrigin: true,
        },

        // These are optional, but helpful if you're calling the backend with relative paths
        // (e.g. apiGet("/standard-medications/active")).
        "/standard-medications": {
          target: apiBase,
          changeOrigin: true,
        },
        "/medication-purchases": {
          target: apiBase,
          changeOrigin: true,
        },
        "/medications": {
          target: apiBase,
          changeOrigin: true,
        },
      },
    },
  };
});
