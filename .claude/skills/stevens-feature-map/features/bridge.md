# Bridge

Last verified: uncommitted on 2026-10-26 (source)

The bridge is the judged link from off-the-clock learning to a work decision: code proposes candidate claim pairs sharing an entity or metric, and the reasoning model labels each `contradicts | supports | context` with a reason, or rejects it. The demo bridge is mid-market churn 6–8% (talk) against the deck's net churn 1.8%. Day 5 build. Overall maturity: everything planned.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| bridge-candidates | Code proposes candidate pairs sharing an entity or metric across the two vaults | planned | API | - | not driven | SPEC.md § Server components |
| bridge-judge | Wonder at high effort labels each pair with a relation and reason, or rejects it; text claims only | planned | API | - | not driven | SPEC.md § Models, SPEC.md § Server components |

## How to get to it (user POV)

Planned UI; no build exists yet. Intended path:

1. Open the app at `http://localhost:5173`.
2. Choose "Brief".
3. See the churn bridge with one Personal Fact and one Enterprise Fact cited.

## Driving it

Preconditions: baseline.

- **bridge-candidates**: seed then list candidates → `stevensctl seed && stevensctl api --as Associate bridge candidates --expect 200 --field '.pairs'` → the churn pair is proposed.
- **bridge-judge**: judge the candidates → `stevensctl api --as Associate bridge judge --expect 200 --field '.bridges[0].relation'` → `contradicts` with a reason.

## Gotchas

- Wonder is unverified until the day 1 A/B against Spark `high` on the bridge and privy prompts; the fallback is Spark 1.3 `high` (SPEC.md § Models).
- Wonder gets text only: image and audio input is reported inconsistently (SPEC.md § Models).
- Code prefilters candidates so the judge makes few calls; prompt iteration happens on Spark (SPEC.md § Models).
