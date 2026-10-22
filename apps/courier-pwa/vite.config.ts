import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: false,
      workbox: { globPatterns: ["**/*.{js,css,html,svg}"], navigateFallbackDenylist: [/^\/api\//] },
    }),
  ],
  server: { port: 5173, proxy: { "/api": "http://localhost:3000" } },
});
