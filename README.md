# Stevens

**A chief of staff that makes what you learn count at work, without leaking either side.**

Future knowledge workers won't mostly write; they'll read, listen and absorb. Stevens takes in what you learn off the clock and connects it to the work decision in front of you, with a source on every sentence. That means conference talks and slides captured on Ray-Ban Meta glasses, highlights from what you read, and your own notes.

Stevens is named after the butler in *The Remains of the Day*: he prepares you before the delegation arrives, and he is discreet about everything. **Stevens drafts; the human decides.**

Built solo for the Meta Global AI Developer Hackathon (Build for Your World). Status: v3.3 works per [SPEC.md](SPEC.md): three demo scenarios, each on its own firm + personal Postgres databases, plus follow-up chat. Submission due Nov 4, 2026.

## The access rule

- **Personal.** Everything you capture goes through one ingestion layer into your own personal database, run by **Stevens · yours**, a separate process from the firm's. Your personal data never reaches the firm unless you share a specific quote, and every share is logged.
- **Enterprise.** **Stevens · firm** reads the firm's systems through connectors and mirrors their permissions. Each source is `visible` (Stevens may quote it to you), `privy` (Stevens reasons over it for you, and you see only a verdict) or `excluded` (Stevens never touches it). An Associate's Stevens is privy to the Partners' memos without the Associate ever seeing them.

The rules are a data table, checked by a test against every role × source × purpose combination. Privy knowledge reaches you only as a fixed verdict with no free text, and failures fail closed. Every brief and answer has Receipts showing what each model call saw, and which rule decided it.

## Demo (3 minutes, VC persona, two laptops)

1. **Capture:** glasses footage from a conference lands in the Associate's notebook. Muse Voice Transcribe transcribes the talk live, and Muse Spark reads a photo of a slide. Nobody presses anything.
2. **Brief:** the next day's second meeting with Helios is on the calendar, so Stevens writes a brief by itself. The deck says net churn is 1.8%; the talk said mid-market churn runs 6–8%, and the play button replays that moment. Both are cited, next to public SEC Form D market comps.
3. **Answer:** the Associate asks "Should we take the second meeting?" Stevens recommends holding until a Partner reviews, because it weighed a memo the Associate is not privy to. On the Partner's laptop, an escalation arrives with nothing enclosed.
4. **Receipts:** what every model call saw and held back, and the firm's connectors with their permission mapping.
5. **Share and approve:** the Associate shares one quote. It appears in the Partner's deal record; the Partner sees the conflict memo and approves Stevens' draft decision, which is logged.

## Meta models

| Model | Job |
| --- | --- |
| `muse-voice-transcribe-1.0` | Talk audio and video audio → transcript with speakers and timestamps |
| `muse-spark-1.3` | Slide, deck and video-frame photos → text |
| `muse-spark-1.3-contributor` | Text → structured claims (day-1 A/B: identical quality to Spark) |
| `muse-wonder-1.0` | Links personal claims to work claims; the privy verdict; writes the brief, the answer and the Partner's decision draft (day-1 A/B: narrow win over Spark) |

## Real vs simulated

- **Real:** the Meta model calls; the Ray-Ban Meta captures (pre-recorded and imported, not streamed); public SEC Form D filings; the Readwise API when a token is set; the Postgres firm CRM as a system (roles, grants, row-level security).
- **Simulated and labeled:** the VC firm, its records and its people (fictional); the staged talk; sign-in; Readwise highlights from an export file when no token is set; permission scopes modeled on Meta's Personal Agent Protocol.

## Send to Stevens (iPhone Shortcut)

Ray-Ban Meta captures reach Stevens through the Meta AI app and the Photos share sheet. Build the Shortcut once:

1. On the iPhone, open Shortcuts and tap + to make a new shortcut. Name it **Send to Stevens**.
2. Tap the (i) and turn on **Show in Share Sheet**. Under supported input types, keep Images, Media and Files selected.
3. Add a **Save File** action. Set it to save **Shortcut Input** into iCloud Drive, in the folder configured as `STEVENS_INBOX_DIR` (for example `Stevens Inbox`). Turn off **Ask Where to Save**.
4. In the Meta AI app, import the glasses capture, then share it to Photos.
5. In Photos, select the photos, videos or voice memos, tap Share, and run **Send to Stevens**.
6. Stevens ingests new files on its own within a minute. Files stay in the folder; sending the same file twice adds nothing.
7. A file iCloud has not downloaded yet is picked up on a later check, not rejected.
8. Supported types: `.wav`, `.m4a`, `.mp3`, `.jpg`, `.jpeg`, `.png`, `.heic`, `.mp4`, `.mov`. Anything else is skipped with a reason.

