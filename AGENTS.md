# AGENTS.md — Stevens

Project rules for Muse Code (and any coding agent) working in this repo.

## What this is

Stevens is a chief-of-staff agent. It links what you learn off the clock (talks, readings, notes, Ray-Ban Meta glasses captures) to work decisions, under one access rule enforced in code (SPEC.md § The access rule):
- personal data never reaches the firm unless its owner releases it, and in v3 it lives in a separate process, **Stevens · yours**, that the firm process never reads;
- enterprise sources are `visible`, `privy` or `excluded` per user, derived from each source system's ACL.

It is a solo entry for the Meta Global AI Developer Hackathon (Build for Your World). Submission is due **Wed Nov 4, 2026, 9 PM ET**.

## Read first, in this order

1. `SPEC.md` (v3): source of truth for product, interaction model, UI, models, contracts, build order and validation. If anything else disagrees, SPEC.md wins.
2. `.agents/skills/meta-ecosystem/SKILL.md`: Meta Model API facts (model IDs, wiring, pricing).
3. `RESEARCH.md`: background only.
4. `../hackthon-readme.txt`: the official hackathon rules (outside the repo; read-only).

## Status

- **v2.1, days 1–8: done** on `main` (one server, one ledger, tabbed UI). Phase 0 (docs first, verification scaffold, Pages site) is recorded in git history.
- **v3, days 9a–14: done** on `main` (PRs #10–#17). Day 9a fixed the two leaks found at `0f84ea3`.
- **v3.1, days R1–R4 (Oct 28–31): planned** (SPEC.md § Real build). **Stop and ask the user to review SPEC.md § Real build before writing R1 code.** Days 15–16 follow as planned.

Each day is its own branch and PR. A day is done when its exit check passes. At the end of each day:
- update the feature-map grades, with evidence;
- re-run `render-map --out docs/feature-map.html`;
- update the status on `docs/index.html`;
- report total API spend.

## Hard rules

- **No comments in code.** This covers every `.ts`, `.tsx`, `.css`, `.html`, `.sql` and script file you write:
  - no inline comments, no docblocks, no TODOs; use clear names instead;
  - rationale goes in SPEC.md, the feature map or commit messages;
  - SPEC.md's "Field rules" are documentation; never copy them into code;
  - files copied verbatim from the project-verify-kit templates stay as they are;
  - `--help` text is not a comment, and it is required.
- **The firm never holds personal data.**
  - Nothing under `server/firm/` imports from `server/personal/`, and the firm process never reads `data/personal/`.
  - Nothing under `server/personal/` imports from `server/firm/`; it reaches the firm only through `server/personal/firm-client.ts` over the agent API.
  - `server/common/` imports neither.
  - The import-boundary test and the "firm suite passes with `data/personal/` absent" test must stay green.
- **The servers own the boundary.**
  - `MODEL_API_KEY`, `STEVENS_AGENT_TOKEN`, `READWISE_TOKEN`, `SEC_USER_AGENT`, `STEVENS_CALENDAR_ICS`, `FIRM_DATABASE_URL` and `FIRM_ADMIN_DATABASE_URL` exist only in `.env.local` and the server processes (the admin URL also in setup scripts and tests). They never appear in `web/`, `shared/`, a browser bundle, `docs/`, logs or evidence.
  - Each browser app calls only its own server's `/api/*`, never Meta and never the other server.
- **Policy is data.**
  - Access decisions come only from the rules table in `server/common/boundary/rules.ts` via `policy()`.
  - Classifications come only from the ACL map in `server/firm/connectors/acl-map.ts`. An unknown or empty ACL maps to `wall`.
  - Membership comes only from the firm CRM's Postgres roles, through the `crm` connector.
  - Never write `if (role === …)` access logic anywhere else.
  - Every rule or ACL-map change updates its exhaustive test.
- **Every model call goes through `server/common/boundary/assemble.ts`.** Never build a prompt anywhere else, in either process.
- **Privy text never reaches a viewer.** Text from a `privy` or `excluded` source never goes into a prompt whose output that viewer sees.
  - Privy knowledge reaches a viewer only as a `Verdict`, which has no string fields.
  - `/agent/context` returns only `visible` sources; the personal assembler rejects anything else.
  - Never rely on a prompt instruction to keep a secret.
- **Personal data never reaches the firm unless released.**
  - The only path is `server/personal/share.ts` (outbound, owner only, one quote) → `POST /agent/releases` → `server/firm/release.ts` (inbound, zod-validated).
  - Escalations carry no content. Bridges and their reasons never leave the personal process.
  - Nothing in firm code paths writes to the personal process or `data/personal/`.
- **SSE carries no data.** `/api/events` sends only `event: changed` with `data: {}`. Clients refetch `/api/state`.
- **Stevens is never run by hand.** No UI control starts a pipeline stage; triggers do (SPEC.md § Interaction model). Dev endpoints exist only behind `STEVENS_DEV=1`, for `stevensctl`, and nothing in `web/` calls them.
- **No ids or pipeline vocabulary in the product UI.** Ids, stage keys, model names and the words pipeline/stage/ledger/manifest/claim/vault appear only in the Receipts drawer.
- **Fail closed.** When the privy step, the firm or a release gate cannot complete, the result is `hold` + escalate (queued if the firm is down), or the response is withheld. Never fall back to showing content.
- **Durable pipeline**, in each process:
  - every stage call has a stage key and is reused if it already completed;
  - events are appended to that process's ledger before its database is updated and before any UI hears of them;
  - each database is a projection rebuildable from its ledger and fixtures with zero API calls;
  - failed attempts are logged with usage; replay never re-calls the API.
- `web_search` is off for any call whose manifest includes enterprise data.
- Every displayed sentence passes the runtime citation resolver, and Fact quotes are verbatim.
- `Claim.at`, `speaker`, `startMs` and `endMs` are set by code from the segment, never by the model.
- Log `model`, `responseId`, `usage` and `stageKey` for every real call, inside its ledger event.
- Model IDs come from `GET /v1/models`. Never invent one; Glimmer is not on the API.
- Simulated surfaces show `Simulated — <reason>`. The real call is always the primary path.
- **Data.** Fixtures live in the server-only `fixtures/` directory, never `public/`, and are never served statically; media goes through each server's media route. All committed personal and firm-internal data is fictional; the only real committed data is public SEC Form D filings, which never appear in a fictional deal record or memo. The owner's real personal data (vault, Readwise, captures, calendar) lives only under `STEVENS_DATA_DIR` outside the repo and is never committed or copied into fixtures, docs, logs or evidence.

## Scope guard

Allowed in v3 (new): SQLite through the built-in `node:sqlite` (exactly two files, `personal.db` and `firm.db`, plain SQL); a second Hono process; the Readwise API; a one-time SEC Form D download script; `lucide-react`.

Allowed in v3.1 (new): Postgres 16+ as the firm's CRM only (dev: Postgres 18 in the `pw` sandbox, published on `127.0.0.1:5433`) (Stevens's own stores stay SQLite); the `pg` driver with plain SQL; `ical.js`; the owner's calendar ICS feed.

