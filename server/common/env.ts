import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function parseLine(line: string): [string, string] | null {
  const text = line.trim();
  if (!text || text.startsWith('#')) return null;
  const cut = text.indexOf('=');
  if (cut <= 0) return null;
  const key = text.slice(0, cut).trim();
  if (!key) return null;
  let value = text.slice(cut + 1).trim();
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
  else if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
  return [key, value];
}

function applyFile(dir: string, name: string, env: Record<string, string | undefined>): void {
  const path = join(dir, name);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const parsed = parseLine(line);
    if (parsed && !(parsed[0] in env)) env[parsed[0]] = parsed[1];
  }
}

export function loadEnvFiles(opts?: { dir?: string; env?: Record<string, string | undefined>; scenario?: string }): void {
  const env = opts?.env ?? process.env;
  const dir = opts?.dir ?? process.cwd();
  const scenario = opts?.scenario ?? env.STEVENS_SCENARIO ?? 'helios';
  if (scenario && scenario !== 'helios') applyFile(dir, '.env.' + scenario, env);
  applyFile(dir, '.env.local', env);
}
