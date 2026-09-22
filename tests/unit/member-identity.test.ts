import { describe, expect, it } from 'vitest'
import {
  changeMemberAccountState,
  changeMemberHandle,
  consumeMagicLink,
  currentMember,
  digest,
  finalizeMemberDeletion,
  exportMemberData,
  issueMagicLink,
  normalizeEmail,
  requestMemberDeletion,
  MEMBER_CSRF_COOKIE,
  MEMBER_SESSION_COOKIE,
  memberSessionCookie,
  csrfCookie,
  verifyCsrf,
  walletCapability,
} from '../../src/modules/identity/member-identity'
import {
  beginMemberPasskeyLogin,
  beginMemberPasskeyRegistration,
} from '../../src/modules/identity/member-passkey'

class MemoryStore {
  records = new Map<string, Array<Record<string, unknown>>>()
  sequence = 0
  async create(args: Record<string, unknown>) {
    const collection = String(args.collection)
    const record = {
      ...(args.data as Record<string, unknown>),
      id: `id-${++this.sequence}`,
      createdAt: new Date().toISOString(),
    }
    this.records.set(collection, [...(this.records.get(collection) ?? []), record])
    return record as { id: string }
  }
  private matches(record: Record<string, unknown>, where: Record<string, unknown>): boolean {
    if (Array.isArray(where.and)) return where.and.every((item) => this.matches(record, item))
    if (Array.isArray(where.or)) return where.or.some((item) => this.matches(record, item))
    return Object.entries(where).every(([key, condition]) => {
      if (key === 'and' || key === 'or') return true
      const value = record[key]
      if (!condition || typeof condition !== 'object') return value === condition
      const filter = condition as { equals?: unknown; exists?: boolean; in?: unknown[] }
      if ('equals' in filter) return value === filter.equals
      if ('exists' in filter) return filter.exists ? value != null : value == null
      if ('in' in filter) return filter.in?.includes(value) ?? false
      return false
    })
  }
  async find(args: {
    collection: string
    where: Record<string, unknown>
    limit?: number
    page?: number
  }) {
    const all = this.records.get(args.collection) ?? []
    const matches = all.filter((record) => this.matches(record, args.where))
    const offset = ((args.page ?? 1) - 1) * (args.limit ?? matches.length)
    return { docs: matches.slice(offset, offset + (args.limit ?? matches.length)) }
  }
  async findByID(args: { collection: string; id: string }) {
    const record = (this.records.get(args.collection) ?? []).find((value) => value.id === args.id)
    if (!record) throw new Error('not found')
    return record
  }
  async update(args: { collection: string; id: string; data: Record<string, unknown> }) {
    const records = this.records.get(args.collection) ?? []
    const record = records.find((value) => value.id === args.id)
    if (record) Object.assign(record, args.data)
    return record
  }
}

