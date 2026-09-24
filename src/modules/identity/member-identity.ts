import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

import { consumeApiRateLimit } from '../integrations/rate-limit'

export const MEMBER_SESSION_COOKIE = 'renegade-member'
export const MEMBER_CSRF_COOKIE = 'renegade-member-csrf'
export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000
export const MEMBER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const MEMBER_AUTH_WINDOW_MS = 60 * 1000
export const HANDLE_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000
export const PASSKEY_CHALLENGE_TTL_MS = 5 * 60 * 1000

export type IdentityTokenPurpose =
  | 'magic-link-sign-in'
  | 'identity-link'
  | 'wallet-nonce'
  | 'passkey-registration'
  | 'passkey-authentication'

export type MemberAccountState =
  | 'pending'
  | 'active'
  | 'restricted'
  | 'suspended'
  | 'deactivated'
  | 'deletion-pending'
  | 'deleted'

export type RegistrationPolicy = 'open' | 'invite' | 'approval' | 'disabled'
export type IdentityStore = {
  create(args: Record<string, unknown>): Promise<{ id: string }>
  find(args: {
    collection: string
    where: Record<string, unknown>
    limit: number
    depth?: number
    page?: number
    sort?: string
    overrideAccess: boolean
  }): Promise<{ docs: Array<Record<string, unknown>> }>
  findByID(args: {
    collection: string
    id: string
    overrideAccess: boolean
  }): Promise<Record<string, unknown>>
  update(args: {
    collection: string
    id: string
    data: Record<string, unknown>
    overrideAccess: boolean
  }): Promise<unknown>
}

export function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}
export function digest(value: string): string {
  return createHash('sha256').update(value).digest('base64url')
}
export function opaqueToken(): string {
  return randomBytes(32).toString('base64url')
}
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}
export function memberSessionCookie(token: string, secure: boolean): string {
  return `${MEMBER_SESSION_COOKIE}=${token}; Max-Age=${MEMBER_SESSION_TTL_MS / 1000}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
}
export function clearMemberSessionCookie(secure: boolean): string {
  return `${MEMBER_SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
}
export function readMemberSession(headers: Headers): string | undefined {
  const cookie = headers.get('cookie')
  return cookie
    ?.split(';')
    .map((part) => part.trim().split('='))
    .find(([name]) => name === MEMBER_SESSION_COOKIE)?.[1]
}

export function normalizeHandle(value: string): string | null {
  const handle = value.trim().toLowerCase()
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(handle) ? handle : null
}

// Reserved so no member handle can impersonate system routes, staff, or brand namespaces.
export const RESERVED_HANDLES = new Set([
  'admin',
  'administrator',
  'api',
  'auth',
  'community-manager',
  'help',
  'login',
  'logout',
  'member-auth',
  'members',
  'moderator',
  'owner',
  'renegade',
  'root',
  'settings',
  'setup',
  'staff',
  'support',
  'system',
  'www',
])

/** Collapses common homoglyph substitutions so lookalike handles cannot be reserved-name spoofs. */
function foldConfusables(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[0]/g, 'o')
    .replace(/[1lI]/g, 'i')
    .replace(/[5S]/g, 's')
    .replace(/[3E]/g, 'e')
    .replace(/rn/g, 'm')
}

export function canonicalizeHandle(value: string): { error: string } | { handle: string } {
  const handle = normalizeHandle(value)
  if (!handle) return { error: 'Use lowercase letters, numbers, and single hyphens.' }
  const folded = foldConfusables(handle)
  if (RESERVED_HANDLES.has(handle) || RESERVED_HANDLES.has(folded))
    return { error: 'This handle is reserved.' }
  return { handle }
}

export function memberMayAuthenticate(member: Record<string, unknown>): boolean {
  const status = member.status ?? 'active'
  // Legacy states (pre-COMM-01) map to their nearest lifecycle equivalent.
  if (status === 'disabled' || status === 'archived') return false
  return (status === 'active' || status === 'restricted') && !member.deletionRequestedAt
}

/** Process-local login/passkey/magic-link throttle keyed by IP or email hash. Enumeration-safe: always resolves. */
export function enforceAuthRateLimit(clientKey: string): { allowed: boolean; retryAfter: number } {
  const result = consumeApiRateLimit(`member-auth:${clientKey}`, true)
  return { allowed: result.allowed, retryAfter: result.retryAfter }
}