Allowed in v3.3 (new): Postgres as the live store for both processes (one firm + one personal database per scenario, plain SQL, `pg` only, no ORM); `node:sqlite` only as the offline backend for tests and recorded replay.

Not in this build:
- ORMs, vector stores, MCP servers or clients;
- real CRM, Google Drive or other SaaS connectors;
- SAM 3.1, unless the SPEC condition triggers;
- a learning ranker or protected time;
- Modal;
- streaming ASR or live glasses streaming (Device Access Toolkit);
- auth/SSO;
- Muse Image;
- pi-durable, except for the gated stretch chat (pinned to exactly `1.4.0`);
- agent frameworks and memory frameworks.

If a task seems to need one of these, stop and ask. The stretch chat starts only after its go/no-go (SPEC.md § Stretch) and the user's confirmation.

## Credits

- Iterate prompts on `muse-spark-1.3`.
- Extraction runs on `muse-spark-1.3-contributor` (it held quality in the day-1 A/B).
- Call `muse-wonder-1.0` only for real passes (bridge, privy, writers, decision).
- Reuse cached responses from the ledgers; drop the same fixture twice and it must cost nothing.
- Cap video keyframes at 4 per clip.
- Report total spend at the end of each day.

## Layout (v3)

- `shared/data.ts`: SPEC contracts, imported by both servers and both apps.
- `server/common/`: `meta/client.ts`, `ledger/store.ts`, `db.ts` (`node:sqlite` helper), `clock.ts`, `boundary/{rules,policy,assemble}.ts`, `resolver/`.
- `server/firm/`: `index.ts` (Hono :8787), `db/schema.sql`, `crm/schema.sql` (the Postgres CRM), `connectors/{connector,crm,formd,acl-map}.ts`, `agent-auth.ts`, `context.ts`, `privy.ts`, `escalation.ts`, `release.ts`, `decision.ts`, `filter.ts`.
- `server/personal/`: `index.ts` (Hono :8788), `db/schema.sql`, `adapters/{adapter,inbox,readwise,vault,calendar}.ts`, `normalize/{audio,photo,video,highlight,note}.ts`, `ingest.ts`, `extract.ts`, `triggers.ts`, `bridge.ts`, `brief.ts`, `answer.ts`, `share.ts`, `firm-client.ts`.
- `web/ui/`: shared components and tokens. `web/personal/`: Stevens · yours (:5173 → :8788). `web/firm/`: Stevens · firm (:5174 → :8787). `web/demo.html`: the two-screen harness (dev only).
- `fixtures/replay/`: fixture-only recorded ledgers for `npm run demo`.
- `fixtures/personal/{inbox/,readwise-export.json,vault/,calendar.ics}`, `fixtures/enterprise/{crm.json,formd/,…media}`: server-only fixtures.
- `scripts/import-formd.ts`: the one-time Form D import. `scripts/firm-crm-setup.ts`: creates the Postgres CRM, its roles and grants from `crm.json`.
- `data/personal/{personal.db,ledger.jsonl,inbox/,notes/}`, `data/firm/{firm.db,ledger.jsonl}`: runtime state (gitignored). A real owner's personal state lives under `STEVENS_DATA_DIR`, outside the repo.
- `docs/`: the Pages site.
- `.claude/skills/{verify-stevens,stevens-feature-map}`: the verification skills, symlinked into `.agents/skills/`.

## Commands

- `npm run dev`: both servers and both UIs (:8787, :8788, :5173, :5174); `npm start`: each server serves its built UI.
- `npx tsc --noEmit`, `npm run build`, `npm test` (vitest: policy, ACL map, assembler, release gates, resolver, resume, import boundary, ingestion, triggers).
- `muse voice transcribe <file.wav|m4a>`: a quick check of glasses audio outside the app.
- v3.1: `stevensctl init` configures a real owner's sources; `npm run demo` replays the recorded demo with no key and no Postgres.
- The verify CLI: see Verification.

## Verification

- Use the stevens-feature-map skill (`.claude/skills/stevens-feature-map/`) before answering product questions.
- Use `stevensctl` (the verify-stevens skill, contract in `.claude/skills/verify-stevens/references/cli-contract.md`) for verification. Implement each new v3 command on the SPEC day that first needs it.

## Working style

- When reality contradicts SPEC.md (for example, the Readwise or Form D data shapes), update SPEC.md in the same change and tell the user.
- If an approach fails twice, stop and report instead of looping.
- Git: commit only when the user asks. Keep the history honest: new work only, small commits per step. Merging a PR or pushing to `main` needs the user's explicit go-ahead.