## Run it on your own notes

Requires Node 24+ and a Meta Model API key. Stevens · yours reads your Obsidian vault, Readwise, calendar, and glasses inbox, with or without a firm. Nothing leaves your machine except Meta model calls.

```bash
npm install
echo "MODEL_API_KEY=..." > .env.local
.claude/skills/verify-stevens/stevensctl init --vault-dir ~/notes --owner "Your Name"
npm run dev
```

`init` checks every source and prints one line each, without ever printing a token. Then open http://localhost:5173: your notes are indexed, recent ones extracted, and calendar meetings within 24 hours get briefs written from your notebook. `--firm-url off` (the default) is solo mode: no firm checks run and sharing is refused. Point `--inbox-dir` at an iCloud Drive folder and use the Send to Stevens shortcut to capture from your phone.

## Run the firm

The firm's CRM is a real Postgres database with roles, grants, and row-level security; every record in it is fictional. From the repo root:

```bash
.claude/skills/verify-stevens/stevensctl crm-db up
npx tsx scripts/firm-crm-setup.ts
npm run dev
```

`crm-db up` bootstraps Postgres 18 in the `pw` sandbox (idempotent, nothing else touched) and writes the admin URL to `.env.local`, never printed. `firm-crm-setup` builds the roles and loads `fixtures/enterprise/crm.json` as rows and grants. Then open http://localhost:5174/?as=p-morgan: Morgan sees the Helios and Beacon deals, Jordan sees Beacon and Meridian, and the legal-hold note stays out of every Stevens store. `STEVENS_DEV=1 stevensctl crm revoke <document> <principal>` downgrades a document within a minute.

## Recorded demos (no key, no Postgres)

```bash
npm run demo -- --scenario helios   # yours :5173, firm :5174
npm run demo -- --scenario forge    # yours :5273, firm :5274
npm run demo -- --scenario mercy    # yours :5373, firm :5374
```

Each command replays a committed, fixture-only run: cards, bridges, the hold + escalation, the share, the approval, and (forge) a sample chat thread. Both status lines read "Replaying a recorded run". The replay carries its own date, so there is nothing to select. To re-record after changing the flow: `stevensctl record-replay --scenario <id>`, which refuses to run when any real source is configured, then review and commit that scenario's `replay/`.

The three arcs: **helios** (Alex the associate spots a churn-definition gap before the Helios second meeting), **forge** (Rae the staff engineer's AI-evals reading punctures a vendor's 41% deflection claim), **mercy** (Dr. Osei's bookmarked Nature paper changes a tumor-board review; all clinical data fictional).

## Live demos (Postgres + API key)

```bash
npm run dev          # helios, same ports as above
npm run dev:forge
npm run dev:mercy
```

Live stacks run the real pipeline against six Postgres databases (one firm + one personal per scenario). First boot for a scenario needs its databases built: `npx tsx scripts/firm-crm-setup.ts --scenario <id>` and `npx tsx scripts/personal-pg-setup.ts --scenario <id>` (or one `stevensctl seed --scenario <id>`, which runs both with `--reset` and restarts). Setup anchors the fixture meetings to the effective clock, so a fresh setup is always demo-ready for about half a day; re-run setup if the cards stop appearing.

Pick the demo date with `STEVENS_NOW`: `STEVENS_NOW=2026-10-28T14:00:00-04:00 npm run dev:mercy`. An invalid value fails at boot with the value in the message. `stevensctl stack up --scenario <id> --now <ISO>` pins a verify instance the same way and remembers the pin across restarts; `seed` forwards it to setup so dates stay coherent.

Follow-up chat runs only on live stacks (one turn costs a few cents). A full live run of one scenario costs on the order of a dollar; the recorded demos cost nothing.

## Repo map

- `SPEC.md`: build spec (product, interaction model, UI, models, contracts, build order, validation)
- `AGENTS.md`: rules for coding agents
- `RESEARCH.md`: background research
- `docs/`: project site and feature map (GitHub Pages)
- `server/`, `web/`, `shared/`: servers, apps, shared contracts (v3 layout in AGENTS.md)
- `spikes/day1/`: day-1 spike log with rerun commands
- `.claude/skills/verify-stevens/stevensctl`: verification CLI

## Not in scope

Real auth/SSO, real Drive connectors, MCP, vector stores, fine-tuning, live glasses streaming, on-device models, and SAM segmentation unless the real slide photo needs it.
