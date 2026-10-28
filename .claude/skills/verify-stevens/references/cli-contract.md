# stevensctl contract

`stevensctl` is the single verification CLI for Stevens. It lives in `.claude/skills/verify-stevens/stevensctl`, runs from the repo root with `uv run` (no install step), and mirrors the verify-CLI contract shared across projects: `--help` with examples on every command, `+` echo lines for every command it runs, exit 0 pass / 1 check failed / 2 usage or precondition error whose message says how to fix it.

Status: every v2.1 command is implemented (day 7). The v3 changes below are **planned**; implement each on the SPEC.md v3 day that first needs it (noted per command). Until then the v2.1 behavior stays.

## v3 stack in one table

| Piece | Port | Health check |
| --- | --- | --- |
| Stevens · firm (Hono, `server/firm/index.ts`) | 8787 | `GET /api/people` → 200 |
| Stevens · yours (Hono, `server/personal/index.ts`) | 8788 | `GET /api/state` → 200 |
| Associate app (Vite, `web/personal/`) | 5173 | `GET /` → 200 |
| Partner app (Vite, `web/firm/`) | 5174 | `GET /` → 200 |

State: `data/firm/{firm.db,ledger.jsonl}` and `data/personal/{personal.db,ledger.jsonl,inbox/,vault/}`. Verify flows never use this tree: `stack up` seals the instance to `/tmp/stevens-verify/<instance>/data/` with fixture sources and real tokens unset, so default flows never touch owner data (v3.1: day R1).

## Instances and evidence

`STEVENS_VERIFY_INSTANCE` / `--instance` names a run; state and evidence are namespaced by it. `cleanup` touches only its own instance. Evidence lives in `/tmp/stevens-verify/<instance>/evidence/` and survives `cleanup` but not a reboot.

## Commands

### doctor

Checks the tools and credentials the demo needs:

- `node` 24+ (for `node:sqlite`), `uv`, and `ffmpeg` are present; `sips` on macOS.
- `MODEL_API_KEY` and `STEVENS_AGENT_TOKEN` are set in `.env.local` (never printed). `READWISE_TOKEN` is optional; without it, doctor notes "Readwise: export file (simulated)".
- `GET /v1/models` succeeds and lists the SPEC models (`muse-voice-transcribe-1.0`, `muse-spark-1.3`, `muse-spark-1.3-contributor`, `muse-wonder-1.0`).
- Ports 8787, 8788, 5173 and 5174 are free or held by this instance. (v3: day 9b.)

Exit 1 names the missing piece and the fix.

### stack up|down|logs|restart|status

Local copy of the deployment: `npm run dev`. `up` starts all four pieces and waits for each health check in the table above. `status` prints the instance, pids, ports and health per piece. `logs [firm|yours|web]` tails one piece or all. `down` stops only this instance's processes. `--now <iso>` sets `STEVENS_NOW` for the instance (the demo uses `2026-10-28T14:00:00-04:00`). (v3: day 9b.) `up` seals the instance: `STEVENS_DATA_DIR` points under `/tmp/stevens-verify/<instance>/data/`, vault and inbox point inside it, and real source credentials are unset, so the stack only ever sees fixtures (v3.1: day R1).

### init

Configures Stevens for a real owner: writes the v3.1 keys to `.env.local` (merged, other keys kept), checks `MODEL_API_KEY` plus each source, and prints one line per source without ever printing a token or URL. Flags are agent-runnable; missing values prompt in a terminal and error elsewhere. `--firm-url off` (the default) means solo mode. (v3.1: day R1.)

### seed

Rebuilds this instance's state from fixtures, with fresh ledgers:
- **firm:** `firm.db` from `fixtures/enterprise/crm.json` and `fixtures/enterprise/formd/*.json`, then a connector sync;
- **yours:** the instance `vault/` from `fixtures/personal/vault/`; Readwise from `fixtures/personal/readwise-export.json` (the sealed stack unsets `READWISE_TOKEN`); an **empty** inbox.

`--with-captures` also drops the talk and the slide, and waits until both items are `ready`. Synthetic and fictional only (plus public Form D rows); refuses to run against anything but the local stack. (v3: day 9b for the databases, day 10–11 for the adapters.)

### drop <talk|slide|path> [--wait]

Copies a fixture (or any file) into this instance's `inbox/`, which is exactly what the glasses import does. Needs this instance's stack up. `--wait` polls the personal `/api/state` until the item is `ready`, `failed` or rejected, and prints its status, segment count and claim count. (v3: day 10.)

