// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { previewChime, setSoundEnabled } from "./sound";

afterEach(() => {
  try {
    localStorage.removeItem("notaeo:sound");
  } catch {
    // storage unavailable — nothing to clear.
  }
  try {
    // @ts-expect-error test-only teardown
    delete window.AudioContext;
  } catch {
    // nothing to clear.
  }
  vi.unstubAllGlobals();
});

function stubAudioContext() {
  const osc = { connect: vi.fn(), start: vi.fn(), stop: vi.fn(), frequency: { value: 0 } };
  const gain = { connect: vi.fn(), gain: { value: 0 } };
  const ctx = {
    createOscillator: vi.fn(() => osc),
    createGain: vi.fn(() => gain),
    currentTime: 0,
    destination: {},
  };
  // sound.ts constructs with `new`, so the stub must be a constructible
  // function (an arrow function would throw "not a constructor").
  function AudioContextStub(this: unknown) {
    return ctx;
  }
  Object.defineProperty(window, "AudioContext", { configurable: true, writable: true, value: vi.fn(AudioContextStub) });
  return ctx;
}

it("previewChime plays unconditionally, bypassing the muted gate", () => {
  const ctx = stubAudioContext();
  setSoundEnabled(false);
  previewChime();
  expect(ctx.createOscillator).toHaveBeenCalled();
});