export function issueCsrfToken(): string {
  return opaqueToken()
}
export function csrfCookie(token: string, secure: boolean): string {
  // Readable by client JS so it can be echoed back in a request header (double-submit pattern).
  return `${MEMBER_CSRF_COOKIE}=${token}; Max-Age=${MEMBER_SESSION_TTL_MS / 1000}; Path=/; SameSite=Lax${secure ? '; Secure' : ''}`
}
export function clearCsrfCookie(secure: boolean): string {
  return `${MEMBER_CSRF_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax${secure ? '; Secure' : ''}`
}
export function verifyCsrf(headers: Headers): boolean {
  const cookie = headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim().split('='))
    .find(([name]) => name === MEMBER_CSRF_COOKIE)?.[1]
  const header = headers.get('x-member-csrf')
  return Boolean(cookie && header && safeEqual(cookie, header))
}

export function assertRegistrationAllowed(
  policy: RegistrationPolicy,
  hasInvite: boolean,
): { allowed: boolean; pendingApproval: boolean; reason?: string } {
  if (policy === 'disabled') return { allowed: false, pendingApproval: false, reason: 'closed' }
  if (policy === 'invite' && !hasInvite)
    return { allowed: false, pendingApproval: false, reason: 'invite_required' }
  if (policy === 'approval') return { allowed: true, pendingApproval: true }
  return { allowed: true, pendingApproval: false }
}

/** Falls back to open registration when no Site record exists (single-tenant default install). */
export async function resolveCommunityRegistrationPolicy(payload: {
  find: (args: {
    collection: string
    limit: number
    overrideAccess: boolean
  }) => Promise<{ docs: Array<Record<string, unknown>> }>
}): Promise<RegistrationPolicy> {
  const sites = await payload.find({ collection: 'sites', limit: 1, overrideAccess: true })
  const policy = sites.docs[0]?.communityRegistrationPolicy
  return policy === 'invite' || policy === 'approval' || policy === 'disabled' ? policy : 'open'
}

export async function issueMagicLink(
  store: IdentityStore,
  emailInput: string,
  now = new Date(),
): Promise<{ token?: string; accepted: true }> {
  const email = normalizeEmail(emailInput)
  if (!email) return { accepted: true }
  const emailHash = digest(email)
  const recent = await store.find({
    collection: 'identity-tokens',
    where: {
      and: [
        { emailHash: { equals: emailHash } },
        { purpose: { equals: 'magic-link-sign-in' } },
        { consumedAt: { exists: false } },
      ],
    },
    limit: 1,
    overrideAccess: true,
  })
  const previous = recent.docs[0]
  if (previous && new Date(String(previous.createdAt ?? 0)).getTime() > now.getTime() - 60_000)
    return { accepted: true }
  const token = opaqueToken()
  await store.create({
    collection: 'identity-tokens',
    overrideAccess: true,
    data: {
      purpose: 'magic-link-sign-in',
      tokenHash: digest(token),
      emailHash,
      expiresAt: new Date(now.getTime() + MAGIC_LINK_TTL_MS).toISOString(),
    },
  })
  return { accepted: true, token }
}

