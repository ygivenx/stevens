# stevensctl contract

`stevensctl` is the single verification CLI for Stevens. It lives in `.claude/skills/verify-stevens/stevensctl`, runs from the repo root with `uv run` (no install step), and mirrors the verify-CLI contract shared across projects: `--help` with examples on every command, `+` echo lines for every command it runs, exit 0 pass / 1 check failed / 2 usage or precondition error whose message says how to fix it.

Day 4 status: `doctor`, `stack`, `seed`, `meta`, `api` (health, state, ingest, extract, release, media), `evidence`, and `test` are implemented. Remaining: `browser` on day 6 with the UI surfaces, `cleanup` / `report` on day 7.

## Instances and evidence

`STEVENS_VERIFY_INSTANCE` / `--instance` names a run; state and evidence are namespaced by it. `cleanup` touches only its own instance. Evidence lives in `/tmp/stevens-verify/<instance>/evidence/` and survives `cleanup` but not a reboot.

## Commands

### doctor

Checks the tools and credentials the demo needs:

- `node` 20+, `uv`, and `ffmpeg` are present.
- `MODEL_API_KEY` is set in `.env.local` (never printed).
- `GET /v1/models` succeeds and lists the SPEC models (`muse-voice-transcribe-1.0`, `muse-spark-1.3`, `muse-wonder-1.0` if the day-1 A/B keeps it).
- Ports 5173 and 8787 are free or held by this instance.

Exit 1 names the missing piece and the fix.

### stack up|down|logs|restart|status

Local copy of the deployment: `npm run dev` (Vite UI on :5173 plus the Hono server on :8787, which holds the key). `up` starts both and waits for health (HTTP 200 on `/` plus `GET /api/state` answering with an `X-Viewer-Role` caller). `status` prints the instance, pids, ports, and health. `logs` tails the dev server log. `down` stops only this instance's servers.

### seed

Stages the SPEC fixtures into the server-only `fixtures/` directory (talk audio + slide photo + article highlights into the personal vault, Helios deal + CRM + deck photo + team memo + partner-only conflicts memo + one `wall` item into the enterprise vault) plus a fresh `data/ledger.jsonl`. Nothing lands in `public/`; fixtures are never served statically. Synthetic and fictional only; refuses to run against anything but the local stack.

### api

Drives the app's HTTP surface as a role (sent as `X-Viewer-Role`, enforced by the server):

```bash
stevensctl api --as Associate brief --expect 200 --field 'sentences[0].citations[0].kind' --save brief.json
stevensctl api --as Associate answer --expect 200 --until '.escalation == true'
stevensctl api --as Partner memo --expect 200
```

`--as Associate|Partner` sets the viewer role, `--expect` asserts status, `--field` asserts a JSON path, `--until` polls a condition, `--save` stores the capture under the evidence dir.

### browser run|snapshot

`browser run <flow>` drives a named UI flow (capture, brief, answer, inspector, role-switch, release, approve) and asserts visible text; `browser snapshot` saves DOM + screenshot to the evidence dir. Preferred for UI surfaces; the API driver covers API-only paths.

### test

Runs `npx tsc --noEmit`, the vitest suites (exhaustive policy, assembler, release gate, resolver, resume), and `npm run build`. Prints one line per suite plus the evidence path of the full log.

### evidence dir|list

`evidence dir` prints `/tmp/stevens-verify/<instance>/evidence/`; `evidence list` prints its contents with sizes.

### cleanup

Stops this instance's stack and removes its state; keeps evidence. Always safe to run. Never touches another instance's processes.

### report

Prints the verify-stevens report shape (verdict, checks table, deployed-environment differences, findings, needs-the-user) from this instance's evidence.

### meta fake (failure injection)

The Meta API fake stands in for `api.meta.ai` in tests and failure drills. Modes: `normal|empty|fail|garbage|slow`, plus a call counter the replay and resume checks read:

```bash
stevensctl meta fake --mode fail     # every model call errors
stevensctl meta fake --mode slow     # every model call sleeps 5s
stevensctl meta calls                # prints the call counter
stevensctl meta fake --mode normal   # restore
```

Expected app behavior per mode: `fail` and `garbage` show `Simulated — <reason>` badges and the demo continues; `empty` yields "nothing relevant" drafts; `slow` must not hang the UI; the counter must read zero new calls after a replay or a resumed restart.

## Explicit skips

Not implemented until the thing they check exists:

- `db query` — no database; the ledger is the server's `data/ledger.jsonl`, read via `GET /api/state`.
- `ci status` — no CI yet.
- `aws status` — no deployed app; the only deploy is the static GitHub Pages site in `docs/`.
- `parity check` — same reason: nothing deployed to diff against.

When CI or a deploy appears, add the command and remove it from this list in the same change.
