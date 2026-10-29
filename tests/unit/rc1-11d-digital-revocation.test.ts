/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest'
import {
  revokeOrderDigitalAccess,
  deliveryGrantAvailable,
} from '../../src/modules/commerce/digital-delivery'

describe('11D terminal financial access', () => {
  it('revokes every grant and entitlement through the scoped canonical source', async () => {
    const update = vi.fn()
    const find = vi.fn(async ({ collection, where, pagination }: any) => {
      expect(pagination).toBe(false)
      if (collection === 'entitlements') {
        expect(where).toEqual({ source: { equals: 'order:42' } })
        return { docs: [{ id: 'ent-1' }, { id: 'ent-2' }] }
      }
      return { docs: [{ id: `grant:${where.entitlement.equals}` }] }
    })
    await revokeOrderDigitalAccess({ find, update } as any, '42')
    expect(update).toHaveBeenCalledTimes(4)
    expect(update.mock.calls.map(([input]) => input.id)).toEqual([
      'grant:ent-1',
      'ent-1',
      'grant:ent-2',
      'ent-2',
    ])
    for (const [input] of update.mock.calls) expect(input.data.revokedAt).toBeTruthy()
  })
  it('does not present future, revoked or exhausted grants as available', () => {
    const base = { id: 'grant', entitlement: {}, downloadCount: 0 }
    expect(deliveryGrantAvailable(base)).toBe(true)
    expect(deliveryGrantAvailable({ ...base, revokedAt: new Date().toISOString() })).toBe(false)
    expect(deliveryGrantAvailable({ ...base, entitlement: { startsAt: '2999-01-01' } })).toBe(false)
    expect(
      deliveryGrantAvailable({ ...base, entitlement: { revokedAt: new Date().toISOString() } }),
    ).toBe(false)
    expect(deliveryGrantAvailable({ ...base, downloadLimit: 1, downloadCount: 1 })).toBe(false)
  })
})
