import { useEffect, useRef, useState } from "react";
import * as api from "../api";
import type { User } from "../api";
import Spinner from "./Spinner";
import { Button, Card } from "./ui";
import { inputCls } from "./ui";

interface Props {
  onAuthed: (user: User) => void;
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
      onAuthed(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not sign in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex-1 overflow-y-auto animate-page-in">
      <div className="mx-auto w-full max-w-sm space-y-6 p-4 sm:p-8">
        <section className="pt-6 text-center sm:pt-10">
          <h1 className="text-3xl font-semibold tracking-tight">research, locally</h1>
          <p className="mt-2 text-sm leading-relaxed text-neutral-500">
            Your notebooks live in your account on this server — nobody else can see them.
          </p>
        </section>
        <Card className="p-5">
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
      </div>
    </main>
  );
}
