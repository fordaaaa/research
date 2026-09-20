import { useCallback, useEffect, useState } from "react";
import * as api from "./api";
import type { Notebook, SourceSummary, User } from "./api";
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

const MOBILE_SECTIONS: { value: MobileSection; label: string }[] = [
  { value: "library", label: "Library" },
  { value: "discover", label: "Discover" },
  { value: "learn", label: "Learn" },
  { value: "write", label: "Write" },
  { value: "ai", label: "AI" },
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
  const [showSettings, setShowSettings] = useState(false);
  const [readingId, setReadingId] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

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
      .then(setUser)
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
  }, []);

  useEffect(() => {
    if (!user) return;
    api.getAISettings().then((settings) => setAIConfigured(settings.configured)).catch(() => setAIConfigured(false));
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
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      <header className="sticky top-0 z-40 border-b border-neutral-800/80 bg-neutral-950/90 backdrop-blur px-4 sm:px-6 py-3 flex items-center gap-3 shrink-0">
        <button
          className="text-lg font-semibold tracking-tight hover:text-neutral-100"
          onClick={() => setNotebook(null)}
        >
          research
        </button>
        {notebook && (
          <nav className="min-w-0 flex items-center gap-2 text-sm text-neutral-500" aria-label="Breadcrumb">
            <span aria-hidden="true">/</span>
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
              <span className="hidden max-w-40 truncate text-xs text-neutral-500 sm:inline">{user.email}</span>
              <button
                className="rounded-full px-3 py-1 text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-100"
                onClick={logOut}
              >
                Log out
              </button>
            </>
          )}
          <button
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${aiConfigured ? "bg-emerald-950 text-emerald-300 hover:bg-emerald-900" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"}`}
            onClick={() => setShowSettings(true)}
          >
            {aiConfigured ? "AI ready" : "AI off"}
          </button>
        </div>
      </header>

      {!authReady ? (
        <main className="flex-1 overflow-y-auto p-8">
          <p className="text-center text-sm text-neutral-500">Loading…</p>
        </main>
      ) : !user ? (
        <AuthPanel onAuthed={setUser} />
      ) : !notebook ? (
        <NotebookPicker
          notebooks={notebooks}
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
        <div key={notebook.id} className="mx-auto w-full max-w-7xl flex-1 grid gap-5 p-4 pb-24 sm:p-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:pb-6 animate-page-in">
          <aside className={`${mobileSection === "library" ? "block" : "hidden"} min-w-0 space-y-5 lg:sticky lg:top-[60px] lg:block lg:self-start lg:max-h-[calc(100vh-84px)] lg:overflow-y-auto lg:pr-1`}>
            <Tabs
              options={[{ value: "sources", label: "Sources" }, { value: "notes", label: "Notes" }]}
              value={mobileLibraryPane}
              onChange={setMobileLibraryPane}
              className="lg:hidden"
            />
            <div className={`${mobileLibraryPane === "sources" ? "space-y-5" : "hidden"} lg:block lg:space-y-5`}>
            <Card className="p-5">
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
            </Card>
            <Card className="p-5">
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
            </Card>
            </div>
            {mobileLibraryPane === "notes" && (
              <div className="block lg:hidden">
                <NotesPanel notebookId={notebook.id} />
              </div>
            )}
          </aside>
          <main className={`${mobileSection === "library" ? "hidden" : "block"} min-w-0 space-y-5 lg:block`}>
            <Tabs options={WORKSPACE_VIEWS} value={view} onChange={selectView} className="hidden lg:flex" />
            {mobileSection !== "library" && (
              <Tabs
                options={WORKSPACE_VIEWS.filter((option) => viewsForMobileSection(mobileSection).includes(option.value))}
                value={view}
                onChange={selectView}
                className="lg:hidden"
              />
            )}
            {view === "research" && (
              <ResearchPanel
                notebookId={notebook.id}
                aiConfigured={aiConfigured}
                onSourcesChanged={() => refreshSources(notebook.id)}
              />
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
            {view === "study" && <StudyPanel notebookId={notebook.id} onSourcesChanged={() => refreshSources(notebook.id)} />}
            {view === "notes" && <NotesPanel notebookId={notebook.id} />}
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
      />
      <ReaderModal sourceId={readingId} onClose={() => setReadingId(null)} />
    </div>
  );
}
