// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import type { Page } from "@playwright/test";
import { silenceTestAudio } from "../e2e/audio";
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); });
it("silences browser journeys including explicit previews without changing real user preferences", async () => {
  class AudioContext {};
  vi.stubGlobal("AudioContext", AudioContext);
  vi.stubGlobal("webkitAudioContext", AudioContext);
  const init = vi.fn(async (script: () => void) => script());
  await silenceTestAudio({ addInitScript: init } as unknown as Page);
  expect(init).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem("notaeo:sound")).toBe("off");
  expect(window.AudioContext).toBeUndefined();
  expect((window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext).toBeUndefined();
});
