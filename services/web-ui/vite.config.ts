import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const commerceTarget = process.env.VITE_COMMERCE_PROXY_TARGET ?? "http://localhost:3000";
const trackingTarget = process.env.VITE_TRACKING_PROXY_TARGET ?? "http://localhost:8081";
const workerTarget = process.env.VITE_WORKER_PROXY_TARGET ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api/products": commerceTarget,
      "/api/orders": commerceTarget,
      "/api/foods": trackingTarget,
      "/api/calories": trackingTarget,
      "/api/track": trackingTarget,
      "/api/worker": workerTarget,
    },
  },
  preview: {
    port: 4173,
  },
});
