// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { search, setToken } from "./api";
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
it("uses authenticated related search and forwards cancellation", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock); setToken("test-search-token");
  const controller = new AbortController();
  await search("biology", "What is ATP?", controller.signal, true);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/notebooks/biology/search?q=What%20is%20ATP%3F&related=true");
  expect(init.signal).toBe(controller.signal);
  expect(new Headers(init.headers).get("Authorization")).toBe("Bearer test-search-token");
});
