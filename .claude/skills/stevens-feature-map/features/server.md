# Server

Last verified: uncommitted on 2026-10-28 (source)

The server owns the boundary: day 9b runs two Hono processes from one shared factory (`server/common/app.ts`) — Stevens · firm on :8787 and Stevens · yours on :8788 — each with its own ledger and SQLite file. The personal web app on :5173 proxies to :8788; the firm web app on :5174 proxies to :8787. `MODEL_API_KEY` and `STEVENS_AGENT_TOKEN` exist only in `.env.local` and the server processes. `npm start` serves each built UI from its own server. Overall maturity: everything api-only.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| server-state | GET /api/state returns the viewer-filtered ledger projection for the X-Viewer-Role caller | api-only | API | - | 2026-10-27 | `server/boundary/filter.ts`, `/tmp/stevens-verify/day4/evidence/assoc2.json` |
| server-actions | POST ingest, ask, release, approve, and reject run the pipeline and gates for the calling viewer | api-only | API | - | 2026-10-27 | `server/index.ts` |
| server-media | GET /api/media/:sourceId serves fixture media only after a policy check; fixtures are never served statically | api-only | API | - | 2026-10-27 | `server/index.ts` |
| server-events | GET /api/events sends only empty `changed` signals over server-sent events, on both processes | api-only | API | - | 2026-10-27 | `server/common/app.ts`, `server/firm/routes.test.ts` |
| server-solo-routes | Solo routes: /api/state reports solo with five sources, /api/ask accepts an empty dealId, /api/share answers 409 | api-only | API | - | not driven | `server/personal/index.ts`, `server/personal/routes.test.ts` |
| server-firm-rebuild | The firm rebuilds `firm.db` from its ledger with Postgres stopped and zero calls, then syncs every 60 seconds | api-only | API | - | 2026-10-28 | `server/firm/sync.ts`, `server/firm/index.ts`, `server/firm/postgres.test.ts` (live rebuild) |
| server-demo-replay | `record-replay` records the fixture-only flow to `fixtures/replay/` and refuses owner sources; `npm run demo` serves it with no key and no Postgres; both status lines read Replaying a recorded run | beta | UI+API | - | 2026-10-28 | `scripts/demo.ts`, `fixtures/replay/`, alt-port replay drive 2026-10-28 |
| server-failure-drills | 16 failure drills green: firm down/up (hold, queued, sent on return), meta fail/garbage/empty/slow, readwise down, CRM unreachable with snapshot kept | beta | infra | - | 2026-10-28 | `.claude/skills/verify-stevens/drills.py`, `stevensctl firm down\|up` |
| server-firm-timeout | Firm agent calls time out at 120s (STEVENS_FIRM_TIMEOUT_MS overrides) instead of hanging on a black hole | api-only | API | - | not driven | `server/personal/firm-client.ts`, `server/personal/firm-client.test.ts` |

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
