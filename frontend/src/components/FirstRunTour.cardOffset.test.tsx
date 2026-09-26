// @vitest-environment jsdom
// Round 22 item 5 (FAILING first): the tour card must sit offset away from
// its spotlight target — upper-half targets open below, lower-half targets
// open above — and never cover the target center (the old clamp could park
// the card on top of its own target at 1280px).
import { describe, expect, it } from "vitest";
import { tourCardPosition } from "./FirstRunTour";

const VIEWPORT = { width: 1280, height: 800 };
const CARD_WIDTH = 360;

function coversCenter(
  spot: { left: number; top: number; width: number; height: number },
  card: { left: number; top: number },
  cardWidth: number,
  cardHeight: number,
): boolean {
  const cx = spot.left + spot.width / 2;
  const cy = spot.top + spot.height / 2;
  return card.left <= cx && cx <= card.left + cardWidth && card.top <= cy && cy <= card.top + cardHeight;
}

describe("round22 item5 tour card offset", () => {
  it("upper-half target opens below with a gap", () => {
    const spot = { left: 200, top: 120, width: 320, height: 60 };
    const card = tourCardPosition(spot, VIEWPORT, CARD_WIDTH);
    expect(card.top).toBeGreaterThanOrEqual(spot.top + spot.height + 20);
    expect(coversCenter(spot, card, CARD_WIDTH, 250)).toBe(false);
  });

  it("lower-half target opens above with a gap", () => {
    const spot = { left: 900, top: 560, width: 240, height: 80 };
    const card = tourCardPosition(spot, VIEWPORT, CARD_WIDTH);
    expect(card.top + 250).toBeLessThanOrEqual(spot.top - 20);
    expect(coversCenter(spot, card, CARD_WIDTH, 250)).toBe(false);
  });

  it("lower-half workspace-tabs-style spotlight never covers center", () => {
    const spot = { left: 40, top: 500, width: 220, height: 120 };
    const card = tourCardPosition(spot, VIEWPORT, CARD_WIDTH);
    expect(card.top + 250).toBeLessThanOrEqual(spot.top);
    expect(coversCenter(spot, card, CARD_WIDTH, 250)).toBe(false);
  });

  it("clamped short viewport still avoids the target center", () => {
    const small = { width: 1280, height: 500 };
    const spot = { left: 600, top: 380, width: 200, height: 60 };
    const card = tourCardPosition(spot, small, CARD_WIDTH);
    expect(coversCenter(spot, card, CARD_WIDTH, 250)).toBe(false);
  });

  it("no spotlight centers the card", () => {
    const card = tourCardPosition(null, VIEWPORT, CARD_WIDTH);
    expect(card.left).toBe((VIEWPORT.width - CARD_WIDTH) / 2);
  });
});
