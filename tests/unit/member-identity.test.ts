import { describe, expect, it } from 'vitest'
import {
  consumeMagicLink,
  currentMember,
  digest,
  issueMagicLink,
  normalizeEmail,
  walletCapability,
} from '../../src/modules/identity/member-identity'

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
  async find(args: { collection: string; where: Record<string, unknown> }) {
    const all = this.records.get(args.collection) ?? []
    const tokenHash = (args.where.tokenHash as { equals?: string } | undefined)?.equals
    const matches = tokenHash ? all.filter((record) => record.tokenHash === tokenHash) : all
    return { docs: matches }
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
})
