# Stevens — Research Notes

Date: 2026-10-26. Sources inspected live this session unless noted.

Background research. Where a "Stevens mapping" below disagrees with [SPEC.md](SPEC.md) (v2), SPEC.md wins.

## 1. Hackathon constraints (participant guide, local file)

- Tracks: Build for Your World / Push the Frontier. Stevens fits Build for Your World.
- Must use Meta models: Muse Spark series, Muse Wonder, Muse Image, Muse Voice
  Transcribe, SAM 3.1 via Meta Model API, or open weights (Muse Glimmer, Muse Spark Open).
- Anti-projects to avoid: medical-advice bots, Basic RAG Applications, Simple Image
  Analyzers, education chatbots, job screeners, nutrition coaches, personality/sports
  analyzers, political/war content. Stevens must therefore lead with verifiable,
  permission-aware decisions — not "RAG over your notes."
- Judging: Impact 30%, Use of Meta AI Tooling 25%, Technical Depth 20%, Demo 25%.
  Stage One is pass/fail on real Meta API / open-weight usage.
- Submission: Nov 4, 9 PM ET; public repo; new work only (honest git history);
  3-minute demo video is a primary artifact; team max 4; $150 Meta API credits per person.

## 2. Meta Engineering — Organizational Second Brain (Sep 2, 2026)

Source: https://engineering.fb.com/2026/09/02/ml-applications/organizational-second-brain-ai-learns-from-experts/

- Agent = secondary expert for a domain; knowledge is preserved and shared.
- Two layers: (a) structured, auditable knowledge architecture separating WHAT the
  agent knows from HOW it reasons; (b) self-improvement loop compiling expert
  corrections back into knowledge.
- Offline process digests sources into 200+ structured knowledge files ahead of time;
  "recipes" encode step-by-step procedures mirroring specialist reasoning.
- Human in control: intermediate reasoning surfaces at checkpoints where experts
  confirm, correct, or redirect.
- Stevens mapping: personal second brain — vault (knowledge) + firm recipes
  (reasoning) + approval loop writing corrections back, versioned.

## 3. Meta Model API — Muse Spark 1.1 (Jul 9, 2026)

Source: https://ai.meta.com/blog/introducing-muse-spark-meta-model-api/

- Multimodal reasoning model for agentic tasks; gains in tool/computer use, coding,
  multimodal understanding. 1M-token context actively managed (remember, retrieve,
  compact). Trained to orchestrate multi-agent systems: main agent plans, delegates
  to parallel subagents.
- Available via Meta Model API public preview; "Thinking" mode in Meta AI app.
- Stevens mapping (v2, SPEC.md § Models): Spark 1.3 = vision + claim extraction;
  Wonder 1.0 = bridge, brief and answer if it wins the day-1 A/B; Voice Transcribe =
  talk transcripts; SAM 3.1 = stretch only. Version confusion online (Spark vs 1.1 vs Open
  vs 1.3) is a research hygiene risk — always cite the exact version.

## 4. Personal Agent Protocol + Secure VM / Sentinel (Oct 2026, secondary reporting)

- Meta + Sierra Personal Agent Protocol (announced Oct 6, 2026; partners incl.
  Genesys, Rocket, Shopify, Stripe, Walmart): OAuth-based standard for how a personal
  agent authenticates with businesses and what actions are permitted. Sessions:
  guest → read-only → write, user + business each consent; v0.1 spec Oct 2026.
- Meta Muse consumer agent: per-user dedicated Secure VM holding agent, browser,
  data, credentials; credentials usable but never visible to the agent; Sentinel
  second agent (system-separated) must approve internet-bound actions and asks the
  user for sensitive steps.
- Stevens mapping: PAP-style scope chips (read-only CRM, blocked conflicts write) +
  Sentinel-style approval gate. Demo simulates gates; production path is the standard.

## 5. Modal sandboxes (inference partner, hackathon guide)

- Isolated ephemeral environments for untrusted/model-generated code; gVisor-class
  isolation, egress controls, per-session sandboxes, GPU access. Partner offers
  $100 credits + docs for running Meta open-weight models.
- Correction to earlier shorthand: standard Modal sandboxes are gVisor-isolated,
  not full microVMs; true kernel isolation (Firecracker/Kata) is the stricter tier.
- Stevens mapping: not used in the hackathon build (SPEC.md non-goals).

## 6. GitHub AI Trending — 4-Month Catch-Up (local file, Jun 14–Oct 14, 2026)

24 breakout repos; dated/vendor-labeled star snapshots — cite patterns, never numbers.

1. Skills became the artifact: SKILL.md packs out-gained frameworks (superpowers
   231k+, official Anthropic/Microsoft skill repos). → Stevens ships firm recipes
   as versioned skills.
2. Chinese labs led open weights: Kimi K3 2.8T, Qwen3.8-Max 2.4T, Hy3, DeepSeek
   V4-Flash (MIT). US: Inkling, Meta Muse Glimmer (30B, single-GPU, local agents).
3. Framework turnover: DeepSeek Harness plugin-everything became reference design;
   note CVSS 9.4 CVE in its launch window — plugin ecosystems carry auth risk.
4. Memory fragmented: claude-mem, OpenViking (tiered L0/L1/L2), hindsight, others.
   No winner. → Stevens states a defensible choice: event ledger + tiered recall.
5. Agent security mainstream: NVIDIA OpenShell (sandbox, credential broker, policy
   prover), Microsoft governance toolkit, Strix. Validates sandbox+gate+scopes trio.
6. Retrieval went structural: Graphify, PageIndex — follow document/code structure,
   tag edges EXTRACTED vs INFERRED. → Stevens citation badges: Fact vs Inference.
7. Local inference kept pace: quantization, Apple Silicon serving, SSD-streamed MoE.
8. Voice went local/open: VoiceStudio, VibeVoice. → voice capture path is expected,
   must work end-to-end (use Muse Voice Transcribe for judging credit).

## 7. Design conclusions for Stevens (v2, 2026-10-26)

- Thesis: a chief of staff that links off-the-clock learning to work decisions under
  two boundaries (personal ↔ work, agent ↔ viewer role), enforced in code. Full
  design: SPEC.md.
- Kept from v1: event ledger with cached API payloads; Fact vs Inference citations;
  role-gated withholding; human approval.
- Dropped from v1: learning ranker, protected time, delegation ledger, Modal, cost
  total as a demo beat.
- Honesty rule: real Meta calls on the critical path (Voice + Spark vision);
  everything simulated is labeled. Judges reward surfaced Meta capabilities, punish
  fake depth.
