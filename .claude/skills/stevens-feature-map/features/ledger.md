# Ledger

Last verified: uncommitted on 2026-10-26 (source)

The ledger is the append-only event log at `data/ledger.jsonl` (gitignored) recording the whole pipeline (`source.ingested` through `draft.approved`), with every real model call logging its model, response ID, usage, and stage key inside its event. Every stage call has a stage key and is reused if it already completed; events are appended before the UI hears of them; a crash resumes with no repeated paid call; replay never re-calls the API. Day 2 build. Overall maturity: everything planned.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| ledger-events | Every pipeline step appends a typed event; real calls log model, response ID, usage, and stage key in theirs; failed attempts log usage too | planned | API | - | not driven | SPEC.md § Server components, SPEC.md § Contracts |
| ledger-resume | A crash or API error resumes from the last completed stage, so no completed paid call repeats | planned | API | - | not driven | SPEC.md § Server components, SPEC.md § Validation |
| ledger-replay | A refresh replays the same brief, answer, and inspector from the ledger with zero new API calls | planned | UI+API | - | not driven | SPEC.md § Server components, SPEC.md § Validation |

## How to get to it (user POV)

No user path: the ledger is infrastructure. Its visible surface is the inspector and the replay behavior on refresh.

## Driving it

Preconditions: baseline.

- **ledger-events**: drive the demo path then read the log → `stevensctl browser run brief && stevensctl api --as Associate ledger --expect 200 --field '.events'` → typed events with model, response ID, usage, and stage key on real calls.
- **ledger-resume**: kill the server mid-pipeline and restart → `stevensctl stack restart` mid-run then `stevensctl meta calls` → counter shows no repeated paid call.
- **ledger-replay**: reload and count API calls → `stevensctl meta calls` before and after a refresh → counter unchanged, same brief and inspector.

## Gotchas

- Model IDs in logged events must appear in `GET /v1/models`, so the 1.3 → 1.2 → 1.1 fallback still validates (SPEC.md § Meta API wiring).
- A stage key hashes stage, source IDs, prompt version, and model; the server reuses a completed event with that key before calling (SPEC.md § Server components).
- On a missing key or API error the app uses the cached fixture response with a visible `Simulated — <reason>` badge, and the boundary never degrades (SPEC.md § Meta API wiring).
