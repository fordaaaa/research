// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import CalendarMonth from "./CalendarMonth";
import type { CalendarDay, StudyClass } from "../api";

afterEach(() => cleanup());

const TODAY = "2026-09-30";

function day(day: string, assignments: CalendarDay["assignments"] = [], cardCount = 0): CalendarDay {
  return {
    day,
    assignments,
    card_due: cardCount
      ? [{ notebook_id: "nb1", notebook_name: "Bio", count: cardCount }]
      : [],
  };
}

function klass(): StudyClass {
  return {
    id: "cls1",
    name: "Biology",
    color: "sea",
    source: "manual",
    external_id: "",
    created_at: "",
    updated_at: "",
  };
}

it("renders a Sunday-first grid with the month label", () => {
  render(
    <CalendarMonth
      days={[day(TODAY)]}
      today={TODAY}
      classes={[]}
      onCreateAssignment={vi.fn()}
      onToggleAssignment={vi.fn()}
    />,
  );
  expect(screen.getByText("September 2026")).toBeTruthy();
  expect(screen.getAllByRole("gridcell").length).toBeGreaterThanOrEqual(30);
});

it("marks today and shows dots for assignments and card dues", () => {
  const assignment = {
    id: "a1", class_id: "cls1", class_name: "Biology", title: "Lab report",
    details: "", due_at: `${TODAY}T23:59:00Z`, done: false, notebook_id: null,
    source: "manual" as const, external_id: "", created_at: "", updated_at: "",
  };
  render(
    <CalendarMonth
      days={[day(TODAY, [assignment], 4)]}
      today={TODAY}
      classes={[klass()]}
      onCreateAssignment={vi.fn()}
      onToggleAssignment={vi.fn()}
    />,
  );
  const todayCell = screen.getByRole("gridcell", { name: /4 cards due/ });
  expect(todayCell.textContent).toContain("30");
  expect(todayCell.querySelector("span.rounded-full")).toBeTruthy();
});

it("selects a day, lists its assignments, and creates a new one", async () => {
  const onCreateAssignment = vi.fn().mockResolvedValue(undefined);
  const assignment = {
    id: "a1", class_id: null, class_name: null, title: "Read ch. 5",
    details: "", due_at: `${TODAY}T23:59:00Z`, done: false, notebook_id: null,
    source: "manual" as const, external_id: "", created_at: "", updated_at: "",
  };
  render(
    <CalendarMonth
      days={[day(TODAY, [assignment])]}
      today={TODAY}
      classes={[]}
      onCreateAssignment={onCreateAssignment}
      onToggleAssignment={vi.fn()}
    />,
  );
  // today is preselected: its assignments are visible without a click
  expect(screen.getByText("Read ch. 5")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("New assignment title"), {
    target: { value: "Essay outline" },
  });
  fireEvent.keyDown(screen.getByLabelText("New assignment title"), { key: "Enter" });
  expect(onCreateAssignment).toHaveBeenCalledWith({
    title: "Essay outline",
    dueDay: TODAY,
    classId: null,
  });
});

it("toggles an assignment done from the day panel", async () => {
  const onToggle = vi.fn().mockResolvedValue(undefined);
  const assignment = {
    id: "a1", class_id: null, class_name: null, title: "Read ch. 5",
    details: "", due_at: `${TODAY}T23:59:00Z`, done: false, notebook_id: null,
    source: "manual" as const, external_id: "", created_at: "", updated_at: "",
  };
  render(
    <CalendarMonth
      days={[day(TODAY, [assignment])]}
      today={TODAY}
      classes={[]}
      onCreateAssignment={vi.fn()}
      onToggleAssignment={onToggle}
    />,
  );
  fireEvent.click(screen.getByLabelText("Mark Read ch. 5 done"));
  expect(onToggle).toHaveBeenCalledWith(assignment);
});

it("navigates months and dims days outside the data horizon", async () => {
  render(
    <CalendarMonth
      days={[day(TODAY)]}
      today={TODAY}
      classes={[]}
      onCreateAssignment={vi.fn()}
      onToggleAssignment={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByLabelText("Previous month"));
  expect(screen.getByText("August 2026")).toBeTruthy();
  // August days are outside the 35-day horizon: rendered but dimmed
  const grid = screen.getByRole("grid");
  expect(within(grid).getAllByRole("gridcell").some((cell) => cell.className.includes("opacity-40"))).toBe(
    true,
  );
});
