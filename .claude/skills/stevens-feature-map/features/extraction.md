# Extraction

Last verified: uncommitted on 2026-10-27 (live)

Extraction turns captured text (transcripts, photo text, documents) into structured claims via Spark at low effort with JSON output, and the runtime citation resolver guards everything Stevens displays: every sentence needs a citation, Fact quotes must be verbatim, and failing sentences are dropped and counted. Day 3 built and drove it live: 23 claims extracted, every quote resolving. Overall maturity: claims api-only, resolver stub until drafts call it.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| extraction-claims | Transcript and photo text become structured claims (entity, metric, value, verbatim quote, timestamp, speaker) | api-only | API | - | 2026-10-27 | `server/pipeline/extract.ts`, `/tmp/stevens-verify/day3/evidence/extract-live.json` |
| extraction-resolver | Every displayed sentence resolves ≥1 citation; Fact quotes are verbatim substrings; unsupported sentences are dropped and counted | stub | UI+API | - | not driven | `server/resolver/resolve.ts`, `server/resolver/resolve.test.ts` |

## How to get to it (user POV)

Planned UI; no build exists yet. Intended path:

1. Open the app at `http://localhost:5173`.
2. Choose a source in "Capture".
3. See its extracted claims with quotes linked back to the source text.

## Driving it

Preconditions: baseline.

- **extraction-claims**: ingest then extract → `stevensctl api --as Associate ingest --expect 200` then `api --as Associate extract --expect 200` → 23 claims; every quote resolves against its source text.
- **extraction-resolver**: run the unit suite → `npm test` → 7 resolver tests pass (fake quotes dropped); live sentence checks need day-5 drafts.

## Gotchas

- `Claim.quote` must be a verbatim substring of its source's `text`; `at` and `speaker` come from Voice timestamps and speaker labels (SPEC.md § Contracts).
- A Fact's quote must resolve against the claim and the claim's quote against the source text; the resolver drops failures from the draft but counts them for the inspector ("1 unsupported sentence removed") (SPEC.md § Server components).
- Stevens says "nothing relevant" rather than inventing when no claim resolves (SPEC.md § Server components).
- The cheaper `muse-spark-1.3-contributor` tier won the day-1 A/B and runs extraction (SPEC.md § Models).
- Every structured response is validated against a zod schema, retried once, then fails closed (SPEC.md § Architecture).
- Strict schemas must list every property in `required`; optional fields are nullable (the API rejects partial lists).
- The server loads `.env.local` at boot; the key never leaves the server process.
