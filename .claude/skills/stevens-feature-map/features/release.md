# Release

Last verified: uncommitted on 2026-10-27 (live)

The release gate in `server/boundary/release.ts` is the personal→firm boundary: escalations, approved decisions, and every response to a non-owner pass through it. Personal citations render as "Personal source (owner only)" unless a `personal.released` event exists for that claim. Only the owner can release a quote, one quote per release, and each release is logged. Day 4 built it and drove it live: owner release, 403 for non-owners, released quote visible to the Partner. Overall maturity: everything api-only.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| release-share | The owner clicks Share with the firm on one quote, which logs a personal.released event for that claim | api-only | UI+API | - | 2026-10-27 | `server/index.ts`, `/tmp/stevens-verify/day4/evidence/partner.json` |
| release-gate | Escalations, approved decisions, and non-owner responses pass the gate; unreleased personal text renders owner-only or the response is withheld | api-only | API | - | 2026-10-27 | `server/boundary/release.ts`, `server/boundary/filter.ts` |
| release-owner-only | A release attempt by anyone but the claim's owner is rejected | api-only | API | - | 2026-10-27 | `server/boundary/release.test.ts` |

## How to get to it (user POV)

Planned UI; no build exists yet. Intended path:

1. Open the app at `http://localhost:5173` as Associate.
2. In the brief, click "Share with the firm" on the churn quote.
3. Switch to Partner and see the released quote while every other personal source shows as owner-only.

## Driving it

Preconditions: baseline.

- **release-share**: release the churn quote → `stevensctl api --as Associate release/<claimId> --expect 200 --field .released` → `true` with a `personal.released` ledger event.
- **release-gate**: read Partner state before and after release → `stevensctl api --as Partner state --field .events` → quote absent before, present after; escalations and decisions inherit the same gate day 5.
- **release-owner-only**: release as non-owner → `stevensctl api --as Partner release/<claimId> --expect 403` → rejected with no event.

## Gotchas

- Seeing your own quote in your own brief is not a crossing; a crossing is storage in an enterprise record, inclusion in an escalation or approved decision, or display to anyone but the owner (SPEC.md § The access rule).
- Nothing in enterprise code paths writes to the personal vault (SPEC.md § Validation).
- If any response cannot pass the release gate, it is withheld rather than shown (SPEC.md § Server components).
