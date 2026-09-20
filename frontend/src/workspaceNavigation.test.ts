import { describe, expect, it } from "vitest";
import {
  defaultViewForSection,
  mobileSectionForView,
  viewsForMobileSection,
} from "./workspaceNavigation";

describe("mobile workspace navigation", () => {
  it("keeps discovery, learning, and optional AI tools in distinct sections", () => {
    expect(viewsForMobileSection("discover")).toEqual(["research", "deep", "search"]);
    expect(viewsForMobileSection("learn")).toEqual(["study"]);
    expect(viewsForMobileSection("write")).toEqual(["write", "skills"]);
    expect(viewsForMobileSection("ai")).toEqual(["ask"]);
  });

  it("maps every workspace view to a reachable mobile destination", () => {
    expect(mobileSectionForView("research")).toBe("discover");
    expect(mobileSectionForView("deep")).toBe("discover");
    expect(mobileSectionForView("search")).toBe("discover");
    expect(mobileSectionForView("study")).toBe("learn");
    expect(mobileSectionForView("notes")).toBe("library");
    expect(mobileSectionForView("ask")).toBe("ai");
    expect(mobileSectionForView("write")).toBe("write");
    expect(mobileSectionForView("skills")).toBe("write");
  });

  it("provides a stable default when switching sections", () => {
    expect(defaultViewForSection("discover")).toBe("research");
    expect(defaultViewForSection("learn")).toBe("study");
    expect(defaultViewForSection("write")).toBe("write");
    expect(defaultViewForSection("ai")).toBe("ask");
    expect(defaultViewForSection("library")).toBeNull();
  });
});
