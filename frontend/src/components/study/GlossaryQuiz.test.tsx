// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  listCards: vi.fn(),
  createCard: vi.fn(),
  updateCard: vi.fn(),
  deleteCard: vi.fn(),
  listDueCards: vi.fn(),
  reviewCard: vi.fn(),
  listCardSuggestions: vi.fn(),
  listGlossary: vi.fn(),
  listQuiz: vi.fn(),
  downloadCards: vi.fn(),
  getGuide: vi.fn(),
  getMindmap: vi.fn(),
}));

vi.mock("../../api", async () => {
  const actual = await vi.importActual<typeof import("../../api")>("../../api");
  return { ...actual, ...apiMocks };
});

import StudyPanel from "../StudyPanel";
import GlossarySection from "./GlossarySection";
import QuizSection from "./QuizSection";
import type { GlossaryEntry, QuizQuestion } from "../../api";

const NB = "nb22222222";

const entries: GlossaryEntry[] = [
  {
    term: "Mitosis",
    explanation: "Mitosis divides the nucleus into two identical sets during division.",
    source_id: "src00000001",
    source_title: "Cell biology",
    pages: [1],
    chunk_seq: 0,
  },
  {
    term: "Anaphase",
    explanation: "Sister chromatids split apart during anaphase of mitosis here.",
    source_id: "src00000001",
    source_title: "Cell biology",
    pages: [2],
    chunk_seq: 1,
  },
];

const questions: QuizQuestion[] = [
  {
    question_type: "short_answer",
    prompt: "What divides the nucleus into two identical sets?",
    answer: "Mitosis divides the nucleus into two identical sets.",
    term: "Mitosis",
    source_id: "src00000001",
    source_title: "Cell biology",
    pages: [1],
    chunk_seq: 0,
  },
  {
    question_type: "cloze",
    prompt: "Sister chromatids split apart during ____.",
    answer: "anaphase",
    term: "Anaphase",
    source_id: "src00000001",
    source_title: "Cell biology",
    pages: [2],
    chunk_seq: 1,
  },
];

