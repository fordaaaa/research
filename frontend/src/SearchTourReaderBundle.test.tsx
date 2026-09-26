// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import sourceListRaw from "./components/SourceList.tsx?raw";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  document.body.innerHTML = "";
  window.localStorage.clear();
});

describe("round9 item1 search 44px", () => {
  it("mode toggles and submit meet 44px touch target", async () => {
    const { default: SearchPanel } = await import("./components/SearchPanel");
    render(<SearchPanel onSearch={vi.fn()} onImportUrl={vi.fn()} />);
    const toggleSources = screen.getByRole("button", { name: "Your sources" });
    const toggleWeb = screen.getByRole("button", { name: "Search the web" });
    const submit = screen.getByRole("button", { name: "Submit search" });
    expect(toggleSources.className).toMatch(/min-h-11/);
    expect(toggleWeb.className).toMatch(/min-h-11/);
    expect(submit.className).toMatch(/min-h-11/);
  });
});

describe("round9 item2 tour focus fallback", () => {
  it("dismiss without a captured trigger focuses #main-content", async () => {
    const { default: FirstRunTour } = await import("./components/FirstRunTour");
    const root = document.createElement("div");
    root.id = "root";
    const main = document.createElement("main");
    main.id = "main-content";
    main.tabIndex = -1;
    main.textContent = "workspace";
    root.appendChild(main);
    document.body.appendChild(root);
    // No trigger focused: activeElement is BODY (auto-opened tour).
    expect(document.activeElement).toBe(document.body);
    const { unmount } = render(
      <FirstRunTour
        step={{ title: "Hello", description: "Welcome" }}
        index={0}
        total={2}
        onNext={vi.fn()}
        onBack={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    unmount();
    await waitFor(() => expect(document.activeElement).toBe(main));
    root.remove();
  });
});

describe("round9 item3 reader title echo", () => {
  it("strips a leading title echo from the first body block", async () => {
    vi.resetModules();
    const api = await import("./api");
    const getSource = vi.spyOn(api, "getSource").mockResolvedValue({
      id: "s-echo",
      notebook_id: "n1",
      kind: "pdf",
      title: "Photosynthesis",
      tags: [],
      meta: { page_count: 1 },
      created_at: "2026-01-01T00:00:00Z",
      chunk_count: 1,
      pages: [{ number: 1, text: "Photosynthesis: an overview of the process in leaves" }],
      chunks: [],
    } as unknown as Awaited<ReturnType<typeof api.getSource>>);
    const { default: ReaderModal } = await import("./components/ReaderModal");
    render(<ReaderModal sourceId="s-echo" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    // Echo stripped: body should read without the leading title + colon.
    expect(await screen.findByText("an overview of the process in leaves")).toBeTruthy();
    expect(screen.queryByText("Photosynthesis: an overview of the process in leaves")).toBeNull();
    getSource.mockRestore();
  });
});

describe("round9 item4 delete race", () => {
  it("uses AbortController and swallows abort rejections without unhandled errors", async () => {
    const src = String(sourceListRaw);
    expect(src).toMatch(/AbortController/);
    expect(src).toMatch(/signal\.aborted|aborted/);
    expect(src).toMatch(/AbortError/);
    // Behavior: an AbortError rejection must not surface as an alert nor an unhandled rejection.
    const unhandled: unknown[] = [];
    const onUnhandled = (e: PromiseRejectionEvent) => unhandled.push(e.reason);
    window.addEventListener("unhandledrejection", onUnhandled);
    const { default: SourceList } = await import("./components/SourceList");
    const onDelete = vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError"));
    const { container } = render(
      <SourceList
        sources={[{ id: "s1", notebook_id: "n1", kind: "pdf", title: "T", tags: [], meta: { page_count: 1 }, created_at: "2026-01-01T00:00:00Z", chunk_count: 1 }]}
        onOpen={vi.fn()}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /show source actions/i }));
    fireEvent.click(container.querySelector('[data-testid="swipe-row-actions"] button[aria-label="Delete T"]')!);
    fireEvent.click(container.querySelector('[data-testid="swipe-row-actions"] button[aria-label="Confirm delete T"]')!);
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(unhandled.length).toBe(0);
    window.removeEventListener("unhandledrejection", onUnhandled);
  });
});

describe("round9 item5 word truncate", () => {
  it("hides the words-count span below sm", async () => {
    const { default: SourceList } = await import("./components/SourceList");
    render(
      <SourceList
        sources={[{ id: "s1", notebook_id: "n1", kind: "pdf", title: "T", tags: [], meta: { page_count: 2, word_count: 10 }, created_at: "2026-01-01T00:00:00Z", chunk_count: 3 }]}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const meta = screen.getByText(/page\(s\)/);
    const wordsSpan = within(meta).getByText(/words/) as HTMLElement;
    expect(wordsSpan.tagName).toBe("SPAN");
    expect(wordsSpan.className).toMatch(/hidden/);
    expect(wordsSpan.className).toMatch(/sm:inline/);
  });
});

describe("round9 item6 reader focus gate", () => {
  it("focuses the close button after the closed->open mount transition", async () => {
    vi.resetModules();
    const api = await import("./api");
    vi.spyOn(api, "getSource").mockResolvedValue({
      id: "s1",
      notebook_id: "n1",
      kind: "pdf",
      title: "Focus me",
      tags: [],
      meta: { page_count: 1 },
      created_at: "2026-01-01T00:00:00Z",
      chunk_count: 1,
      pages: [{ number: 1, text: "Body text" }],
      chunks: [],
    } as unknown as Awaited<ReturnType<typeof api.getSource>>);
    const { default: ReaderModal } = await import("./components/ReaderModal");
    // Real sequence: mounted closed first, then opened.
    const { rerender } = render(<ReaderModal sourceId={null} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<ReaderModal sourceId="s1" onClose={vi.fn()} />);
    const dialog = await screen.findByRole("dialog");
    await screen.findByRole("heading", { name: "Focus me" });
    // Round-12: initial focus belongs on the close button, not the container.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: /close reader/i })));
    expect(document.activeElement).not.toBe(dialog);
    vi.restoreAllMocks();
  });
});

describe("round9 item7 search name", () => {
  it("gives the search input a mode-aware accessible name", async () => {
    const { default: SearchPanel } = await import("./components/SearchPanel");
    render(<SearchPanel onSearch={vi.fn()} onImportUrl={vi.fn()} />);
    expect(screen.getByRole("searchbox", { name: /search your sources/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Search the web" }));
    expect(screen.getByRole("searchbox", { name: /search the web/i })).toBeTruthy();
  });
});

describe("round9 item8 tab names", () => {
  it("has no duplicate accessible tab names in a single render", async () => {
    const { Tabs } = await import("./components/ui");
    render(
      <>
        <Tabs label="Library" options={[{ value: "sources", label: "Sources" }, { value: "notes", label: "Notes" }]} value="sources" onChange={vi.fn()} />
        <Tabs
          label="Workspace sections"
          options={[{ value: "research", label: "Research" }, { value: "notes", label: "Notes" }, { value: "search", label: "Search" }]}
          value="research"
          onChange={vi.fn()}
        />
      </>,
    );
    const tabs = screen.getAllByRole("tab");
    const names = tabs.map((t) => t.getAttribute("aria-label") ?? t.textContent?.trim() ?? "");
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("round9 item9 register hint", () => {
  it("explains the disabled submit and enables on input events (autofill)", async () => {
    window.localStorage.removeItem("research_token");
    vi.resetModules();
    vi.doMock("./api", async () => {
      const actual = await vi.importActual<typeof import("./api")>("./api");
      return { ...actual, googleStatus: vi.fn().mockResolvedValue({ enabled: false, client_id: null }), getToken: () => null };
    });
    const { default: AuthPanel } = await import("./components/AuthPanel");
    render(<AuthPanel onAuthed={vi.fn()} />);
    const submit = screen.getByRole("button", { name: "Create account" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    const describedBy = submit.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const hint = document.getElementById(describedBy!);
    expect(hint?.textContent).toMatch(/enter email and password/i);
    const email = document.getElementById("auth-email") as HTMLInputElement;
    const password = document.getElementById("auth-password") as HTMLInputElement;
    // Autofill-style native input events (no React change event).
    fireEvent.input(email, { target: { value: "student@example.test" } });
    fireEvent.input(password, { target: { value: "password123" } });
    await waitFor(() => expect((screen.getByRole("button", { name: "Create account" }) as HTMLButtonElement).disabled).toBe(false));
    vi.doUnmock("./api");
  });
});
