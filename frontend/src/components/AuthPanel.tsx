import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
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
  // New students land here with no stored token, so lead with account
  // creation; a stored session token means a returning user (log in).
  const [mode, setMode] = useState<"login" | "register">(() => (api.getToken() ? "login" : "register"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  // Round 22 item 8: the 429 "try again in …" message used to be static
  // ("try again in 59 minutes" forever). Keep the Retry-After seconds and
  // tick them down live each second; null = server sent no wait ("shortly").
  const [retryRemaining, setRetryRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (!rateLimited || retryRemaining === null || retryRemaining <= 0) return;
    const timer = window.setInterval(() => {
      setRetryRemaining((prev) => (prev === null ? prev : Math.max(0, prev - 1)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [rateLimited, retryRemaining]);
  const rateLimitMessage =
    retryRemaining === null
      ? "Too many attempts — try again shortly"
      : retryRemaining <= 0
        ? "Too many attempts — you can try again now."
        : `Too many attempts — try again in ${api.humanizeRetryWait(retryRemaining)}`;
  // Round 21 item 8: duplicate-register 200-generic detail (no session).
  // Kept separate from `error` so the one-click login switch renders with it.
  const [duplicateDetail, setDuplicateDetail] = useState<string | null>(null);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const alertRef = useRef<HTMLParagraphElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);

  // Rate-limit trips move focus to the alert so keyboard and screen-reader
  // users land on the retry message instead of staying in the form.
  useEffect(() => {
    if (rateLimited && error) alertRef.current?.focus();
  }, [rateLimited, error]);
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

  // Duck-typed so mocked/test-double errors work without importing the class.
  function rateLimitWait(err: unknown): number | null | undefined {
    if (typeof err !== "object" || err === null) return undefined;
    const candidate = err as { name?: unknown; retryAfterSeconds?: unknown };
    if (candidate.name !== "RateLimitError") return undefined;
    return typeof candidate.retryAfterSeconds === "number" ? candidate.retryAfterSeconds : null;
  }

  // Round 20 item 4: derived SOLELY from synchronous input state
  // (email/password validity + in-flight submit). Async config (GIS
  // client-id fetch) must never gate the button — the Google button renders
  // separately when ready.
  const submitDisabled = busy || !email.trim() || !password;

  // Tab from the password field when the submit is disabled would skip the
  // disabled button and fall through to <body> (no later card stop when the
  // Google button is absent). Wrap to the next live card stop instead.
  function handlePasswordTab(event: KeyboardEvent) {
    if (event.key !== "Tab" || event.shiftKey || !submitDisabled) return;
    const googleButton = googleBtnRef.current?.querySelector("button");
    if (googleButton instanceof HTMLElement) {
      event.preventDefault();
      googleButton.focus();
      return;
    }
    event.preventDefault();
    document.getElementById(`auth-tab-${mode}`)?.focus();
  }

  const submit = async () => {
    if (!email.trim() || !password || busy) return;
    setBusy(true);
    setError(null);
    setRateLimited(false);
    setRetryRemaining(null);
    setDuplicateDetail(null);
    try {
      const res = mode === "login"
        ? await api.login(email.trim(), password)
        : await api.register(email.trim(), password);
      // Round 21 item 8: duplicate-register is a 200-generic
      // `{registered: false, detail}` with NO session. Show the message and
      // offer the login tab — never store a token or call onAuthed. (Only
      // the register path can produce this shape.)
      if (api.isRegisterDuplicate(res)) {
        setDuplicateDetail(res.detail || "An account with this email already exists.");
        return;
      }
      api.setToken(res.token);
      onAuthed(res.user, mode === "register");
    } catch (err) {
      const wait = rateLimitWait(err);
      if (wait !== undefined) {
        setError(wait !== null ? `Too many attempts — try again in ${api.humanizeRetryWait(wait)}` : "Too many attempts — try again shortly");
        setRateLimited(true);
        setRetryRemaining(wait);
      } else {
        setError(err instanceof Error ? err.message : "could not sign in");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto outline-none animate-page-in">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl items-start gap-12 px-5 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(380px,430px)] lg:items-center lg:gap-16 lg:py-12">
        <section aria-label="Why Notaeo" className="hidden lg:block">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-aqua">Read · Research · Remember</p>
          <h2 className="mt-5 max-w-xl font-display text-5xl font-semibold leading-[1.12] tracking-tight">Make more of what you read.</h2>
          <p className="mt-5 max-w-lg text-base leading-7 text-neutral-500">Keep the chapters, papers, and class notes for each assignment together. Find what matters, then turn it into notes and study material.</p>
          <div className="relative mt-9 max-w-lg rounded-[1.75rem] border border-neutral-800 bg-seafoam/70 p-5 shadow-[0_22px_55px_rgba(6,48,62,0.06)]" aria-hidden="true">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-[0_8px_25px_rgba(6,48,62,0.05)]">
              <div className="flex items-center justify-between gap-3 border-b border-neutral-800 pb-4">
                <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-aqua">Biology notebook</p><p className="mt-1 font-display text-lg font-semibold">Chapter 3 · Cell structure</p></div>
                <span className="rounded-lg bg-seafoam px-2.5 py-1.5 text-[10px] font-semibold text-wave">SOURCE</span>
              </div>
              <div className="mt-4 space-y-2"><div className="h-2 w-full rounded-full bg-neutral-800" /><div className="h-2 w-[86%] rounded-full bg-neutral-800" /><div className="h-2 w-[62%] rounded-full bg-neutral-800" /></div>
              <div className="mt-5 flex flex-wrap gap-2"><span className="rounded-full border border-neutral-800 px-3 py-1.5 text-xs text-neutral-300">Search sources</span><span className="rounded-full border border-neutral-800 px-3 py-1.5 text-xs text-neutral-300">Take notes</span><span className="rounded-full border border-neutral-800 px-3 py-1.5 text-xs text-neutral-300">Make flashcards</span></div>
            </div>
          </div>
          <p className="mt-5 max-w-lg text-xs leading-relaxed text-neutral-500">Your source library, search, notes, and study tools work without an AI key.</p>
        </section>
        <section aria-label="Sign in or create account" className="mx-auto w-full max-w-md">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-aqua">Your Notaeo account</p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">{mode === "login" ? "Sign in to Notaeo" : "Create your account"}</h1>
          <p className="mt-2 text-sm leading-relaxed text-neutral-500">Your notebooks are private to your account on this server.</p>
        <Card className="mt-6 p-5 shadow-[0_16px_45px_rgba(6,48,62,0.06)] sm:p-7">
          {/* Round 25 item 9 (settled design, do not "fix" the wording drift):
              the tab says "Log in" while the submit says "Sign in", and that
              difference is INTENTIONAL. The tab names the DESTINATION ("Log
              in" = the login form tab, parallel to "Create account"); the
              submit names the ACTION with its EXACT visible text ("Sign in")
              so voice-control users speaking what they see match. The two
              are disambiguated by ROLE (tab vs button), never by forcing the
              names identical — query role-scoped
              (getByRole('tab', {name:'Log in'}) /
              getByRole('button', {name:'Sign in'})). The submit's aria-label
              deliberately equals its visible text for the same voice-match
              reason (see the Round 20 item 3 note on the submit below). */}
          <div role="tablist" aria-label="Account options" className="mb-6 flex gap-1 rounded-xl bg-seafoam p-1">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                id={`auth-tab-${m}`}
                type="button"
                role="tab"
                aria-selected={mode === m}
                tabIndex={mode === m ? 0 : -1}
                className={`min-h-11 flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${mode === m ? "bg-neutral-900 text-neutral-100 shadow-[0_1px_6px_rgba(6,48,62,0.08)]" : "text-neutral-500 hover:text-neutral-200"}`}
                onClick={() => {
                  setMode(m);
                  setError(null);
                  setRateLimited(false);
                  setRetryRemaining(null);
                  setDuplicateDetail(null);
                }}
                onKeyDown={(event) => {
                  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                  event.preventDefault();
                  const order = ["login", "register"] as const;
                  const current = order.indexOf(m);
                  const next =
                    event.key === "ArrowRight" ? order[(current + 1) % order.length]
                    : event.key === "ArrowLeft" ? order[(current + order.length - 1) % order.length]
                    : event.key === "Home" ? order[0]
                    : order[order.length - 1];
                  setMode(next);
                  setError(null);
                  setRateLimited(false);
                  setRetryRemaining(null);
                  setDuplicateDetail(null);
                  document.getElementById(`auth-tab-${next}`)?.focus();
                }}
              >
                {m === "login" ? "Log in" : "Create account"}
              </button>
            ))}
          </div>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div><label htmlFor="auth-email" className="mb-1.5 block text-xs font-semibold text-neutral-300">Email address</label><input id="auth-email" ref={emailRef} className={inputCls} type="email" autoComplete="email" placeholder="Email address" value={email} maxLength={320} onChange={(e) => setEmail(e.target.value)} onInput={(e) => setEmail(e.currentTarget.value)} /></div>
            <div><label htmlFor="auth-password" className="mb-1.5 block text-xs font-semibold text-neutral-300">Password</label><input id="auth-password" className={inputCls} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder={mode === "login" ? "Password" : "Password (8+ characters)"} value={password} maxLength={128} onChange={(e) => setPassword(e.target.value)} onInput={(e) => setPassword(e.currentTarget.value)} onKeyDown={handlePasswordTab} />{mode === "register" && <p className="mt-1 text-xs text-neutral-500">Use at least 8 characters.</p>}</div>
            {submitDisabled ? <p id="auth-submit-hint" className="text-xs text-neutral-500">Enter email and password to continue.</p> : null}
            {/* Round 20 item 3: the submit name is EXACTLY its visible text
              ("Sign in"/"Create account") so voice-control users speaking the
              visible label match. Tab vs submit share visible-adjacent names
              deliberately; disambiguation comes from ROLES (tab vs button),
              not names — query role-scoped (getByRole('tab')/getByRole('button')). */}
            <Button type="submit" className="w-full" aria-label={mode === "login" ? "Sign in" : "Create account"} aria-describedby={submitDisabled ? "auth-submit-hint" : undefined} disabled={submitDisabled}>
              {busy && <Spinner size={13} />}
              {busy ? "Please wait" : mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>
          {error && (
            <>
              <p ref={alertRef} role="alert" tabIndex={-1} className="mt-3 text-xs text-red-400 outline-none">
                {rateLimited ? rateLimitMessage : error}
              </p>
              {rateLimited && (
                <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                  You&apos;re not locked out — just wait.
                </p>
              )}
            </>
          )}
          {duplicateDetail && (
            <div className="mt-3 rounded-xl border border-neutral-700 bg-neutral-900 p-3">
              <p role="status" className="text-xs leading-relaxed text-neutral-300">{duplicateDetail}</p>
              <button
                type="button"
                className="mt-2 min-h-11 rounded-lg px-3 text-xs font-semibold text-aqua underline underline-offset-2 hover:text-wave"
                onClick={() => {
                  setMode("login");
                  setDuplicateDetail(null);
                  setError(null);
                  setRateLimited(false);
                  setRetryRemaining(null);
                  // Email state is preserved, so the login form opens
                  // prefilled — land focus there for continuity.
                  window.setTimeout(() => emailRef.current?.focus(), 0);
                }}
              >
                Log in instead
              </button>
            </div>
          )}
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
              One account per email. Your password is stored as a hash, not in plain text.
            </p>
          )}
        </Card>
        <p className="mt-5 text-center text-xs leading-relaxed text-neutral-500">No AI key is needed to collect, search, read, or export your sources.</p>
        </section>
      </div>
    </main>
  );
}
