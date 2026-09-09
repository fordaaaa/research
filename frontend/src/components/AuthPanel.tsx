import { useState } from "react";
import * as api from "../api";
import type { User } from "../api";
import Spinner from "./Spinner";
import { Button, Card } from "./ui";
import { inputCls } from "./ui";

interface Props {
  onAuthed: (user: User) => void;
}

export default function AuthPanel({ onAuthed }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
