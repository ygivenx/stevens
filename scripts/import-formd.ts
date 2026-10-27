import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const QUARTERS = ['2025Q4', '2026Q1'];
const TECHNOLOGY = new Set(['Other Technology', 'Computers', 'Telecommunications']);
const MIN_OFFERING = 2_000_000;
const MAX_OFFERING = 50_000_000;
const MAX_ROWS = 2000;

interface Filing {
  accession: string;
  issuer: string;
  state: string;
  industryGroup: string;
  filedAt: string;
  firstSaleDate: string | null;
  totalOfferingUsd: number;
  totalSoldUsd: number;
  quarter: string;
}

function userAgent(): string {
  const agent = process.env.SEC_USER_AGENT;
  if (!agent) throw new Error('SEC_USER_AGENT is not set; the SEC fair-access policy requires a declared agent');
  return agent;
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { headers: { 'User-Agent': userAgent(), Accept: '*/*' } });
  if (!res.ok) throw new Error('download failed with status ' + res.status + ' for ' + url);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

function parseTsv(path: string): Record<string, string>[] {
  const lines = readFileSync(path, 'utf8').split('\n').filter((line) => line.length > 0);
  const headers = lines[0].split('\t');
  return lines.slice(1).map((line) => {
    const cells = line.split('\t');
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? '';
    });
    return row;
  });
}

function amount(value: string): number {
  const parsed = Number((value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

async function quarterRows(quarter: string, work: string): Promise<Filing[]> {
  const zipName = quarter.toLowerCase() + '_d.zip';
  const url = 'https://www.sec.gov/files/structureddata/data/form-d-data-sets/' + zipName;
  const zipPath = join(work, zipName);
  await download(url, zipPath);
  const dir = join(work, quarter);
  mkdirSync(dir, { recursive: true });
  execFileSync('unzip', ['-o', '-q', zipPath, '-d', dir]);
  const inner = join(dir, quarter + '_d');
  const subs = new Map<string, Record<string, string>>();
  for (const row of parseTsv(join(inner, 'FORMDSUBMISSION.tsv'))) subs.set(row['ACCESSIONNUMBER'], row);
  const issuers = new Map<string, Record<string, string>>();
  for (const row of parseTsv(join(inner, 'ISSUERS.tsv'))) {
    if (row['IS_PRIMARYISSUER_FLAG'] === 'true' && !issuers.has(row['ACCESSIONNUMBER'])) issuers.set(row['ACCESSIONNUMBER'], row);
  }
  const rows: Filing[] = [];
  for (const offering of parseTsv(join(inner, 'OFFERING.tsv'))) {
    if (offering['ISEQUITYTYPE'] !== 'true') continue;
    if (!TECHNOLOGY.has((offering['INDUSTRYGROUPTYPE'] || '').trim())) continue;
    const total = amount(offering['TOTALOFFERINGAMOUNT']);
    if (total < MIN_OFFERING || total > MAX_OFFERING) continue;
    const accession = offering['ACCESSIONNUMBER'];
    const sub = subs.get(accession) ?? {};
    const issuer = issuers.get(accession) ?? {};
    rows.push({
      accession,
      issuer: (issuer['ENTITYNAME'] || '').trim(),
      state: ((issuer['STATEORCOUNTRYDESCRIPTION'] || issuer['STATEORCOUNTRY'] || '') as string).trim(),
      industryGroup: (offering['INDUSTRYGROUPTYPE'] || '').trim(),
      filedAt: (sub['FILING_DATE'] || '').slice(0, 10),
      firstSaleDate: (offering['SALE_DATE'] || '').slice(0, 10) || null,
      totalOfferingUsd: total,
      totalSoldUsd: amount(offering['TOTALAMOUNTSOLD']),
      quarter,
    });
  }
  return rows;
}

async function main(): Promise<void> {
  const work = join(tmpdir(), 'stevens-formd');
  mkdirSync(work, { recursive: true });
  const all: Filing[] = [];
  for (const quarter of QUARTERS) all.push(...(await quarterRows(quarter, work)));
  all.sort((a, b) => (a.filedAt < b.filedAt ? -1 : 1));
  const kept = all.slice(0, MAX_ROWS);
  const dest = join(process.cwd(), 'fixtures', 'enterprise', 'formd', 'tech-2025q4-2026q1.json');
  mkdirSync(join(process.cwd(), 'fixtures', 'enterprise', 'formd'), { recursive: true });
  writeFileSync(dest, JSON.stringify({ quarters: QUARTERS, industryGroups: [...TECHNOLOGY], minOfferingUsd: MIN_OFFERING, maxOfferingUsd: MAX_OFFERING, count: kept.length, filings: kept }, null, 1));
  console.log('formd import: ' + kept.length + ' filings -> ' + dest);
  rmSync(work, { recursive: true, force: true });
}

void main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
