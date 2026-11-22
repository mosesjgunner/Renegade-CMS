import { getPayload, type Payload } from 'payload'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import config from '../../src/payload.config'
import { GET, POST } from '../../src/app/(frontend)/api/creator-studio/route'
import { authorizeCreator } from '../../src/modules/creator-studio/policy'
import { PATCH as mediaPatch } from '../../src/app/(frontend)/api/media/[id]/route'
import { POST as mediaUpload } from '../../src/app/(frontend)/api/media/upload/route'
import { POST as goLive } from '../../src/app/(frontend)/api/podcast-studio/live/route'
import { POST as profileUpload } from '../../src/app/(frontend)/api/member-auth/profile-media/route'
import { chromium } from '@playwright/test'
import {
  buildRc2World,
  loginAsMember,
  teardownRc2World,
  type Rc2World,
} from '../fixtures/rc2-world'

let payload: Payload
let world: Rc2World
beforeAll(async () => {
  payload = await getPayload({ config })
  world = await buildRc2World(payload)
}, 240000)
afterAll(async () => {
  if (world) await teardownRc2World(payload, world)
  await payload?.db.destroy?.()
})

describe('creator studio member access', () => {
  it('creates a Space only after site approval and an explicit grant', async () => {
    const a = world.siteA
    const member = a.subscriber
    const profile = await payload.create({
      collection: 'profiles',
      data: {
        member: member.memberId,
        displayName: 'Creator',
        handle: `creator-${world.suffix}`,
        visibility: 'public',
      },
      overrideAccess: true,
    })
    world.createdIds.profiles.push(String(profile.id))
    const roles = await payload.find({
      collection: 'member-site-roles',
      where: { and: [{ site: { equals: a.siteId } }, { member: { equals: member.memberId } }] },
      limit: 1,
      overrideAccess: true,
    })
    await payload.update({
      collection: 'member-site-roles',
      id: roles.docs[0]!.id,
      data: { creatorCapabilities: ['space.manage-own', 'content.draft-own'] },
      overrideAccess: true,
    })
    await payload.update({
      collection: 'sites',
      id: a.siteId,
      data: { creatorPolicy: { enabled: true, selfServiceSpaces: false } },
      overrideAccess: true,
    })
    const session = await loginAsMember(payload, member)
    const headers = new Headers(session.headers)
    headers.set('host', a.host)
    headers.set('cookie', `${headers.get('cookie')}; renegade-member-csrf=cre01-token`)
    headers.set('x-member-csrf', 'cre01-token')
    headers.set('content-type', 'application/json')
    const post = () =>
      POST(
        new Request(`${a.origin}/api/creator-studio`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ action: 'create-space' }),
        }),
      )
    expect((await post()).status).toBe(403)
    await payload.update({
      collection: 'sites',
      id: a.siteId,
      data: { creatorPolicy: { enabled: true, selfServiceSpaces: true } },
      overrideAccess: true,
    })
    const response = await post()
    expect(response.status).toBe(200)
    const { id } = await response.json()
    world.createdIds.spaces.push(id)
    const space = await payload.findByID({
      collection: 'spaces',
      id,
      depth: 0,
      overrideAccess: true,
    })
    expect(space).toMatchObject({
      site: a.siteId,
      profile: String(profile.id),
      moderationState: 'clear',
    })
    expect((await (await post()).json()).id).toBe(id)
  }, 120000)
  it('persists a private draft and denies other Spaces, other sites, suspension and revoked grants', async () => {
    const a = world.siteA
    const b = world.siteB
    await payload.update({
      collection: 'sites',
      id: a.siteId,
      data: { creatorPolicy: { enabled: true, selfServiceSpaces: true } },
      overrideAccess: true,
    })
    const roles = await payload.find({
      collection: 'member-site-roles',
      where: { and: [{ site: { equals: a.siteId } }, { member: { equals: a.member.memberId } }] },
      limit: 1,
      overrideAccess: true,
    })
    const roleId = String(roles.docs[0]!.id)
    await payload.update({
      collection: 'member-site-roles',
      id: roleId,
      data: {
        creatorCapabilities: ['content.draft-own', 'space.manage-own', 'media.upload', 'live.host'],
      },
      overrideAccess: true,
    })
    const session = await loginAsMember(payload, a.member)
    if (process.env.CRE01_BROWSER_ORIGIN) {
      await payload.updateGlobal({
        slug: 'site-settings',
        data: {
          canonicalOrigin: process.env.CRE01_BROWSER_ORIGIN,
          canonicalOriginsBySite: {
            [a.siteId]: process.env.CRE01_BROWSER_ORIGIN,
            [b.siteId]: b.origin,
          },
        },
        overrideAccess: true,
      })
      const browser = await chromium.launch({ headless: true })
      try {
        const browserContext = await browser.newContext()
        const [name, value] = (session.headers.get('cookie') ?? '').split('=')
        await browserContext.addCookies([{ name, value, url: process.env.CRE01_BROWSER_ORIGIN }])
        const page = await browserContext.newPage()
        await page.goto(`${process.env.CRE01_BROWSER_ORIGIN}/studio`, {
          waitUntil: 'domcontentloaded',
          timeout: 120000,
        })
        await page.getByLabel('Title').fill('Browser creator draft')
        await page.getByLabel('Draft', { exact: true }).fill('Browser persisted text')
        await page.getByRole('button', { name: 'Save draft' }).click()
        await page.getByText('Draft saved.').waitFor({ timeout: 30000 })
        await page.reload()
        const draftResponse = page.waitForResponse((response) =>
          response.url().includes('/api/creator-studio?draft='),
        )
        await page.getByRole('button', { name: 'Browser creator draft' }).click()
        const reopened = await draftResponse
        expect(await reopened.json()).toMatchObject({
          title: 'Browser creator draft',
          text: 'Browser persisted text',
        })
        await expect
          .poll(() => page.locator('textarea').count(), { timeout: 10000 })
          .toBeGreaterThan(0)
        await expect
          .poll(() => page.locator('textarea').last().inputValue(), { timeout: 10000 })
          .toBe('Browser persisted text')
        const browserDraft = await payload.find({
          collection: 'content',
          where: { title: { equals: 'Browser creator draft' } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        world.createdIds.content.push(String(browserDraft.docs[0]!.id))
        await browserContext.close()
      } finally {
        await browser.close()
        await payload.updateGlobal({
          slug: 'site-settings',
          data: {
            canonicalOrigin: a.origin,
            canonicalOriginsBySite: { [a.siteId]: a.origin, [b.siteId]: b.origin },
          },
          overrideAccess: true,
        })
      }
    }
    const headers = new Headers(session.headers)
    headers.set('host', a.host)
    headers.set('cookie', `${headers.get('cookie')}; renegade-member-csrf=cre01-token`)
    headers.set('x-member-csrf', 'cre01-token')
    headers.set('content-type', 'application/json')
    const post = (body: object, requestHeaders = headers) =>
      POST(
        new Request(`${a.origin}/api/creator-studio`, {
          method: 'POST',
          headers: requestHeaders,
          body: JSON.stringify(body),
        }),
      )
    const draft = {
      action: 'save-draft',
      spaceId: a.memberSpaceId,
      title: 'My creator draft',
      text: 'Persisted creator text',
    }
    const created = await post(draft)
    expect(created.status).toBe(200)
    const { id } = await created.json()
    world.createdIds.content.push(id)
    const otherSpace = await payload.create({
      collection: 'spaces',
      data: {
        site: a.siteId,
        profile: b.memberProfileId,
        canonicalPath: `/members/other-${world.suffix}`,
        moderationState: 'clear',
      },
      overrideAccess: true,
    })
    world.createdIds.spaces.push(String(otherSpace.id))
    const persisted = await payload.findByID({
      collection: 'content',
      id,
      depth: 0,
      overrideAccess: true,
    })
    expect(persisted).toMatchObject({
      site: a.siteId,
      space: a.memberSpaceId,
      owner: a.member.memberId,
      status: 'draft',
      visibility: 'private',
    })
    expect(
      (await GET(new Request(`${a.origin}/api/creator-studio?draft=${id}`, { headers }))).status,
    ).toBe(200)
    const noCsrf = new Headers(headers)
    noCsrf.delete('x-member-csrf')
    expect((await post({ ...draft, draftId: id, title: 'CSRF attack' }, noCsrf)).status).toBe(403)
    expect((await post({ ...draft, draftId: id, text: 'Updated text' })).status).toBe(200)
    const reread = await GET(new Request(`${a.origin}/api/creator-studio?draft=${id}`, { headers }))
    expect(await reread.json()).toMatchObject({ id, text: 'Updated text' })
    expect(
      (await post({ action: 'save-space', spaceId: a.memberSpaceId, description: 'My Space' }))
        .status,
    ).toBe(200)
    expect(
      (await payload.findByID({ collection: 'spaces', id: a.memberSpaceId, overrideAccess: true }))
        .creatorDescription,
    ).toBe('My Space')
    expect(
      (await post({ action: 'save-space', spaceId: String(otherSpace.id), description: 'Attack' }))
        .status,
    ).toBe(403)
    expect(
      (await payload.findByID({ collection: 'spaces', id: otherSpace.id, overrideAccess: true }))
        .creatorDescription,
    ).not.toBe('Attack')
    expect(
      (await post({ ...draft, spaceId: b.memberSpaceId, draftId: id, title: 'Attack' })).status,
    ).toBe(403)
    expect(
      (await post({ ...draft, spaceId: String(otherSpace.id), draftId: id, title: 'Attack' }))
        .status,
    ).toBe(403)
    const wrongHost = new Headers(headers)
    wrongHost.set('host', b.host)
    expect((await post({ ...draft, draftId: id, title: 'Attack' }, wrongHost)).status).toBe(403)
    const foreignAsset = await payload.findByID({
      collection: 'media-assets',
      id: b.mediaAssetId,
      depth: 0,
      overrideAccess: true,
    })
    const mediaAttempt = await mediaPatch(
      new Request(`${a.origin}/api/media/${b.mediaAssetId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ siteId: a.siteId, title: 'Attack' }),
      }),
      { params: Promise.resolve({ id: b.mediaAssetId }) },
    )
    expect(mediaAttempt.status).toBe(403)
    expect(
      (
        await payload.findByID({
          collection: 'media-assets',
          id: b.mediaAssetId,
          depth: 0,
          overrideAccess: true,
        })
      ).title,
    ).toBe(foreignAsset.title)
    await payload.update({
      collection: 'members',
      id: a.member.memberId,
      data: { status: 'suspended' },
      overrideAccess: true,
    })
    await expect(
      payload.update({
        collection: 'member-site-roles',
        id: roleId,
        data: { creatorCapabilities: [] },
        overrideAccess: false,
        user: a.admin.user,
      }),
    ).rejects.toThrow()
    for (const capability of ['media.upload', 'live.host'] as const) {
      await expect(
        authorizeCreator(payload, { siteId: a.siteId, memberId: a.member.memberId, capability }),
      ).rejects.toThrow('denied')
    }
    const form = new FormData()
    form.set('siteId', a.siteId)
    form.set('file', new File(['test'], 'test.txt', { type: 'text/plain' }))
    const uploadHeaders = new Headers(headers)
    uploadHeaders.delete('content-type')
    expect(
      (
        await mediaUpload(
          new Request(`${a.origin}/api/media/upload`, {
            method: 'POST',
            headers: uploadHeaders,
            body: form,
          }),
        )
      ).status,
    ).toBe(403)
    const avatar = new FormData()
    avatar.set('field', 'avatar')
    avatar.set('file', new File(['test'], 'test.png', { type: 'image/png' }))
    expect(
      (
        await profileUpload(
          new Request(`${a.origin}/api/member-auth/profile-media`, {
            method: 'POST',
            headers: uploadHeaders,
            body: avatar,
          }),
        )
      ).status,
    ).toBe(401)
    expect(
      (
        await goLive(
          new Request(`${a.origin}/api/podcast-studio/live`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ action: 'go-live', episodeId: 'missing' }),
          }),
        )
      ).status,
    ).not.toBe(200)
    expect((await post({ ...draft, draftId: id })).status).not.toBe(200)
    await payload.update({
      collection: 'members',
      id: a.member.memberId,
      data: { status: 'active' },
      overrideAccess: true,
    })
    await payload.update({
      collection: 'member-site-roles',
      id: roleId,
      data: { creatorCapabilities: [] },
      overrideAccess: false,
      user: a.owner.user,
    })
    expect((await post({ ...draft, draftId: id })).status).toBe(403)
    expect(
      (await payload.findByID({ collection: 'content', id, depth: 0, overrideAccess: true })).title,
    ).toBe('My creator draft')
  }, 120000)
})
