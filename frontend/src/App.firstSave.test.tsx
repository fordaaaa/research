// @vitest-environment jsdom
// Round 12 item 4: the FIRST source saved in a notebook must produce an
// assertive "First source saved" announcement; later saves must not repeat it,
// and opening a notebook that already has sources must stay silent.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  me: vi.fn(),
  listNotebooks: vi.fn(),
  listSources: vi.fn(),
  addPaste: vi.fn(),
  getAISettings: vi.fn(),
  getHostedAIStatus: vi.fn(),
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
  id: "s1", notebook_id: "nb1", kind: "paste", title: "Cells", tags: [],
  meta: {}, created_at: "2026-01-01T00:00:00Z", chunk_count: 1,
};

function authAs(userId: string, notebooks: { id: string; name: string }[], sources: unknown[]) {
  window.localStorage.setItem("research_token", `${userId}-token`);
  window.localStorage.setItem(`notaeo:onboarding:${userId}`, "done");
  apiMocks.me.mockResolvedValue({ id: userId, email: `${userId}@example.test` });
  apiMocks.listNotebooks.mockResolvedValue(
    notebooks.map((notebook) => ({ ...notebook, created_at: "2026-01-01T00:00:00Z" })),
  );
  apiMocks.listSources.mockResolvedValue(sources);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
}

async function pasteText(text: string) {
  // The editor stays open after a save: only expand it when collapsed.
  if (!screen.queryByPlaceholderText("Paste your text here…")) {
    fireEvent.click(await screen.findByRole("button", { name: /paste text instead/i }));
  }
  fireEvent.change(screen.getByPlaceholderText("Paste your text here…"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: /save source/i }));
}

it("announces the first source save assertively", async () => {
  authAs("r12i4-user", [{ id: "nb1", name: "Biology" }], []);
  apiMocks.addPaste.mockResolvedValue({ saved: true });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Biology" }));
  apiMocks.listSources.mockResolvedValue([SOURCE]);
  await pasteText("Cells divide in mitosis daily");

  const alert = await screen.findByRole("alert", { name: "Save announcement" });
  await waitFor(() => expect(alert.textContent ?? "").toMatch(/first source saved/i));
});

it("does not repeat the announcement on later saves", async () => {
  authAs("r12i4c-user", [{ id: "nb1", name: "Biology" }], []);
  apiMocks.addPaste.mockResolvedValue({ saved: true });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Biology" }));
  apiMocks.listSources.mockResolvedValue([SOURCE]);
  await pasteText("Cells divide in mitosis daily");
  const alert = await screen.findByRole("alert", { name: "Save announcement" });
  await waitFor(() => expect(alert.textContent ?? "").toMatch(/first source saved/i));
  const firstText = alert.textContent;

  // A second save grows the library but must not re-announce.
  apiMocks.listSources.mockResolvedValue([SOURCE, { ...SOURCE, id: "s2", title: "Tissue" }]);
  await pasteText("Tissues group cells together daily");
  await screen.findByText("Tissue");
  expect(alert.textContent).toBe(firstText);
});

it("does not announce when opening a notebook that already has sources", async () => {
  authAs("r12i4b-user", [{ id: "nb1", name: "Biology" }], [SOURCE]);
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Biology" }));
  await screen.findByText("Cells");
  expect(screen.queryByRole("alert", { name: "Save announcement" })).toBeNull();
});
