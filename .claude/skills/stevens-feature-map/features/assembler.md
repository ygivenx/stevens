# Assembler

Last verified: uncommitted on 2026-10-27 (source)

The context assembler in `server/boundary/assemble.ts` is the only path into a model call. Given a purpose and viewer it builds the prompt from what policy allows and emits a `Manifest` of included and withheld sources with rule IDs, the web-search flag, and raw vs assembled token counts. Privy calls include privy sources with a `Verdict` output schema; writer calls never include privy text. Day 4 build. Overall maturity: everything api-only.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| assembler-manifest | Every model call is built by the assembler and emits a manifest with included and withheld sources, rule IDs, and the web-search flag | api-only | API | - | not driven | `server/boundary/assemble.ts`, `server/boundary/assemble.test.ts` |
| assembler-writers | Writer calls (brief, answer) include visible sources, the viewer's own personal claims, and the verdict — never privy text | api-only | API | - | not driven | `server/boundary/assemble.ts`, `server/boundary/assemble.test.ts` |
| assembler-budget | Each manifest records raw source tokens and assembled prompt tokens for the inspector | api-only | API | - | not driven | `server/boundary/assemble.ts`, `server/boundary/assemble.test.ts` |
| assembler-websearch | Web search is off for every call whose manifest includes enterprise data | api-only | API | - | not driven | `server/boundary/assemble.ts`, `server/boundary/assemble.test.ts` |

## How to get to it (user POV)

No user path: the assembler is infrastructure. Its visible surface is the inspector and the manifests behind each draft.

## Driving it

Preconditions: baseline.

- **assembler-manifest**: run the suite → `stevensctl test` → assembler tests prove manifests with rule IDs on every entry.
- **assembler-writers**: run the suite → `stevensctl test` → leak tests string-search Associate writer prompts (live writer prompts arrive day 5).
- **assembler-budget**: run the suite → `stevensctl test` → token estimates asserted on every manifest.
- **assembler-websearch**: run the suite → `stevensctl test` → `webSearch` false on every manifest.

## Gotchas

- A weak model is never asked to keep a secret; the boundary holds even if the model is weak (SPEC.md § The access rule).
- Privy calls include the privy sources and their output schema is `Verdict` (SPEC.md § Server components).
- No Associate writer prompt (`brief`, `answer`) contains text from any privy or excluded source; the leak test string-searches the logged request bodies (SPEC.md § Validation).
- Token counts are chars/4 estimates, consistent across raw and assembled.
