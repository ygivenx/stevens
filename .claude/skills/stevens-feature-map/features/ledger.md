# Ledger

Last verified: uncommitted on 2026-10-26 (source)

The ledger is the append-only event log in `localStorage` recording the whole pipeline (`source.ingested` through `draft.approved`), with every real model call logging its model, response ID, and usage inside its event. API payloads are cached in their events, so a refresh replays the same brief, answer, and inspector with zero new calls. Day 2 build. Overall maturity: everything planned.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| ledger-events | Every pipeline step appends a typed event; real calls log model, response ID, and usage in theirs | planned | API | - | not driven | SPEC.md:46, SPEC.md:56 |
| ledger-replay | A refresh replays the same brief, answer, and inspector from cached payloads with zero new API calls | planned | UI+API | - | not driven | SPEC.md:46, SPEC.md:148 |

## How to get to it (user POV)

No user path: the ledger is infrastructure. Its visible surface is the inspector and the replay behavior on refresh.

## Driving it

Preconditions: baseline.

- **ledger-events**: drive the demo path then read the log → `stevensctl browser run brief && stevensctl api --as Associate ledger --expect 200 --field '.events'` → typed events with model, response ID, and usage on real calls.
- **ledger-replay**: reload and count API calls → `stevensctl meta calls` before and after a refresh → counter unchanged, same brief and inspector.

## Gotchas

- Model IDs in logged events must appear in `GET /v1/models`, so the 1.3 → 1.2 → 1.1 fallback still validates (SPEC.md:116).
- Replay is plumbing for reliable recording, not a demo feature (SPEC.md:46).
- On a missing key or API error the app uses the cached fixture response with a visible `Simulated — <reason>` badge (SPEC.md:116).
