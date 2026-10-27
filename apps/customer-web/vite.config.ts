import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  plugins: [react()],
  envDir: fileURLToPath(new URL("../..", import.meta.url)),
  server: { port: 5171, strictPort: true, proxy: { "/api": "http://localhost:3000" } },
});
