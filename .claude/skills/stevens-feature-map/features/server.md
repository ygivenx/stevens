# Server

Last verified: uncommitted on 2026-10-27 (live)

The server owns the boundary: a Hono app on :8787 holds the vaults, policy, assembler, pipeline, ledger, and every Meta call, and the browser receives only viewer-filtered JSON. `MODEL_API_KEY` exists only in `.env.local` and the server process. The Vite UI on :5173 proxies `/api` to the server and adds no key; `npm start` serves the built UI from the server. Day 4 filtered state per viewer and added the release and media routes. Overall maturity: everything api-only.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| server-state | GET /api/state returns the viewer-filtered ledger projection for the X-Viewer-Role caller | api-only | API | - | 2026-10-27 | `server/boundary/filter.ts`, `/tmp/stevens-verify/day4/evidence/assoc2.json` |
| server-actions | POST ingest, ask, release, approve, and reject run the pipeline and gates for the calling viewer | api-only | API | - | 2026-10-27 | `server/index.ts` |
| server-media | GET /api/media/:sourceId serves fixture media only after a policy check; fixtures are never served statically | api-only | API | - | 2026-10-27 | `server/index.ts` |
| server-events | GET /api/events sends only empty `changed` signals over server-sent events | api-only | API | - | 2026-10-27 | `server/index.ts`, `server/routes.test.ts` |

## How to get to it (user POV)

No user path: the server is infrastructure. Its visible surface is every screen, which loads through these routes.

## Driving it

Preconditions: baseline.

- **server-state**: read state as each role → `stevensctl api --as Associate state --expect 200 --field '.events'` then `--as Partner` → both read the ledger projection (per-role filtering lands with the day-4 policy).
- **server-actions**: run the pipeline → `api ingest`, `extract`, `bridge`, `brief`, `ask --data`, `release/<id>`, `approve/<id>` → every action answers with ledgered results.
- **server-media**: fetch media as each role → `stevensctl api --as Associate media <sourceId> --expect 200` → bytes for allowed sources, rejection for withheld ones; no fixture URL works outside this route.
- **server-events**: watch a run → `curl -s http://localhost:8787/api/events` during `api ingest` → ledger replay plus live appends and heartbeats (the api driver has no events surface yet).

## Gotchas

- The browser calls only Stevens' own `/api/*`, never Meta (SPEC.md § Stevens API).
- Contracts live in `shared/data.ts`, imported by server and UI (SPEC.md § Architecture).
- Model IDs are checked against `GET /v1/models` at startup (SPEC.md § Meta API wiring).
- Voice is not on the Responses API: `fetch` plus `FormData` to `POST /v1/asr/transcribe` with DIARIZATION mode (SPEC.md § Meta API wiring).
- `server-state` drops non-visible sources entirely: text, title, and id never reach that viewer (SPEC.md § Contracts).
- `seed` truncates the ledger, so an SSE stream open across a reseed sees inconsistent offsets; reseed with no watchers.
- Day 9a fix: `GET /api/events` sends only `event: changed` with `data: {}` and never ledger text (`server/index.ts`); covered by `server/routes.test.ts`. The client only uses the stream as a ping (`web/src/api.ts:55`).
