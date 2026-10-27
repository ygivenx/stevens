#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
say -v Samantha -o talk-part1.aiff "Thanks for coming to my talk on mid-market SaaS benchmarks. In this category, mid-market churn runs six to eight percent annually. Anyone quoting under two percent is measuring something else."
say -v Daniel -o talk-part2.aiff "Quick question. Does that six to eight percent include downgrades, or logo churn only?"
say -v Samantha -o talk-part3.aiff "Great question. That is logo churn only. Net revenue churn with expansion is a different story."
ffmpeg -y -loglevel error -i talk-part1.aiff -i talk-part2.aiff -i talk-part3.aiff -filter_complex "[0:a][1:a][2:a]concat=n=3:v=0:a=1" talk-full.wav
ffmpeg -y -loglevel error -i talk-full.wav -vn -ac 1 -ar 16000 talk-16k.wav
rm -f talk-part1.aiff talk-part2.aiff talk-part3.aiff talk-full.wav
