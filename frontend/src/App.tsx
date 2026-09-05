import { useCallback, useEffect, useState } from "react";
import * as api from "./api";
import type { Notebook, SourceSummary } from "./api";
import NotebookPicker from "./components/NotebookPicker";
import UploadZone from "./components/UploadZone";
import SourceList from "./components/SourceList";
import SearchPanel from "./components/SearchPanel";

export default function App() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [sources, setSources] = useState<SourceSummary[]>([]);
  const [backendUp, setBackendUp] = useState(true);

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
    refreshNotebooks();
  }, [refreshNotebooks]);

  useEffect(() => {
    if (notebook) refreshSources(notebook.id);
  }, [notebook, refreshSources]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      <header className="border-b border-neutral-800 px-6 py-3 flex items-center gap-3 shrink-0">
        <button
          className="text-lg font-semibold tracking-tight hover:text-white"
          onClick={() => setNotebook(null)}
        >
          research
        </button>
        {notebook && <span className="text-sm text-neutral-500">/ {notebook.name}</span>}
        {!backendUp && (
          <span className="text-xs text-red-400">backend not reachable</span>
        )}
        <span className="ml-auto rounded-full bg-neutral-800 px-3 py-1 text-xs font-medium text-neutral-400">
          AI off
        </span>
      </header>

      {!notebook ? (
        <NotebookPicker
          notebooks={notebooks}
          onOpen={setNotebook}
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
        <main key={notebook.id} className="flex-1 grid grid-cols-1 lg:grid-cols-[380px_1fr] lg:divide-x divide-neutral-800 overflow-hidden animate-page-in">
          <section className="p-6 space-y-6 overflow-y-auto">
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
            <SourceList
              sources={sources}
              onDelete={async (id) => {
                await api.deleteSource(id);
                await refreshSources(notebook.id);
              }}
            />
          </section>
          <section className="p-6 overflow-y-auto">
            <SearchPanel
              onSearch={(q) => api.search(notebook.id, q)}
              onImportUrl={async (url) => {
                await api.addUrl(notebook.id, url);
                await refreshSources(notebook.id);
              }}
            />
          </section>
        </main>
      )}
    </div>
  );
}
