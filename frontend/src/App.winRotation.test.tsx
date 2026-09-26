// @vitest-environment jsdom
// Round 17 item 4: the rotation rule covers ALL win regions (save / delete /
// export) — each clears on notebook switch AND when a newer win fires.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  me: vi.fn(),
  listNotebooks: vi.fn(),
  listSources: vi.fn(),
  addPaste: vi.fn(),
  deleteSource: vi.fn(),
  downloadNotebook: vi.fn(),
  getAISettings: vi.fn(),
  getHostedAIStatus: vi.fn(),
  googleStatus: vi.fn(),
}));

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, ...apiMocks };
});

vi.mock("./sound", () => ({
  playBoot: vi.fn(),
  playSuccess: vi.fn(),
  previewChime: vi.fn(),
  isSoundEnabled: vi.fn(() => true),
}));

import App from "./App";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

const SOURCE = {
  id: "s1",
  notebook_id: "nb1",
  kind: "paste",
  title: "Cells",
  tags: [],
  meta: {},
  created_at: "2026-01-01T00:00:00Z",
  chunk_count: 1,
};

async function openBiology() {
  window.localStorage.setItem("research_token", "r17i4-token");
  window.localStorage.setItem("notaeo:onboarding:r17i4-user", "done");
  apiMocks.me.mockResolvedValue({ id: "r17i4-user", email: "r17i4@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([
    { id: "nb1", name: "Biology", created_at: "2026-01-01T00:00:00Z" },
    { id: "nb2", name: "History", created_at: "2026-01-02T00:00:00Z" },
  ]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  apiMocks.googleStatus.mockResolvedValue({ enabled: false, client_id: null });
  apiMocks.addPaste.mockResolvedValue({ saved: true });
  apiMocks.downloadNotebook.mockResolvedValue({ blob: new Blob(), filename: "nb.zip" });
  apiMocks.deleteSource.mockResolvedValue(undefined);
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Biology" }));
  fireEvent.click(await screen.findByRole("button", { name: /paste text instead/i }));
  fireEvent.change(screen.getByLabelText(/paste body/i), {
    target: { value: "Cells divide in mitosis daily" },
  });
  apiMocks.listSources.mockResolvedValue([SOURCE]);
  fireEvent.click(screen.getByRole("button", { name: /save source/i }));
  await screen.findByLabelText("Save announcement");
}

it("export-win clears the save-win", async () => {
  await openBiology();
  expect(screen.queryByLabelText("Save announcement")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /export notebook/i }));
  await screen.findByText(/exported ✓/i);
  // Round 22 item 3: the shared save/export region now announces the export
  // win — the SAVE text is retired (rotation still holds).
  const region = screen.getByLabelText("Save announcement");
  expect(region.textContent).toMatch(/exported/i);
  expect(region.textContent).not.toMatch(/first source saved/i);
});

it("delete-win clears the export-win", async () => {
  await openBiology();
  fireEvent.click(screen.getByRole("button", { name: /export notebook/i }));
  await screen.findByText(/exported ✓/i);
  apiMocks.listSources.mockResolvedValue([]);
  fireEvent.click(screen.getByRole("button", { name: "Delete Cells" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm delete Cells" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Source announcement").textContent ?? "").toMatch(/deleted/i),
  );
  expect(screen.queryByText(/exported ✓/i)).toBeNull();
});

it("all wins clear on notebook switch", async () => {
  await openBiology();
  fireEvent.click(screen.getByRole("button", { name: /export notebook/i }));
  await screen.findByText(/exported ✓/i);
  fireEvent.click(screen.getByRole("button", { name: "Notaeo home" }));
  fireEvent.click(await screen.findByRole("button", { name: "Open History" }));
  await screen.findByRole("button", { name: /paste text instead/i });
  expect(screen.queryByLabelText("Save announcement")).toBeNull();
  // The source region always renders (sr-only); cleared means empty.
  expect(screen.queryByLabelText("Source announcement")?.textContent ?? "").toBe("");
  expect(screen.queryByText(/exported ✓/i)).toBeNull();
});
