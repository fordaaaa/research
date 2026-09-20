import { useEffect, useState } from "react";

/** Mirrors the user's OS motion preference for JS-driven interactions. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

/** Keeps a component mounted through its CSS exit animation after `open` turns false. */
export function useMountTransition(open: boolean, exitDurationMs: number): boolean {
  const [mounted, setMounted] = useState(open);
  const reducedMotion = usePrefersReducedMotion();
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timer = setTimeout(() => setMounted(false), reducedMotion ? 0 : exitDurationMs);
    return () => clearTimeout(timer);
  }, [open, exitDurationMs, reducedMotion]);
  return mounted;
}
