import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// El backend por defecto corre en :8000. Se puede apuntar a otro puerto con
// VITE_API_PROXY (útil en desarrollo).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": process.env.VITE_API_PROXY || "http://localhost:8000",
    },
  },
});
