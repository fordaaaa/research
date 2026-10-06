// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); vi.resetModules(); });
it("keeps success and preview cues brief, low-pitched, and quiet without a sustained plateau", async () => {
  const voices: { type: string; frequency: { setValueAtTime: ReturnType<typeof vi.fn> }; stop: ReturnType<typeof vi.fn> }[] = [];
  const gains: { setValueAtTime: ReturnType<typeof vi.fn>; exponentialRampToValueAtTime: ReturnType<typeof vi.fn> }[] = [];
  const context = { state: "running", currentTime: 0, destination: {}, createOscillator: () => {
    const oscillator = { type: "", frequency: { setValueAtTime: vi.fn() }, stop: vi.fn(), start: vi.fn(), connect: vi.fn() };
    voices.push(oscillator); return oscillator;
  }, createGain: () => { const gain = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }; gains.push(gain); return { gain, connect: vi.fn() }; } };
  class FakeAudioContext { constructor() { return context; } }
  vi.stubGlobal("AudioContext", FakeAudioContext);
  const { playSuccess, previewChime } = await import("./sound");
  playSuccess(); playSuccess("celebration"); previewChime();
  expect(voices.length).toBeGreaterThan(0);
  for (const voice of voices) {
    expect(voice.type).toBe("sine");
    expect(voice.frequency.setValueAtTime.mock.calls[0][0]).toBeLessThanOrEqual(450);
    expect(voice.stop.mock.calls[0][0]).toBeLessThanOrEqual(0.3);
  }
  for (const gain of gains) {
    expect(Math.max(...gain.exponentialRampToValueAtTime.mock.calls.map(([level]) => level))).toBeLessThanOrEqual(0.025);
    expect(gain.setValueAtTime.mock.calls.every(([level]) => level <= 0.0001)).toBe(true);
  }
});
