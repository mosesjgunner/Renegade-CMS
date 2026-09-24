import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import config from '@payload-config'
import { getPayload } from 'payload'
import { finalizeMemberDeletion, issueMagicLink } from '@/modules/identity/member-identity'

test('COMM-02 three clean browsers enforce profile audiences, follows, blocks and discovery', async ({
  browser,
  request,
}) => {
  test.setTimeout(180_000)
  const payload = await getPayload({ config })
  const settings = await payload.findGlobal({ slug: 'site-settings', overrideAccess: true })
  const original = settings.canonicalOriginsBySite
  const sites = await payload.find({
    collection: 'sites',
    where: { lifecycle: { equals: 'active' } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  expect(sites.docs.length).toBe(1)
  const siteId = String(sites.docs[0].id)
  const origins = Object.fromEntries(
    Object.entries((original ?? {}) as Record<string, string>).filter(
      ([, origin]) => origin !== 'http://localhost:3110',
    ),
  )
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ])
  const pages = await Promise.all(contexts.map((context) => context.newPage()))
  const memberIds: string[] = []
  const marker = randomUUID().slice(0, 8)
  try {
    await payload.updateGlobal({
      slug: 'site-settings',
      data: { canonicalOriginsBySite: { ...origins, [siteId]: 'http://localhost:3110' } },
      overrideAccess: true,
    })
    const handles: string[] = []
    for (let index = 0; index < pages.length; index++) {
      const page = pages[index]
      const issued = await issueMagicLink(
        payload as never,
        `comm02-${marker}-${index}@example.test`,
      )
      expect(issued.token).toBeTruthy()
      await page.goto(`/member-auth/verify?token=${encodeURIComponent(issued.token!)}`)
      await expect(page.getByRole('status')).toHaveText('Signed in.')
      const me = await page.request.get('/api/member-auth/me')
      expect(me.ok()).toBe(true)
      const account = await me.json()
      memberIds.push(account.memberId)
      await page.getByRole('link', { name: 'Member settings' }).click()
      await expect(page.getByRole('textbox', { name: 'Handle' })).toHaveValue(/^member-/)
      const handle = `comm02-${marker}-${index}`
      handles.push(handle)
      await page
        .getByRole('textbox', { name: 'Display name' })
        .fill(`COMM-02 member ${marker} ${index}`)
      await page.getByRole('textbox', { name: 'Handle' }).fill(handle)
      await page
        .getByRole('textbox', { name: 'Bio', exact: true })
        .fill(`Private bio ${marker} ${index}`)
      await page.getByLabel('Visibility', { exact: true }).selectOption('public')
      await page.getByLabel('Bio audience').selectOption(index === 0 ? 'followers' : 'private')
      await page.getByRole('button', { name: 'Save profile' }).click()
      await expect(page.getByRole('status')).toHaveText('Profile saved.')
      const saved = await page.request.get('/api/member-auth/me')
      expect((await saved.json()).profile).toMatchObject({ handle, visibility: 'public' })
    }

    const [, follower, stranger] = pages
    const publicProfile = await stranger.request.get(
      `/api/community/profiles/${handles[0]}?siteId=${siteId}`,
    )
    expect(publicProfile.status(), await publicProfile.text()).toBe(200)
    await stranger.goto(`/members/${handles[0]}`)
    await expect(
      stranger.getByRole('heading', { name: `COMM-02 member ${marker} 0` }),
    ).toBeVisible()
    await expect(stranger.getByText(`Private bio ${marker} 0`)).toHaveCount(0)
    await follower.goto(`/members/${handles[0]}`)
    await follower.getByRole('button', { name: 'Follow', exact: true }).click()
    await expect(follower.getByRole('status')).toHaveText('Follow enabled.')
    await follower.reload()
    await expect(follower.getByText(`Private bio ${marker} 0`)).toBeVisible()
    await expect(stranger.getByText(`Private bio ${marker} 0`)).toHaveCount(0)

    await stranger.goto('/members')
    await stranger.getByRole('textbox', { name: 'Search members' }).fill(`COMM-02 member ${marker}`)
    await stranger.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(stranger.getByRole('link', { name: `COMM-02 member ${marker} 0` })).toBeVisible()
    await expect(stranger.getByText(`Private bio ${marker} 0`)).toHaveCount(0)

    await follower.getByRole('button', { name: 'Block' }).click()
    const blocked = await follower.request.get(
      `/api/community/profiles/${handles[0]}?siteId=${siteId}`,
    )
    expect(blocked.status()).toBe(404)
    const blockedPage = await follower.goto(`/members/${handles[0]}`)
    expect(blockedPage?.status()).toBe(404)
    await stranger.goto(`/members/${handles[0]}`)
    await expect(
      stranger.getByRole('heading', { name: `COMM-02 member ${marker} 0` }),
    ).toBeVisible()
    expect((await request.get('/api/profiles?limit=1')).status()).toBe(403)
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
    for (const memberId of memberIds) await finalizeMemberDeletion(payload as never, memberId)
    await payload.updateGlobal({
      slug: 'site-settings',
      data: { canonicalOriginsBySite: original ?? {} },
      overrideAccess: true,
    })
    await payload.db.destroy?.()
  }
})
