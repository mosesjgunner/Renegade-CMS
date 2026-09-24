import { describe, it, expect } from 'vitest'
import { evaluateCommunityPolicy, sanitizeProfileProjection } from '@/modules/community/policy'
import type { CommunityActor, CommunityPolicyContext } from '@/modules/community/contracts'

describe('COMM-00: Community Domain Policy Engine', () => {
  const defaultSiteId = 'site-alpha'
  const otherSiteId = 'site-beta'

  const activeMember: CommunityActor = {
    kind: 'member',
    memberId: 'mem-101',
    isStaff: false,
    isModerator: false,
    status: 'active',
  }

  const anonymousActor: CommunityActor = {
    kind: 'anonymous',
    isStaff: false,
    isModerator: false,
  }

  const suspendedMember: CommunityActor = {
    kind: 'member',
    memberId: 'mem-999',
    isStaff: false,
    isModerator: false,
    status: 'disabled',
  }

  const moderatorActor: CommunityActor = {
    kind: 'member',
    memberId: 'mod-1',
    isStaff: false,
    isModerator: true,
    status: 'active',
  }

  describe('1. Multi-Site Boundary Isolation', () => {
    it('denies access when target object belongs to another site', () => {
      const context: CommunityPolicyContext = { siteId: defaultSiteId, actor: activeMember }
      const decision = evaluateCommunityPolicy(context, { siteId: otherSiteId }, 'read')
      expect(decision.allowed).toBe(false)
      expect(decision.status).toBe(403)
      expect(decision.reason).toBe('cross_site_forbidden')
    })

    it('allows access when site matches context', () => {
      const context: CommunityPolicyContext = { siteId: defaultSiteId, actor: activeMember }
      const decision = evaluateCommunityPolicy(
        context,
        { siteId: defaultSiteId, visibility: 'public', moderationState: 'clear' },
        'read',
      )
      expect(decision.allowed).toBe(true)
    })
  })

  describe('2. Actor Account Status Enforcement', () => {
    it('denies all actions if actor is suspended or disabled', () => {
      const context: CommunityPolicyContext = { siteId: defaultSiteId, actor: suspendedMember }
      const decision = evaluateCommunityPolicy(context, { siteId: defaultSiteId }, 'comment')
      expect(decision.allowed).toBe(false)
      expect(decision.status).toBe(403)
      expect(decision.reason).toBe('member_suspended')
    })
  })

  describe('3. Block & Relationship Precedence', () => {
    it('denies interaction and read when relationship is blocked', () => {
      const context: CommunityPolicyContext = { siteId: defaultSiteId, actor: activeMember }
      const decision = evaluateCommunityPolicy(
        context,
        { siteId: defaultSiteId, authorMemberId: 'mem-other' },
        'message',
        { isBlocked: true },
      )
      expect(decision.allowed).toBe(false)
      expect(decision.status).toBe(403)
      expect(decision.reason).toBe('blocked_communication')
    })
  })

  describe('4. Moderation State Enforcement', () => {
    it('masks removed content from ordinary members', () => {
      const context: CommunityPolicyContext = { siteId: defaultSiteId, actor: activeMember }
      const decision = evaluateCommunityPolicy(
        context,
        { siteId: defaultSiteId, moderationState: 'removed' },
        'read',
      )
      expect(decision.allowed).toBe(false)
      expect(decision.status).toBe(404)
      expect(decision.reason).toBe('content_removed')
    })

    it('allows moderators to inspect removed content for review', () => {
      const context: CommunityPolicyContext = { siteId: defaultSiteId, actor: moderatorActor }
      const decision = evaluateCommunityPolicy(
        context,
        { siteId: defaultSiteId, moderationState: 'removed' },
        'read',
      )
      expect(decision.allowed).toBe(true)
    })

    it('requires moderator capability to perform moderation action', () => {
      const memberContext: CommunityPolicyContext = { siteId: defaultSiteId, actor: activeMember }
      const denied = evaluateCommunityPolicy(memberContext, { siteId: defaultSiteId }, 'moderate')
      expect(denied.allowed).toBe(false)
      expect(denied.status).toBe(403)

      const modContext: CommunityPolicyContext = { siteId: defaultSiteId, actor: moderatorActor }
      const allowed = evaluateCommunityPolicy(modContext, { siteId: defaultSiteId }, 'moderate')
      expect(allowed.allowed).toBe(true)
    })
  })

  describe('5. Write Constraints & Authentication', () => {
    it('denies anonymous commenting or replying', () => {
      const context: CommunityPolicyContext = { siteId: defaultSiteId, actor: anonymousActor }
      const decision = evaluateCommunityPolicy(context, { siteId: defaultSiteId }, 'comment')
      expect(decision.allowed).toBe(false)
      expect(decision.status).toBe(401)
      expect(decision.reason).toBe('authentication_required')
    })

    it('denies commenting when commentsPolicy is closed', () => {
      const context: CommunityPolicyContext = { siteId: defaultSiteId, actor: activeMember }
      const decision = evaluateCommunityPolicy(
        context,
        { siteId: defaultSiteId, commentsPolicy: 'closed' },
        'comment',
      )
      expect(decision.allowed).toBe(false)
      expect(decision.status).toBe(403)
      expect(decision.reason).toBe('comments_closed')
    })

    it('denies replying when discussion status is locked', () => {
      const context: CommunityPolicyContext = { siteId: defaultSiteId, actor: activeMember }
      const decision = evaluateCommunityPolicy(
        context,
        { siteId: defaultSiteId, status: 'locked' },
        'reply',
      )
      expect(decision.allowed).toBe(false)
      expect(decision.status).toBe(403)
      expect(decision.reason).toBe('discussion_locked')
    })
  })

  describe('6. Retention, Tombstones, and Burn Rules', () => {
    it('denies access when retention hold is burn', () => {
      const context: CommunityPolicyContext = { siteId: defaultSiteId, actor: activeMember }
      const decision = evaluateCommunityPolicy(
        context,
        { siteId: defaultSiteId, retentionHold: 'burn' },
        'read',
      )
      expect(decision.allowed).toBe(false)
      expect(decision.status).toBe(410)
      expect(decision.reason).toBe('record_burned')
    })

    it('redacts tombstoned content', () => {
      const context: CommunityPolicyContext = { siteId: defaultSiteId, actor: activeMember }
      const decision = evaluateCommunityPolicy(
        context,
        { siteId: defaultSiteId, status: 'removed' },
        'read',
      )
      expect(decision.allowed).toBe(false)
      expect(decision.redacted).toBe(true)
    })
  })

  describe('7. Profile Projection Sanitization', () => {
    it('never leaks auth secrets, password hashes, or session tokens', () => {
      const rawProfileWithSecrets: Record<string, unknown> = {
        id: 'prof-123',
        handle: 'renegade_reader',
        displayName: 'Renegade Reader',
        bio: 'Passionate reader and contributor',
        avatarUrl: 'https://cdn.example.com/avatar.jpg',
        createdAt: '2026-09-20T12:00:00.000Z',
        // Private / sensitive / auth fields that must NEVER leak:
        passwordHash: '$2b$12$e874982347109238',
        email: 'reader@private-domain.com',
        apiKey: 'sec_live_9999999',
        sessionToken: 'sess_secret_token_123',
        stripeCustomerId: 'cus_12345',
        passkeyCredentials: [{ id: 'cred_1', publicKey: 'abc' }],
      }

      const projected = sanitizeProfileProjection(rawProfileWithSecrets)

      expect(projected.id).toBe('prof-123')
      expect(projected.handle).toBe('renegade_reader')
      expect(projected.displayName).toBe('Renegade Reader')
      expect(projected.bio).toBe('Passionate reader and contributor')
      expect(projected.avatarUrl).toBe('https://cdn.example.com/avatar.jpg')

      // Strict guarantees against credential / contact leakage:
      const projectedRecord = projected as unknown as Record<string, unknown>
      expect(projectedRecord.passwordHash).toBeUndefined()
      expect(projectedRecord.email).toBeUndefined()
      expect(projectedRecord.apiKey).toBeUndefined()
      expect(projectedRecord.sessionToken).toBeUndefined()
      expect(projectedRecord.stripeCustomerId).toBeUndefined()
      expect(projectedRecord.passkeyCredentials).toBeUndefined()
    })
  })
})
