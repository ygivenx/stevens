import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Client } from 'pg';
import { scenarioStores } from '../server/common/scenarios.js';

function loadEnvFile(file: string): Map<string, string> {
  const found = new Map<string, string>();
  if (!existsSync(file)) return found;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const cut = line.indexOf('=');
    if (cut > 0) found.set(line.slice(0, cut).trim(), line.slice(cut + 1).trim());
  }
  return found;
}

function writeEnvValue(file: string, key: string, value: string): void {
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split('\n') : [];
  const next = lines.filter((line) => !line.startsWith(key + '='));
  while (next.length > 0 && next[next.length - 1] === '') next.pop();
  next.push(key + '=' + value);
  writeFileSync(file, next.join('\n') + '\n');
}

async function roleExists(client: Client, role: string): Promise<boolean> {
  const res = await client.query(`select 1 from pg_roles where rolname = $1`, [role]);
  return res.rowCount === 1;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log('personal-pg-setup: build one scenario personal database.\n');
    console.log('Usage: npx tsx scripts/personal-pg-setup.ts [--scenario helios|forge|mercy] [--reset]\n');
    console.log('Idempotent. Creates the database and its login role, makes the role the database owner,');
    console.log('and writes PERSONAL_DATABASE_URL to the scenario env file. Tables are created by the');
    console.log('personal server on boot. --reset truncates the personal tables first.');
    console.log('Needs FIRM_ADMIN_DATABASE_URL (localhost only).');
    return;
  }
  const at = args.indexOf('--scenario');
  const id = at === -1 ? 'helios' : args[at + 1];
  if (at !== -1 && !id) throw new Error('--scenario needs a value');
  const stores = scenarioStores(id);
  const file = loadEnvFile(stores.envFile);
  const local = stores.envFile === '.env.local' ? file : loadEnvFile('.env.local');
  const adminUrl = process.env.FIRM_ADMIN_DATABASE_URL ?? file.get('FIRM_ADMIN_DATABASE_URL') ?? local.get('FIRM_ADMIN_DATABASE_URL');
  if (!adminUrl) throw new Error('FIRM_ADMIN_DATABASE_URL is not set; run stevensctl crm-db up first');
  const admin = new URL(adminUrl);
  if (admin.hostname !== '127.0.0.1' && admin.hostname !== 'localhost') throw new Error('refusing to set up a database outside this machine');
  const login = stores.prefix + '_yours';
  const maint = new Client({ connectionString: adminUrl.replace(/\/[^/]*$/, '/postgres') });
  await maint.connect();
  try {
    if (!(await roleExists(maint, login))) {
      const password = randomBytes(24).toString('hex');
      await maint.query(`create role "${login}" login password '${password.replace(/'/g, "''")}'`);
      const url = new URL(adminUrl.replace(/\/[^/]*$/, '/' + stores.personalDb));
      url.username = login;
      url.password = password;
      writeEnvValue(stores.envFile, 'PERSONAL_DATABASE_URL', url.toString());
    }
    const found = await maint.query(`select 1 from pg_database where datname = $1`, [stores.personalDb]);
    if (found.rowCount === 0) await maint.query(`create database "${stores.personalDb}" owner "${login}"`);
    else await maint.query(`alter database "${stores.personalDb}" owner to "${login}"`);
  } finally {
    await maint.end();
  }
  if (args.includes('--reset')) {
    const target = new Client({ connectionString: adminUrl.replace(/\/[^/]*$/, '/' + stores.personalDb) });
    await target.connect();
    try {
      const existing = await target.query(`select tablename from pg_tables where schemaname = 'public'`);
      const names = new Set(existing.rows.map((row: { tablename: string }) => row.tablename));
      const targets = ['items', 'segments', 'claims', 'shares', 'adapter_state', 'vault_meta', 'events', 'conversations'].filter((name) => names.has(name));
      if (targets.length > 0) await target.query(`truncate ${targets.map((name) => `"${name}"`).join(', ')}`);
    } finally {
      await target.end();
    }
  }
  console.log('personal setup: ' + stores.personalDb + ' owned by ' + login + (args.includes('--reset') ? '; tables truncated' : ''));
}

void main().catch((err) => {
  console.error(String(err instanceof Error ? err.message : err));
  process.exit(1);
});
