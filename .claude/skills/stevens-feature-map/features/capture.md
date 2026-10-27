# Capture

Last verified: uncommitted on 2026-10-27 (live)

Capture stages what Stevens reasons over: Ray-Ban Meta glasses captures (a staged ~90s conference talk, a slide photo, article highlights) into the personal vault, and the fictional Helios deal data (deck photo, CRM record, memos) into the enterprise vault. Fixtures live in the server-only `fixtures/` directory and reach the browser only through the policy-checked media route. Day 1 proved both perception gates with live calls on placeholders (spike log: `spikes/day1/README.md`). Day 2 committed placeholder fixtures plus text sources to `fixtures/` and drove ingest live: all 10 sources land in the ledger through `POST /api/ingest`. The real glasses shoot stays pending. Overall maturity: everything beta (happy path works in Chromium; real glasses files still pending).

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| capture-talk-audio | Staged ~90s two-voice talk transcribes via Voice batch with speaker labels and timestamps into the personal vault | beta | UI+API | - | 2026-10-27 | `web/src/capture.tsx`, `/tmp/stevens-verify/day6/evidence/run-capture.png` |
| capture-slide-photo | Glasses slide photo reads to verbatim text via Spark vision at low effort, stored for Fact checks | beta | UI+API | - | 2026-10-27 | `web/src/capture.tsx`, `/tmp/stevens-verify/day6/evidence/run-capture.png` |
| capture-articles | 3 article highlights land in the personal vault as text claims | beta | UI+API | - | 2026-10-27 | `web/src/capture.tsx`, `/tmp/stevens-verify/day6/evidence/run-capture.png` |
| capture-enterprise | Helios deal + CRM record, deck photo, team memo, partner-only conflicts memo, and one wall item seed the enterprise vault | beta | UI+API | - | 2026-10-27 | `web/src/capture.tsx`, `/tmp/stevens-verify/day6/evidence/run-capture.png` |

## How to get to it (user POV)


1. Open the app at `http://localhost:5173`.
2. Choose "Capture".
3. See the talk transcript with speaker labels and timestamps, the slide photo with read text, and both vault lists.

## Driving it

Preconditions: baseline.

- **capture-talk-audio**: ingest then read state → `stevensctl api --as Associate ingest --expect 200` then `api --as Associate state --field '.events'` → `talk-oct20` carries the transcript and `data/derived/talk-oct20.json` its turns.
- **capture-slide-photo**: same run → state shows `slide-oct20` with verbatim slide text stored for Fact checks.
- **capture-articles**: same run → state shows the 3 article highlights as ingested text sources.
- **capture-enterprise**: same run → state shows the deal, CRM, deck, memos, and the wall item (filtering lands day 4).

## Gotchas

- The Voice endpoint, upload format, and timestamp/speaker response shape are unknown until the day 1 spike, and the client signature is designed after it (SPEC.md § Meta API wiring).
- Glasses-mic audio of a distant speaker may transcribe poorly; the fallback is phone audio near the speaker with glasses video (SPEC.md § Non-goals and risks).
- Captures are pre-recorded files, not streamed; live glasses streaming via the Device Access Toolkit is out of scope (SPEC.md § Fixtures).
- Committed media are TTS/PIL placeholders, not glasses captures; the shoot stays with the user, and the real-mic test rides with it.
- Ingest drives ran on fake `normal`; the live path is the same code and its endpoints were proven by the day-1 spikes.
- SAM 3.1 screen-cropping is built only if day 1 shows Spark misreads the uncropped photo (SPEC.md § Models).
- `Source.fixture` is a path under the server-only `fixtures/` directory, never `public/` and never a blob URL; media reaches the browser only through `GET /api/media/:sourceId` (SPEC.md § Contracts).
