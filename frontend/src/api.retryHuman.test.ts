// @vitest-environment jsdom
// Round 17 item 7: 429 waits are humanized — >=60s rounds to minutes,
// seconds stay seconds, an absent wait says "shortly".
import { expect, it } from "vitest";
import { humanizeRetryWait, RateLimitError } from "./api";

it("humanizes retry waits", () => {
  expect(humanizeRetryWait(298)).toBe("5 minutes");
  expect(humanizeRetryWait(45)).toBe("45 seconds");
  expect(humanizeRetryWait(null)).toBe("shortly");
  expect(humanizeRetryWait(undefined)).toBe("shortly");
  expect(humanizeRetryWait(60)).toBe("1 minute");
  expect(humanizeRetryWait(1)).toBe("1 second");
});

it("RateLimitError default message uses the humanized wait", () => {
  expect(new RateLimitError(298).message).toMatch(/5 minutes/);
  expect(new RateLimitError(45).message).toMatch(/45 seconds/);
  expect(new RateLimitError(null).message).toMatch(/shortly/);
});
