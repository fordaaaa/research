// @vitest-environment jsdom
// Round 23 item 3 (FAILING first): the App-level announcement region is named
// collision-free ("Site announcements", never /notebook/i) so it cannot clash
// with the "Notebook name" input in /notebook/i queries; the name input keeps
// its explicit <label>.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return {
    ...actual,
    googleStatus: vi.fn().mockResolvedValue({ enabled: false, client_id: null }),
  };
});

import App from "./App";
import NotebookPicker from "./components/NotebookPicker";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
});

it("announcement region name never matches /notebook/i", async () => {
  window.localStorage.removeItem("research_token");
  render(<App />);
  const region = await screen.findByRole("status", { name: "Site announcements" });
  expect(region.getAttribute("aria-live")).toBe("polite");
  expect(region.getAttribute("aria-atomic")).toBe("true");
  // No status region may carry a notebook-colliding name.
  expect(screen.queryByRole("status", { name: /notebook/i })).toBeNull();
});

it("the notebook-name input keeps its explicit label (queries stay unique)", () => {
  render(
    <NotebookPicker notebooks={[]} onOpen={vi.fn()} onCreate={vi.fn()} onDelete={vi.fn()} />,
  );
  // Explicit <label htmlFor>, not a bare placeholder/aria-label.
  expect(screen.getByLabelText("Notebook name")).toBeTruthy();
});
