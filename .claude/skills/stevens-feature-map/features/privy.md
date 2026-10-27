# Privy

Last verified: uncommitted on 2026-10-27 (live)

The privy step is the agent↔viewer boundary at answer time: Wonder reasons over the privy sources that code matched by entity and returns only a `Verdict` with no string fields. An Associate's answer recommends "hold until Partner review" without ever learning why, and an escalation is drafted to a Partner. Failures fail closed. Day 5 built and drove it live. Overall maturity: escalation beta, verdict and fail-closed api-only.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| privy-verdict | The privy step sees code-matched privy sources and returns exactly a verdict (proceed, hold, or decline plus routing); one call per question | api-only | API | - | 2026-10-27 | `server/pipeline/ask.ts`, `/tmp/stevens-verify/day5/evidence/answer2.json` |
| privy-escalation | A hold verdict produces an escalation draft to a Partner carrying no content; with the conflicts memo removed there is no escalation | beta | UI+API | - | 2026-10-27 | `web/src/answer.tsx`, `/tmp/stevens-verify/day6/evidence/run-answer.png` |
| privy-fail-closed | A privy step that fails validation twice yields hold routed to a Partner, flagged as failed closed | api-only | API | - | 2026-10-27 | `server/pipeline/ask.ts` |

## How to get to it (user POV)


1. Open the app at `http://localhost:5173`.
2. As Associate, choose "Ask" and type "Should we take the second meeting?".
3. See "Recommendation: hold until a Partner reviews. Stevens weighed information you are not privy to." plus the drafted escalation.

## Driving it

Preconditions: baseline.

- **privy-verdict**: ask with the conflicts memo present → `stevensctl api --as Associate ask --data '{"question":"Should we take the second Helios meeting?"}' --field '.verdict'` → `hold` routed to Partner with no memo text in the response.
- **privy-escalation**: ask with and without a match → the Helios ask escalates with no content; an unmatched ask yields `proceed` and no escalation (unit-covered in `pipeline.test.ts`).
- **privy-fail-closed**: force the privy step to fail → `stevensctl meta fake --mode garbage` then ask → `hold` with `failedClosed: true` (the `Simulated` label renders day 7); then `meta fake --mode normal`.

## Gotchas

- `Verdict` has no string fields by design; extra fields or strings are rejected (SPEC.md § Contracts, SPEC.md § Validation).
- `escalation.drafted` carries no content by design, and shows personal sources as owner-only (SPEC.md § Contracts, SPEC.md § Demo).
- Privy reveals that something matters and which way it pushes; that leak is accepted for partner memos, and legal walls are `excluded` instead (SPEC.md § The access rule).
- The privy step never falls back to showing content when it cannot complete (SPEC.md § Server components).
