// @vitest-environment jsdom
// Round 13 item 8 (api): login carries retry_after seconds parsed from the
// Retry-After header (delta-seconds or HTTP-date) on a RateLimitError.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { login, RateLimitError } from "./api";

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("round13 item8 api rate-limit parsing", () => {
  it("carries retry_after seconds from a delta-seconds Retry-After header", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "too many attempts" }), {
        status: 429,
        headers: { "Retry-After": "45" },
      }),
    ));
    const err = await login("student@example.test", "password123").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect((err as RateLimitError).retryAfterSeconds).toBe(45);
  });

  it("parses an HTTP-date Retry-After header into seconds", async () => {
    const date = new Date(Date.now() + 30_000).toUTCString();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "too many attempts" }), {
        status: 429,
        headers: { "Retry-After": date },
      }),
    ));
    const err = await login("student@example.test", "password123").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    const seconds = (err as RateLimitError).retryAfterSeconds;
    expect(seconds).not.toBeNull();
    expect(seconds as number).toBeGreaterThanOrEqual(0);
    expect(seconds as number).toBeLessThanOrEqual(60);
  });

  it("carries null retry_after when the header is absent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "too many attempts" }), { status: 429 }),
    ));
    const err = await login("student@example.test", "password123").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect((err as RateLimitError).retryAfterSeconds).toBeNull();
  });
});
