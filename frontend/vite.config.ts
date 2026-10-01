import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    // Rotas por arquivo em src/routes (mesmo padrão do Cliente Plus).
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5174,
    // Aceita acesso de outros aparelhos da rede (ex.: celular no mesmo Wi-Fi).
    host: true,
    // Tudo que começa com /api vai para o backend (Quarkus, porta 3002).
    proxy: { "/api": { target: "http://localhost:3002", changeOrigin: false } },
  },
});
