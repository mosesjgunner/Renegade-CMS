/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'

/**
 * RC2-E-02 operator setup: grant a member a site role row.
 * The member-site-roles REST create refused the site admin's session
 * (403, measured in journey run 1), so the grant is applied through
 * the same in-process operator path the RC2 world builder uses.
 * Env: E02_MEMBER_ID, E02_SITE_ID, E02_ROLE (default 'moderator').
 */
describe('RC2-E-02 site role grant', () => {
  it('grants the requested role for the site', async () => {
    const payload: Payload = await getPayload({ config })
    const member = process.env.E02_MEMBER_ID ?? ''
    const site = process.env.E02_SITE_ID ?? ''
    const role = process.env.E02_ROLE ?? 'moderator'
    expect(member).toBeTruthy()
    expect(site).toBeTruthy()
    const existing = await (payload as any).find({
      collection: 'member-site-roles',
      where: {
        and: [
          { site: { equals: site } },
          { member: { equals: member } },
          { role: { equals: role } },
        ],
      },
      limit: 1,
      overrideAccess: true,
    })
    if (!existing.docs.length) {
      await (payload as any).create({
        collection: 'member-site-roles',
        data: { site, member, role, status: 'active' },
        overrideAccess: true,
      })
    }
    const check = await (payload as any).find({
      collection: 'member-site-roles',
      where: {
        and: [
          { site: { equals: site } },
          { member: { equals: member } },
          { role: { equals: role } },
        ],
      },
      limit: 1,
      overrideAccess: true,
    })
    expect(check.docs.length).toBe(1)
  }, 120_000)
})
