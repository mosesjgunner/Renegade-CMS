/** Roles stored on staff user records. Editorial and community roles are separate member concepts. */
export const STAFF_ROLES = ['owner', 'administrator', 'staff'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

export type AdminArea =
  | 'dashboard'
  | 'publishing'
  | 'media'
  | 'presentation'
  | 'discovery'
  | 'workflow'
  | 'distribution'
  | 'audience'
  | 'community'
  | 'commerce'
  | 'analytics'
  | 'users'
  | 'roles'
  | 'providers'
  | 'settings'
  | 'maintenance'

const staff: readonly StaffRole[] = STAFF_ROLES
const ownerOnly: readonly StaffRole[] = ['owner']
const administrators: readonly StaffRole[] = ['owner', 'administrator']

export const ADMIN_AREA_ROLES: Record<AdminArea, readonly StaffRole[]> = {
  dashboard: staff,
  publishing: staff,
  media: staff,
  presentation: staff,
  discovery: staff,
  workflow: staff,
  distribution: staff,
  audience: staff,
  community: staff,
  commerce: staff,
  analytics: ownerOnly,
  users: staff,
  roles: staff,
  providers: staff,
  settings: staff,
  maintenance: administrators,
}

export function canAccessAdminArea(role: unknown, area: AdminArea): boolean {
  return ADMIN_AREA_ROLES[area].includes(String(role) as StaffRole)
}

export function canAccessAdminRole(role: unknown): role is StaffRole {
  return STAFF_ROLES.includes(String(role) as StaffRole)
}
