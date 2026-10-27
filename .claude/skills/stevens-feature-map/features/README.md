# Stevens feature map

One file per product area. Each file says what exists, how mature it is, how a user reaches it, and how to drive it through `stevensctl` (the verify-stevens skill, at `.claude/skills/verify-stevens/stevensctl`). Use the map to answer questions without re-reading the whole codebase. Use the source to settle anything the map does not cover or that may have changed.

Scope: the Stevens demo app as defined in SPEC.md v2.1: `shared/` (contracts), `server/` (Hono on :8787: vaults, boundary, pipeline, ledger, resolver, Meta client), `web/` (Vite on :5173), server-only `fixtures/`, `data/ledger.jsonl`, and `docs/`. It deliberately leaves out the hackathon submission mechanics, the video edit, and the scope-guard exclusions in AGENTS.md (SAM unless the day-1 condition triggers, learning ranker, Modal, live glasses streaming, auth/SSO, Muse Image, pi-durable except the stretch chat, agent and memory frameworks, vector stores, databases).

## Maturity rubric

Grade each sub-feature against the highest rung it fully meets. Every grade needs evidence (a file:line, a test name, or a `stevensctl` result).

| Grade | Meaning | Must be true |
|---|---|---|
| `planned` | In SPEC.md, no code | A SPEC.md section describes it; nothing is implemented; the evidence is the SPEC.md section |
| `deferred` | Out of scope by decision | Listed as deferred in AGENTS.md or a plan, or no code and a doc says later |
| `stub` | Code exists but does not do the job | Endpoint crashes, a UI branch can never render, a field is never populated, or the only caller is dead code |
| `api-only` | Works, but no UI reaches it | Route works when called. Nothing in the frontend calls it from a reachable page |
| `beta` | A user can reach it and the happy path works | Reachable from the UI. A known defect, an untested path, or missing coverage keeps it from `stable` |
| `stable` | Safe to rely on | Reachable from the UI, covered by passing tests, no open known defect, and driven live in the local stack (`Live` column has a date) |

Rules:
- Grade what the code does, not what docs or commit messages claim — except `planned`, which grades the SPEC alone.
- A known defect caps the grade at `beta`, however polished the rest is. Put the defect under Gotchas.
- Source-only review can propose `stable`, but only a live drive confirms it. Until then, write `beta (stable pending live)`.
- Role gating is part of the feature. If the UI shows a control that the API rejects for that role, it is a defect.
- Flags: a feature merged but off by default keeps its grade, and the row's `What` names the flag and its default. Code on an unmerged branch is not in the map; list it under "Unmerged" below.

## Deployed or not

Maturity describes the code at the commit in each file's `Last verified` line. Whether a deployed environment runs that code is a separate question. Each row has a `Since` column (the commit that introduced or last materially changed it). No deployed app exists and `stevensctl` has no status command for one, so the answer for app surfaces is always "not deployed". For the static Pages site, compare `docs/` against the snapshot below.

Snapshot (GitHub Pages, 2026-10-26):
- No Pages deploy yet. `docs/` exists locally only; enabling Pages needs the user's explicit go-ahead.

## Unmerged

None. No branches besides `main`, no PRs.

## Test evidence

"Tests pass" in this map means a local `stevensctl test` run at the file's `Last verified` commit. Day 1: the scaffold exists, so `server-state` is `stub` with `server/index.ts` as evidence; every other row stays `planned` with a SPEC.md section as evidence, except the stretch chat which is `deferred` until its go/no-go. No CI exists; `stevensctl` has no `ci status` until CI does.

## Baseline preconditions for driving

Every "Driving it" section assumes this, unless its own `Preconditions:` line says otherwise:

```bash
export STEVENS_VERIFY_INSTANCE=<task>   # your own instance: the default is shared by every session in this checkout
CC=.claude/skills/verify-stevens/stevensctl
$CC doctor                 # node, uv, ffmpeg, MODEL_API_KEY, GET /v1/models; if your instance is UP and you did not start it, pick another name
$CC stack up               # npm run dev: web on :5173 + server on :8787, waits for health
$CC seed                   # SPEC fixtures into server-only fixtures/ plus a fresh data/ledger.jsonl; synthetic data only
```

