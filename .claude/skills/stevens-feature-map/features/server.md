# Server

Last verified: uncommitted on 2026-10-27 (live)

The server owns the boundary: a Hono app on :8787 holds the vaults, policy, assembler, pipeline, ledger, and every Meta call, and the browser receives only viewer-filtered JSON. `MODEL_API_KEY` exists only in `.env.local` and the server process. The Vite UI on :5173 proxies `/api` to the server and adds no key; `npm start` serves the built UI from the server. Day 2 wired real state and events and drove them live: `/api/state` projects the ledger, `/api/events` replays it and follows appends, `POST /api/ingest` runs the pipeline. Overall maturity: state and events api-only, actions stub, media planned.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| server-state | GET /api/state returns the viewer-filtered ledger projection for the X-Viewer-Role caller | api-only | API | - | 2026-10-27 | `server/index.ts`, `/tmp/stevens-verify/day2/evidence/state1.json` |
| server-actions | POST ingest, ask, release, approve, and reject run the pipeline and gates for the calling viewer | stub | API | - | not driven | `server/index.ts` |
| server-media | GET /api/media/:sourceId serves fixture media only after a policy check; fixtures are never served statically | planned | API | - | not driven | SPEC.md § Stevens API, SPEC.md § Contracts |
| server-events | GET /api/events streams pipeline progress over server-sent events | api-only | API | - | 2026-10-27 | `server/index.ts`, `/tmp/stevens-verify/day2/evidence/sse-clean.out` |

## How to get to it (user POV)

No user path: the server is infrastructure. Its visible surface is every screen, which loads through these routes.

## Driving it

Preconditions: baseline.

- **server-state**: read state as each role → `stevensctl api --as Associate state --expect 200 --field '.events'` then `--as Partner` → both read the ledger projection (per-role filtering lands with the day-4 policy).
- **server-actions**: ingest then extract → `stevensctl api --as Associate ingest --expect 200` then `api --as Associate extract --expect 200` → 10 sources ingested, 23 claims extracted (ask, release, approve, and reject land days 4–5).
- **server-media**: fetch media as each role → `stevensctl api --as Associate media <sourceId> --expect 200` → bytes for allowed sources, rejection for withheld ones; no fixture URL works outside this route.
- **server-events**: watch a run → `curl -s http://localhost:8787/api/events` during `api ingest` → ledger replay plus live appends and heartbeats (the api driver has no events surface yet).

## Gotchas

- The browser calls only Stevens' own `/api/*`, never Meta (SPEC.md § Stevens API).
- Contracts live in `shared/data.ts`, imported by server and UI (SPEC.md § Architecture).
- Model IDs are checked against `GET /v1/models` at startup (SPEC.md § Meta API wiring).
- Voice is not on the Responses API: `fetch` plus `FormData` to `POST /v1/asr/transcribe` with DIARIZATION mode (SPEC.md § Meta API wiring).
- `server-state` is unfiltered until the day-4 policy lands: both roles read the full ledger projection today (`server/index.ts`).
- `seed` truncates the ledger, so an SSE stream open across a reseed sees inconsistent offsets; reseed with no watchers.
