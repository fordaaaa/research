// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import FolioLoader from "./FolioLoader";

afterEach(cleanup);

describe("FolioLoader", () => {
  it("announces boot status with title and subtitle", () => {
    render(<FolioLoader title="Preparing your workspace…" subtitle="Laying folio flat…" />);
    const status = screen.getByRole("status").textContent ?? "";
    expect(status).toContain("Preparing your workspace…");
    expect(status).toContain("Laying folio flat…");
  });

  it("supports compact opening copy for in-app loads", () => {
    render(<FolioLoader title="Opening source…" compact />);
    expect(screen.getByRole("status").textContent ?? "").toContain("Opening source…");
  });

  it("keeps the folio graphic decorative for screen readers", () => {
    render(<FolioLoader title="Loading…" />);
    expect(screen.getByRole("status").querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});
