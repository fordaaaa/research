import { useEffect, useState } from "react";
import * as api from "../api";

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged: (configured: boolean) => void;
}

export default function SettingsDialog({ open, onClose, onChanged }: Props) {
  const [configured, setConfigured] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gemini-2.5-flash");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setApiKey("");
    api.getAISettings().then((settings) => {
      setConfigured(settings.configured);
      if (settings.model) setModel(settings.model);
    }).catch((err) => setError(err instanceof Error ? err.message : "could not load settings"));
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-page-in">
      <div className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl animate-pop-in">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Optional AI</h2>
            <p className="mt-1 text-xs leading-relaxed text-neutral-500">Your key stays on this Mac and is only sent to Gemini when you ask a question.</p>
          </div>
          <button className="text-neutral-500 hover:text-white" onClick={onClose} aria-label="Close settings">×</button>
        </div>
        <form
          className="mt-5 space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!apiKey.trim() || busy) return;
            setBusy(true);
            setError(null);
            try {
              const settings = await api.saveAISettings(apiKey.trim(), model.trim());
              setConfigured(settings.configured);
              onChanged(settings.configured);
              setApiKey("");
            } catch (err) {
              setError(err instanceof Error ? err.message : "could not save settings");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="block text-xs font-medium text-neutral-300">Gemini API key</label>
          <input
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-neutral-500"
            type="password"
            autoComplete="off"
            placeholder={configured ? "Paste a replacement key" : "Paste a free-tier key"}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
          <label className="block text-xs font-medium text-neutral-300">Model</label>
          <input
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-neutral-500"
            value={model}
            onChange={(event) => setModel(event.target.value)}
          />
          <p className="text-xs leading-relaxed text-neutral-500">Create a key in Google AI Studio’s free tier. Availability and limits vary by region.</p>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex items-center gap-2 pt-1">
            <button className="rounded-lg bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-50" disabled={busy || !apiKey.trim()} type="submit">
              {busy ? "Saving…" : configured ? "Replace key" : "Enable AI"}
            </button>
            {configured && (
              <button
                type="button"
                className="px-2 py-2 text-xs text-neutral-500 hover:text-red-400"
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api.clearAISettings();
                    setConfigured(false);
                    onChanged(false);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Remove key
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
