// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listGlossary, listQuiz, setToken } from "./api";

const NB = "abcdef123456";
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

const glossaryEntry = {
  term: "Mitosis",
  explanation: "Mitosis divides the nucleus into two identical sets during cell division.",
  source_id: "src00000001",
  source_title: "Cell biology",
  pages: [1],
  chunk_seq: 0,
};

const quizQuestion = {
  question_type: "short_answer",
  prompt: "What divides the nucleus into two identical sets?",
  answer: "Mitosis divides the nucleus into two identical sets.",
  term: "Mitosis",
  source_id: "src00000001",
  source_title: "Cell biology",
  pages: [1],
  chunk_seq: 0,
};

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("glossary + quiz API contracts", () => {
  it("listGlossary fetches the glossary with a default limit of 20", async () => {
    setToken(TOKEN);
    const fetchMock = stubFetch(jsonResponse([glossaryEntry]));

    const entries = await listGlossary(NB);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/notebooks/${NB}/glossary?limit=20`);
    expect(entries[0]).toMatchObject({ term: "Mitosis", source_title: "Cell biology" });
  });

  it("listGlossary respects a custom limit", async () => {
    setToken(TOKEN);
    const fetchMock = stubFetch(jsonResponse([]));

    await listGlossary(NB, 5);

    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/notebooks/${NB}/glossary?limit=5`);
  });

  it("listQuiz fetches the quiz with a default limit of 10", async () => {
    setToken(TOKEN);
    const fetchMock = stubFetch(jsonResponse([quizQuestion]));

    const questions = await listQuiz(NB);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/notebooks/${NB}/quiz?limit=10`);
    expect(questions[0]).toMatchObject({ question_type: "short_answer", term: "Mitosis" });
  });

  it("listQuiz respects a custom limit", async () => {
    setToken(TOKEN);
    const fetchMock = stubFetch(jsonResponse([]));

    await listQuiz(NB, 3);

    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/notebooks/${NB}/quiz?limit=3`);
  });

  it("surfaces the no-source error detail", async () => {
    setToken(TOKEN);
    stubFetch(jsonResponse({ detail: "no source with readable text" }, 400));

    await expect(listGlossary(NB)).rejects.toThrow(/no source/i);
    stubFetch(jsonResponse({ detail: "no source with readable text" }, 400));
    await expect(listQuiz(NB)).rejects.toThrow(/no source/i);
  });
});
