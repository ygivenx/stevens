# Bridge

Last verified: uncommitted on 2026-10-27 (live)

The bridge is the judged link from off-the-clock learning to a work decision: code proposes candidate claim pairs sharing an entity or metric, and the reasoning model labels each `contradicts | supports | context` with a reason, or rejects it. The demo bridge is mid-market churn 6–8% (talk) against the deck's net churn 1.8%. Day 5 built and drove it live: 4 pairs judged, talk×deal among them. Overall maturity: everything api-only.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| bridge-candidates | Code proposes candidate pairs sharing an entity or metric across the two vaults | api-only | API | - | 2026-10-27 | `server/pipeline/bridge.ts`, `/tmp/stevens-verify/day5/evidence/bridge2.json` |
| bridge-judge | Wonder at high effort labels each pair with a relation and reason, or rejects it; text claims only | api-only | API | - | 2026-10-27 | `server/pipeline/bridge.ts`, `/tmp/stevens-verify/day5/evidence/bridge2.json` |

## How to get to it (user POV)

Planned UI; no build exists yet. Intended path:

1. Open the app at `http://localhost:5173`.
2. Choose "Brief".
3. See the churn bridge with one Personal Fact and one Enterprise Fact cited.

## Driving it

Preconditions: baseline.

- **bridge-candidates**: judge the pairs → `stevensctl api --as Associate bridge --expect 200 --field '.judged'` → churn-family pairs proposed (metric head-noun match, one pair per source pair).
- **bridge-judge**: judge the candidates → `stevensctl api --as Associate bridge --expect 200 --field '.judged'` → judged pairs with a relation and reason (live judges said `context`).

## Gotchas

- Wonder won the day-1 A/B and judges; the fallback stays Spark 1.3 `high` (SPEC.md § Models).
- Wonder gets text only: image and audio input is reported inconsistently (SPEC.md § Models).
- Code prefilters candidates so the judge makes few calls; prompt iteration happens on Spark (SPEC.md § Models).
- **Known defect (found 2026-10-27, open):** `filterState` passes `bridge.judged` through with only the manifest redacted (`server/boundary/filter.ts:51`), so `bridge.reason`, model text derived from the Associate's unreleased personal claim, reaches the Partner; PR #8's Judged-bridges card renders it (`web/src/brief.tsx`). Fix in SPEC.md v3 day 9a; in v3 bridges never leave Stevens · yours.
