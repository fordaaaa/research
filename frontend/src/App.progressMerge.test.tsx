// @vitest-environment jsdom
// Round 20 item 2 (FAILING first): GET /api/me/progress →
// {add_source, search, export, review}; App merges server OR local (sticky);
// missing endpoint falls back to local silently.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("./sound", () => ({ playSuccess: vi.fn() }));

import * as api from "./api";
import Checklist from "./components/Checklist";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("getProgress() hits /api/me/progress and returns flags", async () => {
  const stub = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ add_source: true, search: false, export: false, review: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", stub);
  const progress = await api.getProgress();
  expect(stub).toHaveBeenCalledWith("/api/me/progress", expect.anything());
  expect(progress).toEqual({ add_source: true, search: false, export: false, review: true });
});

it("server-true merged over local-false marks done (server OR local, sticky)", () => {
  // Simulates the App merge: merged = local || server.
  const server = { add_source: true, search: true, export: true, review: false };
  const local = { hasSource: false, hasSearched: false, hasExported: false };
  render(
    <Checklist
      userId="merge-user"
      hasNotebook
      hasSource={local.hasSource || server.add_source}
      hasSearched={local.hasSearched || server.search}
      hasExportedOrReviewed={local.hasExported || server.export || server.review}
    />,
  );
  expect(screen.getByRole("progressbar", { name: "4 of 4 steps complete" })).toBeTruthy();
});

it("missing endpoint falls back to local silently", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("not found", { status: 404, statusText: "Not Found" })),
  );
  // Old server: getProgress rejects; App catches → null → local derivation.
  await expect(api.getProgress()).rejects.toThrow();
  render(<Checklist userId="fallback-user" hasNotebook hasSource={false} hasSearched={false} hasExportedOrReviewed={false} />);
  expect(screen.getByText("1 of 4")).toBeTruthy();
});

it("local derivation still works without any server data", () => {
  render(<Checklist userId="local-user" hasNotebook hasSource hasSearched={false} hasExportedOrReviewed={false} />);
  expect(screen.getByText("2 of 4")).toBeTruthy();
});
