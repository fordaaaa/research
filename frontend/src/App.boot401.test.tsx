// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

// NOTE: no ./api mock here — the real api.ts runs against a stubbed fetch so
// we can observe exactly which requests fire before authentication.
import AuthPanel from "./components/AuthPanel";
import App from "./App";

const AUTHED_PATTERNS = [
  "/api/auth/me",
  "/api/auth/logout",
  "/api/notebooks",
  "/api/sources",
  "/api/settings/ai",
  "/api/ai/hosted",
  "/api/demo",
  "/api/skills",
  "/api/humanize",
  "/api/web/search",
];

function stubFetch() {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    return new Response(JSON.stringify({ enabled: false, client_id: null }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  window.localStorage.clear();
});

it("fires zero requests to authed endpoints before login (App)", async () => {
  window.localStorage.removeItem("research_token");
  const calls = stubFetch();

  render(<App />);
  await waitFor(() => expect(screen.getByRole("heading", { name: /create your account|sign in/i })).toBeTruthy());
  // Let any boot effects settle (StrictMode double-invokes effects in dev).
  await new Promise((resolve) => setTimeout(resolve, 50));

  const authed = calls.filter((url) => AUTHED_PATTERNS.some((pattern) => url.includes(pattern)));
  expect(authed).toEqual([]);
});

it("fires zero requests to authed endpoints before login (AuthPanel)", async () => {
  window.localStorage.removeItem("research_token");
  const calls = stubFetch();

  render(<AuthPanel onAuthed={vi.fn()} />);
  await new Promise((resolve) => setTimeout(resolve, 50));

  const authed = calls.filter((url) => AUTHED_PATTERNS.some((pattern) => url.includes(pattern)));
  expect(authed).toEqual([]);
});
