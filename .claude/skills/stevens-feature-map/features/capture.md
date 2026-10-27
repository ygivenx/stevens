# Capture

Last verified: uncommitted on 2026-10-27 (source)

Capture stages what Stevens reasons over: Ray-Ban Meta glasses captures (a staged ~90s conference talk, a slide photo, article highlights) into the personal vault, and the fictional Helios deal data (deck photo, CRM record, memos) into the enterprise vault. Fixtures live in the server-only `fixtures/` directory and reach the browser only through the policy-checked media route. Day 1 proved both perception gates with live calls on placeholders (spike log: `spikes/day1/README.md`); day 2 commits the final fixtures. Overall maturity: everything planned.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| capture-talk-audio | Staged ~90s two-voice talk transcribes via Voice batch with speaker labels and timestamps into the personal vault | planned | UI+API | - | not driven | SPEC.md § Fixtures, SPEC.md § Models |
| capture-slide-photo | Glasses slide photo reads to verbatim text via Spark vision at low effort, stored for Fact checks | planned | UI+API | - | not driven | SPEC.md § Fixtures, SPEC.md § Models |
| capture-articles | 3 article highlights land in the personal vault as text claims | planned | UI+API | - | not driven | SPEC.md § Fixtures |
| capture-enterprise | Helios deal + CRM record, deck photo, team memo, partner-only conflicts memo, and one wall item seed the enterprise vault | planned | API | - | not driven | SPEC.md § Fixtures, SPEC.md § Contracts |

## How to get to it (user POV)

Planned UI; no build exists yet. Intended path:

1. Open the app at `http://localhost:5173`.
2. Choose "Capture".
3. See the talk transcript appear with speaker labels and timestamps, the slide text, and the vault lists.

## Driving it

Preconditions: baseline.

- **capture-talk-audio**: seed then read the transcript → `stevensctl seed && stevensctl api --as Associate capture talk --expect 200 --field '.speakers'` → transcript with 2 speakers and timestamp anchors.
- **capture-slide-photo**: seed then read the slide text → `stevensctl api --as Associate capture slide --expect 200 --field '.text'` → verbatim slide text.
- **capture-articles**: seed then list personal sources → `stevensctl api --as Associate vault personal --expect 200 --field '.sources'` → talk, slide, and 3 articles.
- **capture-enterprise**: seed then list enterprise sources → `stevensctl api --as Partner vault enterprise --expect 200 --field '.sources'` → deal, CRM, deck, memos, and the wall item.

## Gotchas

- The Voice endpoint, upload format, and timestamp/speaker response shape are unknown until the day 1 spike, and the client signature is designed after it (SPEC.md § Meta API wiring).
- Glasses-mic audio of a distant speaker may transcribe poorly; the fallback is phone audio near the speaker with glasses video (SPEC.md § Non-goals and risks).
- Captures are pre-recorded files, not streamed; live glasses streaming via the Device Access Toolkit is out of scope (SPEC.md § Fixtures).
- SAM 3.1 screen-cropping is built only if day 1 shows Spark misreads the uncropped photo (SPEC.md § Models).
- `Source.fixture` is a path under the server-only `fixtures/` directory, never `public/` and never a blob URL; media reaches the browser only through `GET /api/media/:sourceId` (SPEC.md § Contracts).
