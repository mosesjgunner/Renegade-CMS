import { describe, expect, it, vi } from 'vitest'

import {
  createStaffEnrollmentToken,
  getStaffEnrollmentDetails,
  beginStaffPasskeyEnrollment,
  completeStaffPasskeyEnrollment,
  revokeStaffInvitation,
  StaffEnrollmentError,
  hashValue,
} from '../../src/modules/operations/staff-enrollment'
import { resolveOperatorGrantContext, checkOperatorSiteAccess } from '../../src/modules/operations/operator-grants'

describe('RC08D-02: Staff Enrollment and Canonical Site Grants', () => {
  const secret = 'test-secret-key-12345678901234567890'
  const config = {
    payloadSecret: secret,
    appUrl: 'http://localhost:3000',
    ownerEmail: 'owner@renegadeparty.test',
  } as any

  function createMockPayload() {
    const users: Record<string, any> = {
      'user-owner': {
        id: 'user-owner',
        email: 'owner@renegadeparty.test',
        role: 'owner',
        member: 'member-owner',
      },
    }
    const members: Record<string, any> = {
      'member-owner': {
        id: 'member-owner',
        email: 'owner@renegadeparty.test',
        displayName: 'owner',
        status: 'active',
      },
    }
    const sites: Record<string, any> = {
      'site-alpha': { id: 'site-alpha', name: 'Alpha Site', slug: 'alpha-site' },
      'site-beta': { id: 'site-beta', name: 'Beta Site', slug: 'beta-site' },
    }
    const memberSiteRoles: Record<string, any> = {
      'msr-owner-alpha': {
        id: 'msr-owner-alpha',
        site: 'site-alpha',
        member: 'member-owner',
        role: 'community-manager',
      },
      'msr-owner-beta': {
        id: 'msr-owner-beta',
        site: 'site-beta',
        member: 'member-owner',
        role: 'community-manager',
      },
    }
    const identityTokens: Record<string, any> = {}
    const passkeys: Record<string, any> = {
      'pk-owner': {
        id: 'pk-owner',
        user_id: 'user-owner',
        credential_id: 'cred-owner-1',
        public_key: 'pubkey-owner',
        counter: 1,
      },
    }
    const adminSessions: Record<string, any> = {
      'sess-owner': {
        id: 'sess-owner',
        user_id: 'user-owner',
        expires_at: new Date(Date.now() + 3600000),
        revoked_at: null,
      },
    }
    const auditEvents: any[] = []

    const pool = {
      query: async (text: string, values?: unknown[]) => {
        if (text.includes('UPDATE identity_tokens') && text.includes('consumed_at = now()')) {
          if (text.includes('WHERE id = $1 AND consumed_at IS NULL')) {
            const id = values?.[0] as string
            const token = identityTokens[id]
            if (token && !token.consumed_at) {
              token.consumed_at = new Date()
              return { rows: [{ id }], rowCount: 1 }
            }
            return { rows: [], rowCount: 0 }
          }
          if (text.includes('WHERE purpose = \'passkey-registration\' AND email_hash = $1')) {
            const emailHash = values?.[0] as string
            for (const t of Object.values(identityTokens)) {
              if (t.emailHash === emailHash && !t.consumed_at) {
                t.consumed_at = new Date()
              }
            }
            return { rows: [], rowCount: 1 }
          }
          if (text.includes('WHERE token_hash = $1 AND consumed_at IS NULL')) {
            const tokenHash = values?.[0] as string
            for (const t of Object.values(identityTokens)) {
              if (t.tokenHash === tokenHash && !t.consumedAt && !t.consumed_at) {
                t.consumedAt = new Date().toISOString()
                t.consumed_at = new Date()
                t.metadata = { ...(t.metadata || {}), revoked: true }
              }
            }
            return { rows: [], rowCount: 1 }
          }
          if (text.includes('WHERE purpose = \'passkey-registration\' AND (metadata->>\'userId\') = $1')) {
            const userId = values?.[0] as string
            for (const t of Object.values(identityTokens)) {
              if (t.metadata?.userId === userId && !t.consumed_at) {
                t.consumed_at = new Date()
                t.metadata = { ...(t.metadata || {}), revoked: true }
              }
            }
            return { rows: [], rowCount: 1 }
          }
        }
        if (text.includes('SELECT metadata, consumed_at FROM identity_tokens WHERE id = $1')) {
          const id = values?.[0] as string
          const token = identityTokens[id]
          if (token) return { rows: [{ metadata: token.metadata, consumed_at: token.consumed_at }] }
          return { rows: [] }
        }
        if (text.includes('UPDATE identity_tokens')) {
          const jsonVal = values?.[0] as string
          const id = values?.[1] as string
          if (identityTokens[id]) {
            identityTokens[id].metadata = {
              ...identityTokens[id].metadata,
              ...JSON.parse(jsonVal),
            }
            return { rows: [{ id }], rowCount: 1 }
          }
          return { rows: [], rowCount: 0 }
        }
        if (text.includes('SELECT id FROM passkeys WHERE user_id = $1')) {
          const userId = values?.[0] as string
          const matches = Object.values(passkeys).filter((p) => p.user_id === userId)
          return { rows: matches }
        }
        if (text.includes('INSERT INTO passkeys')) {
          const [userId, credId, pubKey, counter, devType, backedUp, name, transports] = values as any[]
          const id = `pk-${Date.now()}`
          passkeys[id] = { id, user_id: userId, credential_id: credId, public_key: pubKey, counter, device_type: devType, backed_up: backedUp, name, transports }
          return { rows: [{ id }], rowCount: 1 }
        }
        if (text.includes('INSERT INTO admin_auth_audit_events')) {
          auditEvents.push(values)
          return { rows: [], rowCount: 1 }
        }
        if (text.includes('UPDATE admin_sessions SET revoked_at = now() WHERE user_id = $1')) {
          const userId = values?.[0] as string
          for (const s of Object.values(adminSessions)) {
            if (s.user_id === userId) s.revoked_at = new Date()
          }
          return { rows: [], rowCount: 1 }
        }
        return { rows: [] }
      },
    }

    const payload: any = {
      db: { pool },
      find: async ({ collection, where }: any) => {
        if (collection === 'users') {
          const email = where?.email?.equals
          const matches = Object.values(users).filter((u) => !email || u.email === email)
          return { docs: matches }
        }
        if (collection === 'members') {
          const email = where?.email?.equals
          const matches = Object.values(members).filter((m) => !email || m.email === email)
          return { docs: matches }
        }
        if (collection === 'sites') {
          return { docs: Object.values(sites) }
        }
        if (collection === 'member-site-roles') {
          const memberId = where?.member?.equals
          const andConditions = where?.and || []
          let matches = Object.values(memberSiteRoles)
          if (memberId) matches = matches.filter((r) => r.member === memberId)
          for (const cond of andConditions) {
            if (cond.site?.equals) matches = matches.filter((r) => r.site === cond.site.equals)
            if (cond.member?.equals) matches = matches.filter((r) => r.member === cond.member.equals)
          }
          return { docs: matches }
        }
        if (collection === 'identity-tokens') {
          const and = where?.and || []
          let matches = Object.values(identityTokens)
          for (const cond of and) {
            if (cond.purpose?.equals) matches = matches.filter((t) => t.purpose === cond.purpose.equals)
            if (cond.tokenHash?.equals) matches = matches.filter((t) => t.tokenHash === cond.tokenHash.equals)
          }
          return { docs: matches }
        }
        return { docs: [] }
      },
      findByID: async ({ collection, id }: any) => {
        if (collection === 'users') return users[id] || null
        if (collection === 'members') return members[id] || null
        if (collection === 'sites') return sites[id] || null
        return null
      },
      create: async ({ collection, data }: any) => {
        const id = `${collection}-${Date.now()}-${Math.random().toString(36).substring(7)}`
        const record = { id, ...data }
        if (collection === 'users') users[id] = record
        if (collection === 'members') members[id] = record
        if (collection === 'member-site-roles') memberSiteRoles[id] = record
        if (collection === 'identity-tokens') identityTokens[id] = record
        return record
      },
      update: async ({ collection, id, data }: any) => {
        if (collection === 'users' && users[id]) Object.assign(users[id], data)
        if (collection === 'members' && members[id]) Object.assign(members[id], data)
        if (collection === 'identity-tokens' && identityTokens[id]) Object.assign(identityTokens[id], data)
        return { id, ...data }
      },
      auth: async ({ headers }: any) => {
        const authHeader = headers?.get?.('authorization') || headers?.authorization
        if (authHeader === 'Bearer owner') return { user: users['user-owner'] }
        if (authHeader === 'Bearer staff') return { user: users['user-staff'] }
        return { user: null }
      },
    }

    return { payload, users, members, sites, memberSiteRoles, identityTokens, passkeys, adminSessions, auditEvents }
  }

  describe('1. Create and Invite Staff with Bounded Authority', () => {
    it('creates staff account, canonical member, site role and issues single-use token', async () => {
      const { payload, users, members, memberSiteRoles, identityTokens } = createMockPayload()

      const result = await createStaffEnrollmentToken(payload, config, {
        email: 'staff-editor@renegadeparty.test',
        role: 'staff',
        siteId: 'site-alpha',
        invitedByUserId: 'user-owner',
      })

      expect(result.enrollmentToken).toBeTruthy()
      expect(result.enrollmentUrl).toBe(`http://localhost:3000/enroll?token=${result.enrollmentToken}`)
      expect(result.user.email).toBe('staff-editor@renegadeparty.test')
      expect(result.user.role).toBe('staff')
      expect(result.siteId).toBe('site-alpha')

      // Verifies canonical Member linkage
      const staffUser = Object.values(users).find((u) => u.email === 'staff-editor@renegadeparty.test')
      expect(staffUser).toBeDefined()
      expect(staffUser?.member).toBeDefined()

      const staffMember = Object.values(members).find((m) => m.email === 'staff-editor@renegadeparty.test')
      expect(staffMember).toBeDefined()
      expect(staffUser?.member).toBe(staffMember?.id)

      // Verifies canonical site-team membership grant
      const roles = Object.values(memberSiteRoles).filter(
        (r) => r.member === staffMember?.id && r.site === 'site-alpha',
      )
      expect(roles).toHaveLength(1)
      expect(roles[0].role).toBe('contributor')

      // Verifies bounded token in identity-tokens
      const tokens = Object.values(identityTokens).filter(
        (t) => t.purpose === 'passkey-registration' && t.member === staffMember?.id,
      )
      expect(tokens).toHaveLength(1)
      expect(tokens[0].consumed_at).toBeUndefined()
      expect(tokens[0].metadata.userId).toBe(staffUser?.id)
      expect(tokens[0].metadata.siteId).toBe('site-alpha')
    })

    it('rejects invalid email formats', async () => {
      const { payload } = createMockPayload()
      await expect(
        createStaffEnrollmentToken(payload, config, {
          email: 'invalid-email',
          role: 'staff',
        }),
      ).rejects.toThrow('Enter a valid email address.')
    })

    it('prevents privilege escalation to owner', async () => {
      const { payload } = createMockPayload()
      await expect(
        createStaffEnrollmentToken(payload, config, {
          email: 'escalate@renegadeparty.test',
          role: 'owner' as any,
        }),
      ).rejects.toThrow('Role must be staff or administrator.')
    })
  })

  describe('2. Bounded Enrollment Authority & Security Negatives', () => {
    it('verifies valid invitation details', async () => {
      const { payload } = createMockPayload()
      const created = await createStaffEnrollmentToken(payload, config, {
        email: 'editor@renegadeparty.test',
        role: 'staff',
        siteId: 'site-alpha',
      })

      const details = await getStaffEnrollmentDetails(payload, config, created.enrollmentToken, 'site-alpha')
      expect(details.valid).toBe(true)
      expect(details.email).toBe('editor@renegadeparty.test')
      expect(details.role).toBe('staff')
      expect(details.siteId).toBe('site-alpha')
    })

    it('rejects expired enrollment tokens', async () => {
      const { payload, identityTokens } = createMockPayload()
      const created = await createStaffEnrollmentToken(payload, config, {
        email: 'expired@renegadeparty.test',
        role: 'staff',
        validHours: -1, // in the past
      })

      // Manually backdate in mock store
      const tokenDoc = Object.values(identityTokens)[0]
      tokenDoc.expiresAt = new Date(Date.now() - 10000).toISOString()

      await expect(
        getStaffEnrollmentDetails(payload, config, created.enrollmentToken),
      ).rejects.toThrow('This enrollment invitation has expired.')
    })

    it('rejects wrong-site enrollment attempts', async () => {
      const { payload } = createMockPayload()
      const created = await createStaffEnrollmentToken(payload, config, {
        email: 'site-scoped@renegadeparty.test',
        role: 'staff',
        siteId: 'site-alpha',
      })

      await expect(
        getStaffEnrollmentDetails(payload, config, created.enrollmentToken, 'site-beta'),
      ).rejects.toThrow('This enrollment invitation is not valid for the requested site.')
    })

    it('rejects already used (replay) tokens', async () => {
      const { payload, identityTokens } = createMockPayload()
      const created = await createStaffEnrollmentToken(payload, config, {
        email: 'used@renegadeparty.test',
        role: 'staff',
      })

      // Mark token as consumed
      const tokenDoc = Object.values(identityTokens)[0]
      tokenDoc.consumedAt = new Date().toISOString()

      await expect(
        getStaffEnrollmentDetails(payload, config, created.enrollmentToken),
      ).rejects.toThrow('This enrollment invitation has already been used')
    })

    it('allows owner to revoke a staff invitation', async () => {
      const { payload } = createMockPayload()
      const created = await createStaffEnrollmentToken(payload, config, {
        email: 'revokeme@renegadeparty.test',
        role: 'staff',
      })

      // Owner revokes invitation
      const rev = await revokeStaffInvitation(payload, config, {
        token: created.enrollmentToken,
        requestedByUserId: 'user-owner',
      })
      expect(rev.status).toBe('revoked')

      // Subsequent attempt fails with used/revoked
      await expect(
        getStaffEnrollmentDetails(payload, config, created.enrollmentToken),
      ).rejects.toThrow('This enrollment invitation has already been used or revoked.')
    })

    it('prevents non-owner from revoking invitations', async () => {
      const { payload, users } = createMockPayload()
      users['user-staff-1'] = { id: 'user-staff-1', email: 's1@test.com', role: 'staff' }
      const created = await createStaffEnrollmentToken(payload, config, {
        email: 'test@renegadeparty.test',
        role: 'staff',
      })

      await expect(
        revokeStaffInvitation(payload, config, {
          token: created.enrollmentToken,
          requestedByUserId: 'user-staff-1',
        }),
      ).rejects.toThrow('Only owners can revoke staff invitations.')
    })
  })

  describe('3. Passkey Registration Challenge and Completion', () => {
    it('begins passkey registration challenge and updates token metadata', async () => {
      const { payload } = createMockPayload()
      const created = await createStaffEnrollmentToken(payload, config, {
        email: 'passkey-enroll@renegadeparty.test',
        role: 'staff',
        siteId: 'site-alpha',
      })

      const begin = await beginStaffPasskeyEnrollment(payload, config, {
        enrollmentToken: created.enrollmentToken,
      })

      expect(begin.options.challenge).toBeTruthy()
      expect(begin.options.rp.id).toBe('localhost')
      expect(begin.email).toBe('passkey-enroll@renegadeparty.test')
      expect(begin.role).toBe('staff')
    })
  })

  describe('4. Canonical Operator Role / Action Matrix', () => {
    it('exercises owner authority across all operational domains', async () => {
      const { payload } = createMockPayload()
      const ownerUser = { id: 'user-owner', role: 'owner', member: 'member-owner' }

      const grant = await resolveOperatorGrantContext(payload, ownerUser)
      expect(grant.authorized).toBe(true)
      expect(grant.isGlobalOwner).toBe(true)
      expect(grant.authorizedSiteIds).toEqual(['site-alpha', 'site-beta'])

      // Admin entry: allowed
      expect(grant.authorized).toBe(true)

      // Content & Connections: allowed on site-a and site-b
      expect(await checkOperatorSiteAccess(payload, ownerUser, 'site-alpha')).toBe(true)
      expect(await checkOperatorSiteAccess(payload, ownerUser, 'site-beta')).toBe(true)
    })

    it('exercises staff authority: strictly bounded to granted site-team roles', async () => {
      const { payload, users } = createMockPayload()
      const staffUser = { id: 'user-staff-alpha', role: 'staff', member: 'member-staff-alpha' }
      users['user-staff-alpha'] = staffUser

      // Grant site-alpha ONLY
      const { memberSiteRoles } = createMockPayload()
      payload.find = async ({ collection, where }: any) => {
        if (collection === 'member-site-roles') {
          return {
            docs: [
              {
                id: 'msr-staff-alpha',
                site: 'site-alpha',
                member: 'member-staff-alpha',
                role: 'contributor',
              },
            ],
          }
        }
        return { docs: [] }
      }

      const grant = await resolveOperatorGrantContext(payload, staffUser)
      expect(grant.authorized).toBe(true)
      expect(grant.isGlobalOwner).toBe(false)
      expect(grant.authorizedSiteIds).toEqual(['site-alpha'])

      // Content/Integrations on site-alpha: ALLOWED
      expect(await checkOperatorSiteAccess(payload, staffUser, 'site-alpha')).toBe(true)

      // Content/Integrations on site-beta (cross-tenant): DENIED
      expect(await checkOperatorSiteAccess(payload, staffUser, 'site-beta')).toBe(false)
    })

    it('denies anonymous and non-operator actors across all admin domains', async () => {
      const { payload } = createMockPayload()

      // Anonymous actor
      const anonGrant = await resolveOperatorGrantContext(payload, null)
      expect(anonGrant.authorized).toBe(false)
      expect(anonGrant.isGlobalOwner).toBe(false)
      expect(anonGrant.authorizedSiteIds).toEqual([])
      expect(await checkOperatorSiteAccess(payload, null, 'site-alpha')).toBe(false)

      // Ordinary community member actor (no staff role)
      const memberActor = { id: 'member-reader', role: 'member', member: 'member-reader' }
      const memberGrant = await resolveOperatorGrantContext(payload, memberActor)
      expect(memberGrant.authorized).toBe(false)
      expect(await checkOperatorSiteAccess(payload, memberActor, 'site-alpha')).toBe(false)
    })
  })
})
