import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    hmr: {
      // Helps LAN devices (tablet/phone) connect websocket correctly.
      host: process.env.VITE_DEV_LAN_HOST || undefined,
      clientPort: 5173,
    },
    // Keep API on backend 3000, but expose it through same 5173 origin.
    // This allows tablets/phones to use only http://<server-ip>:5173.
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
  },
});
