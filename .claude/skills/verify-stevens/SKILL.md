---
name: verify-stevens
description: Use when verifying a Stevens change end to end, before or after deploying, when reproducing a deployed-only bug locally, when checking that CI, migrations or infrastructure code still pass, or when asked to test, smoke-test, QA or prove a feature works.
---

# Verify Stevens

All verification goes through one CLI, `stevensctl`, in this directory. It runs a local copy of the real deployment and gives a command for every check we use.

```bash
CC=.claude/skills/verify-stevens/stevensctl   # from the repo root
$CC --help ; $CC <command> --help            # every command has examples
```

**Core rule:** if `stevensctl` can run a check, run it that way. Do not hand-roll `curl`, `docker compose` or `psql` for something it covers. Commands echo what they run (`+` lines). Exit codes: 0 pass, 1 check failed, 2 usage or precondition error (the message says how to fix it).

The CLI contract every project's CLI follows is in the project-verify-kit skill (`references/cli-contract.md`); this project's contract is `references/cli-contract.md` in this directory. For what to drive per feature, read the stevens-feature-map skill.

## What it mirrors

The demo runs under `npm run dev` only; there is no deployed app, no database, and no IaC, so there is no drift to diff. The table below is the whole stack:

| Deployed resource | Local stand-in |
|---|---|
| Hono server on :8787 (holds `MODEL_API_KEY`, owns vaults, policy, assembler, pipeline, ledger) | `stevensctl stack up` serves it locally |
| Vite dev server on :5173 (proxies `/api` to the Hono server, adds no key) | same `stack up` |
| Meta Model API (`api.meta.ai`) | live API, or the `meta fake` failure injector |
| Server JSONL event ledger at `data/ledger.jsonl` | same, seeded fresh by `seed` |
| GitHub Pages static site (`docs/`) | `docs/index.html` opened locally |

The browser calls only Stevens' own `/api/*`, never Meta. There is no `/api/meta/*` proxy.

## Launch

```bash
$CC doctor          # node, uv, ffmpeg, MODEL_API_KEY, GET /v1/models, ports 5173+8787
$CC stack up        # npm run dev (UI :5173 + server :8787), waits for health
$CC seed            # SPEC fixtures into server-only fixtures/ plus a fresh data/ledger.jsonl; synthetic data only
```

Name your instance before anything that mutates: `export STEVENS_VERIFY_INSTANCE=<task>`. If `doctor` shows your instance UP and you did not start it, another session did: pick another name. Never `stack down` a stack you did not start.

## Drive

| Need | Command |
|---|---|
| Call the app as a role | `$CC api --as Associate\|Partner <surface> --expect 200` |
| Assert a JSON field or wait for async work | `--field '<json path>'`, `--until '<condition>'`, `--save <file>` |
| Drive a UI flow | `$CC browser run <capture\|brief\|answer\|inspector\|role-switch\|release\|approve>` |
| Capture DOM + screenshot | `$CC browser snapshot` |
| Read dev server logs | `$CC stack logs` |
| Inject Meta API failures | `$CC meta fake --mode normal\|empty\|fail\|garbage\|slow`, `$CC meta calls` |
| Run typecheck + tests + build | `$CC test` |

`api --as` sends the role as `X-Viewer-Role`; the server enforces it.

There is no `db query`: the ledger is the server's `data/ledger.jsonl`, read via `GET /api/state`. No SQL exists anywhere.

## CI parity

No CI exists yet, so parity is local-only:

| CI job or practice | Command |
|---|---|
| (no workflows) typecheck + vitest + build | `$CC test` |

When CI appears, add a `ci status` command and a row here in the same change.

## Deployed-environment parity

No read-only status command exists: there is no deployed app. The only deploy is the static GitHub Pages site built from `docs/`, verified by opening the pages locally. No deploy rehearsal.

Things local cannot reproduce (include in every report until they change):

- The Pages site served from GitHub (local open is equivalent HTML, not the served site).
- Meta API behavior under real quota, latency, and region gating — `doctor` checks reachability only.
- Real glasses streaming (out of scope; captures are pre-recorded files).

## Never without asking

Never do any of these without the user's explicit go-ahead:
- push images, update services, run tasks in a real account;
- IaC `plan` or `apply` against the real workspace;
- paid probes (LLM, cloud);
- any SQL write;
- commits;
- any write against a deployed environment's app.

A go-ahead counts only if it names the action. "Do whatever you need" names nothing: ask, listing the exact actions. Approval for one action does not carry over to the next. Use synthetic data only.

## Evidence

`$CC evidence dir` is `/tmp/stevens-verify/<instance>/evidence/`. It holds test logs, screenshots, API captures and probe output. It survives `cleanup`. Cite these paths in the report.

## Cleanup

```bash
$CC cleanup            # removes only what this instance started; keeps evidence
```

Run cleanup after every session, including failed ones, unless the user is keeping the instance.

## Report shape

1. **Verdict**: PASS / FAIL / PARTIAL, with the commit, platform and instance.
2. **Checks**: a table of check | command | result | evidence path.
3. **Deployed-environment differences**: the cannot-reproduce list, plus anything specific to this change.
4. **Findings**: ranked blocker / should-fix / nit, each with a file:line.
5. **Needs the user**: approvals, expired credentials, decisions.

## Common mistakes

| Mistake | Instead |
|---|---|
| Writing a plan and calling it verification | Run the commands; report what they printed |
| "Unit tests pass" as proof of an LLM or cloud fix | Those tests mock the client. Drive it locally with failure injection, and probe for real only with approval |
| Fixing data with SQL to get unstuck | Find the UI or API path; report the gap |
| Forgetting cleanup after a failed run | `$CC cleanup` is always safe |

## Keeping this skill true

- New or renamed pipeline step: extend the parity/wiring check so an uncovered step fails.
- New failure mode found while verifying: add a probe spec or UI flow so it is repeatable.
- A documented command fails: fix the CLI, not the report.
