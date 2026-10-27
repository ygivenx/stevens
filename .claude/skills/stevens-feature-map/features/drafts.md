# Drafts

Last verified: uncommitted on 2026-10-26 (source)

Drafts are what Stevens writes: the unprompted brief for the next Helios meeting and the Q&A answer to "Should we take the second meeting?", both built from visible sources, the viewer's own personal claims, and the privy verdict — never privy text. The brief carries the churn bridge; the Associate answer recommends hold until Partner review. Day 5 build on top of the bridge. Overall maturity: everything planned.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| drafts-brief | Unprompted brief carries the churn bridge with 2 Fact citations and the "ask how they define churn" inference; the personal quote is chipped visible to you only | planned | UI+API | - | not driven | SPEC.md § Demo, SPEC.md § Validation |
| drafts-answer | Asked answer uses visible data plus the privy verdict and recommends hold with an escalation when the conflicts memo applies | planned | UI+API | - | not driven | SPEC.md § Demo |

## How to get to it (user POV)

Planned UI; no build exists yet. Intended path:

1. Open the app at `http://localhost:5173`.
2. Choose "Brief" to read the unprompted brief with the visible-to-you-only chip.
3. Choose "Ask", type "Should we take the second meeting?", and read the answer.

## Driving it

Preconditions: baseline.

- **drafts-brief**: drive the brief flow → `stevensctl browser run brief` → brief shows the churn bridge with one Personal Fact and one Enterprise Fact.
- **drafts-answer**: ask as Associate → `stevensctl api --as Associate answer --expect 200 --field '.sentences'` → cited answer recommending hold plus the escalation.

## Gotchas

- Brief and answer writing run on Wonder at high effort only if Wonder wins the day 1 A/B; otherwise Spark `high` (SPEC.md § Models).
- Writer calls see visible sources, the viewer's own personal claims, and the `Verdict`; never privy text (SPEC.md § Server components).
- Every displayed sentence needs ≥1 citation; an injected unsupported sentence is dropped and counted (SPEC.md § Validation).
