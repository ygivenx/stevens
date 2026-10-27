# Day 1 spikes (Oct 27)

Goal: prove both perception gates, pick the reasoning tier, and check stretch tooling before building. Everything here ran against `https://api.meta.ai/v1` with the hackathon key. Total spend ≈ $0.10 of $150. Decisions landed in `SPEC.md`; this file is the lab notebook with exact requests, responses, IDs, and costs.

## Placeholders

`talk-16k.wav` (22.6 s, 16 kHz mono) is macOS `say` in two voices (Samantha speaks, Daniel asks, Samantha answers), concatenated with ffmpeg — see `make_placeholders.sh`. `slide.jpg` and `deck.jpg` are PIL renders of the talk slide and the Helios deck — see `make_slides.py`. All content is fictional.

Limits, stated plainly: the audio is studio-clean TTS, not glasses-mic audio of a distant speaker; the images are clean renders, not wide-angle projector photos. The real-mic and real-photo tests ride with the day-2 final fixtures.

## 1. Voice endpoint discovery → `POST /v1/asr/transcribe`

SPEC assumed Voice was not on Responses/Chat but did not know the endpoint. Probes with the API key, all before the docs find:

| Probe | Result |
|---|---|
| `POST /v1/audio/transcriptions` (multipart and JSON body) | 404, empty body |
| `POST /v1/voice/transcribe`, `/v1/audio/transcribe`, `/v1/voice/transcriptions`, `/v1/transcriptions`, `/v1/speech/transcriptions`, `/v1/speech-to-text`, `/v1/audio/speech-to-text` | 404, empty body |
| `POST /v1/asr/duplex` with JSON | 404, empty body |
| `GET /v1/asr/duplex` (plain and with websocket upgrade headers) | 400, empty body |
| Responses API with `model: muse-voice-transcribe-1.0` + audio input | 404 `model_not_found` |
| `muse voice transcribe talk-16k.wav` (CLI, subscription OAuth) | accurate plain text, but no timestamps or speakers — not the server path |

The docs (`dev.meta.ai/docs/api-reference/voice/transcribe`) give the answer: `POST /v1/asr/transcribe` takes multipart `request` JSON plus the `audio` clip, and `Accept` selects JSON, an event stream, or plain text. WAV only, 10 minutes and 32 MB max. Turn-level timestamps; no word-level timestamps.

`voice_spike.sh` sends mode `DIARIZATION` and got HTTP 200:

```json
{"sessionId":"voyager/transcribe/085F3C8A6E3D460D9283B18F7DD45078","transcript":"Thanks for coming to my talk on mid-market SaaSS benchmarks. In this category, mid-market churn runs six to eight percent annually anyone quoting under under 2% is measuring something else quick question does does that six to eight percent include downgrades or logo churn only great question that is logo churn only net revenue churn with expansion is a different story","audioDurationMs":22560,"turns":[{"turnId":0,"startMs":60,"endMs":11100,"transcript":"Thanks for coming to my talk on mid-market SaaSS benchmarks. In this category, mid-market churn runs six to eight percent annually anyone quoting under under 2% is measuring something else","speaker":"A"},{"turnId":1,"startMs":11420,"endMs":16620,"transcript":"quick question does does that six to eight percent include downgrades or logo churn only","speaker":"B"},{"turnId":2,"startMs":16860,"endMs":22060,"transcript":"great question that is logo churn only net revenue churn with expansion is a different story","speaker":"A"}]}
```

Diarization split all three turns correctly (A/B/A). Warts: "SaaSS", doubled "under under" and "does does" — acceptable on synthetic audio. Cost: 22.56 s = 0.00627 h × $0.18 = $0.0011. Gate 1 green.

## 2. Vision gate → `vision_spike.py`

Responses API, `muse-spark-1.3`, `low` effort, prompt "Transcribe every word visible in this photo verbatim, in reading order. Return only the transcribed text."

`slide.jpg` → `resp_6ae01c0965a69e95b93d4b2d`, in 1227 / out 829:

```
Mid-Market SaaS Benchmarks 2026
Logo churn 6-8% annually
Net churn under 2% = check the definition
Source: fictional conference talk
Speaker 2, Oct 20 talk
```

`deck.jpg` → `resp_6ae01c0c7e17305cdae8493b`, in 1227 / out 751:

```
Helios Series B Deck (fictional)
Net churn: 1.8%
NDR 118% Logo retention: 96%
Mid-market motion, Q3 2026
```

Near-verbatim; the model drops some colons, so the day-3 resolver must normalize before verbatim matching. Cost: $0.0051 + $0.0047. Gate 2 green.

## 3. Strict JSON-schema output → `schema_spike.py`

Responses `text.format` with `json_schema` strict honored: the claim extraction returned exact keys, parsed cleanly. `resp_6ae01c164f546c9f92d84ee3`, in 46 / out 546, cost $0.0024. zod still validates every structured response.

## 4. Wonder vs Spark A/B → `ab_spike.py`

