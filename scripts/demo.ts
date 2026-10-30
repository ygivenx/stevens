import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';

const SCENARIOS: Record<string, { fixtures: string; firm: number; personal: number; yoursWeb: number; firmWeb: number; owner: string; ownerName: string; ownerTitle?: string }> = {
  helios: { fixtures: 'fixtures', firm: 8787, personal: 8788, yoursWeb: 5173, firmWeb: 5174, owner: 'p-alex', ownerName: 'Alex Rivera' },
  forge: { fixtures: 'fixtures/forge', firm: 8887, personal: 8888, yoursWeb: 5273, firmWeb: 5274, owner: 'p-rae', ownerName: 'Rae Delgado', ownerTitle: 'Staff Engineer' },
  mercy: { fixtures: 'fixtures/mercy', firm: 8987, personal: 8988, yoursWeb: 5373, firmWeb: 5374, owner: 'p-amara', ownerName: 'Dr. Amara Osei', ownerTitle: 'Oncologist' },
};

function scenarioArg(): string {
  const flag = process.argv.indexOf('--scenario');
  if (flag >= 0 && flag + 1 < process.argv.length) return process.argv[flag + 1];
  return process.env.STEVENS_SCENARIO ?? 'helios';
}

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
  const scenario = scenarioArg();
  const stack = SCENARIOS[scenario];
  if (!stack) throw new Error('unknown scenario ' + scenario + ' (helios|forge|mercy)');
  const replay = join(process.cwd(), stack.fixtures, 'replay');
  for (const name of ['firm.jsonl', 'personal.jsonl', 'now.txt']) {
    if (!existsSync(join(replay, name))) throw new Error(stack.fixtures + '/replay/' + name + ' is missing; run stevensctl record-replay first');
  }
  for (const port of [stack.firm, stack.personal, stack.yoursWeb, stack.firmWeb]) {
    if (!(await portFree(port))) throw new Error('port ' + port + ' is held; stop that stack before the demo');
  }
  const data = join('/tmp', 'stevens-verify', 'demo-' + scenario, 'data');
  rmSync(join('/tmp', 'stevens-verify', 'demo-' + scenario), { recursive: true, force: true });
  for (const side of ['firm', 'personal']) {
    mkdirSync(join(data, side), { recursive: true });
    cpSync(join(replay, side + '.jsonl'), join(data, side, 'ledger.jsonl'));
    writeFileSync(join(data, side, 'meta-fake.json'), JSON.stringify({ mode: 'normal' }));
    writeFileSync(join(data, side, 'meta-calls.json'), JSON.stringify({ count: 0 }));
  }
  const env = { ...process.env };
  env.STEVENS_DATA_DIR = data;
  env.STEVENS_SCENARIO = scenario;
  env.STEVENS_FIXTURES_DIR = join(process.cwd(), stack.fixtures);
  env.STEVENS_OWNER = stack.owner;
  env.STEVENS_OWNER_NAME = stack.ownerName;
  if (stack.ownerTitle) env.STEVENS_OWNER_TITLE = stack.ownerTitle;
  env.FIRM_PORT = String(stack.firm);
  env.PERSONAL_PORT = String(stack.personal);
  env.FIRM_WEB_PORT = String(stack.firmWeb);
  env.PERSONAL_WEB_PORT = String(stack.yoursWeb);
  env.FIRM_API_URL = 'http://localhost:' + stack.firm;
  env.PERSONAL_API_URL = 'http://localhost:' + stack.personal;
  env.STEVENS_FIRM_URL = 'http://localhost:' + stack.firm;
  env.STEVENS_REPLAY = '1';
  env.STEVENS_NOW = readFileSync(join(replay, 'now.txt'), 'utf8').trim();
  env.FIRM_DATABASE_URL = '';
  delete env.MODEL_API_KEY;
  console.log('demo: serving the recorded ' + scenario + ' run from ' + data);
  const child = spawn('npm', ['run', 'dev'], { cwd: process.cwd(), env, stdio: 'inherit' });
  const stop = () => {
    child.kill('SIGTERM');
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  const checks = [
    'http://localhost:' + stack.firm + '/api/health',
    'http://localhost:' + stack.personal + '/api/health',
    'http://localhost:' + stack.yoursWeb + '/',
    'http://localhost:' + stack.firmWeb + '/',
  ];
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