export async function consumeMagicLink(
  store: IdentityStore,
  token: string,
  now = new Date(),
  registration: { policy?: RegistrationPolicy; hasInvite?: boolean } = {},
): Promise<{ memberId: string; sessionToken: string; pendingApproval?: boolean } | null> {
  const found = await store.find({
    collection: 'identity-tokens',
    where: { tokenHash: { equals: digest(token) } },
    limit: 1,
    overrideAccess: true,
  })
  const record = found.docs[0]
  if (
    !record ||
    record.purpose !== 'magic-link-sign-in' ||
    record.consumedAt ||
    new Date(String(record.expiresAt)).getTime() <= now.getTime()
  )
    return null
  await store.update({
    collection: 'identity-tokens',
    id: String(record.id),
    data: { consumedAt: now.toISOString() },
    overrideAccess: true,
  })
  const emailHash = String(record.emailHash)
  const identities = await store.find({
    collection: 'linked-identities',
    where: {
      and: [
        { providerKey: { equals: 'renegade-email' } },
        { externalSubject: { equals: emailHash } },
        { revokedAt: { exists: false } },
      ],
    },
    limit: 1,
    overrideAccess: true,
  })
  let memberId: string
  let pendingApproval = false
  if (identities.docs[0]) {
    const member = identities.docs[0].member
    memberId = typeof member === 'string' ? member : String((member as { id?: string }).id)
  } else {
    const decision = assertRegistrationAllowed(
      registration.policy ?? 'open',
      Boolean(registration.hasInvite),
    )
    if (!decision.allowed) {
      await audit(store, 'unknown', 'member.registration_denied', { reason: decision.reason })
      return null
    }
    pendingApproval = decision.pendingApproval
    // The email address itself is intentionally not duplicated in the identity record.
    const member = await store.create({
      collection: 'members',
      overrideAccess: true,
      data: {
        displayName: 'New member',
        status: pendingApproval ? 'pending' : 'active',
        verifiedEmailAt: now.toISOString(),
      },
    })
    memberId = member.id
    await store.create({
      collection: 'profiles',
      overrideAccess: true,
      data: {
        member: memberId,
        displayName: 'New member',
        handle: `member-${memberId
          .replace(/[^a-z0-9]/gi, '')
          .toLowerCase()
          .slice(-12)}`,
        visibility: 'private',
        preferences: {},
      },
    })
    await store.create({
      collection: 'linked-identities',
      overrideAccess: true,
      data: {
        member: memberId,
        kind: 'email-magic-link',
        providerKey: 'renegade-email',
        externalSubject: emailHash,
        verifiedAt: now.toISOString(),
      },
    })
  }
  const member = await store.findByID({
    collection: 'members',
    id: memberId,
    overrideAccess: true,
  })
  if (member.status === 'pending') {
    await audit(store, memberId, 'member.magic_link_pending_approval')
    return { memberId, sessionToken: '', pendingApproval: true }
  }
  if (!memberMayAuthenticate(member)) {
    await audit(store, memberId, 'member.magic_link_rejected', { reason: 'member_not_active' })
    return null
  }
  const sessionToken = opaqueToken()
  await store.create({
    collection: 'member-sessions',
    overrideAccess: true,
    data: {
      member: memberId,
      tokenHash: digest(sessionToken),
      expiresAt: new Date(now.getTime() + MEMBER_SESSION_TTL_MS).toISOString(),
      createdFrom: 'magic-link',
      lastSeenAt: now.toISOString(),
    },
  })
  await audit(store, memberId, 'member.magic_link_consumed')
  return { memberId, sessionToken }
}

export async function currentMember(
  store: IdentityStore,
  token: string | undefined,
  now = new Date(),
): Promise<string | null> {
  if (!token) return null
  const found = await store.find({
    collection: 'member-sessions',
    where: { tokenHash: { equals: digest(token) } },
    limit: 1,
    overrideAccess: true,
  })
  const session = found.docs[0]
  if (
    !session ||
    session.revokedAt ||
    new Date(String(session.expiresAt)).getTime() <= now.getTime()
  )
    return null
  await store.update({
    collection: 'member-sessions',
    id: String(session.id),
    data: { lastSeenAt: now.toISOString() },
    overrideAccess: true,
  })
  const memberId =
    typeof session.member === 'string'
      ? session.member
      : String((session.member as { id?: string }).id)
  const member = await store.findByID({
    collection: 'members',
    id: memberId,
    overrideAccess: true,
  })
  return memberMayAuthenticate(member) ? memberId : null
}

export async function revokeMemberSession(
  store: IdentityStore,
  token: string | undefined,
  now = new Date(),
): Promise<void> {
  if (!token) return
  const found = await store.find({
    collection: 'member-sessions',
    where: { tokenHash: { equals: digest(token) } },
    limit: 1,
    overrideAccess: true,
  })
  if (found.docs[0])
    await store.update({
      collection: 'member-sessions',
      id: String(found.docs[0].id),
      data: { revokedAt: now.toISOString() },
      overrideAccess: true,
    })
}

export async function listMemberSessions(
  store: IdentityStore,
  memberId: string,
): Promise<Array<Record<string, unknown>>> {
  const found = await store.find({
    collection: 'member-sessions',
    where: { member: { equals: memberId } },
    limit: 200,
    overrideAccess: true,
  })
  return found.docs
}

