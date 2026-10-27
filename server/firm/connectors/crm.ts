import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Connector, ConnectorDocument } from './connector.js';

interface CrmFixture {
  people: { id: string; name: string; role: string }[];
  deals: { id: string; company: string; sector: string; stage: string; askUsd: number }[];
  dealTeam: { dealId: string; personId: string }[];
  meetings: { id: string; dealId: string; title: string; startsAt: string }[];
  documents: { id: string; dealId?: string; kind: ConnectorDocument['kind']; title: string; createdAt: string; body?: string; mediaPath?: string; acl: string[] }[];
  portfolio: { company: string; sector: string }[];
}

export interface CrmSnapshot extends CrmFixture {}

export function loadCrm(): CrmSnapshot {
  const dir = process.env.STEVENS_FIXTURES_DIR ?? join(process.cwd(), 'fixtures');
  return JSON.parse(readFileSync(join(dir, 'enterprise', 'crm.json'), 'utf8')) as CrmSnapshot;
}

export class CrmConnector implements Connector {
  id = 'crm' as const;
  label = 'Firm CRM (fictional)';
  simulated = 'Simulated — fictional firm CRM';

  async documents(): Promise<ConnectorDocument[]> {
    return loadCrm().documents.map((doc) => ({
      id: doc.id,
      dealId: doc.dealId,
      kind: doc.kind,
      title: doc.title,
      createdAt: doc.createdAt,
      body: doc.body,
      mediaPath: doc.mediaPath,
      acl: doc.acl,
    }));
  }
}
