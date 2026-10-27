# Inspector

Last verified: uncommitted on 2026-10-26 (source)

The boundary inspector makes the enforced boundary inspectable: for each model call it shows what went in, what was withheld and which policy rule applied, and raw vs assembled token counts. The answer call contains no partner memo; an Associate sees "1 privy check ran — contents hidden"; web search was off for every enterprise call. Day 6 UI. Overall maturity: everything planned.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| inspector-manifests | Each model call shows included sources, withheld sources with rule IDs, the web-search flag, raw vs assembled tokens, and dropped-sentence counts | planned | UI | - | not driven | SPEC.md § Demo, SPEC.md § Contracts |
| inspector-hidden | Privy manifest contents stay hidden from a viewer who may not see them ("1 privy check ran — contents hidden"); the partner memo is absent from the answer call | planned | UI | - | not driven | SPEC.md § Demo, SPEC.md § Contracts |

## How to get to it (user POV)

Planned UI; no build exists yet. Intended path:

1. Open the app at `http://localhost:5173`.
2. Choose "Inspector".
3. Pick a call to see its manifest: included, withheld with rule IDs, web search off, raw vs assembled tokens, dropped sentences counted.

## Driving it

Preconditions: baseline.

- **inspector-manifests**: drive the inspector flow → `stevensctl browser run inspector` → answer call lists included sources, withheld memo and wall item with rule IDs, and web search off.
- **inspector-hidden**: drive as Associate → `stevensctl browser run inspector` → privy row reads "1 privy check ran — contents hidden".

## Gotchas

- The inspector reads manifests and ledger events; it never re-calls the API.
- A `privy` manifest's contents are shown only to a viewer for whom every included source is `visible` (SPEC.md § Contracts).
- Role gating is part of the feature: a control the API would reject for that role is a defect (features/README.md).
