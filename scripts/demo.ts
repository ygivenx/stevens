import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';

const PORTS = [8787, 8788, 5173, 5174];

function portFree(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const probe = connect(port, '127.0.0.1');
    probe.on('connect', () => {
      probe.end();
      resolve(false);
    });
    probe.on('error', () => resolve(true));
  });
}

async function healthy(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const replay = join(process.cwd(), 'fixtures', 'replay');
  for (const name of ['firm.jsonl', 'personal.jsonl', 'now.txt']) {
    if (!existsSync(join(replay, name))) throw new Error('fixtures/replay/' + name + ' is missing; run stevensctl record-replay first');
  }
  for (const port of PORTS) {
    if (!(await portFree(port))) throw new Error('port ' + port + ' is held; stop that stack before the demo');
  }
  const data = join('/tmp', 'stevens-verify', 'demo', 'data');
  rmSync(join('/tmp', 'stevens-verify', 'demo'), { recursive: true, force: true });
  for (const side of ['firm', 'personal']) {
    mkdirSync(join(data, side), { recursive: true });
    cpSync(join(replay, side + '.jsonl'), join(data, side, 'ledger.jsonl'));
    writeFileSync(join(data, side, 'meta-fake.json'), JSON.stringify({ mode: 'normal' }));
    writeFileSync(join(data, side, 'meta-calls.json'), JSON.stringify({ count: 0 }));
  }
  const env = { ...process.env };
  env.STEVENS_DATA_DIR = data;
  env.STEVENS_REPLAY = '1';
  env.STEVENS_NOW = readFileSync(join(replay, 'now.txt'), 'utf8').trim();
  env.FIRM_DATABASE_URL = '';
  delete env.MODEL_API_KEY;
  console.log('demo: serving the recorded run from ' + data);
  const child = spawn('npm', ['run', 'dev'], { cwd: process.cwd(), env, stdio: 'inherit' });
  const stop = () => {
    child.kill('SIGTERM');
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  const checks = ['http://localhost:8787/api/health', 'http://localhost:8788/api/health', 'http://localhost:5173/', 'http://localhost:5174/'];
  for (let i = 0; i < 90; i++) {
    const results = await Promise.all(checks.map(healthy));
    if (results.every(Boolean)) break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  const results = await Promise.all(checks.map(healthy));
  if (!results.every(Boolean)) {
    child.kill('SIGTERM');
    throw new Error('demo stack did not turn healthy in 180s');
  }
  console.log('demo: both apps are up; opening the two-screen harness');
  const page = join(process.cwd(), 'web', 'demo.html');
  if (process.platform === 'darwin') spawn('open', [page], { stdio: 'ignore', detached: true }).unref();
  else if (process.platform === 'linux') spawn('xdg-open', [page], { stdio: 'ignore', detached: true }).unref();
  else console.log('demo: open ' + page);
  await new Promise<void>((resolve) => {
    child.on('exit', () => resolve());
  });
}

void main().catch((err) => {
  console.error('demo: ' + String(err instanceof Error ? err.message : err));
  process.exit(1);
});