Same prompts on both models at `high` effort. Bridge prompt: personal claim "mid-market churn in this category runs 6-8%" (Oct 20 talk, Speaker 2) vs work claim "net churn of 1.8%" (Helios deck); reply with one word plus a one-sentence reason. Privy prompt: partner-only conflicts memo (Helios vs Lumen, fictional) plus "Should the Associate take the second meeting?"; reply with one word plus a reason that reveals nothing.

| Run | Model | Response ID | In/out | Output |
|---|---|---|---|---|
| bridge | spark-1.3 | `resp_6ae01c25972becf62da7441a` | 96 / 2117 | context — "The category average provides background but uses different scope and metric than the company-specific net figure." |
| bridge | wonder-1.0 | `resp_6ae01c312e4ecd5575214646` | 96 / 1229 | context — "The 6-8% figure is a category mid-market churn benchmark while the deck claims company net churn, so the different scopes and net-versus-gross basis provide context rather than direct confirmation or contradiction." |
| privy free | spark-1.3 | `resp_6ae01c3719973ce2e6344136` | 95 / 1692 | "hold. Please pause to confirm internal priorities before scheduling anything further." |
| privy free | wonder-1.0 | `resp_6ae01c3fcca070e1edd0441a` | 95 / 896 | "hold. A brief pause is the most prudent approach for now." |
| privy schema | spark-1.3 | `resp_6ae01c4278aeb4a832f7450b` | 110 / 929 | `{"routeTo":"Partner","verdict":"hold"}` |
| privy schema | wonder-1.0 | `resp_6ae01c4b6ec8acde32d94368` | 110 / 954 | `{"routeTo": "Partner", "verdict": "hold"}` |

Both models got every label right and neither leaked memo content. Wonder won narrowly on the bridge (it named the net-vs-gross basis; Spark's reason was vaguer) and tied on privy. Call volume is tiny (prefiltered candidates, one privy call per question), so Wonder's premium is immaterial: this A/B cost $0.0091 + $0.0250 + $0.0073 + $0.0183 + $0.0041 + $0.0195. Verdict: keep Wonder for bridge, privy, and writers; Spark `high` stays the one-line fallback.

## 5. Contributor tier for extraction → `contrib_spike.py`

Same claim-extraction prompt on Spark and `muse-spark-1.3-contributor`, both `low` with strict schema. Identical JSON from both: entity "mid-market", metric "churn", value "6-8%", quote "mid-market churn in this category runs 6-8%." (`resp_6ae01c592553ed2da38646f8`, 52/479, $0.0021 vs `resp_6ae01c5c96b781cb26c04f26`, 52/520, contributor price unlisted and assumed at or below Spark.) Verdict: contributor takes extraction.

## 6. Tool calling via pi-ai Meta provider → `tool_spike.ts`

`@earendil-works/pi-ai@1.4.0`, `builtinModels()`, model `meta/muse-spark-1.3`, `META_API_KEY` set from the hackathon key, one `get_quote({claimId})` tool. Observed: model found in catalog, `TOOLCALLED: get_quote {"claimId":"c1"}`, `DONE: toolUse`, final blocks `thinking,text,toolCall`. Usage was not metered by the script (one short Spark call). Verdict: the tooling half of the stretch go/no-go is GO; the other half is the day-5 exit check by Oct 31.

## Rerun

```bash
cd spikes/day1
./make_placeholders.sh
uv run --with pillow python3 make_slides.py
export MODEL_API_KEY=$(grep "^MODEL_API_KEY=" ../../.env.local | cut -d= -f2-)
./voice_spike.sh
uv run --with openai python3 vision_spike.py
uv run --with openai python3 schema_spike.py
uv run --with openai python3 ab_spike.py
uv run --with openai python3 contrib_spike.py
```

`tool_spike.ts` needs its own scratch dir (`npm i @earendil-works/pi-ai@1.4.0 tsx`, `META_API_KEY=$MODEL_API_KEY npx tsx tool_spike.ts`) so stretch-only packages stay out of the root `package.json`. Rerunning everything costs about $0.10. No script prints the key.

## Spend

| Call | Tokens in/out | Cost |
|---|---|---|
| Voice DIARIZATION (22.6 s) | 0.00627 h audio | $0.0011 |
| Vision slide | 1227 / 829 | $0.0051 |
| Vision deck | 1227 / 751 | $0.0047 |
| Schema probe | 46 / 546 | $0.0024 |
| A/B bridge Spark | 96 / 2117 | $0.0091 |
| A/B bridge Wonder | 96 / 1229 | $0.0250 |
| A/B privy Spark | 95 / 1692 | $0.0073 |
| A/B privy Wonder | 95 / 896 | $0.0183 |
| A/B verdict Spark | 110 / 929 | $0.0041 |
| A/B verdict Wonder | 110 / 954 | $0.0195 |
| Extraction Spark | 52 / 479 | $0.0021 |
| Extraction contributor | 52 / 520 | ≤ Spark |
| pi-ai tool call | unmetered | small |
| **Total** | | **≈ $0.10** |

Spark priced at $1.25 / $4.25 per 1M tokens, Wonder at ~$4 / $20 per secondary sources, Voice at $0.18/hour.