export async function revokeMemberSessionById(
  store: IdentityStore,
  memberId: string,
  sessionId: string,
  now = new Date(),
): Promise<boolean> {
  const session = await store.findByID({
    collection: 'member-sessions',
    id: sessionId,
    overrideAccess: true,
  })
  const owner =
    typeof session.member === 'string'
      ? session.member
      : String((session.member as { id?: string })?.id)
  if (owner !== memberId) return false
  await store.update({
    collection: 'member-sessions',
    id: sessionId,
    data: { revokedAt: now.toISOString() },
    overrideAccess: true,
  })
  return true
}

/** Used by suspension/security-event handling: no session may outlive a state that revokes access. */
export async function revokeAllMemberSessions(
  store: IdentityStore,
  memberId: string,
  now = new Date(),
  exceptSessionId?: string,
): Promise<void> {
  const sessions = await listMemberSessions(store, memberId)
  for (const session of sessions) {
    if (session.revokedAt) continue
    if (exceptSessionId && String(session.id) === exceptSessionId) continue
    await store.update({
      collection: 'member-sessions',
      id: String(session.id),
      data: { revokedAt: now.toISOString() },
      overrideAccess: true,
    })
  }
}

export function walletCapability(): {
  enabled: false
  reason: string
  supportedNamespaces: readonly string[]
} {
  return {
    enabled: false,
    reason:
      'Wallet authentication is disabled until the pinned AppKit/Wagmi/Viem browser smoke matrix is installed.',
    supportedNamespaces: [],
  }
}

const SESSION_REVOKING_STATES: readonly MemberAccountState[] = [
  'suspended',
  'deactivated',
  'deletion-pending',
  'deleted',
]
const STATE_TIMESTAMP_FIELD: Partial<Record<MemberAccountState, string>> = {
  restricted: 'restrictedAt',
  suspended: 'suspendedAt',
  deactivated: 'deactivatedAt',
  'deletion-pending': 'deletionPendingAt',
  deleted: 'deletedAt',
}

/**
 * Single entry point for every member account-lifecycle transition. Applying a
 * session-revoking state here always forcibly ends existing sessions in the
 * same call, so no code path can leave a suspended/deleted member signed in.
 */
export async function changeMemberAccountState(
  store: IdentityStore,
  input: {
    actorUserId: string
    memberId: string
    state: MemberAccountState
    reason: string
  },
  now = new Date(),
): Promise<void> {
  const current = await store.findByID({
    collection: 'members',
    id: input.memberId,
    overrideAccess: true,
  })
  if (current.status === input.state) return
  const timestampField = STATE_TIMESTAMP_FIELD[input.state]
  await store.update({
    collection: 'members',
    id: input.memberId,
    overrideAccess: true,
    data: {
      status: input.state,
      stateReason: input.reason.slice(0, 500),
      ...(timestampField ? { [timestampField]: now.toISOString() } : {}),
    },
  })
  if (SESSION_REVOKING_STATES.includes(input.state)) {
    await revokeAllMemberSessions(store, input.memberId, now)
  }
  await audit(store, input.memberId, `member.state.${input.state}`, {
    actorUserId: input.actorUserId,
    reason: input.reason.slice(0, 500),
    previousStatus: current.status,
  })
}

/** Backward-compatible alias for the legacy three-state moderation surface. */
export async function changeMemberModeration(
  store: IdentityStore,
  input: {
    actorUserId: string
    memberId: string
    status: 'active' | 'disabled' | 'archived'
    reason: string
  },
  now = new Date(),
): Promise<void> {
  const state: MemberAccountState =
    input.status === 'disabled'
      ? 'suspended'
      : input.status === 'archived'
        ? 'deactivated'
        : 'active'
  await changeMemberAccountState(
    store,
    { actorUserId: input.actorUserId, memberId: input.memberId, state, reason: input.reason },
    now,
  )
}

export async function requestMemberDeletion(
  store: IdentityStore,
  memberId: string,
  now = new Date(),
): Promise<void> {
  await changeMemberAccountState(
    store,
    {
      actorUserId: memberId,
      memberId,
      state: 'deletion-pending',
      reason: 'Member requested account deletion.',
    },
    now,
  )
}

