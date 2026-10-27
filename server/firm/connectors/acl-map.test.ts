import { describe, it, expect } from 'vitest';
import { classifyAcl, aclLabel, ACL_TABLE } from './acl-map.js';

describe('acl mirroring', () => {
  it('maps every documented principal pattern to its classification', () => {
    expect(ACL_TABLE).toEqual([
      { principal: 'legal-hold:<matter>', classification: 'wall' },
      { principal: 'all-staff', classification: 'team' },
      { principal: 'deal-team:<dealId>', classification: 'team' },
      { principal: 'partners', classification: 'partner-only' },
      { principal: '(anything else, or empty)', classification: 'wall' },
    ]);
  });

  it('lets a legal hold override every other grant', () => {
    expect(classifyAcl(['legal-hold:granite']).classification).toBe('wall');
    expect(classifyAcl(['deal-team:helios', 'legal-hold:granite']).classification).toBe('wall');
    expect(classifyAcl(['all-staff', 'partners', 'legal-hold:granite']).classification).toBe('wall');
    expect(aclLabel(['legal-hold:granite'])).toBe('Legal hold');
  });

  it('treats team grants as team', () => {
    expect(classifyAcl(['all-staff']).classification).toBe('team');
    expect(classifyAcl(['deal-team:helios']).classification).toBe('team');
    expect(classifyAcl(['deal-team:helios', 'partners']).classification).toBe('team');
    expect(aclLabel(['all-staff'])).toBe('All staff');
    expect(aclLabel(['deal-team:helios'])).toBe('Deal team');
  });

  it('treats partners-only memos as partner-only', () => {
    expect(classifyAcl(['partners']).classification).toBe('partner-only');
    expect(aclLabel(['partners'])).toBe('Partners');
  });

  it('fails closed on unknown, contractor, or empty ACLs', () => {
    expect(classifyAcl([]).classification).toBe('wall');
    expect(classifyAcl(['contractors']).classification).toBe('wall');
    expect(classifyAcl(['deal-team:']).classification).toBe('wall');
    expect(classifyAcl(['legal-hold:']).classification).toBe('wall');
    expect(classifyAcl(['PARTNERS']).classification).toBe('wall');
    expect(aclLabel([])).toBe('Restricted');
    expect(aclLabel(['contractors'])).toBe('Restricted');
  });

  it('mirrors the fixture documents to the intended classifications', () => {
    expect(classifyAcl(['deal-team:helios']).classification).toBe('team');
    expect(classifyAcl(['partners']).classification).toBe('partner-only');
    expect(classifyAcl(['legal-hold:granite']).classification).toBe('wall');
  });
});
