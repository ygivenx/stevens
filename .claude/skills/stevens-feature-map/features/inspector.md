# Inspector

Last verified: uncommitted on 2026-10-26 (source)

The boundary inspector makes the enforced boundary inspectable: for each model call it shows what went in, what was withheld and why, whether web search was on, and how many unsupported sentences the resolver removed. What an Associate may not see stays hidden even here. Day 6 UI. Overall maturity: everything planned.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| inspector-manifests | Each model call shows included sources, withheld sources with reasons, the web-search flag, and dropped-sentence counts | planned | UI | - | not driven | SPEC.md:18, SPEC.md:56 |
| inspector-hidden | Restricted manifest contents stay hidden from an Associate ("1 restricted check ran — contents hidden"); the partner memo is absent from the answer call | planned | UI | - | not driven | SPEC.md:18, SPEC.md:56 |

## How to get to it (user POV)

Planned UI; no build exists yet. Intended path:

1. Open the app at `http://localhost:5173`.
2. Choose "Inspector".
3. Pick a call to see its manifest: included, withheld with reasons, web search off, dropped sentences counted.

## Driving it

Preconditions: baseline.

- **inspector-manifests**: drive the inspector flow → `stevensctl browser run inspector` → answer call lists included sources, withheld memo and wall item with reasons, and web search off.
- **inspector-hidden**: drive as Associate → `stevensctl browser run inspector` → restricted check row reads "1 restricted check ran — contents hidden".

## Gotchas

- The inspector reads manifests and ledger events; it never re-calls the API (SPEC.md:46).
- "1 of N personal items crossed" is read off the work-call manifests, matching the drafts chip (SPEC.md:18).
- Role gating is part of the feature: a control the API would reject for that role is a defect (features/README.md).