function mockBase() {
  apiMocks.listCards.mockResolvedValue([]);
  apiMocks.listDueCards.mockResolvedValue([]);
  apiMocks.listCardSuggestions.mockResolvedValue([]);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("StudyPanel glossary + quiz slice", () => {
  it("lazy-loads the glossary only after its tab is selected", async () => {
    mockBase();
    apiMocks.listGlossary.mockResolvedValue(entries);
    apiMocks.listQuiz.mockResolvedValue(questions);
    render(<StudyPanel notebookId={NB} onSourcesChanged={() => undefined} />);

    expect(apiMocks.listGlossary).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: /glossary/i }));
    await waitFor(() => expect(apiMocks.listGlossary).toHaveBeenCalledWith(NB, 20));
    expect(await screen.findByText("Mitosis")).toBeTruthy();
  });

  it("filters glossary entries by text without refetching", async () => {
    mockBase();
    apiMocks.listGlossary.mockResolvedValue(entries);
    apiMocks.listQuiz.mockResolvedValue([]);
    render(<StudyPanel notebookId={NB} onSourcesChanged={() => undefined} />);

    fireEvent.click(screen.getByRole("tab", { name: /glossary/i }));
    await screen.findByText("Mitosis");

    fireEvent.change(screen.getByLabelText(/filter glossary/i), { target: { value: "anaphase" } });
    expect(screen.queryByText("Mitosis")).toBeNull();
    expect(screen.getByText("Anaphase")).toBeTruthy();
    expect(apiMocks.listGlossary).toHaveBeenCalledTimes(1);
  });

  it("creates a flashcard only on explicit user action with sensible tags", async () => {
    mockBase();
    apiMocks.listGlossary.mockResolvedValue(entries);
    apiMocks.listQuiz.mockResolvedValue([]);
    apiMocks.createCard.mockResolvedValue({ id: "card00000001" });
    render(<StudyPanel notebookId={NB} onSourcesChanged={() => undefined} />);

    fireEvent.click(screen.getByRole("tab", { name: /glossary/i }));
    await screen.findByText("Mitosis");
    expect(apiMocks.createCard).not.toHaveBeenCalled();

    const item = screen.getByText("Mitosis").closest("li")!;
    fireEvent.click(within(item).getByRole("button", { name: /make flashcard/i }));
    await waitFor(() => expect(apiMocks.createCard).toHaveBeenCalledTimes(1));
    const [nbId, body] = apiMocks.createCard.mock.calls[0] as unknown as [
      string,
      { front: string; back: string; tags: string[] },
    ];
    expect(nbId).toBe(NB);
    expect(body.front).toBe("Mitosis");
    expect(body.back).toMatch(/divides the nucleus/i);
    expect(body.tags).toContain("glossary");
  });

  it("copies a glossary entry and opens its source via callback", async () => {
    mockBase();
    apiMocks.listGlossary.mockResolvedValue(entries);
    apiMocks.listQuiz.mockResolvedValue([]);
    const onOpenSource = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<StudyPanel notebookId={NB} onSourcesChanged={() => undefined} onOpenSource={onOpenSource} />);

    fireEvent.click(screen.getByRole("tab", { name: /glossary/i }));
    await screen.findByText("Mitosis");

    const item = screen.getByText("Mitosis").closest("li")!;
    fireEvent.click(within(item).getByRole("button", { name: /open source/i }));
    expect(onOpenSource).toHaveBeenCalledWith("src00000001");

    fireEvent.click(within(item).getByRole("button", { name: /copy/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0] as string).toMatch(/Mitosis/);
  });

  it("shows glossary error and no-source states", async () => {
    mockBase();
    apiMocks.listGlossary.mockRejectedValueOnce(new Error("network down"));
    apiMocks.listQuiz.mockResolvedValue([]);
    render(<StudyPanel notebookId={NB} onSourcesChanged={() => undefined} />);

    fireEvent.click(screen.getByRole("tab", { name: /glossary/i }));
    expect(await screen.findByRole("alert")).toBeTruthy();

    cleanup();
    vi.clearAllMocks();
    mockBase();
    apiMocks.listGlossary.mockRejectedValueOnce(new Error("no source with readable text"));
    apiMocks.listQuiz.mockResolvedValue([]);
    render(<StudyPanel notebookId={NB} onSourcesChanged={() => undefined} />);
    fireEvent.click(screen.getByRole("tab", { name: /glossary/i }));
    expect(await screen.findByText(/add a source/i)).toBeTruthy();
  });

  it("states glossary and quiz are local/deterministic with no AI", async () => {
    mockBase();
    apiMocks.listGlossary.mockResolvedValue(entries);
    apiMocks.listQuiz.mockResolvedValue(questions);
    render(<StudyPanel notebookId={NB} onSourcesChanged={() => undefined} />);

    fireEvent.click(screen.getByRole("tab", { name: /glossary/i }));
    await screen.findByText("Mitosis");
    const glossRegion = screen.getByText("Mitosis").closest("section") ?? document.body;
    expect(glossRegion.textContent).toMatch(/deterministic|locally|no AI/i);

    fireEvent.click(screen.getByRole("tab", { name: /quiz/i }));
    await screen.findByText(/what divides the nucleus/i);
    const quizRegion = screen.getByText(/what divides the nucleus/i).closest("section") ?? document.body;
    expect(quizRegion.textContent).toMatch(/deterministic|locally|no AI/i);
    expect(quizRegion.textContent).not.toMatch(/AI-generated|powered by AI/i);
  });

  it("lazy-loads quiz, reveals answers, tracks score, and restarts without backend writes", async () => {
    mockBase();
    apiMocks.listGlossary.mockResolvedValue([]);
    apiMocks.listQuiz.mockResolvedValue(questions);
    render(<StudyPanel notebookId={NB} onSourcesChanged={() => undefined} />);

    expect(apiMocks.listQuiz).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: /quiz/i }));
    await waitFor(() => expect(apiMocks.listQuiz).toHaveBeenCalledWith(NB, 10));

    expect(await screen.findByText(/what divides the nucleus/i)).toBeTruthy();
    expect(screen.queryByText(/Mitosis divides the nucleus into two identical sets\./)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /show answer/i }));
    expect(screen.getByText(/Mitosis divides the nucleus into two identical sets\./)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /mark correct/i }));
    expect(screen.getByText(/score:\s*1 correct/i)).toBeTruthy();
    expect(screen.getByText(/question 2 of 2/i)).toBeTruthy();
    expect(apiMocks.createCard).not.toHaveBeenCalled();
    expect(apiMocks.reviewCard).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /show answer/i }));
    fireEvent.click(screen.getByRole("button", { name: /mark missed/i }));
    expect(screen.getByText(/score:\s*1 correct/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /restart/i }));
    expect(screen.getByText(/question 1 of 2/i)).toBeTruthy();
    expect(screen.getByText(/score:\s*0 correct/i)).toBeTruthy();
  });

  it("opens a quiz question source via callback and supports keyboard reveal", async () => {
    mockBase();
    apiMocks.listGlossary.mockResolvedValue([]);
    apiMocks.listQuiz.mockResolvedValue(questions);
    const onOpenSource = vi.fn();
    render(<StudyPanel notebookId={NB} onSourcesChanged={() => undefined} onOpenSource={onOpenSource} />);

    fireEvent.click(screen.getByRole("tab", { name: /quiz/i }));
    await screen.findByText(/what divides the nucleus/i);

    const reveal = screen.getByRole("button", { name: /show answer/i });
    reveal.focus();
    expect(document.activeElement).toBe(reveal);
    fireEvent.click(reveal);
    expect(screen.getByText(/Mitosis divides the nucleus/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /open source/i }));
    expect(onOpenSource).toHaveBeenCalledWith("src00000001");
  });

  it("shows quiz error and empty states", async () => {
    mockBase();
    apiMocks.listGlossary.mockResolvedValue([]);
    apiMocks.listQuiz.mockRejectedValueOnce(new Error("network down"));
    render(<StudyPanel notebookId={NB} onSourcesChanged={() => undefined} />);

    fireEvent.click(screen.getByRole("tab", { name: /quiz/i }));
    expect(await screen.findByRole("alert")).toBeTruthy();

    cleanup();
    vi.clearAllMocks();
    mockBase();
    apiMocks.listGlossary.mockResolvedValue([]);
    apiMocks.listQuiz.mockResolvedValueOnce([]);
    render(<StudyPanel notebookId={NB} onSourcesChanged={() => undefined} />);
    fireEvent.click(screen.getByRole("tab", { name: /quiz/i }));
    expect(await screen.findByText(/no questions/i)).toBeTruthy();
  });

  it("ignores a stale glossary reload after the notebook switches", async () => {
    mockBase();
    const OLD = "nb0000000o";
    const NEW = "nb0000000n";
    const stale: GlossaryEntry[] = [
      {
        term: "StaleTerm",
        explanation: "Stale explanation for the old notebook goes here.",
        source_id: "src00000001",
        source_title: "Old source",
        pages: [1],
        chunk_seq: 0,
      },
    ];
    const fresh: GlossaryEntry[] = [
      {
        term: "FreshTerm",
        explanation: "Fresh explanation for the new notebook goes here.",
        source_id: "src00000002",
        source_title: "New source",
        pages: [1],
        chunk_seq: 0,
      },
    ];
    let resolveStale!: (v: GlossaryEntry[]) => void;
    const stalePending = new Promise<GlossaryEntry[]>((resolve) => {
      resolveStale = resolve;
    });
    // Mount: old starts empty (shows Reload), new resolves fresh immediately.
    apiMocks.listGlossary.mockImplementation((nb: string) =>
      nb === NEW ? Promise.resolve(fresh) : Promise.resolve([]),
    );
    const { rerender } = render(<GlossarySection notebookId={OLD} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /reload/i })).toBeTruthy());

    // Reload for OLD pends; switch to NEW before it resolves.
    apiMocks.listGlossary.mockImplementation((nb: string) =>
      nb === NEW ? Promise.resolve(fresh) : stalePending,
    );
    fireEvent.click(screen.getByRole("button", { name: /reload/i }));
    rerender(<GlossarySection notebookId={NEW} />);
    await screen.findByText("FreshTerm");

    resolveStale(stale);
    await waitFor(() => expect(apiMocks.listGlossary).toHaveBeenCalledWith(NEW, 20));
    // Give the stale promise a chance to (incorrectly) paint.
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("StaleTerm")).toBeNull();
    expect(screen.getByText("FreshTerm")).toBeTruthy();
  });

  it("ignores a stale quiz reload after the notebook switches", async () => {
    mockBase();
    const OLD = "nb0000000o";
    const NEW = "nb0000000n";
    const stale: QuizQuestion[] = [
      {
        question_type: "short_answer",
        prompt: "Stale prompt for the old notebook here?",
        answer: "Stale answer for the old notebook here.",
        term: "Stale",
        source_id: "src00000001",
        source_title: "Old source",
        pages: [1],
        chunk_seq: 0,
      },
    ];
    const fresh: QuizQuestion[] = [
      {
        question_type: "short_answer",
        prompt: "Fresh prompt for the new notebook here?",
        answer: "Fresh answer for the new notebook here.",
        term: "Fresh",
        source_id: "src00000002",
        source_title: "New source",
        pages: [1],
        chunk_seq: 0,
      },
    ];
    let resolveStale!: (v: QuizQuestion[]) => void;
    const stalePending = new Promise<QuizQuestion[]>((resolve) => {
      resolveStale = resolve;
    });
    apiMocks.listQuiz.mockImplementation((nb: string) =>
      nb === NEW ? Promise.resolve(fresh) : Promise.resolve([]),
    );
    const { rerender } = render(<QuizSection notebookId={OLD} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /reload/i })).toBeTruthy());

    apiMocks.listQuiz.mockImplementation((nb: string) =>
      nb === NEW ? Promise.resolve(fresh) : stalePending,
    );
    fireEvent.click(screen.getByRole("button", { name: /reload/i }));
    rerender(<QuizSection notebookId={NEW} />);
    await screen.findByText(/fresh prompt/i);

    resolveStale(stale);
    await waitFor(() => expect(apiMocks.listQuiz).toHaveBeenCalledWith(NEW, 10));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/stale prompt/i)).toBeNull();
    expect(screen.getByText(/fresh prompt/i)).toBeTruthy();
  });

  it("ignores a stale StudyPanel refresh after the notebook switches", async () => {
    mockBase();
    const OLD = "nb0000000o";
    const NEW = "nb0000000n";
    const oldCard = {
      notebook_id: OLD,
      id: "card00000001",
      front: "OldFront",
      back: "OldBack",
      tags: [] as string[],
      created_at: "2026-09-20T00:00:00Z",
      updated_at: "2026-09-20T00:00:00Z",
      interval_days: 0,
      review_count: 0,
      due_at: "2026-09-20T00:00:00Z",
      last_reviewed_at: null,
    };
    const newCard = { ...oldCard, notebook_id: NEW, id: "card00000002", front: "NewFront", back: "NewBack" };
    const staleCard = { ...oldCard, id: "card00000009", front: "StaleFront", back: "StaleBack" };
    apiMocks.listCards.mockImplementation((nb: string) =>
      nb === NEW ? Promise.resolve([newCard]) : Promise.resolve([oldCard]),
    );
    apiMocks.listDueCards.mockResolvedValue([]);
    const { rerender } = render(<StudyPanel notebookId={OLD} onSourcesChanged={() => undefined} />);
    await screen.findByText("OldFront");

    let resolveStale!: (v: typeof oldCard[]) => void;
    const stalePending = new Promise<typeof oldCard[]>((resolve) => {
      resolveStale = resolve;
    });
    apiMocks.listCards.mockImplementation((nb: string) =>
      nb === NEW ? Promise.resolve([newCard]) : stalePending,
    );
    apiMocks.createCard.mockResolvedValueOnce({ id: "card00000010" } as never);
    fireEvent.change(screen.getByLabelText("Front"), { target: { value: "Trigger refresh?" } });
    fireEvent.change(screen.getByLabelText("Back"), { target: { value: "Trigger refresh back." } });
    fireEvent.click(screen.getByRole("button", { name: /add card/i }));

    rerender(<StudyPanel notebookId={NEW} onSourcesChanged={() => undefined} />);
    await screen.findByText("NewFront");

    resolveStale([staleCard]);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByText("StaleFront")).toBeNull();
    expect(screen.getByText("NewFront")).toBeTruthy();
  });

  it("clears the glossary copy-feedback timeout on unmount", async () => {
    mockBase();
    apiMocks.listGlossary.mockResolvedValue(entries);
    apiMocks.listQuiz.mockResolvedValue([]);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    render(<StudyPanel notebookId={NB} onSourcesChanged={() => undefined} />);

    fireEvent.click(screen.getByRole("tab", { name: /glossary/i }));
    await screen.findByText("Mitosis");
    const item = screen.getByText("Mitosis").closest("li")!;
    fireEvent.click(within(item).getByRole("button", { name: /^copy$/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(await within(item).findByRole("button", { name: /copied/i })).toBeTruthy();

    const callsBefore = clearSpy.mock.calls.length;
    cleanup();
    expect(clearSpy.mock.calls.length).toBeGreaterThan(callsBefore);
    clearSpy.mockRestore();
  });
});