/** Anonymizes self-service profile data while retaining moderation/security audit evidence. */
export async function finalizeMemberDeletion(
  store: IdentityStore,
  memberId: string,
  now = new Date(),
): Promise<void> {
  const billingSupporters = await store.find({
    collection: 'supporters',
    where: { member: { equals: memberId } },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })
  const supporterIds = billingSupporters.docs.map((supporter) => String(supporter.id))
  if (supporterIds.length) {
    const entitlements = await store.find({
      collection: 'entitlements',
      where: { supporter: { in: supporterIds } },
      limit: 5000,
      depth: 0,
      overrideAccess: true,
    })
    for (const entitlement of entitlements.docs) {
      if (!entitlement.revokedAt)
        await store.update({
          collection: 'entitlements',
          id: String(entitlement.id),
          overrideAccess: true,
          data: { revokedAt: now.toISOString() },
        })
    }
  }
  const downloadGrants = await store.find({
    collection: 'digital-delivery-grants',
    where: { member: { equals: memberId } },
    limit: 5000,
    depth: 0,
    overrideAccess: true,
  })
  for (const grant of downloadGrants.docs) {
    if (!grant.revokedAt)
      await store.update({
        collection: 'digital-delivery-grants',
        id: String(grant.id),
        overrideAccess: true,
        data: { revokedAt: now.toISOString() },
      })
  }
  await store.update({
    collection: 'members',
    id: memberId,
    overrideAccess: true,
    data: {
      displayName: 'Deleted member',
      email: null,
      status: 'deleted',
      deletedAt: now.toISOString(),
    },
  })
  const profiles = await store.find({
    collection: 'profiles',
    where: { member: { equals: memberId } },
    limit: 1,
    overrideAccess: true,
  })
  const profile = profiles.docs[0]
  if (profile) {
    await store.update({
      collection: 'profiles',
      id: String(profile.id),
      overrideAccess: true,
      data: {
        displayName: 'Deleted member',
        bio: '',
        avatar: null,
        cover: null,
        links: [],
        visibility: 'private',
        discoveryOptOut: true,
        fieldAudience: {},
        locale: null,
        timeZone: null,
        avatarAlt: '',
        coverAlt: '',
      },
    })
  }
  const pool = (
    store as IdentityStore & {
      db?: { pool?: { query: (statement: string, values: unknown[]) => Promise<unknown> } }
    }
  ).db?.pool
  if (pool) {
    // Polymorphic targets live in Payload's relationships_rels join table;
    // its local API does not support filtering `object` by member ID.
    await pool.query(
      `UPDATE relationships AS r SET status = 'archived', ended_at = $2, updated_at = $2
      WHERE r.status <> 'archived' AND (r.subject_id = $1 OR EXISTS (
        SELECT 1 FROM relationships_rels AS rr WHERE rr.parent_id = r.id AND rr.path = 'object' AND rr.members_id = $1
      ))`,
      [memberId, now.toISOString()],
    )
  } else {
    for (;;) {
      const relationships = await store.find({
        collection: 'relationships',
        where: {
          and: [
            { subject: { equals: memberId } },
            { status: { in: ['active', 'pending', 'blocked'] } },
          ],
        },
        limit: 500,
        depth: 0,
        overrideAccess: true,
      })
      if (!relationships.docs.length) break
      await Promise.all(
        relationships.docs.map((relationship) =>
          store.update({
            collection: 'relationships',
            id: String(relationship.id),
            overrideAccess: true,
            data: { status: 'archived', endedAt: now.toISOString() },
          }),
        ),
      )
    }
  }
  await revokeAllMemberSessions(store, memberId, now)
  await audit(store, memberId, 'member.deletion.finalized')
}

