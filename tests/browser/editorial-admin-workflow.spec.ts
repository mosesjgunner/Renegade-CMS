import { randomUUID } from 'node:crypto'

import { expect, test } from '@playwright/test'
import config from '@payload-config'
import { getPayload } from 'payload'

import { loadConfig } from '@/modules/core/config'
import { createPasskeySession } from '@/modules/operations/passkey-auth'

const appUrl = process.env.E2E_APP_URL ?? 'http://localhost:3110'

test('Posts and Pages complete the server-authoritative draft-to-public editorial journey', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000)
  const payload = await getPayload({ config })
  const suffix = randomUUID().slice(0, 8)
  const user = (await payload.create({
    collection: 'users',
    data: { email: `editorial-${suffix}@example.test`, role: 'owner' },
    overrideAccess: true,
  } as never)) as unknown as { id: string; email: string }
  const site = await payload.create({
    collection: 'sites',
    data: { name: `Editorial ${suffix}`, slug: `editorial-${suffix}`, lifecycle: 'active' },
    overrideAccess: true,
  } as never)
  await payload.create({
    collection: 'publications',
    data: {
      site: site.id,
      name: `Editorial ${suffix}`,
      slug: `editorial-${suffix}`,
      canonicalBasePath: '/',
      status: 'active',
      visibility: 'public',
    },
    overrideAccess: true,
  } as never)
  const session = await createPasskeySession(
    { id: String(user.id), email: user.email },
    loadConfig().payloadSecret,
    async (sessionId, expiresAt) => {
      await payload.db.pool.query(
        'INSERT INTO admin_sessions (id,user_id,expires_at) VALUES ($1,$2,$3)',
        [sessionId, user.id, expiresAt],
      )
    },
  )
  await context.addCookies([
    { name: 'renegade-passkey', value: session.token, url: appUrl },
  ])

  for (const [adminPath, kind] of [
    ['/admin/posts', 'Post'],
    ['/admin/pages', 'Page'],
  ] as const) {
    const title = `${kind} editorial proof ${suffix}`
    const firstBody = `${kind} draft body ${suffix}.`
    const editedBody = `${kind} edited body ${suffix}.`
    const originalSlug = `${kind.toLowerCase()}-editorial-${suffix}`
    const changedSlug = `${originalSlug}-renamed`

    await page.goto(adminPath)
    await expect(page.getByRole('heading', { name: `${kind}s` })).toBeVisible()
    await page.getByRole('button', { name: `Create ${kind}` }).click()
    await page.getByLabel('Title').fill(title)
    await page.getByLabel('URL slug').fill(originalSlug)
    await page.getByLabel('Body').fill(firstBody)
    await page.getByLabel('Summary').fill(`${kind} metadata description ${suffix}`)
    await page.getByRole('button', { name: 'Save draft' }).click()
    await expect(page.getByText(`${kind} save.`, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: `Back to ${kind}s` }).click()
    await page.getByRole('button', { name: title }).click()
    await expect(page.getByLabel('Body')).toHaveValue(firstBody)
    await page.getByLabel('Body').fill(editedBody)
    await page.getByRole('button', { name: 'Save draft' }).click()
    await expect(page.getByText(`${kind} save.`, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Request review' }).click()
    await expect(page.getByText(`${kind} request review.`, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Approve' }).click()
    await expect(page.getByText(`${kind} approve.`, { exact: true })).toBeVisible()

    const preview = page.waitForEvent('popup')
    await page.getByRole('button', { name: 'Preview' }).click()
    const previewPage = await preview
    await expect(previewPage.getByRole('heading', { name: title })).toBeVisible()
    await expect(previewPage.getByText(editedBody)).toBeVisible()
    await previewPage.close()

    await page.getByRole('button', { name: 'Publish' }).click()
    await expect(page.getByText(`${kind} published.`, { exact: true })).toBeVisible()
    const publicLink = page.getByRole('link', { name: new RegExp(`/${originalSlug}$`) })
    await expect(publicLink).toBeVisible()
    const originalHref = await publicLink.getAttribute('href')
    if (!originalHref) throw new Error('Published canonical URL was not rendered.')
    const originalPath = new URL(originalHref, appUrl).pathname
    await page.goto(originalPath)
    await expect(page.getByRole('heading', { name: title })).toBeVisible()
    await expect(page.getByText(editedBody)).toBeVisible()
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      `${kind} metadata description ${suffix}`,
    )
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      new RegExp(`${originalPath}$`),
    )

    await page.goto(adminPath)
    await page.getByRole('button', { name: title }).click()
    await page.getByLabel('URL slug').fill(changedSlug)
    await page.getByRole('button', { name: 'Publish' }).click()
    const changedPath = originalPath.replace(originalSlug, changedSlug)
    await expect
      .poll(
        async () => {
          const redirect = await fetch(new URL(originalPath, appUrl), { redirect: 'manual' })
          return `${redirect.status}:${redirect.headers.get('location') ?? ''}`
        },
        { timeout: 10_000 },
      )
      .toBe(`308:${changedPath}`)
    await page.goto(originalPath)
    expect(new URL(page.url()).pathname).toBe(changedPath)
  }
})
