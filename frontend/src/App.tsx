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
import { Badge, Card, Tabs } from "./components/ui";

type View = "research" | "deep" | "ask" | "search" | "study" | "write" | "skills";

const VIEWS: { value: View; label: string }[] = [
  { value: "research", label: "Research" },
  { value: "deep", label: "Deep research" },
  { value: "ask", label: "Ask" },
  { value: "search", label: "Search" },
  { value: "study", label: "Study" },
  { value: "write", label: "Humanize" },
  { value: "skills", label: "Skills" },
];

export default function App() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [sources, setSources] = useState<SourceSummary[]>([]);
  const [view, setView] = useState<View>("research");
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
        <div key={notebook.id} className="mx-auto w-full max-w-7xl flex-1 grid gap-5 p-4 sm:p-6 lg:grid-cols-[360px_minmax(0,1fr)] animate-page-in">
          <aside className="min-w-0 space-y-5 lg:sticky lg:top-[60px] lg:self-start lg:max-h-[calc(100vh-84px)] lg:overflow-y-auto lg:pr-1">
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
          </aside>
          <main className="min-w-0 space-y-5">
            <Tabs options={VIEWS} value={view} onChange={setView} />
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
                configured={aiConfigured}
                onAsk={(message) => api.askNotebook(notebook.id, message)}
                onConfigure={() => setShowSettings(true)}
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
            {view === "write" && <HumanizerPanel aiConfigured={aiConfigured} />}
            {view === "skills" && <SkillsPanel notebookId={notebook.id} />}
          </main>
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
