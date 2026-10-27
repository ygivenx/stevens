# Process split

Last verified: 0f84ea375996 on 2026-10-26 (source)

v3 splits Stevens into two processes so the personal edge is physical: Stevens · yours (:8788) holds the personal database; Stevens · firm (:8787) holds the firm's. They talk only through the agent API, which carries visible firm context in, a Verdict in, a content-free escalation out, and one released quote out. All roles. No direct UI; Receipts show its effects. Overall maturity: planned (SPEC.md v3 day 9b, agent endpoints days 11–12).

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| split-import-boundary | No firm file imports personal code or reads personal data, and vice versa; common imports neither | planned | infra | - | not driven | SPEC.md § Two processes |
| split-agent-auth | X-Stevens-Agent token resolves to a person; unknown token gets 401 | planned | API | - | not driven | SPEC.md § Two processes |
| split-agent-context | Visible-only firm context per deal and purpose, each source with its rule id | planned | API | - | not driven | SPEC.md § APIs (Agent API) |
| split-agent-privy | Privy check at the firm returns only a Verdict | planned | API | - | not driven | SPEC.md § APIs (Agent API) |
| split-agent-escalations | Content-free escalation to the routed role | planned | API | - | not driven | SPEC.md § APIs (Agent API) |
| split-agent-releases | Inbound release gate: zod-validated single quote from the owner on the deal team | planned | API | - | not driven | SPEC.md § Firm data layer (Firm-side writes) |
| split-sse-changed | Both event streams carry only a payload-free changed signal | planned | API | - | not driven | SPEC.md § Boundary |
| split-clock | STEVENS_NOW pins the clock for triggers, the demo and tests | planned | infra | - | not driven | SPEC.md § Triggers and the clock |

## How to get to it (user POV)

No user path; the Associate app's Receipts and the Partner app's Sources page show what crossed.

## Driving it

Preconditions: baseline, on the v3 stack (SPEC.md v3 day 9b or later).

- **split-import-boundary**: `stevensctl test` → the import-boundary suite passes; the firm suite passes with `data/personal/` absent.
- **split-agent-auth**: `stevensctl api --via agent --as nobody GET /agent/me --expect 401`, then `--as p-alex` → 200 with Alex.
- **split-agent-context**: `stevensctl api --via agent --as p-alex GET '/agent/context?dealId=helios&purpose=answer' --save context.json` → no partner-only or wall text.
- **split-agent-privy**: ask as Alex → the personal ledger has `verdict.received` with `hold` and no string fields beyond the enum.
- **split-agent-escalations**: ask as Alex → `stevensctl api --via firm --as p-morgan GET /api/state --until '.inbox | length > 0'` → an escalation with no content.
- **split-agent-releases**: share as Alex → Morgan's Helios documents include a `released-quote`; a payload with an extra field gets 400.
- **split-sse-changed**: `stevensctl leak scan` → every event message from both servers has `data: {}`.
- **split-clock**: `stevensctl stack up --now 2026-10-28T14:00:00-04:00` → both projections report that `now`.

## Gotchas

- On `main` at 0f84ea375996 the v2.1 stream sends raw ledger events to any viewer; day 9a fixes it before the split (server.md).
- Per-person ACLs are not enforced by policy in this build; deal-team membership is checked for releases only (SPEC.md § Non-goals).
