# Associate app

Last verified: uncommitted on 2026-10-28 (live)

Stevens · yours (:5173 → :8788) is the Associate's product: Today with a self-written meeting card, the bridge as a two-column contrast with replay, Ask and the answer, the Share sheet, Captures, Shared, and the Receipts drawer. No ids, no pipeline vocabulary and no Run control outside Receipts. Owner only. Day 13 landed Today, bridge block with replay, Ask/Answer, Share sheet, Captures, Shared and Receipts; v2.1 tabs removed. Overall maturity: beta.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| associate-today | Today: date, meetings within 24h, empty state | beta | UI+API | - | 2026-10-28 | `web/personal/App.tsx`, browser `associate-today` PASS |
| associate-bridge-block | Deck-says versus you-heard columns, relation, reason, replay of the moment | beta | UI+API | - | 2026-10-28 | `web/personal/App.tsx`, browser `associate-today` PASS |
| associate-ask-answer | Ask box with the privy disclosure; verdict pill, answer, escalation row | beta | UI+API | - | 2026-10-28 | `web/personal/App.tsx`, browser `associate-ask` PASS |
| associate-share-sheet | Confirm exactly what crosses, then share one quote | beta | UI+API | - | 2026-10-28 | `web/personal/App.tsx`, browser `associate-share` PASS |
| associate-captures | Feed of captures by day with transcripts, photos, highlights, notes and status | beta | UI+API | - | 2026-10-28 | `web/personal/App.tsx`, browser `associate-captures` PASS |
| associate-shared | Every quote shared with the firm | beta | UI+API | - | 2026-10-28 | `web/personal/App.tsx`, `associate-share` lists under Shared |
| associate-receipts | Per-draft drawer: calls, what went in, what was held back, rule ids, tokens | beta | UI+API | - | 2026-10-28 | `web/personal/App.tsx`, `server/personal/receipts.ts`, browser `associate-receipts` PASS |

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
