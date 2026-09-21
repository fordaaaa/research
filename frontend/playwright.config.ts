import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Remote mode: point at a deployed frontend origin (which serves /api
// itself). Local mode (default): boot the repo's own FastAPI backend and
// Vite frontend on loopback with an isolated throwaway data directory.
const remoteBase = (process.env.RESEARCH_E2E_BASE_URL ?? "").replace(/\/+$/, "");
const isRemote = remoteBase.length > 0;
const backendPort = 8000; // must match vite.config.ts proxy target
const webPort = Number(process.env.RESEARCH_E2E_WEB_PORT ?? 5173);
const baseURL = isRemote ? remoteBase : `http://127.0.0.1:${webPort}`;

// Isolated per-run data dir so local runs never touch backend/data/.
const dataDir = isRemote
  ? ""
  : mkdtempSync(join(tmpdir(), "research-e2e-"));

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "./test-results",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      // iPhone touch layout rendered with the WebKit engine.
      name: "iphone-webkit",
      use: { ...devices["iPhone 14"], browserName: "webkit" },
    },
    {
      // Pixel touch layout rendered with Chromium.
      name: "pixel-chromium",
      use: { ...devices["Pixel 7"], browserName: "chromium" },
    },
  ],
  webServer: isRemote
    ? []
    : [
        {
          command: `uv run uvicorn api.main:app --host 127.0.0.1 --port ${backendPort}`,
          cwd: "../backend",
          env: { RESEARCH_DATA_DIR: dataDir },
          url: `http://127.0.0.1:${backendPort}/api/health`,
          timeout: 120_000,
          reuseExistingServer: !process.env.CI,
          stdout: "pipe",
          stderr: "pipe",
        },
        {
          command: `npx vite --host 127.0.0.1 --port ${webPort} --strictPort`,
          url: baseURL,
          timeout: 120_000,
          reuseExistingServer: !process.env.CI,
          stdout: "pipe",
          stderr: "pipe",
        },
      ],
});
