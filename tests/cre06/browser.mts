import { randomUUID } from 'node:crypto'
import { chromium, expect } from '@playwright/test'
import { getPayload } from 'payload'
import config from '../../src/payload.config'
import { consumeMagicLink, issueMagicLink } from '../../src/modules/identity/member-identity'

const origin = new URL(process.env.APP_URL ?? '')
if (
  origin.protocol !== 'http:' ||
  origin.hostname !== '127.0.0.1' ||
  !new URL(process.env.DATABASE_URL ?? '').pathname.endsWith('_release_acceptance')
)
  throw new Error('Browser smoke expects the isolated CRE-06 database.')
const access = { depth: 0, overrideAccess: true } as const
const payload = await getPayload({ config })
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
try {
  const handle = 'cre06-browser-' + randomUUID().slice(0, 8)
  const site = await payload.create({
    collection: 'sites',
    ...access,
    data: {
      name: 'External Video Browser',
      slug: handle,
      lifecycle: 'active',
      visibility: 'public',
      communityRegistrationPolicy: 'invite',
      commentReactionCodes: ['thumbs_up'],
      creatorPolicy: { enabled: true, selfServiceSpaces: true },
    },
  })
  await payload.updateGlobal({
    slug: 'site-settings',
    ...access,
    data: {
      siteName: 'Video Browser',
      canonicalOrigin: origin.origin,
      canonicalOriginsBySite: { [site.id]: origin.origin },
      launchState: 'live',
    },
  })
  const email = handle + '@example.test'
  const member = await payload.create({
    collection: 'members',
    ...access,
    data: { email, displayName: handle, status: 'active' },
  })
  const profile = await payload.create({
    collection: 'profiles',
    ...access,
    data: { member: member.id, displayName: handle, handle, visibility: 'public' },
  })
  await payload.create({
    collection: 'member-site-roles',
    ...access,
    data: {
      site: site.id,
      member: member.id,
      role: 'contributor',
      creatorCapabilities: ['content.draft-own', 'provider.connect', 'media.publish-own'],
    },
  })
  await payload.create({
    collection: 'spaces',
    ...access,
    data: {
      site: site.id,
      profile: profile.id,
      canonicalPath: `/spaces/${handle}`,
      moderationState: 'clear',
    },
  })
  const issued = await issueMagicLink(payload as never, email)
  const session = await consumeMagicLink(payload as never, issued.token!)
  browser = await chromium.launch()
  const context = await browser.newContext()
  await context.addCookies([
    { name: 'renegade-member', value: session!.sessionToken, url: origin.origin, httpOnly: true },
    { name: 'renegade-member-csrf', value: randomUUID(), url: origin.origin },
  ])
  const blocked: string[] = []
  await context.route(/^https?:/, async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === origin.origin) return route.continue()
    blocked.push(url.hostname)
    return route.abort()
  })
  const page = await context.newPage()
  page.setDefaultTimeout(30000)
  const open = await page.goto(origin.origin + '/studio/external-video', { timeout: 90000 })
  expect(open?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'External videos', exact: true })).toBeVisible({
    timeout: 30000,
  })
  await page.getByLabel('Renegade title').fill('Browser video draft')
  await page.getByLabel('Video URL').fill('https://vimeo.com/432101234')
  const resource = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/creator-studio/external-video') &&
      response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Add to a draft' }).click()
  const create = await resource
  expect(create.status()).toBe(200)
  const result = await create.json()
  await page.getByRole('button', { name: 'Preview player' }).click()
  const player = page.locator('iframe[title="Browser video draft"]')
  await expect(player).toHaveAttribute('src', 'https://player.vimeo.com/video/432101234')
  await expect(player).toHaveAttribute(
    'sandbox',
    'allow-scripts allow-same-origin allow-presentation',
  )

  await page.getByRole('link', { name: 'Edit Renegade draft' }).click()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Browser video draft', {
    timeout: 30000,
  })
  await page.getByLabel('Draft', { exact: true }).fill('Browser creator description')
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible()
  expect((await page.request.get(origin.origin + result.path, { timeout: 90000 })).status()).toBe(
    404,
  )
  await payload.update({
    collection: 'content',
    ...access,
    id: result.contentId,
    data: { status: 'published', visibility: 'public' },
  })
  const publicView = await page.goto(origin.origin + result.path, { timeout: 90000 })
  expect(publicView?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Browser video draft' })).toBeVisible()
  await expect(page.getByText('Browser creator description', { exact: true })).toBeVisible()
  await expect(player).toHaveAttribute('src', 'https://player.vimeo.com/video/432101234')
  expect(blocked).toContain('player.vimeo.com')
  console.log(
    'Chromium smoke passed. Imported one Vimeo draft, verified preview sandbox, opened the linked draft and rendered the published iframe. Third-party browser requests were intercepted.',
  )
} finally {
  await browser?.close()
  await payload.destroy()
}
process.exit(0)
