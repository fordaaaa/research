# Windows shell (Notaeo)

Genuine native WinForms app (no WebView). The standalone browser product
stays paused; this is an installed desktop client that talks to the loopback
FastAPI sidecar (`backend/desktop.py`) as a pure JSON API.

- `Research/` — `net10.0-windows` + `EnableWindowsTargeting=true`,
  `AssemblyName Notaeo`. No `Microsoft.Web.WebView2` dependency.
  Native controls throughout: login/register, notebooks sidebar + create,
  sources list/read/paste/upload, exam coach (goal/save/build/select/start/
  resume/write/reveal/self-rate/finish/history/AI explanations), and native
  Settings (actual `/api/settings/ai` provider settings + sign out, available
  logged-out) via a visible button plus Ctrl+,.
- `Research.Tests/` — portable `net10.0` xUnit suite for the UI-independent
  units. It links the actual shipping sources (`DesktopStartup`, `Models`,
  `ApiClient`, `CoachLogic`, `SessionStore`, `BackendProcess`, `UploadPolicy`,
  `PendingGuard`) and exercises them through `HttpMessageHandler` fakes and
  real owned `/bin/sh` processes: auth headers, snake_case bodies, error
  mapping, register duplicate, coach resume/next-question, explanation
  decoding, authenticated notebook ZIP export bytes, DPAPI-shape token storage
  via injectable store/codec (no AppData writes in tests), upload limits,
  401 expiry callback matching, pending-guard duplicate-write prevention, and
  backend READY/timeout/stale-sender lifecycle. 56 tests green on macOS
  (`dotnet test`); WinForms panels themselves are compile-checked only.

Build (on Windows): `powershell -ExecutionPolicy Bypass -File scripts/build_windows_app.ps1`

Compile check (cross-targeting from macOS/Linux CI):
`dotnet build windows/Research/Research.csproj -c Release`
Tests: `dotnet test windows/Research.Tests/Research.Tests.csproj`
WinForms runtime only runs on Windows; macOS/Linux compile + `dotnet test`
verify logic, not the window.

Runtime notes: native API-only mode sets `RESEARCH_NATIVE_DESKTOP=1` with a
strong per-launch `RESEARCH_DESKTOP_TOKEN` sent as `X-Notaeo-Desktop-Token`
on every `/api` request plus the account `Bearer` token; account login stays
mandatory on data routes. The backend binds `127.0.0.1` on an ephemeral port
with a 20-second startup timeout; only the owned sidecar is ever terminated.
Ownership/`Starting`/CTS are assigned before `BeginOutputReadLine`, all
output/timeout/exit handling is UI-marshalled, stale senders are rejected even
when the slot is empty, and only the single complete `RESEARCH_READY` line is
parsed (no unbounded buffer). Data lives in `%APPDATA%/research/data`
(account token in `%APPDATA%/research/account.json` as DPAPI
`CurrentUser`-protected `token_protected`; legacy plaintext `token` is
migrated then cleared, email preserved; passwords/keys are never logged).
Uploads enforce 20 files / 50 MB each / 200 MB combined before loading with no
silent partial; notebook export (`GET /api/notebooks/{id}/export` raw ZIP
bytes, credentials in headers only) saves via `SaveFileDialog`; 401 expiry
clears only the matching stale token and returns to login on the UI thread;
coach `SetBusy` disables action/navigation controls while keeping the progress
indicator visible. No installer is produced and nothing is signed.

Scope honesty: v1 WinForms compiles Release (`net10.0-windows`) and the
portable suite is green, but the actual Windows runtime (window interaction,
real DPAPI, packaged sidecar launch) was not exercised here — macOS has no
WinForms runtime. Not full parity; root will review/finish on Windows.
