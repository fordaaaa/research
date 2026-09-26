// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";
import { derivePasteTitle } from "./pasteTitle";

afterEach(() => cleanup());

describe("round7 item2 dangling ellipsis", () => {
  it("short heading gets no ellipsis", () => {
    expect(derivePasteTitle("# Title")).toBe("Title");
    expect(derivePasteTitle("# Title\nSome body text here")).toBe("Title");
  });

  it("long truncated text keeps ellipsis", () => {
    const long = `word ${"a".repeat(100)}`;
    expect(derivePasteTitle(long).endsWith("…")).toBe(true);
    expect(
      derivePasteTitle("Mitochondria produce energy for the cell through respiration daily").endsWith("…"),
    ).toBe(true);
  });
});
