# Connectors

Last verified: uncommitted on 2026-10-27 (source)

Stevens · firm (:8787) reads the firm's systems through connectors into `firm.db` and mirrors each source system's ACL into a classification, so access levels come from the source, not a hand-typed field. Connectors: a fictional firm CRM and public SEC Form D filings. All roles. Day 11 landed the CRM connector, ACL mirroring, firm extraction and the agent meetings/context/media API; Form D and the Partner UI arrive days 12 and 14. Overall maturity: crm beta, formd planned.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| connectors-crm | Firm CRM connector: people, deals, deal teams, meetings, documents with ACLs, portfolio | beta | infra | - | not driven | `server/firm/connectors/crm.ts`, `fixtures/enterprise/crm.json` |
| connectors-acl-map | ACL principals to classification as data; legal hold wins; unknown or empty maps to wall | beta | infra | - | not driven | `server/firm/connectors/acl-map.ts`, `server/firm/connectors/acl-map.test.ts` |
| connectors-firm-extract | Firm-side vision on the deck photo and extraction on firm documents | beta | infra | - | not driven | `server/firm/sync.ts`, `server/firm/agent.test.ts` |
| connectors-formd-import | One-time script downloads SEC Form D quarters and commits a filtered subset | planned | infra | - | not driven | SPEC.md § Firm data layer (Form D import) |
| connectors-formd-comps | Code-computed market comps document and claims per quarter, visible to all staff | planned | API | - | not driven | SPEC.md § Firm data layer (Connectors) |

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
