# Stevens — Build Spec (v3)

Date: 2026-10-26. Inputs: [RESEARCH.md](RESEARCH.md), [meta-ecosystem skill](.agents/skills/meta-ecosystem/SKILL.md).
Track: Meta Global AI Developer Hackathon — Build for Your World. Submission **Wed Nov 4, 9 PM ET**. Solo, $150 Meta API credits.

**v3 changes from v2.1.** Days 1–8 built v2.1 (one server, one ledger, a tabbed console with "Run pipeline"). v3 keeps that boundary core and turns it into a product:
- **Personal database behind an ingestion layer.** Every personal source (glasses captures, Readwise highlights, notes) goes through one adapter → normalize → extract pipeline into `personal.db`. It lives in its own process, **Stevens · yours** (:8788). The firm server never holds personal data.
- **Firm data through connectors.** A firm CRM (`firm.db`) and public **SEC Form D** filings arrive through connectors that **mirror the source system's ACLs** into `visible | privy | excluded`. Classification is no longer a hand-typed field.
- **Stevens is never run by hand.** Captures, syncs and the calendar trigger the work. The user has three verbs: **Ask, Share, Approve**.
- **Two apps instead of a console:** the Associate's **Today** and the Partner's **Inbox**, recorded side by side.
- **Two leaks found on `main` at `0f84ea3` are fixed first** (Day 9a).

---

## Product

Future knowledge workers won't mostly write; they'll read, listen and absorb. **Stevens is a chief of staff that makes what you learn count at work, without leaking either side.** Like the butler in *The Remains of the Day*, he knows the bigger picture, prepares you before the delegation arrives, and is discreet about everything. Tagline: **Stevens drafts; the human decides.**

### The access rule

- **Personal.** Stevens is your agent, so he sees everything in your personal database (captures, highlights, notes). Personal data **never reaches the firm** unless you release it. "Reaching the firm" means any of these:
  - stored in a firm record or the firm's ledger;
  - included in an escalation or an approved decision;
  - shown to anyone but you.

  Each release covers one quote and is logged. You seeing your own quote in your own brief is not a crossing. Nothing from the firm is ever written into your personal database.
- **Enterprise.** For each user, every enterprise source has one access level, derived from the source system's ACL:

  | Level | What Stevens may do | What the user sees |
  | --- | --- | --- |
  | `visible` | Read and quote it | The content |
  | `privy` | Reason over it on the user's behalf | Only its effect: a verdict and where it routes, never content |
  | `excluded` | Nothing | Nothing (legal walls, insider information) |

  An Associate's agent is `privy` to the Partners' memos: it knows of the Helios conflict, so it recommends "hold until Partner review," and the Associate never learns why.

**One mechanism at both edges.** Content crosses an edge only through a narrow, typed channel. Privy knowledge reaches the user only as a fixed `Verdict`. Personal content reaches the firm only as a quote the owner released. A weak model is never asked to keep a secret in free text.

**v3 makes the personal edge physical.** The personal database and the firm database live in different processes. The firm process cannot leak what it never receives.

**Known, accepted leak:** `privy` reveals *that* something matters and which way it pushes. That is fine for partner memos, and it is why legal walls are `excluded`, not `privy`.

### Where data lives

| Data | Store | Process | Who reads it |
| --- | --- | --- | --- |
| Captures, highlights, notes, their segments and claims | `data/personal/personal.db` + `data/personal/ledger.jsonl` | Stevens · yours (:8788) | The owner only |
| Deals, meetings, documents, ACLs, portfolio | `data/firm/firm.db` + `data/firm/ledger.jsonl` | Stevens · firm (:8787) | Per policy |
| Public market data (SEC Form D) | `firm.db` `filings` + a comps document | Stevens · firm | Everyone at the firm (`all-staff`) |
| Released quotes | `firm.db` `documents` (kind `released-quote`, attributed) | Stevens · firm | The deal team |

Production narrative (said in the video, not built): Stevens · yours runs on the user's own device, and Glimmer would process the personal database on-device so it never touches an API.

### Persona and cast (all fictional)

A VC firm, **Darlington Hall Partners**. **Alex Rivera** is an Associate; **Morgan Hale** is a Partner. The deal is **Helios** (mid-market workflow SaaS, raising a $12M Series A). The conflict is portfolio company **Lumen**. The legal wall is **Project Granite**. Simple enough for judges; unrelated to the author's healthcare work. The pitch generalizes: an engineer reading papers before a design review.

Anti-positioning: not RAG over notes. What is new is the bridge (off-the-clock learning → work decision) and an access rule that is enforced, provable and inspectable.

## Interaction model

1. **Stevens is never run.** No control in either app starts a pipeline stage. Work starts from these triggers:

   | Trigger | What runs | Where |
   | --- | --- | --- |
   | A file lands in the glasses inbox | normalize → extract | yours |
   | Readwise sync (on start, then every 15 min) | normalize → extract | yours |
   | A Markdown file changes in the notes folder | normalize → extract | yours |
   | A meeting on one of your deals starts within 24h, or new claims arrive while one does | fetch firm context → bridge → brief | yours (context from firm) |
   | The user asks a question | privy check (firm) → answer (yours) → escalation if `hold` | both |
   | The owner shares a quote | release | yours → firm |
   | An escalation reaches the firm | decision draft for the routed role | firm |
   | A Partner approves or rejects | decision logged | firm |
   | A connector syncs (on start; `stevensctl sync` in dev) | enterprise vision + extraction | firm |

2. **Three verbs:** Ask, Share, Approve (and Reject). Everything else is Stevens' job.
3. **Progress is a sentence, not a stage list:** "Reading the Oct 20 talk…", "Up to date · last capture 2 min ago". Stage names, ids, stage keys and model names appear only in Receipts.
4. **No ids in the product UI.** Sources show a title, an origin and a time; claims show their quote.
5. **Every brief, answer and decision has Receipts:** a drawer listing each model call, what went in, what was held back and under which rule.
6. **Live, not polled:** each app subscribes to its own server's `/api/events`, which carries only `changed`, and refetches its projection.

## Demo (3:00)

Setup: `web/demo.html` shows Alex's laptop (left, Stevens · yours) and Morgan's laptop (right, Stevens · firm) at 1920×1080. The clock is pinned with `STEVENS_NOW=2026-10-28T14:00:00-04:00`; the Helios second meeting is `2026-10-29T10:00:00-04:00`, 20 hours out. Readwise and notes are already synced; the glasses inbox is empty.

1. **0:00 Hook.** One line of the thesis. Two laptops, one firm, two people.
2. **0:15 Capture.** B-roll: Ray-Ban Meta POV of the Oct 20 talk. The clip and the slide photo land in Alex's glasses inbox (the real path is Meta AI app → phone → synced folder; on camera it is `stevensctl drop talk` and `drop slide`, off screen). Alex's Captures feed shows "Reading the Oct 20 talk…", then the transcript appears with Speaker 1 / Speaker 2 and timestamps (**live Voice Transcribe**), and the slide's text appears (**live Spark vision**). Nobody clicked anything.
3. **0:45 Today.** Alex's Helios card updates by itself: "Helios · second meeting · tomorrow 10:00". The bridge is a two-column contrast:
   - **The deck says** net churn 1.8% (Firm CRM · Deal team);
   - **You heard** Speaker 2 at 1:14 (the offset where the line falls in the real clip): "mid-market churn in this category runs 6–8%" (Your notebook · Only you), with ▶ playing that moment of the talk;
   - **Stevens' read:** the definitions differ; ask how they define churn (Inference);
   - **Market context:** the Form D comps line (Public filing · SEC Form D).
