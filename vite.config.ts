import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: "web",
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
      "/ws": {
        target: "ws://localhost:4000",
        ws: true,
        // Suppress EPIPE / ECONNRESET when a proxied WebSocket closes abruptly
        configure: (proxy) => {
          proxy.on("error", (err) => {
            if (
              (err as NodeJS.ErrnoException).code === "EPIPE" ||
              (err as NodeJS.ErrnoException).code === "ECONNRESET"
            ) {
              // Expected when a WS client disconnects — safe to ignore
              return;
            }
            console.error("[ws proxy]", err.message);
          });
        },
      },
    },
  },
  build: {
    outDir: "../dist",
  },
});
