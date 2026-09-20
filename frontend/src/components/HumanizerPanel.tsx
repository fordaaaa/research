import { useEffect, useRef, useState } from "react";
import * as api from "../api";
import type { HumanizeAnalysis, HumanizeFix, HumanizeFixOperation, HumanizeRewrite } from "../api";
import Spinner from "./Spinner";
import { Badge, Button, Card, SectionHeader } from "./ui";
import { inputCls } from "./ui";

interface Props {
  aiConfigured: boolean;
}

export default function HumanizerPanel({ aiConfigured }: Props) {
  const [text, setText] = useState("");
  const [voice, setVoice] = useState("");
  const [showVoice, setShowVoice] = useState(false);
  const [analysis, setAnalysis] = useState<HumanizeAnalysis | null>(null);
  const [rewrite, setRewrite] = useState<HumanizeRewrite | null>(null);
  const [fixed, setFixed] = useState<HumanizeFix | null>(null);
  const [busy, setBusy] = useState<"analyze" | "rewrite" | "fix" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
  }, []);

  const runAnalyze = async () => {
    if (!text.trim() || busy) return;
    setBusy("analyze");
    setError(null);
    try {
      setAnalysis(await api.analyzeHumanize(text));
      setRewrite(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "analysis failed");
    } finally {
      setBusy(null);
    }
  };

  const runFix = async (operation: HumanizeFixOperation) => {
    if (!text.trim() || busy) return;
    setBusy("fix");
    setError(null);
    try {
      setFixed(await api.fixHumanize(text, [operation]));
    } catch (err) {
      setError(err instanceof Error ? err.message : "cleanup failed");
    } finally {
      setBusy(null);
    }
  };

  const runRewrite = async () => {
    if (!text.trim() || busy) return;
    setBusy("rewrite");
    setError(null);
    try {
      setRewrite(await api.rewriteHumanize(text, voice.trim() || undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : "rewrite failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="p-5 animate-pop-in">
      <SectionHeader
        title="Humanize"
        sub="Paste AI-sounding text: get free, on-machine pattern flags — no key needed. Rewriting with AI is optional."
        right={
          analysis ? (
            <Badge tone={analysis.signal_count === 0 ? "good" : "warn"}>
              {analysis.signal_count === 0 ? "reads naturally" : `${analysis.signal_count} signal${analysis.signal_count === 1 ? "" : "s"}`}
            </Badge>
          ) : undefined
        }
      />

      <label className="sr-only" htmlFor="humanizer-text">Text to check</label>
      <textarea
        id="humanizer-text"
        className={`${inputCls} mt-4 h-40 resize-y`}
        placeholder="Paste the text to check…"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setFixed(null);
        }}
      />
      <button
        type="button"
        className="mt-2 inline-flex min-h-11 items-center rounded-lg px-2 text-xs text-neutral-400 hover:text-neutral-200 underline"
        onClick={() => setShowVoice(!showVoice)}
      >
        {showVoice ? "Hide voice sample" : "Add a voice sample (optional)"}
      </button>
      {showVoice && (
        <>
          <label className="sr-only" htmlFor="humanizer-voice">Voice sample</label>
          <textarea
            id="humanizer-voice"
            className={`${inputCls} mt-2 h-20 resize-y animate-pop-in`}
            placeholder="2–3 paragraphs of your own writing, so the rewrite sounds like you…"
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
          />
        </>
      )}

      <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-neutral-200">Quick fixes · No AI</p>
          <Badge tone="good">local</Badge>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => runFix("straighten_quotes")} disabled={busy !== null || !text.trim()}>Straighten quotes</Button>
          <Button variant="secondary" onClick={() => runFix("remove_decoration")} disabled={busy !== null || !text.trim()}>Remove decoration</Button>
          <Button variant="secondary" onClick={() => runFix("remove_staged_runup")} disabled={busy !== null || !text.trim()}>Cut run-up</Button>
          <Button variant="secondary" onClick={() => runFix("reduce_repeated_openings")} disabled={busy !== null || !text.trim()}>Smooth openings</Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button onClick={runAnalyze} disabled={busy !== null || !text.trim()}>
          {busy === "analyze" && <Spinner size={13} />}
          {busy === "analyze" ? "Checking" : "Check patterns"}
        </Button>
        <Button
          variant="secondary"
          onClick={runRewrite}
          disabled={busy !== null || !text.trim() || !aiConfigured}
          title={aiConfigured ? "Rewrite with your configured AI provider" : "Set up AI in Settings to enable rewriting"}
        >
          {busy === "rewrite" && <Spinner size={13} />}
          {busy === "rewrite" ? "Rewriting" : "Rewrite with AI"}
        </Button>
        {!aiConfigured && <span className="text-xs text-neutral-600">rewriting needs an AI key — checking never does</span>}
      </div>

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      {fixed && (
        <div className="mt-4 rounded-xl border border-emerald-900 bg-emerald-950/40 p-3 animate-card-in">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-emerald-300">Local cleanup preview</p>
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => {
              setText(fixed.text);
              setFixed(null);
            }}>Apply to editor</Button>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">{fixed.text}</p>
        </div>
      )}

      {analysis && analysis.findings.length > 0 && (
        <ul className="mt-4 space-y-2">
          {analysis.findings.map((f, i) => (
            <li key={`${f.pattern}-${i}`} className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 animate-card-in" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
              <p className="text-xs font-semibold text-neutral-200">{f.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-neutral-400">“{f.excerpt}”</p>
              <p className="mt-1 text-xs text-neutral-500">{f.suggestion}</p>
            </li>
          ))}
        </ul>
      )}
      {analysis && analysis.findings.length === 0 && (
        <p className="mt-4 rounded-xl border border-emerald-900 bg-emerald-950/40 p-3 text-xs text-emerald-300">
          No common AI-writing signals found. Give it a read anyway — heuristics miss things.
        </p>
      )}

      {rewrite && (
        <div className="mt-4 rounded-xl border border-neutral-700 bg-neutral-900/60 p-3 animate-card-in">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-neutral-200">Rewrite {rewrite.model ? `· ${rewrite.model}` : ""}</p>
            <Button
              variant="ghost"
              className="px-2 py-1 text-xs"
              onClick={async () => {
                await navigator.clipboard.writeText(rewrite.text).catch(() => undefined);
                setCopied(true);
                if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
                copiedTimer.current = window.setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">{rewrite.text}</p>
        </div>
      )}
    </Card>
  );
}
