import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true }, // o CORS do backend só libera a porta 5173
  test: {
    maxWorkers: 2, // Os testes de integração desenham milhares de pixels SVG.
    environment: "jsdom",
    setupFiles: ["./src/testes/configuracao.ts"],
  },
});
