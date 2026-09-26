import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Dev-only API target for the /api proxy (no production impact: the
// packaged app talks to its loopback sidecar, not Vite).
const apiTarget = process.env.VITE_API_TARGET ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": apiTarget,
    },
  },
  // Round 25 item 8: bare `npx vitest run` must not collect the Playwright
  // specs under e2e/ (they run via `npm run e2e`). The defaults are restated
  // because `exclude` replaces (not extends) vitest's built-in list.
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/cypress/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,eslint,prettier}-config.*",
      "e2e/**",
    ],
  },
});

