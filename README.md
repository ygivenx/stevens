# Stevens

**A chief of staff that makes what you learn count at work, without leaking either side.**

Future knowledge workers won't mostly write; they'll read, listen and absorb. Stevens takes in what you learn off the clock and connects it to the work decision in front of you, with a source on every sentence. That means conference talks and slides captured on Ray-Ban Meta glasses, highlights from what you read, and your own notes.

Stevens is named after the butler in *The Remains of the Day*: he prepares you before the delegation arrives, and he is discreet about everything. **Stevens drafts; the human decides.**

Built solo for the Meta Global AI Developer Hackathon (Build for Your World). Status: v2.1 works; v3 (this README) is in development per [SPEC.md](SPEC.md). Submission due Nov 4, 2026.

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

- **Real:** the Meta model calls; the Ray-Ban Meta captures (pre-recorded and imported, not streamed); public SEC Form D filings; the Readwise API when a token is set.
- **Simulated and labeled:** the VC firm, its CRM and its people (fictional); the staged talk; sign-in; Readwise highlights from an export file when no token is set; permission scopes modeled on Meta's Personal Agent Protocol.

## Run (v2.1, until the v3 split lands)

Requires Node 24+ and a Meta Model API key.

```bash
npm install
echo "MODEL_API_KEY=..." > .env.local
npm run dev
```

Open http://localhost:5173. The Stevens server (:8787) holds the key and is the only thing that talks to Meta; the key never reaches the browser. In v3, `npm run dev` starts Stevens · firm (:8787), Stevens · yours (:8788), the Associate app (:5173) and the Partner app (:5174); `web/demo.html` shows both apps side by side.

## Repo map

- `SPEC.md`: build spec (product, interaction model, UI, models, contracts, build order, validation)
- `AGENTS.md`: rules for coding agents
- `RESEARCH.md`: background research
- `docs/`: project site and feature map (GitHub Pages)
- `server/`, `web/`, `shared/`: servers, apps, shared contracts (v3 layout in AGENTS.md)
- `spikes/day1/`: day-1 spike log with rerun commands
- `.claude/skills/verify-stevens/stevensctl`: verification CLI

## Not in scope

Real auth/SSO, real CRM or Drive connectors, MCP, vector stores, fine-tuning, live glasses streaming, on-device models, and SAM segmentation unless the real slide photo needs it.
