/* eslint-disable @typescript-eslint/no-explicit-any */
import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { operatorSession } from '../fixtures/rc2-world'

/**
 * RC2-D-04 helper: mint a passkey session for Site A's owner principal.
 * Site-settings updates require an all-sites operator (the global owner),
 * which the world manifest does not carry a cookie for.
 */
describe('RC2-D-04 owner session', () => {
  it('mints the owner session', async () => {
    const payload: Payload = await getPayload({ config })
    const owners = await (payload as any).find({
      collection: 'users',
      where: { role: { equals: 'owner' } },
      limit: 10,
      depth: 0,
      overrideAccess: true,
    })
    const ownerA = owners.docs.find((u: any) => String(u.email).includes('owner-a-'))
    expect(ownerA).toBeTruthy()
    const headers = await operatorSession(payload, {
      key: 'ownerA',
      userId: String(ownerA.id),
      email: String(ownerA.email),
    } as any)
    const cookie = headers.get('cookie')
    expect(cookie).toBeTruthy()
    writeFileSync('/tmp/d04-owner.json', JSON.stringify({ cookie }, null, 2))
  }, 120_000)
})
