import { useEffect, useState } from "react";
import * as api from "../api";
import type { AIProvider } from "../api";
import type { Appearance, FontName, ThemeName } from "../appearance";
import Spinner from "./Spinner";
import { useMountTransition } from "../useMountTransition";

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged: (configured: boolean) => void;
  appearance: Appearance;
  onAppearanceChange: (appearance: Appearance) => void;
}

const PROVIDERS: Record<AIProvider, { name: string; keyLabel: string; model: string; helper: string }> = {
  gemini: {
    name: "Google Gemini",
    keyLabel: "Gemini API key",
    model: "gemini-3.5-flash-lite",
    helper: "Create a key in Google AI Studio’s free tier. Availability and limits vary by region.",
  },
  openrouter: {
    name: "OpenRouter",
    keyLabel: "OpenRouter API key",
    model: "nvidia/nemotron-3-ultra-550b-a55b:free",
    helper: "Create a key at openrouter.ai and pick any model ending in :free. Free model names change over time.",
  },
};

const THEMES: { value: ThemeName; label: string; swatch: string }[] = [
  { value: "paper", label: "Paper", swatch: "bg-[#f6f5f0] border-[#d9dedb]" },
  { value: "ocean", label: "Ocean", swatch: "bg-[#edf5f1] border-[#a4c9c0]" },
  { value: "night", label: "Night", swatch: "bg-[#171d29] border-[#4a566b]" },
];

const FONTS: { value: FontName; label: string }[] = [
  { value: "readable", label: "Readable" },
  { value: "maple", label: "Maple Mono" },
];

export default function SettingsDialog({ open, onClose, onChanged, appearance, onAppearanceChange }: Props) {
  const [configured, setConfigured] = useState(false);
  const [provider, setProvider] = useState<AIProvider>("gemini");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(PROVIDERS.gemini.model);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setApiKey("");
    api.getAISettings().then((settings) => {
      setConfigured(settings.configured);
      if (settings.provider) setProvider(settings.provider);
      if (settings.model) setModel(settings.model);
    }).catch((err) => setError(err instanceof Error ? err.message : "could not load settings"));
  }, [open]);

  const mounted = useMountTransition(open, 150);
  if (!mounted) return null;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 ${open ? "animate-page-in" : "animate-fade-out pointer-events-none"}`}>
      <div role="dialog" aria-modal="true" aria-label="Settings" className={`max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl ${open ? "animate-pop-in" : "animate-pop-out"}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold">Settings</h2>
            <p className="mt-1 text-xs leading-relaxed text-neutral-500">Make your study space comfortable for you.</p>
          </div>
          <button className="text-neutral-500 hover:text-neutral-100" onClick={onClose} aria-label="Close settings">×</button>
        </div>
        <section className="mt-6 space-y-4 border-b border-neutral-800 pb-6" aria-label="Appearance">
          <div>
            <h3 className="text-sm font-semibold">Appearance</h3>
            <p className="mt-1 text-xs text-neutral-500">Saved on this device. Your notes and account are unchanged.</p>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-neutral-300">Theme</p>
            <div className="grid grid-cols-3 gap-2">
              {THEMES.map((theme) => (
                <button key={theme.value} type="button" aria-pressed={appearance.theme === theme.value} onClick={() => onAppearanceChange({ ...appearance, theme: theme.value })} className={`min-h-11 rounded-xl border p-2 text-left text-xs font-medium transition-colors ${appearance.theme === theme.value ? "border-aqua bg-seafoam text-neutral-100" : "border-neutral-800 text-neutral-500 hover:border-neutral-600"}`}>
                  <span className={`mb-2 block h-7 rounded-md border ${theme.swatch}`} aria-hidden="true" />{theme.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-neutral-300">Text style</p>
            <div className="grid grid-cols-2 gap-2">
              {FONTS.map((font) => (
                <button key={font.value} type="button" aria-pressed={appearance.font === font.value} onClick={() => onAppearanceChange({ ...appearance, font: font.value })} className={`min-h-11 rounded-xl border px-3 py-2 text-left text-sm transition-colors ${appearance.font === font.value ? "border-aqua bg-seafoam text-neutral-100" : "border-neutral-800 text-neutral-500 hover:border-neutral-600"}`} style={{ fontFamily: font.value === "maple" ? '"Maple Mono", monospace' : '"Atkinson Hyperlegible Next", sans-serif' }}>{font.label}</button>
              ))}
            </div>
          </div>
        </section>
        <div className="mt-6">
          <h3 className="text-sm font-semibold">Optional AI</h3>
          <p className="mt-1 text-xs leading-relaxed text-neutral-500">Your key is saved with your account and used only when you request an AI feature.</p>
        </div>
        <form
          className="mt-5 space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!apiKey.trim() || busy) return;
            setBusy(true);
            setError(null);
            try {
              const settings = await api.saveAISettings(apiKey.trim(), model.trim(), provider);
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
          <label className="block text-xs font-medium text-neutral-300">Provider</label>
          <select
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-neutral-500"
            value={provider}
            onChange={(event) => {
              const next = event.target.value as AIProvider;
              setProvider(next);
              setModel(PROVIDERS[next].model);
            }}
          >
            {Object.entries(PROVIDERS).map(([value, info]) => (
              <option key={value} value={value}>{info.name}</option>
            ))}
          </select>
          <label className="block text-xs font-medium text-neutral-300">{PROVIDERS[provider].keyLabel}</label>
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
          <p className="text-xs leading-relaxed text-neutral-500">{PROVIDERS[provider].helper}</p>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex items-center gap-2 pt-1">
            <button className="inline-flex items-center gap-2 rounded-lg bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-200 transition active:scale-[0.98] disabled:opacity-50" disabled={busy || !apiKey.trim()} type="submit">
              {busy && <Spinner size={13} />}
              {busy ? "Saving" : configured ? "Replace key" : "Enable AI"}
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