4. **1:20 Ask.** Alex types "Should we take the second meeting?" The answer: *"Hold until a Partner reviews. Stevens weighed information you are not privy to."* Below it: "Sent to Morgan Hale · nothing enclosed." **On the right screen**, Morgan's Inbox pings with the escalation; it encloses nothing from Alex's notebook.
5. **1:50 Receipts.** Alex opens Receipts on the answer: each call, what went in, what was held back and by which rule, raw vs assembled tokens, web search off, and "1 privy check ran at the firm — contents hidden". Cut to Morgan's **Sources** page: the connectors (Firm CRM, SEC Form D), the ACL → access mapping, and no personal source anywhere on the firm side.
6. **2:15 Share and approve.** Alex clicks **Share with the firm** on the churn quote; the sheet shows exactly what crosses. On the right, the quote appears in the Helios record as "Shared by Alex Rivera from a personal capture". Morgan sees the conflicts memo (Helios competes with portfolio company Lumen), the shared quote, and Stevens' draft decision "Take the second meeting after conflict review". Morgan approves; it is logged.
7. **2:50 Close.** "Your notebook stays yours. The firm's secrets stay the firm's. Same Stevens for an engineer before a design review." Tagline.

## Models

No rule requires using every Meta model; Stage One is pass/fail on *reasonable* use, and Tooling (25%) rewards each model doing a job it is the right tool for. Perception models turn audio and images into text segments; the reasoning models see only text claims.

| Job | Model | Effort | Why |
| --- | --- | --- | --- |
| Talk audio, voice note, video audio track → transcript | `muse-voice-transcribe-1.0` (batch) | – | **Gate 1.** Speaker labels + timestamps are the citation anchors; $0.18/hr. |
| Slide photo, deck photo, video keyframe → verbatim text | `muse-spark-1.3` vision | `low` | **Gate 2.** Verbatim text is stored so Fact quotes can be checked. |
| Text segments → structured claims (personal and firm) | `muse-spark-1.3-contributor` (identical extraction quality to Spark in the day-1 A/B) | `low` | JSON output; cheap; most calls. |
| Bridge judge: does a personal claim bear on a work claim? | `muse-wonder-1.0` | `high` | The judged reasoning; code prefilters candidates, so few calls. |
| Privy step (firm) | `muse-wonder-1.0` | `high` | Sees the privy sources that code matched by deal and entity; returns only a `Verdict` (no strings). One call per question. |
| Brief + answer writing (yours) | `muse-wonder-1.0` | `high` | Sees the owner's personal claims, the firm's `visible` context and the `Verdict`; never privy text. |
| Decision draft (firm) | `muse-wonder-1.0` | `high` | Sees only what the routed Partner can see, including released quotes. |
| Form D market comps | none (SQL) | – | Aggregates are computed in code; a model adds nothing and could misstate numbers. |

