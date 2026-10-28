# Ingestion

Last verified: uncommitted on 2026-10-28 (live)

Stevens · yours (:8788) takes every personal source through one pipeline (adapter → normalize → extract → index) into `personal.db`, the owner's personal database, which the firm process never reads. Adapters: the glasses inbox, Readwise and an Obsidian vault. Owner only (the Associate in the demo). Day 10 landed the inbox adapter, the three media normalizers, dedupe, anchored extraction, FTS and rebuild; Readwise and notes landed day 11; R1 replaced notes with the vault adapter, added revisions, lazy extraction and the daily budget. Overall maturity: beta.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| ingestion-inbox | Watched glasses inbox folder; a stable new file becomes a RawItem | beta | infra | - | not driven | `server/personal/adapters/inbox.ts`, `server/personal/ingest.test.ts` |
| ingestion-readwise | Readwise API v2 export with a cursor, or the labeled export file without a token | beta | infra | - | not driven | `server/personal/adapters/readwise.ts`, `server/personal/adapters.test.ts` |
| ingestion-vault | Watched Obsidian vault: recursive scan, dot-folder and exclude-prefix skips, stevens-skip frontmatter, 2-minute quiet period, tags/aliases/wikilinks parsed, never writes | beta | infra | - | 2026-10-28 | `server/personal/adapters/vault.ts`, `server/personal/adapters.test.ts`, live r1-drive 26/26 |
| ingestion-revisions | Changed note appends item.revised and retires old claims; deleted note appends item.removed; ledger keeps history, retrieval drops both | beta | infra | - | 2026-10-28 | `server/personal/ingest.ts`, `server/personal/ingest.test.ts`, live r1-drive 26/26 |
| ingestion-lazy | Everything indexed on ingest; extraction runs within STEVENS_BACKFILL_DAYS or on demand for top-10 retrieval hits | beta | infra | - | 2026-10-28 | `server/personal/extract.ts`, `server/personal/extract.test.ts`, live r1-drive 26/26 |
| ingestion-budget | Extract input tokens capped per day at STEVENS_DAILY_TOKENS; at the cap extraction pauses and the status line says so; writers uncapped | beta | infra | - | 2026-10-28 | `server/personal/extract.ts`, `server/personal/state.ts`, `server/personal/extract.test.ts`, live r1-drive 26/26 |
| ingestion-audio | Audio to diarized, time-anchored segments via Voice, chunked at 9 minutes | beta | infra | - | 2026-10-27 | `server/personal/normalize/audio.ts`, live `voyager/transcribe/F394A6866C8C4A239374C` |
| ingestion-photo | Photo (HEIC converted) to verbatim text via Spark vision | beta | infra | - | 2026-10-27 | `server/personal/normalize/photo.ts`, live `resp_6ae0437657ece316c039451e` |
| ingestion-video | Video to audio turns plus up to 4 keyframe text segments | beta | infra | - | not driven | `server/personal/normalize/video.ts`, no live video fixture yet |
| ingestion-dedupe | Content hash makes a re-dropped file a no-op | beta | infra | - | not driven | `server/personal/ingest.ts`, `server/personal/ingest.test.ts`, live r1-drive 26/26 |
| ingestion-extract | Per-item claims anchored to segments; speaker and time set by code | beta | infra | - | 2026-10-27 | `server/personal/extract.ts`, live `resp_6ae04381ce2b436` + `resp_6ae04390d411f65` |
| ingestion-fts | FTS5 index over segments, used to widen bridge candidates | beta | infra | - | not driven | `server/personal/store.ts`, `server/personal/ingest.test.ts` |
| ingestion-rebuild | personal.db rebuilds from the personal ledger with zero API calls | beta | infra | - | not driven | `server/personal/store.ts`, `server/personal/ingest.test.ts` |

## How to get to it (user POV)

No user action starts ingestion. Planned path:

1. Open Stevens · yours at `http://localhost:5173`.
2. Choose "Captures".
3. A dropped file appears with "Transcribing…", then its transcript.

## Driving it

Preconditions: baseline, on the v3 stack (SPEC.md v3 day 9b or later).

- **ingestion-inbox**: drop the talk → `stevensctl drop talk --wait` → an item with status `ready`.
- **ingestion-readwise**: sync → `stevensctl sync yours` twice → the second `sync.completed` has `added: 0`.
- **ingestion-vault**: add a settled note to the instance `vault/` → personal `/api/state` → items gains one `vault` row; `.obsidian/`, excluded prefixes and `stevens: skip` notes never appear.
- **ingestion-revisions**: edit that note and backdate it past the quiet period → `item.revised` in the ledger → one active row, old claim ids gone from `/api/state`.
- **ingestion-lazy**: add a note dated before the backfill window → item `ready` with segments and zero claims; ask a question matching it → claims appear.
- **ingestion-budget**: set `STEVENS_DAILY_TOKENS=0`, add a note → item `ready` with zero claims and status line "Paused: daily reading budget reached".
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
- Day-10 live pass (2026-10-27, /tmp/stevens-live): talk.wav → 3 diarized segments + 3 claims, slide.jpg → 1 photo segment + 2 claims, 4 model calls ≈ $0.008. Evidence is the ledger shape, not a kept file.
