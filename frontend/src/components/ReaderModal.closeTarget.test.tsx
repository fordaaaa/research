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
  vi.mocked(api.getSource).mockResolvedValue({
    id: "s1", notebook_id: "n1", kind: "pdf", title: "Close check", tags: [],
    meta: { page_count: 1 }, created_at: "2026-01-01T00:00:00Z", chunk_count: 1,
    pages: [{ number: 1, text: "Body" }], chunks: [],
  } satisfies SourceDetail);
});

describe("round8 item10 reader close target", () => {
  it("close control meets the 44px touch target", async () => {
    render(<ReaderModal sourceId="s1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Body")).toBeTruthy());
    const close = screen.getByRole("button", { name: /close reader/i });
    expect(close.className).toMatch(/min-h-11/);
    expect(close.className).toMatch(/min-w-11/);
  });
});
