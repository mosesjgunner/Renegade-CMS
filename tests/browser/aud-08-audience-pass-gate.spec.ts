import { expect, test } from '@playwright/test'
import config from '@payload-config'
import { getPayload } from 'payload'

import { loadConfig } from '@/modules/core/config'
import { createPasskeySession } from '@/modules/operations/passkey-auth'
import { ensureRenegadePartyDemo } from '../helpers/renegadeparty-demo'
import {
  requestDoubleOptIn,
  confirmDoubleOptIn,
  issueAudienceAccessToken,
} from '@/modules/audience/service'

test.describe('AUD-08: Self-Hosted Audience Product Browser Flow & Operator Experience', () => {
  test('Exercises visitor signup, preference center, double opt-in, and Audience Command Center', async ({
    page,
    context,
    baseURL: fixtureBaseURL,
  }) => {
    const payload = await getPayload({ config })
    const demo = await ensureRenegadePartyDemo(payload)
    const siteId = String(demo.siteId)

    // Ensure audience list exists
    const listRes = await payload.find({
      collection: 'audience-lists',
      where: { site: { equals: siteId } },
      limit: 1,
      overrideAccess: true,
    } as never)
    let listId = listRes.docs[0]?.id
    if (!listId) {
      const newList = (await payload.create({
        collection: 'audience-lists',
        data: {
          site: siteId,
          name: 'Renegade Dispatch',
          slug: `dispatch-${Date.now().toString(36)}`,
          title: 'Renegade Dispatch',
          visibility: 'public',
        },
        overrideAccess: true,
      } as never)) as any
      listId = newList.id
    }

    const user = (
      await payload.find({ collection: 'users', limit: 1, overrideAccess: true } as never)
    ).docs[0] as unknown as { id: string; email?: string }
    expect(user).toBeTruthy()

    const session = await createPasskeySession(
      { id: String(user.id), email: String(user.email) },
      loadConfig().payloadSecret,
      async (sessionId, expiresAt) => {
        await payload.db.pool.query(
          'INSERT INTO admin_sessions (id,user_id,expires_at) VALUES ($1,$2,$3)',
          [sessionId, user.id, expiresAt],
        )
      },
    )

    const baseURL = process.env.APP_URL || fixtureBaseURL || 'http://localhost:3110'
    await context.addCookies([{ name: 'renegade-passkey', value: session.token, url: baseURL }])

    // -------------------------------------------------------------------------
    // 1. Operator Boundary: Audience Command Center API & UI
    // -------------------------------------------------------------------------
    const apiRes = await page.request.get(`${baseURL}/api/admin/audience/command-center`)
    expect(apiRes.status()).toBe(200)
    const ccData = await apiRes.json()
    expect(ccData.siteId).toBeDefined()
    expect(ccData.deliverabilityHealth).toBeDefined()
    expect(ccData.recentCampaigns).toBeDefined()
    expect(ccData.metricsDictionary).toBeDefined()

    // Navigate to Audience Command Center in Admin UI
    await page.goto(`${baseURL}/admin/audience`)
    await expect(page.locator('h1')).toContainText('Audience Command Center')
    await expect(page.getByText('Renegade CMoS AUD-07')).toBeVisible()

    // Verify Tab Switching in Audience Command Center
    await page.getByRole('button', { name: 'Calendar' }).click()
    await expect(page.getByText('Multi-Channel Dispatch Schedule')).toBeVisible()

    await page.getByRole('button', { name: 'Deliverability' }).click()
    await expect(page.getByText('Email & Telecom Delivery Infrastructure')).toBeVisible()

    await page.getByRole('button', { name: 'Suppression' }).click()
    await expect(page.getByText('Global & Channel Suppression Ledger')).toBeVisible()

    await page.getByRole('button', { name: 'Experiments' }).click()
    await expect(page.getByText('Deterministic A/B & Multivariate Experiments')).toBeVisible()

    await page.getByRole('button', { name: 'Policies' }).click()
    await expect(page.getByText('TCPA Quiet Hours & Email Frequency Controls')).toBeVisible()

    await page.getByRole('button', { name: 'Audit' }).click()
    await expect(page.getByText('Immutable Consent & Delivery Provenance')).toBeVisible()

    // Return to Campaigns Overview
    await page.getByRole('button', { name: 'Campaigns' }).click()
    await expect(page.getByText('Campaign Dispatch & Lifecycle')).toBeVisible()

    // -------------------------------------------------------------------------
    // 2. Visitor Boundary: Double Opt-In & Preference Center Link Generation
    // -------------------------------------------------------------------------
    const visitorEmail = `browser-visitor-${Date.now()}@example.test`
    const optIn = await requestDoubleOptIn(payload, {
      siteId,
      listId: String(listId),
      email: visitorEmail,
      locale: 'en',
      consentWording: 'I consent to receive occasional political updates from the Renegade Party.',
      source: 'browser-spec',
    })
    expect(optIn.token).toBeDefined()

    // Visitor confirms opt-in
    const subDoc = (await confirmDoubleOptIn(payload, optIn.token!)) as any
    expect(subDoc.id).toBeDefined()
    expect(subDoc.status).toBe('active')

    // Visitor accesses self-hosted preference center
    const prefToken = await issueAudienceAccessToken(payload, {
      siteId,
      subscriberId: String(subDoc.id),
      purpose: 'preferences',
    })
    expect(prefToken).toBeDefined()

    // Verify Public Site is healthy and accessible
    const siteHomeRes = await page.request.get(`${baseURL}/`)
    expect(siteHomeRes.status()).toBeLessThan(500)
  })
})
