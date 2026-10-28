import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

interface CrmFixture {
  people: { id: string; name: string; role: string }[];
  deals: { id: string; company: string; sector: string; stage: string; askUsd: number }[];
  dealTeam: { dealId: string; personId: string }[];
  meetings: { id: string; dealId: string; title: string; startsAt: string }[];
  documents: { id: string; dealId?: string; kind: string; title: string; createdAt: string; body?: string; mediaPath?: string; acl: string[] }[];
  portfolio: { company: string; sector: string }[];
}

function loadEnvFile(): Map<string, string> {
  const found = new Map<string, string>();
  if (!existsSync('.env.local')) return found;
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const cut = line.indexOf('=');
    if (cut > 0) found.set(line.slice(0, cut).trim(), line.slice(cut + 1).trim());
  }
  return found;
}

function personRole(personId: string): string {
  return 'dh_p_' + personId.replace(/^p-/, '').replace(/[^a-z0-9_]/g, '_');
}

function principalRole(principal: string): string {
  if (principal === 'all-staff') return 'dh_all_staff';
  if (principal === 'partners') return 'dh_partners';
  const team = /^deal-team:(.+)$/.exec(principal);
  if (team) return 'dh_deal_team_' + team[1].replace(/[^a-z0-9_]/g, '_');
  const hold = /^legal-hold:(.+)$/.exec(principal);
  if (hold) return 'dh_legal_hold_' + hold[1].replace(/[^a-z0-9_]/g, '_');
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

function writeEnvValue(key: string, value: string): void {
  const lines = existsSync('.env.local') ? readFileSync('.env.local', 'utf8').split('\n') : [];
  const next = lines.filter((line) => !line.startsWith(key + '='));
  while (next.length > 0 && next[next.length - 1] === '') next.pop();
  next.push(key + '=' + value);
  writeFileSync('.env.local', next.join('\n') + '\n');
}

async function main(): Promise<void> {
  const file = loadEnvFile();
  const adminUrl = process.env.FIRM_ADMIN_DATABASE_URL ?? file.get('FIRM_ADMIN_DATABASE_URL');
  if (!adminUrl) throw new Error('FIRM_ADMIN_DATABASE_URL is not set; run stevensctl crm-db up first');
  const admin = new URL(adminUrl);
  if (admin.hostname !== '127.0.0.1' && admin.hostname !== 'localhost') throw new Error('refusing to set up a CRM outside this machine');
  const dir = process.env.STEVENS_FIXTURES_DIR ?? join(process.cwd(), 'fixtures');
  const crm = JSON.parse(readFileSync(join(dir, 'enterprise', 'crm.json'), 'utf8')) as CrmFixture;
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    for (const person of crm.people) await ensureGroup(client, personRole(person.id));
    await ensureGroup(client, 'dh_all_staff');
    await ensureGroup(client, 'dh_partners');
    for (const deal of crm.deals) await ensureGroup(client, 'dh_deal_team_' + deal.id.replace(/[^a-z0-9_]/g, '_'));
    const holds = new Set<string>();
    for (const doc of crm.documents) for (const principal of doc.acl) {
      const hold = /^legal-hold:(.+)$/.exec(principal);
      if (hold) holds.add('dh_legal_hold_' + hold[1].replace(/[^a-z0-9_]/g, '_'));
    }
    for (const hold of holds) await ensureGroup(client, hold);
    for (const person of crm.people) {
      const role = personRole(person.id);
      await ensureMember(client, 'dh_all_staff', role);
      if (person.role === 'Partner') await ensureMember(client, 'dh_partners', role);
    }
    for (const row of crm.dealTeam) {
      await ensureMember(client, 'dh_deal_team_' + row.dealId.replace(/[^a-z0-9_]/g, '_'), personRole(row.personId));
    }
    const stevensIsNew = !(await roleExists(client, 'dh_stevens'));
    if (stevensIsNew) {
      const password = randomBytes(24).toString('hex');
      await client.query(`create role "dh_stevens" login password '${password.replace(/'/g, "''")}'`);
      const stevens = new URL(adminUrl);
      stevens.username = 'dh_stevens';
      stevens.password = password;
      writeEnvValue('FIRM_DATABASE_URL', stevens.toString());
    }
    await client.query(readFileSync(join(process.cwd(), 'server', 'firm', 'crm', 'schema.sql'), 'utf8'));
    await ensureMember(client, 'dh_all_staff', 'dh_stevens');
    await ensureMember(client, 'dh_partners', 'dh_stevens');
    for (const deal of crm.deals) await ensureMember(client, 'dh_deal_team_' + deal.id.replace(/[^a-z0-9_]/g, '_'), 'dh_stevens');

    await client.query(`delete from crm.document_grants`);
    await client.query(`delete from crm.document_bodies`);
    await client.query(`delete from crm.documents`);
    await client.query(`delete from crm.meetings`);
    await client.query(`delete from crm.portfolio`);
    await client.query(`delete from crm.deals`);
    await client.query(`delete from crm.people`);
    for (const person of crm.people) {
      await client.query(`insert into crm.people (id, name, title, db_role) values ($1, $2, $3, $4)`, [person.id, person.name, person.role, personRole(person.id)]);
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
        await client.query(`insert into crm.document_grants (document_id, grantee) values ($1, $2)`, [doc.id, principalRole(principal)]);
      }
    }
    console.log('crm setup: ' + crm.documents.length + ' documents, ' + crm.people.length + ' people, ' + crm.deals.length + ' deals' + (stevensIsNew ? '; dh_stevens password written to .env.local' : ''));
  } finally {
    await client.end();
  }
}

void main().catch((err) => {
  console.error(String(err instanceof Error ? err.message : err));
  process.exit(1);
});
