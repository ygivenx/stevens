# Chat

Last verified: uncommitted on 2026-10-26 (source)

Follow-up chat is the gated stretch: after the first answer, the viewer can ask follow-ups through a durable agent whose tool calls resolve through the same policy. It starts only if the day-1 tool-calling check passed and day 5's exit check passed by the end of Sat Oct 31, and only with the user's confirmation. Until the go/no-go it stays deferred. Overall maturity: deferred by decision.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| chat-followups | After the first answer the viewer asks follow-ups in one conversation per viewer and draft, never forked across roles | deferred | UI+API | - | not driven | SPEC.md § Stretch |
| chat-tools | The agent's search_claims and get_quote tools resolve through the same policy, so privy content is never a tool result | deferred | API | - | not driven | SPEC.md § Stretch |

## How to get to it (user POV)

Planned UI; no build exists yet, and the stretch may never start. Intended path:

1. Open the app at `http://localhost:5173`.
2. Read an answer, then choose "Ask a follow-up".
3. Ask within the same conversation; every sentence stays cited.

## Driving it

Preconditions: baseline, plus the stretch go decision.

- **chat-followups**: answer then follow up → `stevensctl api --as Associate ask --until '.draft'` then `stevensctl api --as Associate chat <draftId> --expect 200 --field '.sentences'` → cited follow-up in the same conversation.
- **chat-tools**: ask for a privy fact → `stevensctl api --as Associate chat <draftId> --field '.sentences'` → the tools return only what the viewer may see, never privy text.

## Gotchas

- The library is `@earendil-works/pi-durable` pinned to exactly `1.4.0`, with `pi-ai`'s built-in Meta provider reading `META_API_KEY` from `MODEL_API_KEY` (SPEC.md § Stretch).
- The first answer stays on the fixed pipeline, and the citation resolver applies to every chat sentence (SPEC.md § Stretch).
- The stretch is first to cut if the build runs behind (SPEC.md § Build order).
