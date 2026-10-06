// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { SourceSummary } from "./api";

const apiMocks = vi.hoisted(() => ({ me: vi.fn(), listNotebooks: vi.fn(), listSources: vi.fn(), getAISettings: vi.fn(), getHostedAIStatus: vi.fn(), search: vi.fn() }));
vi.mock("./api", async () => ({ ...await vi.importActual<typeof import("./api")>("./api"), ...apiMocks }));
vi.mock("./sound", () => ({ playBoot: vi.fn(), playSuccess: vi.fn(), isSoundEnabled: () => false }));
import App from "./App";

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); window.localStorage.clear(); });

async function openNotebook() {
  window.localStorage.setItem("research_token", "test-token");
  apiMocks.me.mockResolvedValue({ id: "loading-user", email: "loading@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([{ id: "book", name: "Biology", created_at: "2026-01-01T00:00:00Z" }]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockResolvedValue({ enabled: false });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Biology" }));
}

it("loads sources once when opening a notebook", async () => {
  apiMocks.listSources.mockResolvedValue([]);
  await openNotebook();
  await waitFor(() => expect(apiMocks.listSources).toHaveBeenCalledTimes(1));
  expect(screen.queryByText("Opening notebook…")).toBeNull();
});

it("dismisses the opening overlay on returning home while a source fetch is pending", async () => {
  let resolve!: (sources: SourceSummary[]) => void;
  apiMocks.listSources.mockReturnValue(new Promise<SourceSummary[]>((done) => { resolve = done; }));
  await openNotebook();
  expect(screen.getByText("Opening notebook…")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Notaeo home" }));
  expect(screen.queryByText("Opening notebook…")).toBeNull();
  await act(async () => resolve([]));
  expect(screen.getByRole("button", { name: "Open Biology" })).toBeTruthy();
});

it("forwards source-search cancellation to the API client", async () => {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("min-width"), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.search.mockResolvedValue([]);
  await openNotebook();
  fireEvent.click(within(screen.getByRole("navigation", { name: "Workspace tools" })).getByRole("button", { name: "Search" }));
  const input = screen.getByRole("searchbox", { name: "Search your sources" });
  fireEvent.change(input, { target: { value: "q" } });
  fireEvent.submit(input.closest("form")!);
  await waitFor(() => expect(apiMocks.search).toHaveBeenCalledWith("book", "q", expect.any(AbortSignal)));
});
