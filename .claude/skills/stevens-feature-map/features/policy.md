# Policy

Last verified: uncommitted on 2026-10-27 (source)

Policy is data: a table of rules in `server/boundary/rules.ts`, each with an `id`, mapping (vault, classification, owner?, viewer role, purpose) to `visible | privy | excluded`. `policy()` is a lookup into that table; no `if (role === …)` access logic exists anywhere else. The inspector shows the rule ID behind every included or withheld source. Day 4 built it with the exhaustive test. Overall maturity: everything api-only.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| policy-table | Rules table maps vault, classification, owner, viewer role, and purpose to an access level with a rule ID | api-only | API | - | not driven | `server/boundary/rules.ts`, `server/boundary/policy.test.ts` |
| policy-defaults | Personal is visible to its owner and excluded for others; team is visible for all; partner-only is Partner-visible and Associate-privy; wall is excluded for all | api-only | API | - | not driven | `server/boundary/policy.ts`, `server/boundary/policy.test.ts` |
| policy-exhaustive | An exhaustive test checks every role × source × purpose: the prompt includes a source if and only if the table allows it, and each manifest entry names the rule | api-only | API | - | not driven | `server/boundary/policy.test.ts` |

## How to get to it (user POV)

No user path: policy is infrastructure. Its visible surface is the inspector and the rule IDs on each manifest entry.

## Driving it

Preconditions: baseline.

- **policy-table**: run the suite → `stevensctl test` → exhaustive test names the matching rule ID for every role × source × purpose.
- **policy-defaults**: run the suite → `stevensctl test` → defaults asserted against the SPEC table, plus a Partner-owned personal source.
- **policy-exhaustive**: run the suite → `stevensctl test` → every manifest entry names its rule ID.

## Gotchas

- Every rule change updates the exhaustive policy test (AGENTS.md § Hard rules).
- The inspector shows the rule ID behind every included or withheld source (SPEC.md § Server components).
- Privy text never reaches a viewer: text from a `privy` or `excluded` source never goes into a prompt whose output that viewer sees (SPEC.md § The access rule).
