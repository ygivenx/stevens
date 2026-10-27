# Ledger

Last verified: uncommitted on 2026-10-27 (live)

The ledger is the append-only event log at `data/ledger.jsonl` (gitignored) recording the whole pipeline (`source.ingested` through `draft.approved`), with every real model call logging its model, response ID, usage, and stage key inside its event. Every stage call has a stage key and is reused if it already completed; events are appended before the UI hears of them; a crash resumes with no repeated paid call; replay never re-calls the API. Day 2 built it and drove it live: append/read with stage keys, kill-and-resume with no repeated completed call, failed-attempt logging, and state re-read with a static call counter. Overall maturity: replay beta, events and resume api-only.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| ledger-events | Every pipeline step appends a typed event; real calls log model, response ID, usage, and stage key in theirs; failed attempts log usage too | api-only | API | - | 2026-10-27 | `server/ledger/store.ts`, `server/ledger/store.test.ts`, `/tmp/stevens-verify/day2/evidence/ingest1.json` |
| ledger-resume | A crash or API error resumes from the last completed stage, so no completed paid call repeats | api-only | API | - | 2026-10-27 | `server/pipeline/ingest.ts`, `/tmp/stevens-verify/day2/evidence/ingest-resumed.json` |
| ledger-replay | A refresh replays the same brief, answer, and inspector from the ledger with zero new API calls | beta | UI+API | - | 2026-10-27 | `web/src/App.tsx`, `/tmp/stevens-verify/day6/evidence/run-brief.png` |

## How to get to it (user POV)

No user path: the ledger is infrastructure. Its visible surface is the inspector and the replay behavior on refresh.

## Driving it

Preconditions: baseline.

- **ledger-events**: ingest then read state → `stevensctl api --as Associate ingest --expect 200` then `stevensctl api --as Associate state --field '.events'` → 10 typed `source.ingested` events with model, response ID, usage, and stage key on paid calls.
- **ledger-resume**: slow the fake, ingest in background, `kill -9` the stack pgid, `stack up`, re-ingest → `talk-oct20` reused, every source ingested exactly once, counter grows only for incomplete stages.
- **ledger-replay**: reload and count API calls → `stevensctl meta calls` before and after `api state` → counter unchanged, same brief and answer (inspector UI day 6).

## Gotchas

- Model IDs in logged events must appear in `GET /v1/models`, so the 1.3 → 1.2 → 1.1 fallback still validates (SPEC.md § Meta API wiring).
- A stage key hashes stage, source IDs, prompt version, and model; the server reuses a completed event with that key before calling (SPEC.md § Server components).
- On a missing key or API error the app uses the cached fixture response with a visible `Simulated — <reason>` badge, and the boundary never degrades (SPEC.md § Meta API wiring).
- Live drives ran on fake `normal`/`slow`, so logged usage is zeros; the live usage shape was proven by the day-1 spikes (`spikes/day1/README.md`).
- `kill -9` is not a logged attempt: an in-flight call at kill time retries after restart, so the counter counts it twice while the ledger completes it once.
