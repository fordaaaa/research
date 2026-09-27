# Folio loading + staged sound (offline-first)

Status: staged. Web boot + reader opening use the folio loop in this repo;
macOS `StartupView` mirrors the motif natively; mobile + Windows reuse the
same offline assets. Thinking orbs stay the AI-only indicator.

## Loader contract

- **Folio = opening things.** Boot (`App.tsx` `!authReady`), reader opening
  (`ReaderModal`), notebook export busy copy, and the pre-hydration
  `index.html` splash (`public/folio-boot.css`). Props carry the copy:
  `title` (e.g. `Preparing your workspace…`, `Opening source…`) +
  optional `subtitle` (`Laying folio flat…`).
- **Orbs = AI thinking only.** `ThinkingDots` (`thinking-orbs` web,
  `expo-thinking-orbs` on mobile) stays on chat/research/outline/study AI
  busy states with contrasting ink on deep-sea buttons. Never swap orbs for
  folio on AI states or vice versa.
- **Offline first.** No Tailwind CDN, no external fonts, no remote SVG. The
  source `animated_svg.html` used `https://cdn.tailwindcss.com`, which the
  desktop sidecar CSP (`default-src 'self'`) blocks and which breaks the
  no-network rule — the port strips it. Keyframes live in `src/index.css`
  (bundled, CSP-clean); the boot splash is `public/folio-boot.css` (served
  as `self`, painted before React).
- **Motion.** 3.2s loop everywhere; `prefers-reduced-motion` renders a
  static folio frame (global CSS collapse + component/SwiftUI guards).
  Screen readers get `role="status"` HTML copy; the SVG is `aria-hidden`.

## Sound staging (this pass: boot + success chimes)

- `src/sound.ts`: offline WebAudio synth (two-note boot lift, single soft
  confirm), no assets, no network. **On by default** (owner decision) with a
  shared lazily-created context that resumes on first gesture (browsers and
  WKWebView start contexts suspended). Toggle in Settings persists per-device
  (`notaeo:sound`); every `play*` no-ops when muted or without
  `AudioContext`.
- Wired: login/notebook-open boot chime (post-gesture), notebook export
  success chime, Settings preview on enable. No looped audio during AI
  thinking — orbs cover that visually.
- macOS shell: no autoplay; native `NSSound` hook reserved (same two chimes,
  same default-on + Settings mirroring) — not wired yet.
- Mobile (`research-mobile`, separate repo): stage with `expo-audio` synth
  tones mirroring these frequencies, default-off + settings toggle; keep the
  existing `ThinkingDots` spinner fallback for Skia-less runtimes.

## Platform integration

- **Web:** `FolioLoader.tsx` + `folio-boot.css` splash. Works on Windows
  browsers as-is (no Windows-only code).
- **macOS:** `ResearchApp.swift` `StartupView` recreates the folio in
  SwiftUI (paper card + lines + seafoam sweep + beacon pulse) with
  `accessibilityReduceMotion` guards; the WKWebView then paints the same
  web splash + `FolioLoader`.
- **Windows (deferred shell):** reuse the desktop sidecar pattern
  (`backend/desktop.py` loopback + `StaticFiles` web dir + per-launch token)
  with a WebView2 host. The web bundle already carries the offline splash
  and loader, so no Windows-specific loader code is needed — host work is
  process + token + save-panel parity with `DownloadHandler`.
- **Mobile (`research-mobile`):** copy `frontend/public/folio-boot.css`
  timing (3.2s) into an `expo-splash-screen` + `FolioLoader` RN component
  (recommend `react-native-svg` port of the folio SVG; keep `ThinkingDots`
  for AI states). Initial route (`loading` screen + font gate) renders the
  folio with the same copy; reader `loading` state uses the compact variant.
  Fonts already gate the splash — hold `hideAsync()` until folio + fonts
  are ready, as today.

## Online enhancement hook (only if the network is there for another reason)

Never fetch to unlock the loader. If the app is already online (web search,
URL ingest, BYOK AI on explicit user action), an enhancement may swap the
static boot card for a remote Lottie/skinned variant — same copy, same
timing, same reduced-motion rule, and it must fall back to this offline
folio on any failure. No such remote variant is bundled or required.
