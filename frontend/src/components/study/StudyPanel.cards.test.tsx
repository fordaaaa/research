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
  downloadCards: vi.fn(),
  getGuide: vi.fn(),
  getMindmap: vi.fn(),
}));

vi.mock("../../api", async () => {
  const actual = await vi.importActual<typeof import("../../api")>("../../api");
  return { ...actual, ...apiMocks };
});

import StudyPanel from "../StudyPanel";
import type { CardSuggestion, Flashcard } from "../../api";

const NB = "nb11111111";

function card(overrides: Partial<Flashcard> & { id: string }): Flashcard {
  return {
    notebook_id: NB,
    front: "Front",
    back: "Back",
    tags: [],
    created_at: "2026-09-20T00:00:00Z",
    updated_at: "2026-09-20T00:00:00Z",
    interval_days: 0,
    review_count: 0,
    due_at: "2026-09-20T00:00:00Z",
    last_reviewed_at: null,
    ...overrides,
  };
}

const bioCard = card({ id: "card00000001", front: "What splits in anaphase?", back: "Sister chromatids.", tags: ["bio"] });
const chemCard = card({ id: "card00000002", front: "What is pH?", back: "Acidity measure.", tags: ["chem"] });

const draft: CardSuggestion = {
  front: "What is ATP?",
  back: "Cellular energy carrier.",
  source_id: "src00000001",
  source_title: "Cell biology",
  pages: [1],
  chunk_seq: 2,
};

function mockDeck(cards: Flashcard[] = [bioCard, chemCard], due: Flashcard[] = [bioCard]) {
  apiMocks.listCards.mockResolvedValue(cards);
  apiMocks.listDueCards.mockResolvedValue(due);
  apiMocks.listCardSuggestions.mockResolvedValue([]);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("StudyPanel flashcards v2", () => {
  it("creates a card with tags", async () => {
    mockDeck();
    apiMocks.createCard.mockResolvedValue(card({ id: "card00000003" }));
    render(<StudyPanel notebookId={NB} onSourcesChanged={() => undefined} />);

    await screen.findByText("What splits in anaphase?");
    fireEvent.change(screen.getByLabelText(/front/i), { target: { value: "New question?" } });
    fireEvent.change(screen.getByLabelText(/back/i), { target: { value: "New answer." } });
    fireEvent.change(screen.getByLabelText(/tags/i), { target: { value: "bio, mitosis" } });
    fireEvent.click(screen.getByRole("button", { name: /add card/i }));

    await waitFor(() =>
      expect(apiMocks.createCard).toHaveBeenCalledWith(
        NB,
        expect.objectContaining({ front: "New question?", back: "New answer." }),
      ),
    );
    const payload = apiMocks.createCard.mock.calls[0][1] as { tags: string[] };
    expect(payload.tags.join(",")).toMatch(/bio/);
    expect(payload.tags.join(",")).toMatch(/mitosis/);
  });

  it("edits front/back/tags of an existing card", async () => {
    mockDeck();
    apiMocks.updateCard.mockResolvedValue({ ...bioCard, front: "Edited front?" });
    render(<StudyPanel notebookId={NB} onSourcesChanged={() => undefined} />);

    await screen.findByText("What splits in anaphase?");
    const deckItem = screen.getByText("What splits in anaphase?").closest("li")!;
    fireEvent.click(within(deckItem).getByRole("button", { name: /edit/i }));

    fireEvent.change(screen.getByLabelText(/edit front/i), { target: { value: "Edited front?" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(apiMocks.updateCard).toHaveBeenCalledWith(
        NB,
        bioCard.id,
        expect.objectContaining({ front: "Edited front?" }),
      ),
    );
  });

  it("filters the deck by text or tag", async () => {
    mockDeck();
    render(<StudyPanel notebookId={NB} onSourcesChanged={() => undefined} />);

    await screen.findByText("What splits in anaphase?");
    fireEvent.change(screen.getByPlaceholderText(/filter by text or tag/i), {
      target: { value: "acidity" },
    });
    expect(screen.queryByText("What splits in anaphase?")).toBeNull();
    expect(screen.getByText("What is pH?")).toBeTruthy();
  });

  it("loads source-grounded drafts but saves nothing until the user acts", async () => {
    mockDeck();
    apiMocks.listCardSuggestions.mockResolvedValue([draft]);
    render(<StudyPanel notebookId={NB} onSourcesChanged={() => undefined} />);

    await screen.findByText("What splits in anaphase?");
    fireEvent.click(screen.getByRole("button", { name: /load drafts/i }));

    await waitFor(() => expect(apiMocks.listCardSuggestions).toHaveBeenCalledWith(NB, 5));
    expect(await screen.findByText("What is ATP?")).toBeTruthy();
    expect(apiMocks.createCard).not.toHaveBeenCalled();

    apiMocks.createCard.mockResolvedValue(card({ id: "card00000009", front: draft.front, back: draft.back }));
    const draftRegion = screen.getByText("What is ATP?").closest("li")!;
    fireEvent.click(within(draftRegion).getByRole("button", { name: /save/i }));
    await waitFor(() =>
      expect(apiMocks.createCard).toHaveBeenCalledWith(
        NB,
        expect.objectContaining({ front: draft.front, back: draft.back }),
      ),
    );
  });

  it("never implies drafts are AI-generated", async () => {
    mockDeck();
    apiMocks.listCardSuggestions.mockResolvedValue([draft]);
    render(<StudyPanel notebookId={NB} onSourcesChanged={() => undefined} />);

    await screen.findByText("What splits in anaphase?");
    fireEvent.click(screen.getByRole("button", { name: /load drafts/i }));
    await screen.findByText("What is ATP?");

    const section = screen.getByText("What is ATP?").closest("section") ?? document.body;
    expect(section.textContent).toMatch(/your sources/i);
    expect(section.textContent).not.toMatch(/AI-generated|generated by AI|powered by AI/i);
  });

  it("shows a delete error and keeps the card", async () => {
    mockDeck();
    apiMocks.deleteCard.mockRejectedValue(new Error("network down"));
    render(<StudyPanel notebookId={NB} onSourcesChanged={() => undefined} />);

    await screen.findByText("What splits in anaphase?");
    const deckItem = screen.getByText("What splits in anaphase?").closest("li")!;
    fireEvent.click(within(deckItem).getByRole("button", { name: /delete/i }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("What splits in anaphase?")).toBeTruthy();
  });

  it("offers a due-review entry point backed by the due queue", async () => {
    mockDeck();
    render(<StudyPanel notebookId={NB} onSourcesChanged={() => undefined} />);

    expect(await screen.findByRole("button", { name: /review due/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /review due/i }));
    await waitFor(() => expect(apiMocks.listDueCards).toHaveBeenCalled());
  });

  it("preserves the Anki export action", async () => {
    mockDeck();
    render(<StudyPanel notebookId={NB} onSourcesChanged={() => undefined} />);

    expect(await screen.findByRole("button", { name: /export for anki/i })).toBeTruthy();
  });
});