describe('member identity', () => {
  it('normalizes valid emails without accepting malformed addresses', () => {
    expect(normalizeEmail(' MEMBER@EXAMPLE.TEST ')).toBe('member@example.test')
    expect(normalizeEmail('not-an-email')).toBeNull()
  })
  it('issues a hashed, expiring, single-use magic link and a revocable session', async () => {
    const store = new MemoryStore()
    const issued = await issueMagicLink(store as never, 'member@example.test')
    expect(issued.token).toBeTruthy()
    expect(JSON.stringify([...store.records.values()])).not.toContain(issued.token!)
    const first = await consumeMagicLink(store as never, issued.token!)
    expect(first?.memberId).toBeTruthy()
    expect(await currentMember(store as never, first?.sessionToken)).toBe(first?.memberId)
    expect(await consumeMagicLink(store as never, issued.token!)).toBeNull()
  })
  it('keeps wallet authentication capability-gated until its browser matrix is installed', () => {
    expect(walletCapability()).toEqual(
      expect.objectContaining({ enabled: false, supportedNamespaces: [] }),
    )
    expect(digest('token')).not.toBe('token')
  })
  it('rejects suspended members even if they retain an unexpired link or session', async () => {
    const store = new MemoryStore()
    const issued = await issueMagicLink(store as never, 'member@example.test')
    const signedIn = await consumeMagicLink(store as never, issued.token!)
    const member = (store.records.get('members') ?? [])[0]
    member.status = 'disabled'
    expect(await currentMember(store as never, signedIn?.sessionToken)).toBeNull()
  })
  it('uses a distinct HttpOnly member session and requires a matching CSRF double-submit token', () => {
    const token = 'member-csrf-token'
    expect(MEMBER_SESSION_COOKIE).toBe('renegade-member')
    expect(MEMBER_CSRF_COOKIE).toBe('renegade-member-csrf')
    expect(memberSessionCookie('opaque-session', true)).toContain('HttpOnly')
    expect(csrfCookie(token, true)).not.toContain('HttpOnly')
    expect(
      verifyCsrf(new Headers({ cookie: `${MEMBER_CSRF_COOKIE}=${token}`, 'x-member-csrf': token })),
    ).toBe(true)
    expect(
      verifyCsrf(
        new Headers({ cookie: `${MEMBER_CSRF_COOKIE}=${token}`, 'x-member-csrf': 'other' }),
      ),
    ).toBe(false)
  })
  it('revokes all sessions and records the lifecycle reason when staff suspends a member', async () => {
    const store = new MemoryStore()
    const issued = await issueMagicLink(store as never, 'member@example.test')
    const signedIn = await consumeMagicLink(store as never, issued.token!)
    await changeMemberAccountState(store as never, {
      actorUserId: 'staff-1',
      memberId: signedIn!.memberId,
      state: 'suspended',
      reason: 'Abuse report',
    })
    const member = await store.findByID({ collection: 'members', id: signedIn!.memberId })
    expect(member).toMatchObject({ status: 'suspended', stateReason: 'Abuse report' })
    expect(await currentMember(store as never, signedIn!.sessionToken)).toBeNull()
    expect(store.records.get('identity-audit-events')).toEqual(
      expect.arrayContaining([expect.objectContaining({ event: 'member.state.suspended' })]),
    )
  })
  it('anonymizes the profile and revokes access when deletion is finalized', async () => {
    const store = new MemoryStore()
    const issued = await issueMagicLink(store as never, 'member@example.test')
    const signedIn = await consumeMagicLink(store as never, issued.token!)
    await store.create({
      collection: 'profiles',
      data: { member: signedIn!.memberId, displayName: 'Member', handle: 'member', bio: 'Private' },
    })
    await requestMemberDeletion(store as never, signedIn!.memberId)
    await finalizeMemberDeletion(store as never, signedIn!.memberId)
    const member = await store.findByID({ collection: 'members', id: signedIn!.memberId })
    const profile = (store.records.get('profiles') ?? [])[0]
    expect(member).toMatchObject({ status: 'deleted', displayName: 'Deleted member', email: null })
    expect(profile).toMatchObject({ displayName: 'Deleted member', visibility: 'private', bio: '' })
    expect(await currentMember(store as never, signedIn!.sessionToken)).toBeNull()
  })
  it('changes handles only after the cooldown and preserves redirect history', async () => {
    const store = new MemoryStore()
    const profile = await store.create({
      collection: 'profiles',
      data: { member: 'member-1', displayName: 'Member', handle: 'member-one' },
    })
    await changeMemberHandle(
      store as never,
      'member-1',
      'member-two',
      new Date('2026-09-20T12:00:00Z'),
    )
    expect(await store.findByID({ collection: 'profiles', id: String(profile.id) })).toMatchObject({
      handle: 'member-two',
      handleHistory: [{ handle: 'member-one', changedAt: '2026-09-20T12:00:00.000Z' }],
    })
  })
  it('exports and archives relationship graphs beyond one result page', async () => {
    const store = new MemoryStore()
    const member = await store.create({
      collection: 'members',
      data: { displayName: 'Member', status: 'active' },
    })
    for (let index = 0; index < 501; index++)
      await store.create({
        collection: 'relationships',
        data: {
          subject: member.id,
          object: `other-${index}`,
          site: 'site-1',
          kind: 'follow',
          status: 'active',
        },
      })
    const exported = await exportMemberData(store as never, member.id)
    expect(exported.relationships).toHaveLength(501)
    await finalizeMemberDeletion(store as never, member.id)
    expect(
      (store.records.get('relationships') ?? []).every((edge) => edge.status === 'archived'),
    ).toBe(true)
  })
  it('persists only a hashed, expiring passkey challenge for enrollment and sign-in', async () => {
    const store = new MemoryStore()
    const enrollment = await beginMemberPasskeyRegistration(store as never, {
      memberId: 'member-1',
      memberEmail: 'member@example.test',
      appUrl: 'https://community.example.test',
    })
    const login = await beginMemberPasskeyLogin(store as never, 'https://community.example.test')
    const tokens = store.records.get('identity-tokens') ?? []
    expect(enrollment.options.rp.id).toBe('community.example.test')
    expect(login.options.rpId).toBe('community.example.test')
    expect(tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          purpose: 'passkey-registration',
          tokenHash: digest(enrollment.challengeToken),
        }),
        expect.objectContaining({
          purpose: 'passkey-authentication',
          tokenHash: digest(login.challengeToken),
        }),
      ]),
    )
    expect(JSON.stringify(tokens)).not.toContain(enrollment.challengeToken)
    expect(JSON.stringify(tokens)).not.toContain(login.challengeToken)
  })
})
