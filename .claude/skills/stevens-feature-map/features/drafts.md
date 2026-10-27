# Drafts

Last verified: uncommitted on 2026-10-26 (source)

Drafts are what Stevens writes: the unprompted brief for the next Helios meeting and the Q&A answer to "Should we take the second meeting?", both built from allowed claims only, both fully cited, with a chip counting how many personal quotes crossed into work. Day 5 build on top of the bridge. Overall maturity: everything planned.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| drafts-brief | Unprompted brief carries the churn bridge with 2 Fact citations and drafts the "ask how they define churn" inference | planned | UI+API | - | not driven | SPEC.md:18, SPEC.md:148 |
| drafts-answer | Asked answer uses visible data only and flags restricted material with an escalation when the conflicts memo applies | planned | UI+API | - | not driven | SPEC.md:18 |
| drafts-crossing-count | The "N quotes crossed" chip equals the personal claims listed in work-call manifests | planned | UI | - | not driven | SPEC.md:18, SPEC.md:148 |

## How to get to it (user POV)

Planned UI; no build exists yet. Intended path:

1. Open the app at `http://localhost:5173`.
2. Choose "Brief" to read the unprompted brief with the crossing chip.
3. Choose "Ask", type "Should we take the second meeting?", and read the answer.

## Driving it

Preconditions: baseline.

- **drafts-brief**: drive the brief flow → `stevensctl browser run brief` → brief shows the churn bridge with one Personal Fact and one Enterprise Fact.
- **drafts-answer**: ask as Associate → `stevensctl api --as Associate answer --expect 200 --field '.sentences'` → cited answer plus the restricted-material flag.
- **drafts-crossing-count**: read the chip and the manifests → `stevensctl browser run brief` → chip "1 quote crossed personal → work" matches the manifests.

## Gotchas

- Brief and answer drafting run on Wonder at high effort only if Wonder wins the day 1 A/B; otherwise Spark `high` (SPEC.md:28).
- Draft input is only what the call manifest allows; the prompt and the manifest are built together (SPEC.md:28).
- Every displayed sentence needs ≥1 citation; an injected unsupported sentence is dropped and counted (SPEC.md:148).
