// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { applyAppearance, readAppearance, saveAppearance } from "./appearance";

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-font");
});

it("defaults to readable paper and ignores invalid saved values", () => {
  expect(readAppearance()).toEqual({ theme: "paper", font: "readable" });
  localStorage.setItem("notaeo:theme", "unknown");
  localStorage.setItem("notaeo:font", "unknown");
  expect(readAppearance()).toEqual({ theme: "paper", font: "readable" });
});

it("persists a night theme and Maple Mono choice independently of the account", () => {
  saveAppearance({ theme: "night", font: "maple" });
  applyAppearance(readAppearance());
  expect(localStorage.getItem("notaeo:theme")).toBe("night");
  expect(document.documentElement.dataset.theme).toBe("night");
  expect(document.documentElement.dataset.font).toBe("maple");
});
