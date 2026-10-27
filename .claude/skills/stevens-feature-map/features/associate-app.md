# Associate app

Last verified: 0f84ea375996 on 2026-10-26 (source)

Stevens · yours (:5173 → :8788) is the Associate's product: Today with a self-written meeting card, the bridge as a two-column contrast with replay, Ask and the answer, the Share sheet, Captures, Shared, and the Receipts drawer. No ids, no pipeline vocabulary and no Run control outside Receipts. Owner only. Overall maturity: planned (SPEC.md v3 day 13).

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| associate-today | Today: date, meetings within 24h, empty state | planned | UI | - | not driven | SPEC.md § UI (Stevens · yours) |
| associate-bridge-block | Deck-says versus you-heard columns, relation, reason, replay of the moment | planned | UI | - | not driven | SPEC.md § UI (Stevens · yours) |
| associate-ask-answer | Ask box with the privy disclosure; verdict pill, answer, escalation row | planned | UI | - | not driven | SPEC.md § UI (Stevens · yours) |
| associate-share-sheet | Confirm exactly what crosses, then share one quote | planned | UI | - | not driven | SPEC.md § UI (Stevens · yours) |
| associate-captures | Feed of captures by day with transcripts, photos, highlights, notes and status | planned | UI | - | not driven | SPEC.md § UI (Stevens · yours) |
| associate-shared | Every quote shared with the firm | planned | UI | - | not driven | SPEC.md § UI (Stevens · yours) |
| associate-receipts | Per-draft drawer: calls, what went in, what was held back, rule ids, tokens | planned | UI | - | not driven | SPEC.md § UI (Stevens · yours) |

## How to get to it (user POV)

1. Open Stevens · yours at `http://localhost:5173`.
2. "Today" shows "Helios · second meeting · tomorrow 10:00".
3. Type in "Ask about Helios…"; open "Receipts"; click "Share with the firm".

## Driving it

Preconditions: baseline, on the v3 stack (SPEC.md v3 day 9b or later).

- **associate-today**: `stevensctl browser run associate-today` → the meeting card is visible.
- **associate-bridge-block**: same flow → the bridge shows both quotes and ▶ plays.
- **associate-ask-answer**: `stevensctl browser run associate-ask` → "Hold" and "Sent to Morgan Hale · nothing enclosed".
- **associate-share-sheet**: `stevensctl browser run associate-share` → the sheet shows the quote; after Share it is listed under "Shared".
- **associate-captures**: `stevensctl browser run associate-captures` → the talk shows Speaker 1 and Speaker 2 turns.
- **associate-shared**: after a share → "Shared" lists the quote and the deal.
- **associate-receipts**: `stevensctl browser run associate-receipts` → "1 privy check ran at the firm — contents hidden".

## Gotchas

- The v2.1 tabs, role dropdown, What-next rail and judged-bridges list are removed on day 13 (SPEC.md § UI).
- Every browser flow also asserts the UI-vocabulary rule (SPEC.md § Validation).
