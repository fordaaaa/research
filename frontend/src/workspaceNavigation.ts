export type WorkspaceView = "research" | "deep" | "ask" | "search" | "study" | "notes" | "write" | "skills";
export type MobileSection = "library" | "discover" | "learn" | "write" | "ai";

export const WORKSPACE_VIEWS: { value: WorkspaceView; label: string }[] = [
  { value: "research", label: "Research" },
  { value: "deep", label: "Deep research" },
  { value: "ask", label: "Ask" },
  { value: "search", label: "Search" },
  { value: "study", label: "Study" },
  { value: "notes", label: "Notes" },
  { value: "write", label: "Humanize" },
  { value: "skills", label: "Skills" },
];

const MOBILE_VIEWS: Record<Exclude<MobileSection, "library">, WorkspaceView[]> = {
  discover: ["research", "deep", "search"],
  learn: ["study"],
  write: ["write", "skills"],
  ai: ["ask"],
};

export function viewsForMobileSection(section: MobileSection): WorkspaceView[] {
  return section === "library" ? [] : MOBILE_VIEWS[section];
}

export function mobileSectionForView(view: WorkspaceView): MobileSection {
  if (view === "notes") return "library";
  if (MOBILE_VIEWS.discover.includes(view)) return "discover";
  if (MOBILE_VIEWS.learn.includes(view)) return "learn";
  if (MOBILE_VIEWS.write.includes(view)) return "write";
  return "ai";
}

export function defaultViewForSection(section: MobileSection): WorkspaceView | null {
  return section === "library" ? null : MOBILE_VIEWS[section][0];
}
