# Boundary

Last verified: uncommitted on 2026-10-26 (source)

The boundary is the enforced mechanism behind both product boundaries: `src/boundary/assemble.ts` is the only path into a model call, applying `policy()` per source for a `(purpose, viewerRole)` pair, building the prompt from allowed claims only, and emitting a `Manifest` of included and withheld sources. Rules live in code, never in prompts. Day 4 build. Overall maturity: everything planned.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| boundary-assemble | The assembler is the only prompt builder; every call emits a Manifest of included and withheld sources | planned | API | - | not driven | SPEC.md:46, SPEC.md:56 |
| boundary-policy | Personal is visible to work calls as quotes only; team enterprise is visible; partner-only is signal-only for Associates; wall is excluded for everyone | planned | API | - | not driven | SPEC.md:46 |
| boundary-websearch | Web search is off for every call whose manifest includes enterprise data | planned | API | - | not driven | SPEC.md:46 |
| boundary-no-writeback | Nothing in enterprise code paths writes to the personal vault | planned | API | - | not driven | SPEC.md:148 |

## How to get to it (user POV)

No user path: the boundary is infrastructure. Its visible surface is the inspector and the manifests behind each draft.

## Driving it

Preconditions: baseline.

- **boundary-assemble**: assemble an Associate answer call → `stevensctl api --as Associate answer --expect 200 --field '.manifest.included'` → prompt built from allowed claims with a Manifest.
- **boundary-policy**: assemble the same call for both roles → `stevensctl api --as Associate answer --field '.manifest.withheld'` then `--as Partner` → partner memo withheld for the Associate, included for the Partner; wall withheld for both.
- **boundary-websearch**: check an enterprise call manifest → `stevensctl api --as Associate brief --field '.manifest.webSearch'` → `false`.
- **boundary-no-writeback**: run the full pipeline then diff the personal vault → `stevensctl browser run brief && stevensctl api --as Associate vault personal --field '.sources'` → personal sources unchanged.

## Gotchas

- Restricted text never reaches a viewer's prompt: partner-only text for an Associate and `wall` text for everyone stay out of any prompt whose output that viewer sees (SPEC.md:6).
- A weak model is never asked to keep a secret; the boundary holds even if the model is weak (SPEC.md:46).
- `Source.minRole` applies to enterprise sources only; `wall: true` excludes a source for everyone (SPEC.md:56).
