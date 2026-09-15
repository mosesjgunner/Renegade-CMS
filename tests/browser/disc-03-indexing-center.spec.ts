import { expect, test } from '@playwright/test'
import config from '@payload-config'
import { getPayload } from 'payload'

import { loadConfig } from '@/modules/core/config'
import { createPasskeySession } from '@/modules/operations/passkey-auth'

test('DISC-03: authenticated Indexing Center exposes crawler health and manual handoff', async ({
  page,
  context,
  baseURL: fixtureBaseURL,
}) => {
  const payload = await getPayload({ config })
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
  const baseURL = process.env.DISC03_BASE_URL || fixtureBaseURL || 'http://localhost:3110'
  await context.addCookies([{ name: 'renegade-passkey', value: session.token, url: baseURL }])
  await page.goto(`${baseURL}/admin/indexing`)
  await expect(page.getByRole('heading', { name: 'Indexing Center' })).toBeVisible()
  await expect(page.getByText(/eligible canonical URLs/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Submission state' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Provider configuration' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Download manual handoff JSON' })).toBeVisible()
  const handoff = await page.request.get(`${baseURL}/api/admin/indexing/export`)
  expect(handoff.status()).toBe(200)
  await expect(handoff.json()).resolves.toMatchObject({
    format: 'renegade-indexing-handoff',
    provider: 'manual',
  })
})
