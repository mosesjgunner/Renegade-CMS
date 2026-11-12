/* eslint-disable @typescript-eslint/no-explicit-any */
import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import {
  consumeMagicLink,
  currentMember,
  issueMagicLink,
} from '../../src/modules/identity/member-identity'

/**
 * RC2-E-01 service proof: session expiry and storage hygiene, exercised
 * against the production identity functions (a 30-day session cannot be
 * expired by waiting in an acceptance run, so the session row's expiry
 * is backdated and the real session resolver must refuse it).
 */
describe('RC2-E-01 session expiry (service proof)', () => {
  it('refuses a session whose stored expiry has passed, and stores only a token hash', async () => {
    const payload: Payload = await getPayload({ config })
    const email = `e01-expiry-${Date.now().toString(36)}@example.com`
    const issued = await issueMagicLink(payload as any, email)
    expect(issued.token).toBeTruthy()
    const consumed = await consumeMagicLink(payload as any, String(issued.token), new Date(), {})
    expect(consumed?.memberId).toBeTruthy()
    expect(consumed?.sessionToken).toBeTruthy()

    const sessions = await (payload as any).find({
      collection: 'member-sessions',
      where: { member: { equals: consumed!.memberId } },
      limit: 5,
      depth: 0,
      overrideAccess: true,
    })
    const row = sessions.docs[sessions.docs.length - 1]
    expect(row).toBeTruthy()
    const verdict: Record<string, unknown> = {
      storesHashOnly: typeof row.tokenHash === 'string' && !('token' in row),
      liveSessionAccepted: false,
      expiredSessionAccepted: true,
    }
    verdict.liveSessionAccepted =
      (await currentMember(payload as any, String(consumed!.sessionToken))) ===
      String(consumed!.memberId)

    await (payload as any).update({
      collection: 'member-sessions',
      id: row.id,
      data: { expiresAt: new Date(Date.now() - 60_000).toISOString() },
      overrideAccess: true,
    })
    verdict.expiredSessionAccepted =
      (await currentMember(payload as any, String(consumed!.sessionToken))) !== null
    writeFileSync('/tmp/e01-expiry-verdict.json', JSON.stringify(verdict, null, 2))
    expect(verdict.storesHashOnly).toBe(true)
    expect(verdict.liveSessionAccepted).toBe(true)
    expect(verdict.expiredSessionAccepted).toBe(false)
  }, 120_000)
})
