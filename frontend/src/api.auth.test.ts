// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getToken, googleLogin, login, setToken } from "./api";

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("login failures", () => {
  it("shows a useful generic credentials error without treating it as an expired session", async () => {
    setToken("existing-token");
    const seen: string[] = [];
    const handler = () => seen.push("unauthorized");
    window.addEventListener("research:unauthorized", handler);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "wrong email or password" }), { status: 401 }),
    ));

    try {
      await expect(login("student@example.com", "wrong-password")).rejects.toThrow("Incorrect email or password");
      expect(seen).toEqual([]);
      expect(getToken()).toBe("existing-token");
    } finally {
      window.removeEventListener("research:unauthorized", handler);
    }
  });

  it("reports a rejected Google credential without an expired-session event", async () => {
    const seen: string[] = [];
    const handler = () => seen.push("unauthorized");
    window.addEventListener("research:unauthorized", handler);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "invalid Google credential" }), { status: 401 }),
    ));

    try {
      await expect(googleLogin("invalid-token")).rejects.toThrow("Google sign-in failed");
      expect(seen).toEqual([]);
    } finally {
      window.removeEventListener("research:unauthorized", handler);
    }
  });
});
