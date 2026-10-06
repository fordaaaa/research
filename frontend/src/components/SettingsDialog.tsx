import { useEffect, useRef, useState } from "react";
import * as api from "../api";
import type { AIProvider } from "../api";
import type { Appearance, FontName, ThemeName } from "../appearance";
import Spinner from "./Spinner";
import MotionPreview from "./MotionPreview";
import { isSoundEnabled, playSuccess, previewChime, setSoundEnabled } from "../sound";
import { useMountTransition } from "../useMountTransition";

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged: (configured: boolean) => void;
  appearance: Appearance;
  onAppearanceChange: (appearance: Appearance) => void;
  /** Round 18: App-level announcer — the persistent live region lives in App. */
  onAppearanceAnnounce?: (message: string) => void;
  /**
   * Round 20 item 1: the opener, captured synchronously in the click handler
   * (e.currentTarget) BEFORE setOpen. null = auto-opened, restore to
   * #main-content. undefined (omitted) = legacy mount-time capture fallback.
   */
  trigger?: HTMLElement | null;
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
  groq: {
    name: "Groq",
    keyLabel: "Groq API key",
    model: "openai/gpt-oss-20b",
    helper: "Use your personal API key from console.groq.com. Free-tier limits apply and vary by account.",
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

export default function SettingsDialog({ open, onClose, onChanged, appearance, onAppearanceChange, onAppearanceAnnounce, trigger }: Props) {
  const [configured, setConfigured] = useState(false);
  const [provider, setProvider] = useState<AIProvider>("gemini");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(PROVIDERS.gemini.model);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [previewMotion, setPreviewMotion] = useState(false);
  const [appearanceAnnouncement, setAppearanceAnnouncement] = useState<string | null>(null);
  // Sound audit: the chime toggle and Preview previously gave keyboard users
  // zero screen-reader feedback (a silent checkbox flip; a silent playback).
  // This polite region announces both. Repeat text clears-then-resets (same
  // pattern as the appearance announcer) so repeats re-announce.
  const [soundAnnouncement, setSoundAnnouncement] = useState<string | null>(null);
  const soundAnnounceSeq = useRef(0);
  function announceSound(message: string) {
    soundAnnounceSeq.current += 1;
    const seq = soundAnnounceSeq.current;
    setSoundAnnouncement(null);
    window.setTimeout(() => {
      if (soundAnnounceSeq.current !== seq) return;
      setSoundAnnouncement(message);
    }, 0);
  }

  // Round 19 item 1: the dialog-local region is the standalone fallback
  // when onAppearanceAnnounce is unwired. Repeat selections carry identical
  // text (useState bails, no DOM mutation, AT hears nothing), so force a
  // clear-then-re-set in a later task; the seq drops a stale repeat behind
  // a newer announcement. Initial load never announces (no call on mount).
  const localAnnounceRef = useRef<string | null>(null);
  const localAnnounceSeq = useRef(0);
  function chooseAppearance(next: Appearance, announcement: string) {
    onAppearanceChange(next);
    // Same path announces in the persistent App-level region (when wired)
    // and the dialog-local region (standalone/tests fallback).
    onAppearanceAnnounce?.(announcement);
    localAnnounceSeq.current += 1;
    const seq = localAnnounceSeq.current;
    if (localAnnounceRef.current === announcement) {
      localAnnounceRef.current = null;
      setAppearanceAnnouncement(null);
      window.setTimeout(() => {
        if (localAnnounceSeq.current !== seq) return;
        localAnnounceRef.current = announcement;
        setAppearanceAnnouncement(announcement);
      }, 0);
    } else {
      localAnnounceRef.current = announcement;
      setAppearanceAnnouncement(announcement);
    }
  }

  useEffect(() => {
    if (!open) setPreviewMotion(false);
    if (!open) return;
    setError(null);
    setApiKey("");
    setSoundOn(isSoundEnabled());
    // No session → the authed settings request could only 401. Skip it
    // instead of adding failed-request noise on boot/pre-auth.
    if (!api.getToken()) return;
    api.getAISettings().then((settings) => {
      setConfigured(settings.configured);
      if (settings.provider) setProvider(settings.provider);
      if (settings.model) setModel(settings.model);
    }).catch((err) => setError(err instanceof Error ? err.message : "could not load settings"));
  }, [open]);

  const mounted = useMountTransition(open, 150);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Captured when the dialog opens so every dismiss path (Escape, ×)
  // restores to the element that opened settings.
  const savedTriggerRef = useRef<HTMLElement | null>(null);

  // Mirror FirstRunTour: capture the trigger once per open, move initial
  // focus into the dialog (close button), and restore on close/unmount
  // with a connected-check + #main-content fallback so focus never
  // strands on BODY. An explicit `trigger` prop (even null) wins over
  // mount-time activeElement, which is too late for async opens. The opener
  // is set synchronously with the open state, so the effect-closure value
  // is exact.
  useEffect(() => {
    if (!open) return;
    if (trigger === undefined && savedTriggerRef.current === null) {
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      savedTriggerRef.current = active && active !== document.body ? active : null;
    }
    closeRef.current?.focus();
    return () => {
      const explicit = trigger !== undefined ? (trigger ?? null) : savedTriggerRef.current;
      if (explicit && explicit.isConnected && document.contains(explicit)) {
        explicit.focus();
      } else {
        document.getElementById("main-content")?.focus?.();
      }
      savedTriggerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mounted]);

  useEffect(() => {
    // Mirror FirstRunTour: capture-phase Escape dismisses even if an inner
    // control stops propagation. The reader modal honors Escape the same way.
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
        ),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!root.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 ${open ? "animate-page-in" : "animate-fade-out pointer-events-none"}`}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Settings" className={`max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl ${open ? "animate-pop-in" : "animate-pop-out"}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold">Settings</h2>
            <p className="mt-1 text-xs leading-relaxed text-neutral-500">Make your study space comfortable for you.</p>
          </div>
          <button ref={closeRef} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-xl leading-none text-neutral-500 hover:text-neutral-100" onClick={onClose} aria-label="Close settings">×</button>
        </div>
        <section className="mt-6 space-y-4 border-b border-neutral-800 pb-6" aria-label="Appearance">
          <div>
            <h3 className="text-sm font-semibold">Appearance</h3>
            <p className="mt-1 text-xs text-neutral-500">Saved on this device. Your notes and account are unchanged.</p>
          </div>
          <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{appearanceAnnouncement}</p>
          <div>
            <p className="mb-2 text-xs font-medium text-neutral-300">Theme</p>
            <div className="grid grid-cols-3 gap-2">
              {THEMES.map((theme) => (
                <button key={theme.value} type="button" aria-pressed={appearance.theme === theme.value} onClick={() => {
                  // Round 24 item 2: clicking the active theme is a no-op —
                  // re-firing "Night theme on" is noise. Announce only on an
                  // actual change.
                  if (appearance.theme === theme.value) return;
                  chooseAppearance({ ...appearance, theme: theme.value }, `${theme.label} theme on`);
                }} className={`min-h-11 rounded-xl border p-2 text-left text-xs font-medium transition-colors ${appearance.theme === theme.value ? "border-aqua bg-seafoam text-neutral-100" : "border-neutral-800 text-neutral-500 hover:border-neutral-600"}`}>
                  <span className={`mb-2 block h-7 rounded-md border ${theme.swatch}`} aria-hidden="true" />{theme.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-neutral-300">Text style</p>
            <div className="grid grid-cols-2 gap-2">
              {FONTS.map((font) => (
                <button key={font.value} type="button" aria-pressed={appearance.font === font.value} onClick={() => {
                  // Round 24 item 2: same guard for fonts — no announce,
                  // no state write, when nothing changed.
                  if (appearance.font === font.value) return;
                  chooseAppearance({ ...appearance, font: font.value }, `${font.label} font on`);
                }} className={`min-h-11 rounded-xl border px-3 py-2 text-left text-sm transition-colors ${appearance.font === font.value ? "border-aqua bg-seafoam text-neutral-100" : "border-neutral-800 text-neutral-500 hover:border-neutral-600"}`} style={{ fontFamily: font.value === "maple" ? '"Maple Mono", monospace' : '"Atkinson Hyperlegible Next", sans-serif' }}>{font.label}</button>
              ))}
            </div>
          </div>
        </section>
        <section className="mt-6 space-y-4 border-b border-neutral-800 pb-6" aria-label="Sound">
          <div>
            <h3 className="text-sm font-semibold">Sound</h3>
            <p className="mt-1 text-xs text-neutral-500">On by default. Short offline chimes for boot and completed exports — no audio during AI thinking.</p>
          </div>
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl border border-neutral-800 px-3 py-2 text-sm">
            <span className="text-neutral-300">Interface chimes</span>
            <input
              type="checkbox"
              checked={soundOn}
              onChange={(event) => {
                const next = event.target.checked;
                setSoundOn(next);
                setSoundEnabled(next);
                if (next) playSuccess();
                announceSound(next ? "Interface chimes on" : "Interface chimes off");
              }}
              aria-label="Interface chimes"
            />
          </label>
          <p role="status" aria-label="Sound announcement" aria-live="polite" aria-atomic="true" className="sr-only">
            {soundAnnouncement}
          </p>
          <button
            type="button"
            aria-label="Preview chime"
            onClick={() => {
              previewChime();
              announceSound("Playing chime preview");
            }}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-aqua underline underline-offset-2 hover:text-wave"
          >
            <span aria-hidden="true">▶</span> Preview
          </button>
        </section>
        <section className="mt-6 border-b border-neutral-800 pb-6" aria-label="Motion">
          <h3 className="text-sm font-semibold">Motion</h3>
          <p className="mt-1 text-xs text-neutral-500">Try loading, flashcards, and AI thinking here.</p>
          <button type="button" aria-expanded={previewMotion} onClick={() => setPreviewMotion((value) => !value)}
            className="mt-2 min-h-11 rounded-lg border border-neutral-700 px-3 text-sm hover:bg-neutral-800">
            {previewMotion ? "Stop preview" : "Try motion"}
          </button>
          {open && previewMotion && <MotionPreview />}
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
            <button className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-200 transition active:scale-[0.98] disabled:opacity-50" disabled={busy || !apiKey.trim()} type="submit">
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
