import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "../useMountTransition";

interface Props {
  title: string;
  subtitle?: string;
  stages?: string[];
  compact?: boolean;
  className?: string;
}

const STAGE_INTERVAL_MS = 1100;

/**
 * Offline folio loader — port of the `animated_svg.html` folio loop
 * (unfold → ruled lines → seafoam highlight → citation beacon, 3.2s).
 *
 * Offline rules: no CDN, no external assets, no inline `<style>` (keyframes
 * live in `src/index.css` so the desktop sidecar CSP `default-src 'self'`
 * stays clean). The SVG is decorative (`aria-hidden`); status copy is HTML
 * in a `role="status"` region. Thinking orbs stay the AI indicator —
 * this loader is for boot + opening things (notebooks, sources, exports).
 *
 * `stages` cycles the subtitle through boot/opening phases on a ~1.1s
 * interval. With `prefers-reduced-motion` the first stage is pinned.
 */
export default function FolioLoader({ title, subtitle, stages, compact = false, className = "" }: Props) {
  const reducedMotion = usePrefersReducedMotion();
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    if (!stages || stages.length < 2 || reducedMotion) return;
    const timer = window.setInterval(() => {
      setStageIndex((index) => (index + 1) % stages.length);
    }, STAGE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [stages, reducedMotion]);

  const visibleSubtitle =
    stages && stages.length > 0 ? stages[reducedMotion ? 0 : stageIndex % stages.length] : subtitle;

  return (
    <div role="status" aria-live="polite" className={`flex flex-col items-center gap-3 text-center ${className}`}>
      <svg
        width={compact ? 240 : 320}
        height={compact ? 112 : 160}
        viewBox="0 0 600 280"
        fill="none"
        aria-hidden="true"
        className="max-w-full"
      >
        <defs>
          <filter id="folio-sheet-shadow" x="-15%" y="-15%" width="130%" height="135%">
            <feDropShadow dx="0" dy="8" floodColor="#1B242C" floodOpacity="0.08" stdDeviation="12" />
            <feDropShadow dx="0" dy="2" floodColor="#1B242C" floodOpacity="0.04" stdDeviation="4" />
          </filter>
        </defs>
        <g className="folio-animated-folio">
          <rect x="200" y="45" width="200" height="175" rx="14" fill="#FFFFFF" stroke="#E6E0D4" strokeWidth="1.8" filter="url(#folio-sheet-shadow)" />
          <g className="folio-animated-corner">
            <path d="M370 45 L400 75 H370 Z" fill="#EAE5DA" stroke="#D3CDC0" strokeWidth="1.2" />
          </g>
          <rect x="222" y="66" width="56" height="18" rx="4" fill="#F4F1EA" />
          <text x="250" y="79" textAnchor="middle" fill="#75828D" fontSize="9" fontWeight="700" letterSpacing="0.06em" fontFamily="-apple-system, sans-serif">p. 1103a</text>
          <text x="286" y="80" fill="#A5B1BC" fontSize="10" fontWeight="600" letterSpacing="0.04em" fontFamily="-apple-system, sans-serif">ETH. NIC.</text>
          <line className="folio-anim-line-1" x1="222" y1="104" x2="300" y2="104" stroke="#CBD4DC" strokeWidth="3" strokeLinecap="round" />
          <line className="folio-anim-line-2" x1="222" y1="122" x2="354" y2="122" stroke="#CBD4DC" strokeWidth="3" strokeLinecap="round" />
          <line className="folio-anim-line-2" x1="222" y1="140" x2="330" y2="140" stroke="#CBD4DC" strokeWidth="3" strokeLinecap="round" />
          <g transform="translate(222, 168)">
            <line x1="0" y1="0" x2="128" y2="0" stroke="#E2F4EE" strokeWidth="8" strokeLinecap="round" />
            <line className="folio-anim-highlight" x1="0" y1="0" x2="128" y2="0" stroke="#25A08D" strokeWidth="4" strokeLinecap="round" />
          </g>
          <g className="folio-anim-beacon" transform="translate(366, 168)">
            <circle className="folio-anim-pulse" cx="0" cy="0" r="5" fill="none" stroke="#25A08D" />
            <circle cx="0" cy="0" r="6" fill="#FFFFFF" stroke="#25A08D" strokeWidth="2" />
            <circle cx="0" cy="0" r="3" fill="#25A08D" />
          </g>
          <circle cx="226" cy="198" r="2.5" fill="#25A08D" />
          <text x="234" y="201" fill="#75828D" fontSize="9" fontWeight="500" fontFamily="-apple-system, sans-serif">14 linked excerpts</text>
        </g>
        <g transform="translate(260, 248)">
          <circle cx="0" cy="0" r="3" fill="#25A08D" />
          <circle cx="40" cy="0" r="3" fill="#25A08D" />
          <circle cx="80" cy="0" r="3" fill="#25A08D" />
          <line x1="3" y1="0" x2="37" y2="0" stroke="#25A08D" strokeWidth="1" />
          <line x1="43" y1="0" x2="77" y2="0" stroke="#25A08D" strokeWidth="1" />
        </g>
      </svg>
      <div className={compact ? "space-y-0.5" : "space-y-1"}>
        <p className={`font-display font-semibold text-neutral-100 ${compact ? "text-base" : "text-lg"}`}>{title}</p>
        {visibleSubtitle && <p className="folio-anim-status text-xs text-neutral-500">{visibleSubtitle}</p>}
      </div>
    </div>
  );
}
