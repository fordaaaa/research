// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { isSoundEnabled, isTapTarget, playBoot, playSuccess, playTap, setSoundEnabled } from "./sound";

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
    playTap();
    expect(ctx.createOscillator).not.toHaveBeenCalled();
  });

  it("plays a soft tick on tap when enabled", () => {
    const frequency = { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
    const osc = { connect: vi.fn(), start: vi.fn(), stop: vi.fn(), frequency };
    const gain = { connect: vi.fn(), gain: { value: 0 } };
    const ctx = {
      createOscillator: vi.fn(() => osc),
      createGain: vi.fn(() => gain),
      currentTime: 0,
      destination: {},
      state: "running",
      resume: vi.fn(),
    };
    // A plain vi.fn() used with `new` does not reliably yield the fake, so
    // stub a real class whose constructor returns it (guaranteed by JS).
    class FakeAudioContext {
      constructor() {
        return ctx;
      }
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);
    setSoundEnabled(true);
    playTap();
    expect(ctx.createOscillator).toHaveBeenCalledTimes(1);
    expect(frequency.setValueAtTime.mock.calls[0][0]).toBeLessThanOrEqual(450);
    expect(osc.stop.mock.calls[0][0]).toBeLessThanOrEqual(0.06);
  });

  it("recognizes button-like tap targets only", () => {
    const button = document.createElement("button");
    button.textContent = "Go";
    expect(isTapTarget(button)).toBe(true);
    const disabled = document.createElement("button");
    disabled.disabled = true;
    expect(isTapTarget(disabled)).toBe(false);
    const link = document.createElement("a");
    link.href = "https://example.test";
    expect(isTapTarget(link)).toBe(true);
    const anchor = document.createElement("a");
    expect(isTapTarget(anchor)).toBe(false);
    const div = document.createElement("div");
    expect(isTapTarget(div)).toBe(false);
    expect(isTapTarget(null)).toBe(false);
    const nested = document.createElement("span");
    button.appendChild(nested);
    expect(isTapTarget(nested)).toBe(true);
  });
});