export async function exportMemberData(
  store: IdentityStore,
  memberId: string,
): Promise<Record<string, unknown>> {
  const member = await store.findByID({
    collection: 'members',
    id: memberId,
    overrideAccess: true,
  })
  const [profiles, identities, sessions, auditEvents, supporters] = await Promise.all([
    store.find({
      collection: 'profiles',
      where: { member: { equals: memberId } },
      limit: 1,
      overrideAccess: true,
    }),
    store.find({
      collection: 'linked-identities',
      where: { member: { equals: memberId } },
      limit: 200,
      overrideAccess: true,
    }),
    listMemberSessions(store, memberId),
    store.find({
      collection: 'identity-audit-events',
      where: { member: { equals: memberId } },
      limit: 500,
      overrideAccess: true,
    }),
    store.find({
      collection: 'supporters',
      where: { member: { equals: memberId } },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    }),
  ])
  const supporterIds = supporters.docs.map((supporter) => String(supporter.id))
  const [subscriptions, entitlements] = supporterIds.length
    ? await Promise.all([
        store.find({
          collection: 'subscriptions',
          where: { supporter: { in: supporterIds } },
          limit: 1000,
          depth: 0,
          overrideAccess: true,
        }),
        store.find({
          collection: 'entitlements',
          where: { supporter: { in: supporterIds } },
          limit: 2000,
          depth: 0,
          overrideAccess: true,
        }),
      ])
    : [{ docs: [] }, { docs: [] }]
  const relationships: Array<Record<string, unknown>> = []
  for (let page = 1; ; page++) {
    const batch = await store.find({
      collection: 'relationships',
      where: { subject: { equals: memberId } },
      limit: 500,
      page,
      sort: 'id',
      depth: 0,
      overrideAccess: true,
    })
    relationships.push(...batch.docs)
    if (batch.docs.length < 500) break
  }
  return {
    member: {
      displayName: member.displayName,
      email: member.email,
      status: member.status,
      verifiedEmailAt: member.verifiedEmailAt,
      createdAt: member.createdAt,
    },
    profile: profiles.docs[0] ?? null,
    billing: {
      subscriptions: subscriptions.docs.map((subscription) => ({
        state: subscription.state,
        source: subscription.source,
        plan: subscription.planSnapshot,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        trialEnd: subscription.trialEnd,
        graceEnd: subscription.graceEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        createdAt: subscription.createdAt,
      })),
      entitlements: entitlements.docs.map((entitlement) => ({
        resource: entitlement.resource,
        capability: entitlement.capability,
        site: entitlement.site,
        scope: entitlement.scope,
        source: entitlement.source,
        startsAt: entitlement.startsAt,
        endsAt: entitlement.endsAt,
        revokedAt: entitlement.revokedAt,
      })),
    },
    relationships: relationships.map((relationship) => ({
      site: relationship.site,
      targetMemberId:
        typeof relationship.object === 'string'
          ? relationship.object
          : typeof relationship.object === 'object' && relationship.object !== null
            ? (() => {
                const value = (relationship.object as { value?: string | { id?: string } }).value
                return typeof value === 'string' ? value : (value?.id ?? null)
              })()
            : null,
      kind: relationship.kind,
      status: relationship.status,
      createdAt: relationship.createdAt,
      endedAt: relationship.endedAt,
    })),
    linkedIdentities: identities.docs.map((identity) => ({
      kind: identity.kind,
      providerKey: identity.providerKey,
      verifiedAt: identity.verifiedAt,
      revokedAt: identity.revokedAt,
    })),
    sessions: sessions.map((session) => ({
      createdFrom: session.createdFrom,
      deviceLabel: session.deviceLabel,
      lastSeenAt: session.lastSeenAt,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
    })),
    auditEvents: auditEvents.docs.map((event) => ({
      event: event.event,
      details: event.details,
      createdAt: event.createdAt,
    })),
  }
}

async function memberVerifiedIdentityCount(
  store: IdentityStore,
  memberId: string,
): Promise<number> {
  const identities = await store.find({
    collection: 'linked-identities',
    where: {
      and: [
        { member: { equals: memberId } },
        { verifiedAt: { exists: true } },
        { revokedAt: { exists: false } },
      ],
    },
    limit: 200,
    overrideAccess: true,
  })
  return identities.docs.length
}

export async function requestEmailLink(
  store: IdentityStore,
  memberId: string,
  emailInput: string,
  now = new Date(),
): Promise<{ token?: string }> {
  const email = normalizeEmail(emailInput)
  if (!email) return {}
  const token = opaqueToken()
  await store.create({
    collection: 'identity-tokens',
    overrideAccess: true,
    data: {
      purpose: 'identity-link',
      tokenHash: digest(token),
      emailHash: digest(email),
      member: memberId,
      expiresAt: new Date(now.getTime() + MAGIC_LINK_TTL_MS).toISOString(),
    },
  })
  return { token }
}

