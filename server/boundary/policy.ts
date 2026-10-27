import type { Access, Purpose, Role, Source } from '../../shared/data.js';
import { RULES } from './rules.js';

export interface Decision { access: Access; ruleId: string }

export function policy(source: Source, viewer: Role, purpose: Purpose): Decision {
  const isOwner = source.ownerRole === viewer;
  for (const rule of RULES) {
    if (rule.vault !== source.vault) continue;
    if ((rule.classification ?? null) !== (source.classification ?? null)) continue;
    if (rule.owner !== undefined && rule.owner !== isOwner) continue;
    if (rule.viewer !== viewer) continue;
    if (!rule.purposes.includes(purpose)) continue;
    return { access: rule.access, ruleId: rule.id };
  }
  throw new Error('no access rule matches source ' + source.id);
}
