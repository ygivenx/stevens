---
name: meta-ecosystem
description: Build and reason about the Meta AI ecosystem — Meta Model API models, Muse Spark, Muse Image, Muse Voice Transcribe, SAM 3.1, open weights, and agent patterns for hackathons and production.
---

# Meta Ecosystem

Use when the task touches Meta AI models, the Meta Model API, or Meta agent patterns (Muse Spark / Image / Voice / SAM, Muse Wonder / Open / Glimmer, Personal Agent Protocol, Organizational Second Brain, Modal sandboxes). Covers model selection, API wiring, and Stevens hackathon mapping.

## Model catalog — pick by job

All hosted models share one credential (`MODEL_API_KEY`) and one base URL. Open-weight models are local, not on the API.

| Model ID | Job | Notes |
| --- | --- | --- |
| `muse-spark-1.3` (also `1.2`, `1.1`) | General agentic reasoning, coding, multimodal | 1M-token context with active compaction. Default for agents. |
| `muse-spark-1.3-contributor` (`1.2-contributor`) | High-volume contributor / helper turns | Cheaper throughput tier of Spark. Check hackathon credit math (see below). |
| `muse-wonder-1.0` | Frontier reasoning | Largest Muse tier. Use when Spark quality is insufficient. Confirm live ID via `GET /models`. ~$4 in / $20 out per 1M tokens per secondary sources (verify in the dashboard); image/audio input reported inconsistently, so send text. |
| `muse-image-1.0` | Image generation + editing | Agentic: plans, searches, writes/executes code, self-refines. Multi-reference composition. |
| `muse-voice-transcribe-1.0` | Speech-to-text | Real-time streaming + batch, speaker diarization (20+ voices), end-of-speech detection inside the model. |
| `sam-3.1` | Segmentation / tracking | Promptable concept segmentation for image + video. |

Open weights (not callable on Meta Model API — self-host):

- **Muse Spark Open** — open release of Spark. Use via Hugging Face / the Meta Models repo when self-hosting is required.
- **Muse Glimmer** (30B) — open-weight, single-GPU, aimed at local agents. Weights on Hugging Face. Never list it as an API model; it will 404 on `api.meta.ai`.

Rules:

- Always cite the exact version (`muse-spark-1.1` vs `1.2` vs `1.3`). Version confusion is the top research-hygiene failure. Verify the live list with `GET https://api.meta.ai/v1/models` before hardcoding.
- Default to the newest Spark available in the account. Fall back `1.3 → 1.2 → 1.1` only if the ID is rejected.
- One API key serves Spark, Image, Voice, and SAM. Do not create per-model keys.

