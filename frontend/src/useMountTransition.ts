import { useEffect, useState } from "react";

/** Keeps a component mounted through its CSS exit animation after `open` turns false. */
export function useMountTransition(open: boolean, exitDurationMs: number): boolean {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timer = setTimeout(() => setMounted(false), exitDurationMs);
    return () => clearTimeout(timer);
  }, [open, exitDurationMs]);
  return mounted;
}
