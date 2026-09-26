// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    listCards: vi.fn().mockResolvedValue([]),
    listDueCards: vi.fn().mockResolvedValue([]),
  };
});

import StudyPanel from "./StudyPanel";

afterEach(() => cleanup());

it("moves focus to the panel heading with a live announcement on tab change", async () => {
  render(<StudyPanel notebookId="nb-1" onSourcesChanged={vi.fn()} />);
  fireEvent.click(screen.getByRole("tab", { name: "Quiz" }));
  const heading = await screen.findByRole("heading", { name: "Study section: Quiz" });
  expect(document.activeElement).toBe(heading);
  expect(screen.getByRole("status", { name: "Study section announcement" }).textContent).toMatch(/quiz/i);

  fireEvent.click(screen.getByRole("tab", { name: "Glossary" }));
  expect(await screen.findByRole("heading", { name: "Study section: Glossary" })).toBeTruthy();
  expect(document.activeElement).toBe(
    screen.getByRole("heading", { name: "Study section: Glossary" }),
  );
});