- **Wonder (day-1 A/B decided Oct 27: keep).**
  - Pricing is ~$4 in / $20 out per 1M tokens per secondary sources (vs Spark $1.25 / $4.25).
  - Image/audio input is reported inconsistently, so Wonder gets text only.
  - A/B: the same bridge and privy prompts on Wonder and on Spark `high`. Wonder won narrowly on the bridge (it named the net-vs-gross basis; Spark's reason was vaguer) and tied on privy (both `hold` + Partner, no leak). Keep Wonder for bridge, privy, and writers; the fallback stays Spark 1.3 `high`.
- **Credit discipline:** iterate prompts on Spark; every completed stage is cached by its stage key and never paid for twice; run Wonder only for real passes; log usage on every attempt, failed ones included. Video keyframes are capped at 4 per clip.
- **SAM 3.1 — stretch only, unchanged from v2.1.** Build it only if the real glasses slide photo (shoot still pending) misreads without cropping; default to no SAM.
- **Not used:** Muse Image (nothing to generate). Glimmer is narrated only, as the production path for processing the personal database on-device.

## Architecture

### Two processes

```
 Alex's browser (:5173)                          Morgan's browser (:5174)
        │ /api                                            │ /api
        ▼                                                 ▼
 Stevens · yours (:8788)  ──── agent API ────►  Stevens · firm (:8787)
   personal.db                X-Stevens-Agent      firm.db
   adapters → normalize       context (visible) ◄─  connectors (CRM, Form D)
   → extract → index          Verdict           ◄─  rules + policy
   triggers, bridge,          escalation        ─►  privy, escalations
   brief, answer              one quote         ─►  releases, decision drafts,
   share (outbound gate)                            approvals
        │                                                 │
   data/personal/ledger.jsonl                     data/firm/ledger.jsonl
```

- **Firm never touches personal.** Nothing under `server/firm/` imports `server/personal/`, and the firm process never reads `data/personal/`. An import-boundary test enforces the first; the firm test suite runs with `data/personal/` absent to prove the second.
- **Personal reaches the firm only over HTTP.** Nothing under `server/personal/` imports `server/firm/`; every firm call goes through `server/personal/firm-client.ts`.
- **`server/common/`** holds the Meta client, the ledger store, the clock, the database helper, the rules table, `policy()`, the assembler and the resolver. It imports neither process.
- **Each browser calls only its own process.** The Associate app never calls :8787; the Partner app never calls :8788.
- **Agent identity (simulated sign-in).** The personal process holds `STEVENS_AGENT_TOKEN` in `.env.local` and sends it as `X-Stevens-Agent`. The firm maps the token's SHA-256 to a row in `people` and acts as that person. An unknown or missing token gets 401. The Partner app signs in with a person picker that sends `X-Viewer-Id`; both are labeled "Simulated sign-in".
- **Ports:** firm :8787, yours :8788, Associate UI :5173, Partner UI :5174. `npm run dev` starts all four.

### Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Language | TypeScript throughout; shared types in `shared/` | One set of contracts for both servers and both apps |
| Servers | Two Hono apps on Node 24: `server/firm/index.ts` (:8787) and `server/personal/index.ts` (:8788) | The personal edge becomes a process boundary |
| Databases | SQLite via the built-in `node:sqlite` (FTS5 verified on Node 24.13): `data/personal/personal.db`, `data/firm/firm.db`. Plain SQL in `schema.sql`; no ORM | Real stores and real queries with zero new deps. Run Node with `--disable-warning=ExperimentalWarning` |
| Ledgers | Append-only JSONL per process | The audit trail and the durable pipeline. Each database is a projection rebuildable from its ledger plus fixtures |
| UI | Two Vite + React + Tailwind entry points sharing `web/ui/`: `web/personal/` (:5173 → proxies `/api` to :8788) and `web/firm/` (:5174 → proxies `/api` to :8787). `lucide-react` is the only new UI dependency | Demo polish is 25% of the score |
| Meta calls | OpenAI JS SDK at `https://api.meta.ai/v1` (both servers); `fetch` + `FormData` for Voice | Voice is not on the Responses API |
| Structured output | zod schema per call; validate, retry once, then fail closed | A weak model's shape can't be trusted |
| Media tools | `ffmpeg` (audio conversion, video audio track, keyframes); `sips` on macOS for HEIC | Already a `doctor` dependency |
| Live updates | SSE per server, payload-free `changed` signal | No content on the wire outside the filtered projection |
| Tests | vitest; Playwright via `stevensctl browser` | The boundary is proven, not claimed |

Rejected:
- **Next.js:** server components can serialize restricted props invisibly; an explicit JSON API makes "what reached the browser" one testable body.
- **Python:** contracts in two languages.
- **Postgres:** needs a service; a SQLite file shows the same shape.
- **An ORM:** two small schemas; plain SQL is clearer.
- **A vector store:** FTS5 plus entity/metric matching covers dozens of documents.
- **MCP for connectors:** a day of work with no payoff in the demo. The `Connector` interface is the seam where an MCP-backed or real CRM connector would plug in.
- **Agent and memory frameworks:** this is a fixed pipeline.
- **pi-durable for the core:** experimental (see Stretch).

### Personal ingestion layer (Stevens · yours)

Pipeline: `adapter → RawItem → dedupe → normalize → item + segments → extract → claims → index`. Every step after dedupe is a durable stage.

**Adapters** (`server/personal/adapters/`), each implementing `Adapter`:

| Adapter | Real-world path | Demo path | Trigger | Label |
| --- | --- | --- | --- | --- |
| `inbox` (origin `glasses`) | Ray-Ban Meta → Meta AI app → phone gallery → synced folder (iCloud Drive, AirDrop) | `data/personal/inbox/`; `stevensctl drop <name>` copies a fixture in | `fs.watch`, 1s debounce, a file is taken once its size is unchanged across two checks 500 ms apart | Real glasses captures, pre-recorded, imported not streamed |
| `readwise` | Readwise API v2 export: `GET https://readwise.io/api/v2/export/?updatedAfter=<cursor>` with `Authorization: Token <READWISE_TOKEN>`, following `pageCursor` | A demo Readwise account with fictional highlights when `READWISE_TOKEN` is set; otherwise `fixtures/personal/readwise-export.json` in the same response shape | On start, then every 15 min; the cursor is kept in `adapter_state` | Without a token: `Simulated — Readwise export file` |
| `notes` | A Markdown folder (an Obsidian vault works) | `data/personal/notes/`, seeded from `fixtures/personal/notes/` | `fs.watch` | Fictional notes |

Day 11 records the export shape from the public `api_deets` documentation (`results[]` of books with nested `highlights[]`, `nextPageCursor` paging): no `READWISE_TOKEN` exists in this build, so the adapter's live path is code-reviewed against the doc and the fixture mirrors it field for field. The first run with a real token must confirm the shape and update this paragraph.

**Inbox file types.** Audio `.wav .m4a .mp3`; photo `.jpg .jpeg .png .heic` (HEIC → JPEG with `sips`; on other OSes it is rejected with a reason); video `.mp4 .mov`. Anything else becomes `item.rejected` with a reason and shows in Captures as "Skipped: unsupported file type". Audio or video longer than 30 minutes is rejected.

**Dedupe.** `contentHash` is the SHA-256 of the raw bytes (media) or of the whitespace-normalized text (highlights, notes). A hash already in `items` is a no-op: nothing is logged and nothing is shown.

**Normalizers** (`server/personal/normalize/`):

| Kind | Steps | Models | Segments |
| --- | --- | --- | --- |
| `audio` | ffmpeg → 16 kHz mono WAV; split into ≤ 9-minute chunks (Voice's limit is 10 minutes and 32 MB); Voice Transcribe in `DIARIZATION` mode per chunk; add each chunk's offset to `startMs`/`endMs` | Voice | One per turn: `text`, `speaker` (A → "Speaker 1", B → "Speaker 2", in order of first appearance), `startMs`, `endMs` |
| `photo` | HEIC → JPEG if needed; Spark vision, verbatim transcription prompt (unchanged from v2.1) | Spark `low` | One, `locator: 'photo'` |
| `video` | ffmpeg extracts the audio track (→ `audio` path) and keyframes by scene change (`select='gt(scene,0.4)'`), at most 4; Spark vision on each; frames with fewer than 20 characters of text are dropped | Voice + Spark | Audio turns + one `frame@<ms>` segment per kept frame |
| `highlight` | Pass-through. One item per book or article, one segment per highlight | – | `text`, `locator` (Readwise location or URL) |
| `note` | Split on headings and blank lines | – | `text`, `locator: '#<heading>'` |

**Extraction.** The v2.1 extraction prompt and model, run per item over its segments. Each claim records its `segmentId`. Code, not the model, sets `speaker` and `at` from the segment: `at` is `mm:ss` of `startMs` from the start of the recording. A claim's `quote` must be a verbatim (whitespace-normalized) substring of its segment's text.

**Index.** `segments_fts` (FTS5) is written in the same transaction as each segment. The bridge uses it to widen candidates: for each deal with an upcoming meeting, it searches personal segments for the deal's metrics and entity names.

**`personal.db` schema** (`server/personal/db/schema.sql`):

```sql
create table items (
  id text primary key,
  origin text not null,
  origin_id text not null,
  kind text not null,
  title text not null,
  captured_at text not null,
  media_path text,
  content_hash text not null unique,
  ingested_at text not null,
  status text not null,
  error text
);
create table segments (
  id text primary key,
  item_id text not null references items(id),
  seq integer not null,
  text text not null,
  speaker text,
  start_ms integer,
  end_ms integer,
  locator text
);
create virtual table segments_fts using fts5(text, segment_id unindexed);
create table claims (
  id text primary key,
  item_id text not null references items(id),
  segment_id text not null references segments(id),
  entity text not null,
  metric text,
  value text,
  quote text not null
);
create table shares (
  claim_id text primary key references claims(id),
  deal_id text not null,
  firm_document_id text not null,
  shared_at text not null
);
create table adapter_state (
  adapter text primary key,
  cursor text,
  last_sync_at text,
  last_error text
);
```

`personal.db` is a projection: `item.ingested` events carry the item, its segments and the `contentHash` dedupe key (plus `mediaPath`), `claims.extracted` carries claims, `share.sent` carries shares. If the file is missing at start, the process rebuilds it from `data/personal/ledger.jsonl` with zero API calls.

### Firm data layer (Stevens · firm)

**`firm.db` schema** (`server/firm/db/schema.sql`):

```sql
create table people (
  id text primary key,
  name text not null,
  role text not null,
  agent_token_sha256 text
);
create table deals (
  id text primary key,
  company text not null,
  sector text not null,
  stage text not null,
  ask_usd integer
);
create table deal_team (
  deal_id text not null references deals(id),
  person_id text not null references people(id),
  primary key (deal_id, person_id)
);
create table meetings (
  id text primary key,
  deal_id text not null references deals(id),
  title text not null,
  starts_at text not null
);
create table documents (
  id text primary key,
  connector text not null,
  deal_id text references deals(id),
  kind text not null,
  title text not null,
  body text,
  media_path text,
  created_at text not null,
  shared_by text references people(id)
);
create table document_acl (
  document_id text not null references documents(id),
  principal text not null,
  primary key (document_id, principal)
);
create table portfolio (
  company text primary key,
  sector text not null
);
create table filings (
  accession text primary key,
  issuer text not null,
  state text,
  industry_group text not null,
  filed_at text not null,
  first_sale_date text,
  total_offering_usd integer,
  total_sold_usd integer
);
create table connector_state (
  connector text primary key,
  last_sync_at text,
  documents integer,
  last_error text
);
```

**Connectors** (`server/firm/connectors/`), each implementing `Connector`:
- **`crm`** — "Firm CRM (fictional)". Loads `fixtures/enterprise/crm.json` (people, deals, deal team, meetings, documents with ACLs, portfolio) and the media it references. Media documents (the deck photo) go through Spark vision; text documents go through extraction. Labeled `Simulated — fictional firm CRM`.
- **`sec-form-d`** — "SEC Form D (public)". Loads the committed filings subset into `filings`, then writes one `market-comps` document per quarter whose `body` is generated by code from SQL aggregates, e.g. *"SEC Form D, 2026 Q1: 412 technology issuers reported equity offerings between $2M and $50M; the median total offering was $8.5M."* (numbers illustrative). ACL `all-staff`. Its claims are written by code (one per sentence, quote = the sentence), not by a model.

**Form D import** (`scripts/import-formd.ts`, run once by the developer; its output is committed):
- Downloads the 2025 Q4 and 2026 Q1 quarterly ZIPs listed on [the DERA Form D page](https://www.sec.gov/dera/data/form-d), sending `User-Agent` from `SEC_USER_AGENT` (SEC's fair-access policy requires a declared agent; the developer sets it).
- **First hour of day 12 (done, recorded):** the quarterly ZIPs at `https://www.sec.gov/files/structureddata/data/form-d-data-sets/<yyyy>q<d>_d.zip` unpack to `FORMDSUBMISSION.tsv`, `ISSUERS.tsv` and `OFFERING.tsv` (plus recipients, related persons, signatures), joined on `ACCESSIONNUMBER`. Technology is `INDUSTRYGROUPTYPE` in (`Other Technology`, `Computers`, `Telecommunications`); equity is `ISEQUITYTYPE = true`; amounts are `TOTALOFFERINGAMOUNT` / `TOTALAMOUNTSOLD`. The 2025Q4+2026Q1 technology equity slice between $2M and $50M is 853 rows (2025Q4: 449, median $7.0M; 2026Q1: 404, median $8.0M).
- Keeps technology-industry equity offerings with a total offering between $2M and $50M, and writes `fixtures/enterprise/formd/tech-2025q4-2026q1.json` (≤ 2,000 rows), including each issuer's CIK so the Market panel can link to the real SEC filing.
- Real issuer names appear only in the Market table on a deal page and in the Sources page. They never appear in a fictional deal record or memo, and no fictional company is matched to a real issuer.

**ACL mirroring** (`server/firm/connectors/acl-map.ts`, data, with an exhaustive test). A document's classification is derived from its ACL principals, in this order of precedence:

| ACL principal | Classification | Why |
| --- | --- | --- |
| any `legal-hold:<matter>` | `wall` | A legal hold overrides every other grant |
| `all-staff` or `deal-team:<dealId>` | `team` | Everyone on the team may read it |
| `partners` (and no team principal) | `partner-only` | Only Partners may read it |
| anything else, or an empty ACL | `wall` | Fail closed: an ACL Stevens doesn't understand is a wall |

The rules table then maps classification × role × purpose → access, exactly as in v2.1. Per-person deal-team membership is not enforced by policy in this build (narrated as next).

**Firm-side writes:**
- **Privy** (`server/firm/privy.ts`): `POST /agent/privy {dealId, question}`. Code matches the deal's documents that are `privy` for the asking person; the assembler builds a `privy` call; the output schema is `Verdict`. The manifest stays in the firm ledger. The question text crosses to the firm, and the Ask box says so.
- **Escalation** (`server/firm/escalation.ts`): `POST /agent/escalations {dealId, questionId}` creates an escalation to `verdict.routeTo` with no content, then triggers a **decision draft** for that role, written by Wonder from what the routed Partner can see (deal record, conflicts memo, released quotes, comps).
- **Release inbox** (`server/firm/release.ts`): `POST /agent/releases`. zod-validates the payload (no extra fields; quote ≤ 500 characters; provenance fields enumerated), checks that the sender is on the deal team, writes a `released-quote` document with ACL `deal-team:<dealId>` and `shared_by`, and logs `personal.released`.
- **Approval:** `POST /api/approve/:draftId` and `/api/reject/:draftId`, Partner only per policy, logged.

### Boundary (both processes)

- **Policy as data** (`server/common/boundary/rules.ts`). Same table and rule ids as v2.1, plus the `decision` purpose. `policy()` is a lookup into it; no `if (role === …)` exists outside it. The exhaustive test enumerates every role × classification × owner × purpose.
- **Context assembler** (`server/common/boundary/assemble.ts`) stays the only path into a model call, in both processes. Input: `(purpose, viewer, candidates)` where each candidate carries its `access` and `ruleId`. It emits a `Manifest`.
  - On the firm side, `access` comes from `policy()`.
  - On the personal side, personal sources get the owner rule from `policy()`; firm sources arrive from `/agent/context` already filtered, each with its `ruleId`. The personal assembler rejects any firm candidate whose access is not `visible` (defense in depth).
  - `privy` calls include the privy sources and output `Verdict`; writer calls (`brief`, `answer`, `decision`) include only `visible` sources and the `Verdict`.
- **Outbound share gate** (`server/personal/share.ts`). Only the owner can share; one claim at a time; the payload is exactly `{dealId, claimId, quote, provenance}` where `provenance = {title, origin, capturedAt, speaker?, at?}`. It logs `share.sent` only after the firm answers 201.
- **Inbound release gate** (`server/firm/release.ts`), as above.
- **Fail closed.**
  - Privy fails validation twice → `hold`, `routeTo: 'Partner'`, `failedClosed: true`, labeled `Simulated — privy check failed`.
  - Firm unreachable from yours → the answer is `hold` with `Simulated — firm unreachable, held`; the escalation is logged `escalation.queued` and retried every 30 s until sent. The brief shows the last brief written, marked "Couldn't reach the firm · showing the brief from <time>".
  - Any response that cannot pass a gate is withheld.
- **SSE carries no data.** Both `/api/events` endpoints send only `event: changed` with `data: {}`. Clients refetch `/api/state`. (Fixes the v2.1 stream leak.)
- **Durable pipeline**, per process:
  - **Stage keys:** `stageKey = hash(stage, inputIds, promptVersion, model)`. Ingest stages key on `contentHash`. Before calling a model, look for a completed event with that key and reuse it.
  - **Commit before show:** an event is appended to the ledger, then the database is updated, then `changed` is signalled.
  - **Resume:** a crash or API error resumes from the last completed stage; no completed paid call repeats.
  - **Failed attempts:** each is logged with its usage.
- **Bridge** (yours): candidates are personal × firm-visible claim pairs sharing an entity or metric, widened by FTS over personal segments; Wonder labels each `contradicts | supports | context` with a reason, or rejects it. Bridges and their reasons never leave the personal process.
- **Runtime citation resolver** (`server/common/resolver/`): every displayed sentence needs ≥1 citation; a Fact's quote must be a verbatim (whitespace-normalized) substring of its claim, and the claim's quote a substring of its segment (personal) or document body (firm); failing sentences are dropped and counted.
- **Token budget:** each manifest records raw tokens of included sources and the assembled prompt's tokens; Receipts shows both.
- **Web search** is off for every call whose manifest includes enterprise data.

### Triggers and the clock

- **Clock** (`server/common/clock.ts`) is the only source of "now" for trigger logic. `STEVENS_NOW` (ISO 8601) pins it for the demo and tests; otherwise it is wall time. Projections include `now` so the UI renders relative times from it.
- **Meeting trigger** (`server/personal/triggers.ts`): on start, after every ingest that produced claims, and every 60 s, fetch `/agent/meetings?withinHours=24`. For each meeting, compute the brief stage key from the deal id, the sorted ids of the claims in play, the firm context source ids, the prompt version and the model. If no completed brief has that key, run bridge → brief. One run per deal at a time.
- **Connector sync** (firm): on start, and via `POST /api/dev/sync` in dev.
- **Adapters** (yours): as in the adapter table.

### APIs

**Stevens · yours (browser ↔ :8788).** Serves only its configured owner (`STEVENS_OWNER`, a `people` id).
- `GET /api/state` → `PersonalState`
- `GET /api/events` → SSE `changed`
- `GET /api/items/:itemId` → `{ item, segments, claims }`
- `GET /api/media/:itemId` → the owner's personal media
- `GET /api/firm-media/:sourceId` → proxied from `/agent/media/:sourceId`, as the owner
- `POST /api/ask {dealId, question}` → `202 {questionId}`; the answer arrives through state
- `POST /api/share/:claimId {dealId}` → `201 {documentId}`
- `GET /api/receipts/:draftId` → `Receipt[]`
- Dev only, enabled by `STEVENS_DEV=1`, used by `stevensctl` and never by the UI: `POST /api/dev/sync`, `POST /api/dev/rebrief`.

**Agent API (yours → firm :8787).** Header `X-Stevens-Agent: <token>`; the firm resolves the person.
- `GET /agent/me` → `Person`
- `GET /agent/meetings?withinHours=24` → `Meeting[]` for deals the person is on
- `GET /agent/context?dealId=&purpose=bridge|brief|answer` → `{ sources: SourceRef[], claims: Claim[] }`, `visible` only; logs `context.served`
- `GET /agent/media/:sourceId` → bytes if `visible`, else 404
- `POST /agent/privy {dealId, question}` → `{ questionId, verdict, failedClosed }`
- `POST /agent/escalations {dealId, questionId}` → `{ escalationId, to }`
- `POST /agent/releases {dealId, claimId, quote, provenance}` → `201 {documentId}`

**Stevens · firm (browser ↔ :8787).** Header `X-Viewer-Id` (simulated sign-in).
- `GET /api/people` → the sign-in picker list
- `GET /api/state` → `FirmState`, viewer-filtered
- `GET /api/events` → SSE `changed`
- `GET /api/media/:sourceId` → policy-checked
- `POST /api/approve/:draftId`, `POST /api/reject/:draftId`
- `GET /api/receipts/:draftId` → `Receipt[]`
- Dev only (`STEVENS_DEV=1`): `POST /api/dev/sync`.

### Contracts (`shared/data.ts`)

```ts
type Role = 'Associate' | 'Partner';
type Vault = 'personal' | 'enterprise';
type Classification = 'team' | 'partner-only' | 'wall';
type Access = 'visible' | 'privy' | 'excluded';
type Purpose = 'extract' | 'bridge' | 'brief' | 'privy' | 'answer' | 'decision';
type Verdict = { verdict: 'proceed' | 'hold' | 'decline'; routeTo: Role | null };
type Usage = { inputTokens?: number; outputTokens?: number; audioSeconds?: number; costUsd: number };
type Api = { model: string; responseId: string; usage: Usage; stageKey: string };

type Origin = 'glasses' | 'readwise' | 'notes';
type ItemKind = 'audio' | 'photo' | 'video' | 'highlight' | 'note';
type ConnectorId = 'crm' | 'sec-form-d';
type SourceKind = ItemKind | 'crm-record' | 'deck-photo' | 'memo' | 'conflicts' | 'market-comps' | 'released-quote';

interface Person { id: string; name: string; role: Role }

interface RawItem {
  origin: Origin; originId: string; kind: ItemKind; title: string; capturedAt: string;
  mediaPath?: string; text?: string; locator?: string; contentHash: string;
}

interface Item {
  id: string; origin: Origin; originId: string; kind: ItemKind; title: string; capturedAt: string;
  status: 'normalizing' | 'extracting' | 'ready' | 'failed'; error?: string; hasMedia: boolean;
}

interface Segment {
  id: string; itemId: string; seq: number; text: string;
  speaker?: string; startMs?: number; endMs?: number; locator?: string;
}

interface Adapter { origin: Origin; label: string; poll(): Promise<RawItem[]>; watch?(onItem: (item: RawItem) => void): () => void }

interface ConnectorDocument {
  id: string; dealId?: string; kind: SourceKind; title: string; createdAt: string;
  body?: string; mediaPath?: string; acl: string[];
}

interface Connector { id: ConnectorId; label: string; simulated?: string; documents(): Promise<ConnectorDocument[]> }

interface Source {
  id: string; vault: Vault; kind: SourceKind; title: string; capturedAt: string;
  text?: string; ownerId?: string;
  origin?: Origin; connector?: ConnectorId; dealId?: string;
  acl?: string[]; classification?: Classification;
}

interface SourceRef {
  id: string; vault: Vault; kind: SourceKind; title: string; capturedAt: string;
  origin?: Origin; connector?: ConnectorId; aclLabel?: string; access: Access; ruleId: string;
}

interface AccessRule {
  id: string; vault: Vault; classification?: Classification; owner?: boolean;
  viewer: Role; purposes: Purpose[]; access: Access;
}

interface Claim {
  id: string; sourceId: string; segmentId?: string; entity: string; metric?: string; value?: string;
  quote: string; at?: string; speaker?: string; startMs?: number; endMs?: number;
}

type Citation =
  | { kind: 'Fact'; claimId: string; vault: Vault; quote: string }
  | { kind: 'Inference'; fromClaimIds: string[] };

interface Bridge {
  id: string; personalClaimId: string; workClaimId: string;
  relation: 'contradicts' | 'supports' | 'context'; reason: string;
}

interface Manifest {
  callId: string; purpose: Purpose; viewerId: string; viewerRole: Role; model: string; stageKey: string;
  included: { sourceId: string; access: Access; ruleId: string }[];
  withheld: { sourceId: string; access: Access; ruleId: string }[];
  webSearch: boolean; tokens: { raw: number; assembled: number };
}

interface Draft {
  id: string; kind: 'brief' | 'answer' | 'decision'; dealId: string; question?: string;
  viewerId: string; viewerRole: Role;
  sentences: { text: string; citations: Citation[] }[]; droppedSentences: number;
  bridges?: Bridge[]; verdict?: Verdict; status: 'draft' | 'approved' | 'rejected';
}

interface Meeting { id: string; dealId: string; company: string; title: string; startsAt: string }

interface Receipt {
  callId: string; purpose: Purpose; model: string; at: string; costUsd: number;
  included: { label: string; access: Access; ruleId: string }[];
  withheld: { label: string | null; access: Access; ruleId: string }[];
  privyHidden: boolean; webSearch: boolean; tokens: { raw: number; assembled: number };
}

type PersonalEvent = { at: string } & (
  | { type: 'item.ingested'; item: Item; segments: Segment[]; contentHash: string; mediaPath?: string; api?: Api }
  | { type: 'item.rejected'; origin: Origin; originId: string; reason: string }
  | { type: 'claims.extracted'; itemId: string; claims: Claim[]; api: Api }
  | { type: 'sync.completed'; adapter: Origin; added: number; cursor?: string }
  | { type: 'context.fetched'; dealId: string; purpose: Purpose; sourceIds: string[] }
  | { type: 'bridge.judged'; bridge: Bridge | null; candidate: [string, string]; manifest: Manifest; api: Api }
  | { type: 'draft.created'; draft: Draft; manifest: Manifest; api: Api }
  | { type: 'verdict.received'; questionId: string; dealId: string; verdict: Verdict; failedClosed: boolean }
  | { type: 'escalation.sent' | 'escalation.queued'; questionId: string; dealId: string; to: Role | null }
  | { type: 'share.sent'; claimId: string; dealId: string; documentId: string }
  | { type: 'attempt.failed'; stageKey: string; model: string; error: string; usage?: Usage });

type FirmEvent = { at: string } & (
  | { type: 'connector.synced'; connector: ConnectorId; documents: number }
  | { type: 'source.ingested'; source: Source; api?: Api }
  | { type: 'claims.extracted'; sourceId: string; claims: Claim[]; api?: Api }
  | { type: 'context.served'; personId: string; dealId: string; purpose: Purpose; sourceIds: string[] }
  | { type: 'privy.judged'; questionId: string; dealId: string; personId: string; verdict: Verdict; manifest: Manifest; api?: Api; failedClosed: boolean }
  | { type: 'escalation.drafted'; escalationId: string; questionId: string; dealId: string; from: string; to: Role }
  | { type: 'personal.released'; documentId: string; dealId: string; claimId: string; by: string }
  | { type: 'draft.created'; draft: Draft; manifest: Manifest; api: Api }
  | { type: 'draft.approved' | 'draft.rejected'; draftId: string; by: string }
  | { type: 'attempt.failed'; stageKey: string; model: string; error: string; usage?: Usage });

interface PersonalState {
  owner: Person; now: string;
  status: { line: string; busy: boolean };
  adapters: { origin: Origin; label: string; lastSyncAt: string | null; simulated?: string }[];
  items: Item[];
  meetings: (Meeting & { briefId?: string })[];
  drafts: Draft[]; claims: Claim[]; sources: SourceRef[];
  shares: { claimId: string; dealId: string; sharedAt: string }[];
  escalations: { questionId: string; dealId: string; to: Role | null; status: 'sent' | 'queued' }[];
  firm: { reachable: boolean; checkedAt: string };
  simulated: string[];
}

interface FirmState {
  viewer: Person; now: string;
  deals: { id: string; company: string; sector: string; stage: string; askUsd: number | null; team: Person[]; meetings: Meeting[]; documents: SourceRef[] }[];
  inbox: (
    | { kind: 'escalation'; id: string; dealId: string; from: Person; at: string; decisionDraftId?: string }
    | { kind: 'released-quote'; id: string; dealId: string; from: Person; at: string; quote: string; provenance: { title: string; origin: Origin; capturedAt: string; speaker?: string; at?: string } }
  )[];
  drafts: Draft[]; claims: Claim[];
  market: { quarter: string; issuers: number; medianOfferingUsd: number; sample: { issuer: string; filedAt: string; totalOfferingUsd: number; accession: string }[] }[];
  connectors: { id: ConnectorId; label: string; lastSyncAt: string | null; documents: number; simulated?: string }[];
  aclMap: { principal: string; classification: Classification }[];
  simulated: string[];
}
```

Field rules (documentation only; code carries no comments, per AGENTS.md):
- Media paths live under the server-only `fixtures/` or `data/` directories, never `public/`. Media reaches a browser only through its own server's media route.
- `Segment.text` holds the verbatim transcript turn, photo text, highlight or note paragraph; personal Fact quotes resolve against it. `Source.text` holds a firm document's body; firm Fact quotes resolve against it.
- Personal sources set `ownerId`; firm sources set `connector`, `acl` and the derived `classification`.
- Default rules: personal → owner `visible`, everyone else `excluded`; `team` → `visible` for all; `partner-only` → Partner `visible`, Associate `privy`; `wall` → `excluded` for all.
- `Claim.at`, `speaker`, `startMs` and `endMs` are set by code from the segment, never by the model.
- `Verdict` has no string fields by design; it is the only channel from privy sources to a viewer.
- `escalation.*` events carry no content, by design. `/agent/releases` is accepted only for the claim's owner on that deal's team.
- A `privy` manifest's contents are shown only to a viewer for whom every included source is `visible`; others see "1 privy check ran at the firm — contents hidden."
- Identity is content: a viewer for whom a source is not `visible` sees neither its text, title, nor id. In `Receipt.withheld`, such entries have `label: null` and keep only access and rule id.
- `Bridge.reason` is model text derived from a personal claim. It exists only in the personal process.

### Meta API wiring

- **Key handling:** both servers read `MODEL_API_KEY` from `.env.local` (gitignored). It exists only in the two server processes. Vite proxies `/api` and adds no key. `npm start` serves each built UI from its own server.
- **Spark and Wonder:** OpenAI JS SDK (`server/common/meta/client.ts`) over the Responses API; `developer` message for standing rules. Day 1 confirmed strict JSON-schema output is honored (Responses `text.format`); zod still validates every structured response.
- **Voice Transcribe** is not Responses/Chat. Day 1 verified: `POST /v1/asr/transcribe` takes multipart `request` JSON (`model`, `audioEncoding: WAV`, `mode: DIARIZATION`) plus the `audio` clip, and returns `sessionId`, the full transcript, and `turns[]` with turn-level `startMs`/`endMs` plus speaker labels (A/B) — no word-level timestamps. WAV only, 10 minutes and 32 MB max. `/v1/audio/transcriptions` 404s for API keys and the Responses API rejects the voice model, so the client stays `fetch` + `FormData`.
- **Model IDs** are checked against `GET /v1/models` at startup. Validation accepts any logged model that is in that list, so the 1.3 → 1.2 → 1.1 fallback passes. Day 1 confirmed all nine listed IDs, including every SPEC model.
- **Day-1 gate log (Oct 27, placeholders):** Voice `sessionId voyager/transcribe/085F3C8A6E3D460D9283B18F7DD45078` (22.6 s, 3 turns, speakers A/B); Spark vision `resp_6ae01c0965a69e95b93d4b2d` (slide) and `resp_6ae01c0c7e17305cdae8493b` (deck); bridge A/B `resp_6ae01c25972becf62da7441a` (Spark) vs `resp_6ae01c312e4ecd5575214646` (Wonder); privy A/B `resp_6ae01c3719973ce2e6344136`/`resp_6ae01c4278aeb4a832f7450b` (Spark) vs `resp_6ae01c3fcca070e1edd0441a`/`resp_6ae01c4b6ec8acde32d94368` (Wonder); extraction `resp_6ae01c592553ed2da38646f8` (Spark) vs `resp_6ae01c5c96b781cb26c04f26` (contributor); schema probe `resp_6ae01c164f546c9f92d84ee3`. Total day-1 API spend ≈ $0.10 of the $150 credits.
- **Failure contract:** on a missing key or an API error, use the cached response from the ledger with a visible `Simulated — <reason>` badge, and the demo continues. The boundary never degrades: failures fail closed.

## UI

Two apps share one design system in `web/ui/`. Keep the v2.1 tokens (`paper`, `ivory`, `brass`, `brass-deep`, `oxblood`, `forest`, `smoke`, `hairline`, `font-display`) and the Button, Card, Chip and Tab components. Add: `Drawer`, `Sheet` (confirm), `VerdictPill`, `QuoteBlock` (quote, provenance line, optional ▶), `Avatar` (initials), `StatusLine`, `Skeleton`, `Toast`. Icons come from `lucide-react`.

**Copy rules.**
- Second person for the owner ("You heard", "Your notebook"). Stevens speaks in short, calm sentences.
- The personal side is "your notebook"; the enterprise side is "the firm".
- Never show "pipeline", "stage", "claim", "ledger", "manifest", "vault" or any id outside Receipts.
- Chips name the origin and who can see it: "Your notebook · Only you", "Firm CRM · Deal team", "Firm CRM · Partners", "Public filing · SEC Form D", "Shared by Alex Rivera".

**Removed from v2.1:** the Capture/Brief/Answer/Inspector tabs, the role dropdown, every "Run" button, the "What next" rail, the stage checklist, the judged-bridges list with ids, and `web/src/nextup.tsx`.

### Stevens · yours (Associate app, `web/personal/`, :5173)

Hash routes: `#/today` (default), `#/captures`, `#/shared`. Left navigation at ≥ 1024 px, bottom tabs below.

- **Top bar:** "Stevens" wordmark with "yours" beneath; the status line ("Up to date · last capture 2 min ago", or "Reading the Oct 20 talk…" with a spinner); "Alex Rivera · Associate" with a small "Simulated sign-in" tag.
- **Today:**
  - Date line ("Wednesday, October 28") and "1 meeting needs you" (or "Nothing needs you in the next 24 hours", followed by the latest captures).
  - **Meeting card** (`data-testid="meeting-card"`), one per meeting within 24h: company, meeting title, relative time ("tomorrow 10:00"), the deal team's avatars.
    - **Bridge block** (`bridge`), one per bridge in the brief: two columns. Left: "The deck says", the firm quote, its chip, the source title; clicking the title opens the deck photo. Right: "You heard", the personal quote, "Oct 20 talk · Speaker 2 · 1:14", a ▶ button that plays the item's audio from `startMs − 2 s` to `endMs + 1 s`, and **Share with the firm**. Beneath: the relation in words ("Contradicts", "Supports", "Different definitions" for `context`) and the bridge reason.
    - **Brief sentences** with superscript citation markers; a marker opens a popover with the quote and its chip.
    - **Market context**, when the brief cites a comps claim.
    - **Suggested question** (an Inference sentence), rendered as "Ask them: …".
    - Footer: "Written 9:02 · 2 from your notebook · 3 from the firm · Receipts".
  - **Ask box** (`ask-input`) inside the meeting card: placeholder "Ask about Helios…", one suggestion chip ("Should we take the second meeting?"), and beneath it "Your question goes to the firm's privy check. Nothing from your notebook does."
  - **Answer card** (`answer`): `VerdictPill` (`verdict`): Hold (brass), Proceed (forest), Decline (oxblood); the answer sentences; "Stevens weighed information you are not privy to." when a privy check ran; the escalation row (`escalation`): "Sent to Morgan Hale · nothing enclosed · 9:14", or "Queued — can't reach the firm, will retry". Receipts link.
- **Captures:** a reverse-chronological feed grouped by day, with filter chips (All, Glasses, Readwise, Notes). The header lists each adapter with its last sync time and its honesty label.
  - Audio and video: a player and the transcript (Speaker n · mm:ss · text); clicking a turn seeks; claim quotes are underlined in place.
  - Photo: the image and its extracted text.
  - Highlight: the quote, with the book or article title and author.
  - Note: the rendered Markdown.
  - In progress: a skeleton and "Transcribing…" / "Reading the photo…" / "Finding what matters…". Failed: an oxblood line with the reason. Rejected: "Skipped: unsupported file type".
- **Shared:** every quote shared with the firm: the quote, the deal, the time, and "Shared quotes can't be unshared."
- **Share sheet** (`share-sheet`): "Share with the firm". "Exactly this crosses:" the `QuoteBlock` with provenance; "It becomes part of the Helios record, visible to the deal team."; "The rest of the talk stays in your notebook."; buttons **Share** and Cancel.
- **Receipts drawer** (`receipts`), right side: the draft's calls in order (bridge × n, brief or answer, and "Privy check · at the firm"). Each row shows the purpose, model, time and cost, and expands to: **Went in** (source chips with rule ids), **Held back** (label and rule id, or "1 privy check ran at the firm — contents hidden"), tokens raw → assembled, "Web search: off". Monospace ids are allowed here only.

### Stevens · firm (Partner app, `web/firm/`, :5174)

Hash routes: `#/signin`, `#/inbox` (default), `#/deals/:dealId`, `#/sources`.

- **Sign-in:** a person picker (Morgan Hale · Partner, Alex Rivera · Associate), labeled "Simulated sign-in". `?as=<personId>` signs in directly (used by `demo.html`).
- **Inbox** (`inbox`), newest first, updating live:
  - **Escalation** (`inbox-escalation`): "Alex Rivera asked about Helios. Stevens recommends: hold until you review." "Enclosed from Alex's notebook: nothing." It links to the deal and to the decision draft.
  - **Shared quote** (`released-quote`): "Alex Rivera shared a quote from a personal capture", the `QuoteBlock` with provenance, and the deal.
  - **Decision draft** (`decision`): its sentences with citations (conflicts memo, deal record, shared quote, comps), **Approve** (`approve`) and Reject; after approval, "Approved by Morgan Hale · 9:20".
- **Deal page:** company, sector, stage, ask, deal team, next meeting; documents, each with its ACL chip; the Market panel (comps per quarter and a sample of filings with SEC links); shared quotes. Unshared personal content never appears and is never hinted at.
- **Sources** (`sources`): each connector's label, honesty label, last sync and document count; the ACL → classification table; the rules table (classification × role → access). This page is the enterprise story in the product.

### Demo harness (`web/demo.html`, dev only)

Two iframes side by side at 960×1080 each: left `http://localhost:5173/#/today`, right `http://localhost:5174/?as=p-morgan#/inbox`, each under a thin caption ("Alex's laptop", "Morgan's laptop").

## Fixtures (committed)

- **Personal** (`fixtures/personal/`), all fictional:
  - `inbox/talk.wav` (or `talk.mp4` when the real POV video is used) and `inbox/slide.jpg`: Ray-Ban Meta captures of a staged, fictional ~90 s conference talk with 2 voices (speaker + one audience question), filmed from across a room. **The real glasses shoot is still pending** (v2.1 runs on placeholders); it must land by day 13 so the video uses real captures;
  - `readwise-export.json`: the 3 v2.1 article highlights (churn benchmarks, reading NDR, second meetings) in the Readwise export shape, as fictional articles;
  - `notes/`: 1–2 short fictional Markdown notes (e.g. conference notes from Oct 20).
  - `seed` copies `notes/` and configures Readwise; the inbox starts empty, and `stevensctl drop talk|slide` drops captures live. `seed --with-captures` pre-drops them for tests.
- **Enterprise** (`fixtures/enterprise/`):
  - `crm.json`: Darlington Hall Partners people (`p-alex` Alex Rivera, `p-morgan` Morgan Hale, one more Partner), 3 deals (`helios` with a $12M ask, plus 2 fictional others), deal teams, the Helios second meeting at `2026-10-29T10:00:00-04:00`, documents with ACLs, and the portfolio (including Lumen);
  - documents: the Helios CRM record, the deck photo claiming net churn of 1.8% and the team memo (`deal-team:helios`); the conflicts memo, Helios vs Lumen (`partners`); the Project Granite note (`legal-hold:granite`);
  - `formd/tech-2025q4-2026q1.json`: the public Form D subset from `scripts/import-formd.ts`.
- **Glasses capture path:** capture → Meta AI app → phone camera roll → laptop. Raise the video limit first (Meta AI app → Devices → Settings → Media → Video settings; the default is 60 s). The inbox normalizers convert formats, so no manual `ffmpeg` step is needed.
- **Not built:** live streaming from the glasses (Meta Wearables Device Access Toolkit; needs a native app). Narrated as the production capture path.

## Build order

Days 1–8 (v2.1) are done. Each day below ends with its exit check, a feature-map update, `render-map`, and a status update on `docs/index.html`. Each day is its own branch and PR.

| Day | Date | Work | Exit check |
| --- | --- | --- | --- |
| 9a | Tue Oct 27 | **Leak hotfix on the v2.1 code, merged first.** `/api/events` sends only `changed` with no data; `filterState` drops `bridge.reason` for viewers who don't own the personal claim; route-level leak tests. Tag `v2.1-final` locally | New tests: the Associate's stream contains no privy or excluded id or text; the Partner's state contains no bridge reason. All v2.1 tests green |
| 9b | Tue Oct 27 | **Split.** Move shared code to `server/common/`; create `server/firm/` and `server/personal/` with their Hono entry points; import-boundary test; `node:sqlite` helper, both `schema.sql` files and migrations; agent-token auth; `clock.ts` with `STEVENS_NOW`; `npm run dev` runs 2 servers + 2 Vite apps; `stevensctl stack` covers 4 ports | Import-boundary test passes; the firm suite passes with `data/personal/` absent; `/agent/me` returns 401 without a token and the person with one |
| 10 | Wed Oct 28 | **Personal ingestion.** `Adapter` interface; `inbox` adapter and watcher; `audio`, `photo` and `video` normalizers; dedupe; `item.ingested` with segments; per-item extraction with segment anchors; FTS; rebuild from the ledger | `stevensctl drop talk` → an item reaches `ready` with diarized segments and claims, with no UI action; dropping it again adds nothing; killing the server mid-transcribe and restarting completes with no repeated paid call; deleting `personal.db` and restarting rebuilds it with zero calls |
| 11 | Thu Oct 29 | **Sources and connectors.** `readwise` adapter (live API if `READWISE_TOKEN`, else the export file, labeled) and `notes` adapter; `crm` connector, ACL mirroring, firm-side vision and extraction; agent API `meetings`, `context`, `media` | ACL-map exhaustive test (precedence, unknown → `wall`); `/agent/context` as Alex contains no partner-only or wall text for any purpose; a second Readwise sync adds 0 |
| 12 | Fri Oct 30 | **Flow end to end, no UI.** Form D spike (first hour), import script, `sec-form-d` connector and comps; meeting trigger; bridge and brief in yours; privy at the firm; answer and escalation; share → release; decision draft and approval | Through `stevensctl` only: drop talk → a brief citing the talk, the deck and the comps appears for the Helios meeting → ask → `hold` and an escalation in Morgan's `FirmState` → share → the quote in the Helios record → the decision approved. The comps quote resolves verbatim; replay makes zero calls |
| 13 | Sat Oct 31 | **Associate app.** Today, the meeting card with the bridge block and ▶, Ask and Answer, the Share sheet, Captures, Shared, Receipts; delete the v2.1 tabs | Browser flows `associate-today`, `associate-ask`, `associate-share`, `associate-receipts`, `associate-captures` pass; no product page shows an id, a stage name or a Run control |
| 14 | Sun Nov 1 | **Partner app and harness.** Sign-in, Inbox, deal page, Sources; `demo.html`; live updates in both apps | Browser flow `demo-two-screens` passes in `demo.html` with no manual refresh; a share appears on the right in under 2 s |
| 15 | Mon Nov 2 | **Hardening.** Failure states (firm down, Meta `fail/garbage/slow/empty` via the fake, Readwise down), honesty labels, README, Pages site, feature map, rough cut | Every failure drill shows its label and fails closed; rough cut under 3:00. **Stretch go/no-go** |
| 16 | Tue Nov 3 | Final video; buffer | Submit-ready |
| – | Wed Nov 4 | Submit by midday; 9 PM ET hard deadline | — |

Cut if behind, in this order: the stretch; the `video` normalizer (use the WAV); the `notes` adapter; live Readwise (keep the export file); the Partner Sources page (keep the ACL chips); `demo.html` (two windows); Form D (keep the CRM). Never cut: the 9a leak fixes, the process split, ACL mirroring + rules + their tests, Receipts, the bridge block, automatic triggers (no Run buttons), the two gates.

## Stretch (gated)

- **Follow-up chat in Stevens · yours.** After the first answer, the owner can ask follow-ups in the meeting card.
  - **Library:** `@earendil-works/pi-durable` pinned to exactly `1.4.0`, with `pi-ai`'s built-in Meta provider. It reads `META_API_KEY`, which the personal server sets from `MODEL_API_KEY`.
  - **One conversation per (owner, draft).**
  - **Tools:** `search_notebook(query)` (FTS over personal segments) and `get_quote(claimId)` over personal claims and the firm context already fetched for that deal. Privy content is never a tool result; the firm is never called from a tool.
  - **The first answer stays on the fixed pipeline,** and the citation resolver applies to every chat sentence.
  - **Go only if** day 14's exit check passes by the end of Sun Nov 1 and the user confirms. The day-1 tool-calling check passed Oct 27. Chat stays `deferred` until then.
- **Preference learning (design only).** A future `preference.learned` event would store a Partner's edit as a versioned note that later drafts cite. Not built.

## Validation

- `npx tsc --noEmit` and `npm run build` clean; `npm run dev` brings up :8787, :8788, :5173 and :5174 with no console errors; `npm start` serves both built apps.
- **Gates:** the personal ledger shows a live Voice transcript and a live Spark vision call with model + response ID, each model present in `GET /v1/models`.
- **Process isolation:**
  - no file under `server/firm/` imports from `server/personal/`, and vice versa; `server/common/` imports neither;
  - the firm test suite passes with `data/personal/` absent;
  - after the full demo flow, a search of `data/firm/` (ledger and database) for every personal segment's text finds only the released quote.
- **Streams:** every `/api/events` message from either server has `data: {}`.
- **Exhaustive policy test:** for every role × classification × owner × purpose, the assembled prompt includes a source if and only if the rules table allows it, and each manifest entry names the matching rule ID.
- **ACL mirroring:** every principal pattern maps to its classification; `legal-hold` wins; unknown or empty ACL → `wall`.
- **Agent context leak test:** `/agent/context` and `/agent/media` as Alex contain no partner-only or wall text or media for any purpose; an unknown token gets 401.
- **Privy leak test:** no writer prompt (`brief`, `answer`) in the personal ledger contains text from any privy or excluded firm document.
- **Verdict channel:** privy output parses as exactly `Verdict`; extra fields or strings are rejected. A forced failure yields `hold` + `failedClosed: true`.
- **Browser leak test:** for Alex, `/api/state`, `/api/items/*` and `/api/firm-media/*` contain no privy or excluded firm text or media. For Morgan, the firm's `/api/state` contains no personal text except released quotes, and no bridge reason.
- **Release gates:** only the owner can share; a payload with extra fields, a quote over 500 characters, or a sender not on the deal team is rejected; the firm stores exactly the shared quote.
- **Escalation:** with the conflicts memo present, Alex's question yields `hold` + an escalation to Partner with no content. With the memo removed, it yields `proceed` and no escalation.
- **Ingestion:** dedupe; rejection of unsupported types with a reason; resume mid-normalize with no repeated paid call; Readwise cursor idempotency; every audio claim has a speaker and `startMs` set by code; `personal.db` rebuilds from the ledger with zero calls.
- **Triggers:** with `STEVENS_NOW` pinned, a meeting within 24h gets a brief with no request from any browser; a meeting outside 24h gets none; new claims for that deal produce a new brief.
- **Fail closed:** with the firm down, Alex's question yields `hold`, `escalation.queued` and the label, and the escalation is sent once the firm returns.
- **Citations:** every displayed sentence has ≥1 citation; every Fact resolves verbatim against its segment or document; an injected unsupported sentence is dropped and counted.
- **Bridge:** the Helios brief contains ≥1 bridge with one personal Fact and one firm Fact.
- **Form D:** comps recomputed from the fixture JSON in a test equal the numbers in the comps document; its claims resolve verbatim.
- **UI vocabulary:** no product page (outside the Receipts drawer) renders an id, the words pipeline/stage/ledger/manifest/claim/vault, or a control named Run, Ingest, Extract, Bridge or Brief.
- **Replay:** reloading either app shows the same state with zero new API calls.
- **No work → personal write:** no firm code path writes to the personal process or `data/personal/`.
- **Docs:** `render-map` exits 0; every feature-map grade carries evidence; `docs/` shows the current status; no comments in code.
- **Honesty:** every simulated surface is labeled (fictional firm CRM, staged talk, simulated sign-in, Readwise export file when no token, PAP-style scopes); glasses captures are real but pre-recorded and imported, not streamed; README matches this spec.

## Non-goals and risks

- **Non-goals:**
  - real auth/SSO; PAP integration (narrated);
  - a real CRM (Affinity, DealCloud) or Google Drive connector; the `Connector` interface is the seam (narrated);
  - per-person ACL enforcement beyond role (deal-team membership is checked for releases only);
  - MCP, ORMs, Postgres, vector stores, agent or memory frameworks;
  - live glasses streaming; streaming ASR; on-device models (Glimmer narrated);
  - syncing `personal.db` across devices; unsharing a quote;
  - Modal; a learning ranker; protected time; pi-durable outside the stretch chat.
- **Risks:**
  - **The refactor breaks a working demo.** Mitigation: 9a ships alone first; tag `v2.1-final`; every day ends green; days 10–12 are verified through `stevensctl` before any UI is rebuilt.
  - **Scope:** about eight days of work in six build days. Mitigation: the cut order above; the video is recorded from whatever passes on day 15.
  - **Form D layout is unverified** until the day-12 spike; fallback: drop comps and keep the CRM.
  - **Readwise needs a demo account** with fictional highlights by day 11 (a user action); fallback: the export file, labeled.
  - **Glasses-mic audio** of a distant speaker may transcribe poorly; fallback: a phone near the speaker for audio, glasses for the video.
  - **`node:sqlite` is marked experimental** in Node 24; it is stable enough for two local files, and the warning is suppressed.
  - Wonder price is from secondary sources.
  - `privy` leaks existence and direction by design (accepted; walls are `excluded`).
  - The weak-model risk is contained because the boundary, the verdict channel and citations are enforced in code, and failures fail closed.
  - "RAG" framing: lead with the bridge and the access rule.

## Sources

- Muse Spark API: https://ai.meta.com/blog/introducing-muse-spark-meta-model-api/
- Build with Muse Spark: https://dev.meta.ai/resources/blog/build-with-muse-spark/
- Organizational Second Brain: https://engineering.fb.com/2026/09/02/ml-applications/organizational-second-brain-ai-learns-from-experts/
- Muse Wonder pricing (secondary, unverified against Meta): https://www.yottalabs.ai/post/meta-muse-wonder-pricing-api-cost-muse-code-plans, https://mer.vin/news/muse-wonder-metas-frontier-agent-model-pricing-and-benchmarks/
- SEC Form D data sets (DERA): https://www.sec.gov/dera/data/form-d ; data.gov mirror: https://catalog.data.gov/dataset/form-d-data-sets
- Readwise API: https://readwise.io/api_deets
- Node.js `node:sqlite`: https://nodejs.org/api/sqlite.html
- PAP / Sentinel notes: RESEARCH.md §4
- pi-durable (v1.4.0, experimental): https://github.com/earendil-works/pi/tree/main/packages/durable
- pi-ai Meta provider: https://github.com/earendil-works/pi/blob/main/packages/ai/README.md
- Wearables Device Access Toolkit: https://developers.meta.com/blog/introducing-meta-wearables-device-access-toolkit/
- Glasses capture + video settings: https://www.meta.com/help/ai-glasses/272319252352130/, https://www.neowin.net/news/ray-ban-meta-smart-glasses-new-update-extends-video-recording-to-3-minutes/
