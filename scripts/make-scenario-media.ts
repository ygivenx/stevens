import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const HELP = `make-scenario-media: generate staged fixture media for a scenario.

Usage: npx tsx scripts/make-scenario-media.ts --scenario forge|mercy [--src DIR] [--out DIR]

Reads <src>/talk.json ([{voice, text}] turns), <src>/slide.html and <src>/deck.html,
then writes talk.wav (macOS say + ffmpeg, 16 kHz mono) and 1280x720 slide.jpg and
deck.jpg (Playwright screenshot). Defaults: src is fixtures/<scenario>/media_src,
out is fixtures/<scenario>. Outputs are staged fixtures; transcripts and vision
text still come from live model calls.`;

interface TalkTurn { voice: string; text: string }

function flag(name: string): string | null {
  const at = process.argv.indexOf(name);
  return at >= 0 && at + 1 < process.argv.length ? process.argv[at + 1] : null;
}

function renderAudio(src: string, out: string): void {
  const turns = JSON.parse(readFileSync(join(src, 'talk.json'), 'utf8')) as TalkTurn[];
  const work = mkdtempSync(join(tmpdir(), 'stevens-talk-'));
  try {
    const parts: string[] = [];
    turns.forEach((turn, index) => {
      const part = join(work, 'turn' + index + '.aiff');
      execFileSync('say', ['-v', turn.voice, '-o', part, turn.text]);
      parts.push(part);
    });
    const list = join(work, 'list.txt');
    writeFileSync(list, parts.map((part) => "file '" + part.replace(/'/g, "'\\''") + "'").join('\n') + '\n');
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-ar', '16000', '-ac', '1', join(out, 'personal', 'talk.wav')]);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

async function renderImage(src: string, out: string, name: string, dest: string): Promise<void> {
  const html = join(src, name + '.html');
  if (!existsSync(html)) return;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto('file://' + html, { waitUntil: 'networkidle' });
    await page.screenshot({ path: join(out, dest, name + '.jpg'), type: 'jpeg', quality: 85 });
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log(HELP);
    return;
  }
  const scenario = flag('--scenario') ?? process.env.STEVENS_SCENARIO ?? '';
  if (scenario !== 'forge' && scenario !== 'mercy') throw new Error('need --scenario forge|mercy');
  const src = flag('--src') ?? join(process.cwd(), 'fixtures', scenario, 'media_src');
  const out = flag('--out') ?? join(process.cwd(), 'fixtures', scenario);
  if (!existsSync(join(src, 'talk.json'))) throw new Error(src + '/talk.json is missing');
  mkdirSync(join(out, 'personal'), { recursive: true });
  mkdirSync(join(out, 'enterprise'), { recursive: true });
  renderAudio(src, out);
  await renderImage(src, out, 'slide', 'personal');
  await renderImage(src, out, 'deck', 'enterprise');
  console.log('media: wrote talk.wav, slide.jpg and deck.jpg for ' + scenario);
}

void main().catch((err) => {
  console.error('media: ' + String(err instanceof Error ? err.message : err));
  process.exit(1);
});
