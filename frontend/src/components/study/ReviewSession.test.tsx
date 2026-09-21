// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { decideSwipe, SWIPE_THRESHOLD } from "./reviewGesture";

const apiMocks = vi.hoisted(() => ({ reviewCard: vi.fn() }));

vi.mock("../../api", async () => {
  const actual = await vi.importActual<typeof import("../../api")>("../../api");
  return { ...actual, ...apiMocks };
});

import ReviewSession from "./ReviewSession";
import type { Flashcard } from "../../api";

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

const cardA = card({ id: "card00000001", front: "What splits in anaphase?", back: "Sister chromatids." });
const cardB = card({ id: "card00000002", front: "What is ATP?", back: "Energy carrier." });

function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? matches : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function reveal() {
  fireEvent.click(screen.getByRole("button", { name: /tap to reveal|show answer/i }));
  expect(await screen.findByRole("button", { name: /^again$/i })).toBeTruthy();
}

function swipe(surface: HTMLElement, fromX: number, toX: number, fromY = 100, toY = 100) {
  fireEvent.pointerDown(surface, { clientX: fromX, clientY: fromY, pointerId: 1 });
  fireEvent.pointerMove(surface, { clientX: (fromX + toX) / 2, clientY: (fromY + toY) / 2, pointerId: 1 });
  fireEvent.pointerUp(surface, { clientX: toX, clientY: toY, pointerId: 1 });
}

describe("reviewGesture", () => {
  it("uses a thumb-friendly threshold", () => {
    expect(SWIPE_THRESHOLD).toBeGreaterThanOrEqual(60);
  });

  it("maps right swipe to good and left swipe to again", () => {
    expect(decideSwipe(SWIPE_THRESHOLD + 20, 0)).toBe("good");
    expect(decideSwipe(-SWIPE_THRESHOLD - 20, 0)).toBe("again");
  });

  it("ignores drags below the threshold", () => {
    expect(decideSwipe(SWIPThresholdSafe(), 0)).toBeNull();
  });

  it("ignores mostly-vertical drags so scrolling never grades", () => {
    expect(decideSwipe(30, 150)).toBeNull();
    expect(decideSwipe(-30, -150)).toBeNull();
  });

  it("ignores swipes while text is selected", () => {
    expect(decideSwipe(200, 0, { hasSelection: true })).toBeNull();
  });
});

function SWIPThresholdSafe() {
  return SWIPE_THRESHOLD - 20;
}

