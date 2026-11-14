import { describe, expect, it, vi } from 'vitest'

import { resolveOperatorGrantContext } from '../../src/modules/operations/operator-grants'

// RC2-H-07 regression test: CONCURRENT grant resolutions for the same
// (request, user) share one in-flight database resolution. Payload's
// permissions pass (payload.auth) evaluates access for every collection
// concurrently; before this change each evaluation re-ran the grant
// queries (~1,100 SQL statements per admin auth, measured RC2-H-06/H-07).
// Sequential calls must still resolve fresh: flows that change a user's
// grants mid-request and re-evaluate access depend on it (see
// tests/unit/related-site-access.test.ts).

function stubPayload() {
  const find = vi.fn(async ({ collection }: { collection: string }) => {
    if (collection === 'member-site-roles') {
      return {
        docs: [{ site: 'site-1', member: 'member-1', role: 'administrator' }],
      }
    }
    if (collection === 'sites') {
      return { docs: [{ id: 'site-1' }] }
    }
    return { docs: [] }
  })
  return { payload: { find } as never, find }
}

const adminUser = {
  id: 'user-1',
  email: 'admin@example.test',
  role: 'administrator',
  member: 'member-1',
}

describe('resolveOperatorGrantContext in-flight dedupe', () => {
  it('shares one resolution across concurrent calls for the same request and user', async () => {
    const { payload, find } = stubPayload()
    const req = {}
    const [first, second] = await Promise.all([
      resolveOperatorGrantContext(payload, adminUser, req),
      resolveOperatorGrantContext(payload, adminUser, req),
    ])
    expect(first.authorized).toBe(true)
    expect(second).toEqual(first)
    // One resolution = role-grants find + all-sites find.
    expect(find).toHaveBeenCalledTimes(2)
  })

  it('resolves fresh on sequential calls within the same request', async () => {
    const { payload, find } = stubPayload()
    const req = {}
    await resolveOperatorGrantContext(payload, adminUser, req)
    await resolveOperatorGrantContext(payload, adminUser, req)
    expect(find).toHaveBeenCalledTimes(4)
  })

  it('does not share across requests or users, even concurrently', async () => {
    const { payload, find } = stubPayload()
    await Promise.all([
      resolveOperatorGrantContext(payload, adminUser, {}),
      resolveOperatorGrantContext(payload, adminUser, {}),
      resolveOperatorGrantContext(payload, { ...adminUser, id: 'user-2', member: 'member-2' }, {}),
    ])
    // The two distinct-request calls use different req objects above, and
    // the third is a different user: three resolutions = 6 finds. (The two
    // same-user calls get separate req objects here on purpose.)
    expect(find).toHaveBeenCalledTimes(6)
  })

  it('keeps the uncached behavior when no request is passed', async () => {
    const { payload, find } = stubPayload()
    await resolveOperatorGrantContext(payload, adminUser)
    await resolveOperatorGrantContext(payload, adminUser)
    expect(find).toHaveBeenCalledTimes(4)
  })

  it('returns identical grants with and without dedupe', async () => {
    const { payload } = stubPayload()
    const uncached = await resolveOperatorGrantContext(payload, adminUser)
    const deduped = await resolveOperatorGrantContext(payload, adminUser, {})
    expect(deduped).toEqual(uncached)
    expect(deduped.authorizedSiteIds).toEqual(['site-1'])
  })
})
