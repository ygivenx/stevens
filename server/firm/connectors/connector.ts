import type { Classification, Source } from '../../../shared/data.js';
import { classifyAcl, aclLabel } from './acl-map.js';

export { classifyAcl, aclLabel };
export type { Classification };

export type { Source };

export interface ConnectorDocument {
  id: string;
  dealId?: string;
  kind: Source['kind'];
  title: string;
  createdAt: string;
  body?: string;
  mediaPath?: string;
  acl: string[];
}

export interface Connector {
  id: 'crm' | 'sec-form-d';
  label: string;
  simulated?: string;
  documents(): Promise<ConnectorDocument[]>;
}

