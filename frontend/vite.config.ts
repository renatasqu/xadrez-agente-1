import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  const url = process.env.VITE_API_URL ?? loadEnv(mode, process.cwd(), "VITE_").VITE_API_URL ?? "";
  if (mode === "production" && url) {
    let valid = /^\/(?!\/)/.test(url) && !/[?#\\]/.test(url);
    try {
      const parsed = new URL(url);
      valid = parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.search && !parsed.hash;
    } catch { /* Caminho relativo é validado acima. */ }
    if (!valid) throw new Error("VITE_API_URL de produção deve ser HTTPS ou caminho relativo como /api; vazio usa a mesma origem.");
  }
  return {
    plugins: [react(), tailwindcss()],
    server: { port: 5173, strictPort: true }, // o CORS do backend só libera a porta 5173
    test: {
      maxWorkers: 2, // Os testes de integração desenham milhares de pixels SVG.
      environment: "jsdom",
      setupFiles: ["./src/testes/configuracao.ts"],
    },
  };
});
