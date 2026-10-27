# Assembler

Last verified: uncommitted on 2026-10-26 (source)

The context assembler in `server/boundary/assemble.ts` is the only path into a model call. Given a purpose and viewer it builds the prompt from what policy allows and emits a `Manifest` of included and withheld sources with rule IDs, the web-search flag, and raw vs assembled token counts. Privy calls include privy sources with a `Verdict` output schema; writer calls never include privy text. Day 4 build. Overall maturity: everything planned.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| assembler-manifest | Every model call is built by the assembler and emits a manifest with included and withheld sources, rule IDs, and the web-search flag | planned | API | - | not driven | SPEC.md § Server components, SPEC.md § Contracts |
| assembler-writers | Writer calls (brief, answer) include visible sources, the viewer's own personal claims, and the verdict — never privy text | planned | API | - | not driven | SPEC.md § Server components |
| assembler-budget | Each manifest records raw source tokens and assembled prompt tokens for the inspector | planned | API | - | not driven | SPEC.md § Server components |
| assembler-websearch | Web search is off for every call whose manifest includes enterprise data | planned | API | - | not driven | SPEC.md § Server components |

## How to get to it (user POV)

No user path: the assembler is infrastructure. Its visible surface is the inspector and the manifests behind each draft.

## Driving it

Preconditions: baseline.

- **assembler-manifest**: assemble an Associate answer call → `stevensctl api --as Associate answer --expect 200 --field '.manifest.included'` → prompt built from allowed claims with a manifest.
- **assembler-writers**: string-search the logged writer prompts → `stevensctl api --as Associate brief --field '.manifest'` → no privy or excluded source text in any Associate writer prompt.
- **assembler-budget**: read an answer manifest → `stevensctl api --as Associate answer --field '.manifest.tokens'` → raw and assembled token counts.
- **assembler-websearch**: check an enterprise call manifest → `stevensctl api --as Associate brief --field '.manifest.webSearch'` → `false`.

## Gotchas

- A weak model is never asked to keep a secret; the boundary holds even if the model is weak (SPEC.md § The access rule).
- Privy calls include the privy sources and their output schema is `Verdict` (SPEC.md § Server components).
- No Associate writer prompt (`brief`, `answer`) contains text from any privy or excluded source; the leak test string-searches the logged request bodies (SPEC.md § Validation).
