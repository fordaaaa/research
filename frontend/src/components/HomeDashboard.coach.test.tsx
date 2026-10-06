// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import HomeDashboard from "./HomeDashboard";

vi.mock("../api", async () => ({
  ...await vi.importActual<typeof import("../api")>("../api"),
  getDashboard: vi.fn(async () => ({ due_total: 0, classes: [], calendar: [], recent_notes: [], recent_sources: [], streak: null })),
  getClassroomStatus: vi.fn(async () => ({ enabled: false, connected: false })),
}));

afterEach(cleanup);

const biology = { id: "biology", name: "Biology", created_at: "2026-10-01T00:00:00Z" };
const chemistry = { id: "chemistry", name: "Chemistry", created_at: "2026-10-01T00:00:00Z" };

it("opens the selected course notebook in the exam coach", () => {
  const onOpenCoach = vi.fn();
  render(<HomeDashboard notebooks={[biology, chemistry]} userId="student" userName="Sam"
    refreshToken={0} onOpen={vi.fn()} onOpenCoach={onOpenCoach}
    onCreate={vi.fn()} onDelete={vi.fn()} onStartReview={vi.fn()} />);

  expect(screen.getByRole("heading", { name: "Know what to study next." })).toBeTruthy();
  fireEvent.change(screen.getByRole("combobox", { name: "Exam course notebook" }), { target: { value: chemistry.id } });
  fireEvent.click(screen.getByRole("button", { name: "Plan exam revision" }));
  expect(onOpenCoach).toHaveBeenCalledWith(chemistry);
});

it("asks for a notebook before starting exam preparation", () => {
  render(<HomeDashboard notebooks={[]} userId="student" userName="Sam"
    refreshToken={0} onOpen={vi.fn()} onOpenCoach={vi.fn()}
    onCreate={vi.fn()} onDelete={vi.fn()} onStartReview={vi.fn()} />);

  expect((screen.getByRole("button", { name: "Plan exam revision" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText("Create a course notebook below to start." )).toBeTruthy();
});
