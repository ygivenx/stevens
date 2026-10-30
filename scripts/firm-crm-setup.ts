import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { scenarioStores } from '../server/common/scenarios.js';

interface CrmFixture {
  people: { id: string; name: string; role: string }[];
  deals: { id: string; company: string; sector: string; stage: string; askUsd: number }[];
  dealTeam: { dealId: string; personId: string }[];
  meetings: { id: string; dealId: string; title: string; startsAt: string }[];
  documents: { id: string; dealId?: string; kind: string; title: string; createdAt: string; body?: string; mediaPath?: string; acl: string[] }[];
  portfolio: { company: string; sector: string }[];
}

function loadEnvFile(file: string): Map<string, string> {
  const found = new Map<string, string>();
  if (!existsSync(file)) return found;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const cut = line.indexOf('=');
    if (cut > 0) found.set(line.slice(0, cut).trim(), line.slice(cut + 1).trim());
  }
  return found;
}

function personRole(prefix: string, personId: string): string {
  return prefix + '_p_' + personId.replace(/^p-/, '').replace(/[^a-z0-9_]/g, '_');
}

function principalRole(prefix: string, principal: string): string {
  if (principal === 'all-staff') return prefix + '_all_staff';
  if (principal === 'partners') return prefix + '_partners';
  const team = /^deal-team:(.+)$/.exec(principal);
  if (team) return prefix + '_deal_team_' + team[1].replace(/[^a-z0-9_]/g, '_');
  const hold = /^legal-hold:(.+)$/.exec(principal);
  if (hold) return prefix + '_legal_hold_' + hold[1].replace(/[^a-z0-9_]/g, '_');
  throw new Error('unknown principal ' + principal);
}

async function roleExists(client: Client, role: string): Promise<boolean> {
  const res = await client.query(`select 1 from pg_roles where rolname = $1`, [role]);
  return res.rowCount === 1;
}

async function ensureGroup(client: Client, role: string): Promise<void> {
  if (await roleExists(client, role)) return;
  await client.query(`create role "${role}" nologin`);
}

async function ensureMember(client: Client, group: string, member: string): Promise<void> {
  await client.query(`grant "${group}" to "${member}"`);
}

