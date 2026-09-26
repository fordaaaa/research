// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";
import { derivePasteTitle } from "./pasteTitle";

afterEach(() => cleanup());

it("strips ATX heading prefixes and prefers the first heading line", () => {
  expect(derivePasteTitle("# Mitosis Notes\nCells divide")).toBe("Mitosis Notes");
  expect(derivePasteTitle("##  Deep Notes  \nBody text here")).toBe("Deep Notes");
  expect(derivePasteTitle("###Cell stages\nBody")).toBe("Cell stages");
});

it("strips leading/trailing markdown emphasis", () => {
  expect(derivePasteTitle("**Mitosis** notes about cells dividing daily now")).toBe(
    "Mitosis notes about cells dividing daily…",
  );
  expect(derivePasteTitle("*Cells* divide into two parts")).toBe("Cells divide into two parts");
  expect(derivePasteTitle("`code` sample for the cell unit")).toBe("code sample for the cell unit");
});

it("keeps the 80-char cap, 6-word shape, and empty fallback", () => {
  expect(derivePasteTitle("   ")).toBe("Pasted note");
  expect(derivePasteTitle("Mitochondria produce energy for the cell through respiration daily")).toBe(
    "Mitochondria produce energy for the cell…",
  );
  const long = `word ${"a".repeat(100)}`;
  const title = derivePasteTitle(long);
  expect(title.length).toBeLessThanOrEqual(81);
  expect(title.endsWith("…")).toBe(true);
});
