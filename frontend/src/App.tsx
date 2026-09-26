import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "./api";
import type { Note, Notebook, SourceSummary, User } from "./api";
import AuthPanel from "./components/AuthPanel";
import NotebookPicker from "./components/NotebookPicker";
import UploadZone from "./components/UploadZone";
import { uniqueSourceTitle } from "./components/pasteTitle";
import SourceList from "./components/SourceList";
import SearchPanel from "./components/SearchPanel";
import ResearchPanel from "./components/ResearchPanel";
import ChatPanel from "./components/ChatPanel";
import SettingsDialog from "./components/SettingsDialog";
import OutlinePanel from "./components/OutlinePanel";
import HumanizerPanel from "./components/HumanizerPanel";
import SkillsPanel from "./components/SkillsPanel";
import FolioLoader from "./components/FolioLoader";
import FirstRunTour from "./components/FirstRunTour";
import type { TourStep } from "./components/FirstRunTour";
import StudyPanel from "./components/StudyPanel";
import ReaderModal from "./components/ReaderModal";
import NotesPanel from "./components/NotesPanel";
import { Badge, BottomNav, Card, Tabs } from "./components/ui";
import {
  defaultViewForSection,
  mobileSectionForView,
  viewsForMobileSection,
  WORKSPACE_VIEWS,
} from "./workspaceNavigation";
import type { MobileSection, WorkspaceView } from "./workspaceNavigation";
import { applyAppearance, readAppearance, saveAppearance } from "./appearance";
import type { Appearance } from "./appearance";
import { isSoundEnabled, playBoot, playSuccess, previewChime } from "./sound";

// Mobile labels mirror the dominant desktop view per section (see
// viewsForMobileSection): Discover→Search, Learn→Study, AI→Ask, and Write→
// Humanize ("Write" matches neither Humanize nor Skills). Values stay as the
// MobileSection keys — labels only.
const MOBILE_SECTIONS: { value: MobileSection; label: string }[] = [
  { value: "library", label: "Library" },
  { value: "discover", label: "Search" },
  { value: "learn", label: "Study" },
  { value: "write", label: "Humanize" },
  { value: "ai", label: "Ask" },
];

type TourStage = "none" | "landing" | "waiting" | "workspace";
const tourKey = (userId: string) => `notaeo:onboarding:${userId}`;
const savedTourStage = (userId: string): TourStage => {
  const value = localStorage.getItem(tourKey(userId));
  return value === "landing" || value === "waiting" || value === "workspace" ? value : "none";
};

const LANDING_TOUR: TourStep[] = [
  { title: "Looks like you're new here. Let's get you started.", description: "Notaeo works with your own sources. You can collect, read, and study without setting up AI." },
  { title: "Start with a notebook", description: "Make one for a class, assignment, or topic. Everything you add stays organized here.", targets: ['[data-tour="create-notebook"]'] },
  { title: "Or try the demo", description: "Open the sample notebook to see the workspace before adding your own material. Open any notebook to continue the tour.", targets: ['[data-tour="demo-notebook"]'] },
];

const WORKSPACE_TOUR: TourStep[] = [
  { title: "Bring your sources in", description: "Upload a document or paste text here. Your notebook gives every source a place to live.", targets: ['[data-tour="add-sources"]'] },
  { title: "Find your way around", description: "These sections take you from research and search to notes, study tools, and optional AI.", targets: ['[data-tour="workspace-tabs"]', 'nav[aria-label="Notebook sections"]'] },
  { title: "Your source library", description: "Open sources to read them, and come back to this list whenever you need the original material.", targets: ['[data-tour="source-list"]'] },
  { title: "Take your work with you", description: "Export the notebook as Markdown when you want a copy outside Notaeo.", targets: ['[data-tour="export-notebook"]'] },
  { title: "You're ready to explore", description: "The Notaeo button brings you back to your notebooks. Settings are available in the top bar; AI remains optional.", targets: ['[data-tour="home"]'] },
];

/** Breakpoint query shared by the responsive workspace navs. */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, [query]);
  return matches;
}