function writeEnvValue(file: string, key: string, value: string): void {
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split('\n') : [];
  const next = lines.filter((line) => !line.startsWith(key + '='));
  while (next.length > 0 && next[next.length - 1] === '') next.pop();
  next.push(key + '=' + value);
  writeFileSync(file, next.join('\n') + '\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log('firm-crm-setup: build one scenario firm database from its crm.json fixture.\n');
    console.log('Usage: npx tsx scripts/firm-crm-setup.ts [--scenario helios|forge|mercy] [--reset]\n');
    console.log('Idempotent. Creates the database, roles, grants and RLS from server/firm/crm/schema.sql,');
    console.log('loads the scenario crm.json as rows, and writes FIRM_DATABASE_URL to the scenario env file.');
    console.log('--reset also truncates the Stevens projection tables (people, deals, meetings, documents,');
    console.log('memberships, connector_state, filings, release_provenance).');
    console.log('Needs FIRM_ADMIN_DATABASE_URL (localhost only) in the environment or .env.local.');
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
  if (admin.hostname !== '127.0.0.1' && admin.hostname !== 'localhost') throw new Error('refusing to set up a CRM outside this machine');
  const fixturesRoot = process.env.STEVENS_FIXTURES_DIR
    ?? (id === 'helios' ? join(process.cwd(), 'fixtures') : join(process.cwd(), 'fixtures', id));
  const crm = JSON.parse(readFileSync(join(fixturesRoot, 'enterprise', 'crm.json'), 'utf8')) as CrmFixture;
  const maint = new Client({ connectionString: adminUrl.replace(/\/[^/]*$/, '/postgres') });
  await maint.connect();
  try {
    const found = await maint.query(`select 1 from pg_database where datname = $1`, [stores.firmDb]);
    if (found.rowCount === 0) await maint.query(`create database "${stores.firmDb}"`);
  } finally {
    await maint.end();
  }
  const dbUrl = adminUrl.replace(/\/[^/]*$/, '/' + stores.firmDb);
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  const prefix = stores.prefix;
  const stevens = prefix + '_stevens';
  try {
    for (const person of crm.people) await ensureGroup(client, personRole(prefix, person.id));
    await ensureGroup(client, prefix + '_all_staff');
    await ensureGroup(client, prefix + '_partners');
    for (const deal of crm.deals) await ensureGroup(client, prefix + '_deal_team_' + deal.id.replace(/[^a-z0-9_]/g, '_'));
    const holds = new Set<string>();
    for (const doc of crm.documents) for (const principal of doc.acl) {
      const hold = /^legal-hold:(.+)$/.exec(principal);
      if (hold) holds.add(prefix + '_legal_hold_' + hold[1].replace(/[^a-z0-9_]/g, '_'));
    }
    for (const hold of holds) await ensureGroup(client, hold);
    for (const person of crm.people) {
      const role = personRole(prefix, person.id);
      await ensureMember(client, prefix + '_all_staff', role);
      if (person.role === 'Partner') await ensureMember(client, prefix + '_partners', role);
    }
    for (const row of crm.dealTeam) {
      await ensureMember(client, prefix + '_deal_team_' + row.dealId.replace(/[^a-z0-9_]/g, '_'), personRole(prefix, row.personId));
    }
    const stevensIsNew = !(await roleExists(client, stevens));
    if (stevensIsNew) {
      const password = randomBytes(24).toString('hex');
      await client.query(`create role "${stevens}" login password '${password.replace(/'/g, "''")}'`);
      const login = new URL(dbUrl);
      login.username = stevens;
      login.password = password;
      writeEnvValue(stores.envFile, 'FIRM_DATABASE_URL', login.toString());
    }
    const schema = readFileSync(join(process.cwd(), 'server', 'firm', 'crm', 'schema.sql'), 'utf8').replaceAll('dh_', prefix + '_');
    await client.query(schema);
    await client.query(`grant create on schema public to "${stevens}"`);
    await ensureMember(client, prefix + '_all_staff', stevens);
    await ensureMember(client, prefix + '_partners', stevens);
    for (const deal of crm.deals) await ensureMember(client, prefix + '_deal_team_' + deal.id.replace(/[^a-z0-9_]/g, '_'), stevens);

    await client.query(`delete from crm.document_grants`);
    await client.query(`delete from crm.document_bodies`);
    await client.query(`delete from crm.documents`);
    await client.query(`delete from crm.meetings`);
    await client.query(`delete from crm.portfolio`);
    await client.query(`delete from crm.deals`);
    await client.query(`delete from crm.people`);
    for (const person of crm.people) {
      await client.query(`insert into crm.people (id, name, title, db_role) values ($1, $2, $3, $4)`, [person.id, person.name, person.role, personRole(prefix, person.id)]);
    }
    for (const deal of crm.deals) {
      await client.query(`insert into crm.deals (id, company, sector, stage, ask_usd) values ($1, $2, $3, $4, $5)`, [deal.id, deal.company, deal.sector, deal.stage, deal.askUsd]);
    }
    for (const meeting of crm.meetings) {
      await client.query(`insert into crm.meetings (id, deal_id, title, starts_at) values ($1, $2, $3, $4)`, [meeting.id, meeting.dealId, meeting.title, meeting.startsAt]);
    }
    for (const row of crm.portfolio) {
      await client.query(`insert into crm.portfolio (company, sector) values ($1, $2)`, [row.company, row.sector]);
    }
    for (const doc of crm.documents) {
      await client.query(`insert into crm.documents (id, deal_id, kind, title, created_at) values ($1, $2, $3, $4, $5)`, [doc.id, doc.dealId ?? null, doc.kind, doc.title, doc.createdAt]);
      await client.query(`insert into crm.document_bodies (document_id, body, media_path) values ($1, $2, $3)`, [doc.id, doc.body ?? null, doc.mediaPath ?? null]);
      for (const principal of doc.acl) {
        await client.query(`insert into crm.document_grants (document_id, grantee) values ($1, $2)`, [doc.id, principalRole(prefix, principal)]);
      }
    }
    if (args.includes('--reset')) {
      const existing = await client.query(`select tablename from pg_tables where schemaname = 'public'`);
      const names = new Set(existing.rows.map((row: { tablename: string }) => row.tablename));
      const targets = ['people', 'deals', 'deal_team', 'meetings', 'documents', 'document_acl', 'portfolio', 'filings', 'release_provenance', 'connector_state', 'memberships'].filter((name) => names.has(name));
      if (targets.length > 0) await client.query(`truncate ${targets.map((name) => `"${name}"`).join(', ')}`);
    }
    console.log('crm setup: ' + crm.documents.length + ' documents, ' + crm.people.length + ' people, ' + crm.deals.length + ' deals' + (stevensIsNew ? '; ' + stevens + ' password written to ' + stores.envFile : '') + (args.includes('--reset') ? '; projection truncated' : ''));
  } finally {
    await client.end();
  }
}

void main().catch((err) => {
  console.error(String(err instanceof Error ? err.message : err));
  process.exit(1);
});
