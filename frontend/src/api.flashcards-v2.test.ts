// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCard,
  listCardSuggestions,
  listDueCards,
  reviewCard,
  setToken,
  updateCard,
} from "./api";

const NOTEBOOK_ID = "abcdef123456";
const CARD_ID = "card00000001";
const TOKEN = "test-token-abc";

function stubFetch(res: Response) {
  const fetchMock = vi.fn().mockResolvedValue(res);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const baseCard = {
  id: CARD_ID,
  notebook_id: NOTEBOOK_ID,
  front: "What splits in anaphase?",
  back: "Sister chromatids.",
  tags: ["bio"],
  created_at: "2026-09-20T00:00:00Z",
  updated_at: "2026-09-20T00:00:00Z",
  interval_days: 2.5,
  review_count: 3,
  due_at: "2026-09-21T00:00:00Z",
  last_reviewed_at: "2026-09-20T12:00:00Z",
};

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("flashcards v2 API contracts", () => {
  it("createCard sends front/back/tags to the cards endpoint", async () => {
    setToken(TOKEN);
    const fetchMock = stubFetch(jsonResponse(baseCard, 201));

    const card = await createCard(NOTEBOOK_ID, {
      front: "What splits in anaphase?",
      back: "Sister chromatids.",
      tags: ["bio", "mitosis"],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/notebooks/${NOTEBOOK_ID}/cards`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      front: "What splits in anaphase?",
      back: "Sister chromatids.",
      tags: ["bio", "mitosis"],
    });
    expect(card.interval_days).toBe(2.5);
    expect(card.review_count).toBe(3);
    expect(card.due_at).toBe("2026-09-21T00:00:00Z");
  });

  it("updateCard PATCHes optional front/back/tags", async () => {
    setToken(TOKEN);
    const fetchMock = stubFetch(jsonResponse({ ...baseCard, front: "Edited?" }));

    const card = await updateCard(NOTEBOOK_ID, CARD_ID, {
      front: "Edited?",
      tags: ["bio"],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/notebooks/${NOTEBOOK_ID}/cards/${CARD_ID}`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ front: "Edited?", tags: ["bio"] });
    expect(card.front).toBe("Edited?");
  });

  it("listDueCards fetches the due queue with a default limit of 20", async () => {
    setToken(TOKEN);
    const fetchMock = stubFetch(jsonResponse([baseCard]));

    const due = await listDueCards(NOTEBOOK_ID);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/notebooks/${NOTEBOOK_ID}/cards/review?limit=20`);
    expect(due).toHaveLength(1);
    expect(due[0].id).toBe(CARD_ID);
  });

  it("listDueCards respects a custom limit", async () => {
    setToken(TOKEN);
    const fetchMock = stubFetch(jsonResponse([]));

    await listDueCards(NOTEBOOK_ID, 5);

    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/notebooks/${NOTEBOOK_ID}/cards/review?limit=5`);
  });

  it("reviewCard posts a rating and returns the updated card", async () => {
    setToken(TOKEN);
    const updated = { ...baseCard, review_count: 4, interval_days: 6 };
    const fetchMock = stubFetch(jsonResponse(updated));

    const card = await reviewCard(NOTEBOOK_ID, CARD_ID, "good");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/notebooks/${NOTEBOOK_ID}/cards/${CARD_ID}/review`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ rating: "good" });
    expect(card.review_count).toBe(4);
    expect(card.interval_days).toBe(6);
  });

  it("listCardSuggestions fetches drafts with a default limit of 5", async () => {
    setToken(TOKEN);
    const draft = {
      front: "What is ATP?",
      back: "Cellular energy carrier.",
      source_id: "src00000001",
      source_title: "Cell biology",
      pages: [1],
      chunk_seq: 2,
    };
    const fetchMock = stubFetch(jsonResponse([draft]));

    const suggestions = await listCardSuggestions(NOTEBOOK_ID);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/notebooks/${NOTEBOOK_ID}/cards/suggestions?limit=5`);
    expect(suggestions[0]).toMatchObject({
      front: "What is ATP?",
      source_title: "Cell biology",
      chunk_seq: 2,
    });
  });
});
