# Approval

Last verified: uncommitted on 2026-10-26 (source)

Approval closes the demo loop: switching to Partner reveals the conflicts memo (Helios competes with portfolio company Lumen) plus the released churn quote while every other personal source stays owner-only, the Partner approves "take the meeting after conflict review", and the decision is logged. The role switcher sends `X-Viewer-Role` and the server enforces it; the switcher is labeled "simulated sign-in". Day 6 UI. Overall maturity: everything planned.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| approval-role-switch | Associate/Partner switch changes what is visible: the Partner sees the conflicts memo and released quote the Associate's firm view never shows | planned | UI+API | - | not driven | SPEC.md § Demo, SPEC.md § Architecture |
| approval-decision | The Partner approves or rejects a draft and the decision is logged with the draft id and role | planned | UI+API | - | not driven | SPEC.md § Demo, SPEC.md § Contracts |

## How to get to it (user POV)

Planned UI; no build exists yet. Intended path:

1. Open the app at `http://localhost:5173`.
2. Switch role to Partner and read the conflicts memo and the released quote.
3. Choose "Approve" on the answer and see the logged decision.

## Driving it

Preconditions: baseline.

- **approval-role-switch**: switch roles → `stevensctl browser run role-switch` → conflicts memo visible as Partner, absent as Associate.
- **approval-decision**: approve as Partner → `stevensctl api --as Partner approve answer --expect 200 --field '.status'` → `approved` with a `draft.approved` ledger event.

## Gotchas

- Role switch itself is a ledger event (`role.switched`), so the inspector can show who saw what when (SPEC.md § Contracts).
- Draft status moves `draft` → `approved` or `rejected` only through this path (SPEC.md § Contracts).
- Auth is out of scope; the switcher is labeled "simulated sign-in" (SPEC.md § Architecture).
