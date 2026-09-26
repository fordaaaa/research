// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";
import { stripMarkdownForDisplay } from "./pasteTitle";

afterEach(() => cleanup());

describe("round7 item1 stripMarkdownForDisplay", () => {
  it("strips ATX heading prefixes and emphasis for display", () => {
    expect(stripMarkdownForDisplay("# Title")).toBe("Title");
    expect(stripMarkdownForDisplay("## Deep Notes")).toBe("Deep Notes");
    expect(stripMarkdownForDisplay("**Bold** and *em* text")).toBe("Bold and em text");
  });
});
