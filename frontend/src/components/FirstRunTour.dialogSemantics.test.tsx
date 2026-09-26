// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import FirstRunTour from "./FirstRunTour";

afterEach(() => cleanup());

describe("round7 item5 dialog semantics", () => {
  it("uses aria-modal true and inerts the background while open", () => {
    const root = document.createElement("div");
    root.id = "root";
    const background = document.createElement("button");
    background.textContent = "background control";
    root.appendChild(background);
    document.body.appendChild(root);

    render(
      <FirstRunTour
        step={{ title: "Create a notebook", description: "Start here." }}
        index={0}
        total={3}
        onNext={vi.fn()}
        onBack={vi.fn()}
        onSkip={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(root.hasAttribute("inert")).toBe(true);

    cleanup();
    expect(root.hasAttribute("inert")).toBe(false);
    root.remove();
  });
});
