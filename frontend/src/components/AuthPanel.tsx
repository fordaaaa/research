import { useEffect, useRef, useState } from "react";
import * as api from "../api";
import type { User } from "../api";
import Spinner from "./Spinner";
import { Button, Card } from "./ui";
import { inputCls } from "./ui";

interface Props {
  onAuthed: (user: User, isNewAccount?: boolean) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (opts: {
            client_id: string;
            callback: (res: { credential?: string }) => void;
          }) => void;
          renderButton: (
            el: HTMLElement,
            opts: { theme?: string; size?: string; width?: number }
          ) => void;
        };
      };
    };
  }
}

const GIS_SRC = "https://accounts.google.com/gsi/client";

export default function AuthPanel({ onAuthed }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api
      .googleStatus()
      .then((s) => {
        if (s.enabled && s.client_id) setGoogleClientId(s.client_id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!googleClientId) return;
    const render = () => {
      const g = window.google;
      if (!g || !googleBtnRef.current) return false;
      g.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (res) => {
          if (!res.credential) {
            setError("Google sign-in failed");
            return;
          }
          setGoogleBusy(true);
          setError(null);
          try {
            const out = await api.googleLogin(res.credential);
            api.setToken(out.token);
            onAuthed(out.user);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Google sign-in failed");
          } finally {
            setGoogleBusy(false);
          }
        },
      });
      googleBtnRef.current.innerHTML = "";
      g.accounts.id.renderButton(googleBtnRef.current, {
        theme: "outline",
        size: "large",
        width: 320,
      });
      return true;
    };
    if (render()) return;
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => render());
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => render();
    document.head.appendChild(script);
  }, [googleClientId, onAuthed]);

  const submit = async () => {
    if (!email.trim() || !password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = mode === "login"
        ? await api.login(email.trim(), password)
        : await api.register(email.trim(), password);
      api.setToken(res.token);
      onAuthed(res.user, mode === "register");
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not sign in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex-1 overflow-y-auto animate-page-in">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-7xl gap-8 p-4 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(380px,440px)] lg:items-center lg:gap-16 lg:p-12">
        <section className="relative flex min-h-[330px] flex-col justify-between overflow-hidden rounded-[2rem] bg-brand-deep p-8 text-mark shadow-[0_28px_75px_rgba(6,48,62,0.17)] sm:p-12 lg:min-h-[580px]">
          <div className="pointer-events-none absolute -right-24 -top-20 h-[430px] w-[430px] rounded-full border border-mark/15" aria-hidden="true" />
          <div className="pointer-events-none absolute -right-8 -top-4 h-[340px] w-[340px] rounded-full border border-mark/20" aria-hidden="true" />
          <div className="pointer-events-none absolute right-16 top-20 h-44 w-44 rounded-full bg-aqua/40 blur-3xl" aria-hidden="true" />
          <p className="relative text-xs font-semibold uppercase tracking-[0.22em] text-aquabright">Notaeo for students</p>
          <div className="relative max-w-lg">
            <h1 className="font-display text-4xl leading-tight sm:text-5xl lg:text-6xl">Start with your sources.</h1>
            <p className="mt-6 max-w-md text-sm leading-7 text-mark/80">Bring class notes, PDFs, and articles into one place. Find useful passages, organize ideas, and study from what you actually read.</p>
          </div>
          <div className="relative flex flex-wrap gap-2 text-[11px] font-medium text-mark/80">
            <span className="rounded-full border border-mark/20 px-3 py-2">Collect sources</span>
            <span className="rounded-full border border-mark/20 px-3 py-2">Research freely</span>
            <span className="rounded-full border border-mark/20 px-3 py-2">Study your way</span>
          </div>
        </section>
        <div className="mx-auto w-full max-w-md py-5">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-aqua">Welcome to Notaeo</p>
          <h2 className="mt-3 font-display text-3xl font-semibold">{mode === "login" ? "Welcome back." : "Begin your journey."}</h2>
          <p className="mt-2 text-sm leading-relaxed text-neutral-500">Your notebooks live in your account on this server — nobody else can see them.</p>
        <Card className="mt-7 p-5 shadow-[0_16px_45px_rgba(6,48,62,0.06)] sm:p-7">
          <div className="mb-4 flex gap-1 rounded-xl bg-neutral-900 p-1">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${mode === m ? "bg-neutral-100 text-neutral-950" : "text-neutral-500 hover:text-neutral-200"}`}
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
              >
                {m === "login" ? "Log in" : "Create account"}
              </button>
            ))}
          </div>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input
              className={inputCls}
              type="email"
              autoComplete="email"
              placeholder="Email address"
              value={email}
              maxLength={320}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className={inputCls}
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder={mode === "login" ? "Password" : "Password (8+ characters)"}
              value={password}
              maxLength={128}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" className="w-full" disabled={busy || !email.trim() || !password}>
              {busy && <Spinner size={13} />}
              {busy ? "Please wait" : mode === "login" ? "Log in" : "Create account"}
            </Button>
          </form>
          {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
          {googleClientId && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2 text-[11px] text-neutral-600">
                <span className="h-px flex-1 bg-neutral-800" />
                or
                <span className="h-px flex-1 bg-neutral-800" />
              </div>
              <div ref={googleBtnRef} className="flex justify-center" />
              {googleBusy && (
                <p className="flex items-center justify-center gap-2 text-xs text-neutral-500">
                  <Spinner size={13} /> Signing in with Google…
                </p>
              )}
            </div>
          )}
          {mode === "register" && (
            <p className="mt-3 text-xs leading-relaxed text-neutral-600">
              One account per email. Passwords are hashed — they never touch the disk in the clear.
            </p>
          )}
        </Card>
        <p className="mt-6 text-center text-xs leading-relaxed text-neutral-500">No AI key is needed to collect, search, read, or export your sources.</p>
        </div>
      </div>
    </main>
  );
}
