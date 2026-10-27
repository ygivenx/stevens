# Stevens

**A chief of staff that makes what you learn count at work, without leaking either side.**

Future knowledge workers won't mostly write; they'll read, listen and absorb. Stevens takes in what you learn off the clock and connects it to the work decision in front of you, with a source on every sentence. That means conference talks and slides captured on Ray-Ban Meta glasses, plus articles you highlight.

Stevens is named after the butler in *The Remains of the Day*: he prepares you before the delegation arrives, and he is discreet about everything. **Stevens drafts; the human decides.**

Built solo for the Meta Global AI Developer Hackathon (Build for Your World). Status: in development; submission due Nov 4, 2026.

## The access rule

- **Personal.** Stevens is your agent and sees all of your personal vault. Your personal data never reaches the firm unless you release a specific quote, and every release is logged.
- **Enterprise.** Each source is `visible` (Stevens may quote it to you), `privy` (Stevens reasons over it for you, and you see only a verdict) or `excluded` (Stevens never touches it). An Associate's Stevens is privy to the Partners' memos without the Associate ever seeing them.

The server enforces the rule, so the browser never receives anything you may not see. The rules are a data table, checked by a test against every role × source × purpose combination. Privy knowledge reaches you only as a fixed verdict with no free text, and failures fail closed. The boundary inspector shows what every model call saw, and which rule decided it.

## Demo (3 minutes, VC persona)

1. **Capture:** glasses footage from a conference. Muse Voice Transcribe transcribes the talk live, and Muse Spark reads a photo of a slide.
2. **Brief:** before tomorrow's second meeting with Helios, Stevens writes a brief without being asked. The talk's churn benchmark contradicts the deck's claim, and both sources are cited.
3. **Answer:** an Associate asks "Should we take the second meeting?" Stevens recommends holding until a Partner reviews, because it weighed a memo the Associate is not privy to, and it drafts an escalation.
4. **Inspector:** the boundary inspector shows what every model call saw.
5. **Approval:** the Associate shares one personal quote with the firm. A Partner sees the conflict memo and the shared quote, and approves the decision, which is logged.

## Meta models

| Model | Job |
| --- | --- |
| `muse-voice-transcribe-1.0` | Talk audio → transcript with speakers and timestamps |
| `muse-spark-1.3` | Slide and deck photos → text |
| `muse-spark-1.3-contributor` | Text → structured claims (day-1 A/B: identical quality to Spark) |
| `muse-wonder-1.0` | Links personal claims to work claims; the privy verdict; writes the brief and answer (day-1 A/B: narrow win over Spark) |

## Real vs simulated

- **Real:** the Meta model calls, and the Ray-Ban Meta captures (pre-recorded, not streamed).
- **Simulated and labeled:** the VC firm and its data (fictional), the staged talk, sign-in (a role switcher), and permission scopes modeled on Meta's Personal Agent Protocol.

## Run

Requires Node 20+ and a Meta Model API key.

```bash
npm install
echo "MODEL_API_KEY=..." > .env.local
npm run dev
```

Open http://localhost:5173. Switch roles with the simulated sign-in; run the pipeline, ask, share quotes, and approve from the tabs. The Stevens server (:8787) holds the key and is the only thing that talks to Meta; the key never reaches the browser. `npm start` serves the built app from the same server. A `Simulated — Meta fake` banner shows whenever the Meta fake stands in for the API.

## Repo map

- `SPEC.md`: build spec (product, models, contracts, build order, validation)
- `AGENTS.md`: rules for coding agents
- `RESEARCH.md`: background research
- `docs/`: project site and feature map (GitHub Pages)
- `server/`, `web/`, `shared/`: Hono API, Vite UI, shared contracts
- `spikes/day1/`: day-1 spike log with rerun commands
- `.claude/skills/verify-stevens/stevensctl`: verification CLI (all commands work: doctor, stack, seed, api, browser, meta, test, evidence, cleanup, report)

## Not in scope

Real auth/SSO, live CRM sync, fine-tuning, live glasses streaming, SAM segmentation (unless the day-2 photo test triggers it).
