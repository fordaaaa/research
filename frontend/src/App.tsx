import { useEffect, useState } from "react";

export default function App() {
  const [health, setHealth] = useState<{ ok: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      <header className="border-b border-neutral-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">research</h1>
        <span className="rounded-full bg-neutral-800 px-3 py-1 text-xs font-medium text-neutral-400">
          AI off
        </span>
      </header>
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-2xl font-semibold">Your notebooks will live here</p>
          <p className="text-sm text-neutral-400">
            backend: {health?.ok ? "connected" : "not reachable"}
          </p>
        </div>
      </main>
    </div>
  );
}
