import type { Page } from "@playwright/test";

/** Mute only disposable test pages, including previews that bypass preferences. */
export async function silenceTestAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try { localStorage.setItem("notaeo:sound", "off"); } catch { /* unavailable origin */ }
    for (const name of ["AudioContext", "webkitAudioContext"]) {
      Object.defineProperty(window, name, { value: undefined, configurable: true, writable: true });
    }
  });
}
