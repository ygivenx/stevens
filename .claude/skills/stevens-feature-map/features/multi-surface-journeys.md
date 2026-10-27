# Multi-surface journeys

Last verified: uncommitted on 2026-10-26 (source)

A journey crosses areas, so it can fail where no single area file looks. Each one names the sub-feature IDs it touches, the invariant that must hold across areas, the last live result, and the commands to drive it. Use this file for questions like "what happens to X after Y" and for release smoke tests. Journeys run in the order below, and each assumes the state the one before it left.

| ID | Journey | Areas | Last live | Result |
|---|---|---|---|---|
| j-brief-path | Capture to unprompted brief with the churn bridge | capture, extraction, server, policy, assembler, bridge, drafts, ledger | not driven | not driven |
| j-answer-escalation | Asked answer yields hold plus a content-free escalation via the privy verdict | drafts, policy, assembler, privy, release, ledger | not driven | not driven |
| j-release-approve | Owner releases one quote, Partner sees memo plus released quote, approves | release, approval, inspector, ledger | not driven | not driven |

## j-brief-path

Touches: `capture-talk-audio`, `capture-slide-photo`, `capture-enterprise`, `extraction-claims`, `extraction-resolver`, `server-state`, `server-events`, `policy-table`, `assembler-manifest`, `bridge-candidates`, `bridge-judge`, `drafts-brief`, `ledger-events`.

Invariants:
1. The brief's churn bridge cites one Personal Fact and one Enterprise Fact.
2. The personal quote carries a visible-to-you-only chip.
3. Every brief sentence carries ≥1 citation; dropped sentences are counted in the inspector.

Drive:

```bash
export STEVENS_VERIFY_INSTANCE=journey
CC=.claude/skills/verify-stevens/stevensctl
$CC doctor && $CC stack up && $CC seed
$CC browser run brief
```

Result (2026-10-26): NOT DRIVEN, nothing is built yet.

## j-answer-escalation

Touches: `drafts-answer`, `policy-table`, `assembler-writers`, `privy-verdict`, `privy-escalation`, `release-gate`, `ledger-events`.

Invariants:
1. The Associate answer prompt contains no privy or wall text.
2. The escalation event carries no content and shows personal sources as owner-only.
3. With the conflicts memo removed, the same question yields `proceed` and no escalation.

Drive:

```bash
export STEVENS_VERIFY_INSTANCE=journey
CC=.claude/skills/verify-stevens/stevensctl
$CC doctor && $CC stack up && $CC seed
$CC api --as Associate answer --expect 200 --field '.escalation'
```

Result (2026-10-26): NOT DRIVEN, nothing is built yet.

## j-release-approve

Touches: `release-share`, `release-gate`, `approval-role-switch`, `approval-decision`, `inspector-manifests`, `inspector-hidden`, `ledger-events`.

Invariants:
1. The conflicts memo and the released quote are visible to the Partner; every other personal source shows as owner-only.
2. The approve call logs `draft.approved` with the draft id and the Partner role.
3. The inspector shows the release, the role switch, and the decision in order.

Drive:

```bash
export STEVENS_VERIFY_INSTANCE=journey
CC=.claude/skills/verify-stevens/stevensctl
$CC doctor && $CC stack up && $CC seed
$CC browser run role-switch
$CC api --as Partner approve answer --expect 200 --field '.status'
```

Result (2026-10-26): NOT DRIVEN, nothing is built yet.
