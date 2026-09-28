import { describe, expect, it } from 'vitest'
import {
  ADMIN_AREA_ROLES,
  canAccessAdminArea,
  canAccessAdminRole,
} from '../../src/modules/admin/access-policy'
import {
  adminSiteWhere,
  canManageAdminSite,
  getAdminSiteIDs,
  siteScopedAdminAccess,
  siteScopedRelationAdminAccess,
} from '../../src/modules/admin/site-access'
import { LinkedIdentities, Members } from '../../src/collections/Identity'

describe('ADMIN-00 staff role and route policy', () => {
  it('matches staff user records supported by Users collection', () => {
    for (const role of ['owner', 'administrator', 'staff'])
      expect(canAccessAdminRole(role)).toBe(true)
    for (const role of [
      'editor',
      'publisher',
      'moderator',
      'commerce',
      'member',
      null,
      undefined,
    ]) {
      expect(canAccessAdminRole(role)).toBe(false)
    }
  })

  it('scopes staff grants by site and keeps owner and administrator global', () => {
    const staffUser = { role: 'staff', adminSites: ['site-a', { id: 'site-b' }, null] }
    expect(getAdminSiteIDs(staffUser)).toEqual(['site-a', 'site-b'])
    expect(canManageAdminSite(staffUser, 'site-a')).toBe(true)
    expect(canManageAdminSite(staffUser, 'site-c')).toBe(false)
    expect(adminSiteWhere({ role: 'staff' })).toBe(false)
    expect(adminSiteWhere(staffUser)).toEqual({ site: { in: ['site-a', 'site-b'] } })
    expect(adminSiteWhere({ role: 'administrator' })).toBe(true)
    expect(canManageAdminSite({ role: 'owner' }, 'any-site')).toBe(true)
  })

  it('allows staff routes and keeps owner diagnostics/settings restricted', () => {
    for (const role of ['owner', 'administrator', 'staff']) {
      for (const area of [
        'dashboard',
        'publishing',
        'media',
        'presentation',
        'discovery',
        'workflow',
        'distribution',
        'audience',
        'community',
        'commerce',
        'providers',
        'settings',
      ] as const) {
        expect(canAccessAdminArea(role, area)).toBe(true)
      }
    }
    for (const role of ['administrator', 'staff']) {
      expect(canAccessAdminArea(role, 'analytics')).toBe(false)
    }
    expect(canAccessAdminArea('owner', 'analytics')).toBe(true)
    expect(canAccessAdminArea('administrator', 'maintenance')).toBe(true)
    expect(canAccessAdminArea('staff', 'maintenance')).toBe(false)
    expect(Object.keys(ADMIN_AREA_ROLES)).toHaveLength(16)
  })

  it('limits staff member reads to memberships at granted sites and blocks identity writes', async () => {
    const find = async () => ({ docs: [{ member: { id: 'member-a' } }] })
    const memberRead = Members.access?.read as unknown as (args: {
      req: {
        user: { role: string; adminSites: string[] }
        payload: { find: () => Promise<{ docs: Array<{ member: { id: string } }> }> }
      }
    }) => Promise<unknown>
    await expect(
      memberRead({ req: { user: { role: 'staff', adminSites: ['site-a'] }, payload: { find } } }),
    ).resolves.toEqual({ id: { in: ['member-a'] } })
    const identityRead = LinkedIdentities.access?.read as unknown as (args: {
      req: { user: { role: string } }
    }) => boolean
    const identityCreate = LinkedIdentities.access?.create as unknown as (args: {
      req: { user: { role: string } }
    }) => boolean
    expect(identityRead({ req: { user: { role: 'staff' } } })).toBe(false)
    expect(identityCreate({ req: { user: { role: 'owner' } } })).toBe(false)
  })

  it('enforces relation-scoped read, create, update, and delete boundaries', async () => {
    const access = siteScopedRelationAdminAccess({
      relationField: 'parent',
      targetCollection: 'parents',
    })
    const payload = {
      find: async ({ collection }: { collection: string }) =>
        collection === 'content'
          ? { docs: [{ id: 'content-a', site: 'site-a' }] }
          : collection === 'article-family-content'
            ? { docs: [{ id: 'parent-a', content: 'content-a' }] }
            : collection === 'parents'
              ? { docs: [{ id: 'parent-a' }] }
              : { docs: [] },
      findByID: async () => ({ parent: 'parent-a' }),
    }
    const user = { role: 'staff', adminSites: ['site-a'] }
    const invoke = (fn: unknown, args: Record<string, unknown>) =>
      (fn as (value: Record<string, unknown>) => Promise<unknown> | unknown)(args)
    await expect(invoke(access.read, { req: { user, payload } })).resolves.toEqual({
      parent: { in: ['parent-a'] },
    })
    await expect(
      invoke(access.create, { req: { user, payload }, data: { parent: 'parent-a' } }),
    ).resolves.toBe(true)
    await expect(
      invoke(access.create, { req: { user, payload }, data: { parent: 'parent-b' } }),
    ).resolves.toBe(false)
    await expect(
      invoke(access.update, {
        req: { user, payload, pathname: '/api/children' },
        id: 'child-a',
        data: { parent: 'parent-b' },
      }),
    ).resolves.toBe(false)
    await expect(
      invoke(access.delete, {
        req: { user, payload, pathname: '/api/children' },
        id: 'child-a',
      }),
    ).resolves.toBe(true)

    const contentAccess = siteScopedRelationAdminAccess({
      relationField: 'article',
      targetCollection: 'article-family-content',
      targetSitePath: { anchorCollection: 'content', targetRelationField: 'content' },
    })
    await expect(invoke(contentAccess.read, { req: { user, payload } })).resolves.toEqual({
      article: { in: ['parent-a'] },
    })

    const direct = siteScopedAdminAccess()
    const directPayload = {
      findByID: async () => ({ site: 'site-a' }),
    }
    await expect(
      invoke(direct.delete, {
        req: { user, payload: directPayload, pathname: '/api/content' },
        id: 'record-a',
      }),
    ).resolves.toBe(true)
    await expect(
      invoke(direct.delete, {
        req: {
          user: { ...user, adminSites: ['site-b'] },
          payload: directPayload,
          pathname: '/api/content',
        },
        id: 'record-a',
      }),
    ).resolves.toBe(false)
  })
})
