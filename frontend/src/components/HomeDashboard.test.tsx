// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const apiMock = vi.hoisted(() => ({
  getDashboard: vi.fn(),
  getClassroomStatus: vi.fn(),
  getUserReviewQueue: vi.fn(),
  createClass: vi.fn(),
  deleteClass: vi.fn(),
  createAssignment: vi.fn(),
  updateAssignment: vi.fn(),
  createNotebook: vi.fn(),
  deleteNotebook: vi.fn(),
  createDemo: vi.fn(),
}));

vi.mock("../api", () => apiMock);
vi.mock("../sound", () => ({
  playSuccess: vi.fn(),
  playBoot: vi.fn(),
  playTap: vi.fn(),
  isSoundEnabled: vi.fn(() => true),
  previewChime: vi.fn(),
}));

import HomeDashboard from "./HomeDashboard";
import type { DashboardSummary, QueuedCard } from "../api";

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  apiMock.getClassroomStatus.mockResolvedValue({
    enabled: false,
    connected: false,
    last_sync_at: null,
    reason: "not configured",
  });
});

const summary: DashboardSummary = {
  due_total: 2,
  due_by_notebook: [{ notebook_id: "nb1", notebook_name: "Bio", due: 2 }],
  streak: { current: 3, longest: 9, reviewed_today: false },
  calendar: Array.from({ length: 35 }, (_, i) => {
    const day = new Date(Date.UTC(2026, 8, 30 + i)).toISOString().slice(0, 10);
    return { day, assignments: [], card_due: [] };
  }),
  recent_notes: [],
  recent_sources: [],
  classes: [],
};

function renderDashboard() {
  return render(
    <HomeDashboard
      notebooks={[{ id: "nb1", name: "Bio", created_at: "2026-09-01T00:00:00Z" }]}
      userId="user-1"
      userName="sam"
      refreshToken={0}
      onOpen={vi.fn()}
      onCreate={vi.fn()}
      onDelete={vi.fn()}
      onStartReview={vi.fn()}
    />,
  );
}

it("renders due count, streak, and the Start review CTA", async () => {
  apiMock.getDashboard.mockResolvedValue(summary);
  renderDashboard();
  await screen.findByText("2 cards due today");
  await waitFor(() => expect(screen.getByText(/3-day streak/)).toBeTruthy());
  expect(screen.getByRole("button", { name: /Start reviewing 2 due cards/ })).toBeTruthy();
});

it("celebrates an empty queue as all caught up", async () => {
  apiMock.getDashboard.mockResolvedValue({ ...summary, due_total: 0 });
  renderDashboard();
  expect(await screen.findByText("All caught up. 🎉")).toBeTruthy();
});

it("Start review hands the queue and notebook names to App", async () => {
  apiMock.getDashboard.mockResolvedValue(summary);
  const queue: QueuedCard[] = [
    {
      card: { id: "c1", notebook_id: "nb1", front: "Q", back: "A", tags: [], created_at: "", updated_at: "", interval_days: 0, review_count: 0, due_at: "", last_reviewed_at: null },
      notebook_id: "nb1",
      notebook_name: "Bio",
    },
  ];
  apiMock.getUserReviewQueue.mockResolvedValue(queue);
  const onStartReview = vi.fn();
  render(
    <HomeDashboard
      notebooks={[]}
      userId="u"
      userName="sam"
      refreshToken={0}
      onOpen={vi.fn()}
      onCreate={vi.fn()}
      onDelete={vi.fn()}
      onStartReview={onStartReview}
    />,
  );
  await screen.findByText("2 cards due today");
  fireEvent.click(screen.getByRole("button", { name: /Start reviewing 2 due cards/ }));
  await waitFor(() =>
    expect(onStartReview).toHaveBeenCalledWith(queue, { c1: "Bio" }),
  );
});

it("hides the Classroom card when the server is not configured", async () => {
  apiMock.getDashboard.mockResolvedValue(summary);
  renderDashboard();
  await screen.findByText("2 cards due today");
  expect(screen.queryByText("Google Classroom")).toBeNull();
});

it("shows the Classroom card with a connect button when configured", async () => {
  apiMock.getClassroomStatus.mockResolvedValue({
    enabled: true,
    connected: false,
    last_sync_at: null,
    reason: null,
  });
  apiMock.getDashboard.mockResolvedValue(summary);
  renderDashboard();
  expect(await screen.findByText("Google Classroom")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Connect Google Classroom" })).toBeTruthy();
});
