# Restricted

Last verified: uncommitted on 2026-10-26 (source)

The restricted check is the agent↔viewer boundary at answer time: code matches the decision's entities against restricted sources, Spark answers yes or no on materiality, and the only output is `{ material: boolean }` — never the restricted text. When material, Stevens says so and drafts an escalation to a Partner. Day 4 build. Overall maturity: everything planned.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| restricted-check | Code matches entities against restricted sources; Spark at low effort answers materiality with `{ material: boolean }` only | planned | API | - | not driven | SPEC.md:28, SPEC.md:56 |
| restricted-escalation | A material check produces `escalation.drafted` to a Partner carrying no content; with the memo removed there is no escalation | planned | UI+API | - | not driven | SPEC.md:56, SPEC.md:148 |

## How to get to it (user POV)

Planned UI; no build exists yet. Intended path:

1. Open the app at `http://localhost:5173`.
2. As Associate, choose "Ask" and type "Should we take the second meeting?".
3. See the flag "Restricted information material to this decision exists; escalation drafted to a Partner."

## Driving it

Preconditions: baseline.

- **restricted-check**: ask with the conflicts memo present → `stevensctl api --as Associate answer --expect 200 --field '.restricted.material'` → `true` with no memo text in the response.
- **restricted-escalation**: ask with and without the memo → `stevensctl api --as Associate answer --field '.escalation'` → escalation event with no content; rerun with the memo removed → no escalation.

## Gotchas

- `escalation.drafted` carries no content by design (SPEC.md:56).
- The inspector shows a `restricted` manifest's contents only to a Partner; an Associate sees "1 restricted check ran — contents hidden" (SPEC.md:56).
- The check output schema is `{ material: boolean }` only, so the model cannot leak through verbosity (SPEC.md:28).