describe("ReviewSession", () => {
  it("shows four accessible rating buttons after revealing the answer", async () => {
    stubMatchMedia(false);
    apiMocks.reviewCard.mockResolvedValue(cardA);
    render(<ReviewSession notebookId={NB} initialQueue={[cardA]} onExit={() => undefined} />);

    await reveal();
    for (const name of ["Again", "Hard", "Good", "Easy"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${name}$`, "i") })).toBeTruthy();
    }
    expect(screen.getByTestId("review-session")).toBeTruthy();
  });

  it("persists a button grade and advances to the next card", async () => {
    stubMatchMedia(false);
    apiMocks.reviewCard.mockImplementation((_nb: string, id: string) =>
      Promise.resolve(id === cardA.id ? { ...cardA, review_count: 1 } : cardB),
    );
    const graded: Flashcard[] = [];
    render(
      <ReviewSession notebookId={NB} initialQueue={[cardA, cardB]} onExit={() => undefined} onGraded={(c) => graded.push(c)} />,
    );

    await reveal();
    fireEvent.click(screen.getByRole("button", { name: /^good$/i }));

    await waitFor(() =>
      expect(apiMocks.reviewCard).toHaveBeenCalledWith(NB, cardA.id, "good"),
    );
    expect(graded[0]?.id).toBe(cardA.id);
    expect(await screen.findByText("What is ATP?")).toBeTruthy();
  });

  it("supports keyboard grading (number keys and arrows)", async () => {
    stubMatchMedia(false);
    apiMocks.reviewCard.mockResolvedValue({ ...cardA, review_count: 1 });
    render(<ReviewSession notebookId={NB} initialQueue={[cardA]} onExit={() => undefined} />);

    await reveal();
    fireEvent.keyDown(screen.getByTestId("review-session"), { key: "3" });
    await waitFor(() => expect(apiMocks.reviewCard).toHaveBeenCalledWith(NB, cardA.id, "good"));
  });

  it("grades right swipe as good and left swipe as again", async () => {
    stubMatchMedia(false);
    apiMocks.reviewCard.mockImplementation((_nb: string, id: string) =>
      Promise.resolve(id === cardA.id ? { ...cardA, review_count: 1 } : { ...cardB, review_count: 1 }),
    );
    render(<ReviewSession notebookId={NB} initialQueue={[cardA, cardB]} onExit={() => undefined} />);

    await reveal();
    swipe(screen.getByTestId("review-swipe-surface"), 100, 100 + SWIPE_THRESHOLD + 40);
    await waitFor(() => expect(apiMocks.reviewCard).toHaveBeenCalledWith(NB, cardA.id, "good"));

    fireEvent.click(await screen.findByRole("button", { name: /tap to reveal|show answer/i }));
    swipe(screen.getByTestId("review-swipe-surface"), 200, 200 - SWIPE_THRESHOLD - 40);
    await waitFor(() => expect(apiMocks.reviewCard).toHaveBeenCalledWith(NB, cardB.id, "again"));
  });

  it("does not grade short or vertical drags", async () => {
    stubMatchMedia(false);
    apiMocks.reviewCard.mockResolvedValue(cardA);
    render(<ReviewSession notebookId={NB} initialQueue={[cardA]} onExit={() => undefined} />);

    await reveal();
    const surface = screen.getByTestId("review-swipe-surface");
    swipe(surface, 100, 100 + SWIPE_THRESHOLD - 30);
    swipe(surface, 100, 130, 100, 300);
    expect(apiMocks.reviewCard).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^good$/i })).toBeTruthy();
  });

  it("does not grade a swipe while text is selected", async () => {
    stubMatchMedia(false);
    apiMocks.reviewCard.mockResolvedValue(cardA);
    const getSelection = vi.spyOn(window, "getSelection").mockReturnValue({ toString: () => "Sister" } as Selection);
    render(<ReviewSession notebookId={NB} initialQueue={[cardA]} onExit={() => undefined} />);

    await reveal();
    swipe(screen.getByTestId("review-swipe-surface"), 100, 100 + SWIPE_THRESHOLD + 60);
    expect(apiMocks.reviewCard).not.toHaveBeenCalled();
    getSelection.mockRestore();
  });

  it("honors prefers-reduced-motion by disabling swipe animation", async () => {
    stubMatchMedia(true);
    apiMocks.reviewCard.mockResolvedValue(cardA);
    render(<ReviewSession notebookId={NB} initialQueue={[cardA]} onExit={() => undefined} />);

    fireEvent.click(await screen.findByRole("button", { name: /tap to reveal|show answer/i }));
    const surface = await screen.findByTestId("review-swipe-surface");
    expect(surface.getAttribute("data-motion")).toBe("reduced");
    expect(surface.className).not.toMatch(/transition/);
  });

  it("shows an error and stays on the card when grading fails", async () => {
    stubMatchMedia(false);
    apiMocks.reviewCard.mockRejectedValue(new Error("network down"));
    render(<ReviewSession notebookId={NB} initialQueue={[cardA]} onExit={() => undefined} />);

    await reveal();
    fireEvent.click(screen.getByRole("button", { name: /^good$/i }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Sister chromatids.")).toBeTruthy();
  });

  it("does not capture the pointer when pressing the interactive Show/Hide button", async () => {
    stubMatchMedia(false);
    apiMocks.reviewCard.mockResolvedValue(cardA);
    render(<ReviewSession notebookId={NB} initialQueue={[cardA]} onExit={() => undefined} />);

    const surface = screen.getByTestId("review-swipe-surface");
    const capture = vi.fn();
    (surface as unknown as { setPointerCapture: unknown }).setPointerCapture = capture;
    const toggle = screen.getByRole("button", { name: /show answer|tap to reveal/i });
    fireEvent.pointerDown(toggle, { clientX: 100, clientY: 100, pointerId: 7 });
    expect(capture).not.toHaveBeenCalled();

    fireEvent.pointerDown(surface, { clientX: 100, clientY: 100, pointerId: 8 });
    expect(capture).toHaveBeenCalledTimes(1);
  });
});
