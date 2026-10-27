# Drafts

Last verified: uncommitted on 2026-10-27 (live)

Drafts are what Stevens writes: the unprompted brief for the next Helios meeting and the Q&A answer to "Should we take the second meeting?", both built from visible sources, the viewer's own personal claims, and the privy verdict — never privy text. The brief carries the churn bridge; the Associate answer recommends hold until Partner review. Day 5 built and drove it live: 7-sentence brief, hold answer with escalation. Overall maturity: everything beta (happy path works in Chromium).

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| drafts-brief | Unprompted brief carries the churn bridge with 2 Fact citations and the "ask how they define churn" inference; the personal quote is chipped visible to you only | beta | UI+API | - | 2026-10-27 | `web/src/brief.tsx`, `/tmp/stevens-verify/day6/evidence/run-brief.png` |
| drafts-answer | Asked answer uses visible data plus the privy verdict and recommends hold with an escalation when the conflicts memo applies | beta | UI+API | - | 2026-10-27 | `web/src/answer.tsx`, `/tmp/stevens-verify/day6/evidence/run-answer.png` |

## How to get to it (user POV)


1. Open the app at `http://localhost:5173`.
2. Choose "Brief" to read the unprompted brief with the visible-to-you-only chip.
3. Choose "Ask", type "Should we take the second meeting?", and read the answer.

## Driving it

Preconditions: baseline.

- **drafts-brief**: write the brief → `stevensctl api --as Associate brief --expect 200` → cross-vault bridge sentences with 0 dropped (chip renders day 6).
- **drafts-answer**: ask as Associate → `stevensctl api --as Associate ask --data '{"question":"..."}' --expect 200` → cited answer recommending hold plus the escalation.

## Gotchas

- Brief and answer writing run on Wonder at high effort after its day-1 A/B win (SPEC.md § Models).
- Writer calls see visible sources, the viewer's own personal claims, and the `Verdict`; never privy text (SPEC.md § Server components).
- Every displayed sentence needs ≥1 citation; an injected unsupported sentence is dropped and counted (SPEC.md § Validation).
