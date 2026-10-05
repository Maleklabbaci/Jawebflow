/**
 * JAWEBFLOW — RÔLES D'ÉQUIPE
 * ------------------------------------------------------------
 * Une grande société a plusieurs personnes sur le même assistant : le
 * propriétaire (admin), des agents (qui traitent les clients) et des lecteurs
 * (lecture seule). Le rôle d'un utilisateur connecté est résolu ici :
 *   - le propriétaire du compte est toujours « admin » ;
 *   - sinon on regarde `teamRoles` (email → rôle) configuré par l'admin ;
 *   - à défaut, « viewer » (lecture seule).
 */

export type TeamRole = 'admin' | 'agent' | 'viewer';

export const TEAM_ROLES: TeamRole[] = ['admin', 'agent', 'viewer'];

export const ROLE_LABELS: Record<TeamRole, string> = {
  admin: 'Admin (tout gérer)',
  agent: 'Agent (traiter les clients)',
  viewer: 'Lecture seule',
};

export function isTeamRole(value: unknown): value is TeamRole {
  return typeof value === 'string' && (TEAM_ROLES as string[]).includes(value);
}

export function resolveTeamRole(input: {
  ownerUid?: string | null;
  currentUid?: string | null;
  email?: string | null;
  teamRoles?: Record<string, unknown> | null;
}): TeamRole {
  if (input.currentUid && input.ownerUid && input.currentUid === input.ownerUid) return 'admin';
  const email = String(input.email || '').trim().toLowerCase();
  const roles = input.teamRoles || {};
  for (const [key, value] of Object.entries(roles)) {
    if (key.trim().toLowerCase() === email && isTeamRole(value)) return value;
  }
  return 'viewer';
}

/** Ce qu'un rôle a le droit de voir / faire dans le tableau de bord. */
export function roleCan(role: TeamRole, action: 'billing' | 'settings' | 'edit' | 'view'): boolean {
  if (action === 'view') return true;
  if (role === 'admin') return true;
  if (role === 'agent') return action === 'edit';
  return false; // viewer : lecture seule
}
