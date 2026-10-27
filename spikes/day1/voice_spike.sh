#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [ -z "${MODEL_API_KEY:-}" ]; then echo "set MODEL_API_KEY" >&2; exit 2; fi
curl -s -m 120 -w "\nHTTP:%{http_code}\n" "https://api.meta.ai/v1/asr/transcribe" -H "Authorization: Bearer $MODEL_API_KEY" -H "Accept: application/json" -F 'request={"model":"muse-voice-transcribe-1.0","audioEncoding":"WAV","mode":"DIARIZATION"};type=application/json' -F "audio=@talk-16k.wav;type=audio/wav"