export async function confirmEmailLink(
  store: IdentityStore,
  token: string,
  now = new Date(),
): Promise<boolean> {
  const found = await store.find({
    collection: 'identity-tokens',
    where: { tokenHash: { equals: digest(token) } },
    limit: 1,
    overrideAccess: true,
  })
  const record = found.docs[0]
  if (
    !record ||
    record.purpose !== 'identity-link' ||
    record.consumedAt ||
    !record.member ||
    new Date(String(record.expiresAt)).getTime() <= now.getTime()
  )
    return false
  await store.update({
    collection: 'identity-tokens',
    id: String(record.id),
    data: { consumedAt: now.toISOString() },
    overrideAccess: true,
  })
  const memberId =
    typeof record.member === 'string'
      ? record.member
      : String((record.member as { id?: string }).id)
  const existing = await store.find({
    collection: 'linked-identities',
    where: {
      and: [
        { providerKey: { equals: 'renegade-email' } },
        { externalSubject: { equals: String(record.emailHash) } },
      ],
    },
    limit: 1,
    overrideAccess: true,
  })
  if (existing.docs[0]) return false // Address already linked elsewhere; never silently reassign.
  await store.create({
    collection: 'linked-identities',
    overrideAccess: true,
    data: {
      member: memberId,
      kind: 'email-magic-link',
      providerKey: 'renegade-email',
      externalSubject: String(record.emailHash),
      verifiedAt: now.toISOString(),
    },
  })
  await audit(store, memberId, 'member.identity.linked', { kind: 'email-magic-link' })
  return true
}

/** Refuses to remove a member's last verified recovery method. */
export async function unlinkIdentity(
  store: IdentityStore,
  memberId: string,
  identityId: string,
  now = new Date(),
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const identity = await store.findByID({
    collection: 'linked-identities',
    id: identityId,
    overrideAccess: true,
  })
  const owner =
    typeof identity.member === 'string'
      ? identity.member
      : String((identity.member as { id?: string })?.id)
  if (owner !== memberId) return { ok: false, reason: 'not_found' }
  if (identity.revokedAt) return { ok: true }
  const verifiedCount = await memberVerifiedIdentityCount(store, memberId)
  if (verifiedCount <= 1) return { ok: false, reason: 'last_recovery_method' }
  await store.update({
    collection: 'linked-identities',
    id: identityId,
    data: { revokedAt: now.toISOString() },
    overrideAccess: true,
  })
  await audit(store, memberId, 'member.identity.unlinked', { kind: identity.kind })
  return { ok: true }
}

/** Canonicalizes, checks reserved/uniqueness, and enforces a change cooldown, recording history for redirects. */
export async function changeMemberHandle(
  store: IdentityStore,
  memberId: string,
  requestedHandle: string,
  now = new Date(),
): Promise<{ ok: true; handle: string } | { ok: false; reason: string }> {
  const canonical = canonicalizeHandle(requestedHandle)
  if ('error' in canonical) return { ok: false, reason: canonical.error }
  const profiles = await store.find({
    collection: 'profiles',
    where: { member: { equals: memberId } },
    limit: 1,
    overrideAccess: true,
  })
  const profile = profiles.docs[0]
  if (!profile) return { ok: false, reason: 'profile_not_found' }
  if (profile.handle === canonical.handle) return { ok: true, handle: canonical.handle }
  const changedAt = profile.handleChangedAt ? new Date(String(profile.handleChangedAt)) : null
  if (changedAt && now.getTime() - changedAt.getTime() < HANDLE_CHANGE_COOLDOWN_MS) {
    return { ok: false, reason: 'cooldown_active' }
  }
  const taken = await store.find({
    collection: 'profiles',
    where: { handle: { equals: canonical.handle } },
    limit: 1,
    overrideAccess: true,
  })
  if (taken.docs[0] && String(taken.docs[0].id) !== String(profile.id)) {
    return { ok: false, reason: 'handle_taken' }
  }
  const history = Array.isArray(profile.handleHistory) ? profile.handleHistory : []
  await store.update({
    collection: 'profiles',
    id: String(profile.id),
    overrideAccess: true,
    data: {
      handle: canonical.handle,
      handleChangedAt: now.toISOString(),
      handleHistory: [...history, { handle: profile.handle, changedAt: now.toISOString() }],
    },
  })
  await audit(store, memberId, 'member.handle.changed', {
    previousHandle: profile.handle,
    handle: canonical.handle,
  })
  return { ok: true, handle: canonical.handle }
}

async function audit(
  store: IdentityStore,
  member: string,
  event: string,
  details: Record<string, unknown> = {},
) {
  await store.create({
    collection: 'identity-audit-events',
    overrideAccess: true,
    data: { member, event, details },
  })
}
