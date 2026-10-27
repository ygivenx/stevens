# Approval

Last verified: uncommitted on 2026-10-26 (source)

Approval closes the demo loop: switching to Partner reveals the conflicts memo (Helios competes with portfolio company Lumen), the Partner approves "take the meeting after conflict review", and the decision is logged. Stevens drafts; the human decides. Day 6 UI. Overall maturity: everything planned.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| approval-role-switch | Associate/Partner switch changes what is visible: the Partner sees the conflicts memo the Associate never saw | planned | UI+API | - | not driven | SPEC.md:18, SPEC.md:56 |
| approval-decision | The Partner approves or rejects a draft and the decision is logged with the draft id and role | planned | UI+API | - | not driven | SPEC.md:18, SPEC.md:56 |

## How to get to it (user POV)

Planned UI; no build exists yet. Intended path:

1. Open the app at `http://localhost:5173`.
2. Switch role to Partner and read the conflicts memo.
3. Choose "Approve" on the answer and see the logged decision.

## Driving it

Preconditions: baseline.

- **approval-role-switch**: switch roles → `stevensctl browser run role-switch` → conflicts memo visible as Partner, absent as Associate.
- **approval-decision**: approve as Partner → `stevensctl api --as Partner approve answer --expect 200 --field '.status'` → `approved` with a `draft.approved` ledger event.

## Gotchas

- Role switch itself is a ledger event (`role.switched`), so the inspector can show who saw what when (SPEC.md:56).
- Draft status moves `draft` → `approved` or `rejected` only through this path (SPEC.md:56).
