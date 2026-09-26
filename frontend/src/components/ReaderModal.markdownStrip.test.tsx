// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { SourceDetail } from "../api";
import * as api from "../api";
import ReaderModal from "./ReaderModal";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return { ...actual, getSource: vi.fn(), createNote: vi.fn() };
});

afterEach(() => cleanup());
beforeEach(() => {
  vi.mocked(api.createNote).mockReset();
});

describe("round8 item1 reader markdown strip", () => {
  it('"# Title" body shows "Title" without raw markdown', async () => {
    vi.mocked(api.getSource).mockResolvedValueOnce({
      id: "s1", notebook_id: "n1", kind: "paste", title: "# My Notes", tags: [],
      meta: { page_count: 1 }, created_at: "2026-01-01T00:00:00Z", chunk_count: 1,
      pages: [{ number: 1, text: "# My Notes\nPhotosynthesis converts light." }], chunks: [],
    } satisfies SourceDetail);
    render(<ReaderModal sourceId="s1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/Photosynthesis converts/)).toBeTruthy());
    // Raw markdown must not leak into the reader body or header.
    expect(screen.queryByText(/# My Notes/)).toBeNull();
    expect(screen.getByText("My Notes", { selector: "h2" })).toBeTruthy();
  });
});
