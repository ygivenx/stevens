# Triggers

Last verified: 0f84ea375996 on 2026-10-26 (source)

In v3 nobody runs Stevens: an ingested capture, a Readwise or notes sync, a meeting within 24 hours, a question, a share or an escalation starts the right work. Owner and Partner. Visible as the status line and live updates in both apps. Overall maturity: planned (SPEC.md v3 day 12, failure path day 15).

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| triggers-meeting-brief | A meeting on the owner's deal within 24h gets a brief with no browser request | planned | infra | - | not driven | SPEC.md § Triggers and the clock |
| triggers-rebrief | New claims for a deal with an upcoming meeting produce a new brief | planned | infra | - | not driven | SPEC.md § Triggers and the clock |
| triggers-decision-draft | An escalation at the firm produces a decision draft for the routed role | planned | infra | - | not driven | SPEC.md § Firm data layer (Firm-side writes) |
| triggers-firm-down | With the firm unreachable, a question yields hold and a queued escalation that is retried | planned | infra | - | not driven | SPEC.md § Boundary (Fail closed) |

## How to get to it (user POV)

No user action. Planned: open Stevens · yours; the Helios card appears on Today by itself.

## Driving it

Preconditions: baseline, on the v3 stack (SPEC.md v3 day 9b or later).

- **triggers-meeting-brief**: `stevensctl seed --with-captures` with the demo `--now` → `stevensctl api --via yours GET /api/state --until '.meetings[0].briefId'`.
- **triggers-rebrief**: drop a new capture mentioning churn → `briefId` changes.
- **triggers-decision-draft**: after an escalation → Morgan's state has a `decision` draft.
- **triggers-firm-down**: `stevensctl firm down`, ask as Alex → `escalation.queued`; `stevensctl firm up` → `escalation.sent`.

## Gotchas

- A meeting outside 24h must get no brief; the stage key includes the claims in play, so unchanged inputs never re-pay (SPEC.md § Triggers and the clock).
