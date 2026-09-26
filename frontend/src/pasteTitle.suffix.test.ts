// @vitest-environment jsdom
// Round 14 item 3: duplicate paste titles get " (2)", " (3)" suffixes.
import { expect, it } from "vitest";
import { uniqueSourceTitle } from "./components/pasteTitle";

it("leaves a non-colliding title unchanged", () => {
  expect(uniqueSourceTitle("Mitochondria", ["Chloroplast"])).toBe("Mitochondria");
});

it("suffixes a colliding title with (2), then (3)", () => {
  expect(uniqueSourceTitle("Mitochondria", ["Mitochondria"])).toBe("Mitochondria (2)");
  expect(uniqueSourceTitle("Mitochondria", ["Mitochondria", "Mitochondria (2)"])).toBe(
    "Mitochondria (3)",
  );
});
