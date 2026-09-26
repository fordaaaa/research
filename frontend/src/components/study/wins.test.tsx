// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const studyApiMocks = vi.hoisted(() => ({
  listCards: vi.fn(),
  listDueCards: vi.fn(),
  listCardSuggestions: vi.fn(),
  downloadCards: vi.fn(),
  getMindmap: vi.fn(),
  downloadMindmap: vi.fn(),
  reviewCard: vi.fn(),
  listQuiz: vi.fn(),
  listGlossary: vi.fn(),
}));

vi.mock("../../api", async () => {
  const actual = await vi.importActual<typeof import("../../api")>("../../api");
  return { ...actual, ...studyApiMocks };
});
vi.mock("../../sound", () => ({
  playSuccess: vi.fn(),
  isSoundEnabled: vi.fn(() => true),
}));

import { playSuccess } from "../../sound";
import StudyPanel from "../StudyPanel";
import ReviewSession from "./ReviewSession";
import QuizSection from "./QuizSection";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const card = {
  id: "c1",
  notebook_id: "nb",
  front: "Q",
  back: "A",
  tags: [],
  review_count: 0,
  interval_days: 0,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  due_at: "2026-01-01",
  last_reviewed_at: null,
};

it("card export + mindmap export fire playSuccess", async () => {
  studyApiMocks.listCards.mockResolvedValue([card]);
  studyApiMocks.listDueCards.mockResolvedValue([]);
  studyApiMocks.downloadCards.mockResolvedValue(undefined);
  studyApiMocks.getMindmap.mockResolvedValue({ name: "root", children: [] });
  render(<StudyPanel notebookId="nb" onSourcesChanged={vi.fn()} />);
  await waitFor(() => expect(screen.getByText("Q")).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: /export for anki/i }));
  await waitFor(() => expect(studyApiMocks.downloadCards).toHaveBeenCalled());
  expect(playSuccess).toHaveBeenCalled();

  vi.clearAllMocks();
  studyApiMocks.downloadMindmap.mockResolvedValue(undefined);
  fireEvent.click(screen.getByRole("tab", { name: "Mind map" }));
  await waitFor(() => expect(studyApiMocks.getMindmap).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: /export \(.md\)/i }));
  await waitFor(() => expect(studyApiMocks.downloadMindmap).toHaveBeenCalled());
  expect(playSuccess).toHaveBeenCalled();
});

it("review finished branch fires playSuccess", async () => {
  studyApiMocks.reviewCard.mockResolvedValue({ ...card, review_count: 1 });
  render(
    <ReviewSession notebookId="nb" initialQueue={[card]} onExit={vi.fn()} />,
  );
  fireEvent.click(screen.getByRole("button", { name: /show answer/i }));
  fireEvent.click(screen.getByRole("button", { name: /^good$/i }));
  await waitFor(() => expect(screen.getByText(/review complete/i)).toBeTruthy());
  expect(playSuccess).toHaveBeenCalled();
});

it("quiz finished branch fires playSuccess", async () => {
  studyApiMocks.listQuiz.mockResolvedValue([
    {
      term: "ATP",
      prompt: "What stores energy?",
      answer: "ATP",
      question_type: "short",
      source_id: "s1",
      source_title: "Bio",
      chunk_seq: 0,
      pages: [1],
    },
  ]);
  render(<QuizSection notebookId="nb" />);
  await waitFor(() => expect(screen.getByText(/what stores energy/i)).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: /show answer/i }));
  fireEvent.click(screen.getByRole("button", { name: /mark correct/i }));
  await waitFor(() => expect(screen.getByText(/session done/i)).toBeTruthy());
  expect(playSuccess).toHaveBeenCalled();
});
