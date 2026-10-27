# Ingestion

Last verified: 0f84ea375996 on 2026-10-26 (source)

Stevens · yours (:8788) takes every personal source through one pipeline (adapter → normalize → extract → index) into `personal.db`, the owner's personal database, which the firm process never reads. Adapters: the glasses inbox, Readwise and a notes folder. Owner only (the Associate in the demo). Reached through the Captures page of the Associate app. Overall maturity: planned (SPEC.md v3 days 10–11).

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| ingestion-inbox | Watched glasses inbox folder; a stable new file becomes a RawItem | planned | infra | - | not driven | SPEC.md § Personal ingestion layer (Adapters) |
| ingestion-readwise | Readwise API v2 export with a cursor, or the labeled export file without a token | planned | infra | - | not driven | SPEC.md § Personal ingestion layer (Adapters) |
| ingestion-notes | Watched Markdown notes folder | planned | infra | - | not driven | SPEC.md § Personal ingestion layer (Adapters) |
| ingestion-audio | Audio to diarized, time-anchored segments via Voice, chunked at 9 minutes | planned | infra | - | not driven | SPEC.md § Personal ingestion layer (Normalizers) |
| ingestion-photo | Photo (HEIC converted) to verbatim text via Spark vision | planned | infra | - | not driven | SPEC.md § Personal ingestion layer (Normalizers) |
| ingestion-video | Video to audio turns plus up to 4 keyframe text segments | planned | infra | - | not driven | SPEC.md § Personal ingestion layer (Normalizers) |
| ingestion-dedupe | Content hash makes a re-dropped file a no-op | planned | infra | - | not driven | SPEC.md § Personal ingestion layer (Dedupe) |
| ingestion-extract | Per-item claims anchored to segments; speaker and time set by code | planned | infra | - | not driven | SPEC.md § Personal ingestion layer (Extraction) |
| ingestion-fts | FTS5 index over segments, used to widen bridge candidates | planned | infra | - | not driven | SPEC.md § Personal ingestion layer (Index) |
| ingestion-rebuild | personal.db rebuilds from the personal ledger with zero API calls | planned | infra | - | not driven | SPEC.md § Personal ingestion layer (personal.db schema) |

## How to get to it (user POV)

No user action starts ingestion. Planned path:

1. Open Stevens · yours at `http://localhost:5173`.
2. Choose "Captures".
3. A dropped file appears with "Transcribing…", then its transcript.

## Driving it

Preconditions: baseline, on the v3 stack (SPEC.md v3 day 9b or later).

- **ingestion-inbox**: drop the talk → `stevensctl drop talk --wait` → an item with status `ready`.
- **ingestion-readwise**: sync → `stevensctl sync yours` twice → the second `sync.completed` has `added: 0`.
- **ingestion-notes**: add a note to `data/personal/notes/` → `stevensctl db query personal "select count(*) from items where origin='notes'"` → count rises by 1.
- **ingestion-audio**: after the drop → `stevensctl api --via yours GET /api/items/<id> --field '.segments[0].speaker'` → "Speaker 1" with `startMs`.
- **ingestion-photo**: `stevensctl drop slide --wait` → one segment with `locator: photo`.
- **ingestion-video**: drop an `.mp4` → audio turns plus ≤ 4 `frame@` segments.
- **ingestion-dedupe**: `stevensctl drop talk --wait` again → item count unchanged; `stevensctl meta calls` unchanged.
- **ingestion-extract**: read the item → every claim has `segmentId`; audio claims have `speaker` and `startMs`.
- **ingestion-fts**: `stevensctl db query personal "select count(*) from segments_fts where segments_fts match 'churn'"` → ≥ 1.
- **ingestion-rebuild**: stop yours, delete `personal.db`, start → same item and claim counts; `meta calls` unchanged.

## Gotchas

- Voice accepts WAV only, ≤ 10 minutes and 32 MB (SPEC.md § Meta API wiring); the audio normalizer converts and chunks.
- The Readwise export response shape is verified on day 11 before the adapter is written (SPEC.md § Personal ingestion layer).
- The real glasses shoot is still pending; v2.1 runs on placeholders (capture.md).
