// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchNotebookExport, getToken, saveBlob, setToken } from "./api";

const NOTEBOOK_ID = "abcdef123456";
const TOKEN = "test-token-abc";

function stubFetch(res: Response) {
  const fetchMock = vi.fn().mockResolvedValue(res);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function zipResponse(filename: string | null) {
  const headers: Record<string, string> = { "Content-Type": "application/zip" };
  if (filename !== null) headers["Content-Disposition"] = `attachment; filename="${filename}"`;
  return new Response(new Blob(["PK-mock-zip"], { type: "application/zip" }), {
    status: 200,
    headers,
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("authenticated notebook export", () => {
  it("sends Authorization Bearer, preserves the server filename, and keeps the token out of the URL", async () => {
    setToken(TOKEN);
    const fetchMock = stubFetch(zipResponse("My-Biology.zip"));

    const result = await fetchNotebookExport(NOTEBOOK_ID);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const [url, init] = calls[0];
    expect(url).toBe(`/api/notebooks/${NOTEBOOK_ID}/export`);
    expect(url).not.toContain(TOKEN);
    const headers = init.headers as Headers;
    expect(headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.filename).toBe("My-Biology.zip");
  });

  it("falls back to a safe filename when Content-Disposition is missing", async () => {
    setToken(TOKEN);
    stubFetch(zipResponse(null));

    const result = await fetchNotebookExport(NOTEBOOK_ID);

    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.filename).toBe(`notebook-${NOTEBOOK_ID}.zip`);
  });

  it("preserves 401 handling: clears the token and signals login required", async () => {
    setToken(TOKEN);
    const seen: string[] = [];
    const handler = () => seen.push("research:unauthorized");
    window.addEventListener("research:unauthorized", handler);
    try {
      stubFetch(new Response(JSON.stringify({ detail: "login required" }), { status: 401 }));
      await expect(fetchNotebookExport(NOTEBOOK_ID)).rejects.toThrow("login required");
      expect(getToken()).toBeNull();
      expect(seen).toEqual(["research:unauthorized"]);
    } finally {
      window.removeEventListener("research:unauthorized", handler);
    }
  });

  it("saves the Blob via an object URL so the token never appears in a download href", () => {
    const blob = new Blob(["PK-mock-zip"], { type: "application/zip" });
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

    try {
      saveBlob(blob, "My-Biology.zip");
      expect(createMock).toHaveBeenCalledTimes(1);
      expect(createMock.mock.calls[0][0]).toBe(blob);
      expect(clickMock).toHaveBeenCalledTimes(1);
      expect(captured.anchor).not.toBeNull();
      expect(captured.anchor?.getAttribute("download")).toBe("My-Biology.zip");
      expect(captured.anchor?.href).toBe("blob:mock-object-url");
      expect(captured.anchor?.href).not.toContain(TOKEN);
      expect(revokeMock).toHaveBeenCalled();
    } finally {
      createSpy.mockRestore();
      clickMock.mockRestore();
    }
  });
});
