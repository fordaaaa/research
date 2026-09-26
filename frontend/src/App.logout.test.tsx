// @vitest-environment jsdom
import { expect, it } from "vitest";
import src from "./App.tsx?raw";

it("logout avatar button meets 44px touch target (min-h-11)", () => {
  const match = src.match(/aria-label={`Log out[^`]*`}[\s\S]*?className="([^"]*)"/);
  expect(match, "logout button class not found").toBeTruthy();
  expect(match![1]).toMatch(/min-h-11/);
  expect(match![1]).toMatch(/min-w-11/);
});
