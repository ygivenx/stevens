# Privy

Last verified: uncommitted on 2026-10-26 (source)

The privy step is the agent↔viewer boundary at answer time: Wonder reasons over the privy sources that code matched by entity and returns only a `Verdict` with no string fields. An Associate's answer recommends "hold until Partner review" without ever learning why, and an escalation is drafted to a Partner. Failures fail closed. Day 5 build. Overall maturity: everything planned.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| privy-verdict | The privy step sees code-matched privy sources and returns exactly a verdict (proceed, hold, or decline plus routing); one call per question | planned | API | - | not driven | SPEC.md § Models, SPEC.md § Contracts |
| privy-escalation | A hold verdict produces an escalation draft to a Partner carrying no content; with the conflicts memo removed there is no escalation | planned | UI+API | - | not driven | SPEC.md § Contracts, SPEC.md § Validation |
| privy-fail-closed | A privy step that fails validation twice yields hold routed to a Partner, flagged as failed closed | planned | API | - | not driven | SPEC.md § Server components, SPEC.md § Validation |

## How to get to it (user POV)

Planned UI; no build exists yet. Intended path:

1. Open the app at `http://localhost:5173`.
2. As Associate, choose "Ask" and type "Should we take the second meeting?".
3. See "Recommendation: hold until a Partner reviews. Stevens weighed information you are not privy to." plus the drafted escalation.

## Driving it

Preconditions: baseline.

- **privy-verdict**: ask with the conflicts memo present → `stevensctl api --as Associate answer --expect 200 --field '.verdict'` → `hold` routed to Partner with no memo text in the response.
- **privy-escalation**: ask with and without the memo → `stevensctl api --as Associate answer --field '.escalation'` → escalation event with no content; rerun with the memo removed → `proceed` and no escalation.
- **privy-fail-closed**: force the privy step to fail → `stevensctl meta fake --mode garbage && stevensctl api --as Associate answer --field '.verdict'` → `hold` with `failedClosed: true` and a `Simulated — privy check failed` label; then `stevensctl meta fake --mode normal`.

## Gotchas

- `Verdict` has no string fields by design; extra fields or strings are rejected (SPEC.md § Contracts, SPEC.md § Validation).
- `escalation.drafted` carries no content by design, and shows personal sources as owner-only (SPEC.md § Contracts, SPEC.md § Demo).
- Privy reveals that something matters and which way it pushes; that leak is accepted for partner memos, and legal walls are `excluded` instead (SPEC.md § The access rule).
- The privy step never falls back to showing content when it cannot complete (SPEC.md § Server components).
