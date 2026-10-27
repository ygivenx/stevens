import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Connector, ConnectorDocument } from './connector.js';

export interface FormDFiling {
  accession: string;
  issuer: string;
  cik?: string;
  state: string;
  industryGroup: string;
  filedAt: string;
  firstSaleDate: string | null;
  totalOfferingUsd: number;
  totalSoldUsd: number;
  quarter: string;
}

interface FormDFixture {
  quarters: string[];
  industryGroups: string[];
  minOfferingUsd: number;
  maxOfferingUsd: number;
  count: number;
  filings: FormDFiling[];
}

export function loadFormD(): FormDFixture {
  const dir = process.env.STEVENS_FIXTURES_DIR ?? join(process.cwd(), 'fixtures');
  return JSON.parse(readFileSync(join(dir, 'enterprise', 'formd', 'tech-2025q4-2026q1.json'), 'utf8')) as FormDFixture;
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

export function millions(usd: number): string {
  return '$' + (usd / 1_000_000).toFixed(1) + 'M';
}

export function quarterLabel(quarter: string): string {
  return quarter.replace('Q', ' Q');
}

export function quarterEnd(quarter: string): string {
  const year = Number(quarter.slice(0, 4));
  const month = Number(quarter.slice(5)) * 3 + 1;
  const endYear = month > 12 ? year + 1 : year;
  const endMonth = month > 12 ? month - 12 : month;
  return endYear + '-' + String(endMonth).padStart(2, '0') + '-01T00:00:00Z';
}

export function compsSentence(quarter: string, issuers: number, med: number): string {
  return 'SEC Form D, ' + quarterLabel(quarter) + ': ' + issuers + ' technology issuers reported equity offerings between $2M and $50M; the median total offering was ' + millions(med) + '.';
}

export interface MarketSample {
  issuer: string;
  filedAt: string;
  totalOfferingUsd: number;
  accession: string;
  secUrl: string;
}

export function secFilingUrl(accession: string): string {
  return 'https://www.sec.gov/edgar/search/#/q=%2522' + encodeURIComponent(accession) + '%2522';
}

export function marketSample(filings: FormDFiling[], quarter: string, limit: number = 5): MarketSample[] {
  return filings
    .filter((filing) => filing.quarter === quarter && filing.issuer.length > 0)
    .sort((a, b) => b.totalOfferingUsd - a.totalOfferingUsd)
    .slice(0, limit)
    .map((filing) => ({
      issuer: filing.issuer,
      filedAt: filing.filedAt,
      totalOfferingUsd: filing.totalOfferingUsd,
      accession: filing.accession,
      secUrl: secFilingUrl(filing.accession),
    }));
}

export function buildComps(filings: FormDFiling[]): { quarter: string; sentence: string; issuers: number; medianUsd: number }[] {
  const quarters = [...new Set(filings.map((filing) => filing.quarter))].sort();
  return quarters.map((quarter) => {
    const amounts = filings.filter((filing) => filing.quarter === quarter).map((filing) => filing.totalOfferingUsd);
    const med = median(amounts);
    return { quarter, sentence: compsSentence(quarter, amounts.length, med), issuers: amounts.length, medianUsd: med };
  });
}

export class SecFormDConnector implements Connector {
  id = 'sec-form-d' as const;
  label = 'SEC Form D (public)';

  async documents(): Promise<ConnectorDocument[]> {
    const fixture = loadFormD();
    return buildComps(fixture.filings).map((comps) => ({
      id: 'formd-comps-' + comps.quarter,
      kind: 'market-comps',
      title: 'Market comps ' + quarterLabel(comps.quarter),
      createdAt: quarterEnd(comps.quarter),
      body: comps.sentence,
      acl: ['all-staff'],
    }));
  }
}
