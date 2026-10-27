import type { AccessRule, Purpose } from '../../../shared/data.js';

const ALL: Purpose[] = ['extract', 'bridge', 'brief', 'privy', 'answer', 'decision'];

export const RULES: AccessRule[] = [
  { id: 'r-personal-owner-associate', vault: 'personal', owner: true, viewer: 'Associate', purposes: ALL, access: 'visible' },
  { id: 'r-personal-owner-partner', vault: 'personal', owner: true, viewer: 'Partner', purposes: ALL, access: 'visible' },
  { id: 'r-personal-other-associate', vault: 'personal', owner: false, viewer: 'Associate', purposes: ALL, access: 'excluded' },
  { id: 'r-personal-other-partner', vault: 'personal', owner: false, viewer: 'Partner', purposes: ALL, access: 'excluded' },
  { id: 'r-team-associate', vault: 'enterprise', classification: 'team', viewer: 'Associate', purposes: ALL, access: 'visible' },
  { id: 'r-team-partner', vault: 'enterprise', classification: 'team', viewer: 'Partner', purposes: ALL, access: 'visible' },
  { id: 'r-partner-only-partner', vault: 'enterprise', classification: 'partner-only', viewer: 'Partner', purposes: ALL, access: 'visible' },
  { id: 'r-partner-only-associate', vault: 'enterprise', classification: 'partner-only', viewer: 'Associate', purposes: ALL, access: 'privy' },
  { id: 'r-wall-associate', vault: 'enterprise', classification: 'wall', viewer: 'Associate', purposes: ALL, access: 'excluded' },
  { id: 'r-wall-partner', vault: 'enterprise', classification: 'wall', viewer: 'Partner', purposes: ALL, access: 'excluded' },
];
