import type { Classification } from '../../../shared/data.js';

export function classifyAcl(principals: string[]): { classification: Classification; matched: string } {
  const hold = principals.find((principal) => /^legal-hold:.+/.test(principal));
  if (hold) return { classification: 'wall', matched: hold };
  const team = principals.find((principal) => principal === 'all-staff' || /^deal-team:.+/.test(principal));
  if (team) return { classification: 'team', matched: team };
  const partners = principals.find((principal) => principal === 'partners');
  if (partners) return { classification: 'partner-only', matched: partners };
  return { classification: 'wall', matched: principals[0] ?? '(empty acl)' };
}

export function aclLabel(principals: string[]): string {
  const seen = classifyAcl(principals);
  if (seen.classification === 'wall') {
    return /^legal-hold:.+/.test(seen.matched) ? 'Legal hold' : 'Restricted';
  }
  if (seen.matched === 'all-staff') return 'All staff';
  if (seen.matched === 'partners') return 'Partners';
  return 'Deal team';
}

export const ACL_TABLE: { principal: string; classification: Classification }[] = [
  { principal: 'legal-hold:<matter>', classification: 'wall' },
  { principal: 'all-staff', classification: 'team' },
  { principal: 'deal-team:<dealId>', classification: 'team' },
  { principal: 'partners', classification: 'partner-only' },
  { principal: '(anything else, or empty)', classification: 'wall' },
];
