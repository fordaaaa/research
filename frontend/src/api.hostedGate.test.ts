// @vitest-environment jsdom
// Round 14 item 4: logged-out boot must not fetch hosted/status.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { getHostedAIStatus } from "./api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  window.localStorage.clear();
});

it("skips the hosted/status fetch without a token", async () => {
  window.localStorage.removeItem("research_token");
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ enabled: false }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }));
  vi.stubGlobal("fetch", fetchMock);
  const status = await getHostedAIStatus();
  expect(status.enabled).toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
});