## Driving conventions

- One labelled bullet per sub-feature: **sub-feature-id**: action → exact command → observable result. The result must be something a check can see: an HTTP status, a JSON field, visible text, a row count.
- Prefer the user's surface. Use the browser driver for UI features, the API driver for API-only ones; the API driver sends `X-Viewer-Role` and reads ledger state via `GET /api/state`. No database exists, so there are no DB queries.
- If a state can only be reached by hand-editing `data/ledger.jsonl`, that is a finding.
- Locators: prefer role+name. When the UI has no accessible name, note it under Gotchas and use the documented fallback.
- Role checks: run the same action as each role with the expected failure status, or check the UI hides the control.
- Paid or shared services (LLM, cloud) are never called by default. A paid probe runs only after the user agrees to the cost.
- Synthetic data only. Never put real identifiers in the map or in evidence.

## Proof and skip reporting

For each sub-feature you drive, record one line:

```
<sub-feature-id>  PASS|FAIL|SKIP  <evidence path or observed value>  <one-line reason if FAIL/SKIP>
```

Evidence lands in `$($CC evidence dir)`, per instance, and survives `cleanup` but not a reboot. A SKIP needs a reason ("needs a cloud workspace", "needs user approval for cost"). Never write PASS for something you only read about.

## Feature entry contract

Every feature file has this shape, in this order:

```markdown
# <Area name>

Last verified: <commit sha12> on <YYYY-MM-DD> (<source | live>)

<One paragraph: what the area is for, which roles use it, where it lives in the UI, overall maturity.>

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| area-thing | ... | beta | UI+API | 8f2676b6 | 2026-10-05 / not driven | `path/router.py:42`, `tests/test_x.py::test_y` |

## How to get to it (user POV)

<Numbered steps from login, with on-screen labels in quotes.>

## Driving it

Preconditions: <baseline, plus anything else>

- **area-thing**: <action> → `stevensctl ...` → <observable result>

## Gotchas

- <defects, traps, things that look broken but are by design. Each with a file:line.>
```

Table rows have exactly 7 cells (`render-map` fails on any other count). `Surface` starts with `UI`, `API`, `WS` or `infra`. `Live` is `<date>`, `<date> FAIL`, or `not driven`. IDs are kebab-case, prefixed with the area, and stable. Rename only together with every reference in `multi-surface-journeys.md`. Areas with no UI (infra, runtime services) say "no user path" under How to get to it.

## Index

| File | Area | Roles | Overall (2026-10-26) |
|---|---|---|---|
| [capture.md](capture.md) | Glasses captures and fixtures into the two vaults | all | planned |
| [extraction.md](extraction.md) | Transcript/photo text to structured claims + citation resolver | all | planned |
| [bridge.md](bridge.md) | Personal claims bearing on work claims | all | planned |
| [policy.md](policy.md) | Rules table + exhaustive test | all | planned |
| [assembler.md](assembler.md) | Context assembler, manifests, token budget | all | planned |
| [privy.md](privy.md) | Privy verdict channel + escalation, fail closed | Associate, Partner | planned |
| [release.md](release.md) | Personal → firm release gate | Associate, Partner | planned |
| [drafts.md](drafts.md) | Unprompted brief + Q&A answer | Associate, Partner | planned |
| [inspector.md](inspector.md) | Boundary inspector over every model call | Associate, Partner | planned |
| [approval.md](approval.md) | Role switch + approve/reject with logging | Associate, Partner | planned |
| [ledger.md](ledger.md) | Durable pipeline ledger + replay | all | planned |
| [server.md](server.md) | Stevens API, media route, SSE | all | stub |
| [chat.md](chat.md) | Follow-up chat (gated stretch) | Associate, Partner | deferred |

## Sweep order

Areas build on each other's data. Sweep in this order so each one starts with what it needs:

1. capture
2. extraction
3. ledger
4. server
5. policy
6. assembler
7. bridge
8. drafts
9. privy
10. release
11. inspector
12. approval
13. chat

Run this after a feature change, or when a freshness check finds drift.
