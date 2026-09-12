// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  downloadCards,
  downloadMindmap,
  fetchCardsExport,
  fetchMindmapExport,
  getToken,
  setToken,
} from "./api";

const NOTEBOOK_ID = "abcdef123456";
const TOKEN = "test-token-abc";

function stubFetch(res: Response) {
  const fetchMock = vi.fn().mockResolvedValue(res);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function tsvResponse(filename: string | null) {
  const headers: Record<string, string> = { "Content-Type": "text/tab-separated-values" };
  if (filename !== null) headers["Content-Disposition"] = `attachment; filename="${filename}"`;
  return new Response(new Blob(["Front\tBack\tTags\nQ1\tA1\tbio\n"], { type: "text/tab-separated-values" }), {
    status: 200,
    headers,
  });
}

function mdResponse(filename: string | null) {
  const headers: Record<string, string> = { "Content-Type": "text/markdown" };
  if (filename !== null) headers["Content-Disposition"] = `attachment; filename="${filename}"`;
  return new Response(new Blob(["# Mind map\n"], { type: "text/markdown" }), {
    status: 200,
    headers,
  });
}

function mockObjectDownload() {
  const createMock = vi.fn().mockReturnValue("blob:mock-object-url");
  const revokeMock = vi.fn();
  Object.assign(URL, { createObjectURL: createMock, revokeObjectURL: revokeMock });
  const clickMock = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  const captured: { anchor: HTMLAnchorElement | null } = { anchor: null };
  const originalCreate = document.createElement.bind(document);
  const createSpy = vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
    const el = originalCreate(tagName as "div");
    if (tagName === "a") captured.anchor = el as unknown as HTMLAnchorElement;
    return el;
  }) as typeof document.createElement);
  return {
    createMock,
    revokeMock,
    clickMock,
    captured,
    restore() {
      createSpy.mockRestore();
      clickMock.mockRestore();
    },
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("authenticated study exports", () => {
  it("cards export sends Authorization Bearer, preserves the server filename, and keeps the token out of the URL", async () => {
    setToken(TOKEN);
    const fetchMock = stubFetch(tsvResponse("Study-deck-flashcards.tsv"));

    const result = await fetchCardsExport(NOTEBOOK_ID);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const [url, init] = calls[0];
    expect(url).toBe(`/api/notebooks/${NOTEBOOK_ID}/cards/export`);
    expect(url).not.toContain(TOKEN);
    const headers = init.headers as Headers;
    expect(headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.filename).toBe("Study-deck-flashcards.tsv");
  });

  it("mindmap export sends Authorization Bearer, preserves the server filename, and keeps the token out of the URL", async () => {
    setToken(TOKEN);
    const fetchMock = stubFetch(mdResponse("Study-mindmap.md"));

    const result = await fetchMindmapExport(NOTEBOOK_ID);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const [url, init] = calls[0];
    expect(url).toBe(`/api/notebooks/${NOTEBOOK_ID}/mindmap/export`);
    expect(url).not.toContain(TOKEN);
    const headers = init.headers as Headers;
    expect(headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.filename).toBe("Study-mindmap.md");
  });

  it("cards export falls back to a safe filename when Content-Disposition is missing", async () => {
    setToken(TOKEN);
    stubFetch(tsvResponse(null));

    const result = await fetchCardsExport(NOTEBOOK_ID);

    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.filename).toBe(`notebook-${NOTEBOOK_ID}-flashcards.tsv`);
  });

  it("mindmap export falls back to a safe filename when Content-Disposition is missing", async () => {
    setToken(TOKEN);
    stubFetch(mdResponse(null));

    const result = await fetchMindmapExport(NOTEBOOK_ID);

    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.filename).toBe(`notebook-${NOTEBOOK_ID}-mindmap.md`);
  });

  it("cards export preserves 401 handling: clears the token and signals login required", async () => {
    setToken(TOKEN);
    const seen: string[] = [];
    const handler = () => seen.push("research:unauthorized");
    window.addEventListener("research:unauthorized", handler);
    try {
      stubFetch(new Response(JSON.stringify({ detail: "login required" }), { status: 401 }));
      await expect(fetchCardsExport(NOTEBOOK_ID)).rejects.toThrow("login required");
      expect(getToken()).toBeNull();
      expect(seen).toEqual(["research:unauthorized"]);
    } finally {
      window.removeEventListener("research:unauthorized", handler);
    }
  });

  it("mindmap export preserves 401 handling: clears the token and signals login required", async () => {
    setToken(TOKEN);
    const seen: string[] = [];
    const handler = () => seen.push("research:unauthorized");
    window.addEventListener("research:unauthorized", handler);
    try {
      stubFetch(new Response(JSON.stringify({ detail: "login required" }), { status: 401 }));
      await expect(fetchMindmapExport(NOTEBOOK_ID)).rejects.toThrow("login required");
      expect(getToken()).toBeNull();
      expect(seen).toEqual(["research:unauthorized"]);
    } finally {
      window.removeEventListener("research:unauthorized", handler);
    }
  });

  it("downloadCards saves the Blob via an object URL so the token never appears in a download href", async () => {
    setToken(TOKEN);
    stubFetch(tsvResponse("Study-deck-flashcards.tsv"));
    const mocks = mockObjectDownload();
    try {
      const result = await downloadCards(NOTEBOOK_ID);
      expect(result.filename).toBe("Study-deck-flashcards.tsv");
      expect(result.blob).toBeInstanceOf(Blob);
      expect(mocks.createMock).toHaveBeenCalledTimes(1);
      expect(mocks.createMock.mock.calls[0][0]).toBeInstanceOf(Blob);
      expect(mocks.clickMock).toHaveBeenCalledTimes(1);
      expect(mocks.captured.anchor?.getAttribute("download")).toBe("Study-deck-flashcards.tsv");
      expect(mocks.captured.anchor?.href).toBe("blob:mock-object-url");
      expect(mocks.captured.anchor?.href).not.toContain(TOKEN);
      expect(mocks.revokeMock).toHaveBeenCalled();
    } finally {
      mocks.restore();
    }
  });

  it("downloadMindmap saves the Blob via an object URL so the token never appears in a download href", async () => {
    setToken(TOKEN);
    stubFetch(mdResponse("Study-mindmap.md"));
    const mocks = mockObjectDownload();
    try {
      const result = await downloadMindmap(NOTEBOOK_ID);
      expect(result.filename).toBe("Study-mindmap.md");
      expect(result.blob).toBeInstanceOf(Blob);
      expect(mocks.createMock).toHaveBeenCalledTimes(1);
      expect(mocks.createMock.mock.calls[0][0]).toBeInstanceOf(Blob);
      expect(mocks.clickMock).toHaveBeenCalledTimes(1);
      expect(mocks.captured.anchor?.getAttribute("download")).toBe("Study-mindmap.md");
      expect(mocks.captured.anchor?.href).toBe("blob:mock-object-url");
      expect(mocks.captured.anchor?.href).not.toContain(TOKEN);
      expect(mocks.revokeMock).toHaveBeenCalled();
    } finally {
      mocks.restore();
    }
  });
});
