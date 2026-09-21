# Mobile-browser E2E (Playwright)

Two touch-viewport projects: **iphone-webkit** (iPhone 14 device profile,
WebKit) and **pixel-chromium** (Pixel 7 device profile, Chromium).
Selectors are accessibility-first (`getByRole`/`getByLabel`/placeholders,
`data-testid` only for the review swipe surface); no timing sleeps — every
wait is a Playwright auto-retrying assertion.

## Local (default)

Starts the repo's FastAPI backend (`uv run`, never system python) and Vite
on loopback with an isolated temp data dir — repo `backend/data/` is never
touched:

```sh
npm run e2e            # both mobile projects
npm run e2e:iphone     # iPhone/WebKit only
npm run e2e:pixel      # Pixel/Chromium only
npm run e2e:list       # list tests without running
```

Local ports: backend `127.0.0.1:8000`, frontend `127.0.0.1:5173`
(`RESEARCH_E2E_WEB_PORT` overrides the frontend port).

## Remote (deployed backend)

```sh
RESEARCH_E2E_BASE_URL=https://<host> npm run e2e:remote
```

No local servers are started. Write tests additionally require either
`RESEARCH_E2E_EMAIL` + `RESEARCH_E2E_PASSWORD` (an existing account) or
`RESEARCH_E2E_ALLOW_REGISTRATION=1` (register a throwaway account).
With neither, the journey spec skips with that reason and only the
`/api/health` contract + public login-shell checks run. Never commit
credentials; prefer a throwaway password.

## Privacy warning

Remote write tests create a temporary user (registration mode) and one
notebook named `e2e-m-*` holding pasted test text, flashcards, and notes.
The journey test deletes that notebook via the UI; `afterEach` best-effort
deletes only the exact notebook id captured from that run's
`POST /api/notebooks` response (no prefix sweep, so concurrent runs on one
account cannot delete each other's notebooks). On failure leftovers can
remain — delete that run's `e2e-m-*` notebook from the account afterwards.
Registration-mode user accounts remain: there is no account-delete endpoint.

## Coverage

- `health.contract.spec.ts` — `GET /api/health` is `{ok:true}`; failures
  attach status + body to the report.
- `auth.shell.spec.ts` — public login shell, no account needed.
- `mobile.journey.spec.ts` — log in/register → uniquely named notebook →
  paste source → reader (incl. Important-passages expectation for pastes:
  hidden, since only URL ingests rank passages per `core/ingest.py`) →
  flashcard create/tag/edit → source-grounded drafts → due review graded
  via accessible buttons (+ swipe-surface `touch-action: pan-y` and tap
  assertion) → glossary → quiz → note create/autosave → notebook delete.

## Browsers

Playwright browsers are not downloaded automatically. If a run reports
missing executables, install once with `npx playwright install` (large
download); CI installs `chromium` + `webkit` instead.
