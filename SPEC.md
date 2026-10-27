# Stevens — Build Spec (v2.1)

Date: 2026-10-26. v2.1 changes from v2: a server owns the boundary, the access rule is `visible | privy | excluded` with a release gate for personal data, policy is data with an exhaustive test, the pipeline resumes after a crash, and follow-up chat is a gated stretch. Inputs: [RESEARCH.md](RESEARCH.md), [meta-ecosystem skill](.agents/skills/meta-ecosystem/SKILL.md).
Track: Meta Global AI Developer Hackathon — Build for Your World. Submission **Wed Nov 4, 9 PM ET**. Solo, 8 build days, $150 Meta API credits.

## Product

Future knowledge workers won't mostly write; they'll read, listen and absorb. **Stevens is a chief of staff that makes what you learn count at work, without leaking either side.** Like the butler in *The Remains of the Day*, he knows the bigger picture, prepares you before the delegation arrives, and is discreet about everything. Tagline: **Stevens drafts; the human decides.**

### The access rule

- **Personal.** Stevens is your agent, so he sees everything in your personal vault (talks, readings, conference captures). Personal data **never reaches the firm** unless you release it. "Reaching the firm" means any of these:
  - stored in an enterprise record;
  - included in an escalation or an approved decision;
  - shown to anyone but you.

  Each release covers one quote and is logged. You seeing your own quote in your own brief is not a crossing. Nothing from the firm is ever written into your personal vault.
- **Enterprise.** For each user, every enterprise source has one access level:

  | Level | What Stevens may do | What the user sees |
  | --- | --- | --- |
  | `visible` | Read and quote it | The content |
  | `privy` | Reason over it on the user's behalf | Only its effect: a verdict and where it routes, never content |
  | `excluded` | Nothing | Nothing (legal walls, insider information) |

  An Associate's agent is `privy` to the Partners' memos: it knows of the Helios conflict, so it recommends "hold until Partner review," and the Associate never learns why.

**One mechanism at both edges.** Content crosses an edge only through a narrow, typed channel. Privy knowledge reaches the user only as a fixed `Verdict`. Personal content reaches the firm only as a quote the owner released. A weak model is never asked to keep a secret in free text.

**Known, accepted leak:** `privy` reveals *that* something matters and which way it pushes. That is fine for partner memos, and it is why legal walls are `excluded`, not `privy`.

