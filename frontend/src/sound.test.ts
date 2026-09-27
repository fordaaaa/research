// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { isSoundEnabled, playBoot, playSuccess, setSoundEnabled } from "./sound";

afterEach(() => {
  try {
    localStorage.removeItem("notaeo:sound");
  } catch {
    // storage unavailable — nothing to clear.
  }
  vi.unstubAllGlobals();
});

describe("sound staging", () => {
  it("stays on by default (owner decision; Settings mutes)", () => {
    expect(isSoundEnabled()).toBe(true);
  });

  it("stays on when storage is unavailable", () => {
    expect(isSoundEnabled()).toBe(true);
  });

  it("persists the user toggle", () => {
    setSoundEnabled(true);
    expect(isSoundEnabled()).toBe(true);
    setSoundEnabled(false);
    expect(isSoundEnabled()).toBe(false);
  });

  it("does nothing when muted, even with an AudioContext available", () => {
    const osc = { connect: vi.fn(), start: vi.fn(), stop: vi.fn(), frequency: { value: 0 } };
    const gain = { connect: vi.fn(), gain: { value: 0 } };
    const ctx = { createOscillator: vi.fn(() => osc), createGain: vi.fn(() => gain), currentTime: 0, destination: {} };
    vi.stubGlobal("AudioContext", vi.fn(() => ctx));
    setSoundEnabled(false);
    playBoot();
    playSuccess();
    expect(ctx.createOscillator).not.toHaveBeenCalled();
  });
});
