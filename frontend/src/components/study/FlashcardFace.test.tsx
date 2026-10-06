// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import FlashcardFace from "./FlashcardFace";

afterEach(() => {
  cleanup();
});

describe("FlashcardFace", () => {
  it("shows only the visible face with accessible Show/Hide labels", () => {
    const { rerender } = render(<FlashcardFace front="Front text" back="Back text" flipped={false} onFlip={() => undefined} />);
    expect(screen.getByRole("button", { name: /show answer/i })).toBeTruthy();
    expect(screen.getByText("Front text")).toBeTruthy();
    expect(screen.queryByText("Back text")).toBeNull();

    rerender(<FlashcardFace front="Front text" back="Back text" flipped={true} onFlip={() => undefined} />);
    expect(screen.getByRole("button", { name: /hide answer/i })).toBeTruthy();
    expect(screen.getByText("Back text")).toBeTruthy();
    expect(screen.queryByText("Front text")).toBeNull();
  });

  it("animates the face swap on an inner keyed span while preserving the button node and focus", () => {
    const { rerender } = render(<FlashcardFace front="Front text" back="Back text" flipped={false} onFlip={() => undefined} />);
    const buttonBefore = screen.getByRole("button", { name: /show answer/i });
    buttonBefore.focus();
    expect(document.activeElement).toBe(buttonBefore);

    rerender(<FlashcardFace front="Front text" back="Back text" flipped={true} onFlip={() => undefined} />);
    const buttonAfter = screen.getByRole("button", { name: /hide answer/i });
    expect(buttonAfter).toBe(buttonBefore);
    expect(document.activeElement).toBe(buttonAfter);

    const face = screen.getByText("Back text");
    expect(face.className).toMatch(/animate-flashcard-face/);
  });

  it("calls onFlip on click and honors disabled", () => {
    let flips = 0;
    const { rerender } = render(
      <FlashcardFace front="F" back="B" flipped={false} onFlip={() => { flips += 1; }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /show answer/i }));
    expect(flips).toBe(1);

    rerender(<FlashcardFace front="F" back="B" flipped={false} onFlip={() => { flips += 1; }} disabled />);
    expect(screen.getByRole("button", { name: /show answer/i }).hasAttribute("disabled")).toBe(true);
  });
});
