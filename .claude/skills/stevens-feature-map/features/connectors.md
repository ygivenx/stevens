# Connectors

Last verified: uncommitted on 2026-10-28 (source)

Stevens · firm (:8787) reads the firm's systems through connectors into `firm.db` and mirrors each source system's ACL into a classification, so access levels come from the source, not a hand-typed field. Connectors: a fictional firm CRM and public SEC Form D filings. All roles. Day 11 landed the CRM connector, ACL mirroring, firm extraction and the agent meetings/context/media API; Form D and the Partner UI arrive days 12 and 14. Overall maturity: crm beta, formd planned.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| connectors-crm | Firm CRM connector reads Postgres as `dh_stevens`: changed documents since the cursor, full grants and memberships, deletions; `crm.json` stays the fixture source built by `firm-crm-setup` | beta | infra | - | 2026-10-28 | `server/firm/connectors/crm.ts`, `scripts/firm-crm-setup.ts`, `server/firm/postgres.test.ts` (live) |
| connectors-memberships | Deal-team membership mirrored from Postgres roles into `memberships`, filled by the connector and nowhere else; legal-hold bodies never leave Postgres via RLS | beta | infra | - | 2026-10-28 | `server/firm/store.ts`, `server/firm/crm/schema.sql`, `server/firm/postgres.test.ts` (live cross-check) |
| connectors-synced | Each changed sync appends `connector.synced` with rows, grants, and memberships before `firm.db` updates; unreachable Postgres keeps the snapshot and records the error | beta | infra | - | not driven | `server/firm/sync.ts`, `server/firm/crm.test.ts` |
| connectors-acl-map | ACL principals to classification as data; legal hold wins; unknown or empty maps to wall | beta | infra | - | not driven | `server/firm/connectors/acl-map.ts`, `server/firm/connectors/acl-map.test.ts` |
| connectors-firm-extract | Firm-side vision on the deck photo and extraction on firm documents | beta | infra | - | not driven | `server/firm/sync.ts`, `server/firm/agent.test.ts` |
| connectors-formd-import | One-time script downloads SEC Form D quarters and commits a filtered subset | beta | infra | - | 2026-10-27 | `scripts/import-formd.ts`, `fixtures/enterprise/formd/tech-2025q4-2026q1.json` (853 rows) |
| connectors-formd-comps | Code-computed market comps document and claims per quarter, visible to all staff | beta | API | - | 2026-10-27 | `server/firm/connectors/formd.ts`, comps `449→$7.0M` + `404→$8.0M` |

## How to get to it (user POV)

No user path for the connectors themselves. Planned: the Partner app's "Sources" page lists each connector, its last sync and the ACL mapping.

## Driving it

Preconditions: baseline, on the v3 stack (SPEC.md v3 day 9b or later).

- **connectors-crm**: `stevensctl seed` → `stevensctl db query firm "select count(*) from documents where connector='crm'"` → 5 Helios documents plus the other deals.
- **connectors-acl-map**: `stevensctl test` → the ACL-map exhaustive suite passes.
- **connectors-firm-extract**: after seed → `stevensctl api --via firm --as p-morgan GET /api/state` → the deck's net churn 1.8% claim exists.
- **connectors-formd-import**: run `scripts/import-formd.ts` → `fixtures/enterprise/formd/*.json` with ≤ 2,000 rows.
- **connectors-formd-comps**: `stevensctl api --via firm --as p-alex GET /api/state --field '.market[0].issuers'` → equals the count recomputed from the fixture.

## Gotchas

- Form D file names and columns are unverified until the day-12 spike (SPEC.md § Firm data layer).
- SEC requires a declared User-Agent; the import reads it from `SEC_USER_AGENT` (SPEC.md § Firm data layer).
- Real issuer names never appear in fictional deal records or memos (AGENTS.md § Hard rules, Data).