### sync [firm|yours]

Calls the dev-only sync endpoints (`STEVENS_DEV=1`): connectors on the firm, adapters on yours. (v3: day 11.)

### api

Drives an HTTP surface as a person:

```bash
stevensctl api --via yours GET /api/state --field '.meetings[0].briefId'
stevensctl api --via yours POST /api/ask --data '{"dealId":"helios","question":"Should we take the second meeting?"}' --expect 202
stevensctl api --via firm --as p-morgan GET /api/state --until '.inbox | length > 0'
stevensctl api --via agent --as p-alex GET '/agent/context?dealId=helios&purpose=answer' --save context.json
```

- `--via yours|firm|agent` picks the surface: yours (:8788, as its owner), firm (:8787, `X-Viewer-Id`), or the agent API (:8787, `X-Stevens-Agent` for that person's token).
- `--as <personId>` sets the person (firm and agent only); `--expect` asserts status; `--field` asserts a JSON path; `--until` polls a condition; `--save` stores the capture under the evidence dir.
- Refuses with exit 2 when the stack is not up (day 8 behavior). (v3: day 9b.)

### browser run|snapshot

`browser run <flow>` drives a named UI flow and asserts visible text; `browser snapshot <app> <route>` saves DOM + screenshot to the evidence dir. v3 flows: `associate-today`, `associate-ask`, `associate-share`, `associate-receipts`, `associate-captures` (day 13), `partner-inbox`, `partner-approve`, `partner-sources`, `demo-two-screens` (day 14). Every flow also asserts the UI-vocabulary rule: no id, no pipeline vocabulary and no Run control outside the Receipts drawer.

### demo run|open

`demo run` executes the SPEC demo through the APIs only: seed → `drop talk` → `drop slide` → wait for the Helios brief → ask → assert `hold` and an escalation in Morgan's inbox → share the churn quote → assert it in the Helios record → approve the decision → `leak scan`. `demo open` opens `web/demo.html`. (v3: `run` day 12, `open` day 14.)

### leak scan

Searches `data/firm/` (ledger and `firm.db`) for the text of every personal segment and reports any hit that is not a released quote; checks that every `/api/events` message from both servers has `data: {}`. Exit 1 on any finding. (v3: day 9a for the stream check, day 12 for the full scan.)

### db query <personal|firm> "<select>"

Read-only SQL against one database (opened read-only; anything but a single `SELECT` exits 2). Prints rows as JSON. For checks the APIs don't expose (for example, counting `segments` per item). (v3: day 9b.)

### test

Runs `npx tsc --noEmit`, the vitest suites (exhaustive policy, ACL map, assembler, release gates, resolver, resume, import boundary, ingestion, triggers, Form D comps), and `npm run build`. Prints one line per suite plus the evidence path of the full log.

### evidence dir|list

`evidence dir` prints `/tmp/stevens-verify/<instance>/evidence/`; `evidence list` prints its contents with sizes.

### cleanup

Stops this instance's stack and removes its state; keeps evidence. Always safe to run. Never touches another instance's processes.

### report

Prints the verify-stevens report shape (verdict, checks table, deployed-environment differences, findings, needs-the-user) from this instance's evidence.

### meta fake (failure injection)

The Meta API fake stands in for `api.meta.ai` in tests and failure drills, for both servers. Modes: `normal|empty|fail|garbage|slow`, plus a call counter the replay and resume checks read:

```bash
stevensctl meta fake --mode fail     # every model call errors
stevensctl meta fake --mode slow     # every model call sleeps 5s
stevensctl meta calls                # prints the call counter
stevensctl meta fake --mode normal   # restore
```

Expected app behavior per mode: `fail` and `garbage` show `Simulated — <reason>` badges and the demo continues, failing closed; `empty` yields "nothing relevant" drafts; `slow` must not hang either UI; the counter must read zero new calls after a replay, a resumed restart, a re-drop of the same file, or a `personal.db` rebuild.

### firm down|up (failure injection)

Stops or restarts only the firm server of this instance, to drill the fail-closed path: Alex's question yields `hold`, `escalation.queued` and its label, and the escalation is sent once the firm is back. (v3: day 15.)

## Explicit skips

Not implemented until the thing they check exists:

- `ci status` — no CI yet.
- `aws status` — no deployed app; the only deploy is the static GitHub Pages site in `docs/`.
- `parity check` — same reason: nothing deployed to diff against.

When CI or a deploy appears, add the command and remove it from this list in the same change.
