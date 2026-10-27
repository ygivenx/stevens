# Server

Last verified: uncommitted on 2026-10-27 (source)

The server owns the boundary: a Hono app on :8787 holds the vaults, policy, assembler, pipeline, ledger, and every Meta call, and the browser receives only viewer-filtered JSON. `MODEL_API_KEY` exists only in `.env.local` and the server process. The Vite UI on :5173 proxies `/api` to the server and adds no key; `npm start` serves the built UI from the server. Day 1 scaffolded it (Hono answers `/api/health` and a placeholder `/api/state`, Vite proxies `/api`, `npm start` serves the built UI); day 2 wires real state and events. Overall maturity: one stub, the rest planned.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| server-state | GET /api/state returns the viewer-filtered ledger projection for the X-Viewer-Role caller | stub | API | - | not driven | `server/index.ts`, SPEC.md § Stevens API |
| server-actions | POST ingest, ask, release, approve, and reject run the pipeline and gates for the calling viewer | planned | API | - | not driven | SPEC.md § Stevens API |
| server-media | GET /api/media/:sourceId serves fixture media only after a policy check; fixtures are never served statically | planned | API | - | not driven | SPEC.md § Stevens API, SPEC.md § Contracts |
| server-events | GET /api/events streams pipeline progress over server-sent events | planned | API | - | not driven | SPEC.md § Architecture |

## How to get to it (user POV)

No user path: the server is infrastructure. Its visible surface is every screen, which loads through these routes.

## Driving it

Preconditions: baseline.

- **server-state**: read state as each role → `stevensctl api --as Associate state --expect 200 --field '.drafts'` then `--as Partner` → each sees only its own projection with no leaked text or media.
- **server-actions**: ask then approve → `stevensctl api --as Associate ask --expect 200` then `stevensctl api --as Partner approve <draftId> --expect 200` → answer drafts, then the decision logs.
- **server-media**: fetch media as each role → `stevensctl api --as Associate media <sourceId> --expect 200` → bytes for allowed sources, rejection for withheld ones; no fixture URL works outside this route.
- **server-events**: watch a run → `stevensctl api --as Associate events --until '.stage == drafted'` → transcribing through drafting stages arrive in order.

## Gotchas

- The browser calls only Stevens' own `/api/*`, never Meta (SPEC.md § Stevens API).
- Contracts live in `shared/data.ts`, imported by server and UI (SPEC.md § Architecture).
- Model IDs are checked against `GET /v1/models` at startup (SPEC.md § Meta API wiring).
- Voice is not on the Responses API: `fetch` plus `FormData` to `POST /v1/asr/transcribe` with DIARIZATION mode (SPEC.md § Meta API wiring).
- `server-state` is a stub: it parses `X-Viewer-Role` and answers 200, but `events` and `drafts` are always empty until the day-2 ledger lands (`server/index.ts`).
