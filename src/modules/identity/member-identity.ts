import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export const MEMBER_SESSION_COOKIE = 'renegade-member'
export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000
export const MEMBER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const MEMBER_AUTH_WINDOW_MS = 60 * 1000

export type IdentityTokenPurpose = 'magic-link-sign-in' | 'identity-link' | 'wallet-nonce'
export type IdentityStore = {
  create(args: Record<string, unknown>): Promise<{ id: string }>
  find(args: {
    collection: string
    where: Record<string, unknown>
    limit: number
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

export function memberMayAuthenticate(member: Record<string, unknown>): boolean {
  return member.status === 'active' && !member.deletionRequestedAt
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
): Promise<{ memberId: string; sessionToken: string } | null> {
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
  if (identities.docs[0]) {
    const member = identities.docs[0].member
    memberId = typeof member === 'string' ? member : String((member as { id?: string }).id)
  } else {
    // The email address itself is intentionally not duplicated in the identity record.
    const member = await store.create({
      collection: 'members',
      overrideAccess: true,
      data: { displayName: 'New member', status: 'active', verifiedEmailAt: now.toISOString() },
    })
    memberId = member.id
    await store.create({
      collection: 'profiles',
      overrideAccess: true,
      data: {
        member: memberId,
        displayName: 'New member',
        handle: `member-${memberId.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(-12)}`,
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
  const memberId = typeof session.member === 'string'
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
export async function changeMemberModeration(
  store: IdentityStore,
  input: { actorUserId: string; memberId: string; status: 'active' | 'disabled' | 'archived'; reason: string },
  now = new Date(),
): Promise<void> {
  const current = await store.findByID({ collection: 'members', id: input.memberId, overrideAccess: true })
  if (current.status === input.status) return
  await store.update({
    collection: 'members', id: input.memberId, overrideAccess: true,
    data: {
      status: input.status,
      disabledAt: input.status === 'disabled' ? now.toISOString() : null,
      archivedAt: input.status === 'archived' ? now.toISOString() : null,
    },
  })
  await audit(store, input.memberId, `member.moderation.${input.status}`, {
    actorUserId: input.actorUserId,
    reason: input.reason.slice(0, 500),
    previousStatus: current.status,
  })
}

async function audit(store: IdentityStore, member: string, event: string, details: Record<string, unknown> = {}) {
  await store.create({
    collection: 'identity-audit-events',
    overrideAccess: true,
    data: { member, event, details },
  })
}
