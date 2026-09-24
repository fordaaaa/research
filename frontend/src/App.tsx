import { useCallback, useEffect, useState } from "react";
import * as api from "./api";
import type { Note, Notebook, SourceSummary, User } from "./api";
import AuthPanel from "./components/AuthPanel";
import NotebookPicker from "./components/NotebookPicker";
import UploadZone from "./components/UploadZone";
import SourceList from "./components/SourceList";
import SearchPanel from "./components/SearchPanel";
import ResearchPanel from "./components/ResearchPanel";
import ChatPanel from "./components/ChatPanel";
import SettingsDialog from "./components/SettingsDialog";
import OutlinePanel from "./components/OutlinePanel";
import HumanizerPanel from "./components/HumanizerPanel";
import SkillsPanel from "./components/SkillsPanel";
import ThinkingDots from "./components/ThinkingDots";
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

const MOBILE_SECTIONS: { value: MobileSection; label: string }[] = [
  { value: "library", label: "Library" },
  { value: "discover", label: "Discover" },
  { value: "learn", label: "Learn" },
  { value: "write", label: "Write" },
  { value: "ai", label: "AI" },
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
  const [readingId, setReadingId] = useState<string | null>(null);
  const [capturedNote, setCapturedNote] = useState<Note | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [tourStage, setTourStage] = useState<TourStage>("none");
  const [tourIndex, setTourIndex] = useState(0);
  const [appearance, setAppearance] = useState<Appearance>(readAppearance);

  useEffect(() => {
    applyAppearance(appearance);
    saveAppearance(appearance);
  }, [appearance]);

  const handleAuthed = useCallback((nextUser: User, isNewAccount = false) => {
    const stage = isNewAccount ? "landing" : savedTourStage(nextUser.id);
    if (isNewAccount) localStorage.setItem(tourKey(nextUser.id), stage);
    setTourStage(stage);
    setTourIndex(0);
    setUser(nextUser);
  }, []);

  const refreshNotebooks = useCallback(async () => {
    try {
      setNotebooks(await api.listNotebooks());
      setBackendUp(true);
    } catch {
      setBackendUp(false);
    }
  }, []);

  const refreshSources = useCallback(async (id: string) => {
    try {
      setSources(await api.listSources(id));
    } catch {
      setSources([]);
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

  useEffect(() => {
    if (!user || !notebook || (tourStage !== "waiting" && tourStage !== "landing")) return;
    localStorage.setItem(tourKey(user.id), "workspace");
    setTourIndex(0);
    setTourStage("workspace");
  }, [user, notebook, tourStage]);

  const finishTour = () => {
    if (user) localStorage.setItem(tourKey(user.id), "done");
    setTourStage("none");
    setTourIndex(0);
  };

  const advanceTour = () => {
    const steps = tourStage === "landing" ? LANDING_TOUR : WORKSPACE_TOUR;
    if (tourIndex < steps.length - 1) { setTourIndex((index) => index + 1); return; }
    if (tourStage === "landing") {
      if (user) localStorage.setItem(tourKey(user.id), "waiting");
      setTourStage("waiting");
      setTourIndex(0);
    } else finishTour();
  };

  const startTour = () => {
    if (!user) return;
    const stage = notebook ? "workspace" : "landing";
    localStorage.setItem(tourKey(user.id), stage);
    setTourStage(stage);
    setTourIndex(0);
  };

  useEffect(() => {
    if (!user) return;
    api.getAISettings().then((settings) => setAIConfigured(settings.configured)).catch(() => setAIConfigured(false));
    api.getHostedAIStatus().then((status) => setHostedAIAvailable(status.enabled)).catch(() => setHostedAIAvailable(false));
  }, [user]);

  useEffect(() => {
    if (notebook) {
      refreshSources(notebook.id);
      setView("research");
      setMobileSection("library");
      setMobileLibraryPane("sources");
      setExportError(null);
    }
  }, [notebook, refreshSources]);

  const handleExport = async () => {
    if (!notebook || exportBusy) return;
    setExportBusy(true);
    setExportError(null);
    try {
      await api.downloadNotebook(notebook.id);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "export failed");
    } finally {
      setExportBusy(false);
    }
  };

  const openNotebook = (nb: Notebook) => setNotebook(nb);

  const selectMobileSection = (section: MobileSection) => {
    setMobileSection(section);
    const nextView = defaultViewForSection(section);
    if (nextView) setView(nextView);
  };

  const selectView = (next: WorkspaceView) => {
    setView(next);
    setMobileSection(mobileSectionForView(next));
    if (next === "notes") setMobileLibraryPane("notes");
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
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      <header className="sticky top-0 z-40 flex min-h-16 shrink-0 items-center gap-3 border-b border-neutral-800 bg-neutral-900/95 px-4 shadow-[0_1px_10px_rgba(6,48,62,0.04)] backdrop-blur sm:px-7">
        <button
          data-tour="home"
          className="flex items-center gap-2.5 font-display text-xl font-bold tracking-tight hover:text-aqua"
          onClick={() => setNotebook(null)}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-[11px] bg-brand-deep font-display text-lg text-mark" aria-hidden="true">n.</span>
          Notaeo
        </button>
        {notebook && (
          <nav className="min-w-0 flex items-center gap-2 text-sm text-neutral-500" aria-label="Breadcrumb">
            <span aria-hidden="true" className="px-1 text-neutral-700">/</span>
            <span className="truncate text-neutral-300">{notebook.name}</span>
            {sources.length > 0 && (
              <span className="hidden sm:inline text-xs text-neutral-600">
                · {sources.length} source{sources.length === 1 ? "" : "s"}
              </span>
            )}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-2">
          {!backendUp && <Badge tone="warn">backend not reachable</Badge>}
          {user && (
            <>
              <button type="button" aria-label="Take a tour" className="flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 py-2 text-xs font-medium text-neutral-500 transition-colors hover:bg-seafoam hover:text-neutral-100 sm:px-3" onClick={startTour}><span aria-hidden="true" className="sm:hidden">?</span><span className="hidden sm:inline">Take a tour</span></button>
              <button data-tour="settings" type="button" className="rounded-lg px-3 py-2 text-xs font-medium text-neutral-500 transition-colors hover:bg-seafoam hover:text-neutral-100" onClick={() => setShowSettings(true)}>Settings</button>
              <button
                aria-label={`Log out ${user.email}`}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-800 bg-seafoam text-xs font-semibold text-wave transition-colors hover:border-aqua"
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
        <main className="flex-1 overflow-y-auto p-8">
          <div className="flex flex-col items-center gap-3 pt-16">
            <ThinkingDots state="working" size={64} />
            <p className="text-center text-sm text-neutral-500">Loading…</p>
          </div>
        </main>
      ) : !user ? (
        <AuthPanel onAuthed={handleAuthed} />
      ) : !notebook ? (
        <NotebookPicker
          notebooks={notebooks}
          tourPending={tourStage === "waiting"}
          onOpen={openNotebook}
          onCreate={async (name) => {
            const nb = await api.createNotebook(name);
            await refreshNotebooks();
            setNotebook(nb);
          }}
          onDelete={async (id) => {
            await api.deleteNotebook(id);
            await refreshNotebooks();
          }}
        />
      ) : (
        <div key={notebook.id} className="mx-auto grid w-full max-w-[1600px] flex-1 gap-4 p-4 pb-24 sm:p-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:pb-6 xl:grid-cols-[215px_minmax(0,1fr)_300px] xl:gap-0 xl:p-0 animate-page-in">
          <nav aria-label="Workspace tools" className="hidden border-r border-neutral-800 bg-neutral-900/60 px-3 py-6 xl:sticky xl:top-16 xl:order-1 xl:flex xl:h-[calc(100vh-4rem)] xl:flex-col">
            <button type="button" onClick={() => setNotebook(null)} className="mb-8 flex min-h-11 items-center gap-2 rounded-xl px-3 text-left text-xs font-semibold text-neutral-500 hover:bg-neutral-900 hover:text-neutral-100"><span aria-hidden="true">←</span> All notebooks</button>
            <p className="px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-600">Workspace</p>
            <div data-tour="workspace-tabs" className="mt-3 space-y-1">
              {WORKSPACE_VIEWS.map((option) => (
                <button key={option.value} type="button" aria-label={option.label} aria-current={view === option.value ? "page" : undefined} onClick={() => selectView(option.value)} className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition-colors ${view === option.value ? "bg-brand-deep text-mark shadow-sm" : "text-neutral-500 hover:bg-neutral-900 hover:text-neutral-100"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${view === option.value ? "bg-aquabright" : "bg-neutral-700"}`} aria-hidden="true" />{option.label}
                </button>
              ))}
            </div>
            <div className="mt-auto rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <p className="font-display text-base font-semibold">Make it yours.</p>
              <p className="mt-1 text-xs leading-relaxed text-neutral-500">Your sources, notes, and exports stay together in this notebook.</p>
            </div>
          </nav>
          <aside className={`${mobileSection === "library" ? "block" : "hidden"} min-w-0 space-y-4 lg:sticky lg:top-[84px] lg:block lg:self-start lg:max-h-[calc(100vh-104px)] lg:overflow-y-auto xl:top-16 xl:order-3 xl:h-[calc(100vh-4rem)] xl:max-h-none xl:space-y-0 xl:border-l xl:border-neutral-800 xl:bg-neutral-900/45 xl:p-4`}>
            <div className="hidden px-1 pb-4 xl:block"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-aqua">Source library</p><h2 className="mt-1 font-display text-xl font-semibold">Your material <span className="font-sans text-sm font-normal text-neutral-500">{sources.length}</span></h2></div>
            <Tabs
              options={[{ value: "sources", label: "Sources" }, { value: "notes", label: "Notes" }]}
              value={mobileLibraryPane}
              onChange={setMobileLibraryPane}
              className="lg:hidden"
            />
            <div className={`${mobileLibraryPane === "sources" ? "space-y-5" : "hidden"} lg:block lg:space-y-5`}>
            <div data-tour="add-sources"><Card className="p-5">
              <UploadZone
                onUpload={async (files) => {
                  const res = await api.uploadFiles(notebook.id, files);
                  await refreshSources(notebook.id);
                  return res.errors;
                }}
                onPaste={async (title, text) => {
                  await api.addPaste(notebook.id, title, text);
                  await refreshSources(notebook.id);
                }}
              />
            </Card></div>
            <div data-tour="source-list"><Card className="p-5">
              <SourceList
                sources={sources}
                onOpen={setReadingId}
                onDelete={async (id) => {
                  await api.deleteSource(id);
                  await refreshSources(notebook.id);
                }}
              />
              <div className="mt-4 border-t border-neutral-800 pt-3">
                <button
                  data-tour="export-notebook"
                  className="text-xs font-medium text-neutral-300 underline hover:text-neutral-100 disabled:opacity-50"
                  onClick={handleExport}
                  disabled={exportBusy}
                >
                  {exportBusy ? "Exporting…" : "Export notebook (.zip)"}
                </button>
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
          <main className={`${mobileSection === "library" ? "hidden" : "block"} min-w-0 space-y-5 lg:block xl:order-2 xl:p-7`}>
            <div className="hidden items-end justify-between border-b border-neutral-800 pb-5 xl:flex"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-aqua">{notebook.name}</p><h1 className="mt-1 font-display text-3xl font-semibold">{WORKSPACE_VIEWS.find((option) => option.value === view)?.label}</h1></div><span className="text-xs text-neutral-500">{sources.length} source{sources.length === 1 ? "" : "s"} in this notebook</span></div>
            <div data-tour="workspace-tabs" className="hidden lg:block xl:hidden"><Tabs options={WORKSPACE_VIEWS} value={view} onChange={selectView} /></div>
            {mobileSection !== "library" && (
              <Tabs
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
                onConfigure={() => setShowSettings(true)}
                onOpenSource={setReadingId}
              />
            )}
            {view === "search" && (
              <SearchPanel
                onSearch={(q) => api.search(notebook.id, q)}
                onImportUrl={async (url) => {
                  await api.addUrl(notebook.id, url);
                  await refreshSources(notebook.id);
                }}
              />
            )}
            {view === "study" && <StudyPanel notebookId={notebook.id} onSourcesChanged={() => refreshSources(notebook.id)} onOpenSource={setReadingId} />}
            {view === "notes" && <NotesPanel notebookId={notebook.id} capturedNote={capturedNote} />}
            {view === "write" && <HumanizerPanel aiConfigured={aiConfigured} />}
            {view === "skills" && <SkillsPanel notebookId={notebook.id} />}
          </main>
          <BottomNav
            label="Notebook sections"
            items={MOBILE_SECTIONS}
            value={mobileSection}
            onChange={selectMobileSection}
            className="fixed inset-x-0 bottom-0 lg:hidden"
          />
        </div>
      )}
      <SettingsDialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
        onChanged={setAIConfigured}
        appearance={appearance}
        onAppearanceChange={setAppearance}
      />
      <ReaderModal sourceId={readingId} onClose={() => setReadingId(null)} onEvidenceSaved={setCapturedNote} onViewNotes={() => {
        setReadingId(null);
        selectView("notes");
      }} />
      {user && ((tourStage === "landing" && !notebook) || (tourStage === "workspace" && !!notebook)) && (
        <FirstRunTour
          step={(tourStage === "landing" ? LANDING_TOUR : WORKSPACE_TOUR)[tourIndex]}
          index={tourIndex}
          total={(tourStage === "landing" ? LANDING_TOUR : WORKSPACE_TOUR).length}
          nextLabel={tourStage === "landing" && tourIndex === LANDING_TOUR.length - 1 ? "Explore a notebook" : tourStage === "workspace" && tourIndex === WORKSPACE_TOUR.length - 1 ? "Finish" : "Next"}
          onNext={advanceTour}
          onBack={() => setTourIndex((index) => Math.max(0, index - 1))}
          onSkip={finishTour}
        />
      )}
    </div>
  );
}
