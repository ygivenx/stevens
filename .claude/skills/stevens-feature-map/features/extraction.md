# Extraction

Last verified: uncommitted on 2026-10-26 (source)

Extraction turns captured text (transcripts, photo text, documents) into structured claims via Spark at low effort with JSON output, and the runtime citation resolver guards everything Stevens displays: every sentence needs a citation, Fact quotes must be verbatim, and failing sentences are dropped and counted. Day 3 build. Overall maturity: everything planned.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| extraction-claims | Transcript and photo text become structured claims (entity, metric, value, verbatim quote, timestamp, speaker) | planned | API | - | not driven | SPEC.md § Models, SPEC.md § Contracts |
| extraction-resolver | Every displayed sentence resolves ≥1 citation; Fact quotes are verbatim substrings; unsupported sentences are dropped and counted | planned | UI+API | - | not driven | SPEC.md § Server components |

## How to get to it (user POV)

Planned UI; no build exists yet. Intended path:

1. Open the app at `http://localhost:5173`.
2. Choose a source in "Capture".
3. See its extracted claims with quotes linked back to the source text.

## Driving it

Preconditions: baseline.

- **extraction-claims**: seed then extract → `stevensctl seed && stevensctl api --as Associate extract talk --expect 200 --field '.claims[0].quote'` → claims with verbatim quotes and speaker anchors.
- **extraction-resolver**: inject a fake quote then render → `stevensctl api --as Associate resolver probe --expect 200 --field '.droppedSentences'` → unsupported sentence dropped and counted as 1.

## Gotchas

- `Claim.quote` must be a verbatim substring of its source's `text`; `at` and `speaker` come from Voice timestamps and speaker labels (SPEC.md § Contracts).
- A Fact's quote must resolve against the claim and the claim's quote against the source text; the resolver drops failures from the draft but counts them for the inspector ("1 unsupported sentence removed") (SPEC.md § Server components).
- Stevens says "nothing relevant" rather than inventing when no claim resolves (SPEC.md § Server components).
- The cheaper `muse-spark-1.3-contributor` tier is tried for extraction during the day-1 A/B and kept if quality holds (SPEC.md § Models).
- Every structured response is validated against a zod schema, retried once, then fails closed (SPEC.md § Architecture).
