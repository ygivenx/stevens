# Policy

Last verified: uncommitted on 2026-10-26 (source)

Policy is data: a table of rules in `server/boundary/rules.ts`, each with an `id`, mapping (vault, classification, owner?, viewer role, purpose) to `visible | privy | excluded`. `policy()` is a lookup into that table; no `if (role === …)` access logic exists anywhere else. The inspector shows the rule ID behind every included or withheld source. Day 4 build. Overall maturity: everything planned.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| policy-table | Rules table maps vault, classification, owner, viewer role, and purpose to an access level with a rule ID | planned | API | - | not driven | SPEC.md § Server components, SPEC.md § Contracts |
| policy-defaults | Personal is visible to its owner and excluded for others; team is visible for all; partner-only is Partner-visible and Associate-privy; wall is excluded for all | planned | API | - | not driven | SPEC.md § Contracts |
| policy-exhaustive | An exhaustive test checks every role × source × purpose: the prompt includes a source if and only if the table allows it, and each manifest entry names the rule | planned | API | - | not driven | SPEC.md § Validation |

## How to get to it (user POV)

No user path: policy is infrastructure. Its visible surface is the inspector and the rule IDs on each manifest entry.

## Driving it

Preconditions: baseline.

- **policy-table**: assemble the same call for both roles → `stevensctl api --as Associate answer --field '.manifest.withheld'` then `--as Partner` → partner memo withheld for the Associate, included for the Partner; wall withheld for both.
- **policy-defaults**: assemble a personal quote for owner and non-owner → `stevensctl api --as Associate brief --field '.manifest.included'` then `--as Partner` → owner includes the quote, non-owner withholds it without a release.
- **policy-exhaustive**: run the suite → `stevensctl test` → the exhaustive policy test passes with every manifest entry naming its rule ID.

## Gotchas

- Every rule change updates the exhaustive policy test (AGENTS.md § Hard rules).
- The inspector shows the rule ID behind every included or withheld source (SPEC.md § Server components).
- Privy text never reaches a viewer: text from a `privy` or `excluded` source never goes into a prompt whose output that viewer sees (SPEC.md § The access rule).