Persona: a VC Associate at a fictional firm (simple enough for judges; unrelated to the author's healthcare work). The pitch generalizes: an engineer reading papers before a design review.

Anti-positioning: not RAG over notes. What is new is the bridge (off-the-clock learning → work decision) and an access rule that is enforced, provable and inspectable.

## Demo (3:00)

1. **0:00 Hook.** One line of the thesis above.
2. **0:20 Capture.** Last week's conference, shown as real **Ray-Ban Meta POV footage**:
   - talk audio → **live Voice Transcribe** (speaker labels + timestamps appear);
   - glasses photo of a slide → **live Spark vision**.

   Both land in the *personal* vault.
3. **0:50 Unprompted brief** for tomorrow's second Helios meeting. The bridge:
   - the deck claims net churn of 1.8% (Enterprise · Fact);
   - at the Oct 20 talk, Speaker 2 at 14:32: "mid-market churn in this category runs 6–8%" (Personal · Fact);
   - so: ask how they define churn (Inference).

   The personal quote carries a chip: *visible to you only*.
4. **1:25 The Associate asks** "Should we take the second meeting?"
   - The answer comes from visible data plus the privy verdict: *"Recommendation: hold until a Partner reviews. Stevens weighed information you are not privy to."*
   - An escalation is drafted to a Partner. It has no content, and it shows personal sources as owner-only.
5. **1:50 Boundary inspector.** For each model call it shows:
   - what went in, what was withheld, and which policy rule applied;
   - raw vs assembled token counts.

   The answer call contains no partner memo; the Associate sees "1 privy check ran — contents hidden"; web search was off for every enterprise call.
6. **2:15 Release and approval.**
   - The Associate clicks **Share with the firm** on the churn quote, which logs `personal.released`.
   - Switch to Partner. The Partner sees the conflict memo (Helios competes with portfolio company Lumen) and the released quote; every other personal source shows as owner-only.
   - The Partner approves "take the meeting after conflict review," and the decision is logged.
7. **2:50 Close.** "Same Stevens for the engineer before a design review." Tagline.

## Models

No rule requires using every Meta model; Stage One is pass/fail on *reasonable* use, and Tooling (25%) rewards each model doing a job it is the right tool for. Perception models turn audio and images into text claims; the reasoning models see only text claims.

| Job | Model | Effort | Why |
| --- | --- | --- | --- |
| Talk audio, voice note → transcript | `muse-voice-transcribe-1.0` (batch) | – | **Gate 1.** Speaker labels + timestamps are the citation anchors; $0.18/hr. |
| Slide photo, deck photo → verbatim text | `muse-spark-1.3` vision | `low` | **Gate 2.** Verbatim text is stored so Fact quotes can be checked. |
| Text → structured claims | `muse-spark-1.3-contributor` (identical extraction quality to Spark in the day-1 A/B) | `low` | JSON output; cheap; most calls. |
| Bridge judge: does a personal claim bear on a work claim? | `muse-wonder-1.0` | `high` | The judged reasoning; code prefilters candidates, so few calls. |
| Privy step | `muse-wonder-1.0` | `high` | Sees the privy sources that code matched by entity; returns only a `Verdict` (no strings). One call per question. |
| Brief + answer writing | `muse-wonder-1.0` | `high` | Sees visible sources, the viewer's own personal claims and the `Verdict`; never privy text. |

- **Wonder (day-1 A/B decided Oct 27: keep).**
  - Pricing is ~$4 in / $20 out per 1M tokens per secondary sources (vs Spark $1.25 / $4.25).
  - Image/audio input is reported inconsistently, so Wonder gets text only.
  - A/B: the same bridge and privy prompts on Wonder and on Spark `high`. Wonder won narrowly on the bridge (it named the net-vs-gross basis; Spark's reason was vaguer) and tied on privy (both `hold` + Partner, no leak). Keep Wonder for bridge, privy, and writers; the fallback stays Spark 1.3 `high`.
- **Credit discipline:** iterate prompts on Spark; every completed stage is cached by its stage key and never paid for twice; run Wonder only for real passes; log usage on every attempt, failed ones included.
- **SAM 3.1 — stretch only.** Legitimate job: crop the projector screen out of a wide audience photo before Spark reads it. Build it only if day 1 shows Spark misreads the uncropped photo; otherwise it is decoration, and judges punish fake depth. Day-1 placeholders were clean renders and read fine, which proves nothing about wide-angle shots; re-test with a real glasses photo on day 2 and default to no SAM.
- **Not used:** Muse Image (nothing to generate). Glimmer is narrated only, as the production path of processing the personal vault on-device so it never touches the API.

## Architecture

### Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Language | TypeScript throughout; shared types in `shared/` | One set of contracts for server and UI |
| Server | Hono on Node (:8787) | Owns the vaults, policy, assembler, pipeline, ledger and every Meta call. The browser receives only viewer-filtered JSON. |
| UI | Vite + React + Tailwind + shadcn/ui (:5173) | Demo polish is 25% of the score |
| Meta calls | OpenAI JS SDK at `https://api.meta.ai/v1` (server only); `fetch` + `FormData` for Voice | Voice is not on the Responses API |
| Structured output | zod schema per call; validate, retry once, then fail closed | A weak model's shape can't be trusted |
| Ledger | Append-only JSONL at `data/ledger.jsonl` (gitignored) | Event sourcing in its simplest form; inspectable and replayable |
| Live progress | Server-sent events (transcribing → extracting → bridging → drafting) | The pipeline visibly working is good footage |
| Roles | The role switcher sends `X-Viewer-Role`; the server enforces it; labeled "simulated sign-in" | Auth is out of scope |
| Tests | vitest (policy, assembler, release gate, resolver, resume); Playwright via `stevensctl browser` | The boundary is proven, not claimed |

Rejected:
- **Next.js:** server components can serialize restricted props invisibly; an explicit JSON API makes "what reached the browser" one testable body.
- **Python:** contracts in two languages.
- **A database or vector store:** a dozen documents; candidates come from entity/metric matching.
- **Agent and memory frameworks:** this is a fixed pipeline.
- **pi-durable for the core:** experimental, with breaking changes landing Oct 26 (see Stretch).

### Server components

Pipeline: `ingest → extract → bridge → brief → privy → answer → release → approve`.

- **Policy as data** (`server/boundary/rules.ts`). A table of rules, each with an `id`, mapping (vault, classification, owner?, viewer role, purpose) → `Access`. `policy()` is a lookup into that table; no `if (role === …)` exists outside it. The inspector shows the rule ID behind every included or withheld source. An exhaustive test enumerates every role × source × purpose and checks the assembled prompt against the table.
- **Context assembler** (`server/boundary/assemble.ts`) is the only path into a model call. Given `(purpose, viewer)` it builds the prompt from what policy allows and emits a `Manifest`:
  - `privy` calls include the privy sources, and their output schema is `Verdict`;
  - writer calls (`brief`, `answer`) include visible sources, the viewer's own personal claims and the `Verdict`, never privy text.
- **Release gate** (`server/boundary/release.ts`). Everything bound for the firm or for another person goes through it: escalations, approved decisions, and any response to a viewer who is not the owner. Personal citations render as "Personal source (owner only)" unless a `personal.released` event exists for that claim. Only the owner can release.
- **Fail closed.** If the privy step fails validation twice, the verdict is `hold` with `routeTo: 'Partner'`, labeled `Simulated — privy check failed`. If any response cannot pass the release gate, it is withheld.
- **Durable pipeline** (pattern borrowed from pi-durable, not the package):
  - **Stage keys:** every stage call has a `stageKey = hash(stage, sourceIds, promptVersion, model)`. Before calling a model, the server looks for a completed event with that key and reuses it.
  - **Commit before show:** an event is appended to the ledger before the UI hears of it.
  - **Resume:** a crash or API error resumes from the last completed stage, so no completed paid call repeats.
  - **Failed attempts:** each is logged with its usage.
- **Bridge:** code proposes candidate pairs (same entity or metric across vaults); Wonder labels each `contradicts | supports | context` with a reason, or rejects it.
- **Runtime citation resolver:**
  - Every displayed sentence needs ≥1 citation.
  - A Fact's quote must be a verbatim (whitespace-normalized) substring of its claim, and the claim's quote a substring of its source text.
  - Failing sentences are dropped and counted ("1 unsupported sentence removed"). Stevens says "nothing relevant" rather than inventing.
- **Token budget:** each manifest records the raw tokens of its included sources and the assembled prompt's tokens; the inspector shows both.
- **Web search** is off for every call whose manifest includes enterprise data.

### Stevens API (browser ↔ server)

- `GET /api/state`: viewer-filtered projection of the ledger.
- `GET /api/events`: SSE.
- `POST /api/ingest`, `POST /api/ask`, `POST /api/release/:claimId`, `POST /api/approve/:draftId`, `POST /api/reject/:draftId`.
- `GET /api/media/:sourceId`: policy-checked; fixtures are never served statically.

Every request carries `X-Viewer-Role`. The browser never calls Meta.

### Contracts (`shared/data.ts`)

```ts
type Role = 'Associate' | 'Partner';
type Vault = 'personal' | 'enterprise';
type Classification = 'team' | 'partner-only' | 'wall';
type Access = 'visible' | 'privy' | 'excluded';
type Purpose = 'extract' | 'bridge' | 'brief' | 'privy' | 'answer';
type Verdict = { verdict: 'proceed' | 'hold' | 'decline'; routeTo: Role | null };
type Usage = { inputTokens?: number; outputTokens?: number; audioSeconds?: number; costUsd: number };
type Api = { model: string; responseId: string; usage: Usage; stageKey: string };

interface Source {
  id: string; vault: Vault; title: string; capturedAt: string;
  kind: 'talk-audio' | 'slide-photo' | 'article' | 'deck-photo' | 'crm' | 'memo' | 'conflicts';
  fixture: string;
  text?: string;
  ownerRole?: Role;
  classification?: Classification;
}

interface AccessRule {
  id: string; vault: Vault; classification?: Classification; owner?: boolean;
  viewer: Role; purposes: Purpose[]; access: Access;
}

interface Claim {
  id: string; sourceId: string; entity: string; metric?: string; value?: string;
  quote: string;
  at?: string; speaker?: string;
}

type Citation =
  | { kind: 'Fact'; claimId: string; vault: Vault; quote: string }
  | { kind: 'Inference'; fromClaimIds: string[] };

interface Bridge { id: string; personalClaimId: string; workClaimId: string;
  relation: 'contradicts' | 'supports' | 'context'; reason: string }

interface Manifest {
  callId: string; purpose: Purpose; viewerRole: Role; model: string; stageKey: string;
  included: { sourceId: string; access: Access; ruleId: string }[];
  withheld: { sourceId: string; access: Access; ruleId: string }[];
  webSearch: boolean; tokens: { raw: number; assembled: number };
}

interface Draft { id: string; kind: 'brief' | 'answer'; question?: string; viewerRole: Role;
  sentences: { text: string; citations: Citation[] }[]; droppedSentences: number;
  verdict?: Verdict; status: 'draft' | 'approved' | 'rejected' }

type LedgerEvent = { at: string } & (
  | { type: 'source.ingested'; source: Source; api?: Api }
  | { type: 'claims.extracted'; sourceId: string; claims: Claim[]; api: Api }
  | { type: 'bridge.judged'; bridge: Bridge | null; candidate: [string, string]; manifest: Manifest; api: Api }
  | { type: 'draft.created'; draft: Draft; manifest: Manifest; api: Api }
  | { type: 'privy.judged'; questionId: string; verdict: Verdict; manifest: Manifest; api?: Api; failedClosed: boolean }
  | { type: 'escalation.drafted'; draftId: string; to: Role }
  | { type: 'personal.released'; claimId: string; by: Role }
  | { type: 'attempt.failed'; stageKey: string; model: string; error: string; usage?: Usage }
  | { type: 'role.switched'; role: Role }
  | { type: 'draft.approved' | 'draft.rejected'; draftId: string; by: Role });
```

Field rules (documentation only; code carries no comments, per AGENTS.md):
- `Source.fixture` is a path under the server-only `fixtures/` directory, never `public/` and never a blob URL. Media reaches the browser only through `GET /api/media/:sourceId`.
- `Source.text` holds the verbatim transcript, photo text or document body; Fact quotes resolve against it.
- Personal sources set `ownerRole` (the Associate in the demo); enterprise sources set `classification`.
- Default rules:
  - personal → owner `visible`, everyone else `excluded`;
  - `team` → `visible` for all;
  - `partner-only` → Partner `visible`, Associate `privy`;
  - `wall` → `excluded` for all.
- `Claim.quote` is a verbatim substring of its source's `text`; `at` and `speaker` come from Voice Transcribe timestamps and speaker labels.
- `Verdict` has no string fields by design; it is the only channel from privy sources to a viewer.
- `escalation.drafted` carries no content, by design. `personal.released` is accepted only from the claim's owner.
- A `privy` manifest's contents are shown only to a viewer for whom every included source is `visible`; others see "1 privy check ran — contents hidden."
- Identity is content: a viewer for whom a source is not `visible` sees neither its text, title, nor id. Its ingested and emptied claim events are dropped from the projection, and its manifest entries keep only access and rule id. A released personal quote is the exception: its claim and source id cross with the quote.

## Meta API wiring

- **Key handling:** the server calls `https://api.meta.ai/v1` with `MODEL_API_KEY` from `.env.local` (gitignored). The key exists only in the server process. In dev, Vite proxies `/api` to Hono, and the proxy adds no key. `npm start` serves the built UI from Hono, so the built app works too.
- **Spark and Wonder:** OpenAI JS SDK (`server/meta/client.ts`) over the Responses API; `developer` message for standing rules. Day 1 confirmed strict JSON-schema output is honored (Responses `text.format`); zod still validates every structured response.
- **Voice Transcribe** is not Responses/Chat. Day 1 verified: `POST /v1/asr/transcribe` takes multipart `request` JSON (`model`, `audioEncoding: WAV`, `mode: DIARIZATION`) plus the `audio` clip, and returns `sessionId`, the full transcript, and `turns[]` with turn-level `startMs`/`endMs` plus speaker labels (A/B) — no word-level timestamps. WAV only, 10 minutes and 32 MB max. `/v1/audio/transcriptions` 404s for API keys and the Responses API rejects the voice model, so the client stays `fetch` + `FormData`. The day-1 clip was studio-clean TTS, not glasses-mic audio; the real-mic test rides with the day-2 final fixtures.
- **Model IDs** are checked against `GET /v1/models` at startup. Validation accepts any logged model that is in that list, so the 1.3 → 1.2 → 1.1 fallback passes. Day 1 confirmed all nine listed IDs, including every SPEC model.
- **Day-1 gate log (Oct 27, placeholders):** Voice `sessionId voyager/transcribe/085F3C8A6E3D460D9283B18F7DD45078` (22.6 s, 3 turns, speakers A/B); Spark vision `resp_6ae01c0965a69e95b93d4b2d` (slide) and `resp_6ae01c0c7e17305cdae8493b` (deck); bridge A/B `resp_6ae01c25972becf62da7441a` (Spark) vs `resp_6ae01c312e4ecd5575214646` (Wonder); privy A/B `resp_6ae01c3719973ce2e6344136`/`resp_6ae01c4278aeb4a832f7450b` (Spark) vs `resp_6ae01c3fcca070e1edd0441a`/`resp_6ae01c4b6ec8acde32d94368` (Wonder); extraction `resp_6ae01c592553ed2da38646f8` (Spark) vs `resp_6ae01c5c96b781cb26c04f26` (contributor); schema probe `resp_6ae01c164f546c9f92d84ee3`. Total day-1 API spend ≈ $0.10 of the $150 credits.
- **Failure contract:** on a missing key or an API error, use the cached fixture response with a visible `Simulated — <reason>` badge, and the demo continues. The boundary never degrades: failures fail closed.

## Fixtures (fictional, committed)

- **Personal** (`fixtures/personal/`, captured on the author's Ray-Ban Meta glasses):
  - a ~90s staged conference talk with 2 voices (speaker + one audience question; diarization needs both), filmed from across a room so the audio is what glasses really hear;
  - a glasses photo of the slide on a screen;
  - 3 article highlights.

  Staged and fictional, so there is no consent or licensing issue in a public repo.
- **Enterprise** (`fixtures/enterprise/`):
  - the Helios deal + CRM record (`team`);
  - the Helios deck photo, claiming net churn of 1.8% (`team`);
  - a team memo (`team`);
  - a conflicts memo saying Helios competes with portfolio company Lumen (`partner-only`);
  - one `wall` item.
- **Glasses pipeline:**
  - **Path:** capture → Meta AI app → phone camera roll → laptop → `fixtures/personal/`.
  - **Raise the video limit first:** the default is 60s (Meta AI app → Devices → Settings → Media → Video settings).
  - **Convert before upload:** `ffmpeg -i talk.mp4 -vn -ac 1 -ar 16000 talk.wav` for Voice, `sips -s format jpeg slide.heic --out slide.jpg` for Spark. The exact accepted formats are confirmed in the day-1 spike.
  - **B-roll:** the POV clip is also the video's B-roll.
- **Not built:** live streaming from the glasses via the Meta Wearables Device Access Toolkit (needs a native iOS/Android app; too much for 8 days solo). Narrated as the production capture path.

## Build order

| Day | Date | Work | Exit check |
| --- | --- | --- | --- |
| 0 | Mon Oct 26 | Docs first, no app code. Phase 0 is done; refresh the feature map and `docs/` for v2.1 (see AGENTS.md § Phase 0) | `render-map` exits 0; site and map match v2.1; **user reviews before any code** |
| 1 | Tue Oct 27 | Spikes: key + `GET /v1/models`; quick glasses test clip + photo; Voice; Spark vision on slide + deck; JSON-schema output; Wonder vs Spark A/B (bridge + privy); one tool-calling request through `pi-ai`'s Meta provider. Scaffold Vite + Hono | **Both gates logged** with response IDs; glasses-mic audio transcribes acceptably; Wonder and stretch-viability decisions recorded in SPEC.md; budget sanity check |
| 2 | Wed Oct 28 | Stage + shoot final glasses fixtures; `shared/data.ts`; JSONL ledger with stage keys, resume and failed-attempt logging; `GET /api/state` + SSE | Kill the server mid-pipeline, restart: it resumes with no repeated paid call (fake's call counter); refresh replays |
| 3 | Thu Oct 29 | Extraction (transcript/photo → claims) + runtime resolver | Every claim quote resolves; a fake quote is dropped |
| 4 | Fri Oct 30 | Rules table, policy, assembler, manifests, release gate, media route | Exhaustive policy test + leak tests pass (see Validation) |
| 5 | Sat Oct 31 | Bridge candidates + judge; brief; privy step + escalation; answer | Brief shows the churn bridge with 2 Fact citations; Associate answer shows `hold` + escalation. **Stretch go/no-go at end of day** |
| 6 | Sun Nov 1 | UI: capture, brief, answer, inspector, release, role switch, approve | Full demo path clicks through |
| 7 | Mon Nov 2 | Failure states, honesty labels, README + Pages site + feature map sync, rough video. If stretch is go: chat, timeboxed to 6 hours in the morning | Rough cut under 3:00 |
| 8 | Tue Nov 3 | Final video; buffer | Submit-ready |
| – | Wed Nov 4 | Submit by midday; 9 PM hard deadline | — |

Cut if behind, in this order: the stretch, SAM, Wonder (use Spark), article highlights, the `wall` item. Never cut: the two gates, the policy table + assembler + release gate + their tests, the inspector, the bridge.

## Stretch (gated)

- **Follow-up chat.** After the first answer, the viewer can ask follow-ups.
  - **Library:** `@earendil-works/pi-durable` pinned to exactly `1.4.0`, with `pi-ai`'s built-in Meta provider. It reads `META_API_KEY`, which the server sets from `MODEL_API_KEY`.
  - **One conversation per (viewer, draft),** never forked across roles.
  - **Tools:** `search_claims(query)` and `get_quote(claimId)` resolve through the same policy, so even the agent's own tool calls return only what the viewer may see. Privy content is never a tool result.
  - **The first answer stays on the fixed pipeline,** and the citation resolver applies to every chat sentence.
  - **Go only if** the day-1 tool-calling check passed (it did on Oct 27: a `get_quote` call round-tripped through pi-ai's Meta provider to Spark 1.3) **and** day 5's exit check passed by the end of Sat Oct 31.
- **Preference learning (design only).** A future `preference.learned` event would store a Partner's edit as a versioned note that later drafts cite. Not built in this hackathon.

## Validation

- `npx tsc --noEmit` and `npm run build` clean; `npm run dev` (UI :5173 + server :8787) with no console errors; `npm start` serves the built app.
- **Gates:** the ledger shows a live Voice transcript and a live Spark vision call with model + response ID, each model present in `GET /v1/models`.
- **Exhaustive policy test:** for every role × source × purpose, the assembled prompt includes a source if and only if the rules table allows it, and each manifest entry names the matching rule ID.
- **Privy leak test:** no Associate writer prompt (`brief`, `answer`) contains text from any privy or excluded source (string search of the logged request bodies).
- **Verdict channel:** privy output parses as exactly `Verdict`; extra fields or strings are rejected. A forced failure yields `hold` + `failedClosed: true`.
- **Browser leak test:** `/api/state` and `/api/media` responses for an Associate contain no privy or excluded text or media. For a non-owner viewer, they contain no personal text except released quotes.
- **Release gate:** no escalation, approved decision or Partner-facing response contains personal text without a matching `personal.released` event; a release attempt by a non-owner is rejected.
- **Escalation:** with the conflicts memo present, the Associate's answer yields `hold` + `escalation.drafted`. With the memo removed, it yields `proceed` and no escalation.
- **Durability:** kill and restart mid-pipeline, and it resumes with no repeated paid call; usage totals include failed attempts.
- **Citations:** every displayed sentence has ≥1 citation; every Fact resolves verbatim; an injected unsupported sentence is dropped and counted.
- **Bridge:** the brief contains ≥1 bridge with one Personal Fact + one Enterprise Fact.
- **Replay:** reload shows the same brief, answer and inspector with zero new API calls.
- **No work → personal write:** no enterprise code path writes to the personal vault.
- **Docs:** `render-map` exits 0; every feature-map grade carries evidence; `docs/` shows the current status; no comments in code.
- **Honesty:** every simulated surface is labeled (fictional enterprise data, staged talk, simulated sign-in, PAP-style scopes); glasses captures are real but pre-recorded, not streamed; README matches this spec.

## Non-goals and risks

- **Non-goals:**
  - real auth/SSO; PAP integration (narrated);
  - live CRM sync; fine-tuning;
  - Modal; streaming ASR;
  - a learning ranker; protected time;
  - pi-durable outside the stretch chat;
  - agent or memory frameworks; vector stores.
- **Risks:**
  - Both gates share one key/region (US-first preview), so the day-1 spike is the preflight.
  - The Voice endpoint is verified (`POST /v1/asr/transcribe`, day 1), but glasses-mic audio of a distant speaker may still transcribe poorly; the real-mic test rides with the day-2 fixtures. Fallback: a phone near the speaker for audio, glasses for the video.
  - Wonder price/availability is unverified and A/B gated.
  - `privy` leaks existence and direction by design (accepted; walls are `excluded`).
  - The weak-model risk is contained because the boundary, verdict channel and citations are enforced in code, and failures fail closed.
  - The stretch depends on an experimental library and on untested tool calling; it is gated and first to cut.
  - Credit burn is contained by stage-key caching.
  - "RAG" framing: lead with the bridge and the access rule.

## Sources

- Muse Spark API: https://ai.meta.com/blog/introducing-muse-spark-meta-model-api/
- Build with Muse Spark: https://dev.meta.ai/resources/blog/build-with-muse-spark/
- Organizational Second Brain: https://engineering.fb.com/2026/09/02/ml-applications/organizational-second-brain-ai-learns-from-experts/
- Muse Wonder pricing (secondary, unverified against Meta): https://www.yottalabs.ai/post/meta-muse-wonder-pricing-api-cost-muse-code-plans, https://mer.vin/news/muse-wonder-metas-frontier-agent-model-pricing-and-benchmarks/
- PAP / Sentinel notes: RESEARCH.md §4
- pi-durable (v1.4.0, experimental): https://github.com/earendil-works/pi/tree/main/packages/durable
- pi-ai Meta provider: https://github.com/earendil-works/pi/blob/main/packages/ai/README.md
- Wearables Device Access Toolkit: https://developers.meta.com/blog/introducing-meta-wearables-device-access-toolkit/
- Glasses capture + video settings: https://www.meta.com/help/ai-glasses/272319252352130/, https://www.neowin.net/news/ray-ban-meta-smart-glasses-new-update-extends-video-recording-to-3-minutes/