export default function App() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [sources, setSources] = useState<SourceSummary[]>([]);
  const [view, setView] = useState<WorkspaceView>("research");
  const [mobileSection, setMobileSection] = useState<MobileSection>("library");
  const [mobileLibraryPane, setMobileLibraryPane] = useState<"sources" | "notes">("sources");
  const [backendUp, setBackendUp] = useState(true);
  const [aiConfigured, setAIConfigured] = useState(false);
  const [hostedAIAvailable, setHostedAIAvailable] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // Round 20 item 1: openers captured synchronously in the click handler
  // (e.currentTarget) BEFORE the open state flips. Mount-time activeElement
  // capture is too late for auto-opened tours and async opens. null =
  // auto-openerless open → restore to #main-content; undefined = legacy.
  const [settingsTrigger, setSettingsTrigger] = useState<HTMLElement | null | undefined>(undefined);
  const [tourTrigger, setTourTrigger] = useState<HTMLElement | null | undefined>(null);
  const [readerTrigger, setReaderTrigger] = useState<HTMLElement | null | undefined>(undefined);
  const [readingId, setReadingId] = useState<string | null>(null);
  const openReader = useCallback((id: string, trigger?: HTMLElement | null) => {
    setReaderTrigger(trigger ?? null);
    setReadingId(id);
  }, []);
  const closeReader = useCallback(() => setReadingId(null), []);
  const [capturedNote, setCapturedNote] = useState<Note | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [exportedTick, setExportedTick] = useState(false);
  // Round 25 item 4: after a successful export, focus stays on the Export
  // control itself (the button never unmounts — busy only disables it — so
  // an explicit refocus after the tick commits is deterministic even where
  // disabling under focus drops to BODY). The Exported pill + its × stay
  // clickable; the × is never auto-focused. The "Exported" confirmation
  // itself lives in the persistent save region below (announced), not in
  // the pill.
  //
  // FINAL (item 5 audit): the refocus must ALSO wait out the disabled
  // window. The handler sets exportedTick before finally clears exportBusy;
  // an effect keyed on the tick alone fires while the control is still
  // disabled, and focus() on a disabled button is a browser no-op (focus
  // then sits on BODY and wanders). Guarding on !exportBusy with both in
  // deps re-attempts the focus once enablement lands, so the Export control
  // — never the pill dismiss — deterministically ends focused.
  const exportButtonRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (exportedTick && !exportBusy) exportButtonRef.current?.focus();
  }, [exportedTick, exportBusy]);
  // Round 22 item 2: the 0-source nudge used to only render text — keyboard
  // and AT users got a dead click (no focus, and a repeat click announced
  // nothing since identical text is no DOM mutation). The nudge takes focus
  // on appear, and each trigger remounts it via exportNudgeKey so repeats
  // re-announce.
  const exportNoticeRef = useRef<HTMLParagraphElement | null>(null);
  const [exportNudgeKey, setExportNudgeKey] = useState(0);
  useEffect(() => {
    if (exportNotice) exportNoticeRef.current?.focus();
  }, [exportNotice, exportNudgeKey]);
  // Win-rotation epoch: bumped whenever an App-level win fires
  // (create/save/export). SourceList watches it to retire its delete
  // confirmation when a newer win supersedes it.
  const [winEpoch, setWinEpoch] = useState(0);
  const [hasWon, setHasWon] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [hasAddedSource, setHasAddedSource] = useState(false);
  const [hasExportedOrReviewed, setHasExportedOrReviewed] = useState(false);
  // Round 20 item 2: per-user persisted progress flags from the server
  // (GET /api/me/progress). Merged sticky (server OR local) below; missing
  // endpoint (old server) falls back to local silently.
  const [serverProgress, setServerProgress] = useState<{ add_source: boolean; search: boolean; export: boolean; review: boolean } | null>(null);
  const mergedHasAddedSource = hasAddedSource || serverProgress?.add_source === true;
  const mergedHasSearched = hasSearched || serverProgress?.search === true;
  const mergedHasExportedOrReviewed =
    hasExportedOrReviewed || serverProgress?.export === true || serverProgress?.review === true;
  const [soundOn, setSoundOn] = useState(isSoundEnabled);
  const [tourStage, setTourStage] = useState<TourStage>("none");
  const [tourIndex, setTourIndex] = useState(0);
  // Round 24 items 3+4: persistent tour-end announcement (survives the tour
  // unmount, like the appearance region) + consent-gated workspace tour.
  // The workspace tour never auto-opens: after the landing tour ends
  // ("waiting") and a notebook opens, a dismissible "Continue the tour?"
  // banner offers Resume (opens workspace tour) or Dismiss (marks done).
  const [tourAnnouncement, setTourAnnouncement] = useState<string | null>(null);
  // FINAL item 2 audit: the finale write itself was persistent, but a plain
  // setState("Tour finished") is a no-op when the text is already there
  // (repeat finale with no intervening clear — landing Done, then the
  // consent-banner Dismiss: React bails, no DOM mutation, AT hears nothing
  // at the final dismissal). The ref mirrors the region text so the repeat
  // takes a clear-then-reset path in a later task (same pattern as the
  // appearance announcer); first finales stay synchronous (text lands
  // before the deferred unmount). No win-rotation clearer (markSearched,
  // notebook switch, delete) touches this region — locked by test. The seq
  // drops a stale reset behind a newer clear (e.g. Take-a-tour racing a
  // pending repeat reset).
  const tourAnnouncementRef = useRef<string | null>(null);
  const tourAnnounceSeq = useRef(0);
  const clearTourAnnouncement = useCallback(() => {
    tourAnnounceSeq.current += 1;
    tourAnnouncementRef.current = null;
    setTourAnnouncement(null);
  }, []);
  const announceTourFinished = useCallback(() => {
    if (tourAnnouncementRef.current === "Tour finished") {
      tourAnnounceSeq.current += 1;
      const seq = tourAnnounceSeq.current;
      tourAnnouncementRef.current = null;
      setTourAnnouncement(null);
      window.setTimeout(() => {
        if (tourAnnounceSeq.current !== seq) return;
        tourAnnouncementRef.current = "Tour finished";
        setTourAnnouncement("Tour finished");
      }, 0);
      return;
    }
    tourAnnouncementRef.current = "Tour finished";
    setTourAnnouncement("Tour finished");
  }, []);
  const [openingNotebook, setOpeningNotebook] = useState(false);
  const [appearance, setAppearance] = useState<Appearance>(readAppearance);
  // Round 18: the appearance live region lives here (not inside the dialog)
  // so the announcement survives the dialog closing.
  const [appearanceAnnouncement, setAppearanceAnnouncement] = useState<string | null>(null);
  // Round 19 item 1 audit: EVERY user-initiated appearance change (theme
  // buttons, font buttons) must land text here; initial load stays silent
  // (null until the first chooseAppearance). A repeat selection carries
  // identical text, which would bail out of useState with no DOM mutation
  // — so AT hears nothing. Clear-then-re-set in a later task forces a real
  // mutation so the repeat re-announces. The seq guards a stale repeat
  // timeout against a newer announcement. Dialog close/reopen intentionally
  // preserves the last text (no clearing on close).
  const appearanceAnnouncementRef = useRef<string | null>(null);
  const appearanceAnnounceSeq = useRef(0);
  const announceAppearance = useCallback((message: string) => {
    appearanceAnnounceSeq.current += 1;
    const seq = appearanceAnnounceSeq.current;
    if (appearanceAnnouncementRef.current === message) {
      appearanceAnnouncementRef.current = null;
      setAppearanceAnnouncement(null);
      window.setTimeout(() => {
        if (appearanceAnnounceSeq.current !== seq) return;
        appearanceAnnouncementRef.current = message;
        setAppearanceAnnouncement(message);
      }, 0);
    } else {
      appearanceAnnouncementRef.current = message;
      setAppearanceAnnouncement(message);
    }
  }, []);
  // Persistent announcement: NotebookPicker unmounts the moment a created
  // notebook opens, so its local status region would vanish with the name.
  // This top-level region survives the navigation.
  const [notice, setNotice] = useState<string | null>(null);
  // First-save celebration: assertive, once per notebook, only on a real
  // 0→1 transition (fresh loads of non-empty notebooks stay silent).
  const [saveAnnouncement, setSaveAnnouncement] = useState<string | null>(null);
  const sourcesCountPrev = useRef(0);
  const firstSaveFor = useRef<string | null>(null);
  // Win announcements (notice, saveAnnouncement) are one-shot: a newer win
  // overwrites, and the next meaningful action in a different context
  // (notebook switch/home, new search) clears them so AT never re-hears
  // a stale win after unrelated actions.
  const noticeNotebookRef = useRef<string | null>(null);
  const markSearched = useCallback(() => {
    setHasSearched(true);
    setNotice(null);
    setSaveAnnouncement(null);
    setExportedTick(false);
  }, []);

  // The delete confirmation is the newest win: retire the older App-level
  // wins. (No epoch bump here — the delete announcement itself is set after
  // this, and a bump would immediately retire it again.)
  const handleSourceDeleted = useCallback(() => {
    setNotice(null);
    setSaveAnnouncement(null);
    setExportedTick(false);
  }, []);
  // Responsive navs: the off-breakpoint bar is UNMOUNTED, never merely
  // hidden+inert (Round 25 item 6 — a hidden-but-mounted twin kept duplicate
  // names in the tree). Mobile (<lg): bottom bar. Desktop xl: rail.
  // Between (lg-only): the "Workspace sections" tablist carries navigation.
  const isLg = useMediaQuery("(min-width: 1024px)");
  const isXl = useMediaQuery("(min-width: 1280px)");
  const lgTabsActive = isLg && !isXl;
  const mobileTabsActive = !isLg;

  useEffect(() => {
    applyAppearance(appearance);
    saveAppearance(appearance);
  }, [appearance]);

  // The Exported pill persists until the user's next action (another
  // export, a notebook switch, or the dismiss button) — never a timer,
  // so the confirmation is still there when a slower reader looks for it.

  const handleAuthed = useCallback((nextUser: User, isNewAccount = false) => {
    const stage = isNewAccount ? "landing" : savedTourStage(nextUser.id);
    if (isNewAccount) localStorage.setItem(tourKey(nextUser.id), stage);
    setTourStage(stage);
    setTourIndex(0);
    setUser(nextUser);
    if (isSoundEnabled()) playBoot();
  }, []);

  const refreshNotebooks = useCallback(async () => {
    try {
      setNotebooks(await api.listNotebooks());
      setBackendUp(true);
    } catch {
      setBackendUp(false);
    }
  }, []);

  // Post-save refresh: celebrates a real 0→N transition as the notebook's
  // first save, exactly once per notebook. Opening/switching notebooks uses
  // loadSourcesBaseline instead, so pre-existing sources never celebrate.
  const refreshSources = useCallback(async (id: string) => {
    const before = sourcesCountPrev.current;
    try {
      const next = await api.listSources(id);
      setSources(next);
      sourcesCountPrev.current = next.length;
      if (next.length > 0) {
        setHasAddedSource(true);
        setExportNotice(null);
      }
      if (before === 0 && next.length > 0 && firstSaveFor.current !== id) {
        firstSaveFor.current = id;
        setSaveAnnouncement("First source saved — your library is underway.");
        // Newest win: retire the create notice and any export pill.
        setNotice(null);
        setExportedTick(false);
        setWinEpoch((epoch) => epoch + 1);
      }
      return next.length;
    } catch {
      setSources([]);
      sourcesCountPrev.current = 0;
      return 0;
    }
  }, []);

  // Baseline load for opening or switching notebooks: seeds the count
  // without celebrating — these sources already existed.
  const loadSourcesBaseline = useCallback(async (id: string) => {
    try {
      const next = await api.listSources(id);
      setSources(next);
      sourcesCountPrev.current = next.length;
      if (next.length > 0) {
        setHasAddedSource(true);
        setExportNotice(null);
      }
    } catch {
      setSources([]);
      sourcesCountPrev.current = 0;
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    refreshNotebooks();
  }, [user, refreshNotebooks]);

  useEffect(() => {
    if (!api.getToken()) {
      setAuthReady(true);
      return;
    }
    api.me()
      .then((nextUser) => handleAuthed(nextUser))
      .catch(() => api.clearToken())
      .finally(() => setAuthReady(true));
    const onUnauthorized = () => {
      setUser(null);
      setNotebook(null);
      setSources([]);
      setNotebooks([]);
    };
    window.addEventListener("research:unauthorized", onUnauthorized);
    return () => window.removeEventListener("research:unauthorized", onUnauthorized);
  }, [handleAuthed]);

  // Round 24 item 4: the waiting-stage workspace auto-open is GONE (it
  // ambushed the creation moment). The workspace tour opens only via the
  // consent banner's Resume or a manual "Take a tour". Landing auto-open
  // (handleAuthed new-account → "landing") stays as-is.
  // A notebook opened mid-landing-tour (early create) parks the tour in
  // "waiting" so the banner offers the rest — synchronously, with no focus
  // steal, so the creation announcement still lands first.
  useEffect(() => {
    if (!user || !notebook || tourStage !== "landing") return;
    localStorage.setItem(tourKey(user.id), "waiting");
    setTourStage("waiting");
    setTourIndex(0);
  }, [user, notebook, tourStage]);

  const finishTour = () => {
    if (user) localStorage.setItem(tourKey(user.id), "done");
    // Round 25 item 5: the finale text lands in the App-PERSISTENT region
    // FIRST; the tour unmounts on the next tick. Same-commit text+unmount
    // fired the tour's focus-restore in the same breath, so live readers
    // never announced the finale (textContent "" to SR). Separating the
    // ticks lets the announcement land before focus moves. The announcer
    // itself is repeat-safe (clear-then-reset, FINAL item 2).
    announceTourFinished();
    setTourIndex(0);
    window.setTimeout(() => setTourStage("none"), 0);
  };

  const resumeTour = () => {
    if (!user) return;
    localStorage.setItem(tourKey(user.id), "workspace");
    clearTourAnnouncement();
    setTourIndex(0);
    setTourStage("workspace");
  };

  const advanceTour = () => {
    const steps = tourStage === "landing" ? LANDING_TOUR : WORKSPACE_TOUR;
    if (tourIndex < steps.length - 1) { setTourIndex((index) => index + 1); return; }
    if (tourStage === "landing") {
      if (user) localStorage.setItem(tourKey(user.id), "waiting");
      // Round 25 item 5: same next-tick split as finishTour — the landing
      // finale ("Done") announces in the persistent region first, then the
      // stage flips to "waiting" (banner offers the rest).
      announceTourFinished();
      setTourIndex(0);
      window.setTimeout(() => setTourStage("waiting"), 0);
    } else finishTour();
  };

  const startTour = (event?: React.MouseEvent<HTMLElement>) => {
    if (!user) return;
    const stage = notebook ? "workspace" : "landing";
    localStorage.setItem(tourKey(user.id), stage);
    // Capture the opener synchronously: the click target is still focused
    // here; by dialog mount time focus may have moved.
    setTourTrigger(event?.currentTarget instanceof HTMLElement ? event.currentTarget : null);
    clearTourAnnouncement();
    setTourStage(stage);
    setTourIndex(0);
  };
  const openSettings = (event?: React.MouseEvent<HTMLElement>) => {
    setSettingsTrigger(event?.currentTarget instanceof HTMLElement ? event.currentTarget : null);
    setShowSettings(true);
  };

  useEffect(() => {
    if (!user || !api.getToken()) return;
    api.getAISettings().then((settings) => setAIConfigured(settings.configured)).catch(() => setAIConfigured(false));
    api.getHostedAIStatus().then((status) => setHostedAIAvailable(status.enabled)).catch(() => setHostedAIAvailable(false));
    // Round 20 item 2: fetch persisted progress on login; a missing endpoint
    // (old server) rejects → keep null and fall back to local silently.
    api.getProgress().then(setServerProgress).catch(() => setServerProgress(null));
  }, [user]);

  useEffect(() => {
    if (notebook) {
      void loadSourcesBaseline(notebook.id);
      setView("research");
      setMobileSection("library");
      setMobileLibraryPane("sources");
      setExportError(null);
      setExportNotice(null);
      setExportedTick(false);
      // A win belongs to the notebook that earned it; arriving in a
      // different notebook means the win was consumed — clear it.
      if (noticeNotebookRef.current !== notebook.id) setNotice(null);
      if (firstSaveFor.current !== notebook.id) setSaveAnnouncement(null);
    } else {
      sourcesCountPrev.current = 0;
      setNotice(null);
      setSaveAnnouncement(null);
    }
  }, [notebook, loadSourcesBaseline]);

  const handleExport = async () => {
    if (!notebook || exportBusy) return;
    if (sources.length === 0) {
      // Nothing to celebrate: nudge instead of firing the download,
      // the success chime, or the Exported pill. Focus + remount so the
      // nudge is seen, focused, and announced every time (round 22 item 2).
      setExportNotice("Add a source first");
      setExportNudgeKey((key) => key + 1);
      return;
    }
    setExportBusy(true);
    setExportError(null);
    setExportNotice(null);
    setExportedTick(false);
    try {
      await api.downloadNotebook(notebook.id);
      playSuccess();
      setExportedTick(true);
      // Newest win: retire the create/save notices.
      setNotice(null);
      setSaveAnnouncement(null);
      setWinEpoch((epoch) => epoch + 1);
      setHasWon(true);
      setHasExportedOrReviewed(true);
      setSoundOn(isSoundEnabled());
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "export failed");
    } finally {
      setExportBusy(false);
    }
  };

  const openNotebook = (nb: Notebook) => {
    setOpeningNotebook(true);
    setNotebook(nb);
    setMobileSection("library");
    setMobileLibraryPane("sources");
    revealSourcesPane();
    void loadSourcesBaseline(nb.id).finally(() => {
      window.setTimeout(() => setOpeningNotebook(false), 300);
    });
  };

  const selectMobileSection = (section: MobileSection) => {
    setMobileSection(section);
    const nextView = defaultViewForSection(section);
    if (nextView) setView(nextView);
  };

  // After create/open the user lands mid-workspace with the list below the
  // fold: select the Library/sources context and bring the sources card
  // into view, focusing its heading (falls back to #main-content).
  const revealSourcesPane = useCallback(() => {
    const showSources = () => {
      const card = document.querySelector('[data-tour="source-list"]');
      if (card instanceof HTMLElement && typeof card.scrollIntoView === "function") {
        card.scrollIntoView({ block: "nearest" });
      }
      const heading = card?.querySelector("h2");
      if (heading instanceof HTMLElement) heading.focus();
      else document.getElementById("main-content")?.focus();
    };
    // The workspace paints after the notebook state flush; wait for it so
    // focus never strands on <body>.
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => window.requestAnimationFrame(showSources));
    } else {
      window.setTimeout(showSources, 0);
    }
  }, []);

  // After create the checklist's next step is "add a source": land focus on
  // the add-source entry control (the paste-title input when the paste
  // editor is open, else the add-sources card itself) instead of the
  // sources list, so keyboard users start where the checklist points.
  //
  // Round 25 items 2+7: the paste editor starts collapsed, and an unlabelled
  // dropzone DIV must never take focus — so reveal first bumps the
  // UploadZone expand epoch (a no-op when already open), then focuses the
  // named #paste-title input once it exists. The bump runs inside the
  // deferred paint callback so a freshly mounted UploadZone (post-create)
  // observes it as a change; the add-sources card region (role=region,
  // aria-label="Add sources") stays the named fallback.
  const [pasteExpandTick, setPasteExpandTick] = useState(0);
  const revealAddSources = useCallback(() => {
    const showEntry = () => {
      setPasteExpandTick((tick) => tick + 1);
      const focusEntry = () => {
        const card = document.querySelector('[data-tour="add-sources"]');
        if (card instanceof HTMLElement && typeof card.scrollIntoView === "function") {
          card.scrollIntoView({ block: "nearest" });
        }
        const pasteTitle = card?.querySelector("#paste-title");
        if (pasteTitle instanceof HTMLElement) pasteTitle.focus();
        else if (card instanceof HTMLElement) card.focus();
        else document.getElementById("main-content")?.focus();
      };
      // The expand above commits first; focus after it paints so #paste-title
      // exists instead of landing on the card while the editor opens.
      if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(() => window.requestAnimationFrame(focusEntry));
      } else {
        window.setTimeout(focusEntry, 0);
      }
    };
    // The workspace paints after the notebook state flush; wait for it so
    // focus never strands on <body>.
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => window.requestAnimationFrame(showEntry));
    } else {
      window.setTimeout(showEntry, 0);
    }
  }, []);

  const goToPasteSources = () => {
    selectMobileSection("library");
    // FINAL item 4 audit: the old chain bumped the expand epoch
    // synchronously and only scrolled — focus relied on UploadZone's
    // showPaste effect, which fires SOLELY on the collapsed→open
    // transition. With the editor already open the bump was a showPaste
    // no-op (no focus effect, focus stayed on the link), and a bump racing
    // a fresh UploadZone mount was adopted as "seen" and swallowed (never
    // expanded) — the keyboard run stranded focus on a notebook control
    // instead of the title. Mirror revealAddSources: defer the bump until
    // after the library pane paints (mounts observe it as a change), then
    // explicitly focus #paste-title with the labeled add-sources region as
    // the only fallback — never a bare node.
    const expandAndFocus = () => {
      setPasteExpandTick((tick) => tick + 1);
      const focusEntry = () => {
        const card = document.querySelector('[data-tour="add-sources"]');
        if (card instanceof HTMLElement && typeof card.scrollIntoView === "function") {
          card.scrollIntoView({ block: "nearest" });
        }
        const pasteTitle = card?.querySelector("#paste-title");
        if (pasteTitle instanceof HTMLElement) pasteTitle.focus();
        else if (card instanceof HTMLElement) card.focus();
        else document.getElementById("main-content")?.focus();
      };
      // The expand above commits first; focus after it paints so #paste-title
      // exists instead of landing on the card while the editor opens.
      if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(() => window.requestAnimationFrame(focusEntry));
      } else {
        window.setTimeout(focusEntry, 0);
      }
    };
    // Let the library pane render first, then expand + focus.
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => window.requestAnimationFrame(expandAndFocus));
    } else {
      window.setTimeout(expandAndFocus, 0);
    }
  };

  const selectView = (next: WorkspaceView) => {
    setView(next);
    setMobileSection(mobileSectionForView(next));
    if (next === "notes") setMobileLibraryPane("notes");
  };

  // Desktop rail arrow-key model: every view button stays tabbable
  // (tabIndex 0 — no roving tabindex, so keyboard users meet every view
  // in Tab order) + ArrowUp/Down/Home/End move focus between view buttons.
  // Activation stays on Enter/Space via the existing click handler.
  const handleRailKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (
      event.key !== "ArrowUp" &&
      event.key !== "ArrowDown" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
    );
    if (buttons.length === 0) return;
    const active = document.activeElement;
    let index = buttons.findIndex((button) => button === active);
    if (index === -1) {
      index = buttons.findIndex((button) => button.getAttribute("aria-current") === "page");
    }
    if (index === -1) index = 0;
    event.preventDefault();
    let next = index;
    if (event.key === "ArrowDown") next = (index + 1) % buttons.length;
    else if (event.key === "ArrowUp") next = (index - 1 + buttons.length) % buttons.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = buttons.length - 1;
    buttons[next].focus();
  };

  const logOut = async () => {
    try {
      await api.logout();
    } catch {
      api.clearToken();
    }
    setUser(null);
    setNotebook(null);
    setSources([]);
    setNotebooks([]);
    setAIConfigured(false);
    setTourStage("none");
    // The workspace unmounts under focus: land on the auth screen's
    // #main-content once it paints instead of stranding on BODY.
    const focusAuth = () => document.getElementById("main-content")?.focus();
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => window.requestAnimationFrame(focusAuth));
    } else {
      window.setTimeout(focusAuth, 0);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-neutral-100 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-neutral-950"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to workspace
      </a>
      {/* Round 23 item 3: named collision-free ("Site announcements") so
          /notebook/i queries never match this region alongside the
          "Notebook name" input. */}
      <p role="status" aria-label="Site announcements" aria-live="polite" aria-atomic="true" className="sr-only">
        {notice}
      </p>
      <p role="status" aria-label="Appearance announcement" aria-live="polite" aria-atomic="true" className="sr-only">
        {appearanceAnnouncement}
      </p>
      {/* Round 24 item 3: persistent tour-end announcement — survives the
          tour unmount so "Tour finished" is never lost with the dialog. */}
      <p role="status" aria-label="Tour announcement" aria-live="polite" aria-atomic="true" className="sr-only">
        {tourAnnouncement}
      </p>
      <header className="sticky top-0 z-40 flex min-h-16 shrink-0 items-center gap-1.5 border-b border-neutral-800 bg-neutral-900/95 px-3 shadow-[0_1px_10px_rgba(6,48,62,0.04)] backdrop-blur sm:gap-3 sm:px-7">
        <button
          data-tour="home"
          type="button"
          aria-label="Notaeo home"
          className="flex min-h-11 items-center gap-2.5 rounded-lg px-1 font-display text-xl font-bold tracking-tight hover:text-aqua"
          onClick={() => setNotebook(null)}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-[11px] bg-brand-deep font-display text-lg text-mark" aria-hidden="true">n.</span>
          Notaeo
        </button>
        {notebook && (
          <nav className="hidden min-w-0 items-center gap-2 text-sm text-neutral-500 sm:flex" aria-label="Breadcrumb">
            <span aria-hidden="true" className="px-1 text-neutral-700">/</span>
            <span className="truncate text-neutral-300">{notebook.name}</span>
            {sources.length > 0 && (
              <span className="hidden sm:inline text-xs text-neutral-600">
                · {sources.length} source{sources.length === 1 ? "" : "s"}
              </span>
            )}
          </nav>
        )}
        <div data-testid="header-actions" className="ml-auto flex items-center gap-1 sm:gap-2">
          {!backendUp && <Badge tone="warn">backend not reachable</Badge>}
          {user && (
            <>
              <button type="button" aria-label="Take a tour" className="flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 py-2 text-xs font-medium text-neutral-500 transition-colors hover:bg-seafoam hover:text-neutral-100 sm:px-3" onClick={(e) => startTour(e)}><span aria-hidden="true" className="sm:hidden">Tour</span><span className="hidden sm:inline">Take a tour</span></button>
              <button data-tour="settings" type="button" className="inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-xs font-medium text-neutral-500 transition-colors hover:bg-seafoam hover:text-neutral-100" onClick={(e) => openSettings(e)}>Settings</button>
              <span data-testid="header-email-text" aria-hidden="true" className="hidden max-w-40 truncate text-xs text-neutral-500 sm:inline">
                {user.email}
              </span>
              <button
                aria-label={`Log out ${user.email}`}
                className="flex h-9 w-9 min-h-11 min-w-11 items-center justify-center rounded-full border border-neutral-800 bg-seafoam text-xs font-semibold text-wave transition-colors hover:border-aqua"
                onClick={logOut}
              >
                {user.email.charAt(0).toUpperCase()}
                <span className="sr-only">{user.email}</span>
              </button>
            </>
          )}
        </div>
      </header>

      {!authReady ? (
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-8 outline-none">
          <div className="flex flex-col items-center gap-3 pt-16">
            <FolioLoader title="Preparing your workspace…" stages={["Laying folio flat…", "Linking excerpts…", "Settling citation marker…"]} />
          </div>
        </main>
      ) : !user ? (
        <AuthPanel onAuthed={handleAuthed} />
      ) : !notebook ? (
        <NotebookPicker
          notebooks={notebooks}
          tourPending={tourStage === "waiting"}
          tourActive={tourStage !== "none"}
          userId={user.id}
          sourcesCount={mergedHasAddedSource ? 1 : 0}
          hasSearched={mergedHasSearched}
          hasExportedOrReviewed={mergedHasExportedOrReviewed}
          onOpen={openNotebook}
          onCreate={async (name) => {
            const nb = await api.createNotebook(name);
            await refreshNotebooks();
            setNotebook(nb);
            setMobileSection("library");
            setMobileLibraryPane("sources");
            setNotice(`Notebook ${nb.name} created`);
            noticeNotebookRef.current = nb.id;
            setSaveAnnouncement(null);
            setExportedTick(false);
            setWinEpoch((epoch) => epoch + 1);
            // INTENTIONAL (round 19 item 5): post-create lands on the Research
            // view — not the Sources view — because the START-HERE cards there
            // guide new owners to sources. revealAddSources() then focuses the
            // add-source entry so the checklist's next step is ready for input.
            // The workspace paints after this state flush; land on the
            // add-source entry control so the checklist's next step is
            // already focused.
            revealAddSources();
            return nb;
          }}
          onDelete={async (id) => {
            // Capture the name before the refresh drops the row: the delete
            // is silent for AT otherwise (the region would just recount).
            const deletedName = notebooks.find((nb) => nb.id === id)?.name ?? "Notebook";
            await api.deleteNotebook(id);
            await refreshNotebooks();
            setNotice(`Notebook ${deletedName} deleted`);
            noticeNotebookRef.current = null;
            setSaveAnnouncement(null);
            setExportedTick(false);
          }}
        />
      ) : (
        <div key={notebook.id} className="mx-auto grid w-full max-w-[1600px] flex-1 gap-4 p-4 pb-24 sm:p-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:pb-6 xl:grid-cols-[240px_minmax(0,1fr)_340px] xl:gap-0 xl:p-0 animate-page-in">
          {saveAnnouncement && (
            <p role="alert" aria-label="Save announcement" aria-live="assertive" aria-atomic="true" className="sr-only">
              {saveAnnouncement}
            </p>
          )}
          {/* Round 22 item 3: the export win left this region null while
              focus moved to Dismiss. Mirror "Exported" here too (Dismiss
              focus unchanged) so AT finds the confirmation in the region. */}
          {!saveAnnouncement && exportedTick && (
            <p role="alert" aria-label="Save announcement" aria-live="assertive" aria-atomic="true" className="sr-only">
              Exported — your notebook download is ready.
            </p>
          )}
          {isXl && (
          <nav aria-label="Workspace tools" className="hidden border-r border-neutral-800 bg-neutral-900/60 px-3 py-6 xl:sticky xl:top-16 xl:order-1 xl:flex xl:h-[calc(100vh-4rem)] xl:flex-col">
            <button type="button" onClick={() => setNotebook(null)} className="mb-8 flex min-h-11 items-center gap-2 rounded-xl px-3 text-left text-xs font-semibold text-neutral-500 hover:bg-neutral-900 hover:text-neutral-100"><span aria-hidden="true">←</span> All notebooks</button>
            <p className="px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-600">Workspace</p>
            <div data-tour="workspace-tabs" className="mt-3 space-y-1" onKeyDown={handleRailKeyDown}>
              {WORKSPACE_VIEWS.map((option) => (
                <button key={option.value} type="button" aria-label={option.label} aria-current={view === option.value ? "page" : undefined} tabIndex={0} onClick={() => selectView(option.value)} className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition-colors ${view === option.value ? "bg-brand-deep text-mark shadow-sm" : "text-neutral-500 hover:bg-neutral-900 hover:text-neutral-100"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${view === option.value ? "bg-aquabright" : "bg-neutral-700"}`} aria-hidden="true" />{option.label}
                </button>
              ))}
            </div>
            <div className="mt-auto rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <p className="font-display text-base font-semibold">Make it yours.</p>
              <p className="mt-1 text-xs leading-relaxed text-neutral-500">Your sources, notes, and exports stay together in this notebook.</p>
            </div>
          </nav>
          )}
          <aside className={`${mobileSection === "library" ? "block" : "hidden"} min-w-0 space-y-4 lg:sticky lg:top-[84px] lg:block lg:self-start lg:max-h-[calc(100vh-104px)] lg:overflow-y-auto xl:top-16 xl:order-3 xl:h-[calc(100vh-4rem)] xl:max-h-none xl:space-y-0 xl:border-l xl:border-neutral-800 xl:bg-neutral-900/45 xl:p-4`}>
            <div className="hidden px-1 pb-4 xl:block"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-aqua">Source library</p><h2 className="mt-1 font-display text-xl font-semibold">Your material <span className="font-sans text-sm font-normal text-neutral-500">{sources.length}</span></h2></div>
            {mobileTabsActive && mobileSection === "library" && (
              <Tabs
                label="Library"
                options={[{ value: "sources", label: "Sources" }, { value: "notes", label: "Notes" }]}
                value={mobileLibraryPane}
                onChange={setMobileLibraryPane}
                className="lg:hidden"
              />
            )}
            <div className={`${mobileLibraryPane === "sources" ? "space-y-5" : "hidden"} lg:block lg:space-y-5`}>
            <div data-tour="add-sources" tabIndex={-1} role="region" aria-label="Add sources" className="rounded-2xl outline-none"><Card className="p-5">
              <UploadZone
                existingTitles={sources.map((s) => s.title)}
                expandSignal={pasteExpandTick}
                onUpload={async (files) => {
                  const res = await api.uploadFiles(notebook.id, files);
                  await refreshSources(notebook.id);
                  return res.errors;
                }}
                onPaste={async (title, text, opts) => {
                  // Same-title pastes render identical truncated rows, so
                  // suffix collisions before saving ("Name (2)", …).
                  const uniqueTitle = uniqueSourceTitle(
                    title,
                    sources.map((s) => s.title),
                  );
                  const result = await api.addPaste(notebook.id, uniqueTitle, text, opts);
                  // Warn-before-save: saved:false means nothing was persisted,
                  // so warn inline without refreshing counts. Every other
                  // shape (legacy warn-after-save included) already saved.
                  if (!result || result.saved !== false) {
                    await refreshSources(notebook.id);
                  }
                  return result;
                }}
              />
            </Card></div>
            <div data-tour="source-list"><Card className="p-5">
              <SourceList
                sources={sources}
                onOpen={openReader}
                onDelete={async (id) => {
                  await api.deleteSource(id);
                  await refreshSources(notebook.id);
                }}
                onDeleted={handleSourceDeleted}
                clearSignal={winEpoch}
              />
              <div className="mt-4 border-t border-neutral-800 pt-3">
                <button
                  data-tour="export-notebook"
                  ref={exportButtonRef}
                  className="inline-flex min-h-11 items-center text-xs font-medium text-neutral-300 underline hover:text-neutral-100 disabled:opacity-50"
                  onClick={handleExport}
                  disabled={exportBusy}
                >
                  {exportBusy ? "Exporting…" : "Export notebook (.zip)"}
                </button>
                {exportedTick && (
                  <span role="status" className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-950 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
                    Exported ✓
                    <button
                      type="button"
                      aria-label="Dismiss export confirmation"
                      className="ml-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-1 text-emerald-300 hover:bg-emerald-900 hover:text-emerald-100"
                      // FINAL item 5: the pill unmounts under a focused × —
                      // without a restore, focus falls to BODY. Return it to
                      // the Export control (the chosen post-export home).
                      onClick={() => {
                        setExportedTick(false);
                        exportButtonRef.current?.focus();
                      }}
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </span>
                )}
                {exportedTick && hasWon && !soundOn && (
                  <>
                    <button
                      type="button"
                      className="ml-2 min-h-11 rounded-lg px-2 text-[11px] font-medium text-aqua underline underline-offset-2 hover:text-wave"
                      onClick={(e) => openSettings(e)}
                    >
                      Turn on chimes?
                    </button>
                    <button
                      type="button"
                      aria-label="Preview chime"
                      className="min-h-11 rounded-lg px-2 text-[11px] font-medium text-neutral-500 underline underline-offset-2 hover:text-neutral-100"
                      onClick={() => previewChime()}
                    >
                      Preview
                    </button>
                  </>
                )}
                {exportNotice && (
                  <p key={exportNudgeKey} ref={exportNoticeRef} tabIndex={-1} role="status" className="mt-1 text-[11px] text-aqua outline-none">
                    {exportNotice}
                  </p>
                )}
                {exportError && (
                  <p role="alert" className="mt-1 text-[11px] text-red-400">
                    Export failed: {exportError}
                  </p>
                )}
                <p className="mt-1 text-[11px] text-neutral-600">Obsidian-style markdown, including guides and reports.</p>
              </div>
            </Card></div>
            </div>
            {mobileLibraryPane === "notes" && (
              <div className="block lg:hidden">
                <NotesPanel notebookId={notebook.id} capturedNote={capturedNote} />
              </div>
            )}
          </aside>
          <main id="main-content" tabIndex={-1} className={`${mobileSection === "library" ? "hidden" : "block"} min-w-0 space-y-5 outline-none lg:block xl:order-2 xl:p-7`}>
            <div className="hidden items-end justify-between border-b border-neutral-800 pb-5 xl:flex"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-aqua">{notebook.name}</p><h1 className="mt-1 font-display text-3xl font-semibold">{WORKSPACE_VIEWS.find((option) => option.value === view)?.label}</h1></div><span className="text-xs text-neutral-500">{sources.length} source{sources.length === 1 ? "" : "s"} in this notebook</span></div>
            {lgTabsActive && (
              <div data-tour="workspace-tabs" className="hidden lg:block xl:hidden"><Tabs label="Workspace sections" options={WORKSPACE_VIEWS} value={view} onChange={selectView} /></div>
            )}
            {mobileSection !== "library" && mobileTabsActive && (
              <Tabs
                label="Current section views"
                options={WORKSPACE_VIEWS.filter((option) => viewsForMobileSection(mobileSection).includes(option.value))}
                value={view}
                onChange={selectView}
                className="lg:hidden"
              />
            )}
            {view === "research" && (
              <>
                <ResearchPanel
                  notebookId={notebook.id}
                  aiConfigured={aiConfigured}
                  onSourcesChanged={() => refreshSources(notebook.id)}
                />
                {sources.length === 0 && (
                  <section className="pt-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-aqua">Start here</p>
                    <h2 className="mt-1 font-display text-2xl font-semibold">A good place to begin</h2>
                    <p className="mt-2 max-w-xl text-sm leading-relaxed text-neutral-500">Every strong project starts with something to explore. Add a source from the library, or discover something new on the public web.</p>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <button type="button" onClick={() => selectView("search")} className="group rounded-2xl border border-neutral-800 bg-neutral-900 p-5 text-left shadow-[0_4px_22px_rgba(6,48,62,0.035)] transition hover:-translate-y-0.5 hover:border-aqua/50">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-seafoam text-lg text-aqua" aria-hidden="true">⌕</span>
                        <span className="mt-4 block font-display text-lg font-semibold">Find a source</span>
                        <span className="mt-1 block text-xs leading-relaxed text-neutral-500">Search for a topic and bring useful pages into this notebook.</span>
                        <span className="mt-4 block text-xs font-semibold text-aqua">Explore the web →</span>
                      </button>
                      <button type="button" onClick={() => selectView("notes")} className="group rounded-2xl border border-neutral-800 bg-neutral-900 p-5 text-left shadow-[0_4px_22px_rgba(6,48,62,0.035)] transition hover:-translate-y-0.5 hover:border-aqua/50">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-seafoam font-display text-lg text-aqua" aria-hidden="true">✎</span>
                        <span className="mt-4 block font-display text-lg font-semibold">Capture a thought</span>
                        <span className="mt-1 block text-xs leading-relaxed text-neutral-500">Begin with a note, then connect ideas as your library grows.</span>
                        <span className="mt-4 block text-xs font-semibold text-aqua">Open notes →</span>
                      </button>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-neutral-500">
                      Have text?{" "}
                      <button
                        type="button"
                        className="min-h-11 font-semibold text-aqua underline underline-offset-2 hover:text-wave"
                        onClick={goToPasteSources}
                      >
                        Paste it as a source →
                      </button>
                    </p>
                  </section>
                )}
              </>
            )}
            {view === "deep" && (
              <OutlinePanel
                notebookId={notebook.id}
                aiConfigured={aiConfigured}
                onSourcesChanged={() => refreshSources(notebook.id)}
              />
            )}
            {view === "ask" && (
              <ChatPanel
                notebookId={notebook.id}
                configured={aiConfigured}
                hostedAvailable={hostedAIAvailable}
                onConfigure={() => openSettings()}
                onOpenSource={openReader}
                onAsked={markSearched}
              />
            )}
            {view === "search" && (
              <SearchPanel
                onSearch={(q) => api.search(notebook.id, q)}
                onSearched={markSearched}
                onOpenSource={openReader}
                sourcesVersion={sources.length}
                onImportUrl={async (url) => {
                  await api.addUrl(notebook.id, url);
                  await refreshSources(notebook.id);
                }}
              />
            )}
            {view === "study" && <StudyPanel notebookId={notebook.id} onSourcesChanged={() => refreshSources(notebook.id)} onOpenSource={openReader} onReviewed={() => setHasExportedOrReviewed(true)} />}
            {view === "notes" && <NotesPanel notebookId={notebook.id} capturedNote={capturedNote} />}
            {view === "write" && <HumanizerPanel aiConfigured={aiConfigured} />}
            {view === "skills" && <SkillsPanel notebookId={notebook.id} />}
          </main>
          {!isLg && (
          <BottomNav
            label="Notebook sections"
            items={MOBILE_SECTIONS}
            value={mobileSection}
            onChange={selectMobileSection}
            className="fixed inset-x-0 bottom-0 lg:hidden"
          />
          )}
        </div>
      )}
      <SettingsDialog
        open={showSettings}
        trigger={settingsTrigger}
        onClose={() => {
          setShowSettings(false);
          setSoundOn(isSoundEnabled());
        }}
        onChanged={setAIConfigured}
        appearance={appearance}
        onAppearanceChange={setAppearance}
        onAppearanceAnnounce={announceAppearance}
      />
      <ReaderModal sourceId={readingId} trigger={readerTrigger} onClose={closeReader} onEvidenceSaved={setCapturedNote} onViewNotes={() => {
        setReadingId(null);
        selectView("notes");
      }} />
      {openingNotebook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/80">
          <FolioLoader compact title="Opening notebook…" stages={["Laying folio flat…", "Linking excerpts…"]} />
        </div>
      )}
      {user && tourStage === "waiting" && notebook && (
        <div role="region" aria-label="Continue the tour?" className="mx-auto mt-3 flex w-full max-w-[1600px] flex-wrap items-center gap-2 rounded-2xl border border-aqua/30 bg-seafoam px-4 py-3 text-sm text-neutral-200">
          <p className="min-w-0 flex-1">Continue the tour? See the rest inside this notebook.</p>
          <div className="flex gap-2">
            <button type="button" onClick={resumeTour} className="inline-flex min-h-11 items-center rounded-lg bg-neutral-100 px-3 py-2 text-xs font-semibold text-neutral-900 hover:bg-neutral-200">
              Resume tour
            </button>
            <button type="button" onClick={finishTour} className="inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-xs font-medium text-neutral-400 hover:text-neutral-100">
              Dismiss
            </button>
          </div>
        </div>
      )}
      {user && ((tourStage === "landing" && !notebook) || (tourStage === "workspace" && !!notebook)) && (
        <FirstRunTour
          trigger={tourTrigger}
          step={(tourStage === "landing" ? LANDING_TOUR : WORKSPACE_TOUR)[tourIndex]}
          index={tourIndex}
          total={(tourStage === "landing" ? LANDING_TOUR : WORKSPACE_TOUR).length}
          nextLabel={tourStage === "landing" && tourIndex === LANDING_TOUR.length - 1 ? "Done" : tourStage === "workspace" && tourIndex === WORKSPACE_TOUR.length - 1 ? "Finish" : "Next"}
          onNext={advanceTour}
          onBack={() => setTourIndex((index) => Math.max(0, index - 1))}
          onSkip={finishTour}
        />
      )}
    </div>
  );
}
