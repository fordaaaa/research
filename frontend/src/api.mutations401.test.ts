// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addPaste,
  clearAISettings,
  deleteCard,
  deleteChatSession,
  deleteNote,
  deleteNotebook,
  deleteOutline,
  deleteSkill,
  deleteSource,
  getToken,
  setToken,
} from "./api";

const TOKEN = "test-token-401";

function stubFetch(res: Response) {
  const fetchMock = vi.fn().mockResolvedValue(res);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function unauthorized() {
  return new Response(JSON.stringify({ detail: "login required" }), { status: 401 });
}

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function expectUnauthorizedFlow(call: () => Promise<unknown>) {
  setToken(TOKEN);
  const seen: string[] = [];
  const handler = () => seen.push("research:unauthorized");
  window.addEventListener("research:unauthorized", handler);
  try {
    stubFetch(unauthorized());
    await expect(call()).rejects.toThrow("login required");
    expect(getToken()).toBeNull();
    expect(seen).toEqual(["research:unauthorized"]);
  } finally {
    window.removeEventListener("research:unauthorized", handler);
  }
}

describe("mutation wrappers clear the session on 401", () => {
  it("deleteNotebook", () => expectUnauthorizedFlow(() => deleteNotebook("nb1")));
  it("addPaste", () => expectUnauthorizedFlow(() => addPaste("nb1", "t", "x")));
  it("deleteSource", () => expectUnauthorizedFlow(() => deleteSource("src1")));
  it("deleteNote", () => expectUnauthorizedFlow(() => deleteNote("nb1", "note1")));
  it("deleteChatSession", () => expectUnauthorizedFlow(() => deleteChatSession("nb1", "s1")));
  it("deleteOutline", () => expectUnauthorizedFlow(() => deleteOutline("nb1", "o1")));
  it("deleteSkill", () => expectUnauthorizedFlow(() => deleteSkill("sk1")));
  it("deleteCard", () => expectUnauthorizedFlow(() => deleteCard("nb1", "c1")));
  it("clearAISettings", () => expectUnauthorizedFlow(() => clearAISettings()));
});