Sources: [Muse Spark 1.1 announcement](https://ai.meta.com/blog/introducing-muse-spark-meta-model-api/), [Build with Muse Spark (dev guide)](https://dev.meta.ai/resources/blog/build-with-muse-spark/), [Muse Image and Video](https://ai.meta.com/blog/introducing-muse-image-muse-video-msl/).

## Meta Model API — quickstart

- Base URL: `https://api.meta.ai/v1`
- Auth: `MODEL_API_KEY` from [dev.meta.ai/api-keys](https://dev.meta.ai/api-keys/). Pass it explicitly — the OpenAI SDK otherwise reads `OPENAI_API_KEY` and sends the wrong key.
- Compatibility: drop-in OpenAI SDK (Chat Completions + Responses) and Anthropic SDK (Messages). No Meta-specific SDK required.
- Pricing (Spark, public preview): **$1.25 input / $4.25 output per 1M tokens**. Voice Transcribe: **$0.18/hour** ($3.00 / 1,000 min). Confirm current pricing in the dashboard before budgeting.

Minimal Responses call (stateful, recommended for agents):

```python
import os
from openai import OpenAI

client = OpenAI(
    base_url="https://api.meta.ai/v1",
    api_key=os.environ["MODEL_API_KEY"],
)
resp = client.responses.create(
    model="muse-spark-1.3",
    input="Explain a tool-call loop in one sentence.",
)
print(resp.output_text)
```

Protocol choice:

- **Responses API** — server holds conversation state via `previous_response_id`; built-in tools (`{"type": "web_search"}` for live cited search). Use for multi-turn agents.
- **Chat Completions** — stateless; you manage the message list. Use for simple one-shots or when porting OpenAI code verbatim.
- **Messages (Anthropic format)** — same host `api.meta.ai/v1`, `MODEL_API_KEY` as token; state is client-side (no `previous_response_id`). Use when the harness is Claude Code / Anthropic-SDK shaped.

Patterns that matter:

- Spark is a **reasoning model**: control depth with `reasoning_effort` (`minimal` → `xhigh`). Reasoning tokens bill as output (`usage.completion_tokens_details.reasoning_tokens`). Match effort to task — `minimal` for routing/classification, `high`/`xhigh` for coding and decisions.
- Prefer a `developer` message over `system` for standing rules, tone, and output format.
- Built-in `web_search` returns inline citations with no RAG stack. Surface those citations in the UI; do not rebuild retrieval for freshness-only needs.
- Spark is trained for **multi-agent orchestration**: main agent plans, delegates to parallel sub-agents, and knows when to escalate back. Scope each profile declaratively (e.g., planner gets `plan`/`clarify` only, no `file`/`shell`; builder gets `file`/`shell`). Never give every agent every tool.
- Spark zero-shot generalizes to native tools, MCP servers, and custom skills. Register tools/MCP normally; no special adapter needed.
- Streaming and prompt caching are supported — use them for long sessions; see the Cookbook recipes for the wire details.

Agent CLIs: OpenCode ships a built-in Meta provider (`/connect` → Meta → paste key → pick Muse Spark). Any other OpenAI-compatible CLI works by adding a custom provider with the three values above.

## Model-specific notes

### Muse Spark (1.1 / 1.2 / 1.3)

- Multimodal in one call: image, audio, video, PDF + text. Use a single Spark call for "look at this deck photo and reason about it" instead of chaining a vision model + LLM.
- 1M context is actively managed (remember / retrieve / compact). Still checkpoint long runs; do not assume infinite faithful recall.
- Strengths: tool/computer use, repo-level coding, frontend/design, structured output, parallel tool calling. For computer use, run the desktop in a throwaway sandbox — model sees screenshots, returns mouse/keyboard actions; never let it drive the host machine.
- Hackathon credit rule of thumb: $150 in Meta API credits ≈ 35M Spark 1.3 output tokens or ≈ 750M contributor output tokens. Budget the demo around real calls, not mocked volume.

### Muse Image

- Not a one-shot text-to-image call. It plans, invokes search (for factual/current subjects) and code execution (plots, QR codes), then self-refines. Allow extra latency and test-time compute for quality prompts.
- Compose from multiple reference images; edits are precise and instruction-faithful. Pass references explicitly; state which reference controls what.
- Pair with Spark: Spark plans / writes copy, Image generates / refines visuals, shared tools. Good for animated GIFs, sites with embedded images, interactive visuals.

### Muse Voice Transcribe

- One model for streaming ASR + diarization + endpointing. Diarization and turn detection happen inside the recognizer, not as a post-pass.
- Same price live or batch. Use streaming for live dictation / voice notes; batch for finished recordings.
- Speech-to-text only (no TTS). For Stevens: transcribes glasses-captured talks; speaker labels and timestamps become citation anchors (SPEC.md § Models). Quick local check: `muse voice transcribe <file.wav|m4a>`.

### SAM 3.1

- Promptable concept segmentation: text (open-vocabulary short noun phrases), image exemplar, or bounding box. The Meta Model API currently accepts **text prompts only** — design around that; do not promise exemplar/box via the API.
- 3.1 adds **Object Multiplex**: objects processed jointly in 16-object buckets with shared memory, ~7× faster at 128 objects on one H100; video tracking accuracy improves on most VOS benchmarks. Drop-in replacement for SAM 3 checkpoints.
- Use for: deck-photo segmentation, dataset annotation (reported 36% faster than human-only on positive prompts, ~5× on negative prompts), factory / surveillance item location, video object tracking.
- Evans-pattern mapping: SAM isolates the artifact (deck slide, screenshot region, video object); Spark reasons over the isolated content.

### Muse Wonder / Open / Glimmer

- **Wonder** (`muse-wonder-1.0`): frontier tier behind the same endpoint. Use sparingly (cost/latency); A/B against Spark before adopting.
- **Spark Open**: self-hosted Spark when data residency or offline use requires it.
- **Glimmer** (30B): local agents on a single GPU (quantized / Apple Silicon serving patterns apply). Good narrated production path; not a drop-in API substitute.

## Organizational Second Brain pattern

From Meta Engineering's domain-expert agent. Use when building a Stevens-style "second brain" (personal vault + firm knowledge) or any high-stakes specialist agent: [An Organizational Second Brain](https://engineering.fb.com/2026/09/02/ml-applications/organizational-second-brain-ai-learns-from-experts/).

Four interlocking layers — remove any one and the others degrade:

1. **Structured knowledge (WHAT)** — Pre-compiled, not retrieved raw. An offline pass digests source docs into 200+ structured knowledge files ahead of time. Organize as a navigable filesystem with YAML frontmatter (triggering scenarios, dependencies, consumers) forming a bidirectional dependency graph. Contents:
   - *Routing indexes* — map input characteristics → relevant positions/procedures. Deterministic, auditable retrieval; do not rely on embedding similarity alone.
   - *Gateway files* — threshold tests the agent must pass before entering a specialized domain. Prevents applying expert knowledge where it does not belong.
   - Split wiki vs RAG by **density × frequency**: dense, frequently used positions go in the curated wiki; sparse, situational sources (specs, historical decisions, niche references) stay in semantic/lexical search (RAG).
2. **Recipes (HOW)** — Composable imperative procedures. Each recipe prescribes steps, which knowledge to load per step, decision procedures, and what counts as complete. Recipes reference knowledge files but contain **no domain facts**; knowledge files state positions but prescribe **no procedures**. Fix knowledge by editing a knowledge file; fix methodology by editing a recipe. Failure attribution becomes clean: wrong knowledge or wrong procedure?
   - Recipes compose (top-level routing recipe delegates to phase recipes) and enable **progressive disclosure**: each step loads only its own instructions + knowledge. Meta reports ~80% fewer tokens per turn vs a monolithic instruction file.
3. **Human-in-the-loop checkpoints** — Surface intermediate reasoning; experts confirm, correct, or redirect. Calibrate density to domain risk. Every correction/escalation is also training signal.
4. **Self-improvement loop (compilation)** — Treat maintenance as compilation: raw expert correction → diagnose root cause (extract signals + full knowledge manifest; apply one test: *could the agent have reached the right answer from its materials?* Yes → recipe problem; No → knowledge gap) → minimal verified edit → **independent adversarial review** (fresh-context agent sees only the diff; hunts contradictions, broken edge cases) → human reviews a proven PR diff → land it → auto-add the failing scenario + correct answer to the regression suite. Every fix permanently raises the bar.

Stevens mapping (SPEC.md v2): personal and enterprise vaults are compiled into structured claims before any reasoning; a human approval checkpoint; every citation tagged **Fact** (extracted) vs **Inference** (derived), mirroring structural retrieval practice. Recipes and the self-improvement loop are not in the hackathon build.

## Personal Agent Protocol, Secure VM, and Sentinel

Secondary reporting (Oct 2026); treat as production direction, simulate honestly in demos:

- **Personal Agent Protocol** (Meta + Sierra, v0.1 Oct 2026; partners incl. Genesys, Rocket, Shopify, Stripe, Walmart) — OAuth-based standard for how a personal agent authenticates with businesses and what actions are permitted. Sessions progress **guest → read-only → write**, with user + business each consenting. Design scope chips accordingly (e.g., "read-only CRM", "blocked: conflicts write").
- **Secure VM** — each user's agent, browser, data, and credentials live in a dedicated VM. Credentials are *usable but never visible* to the agent.
- **Sentinel** — a separate, system-isolated second agent that must approve internet-bound actions and prompts the user for sensitive steps.

Demo rule: simulate gates with explicit scope chips and an approval log; narrate PAP/Secure VM/Sentinel as the production path. Never claim the real protocol is wired if only the UI simulates it.

## Modal sandboxes

- Isolated ephemeral environments for untrusted / model-generated code (e.g., deck parsing). Standard Modal sandboxes are **gVisor-isolated, not full microVMs**; Firecracker/Kata is the stricter kernel-isolation tier. State which tier you actually use.
- Per-session sandbox, egress controls, GPU access. Hackathon partner credits available.
- Floor for a credible demo: one real sandboxed call. Narrate the microVM fleet as production path only if labeled as such.
- Stevens does not use Modal (SPEC.md non-goals).

## Hackathon rules for Stevens (Build for Your World)

From the workspace [RESEARCH.md](../../../RESEARCH.md) and [README.md](../../../README.md):

- Must use Meta models: Muse Spark series, Muse Wonder, Muse Image, Muse Voice Transcribe, SAM 3.1 via Meta Model API, or open weights (Muse Glimmer, Muse Spark Open). Stage One is pass/fail on real Meta API / open-weight usage.
- Judging: Impact 30%, Use of Meta AI Tooling 25%, Technical Depth 20%, Demo 25%.
- Avoid anti-projects: medical-advice bots, basic RAG apps, simple image analyzers, education chatbots, job screeners, nutrition coaches, personality/sports analyzers, political/war content. Lead with verifiable, permission-aware decisions — never "RAG over your notes."
- Submission: Nov 4, 9 PM ET; public repo; new work only with honest git history; 3-minute demo video is a primary artifact; team max 4; $150 Meta API credits per person.

Stevens design lives in [SPEC.md](../../../SPEC.md) (v2) and overrides anything in this skill. Flow: glasses capture → extract claims → bridge personal ↔ work → brief → privy verdict → answer via the context assembler → personal release gate → human approves. "Stevens drafts; the human decides."

## Honesty and correctness rules

- Label simulated vs real. Minimum bar: **real Meta calls on the critical path** (for Stevens: Voice Transcribe + Spark vision, the SPEC.md gates); everything else simulated must be labeled simulated. Judges reward surfaced Meta capabilities and punish fake depth.
- Never invent a model ID. If unsure, call `GET /v1/models` or check the model pages; never present Glimmer as API-callable.
- Cite the exact model version and the live doc. Model version drift (Spark vs 1.1 vs Open vs 1.3) is expected; the citation is the defense.
- Separate fact from inference in every answer the agent gives (citation badges: EXTRACTED vs INFERRED).
- When a Meta capability is unreachable in the environment (no key, wrong region — preview is US-first), keep the real call primary and guarded, with labeled sample fallback. Never ship code whose only data path is a sample.

## Quick decision guide

- Need reasoning / coding / tool use → Spark. Need the strongest reasoning → try Wonder, measure against Spark.
- Need an image (generate or edit) → Muse Image. Need to *locate/segment* something in an image or video → SAM 3.1, then Spark to reason over the segment.
- Need speech as text (live or recorded, multi-speaker) → Muse Voice Transcribe.
- Need it offline / on-device / single GPU → Glimmer (or Spark Open for larger self-hosted runs).
- Need institutional expertise that compounds → Second Brain pattern above, not bigger prompts.
