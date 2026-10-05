import { describe, expect, it } from 'vitest';
import { resolveTeamRole, roleCan } from '../src/lib/roles';

describe('rôles d’équipe', () => {
  it('le propriétaire est toujours admin', () => {
    expect(resolveTeamRole({ ownerUid: 'u1', currentUid: 'u1', email: 'boss@co.dz' })).toBe('admin');
  });

  it('un membre déclaré hérite de son rôle, sinon lecture seule', () => {
    const teamRoles = { 'Agent@co.dz': 'agent', 'stagiaire@co.dz': 'viewer' };
    expect(resolveTeamRole({ ownerUid: 'u1', currentUid: 'u2', email: 'agent@co.dz', teamRoles })).toBe('agent');
    expect(resolveTeamRole({ ownerUid: 'u1', currentUid: 'u3', email: 'stagiaire@co.dz', teamRoles })).toBe('viewer');
    expect(resolveTeamRole({ ownerUid: 'u1', currentUid: 'u9', email: 'inconnu@co.dz', teamRoles })).toBe('viewer');
  });

  it('les permissions suivent le rôle', () => {
    expect(roleCan('admin', 'billing')).toBe(true);
    expect(roleCan('agent', 'billing')).toBe(false);
    expect(roleCan('agent', 'edit')).toBe(true);
    expect(roleCan('viewer', 'edit')).toBe(false);
    expect(roleCan('viewer', 'view')).toBe(true);
  });
});
