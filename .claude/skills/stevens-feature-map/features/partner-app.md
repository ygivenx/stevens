# Partner app

Last verified: uncommitted on 2026-10-28 (live)

Stevens · firm (:5174 → :8787) is the Partner's product: a simulated sign-in, a live Inbox of escalations, shared quotes and decision drafts with Approve, a deal page with ACL chips and market comps, and the Sources page showing connectors and the ACL mapping. Partner (and the Associate's firm view). Day 14 landed sign-in, Inbox, deal pages, Sources and the demo harness with live updates. Overall maturity: beta.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| partner-signin | Person picker labeled simulated sign-in, or ?as= for the demo harness | beta | UI+API | - | 2026-10-28 | `web/firm/App.tsx`, `GET /api/people` |
| partner-inbox | Live escalations and shared quotes, newest first, no refresh | beta | UI+API | - | 2026-10-28 | `web/firm/App.tsx`, browser `partner-inbox` PASS |
| partner-decision | Decision draft with citations; Partner-only Approve and Reject, logged | beta | UI+API | - | 2026-10-28 | `server/firm/index.ts`, browser `partner-approve` PASS |
| partner-deal-page | Deal record, documents with ACL chips, market comps with SEC links, shared quotes | beta | UI+API | - | 2026-10-28 | `web/firm/App.tsx`, live Helios page |
| partner-sources | Connectors, last sync, ACL mapping and rules table | beta | UI+API | - | 2026-10-28 | `web/firm/App.tsx`, browser `partner-sources` PASS |
| partner-demo-harness | web/demo.html shows both apps side by side | beta | UI | - | 2026-10-28 | `web/demo.html`, browser `demo-two-screens` PASS |

## How to get to it (user POV)

1. Open Stevens · firm at `http://localhost:5174`.
2. Choose "Morgan Hale · Partner".
3. "Inbox" shows escalations and shared quotes; open the decision and click "Approve".

## Driving it

Preconditions: baseline, on the v3 stack (SPEC.md v3 day 9b or later).

- **partner-signin**: `stevensctl browser run partner-inbox` → signed in as Morgan Hale.
- **partner-inbox**: same flow after Alex asks → the escalation appears without a refresh.
- **partner-decision**: `stevensctl browser run partner-approve` → "Approved by Morgan Hale".
- **partner-deal-page**: open Helios → documents show "Deal team" and "Partners" chips; no legal-hold document appears.
- **partner-sources**: `stevensctl browser run partner-sources` → both connectors and the ACL table.
- **partner-demo-harness**: `stevensctl browser run demo-two-screens` → a share on the left appears on the right in under 2 s.

## Gotchas

- Unshared personal content must never appear or be hinted at in the Partner app (SPEC.md § UI).
