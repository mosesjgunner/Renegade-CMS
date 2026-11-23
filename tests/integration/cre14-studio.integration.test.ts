import { randomUUID } from 'node:crypto'
import { getPayload } from 'payload'
import sharp from 'sharp'
import { expect, it } from 'vitest'
import config from '../../src/payload.config'
import { creatorWorkspace } from '../../src/modules/creator-studio/workspace'
import { studioOverview } from '../../src/modules/creator-studio/studio-overview'
import { uploadPrivateStudioFile } from '../../src/modules/creator-studio/studio-upload'
import { portfolioFromTemplate } from '../../src/modules/creator-studio/studio-templates'
import { listPortfolios, savePortfolio } from '../../src/modules/creator-studio/portfolio-service'
import {
  exportPortfolio,
  importPortfolio,
} from '../../src/modules/creator-studio/portfolio-portability'
import { createEditProject } from '../../src/modules/creator-studio/media-edit-projects'
import { editStart, newClip } from '../../src/modules/creator-studio/media-edit-recipe'
import {
  exportEditBundle,
  importEditBundle,
  portableAsset,
} from '../../src/modules/creator-studio/edit-portability'
import { loadConfig } from '../../src/modules/core/config'
import {
  canManageRoom,
  createRoom,
  loadRoomBinding,
  roomQuery,
} from '../../src/modules/community/rooms'
import { mediaStorage } from '../../src/modules/media/storage'
import { consumeMagicLink, issueMagicLink } from '../../src/modules/identity/member-identity'
import {
  GET as readCapture,
  POST as createCapture,
} from '../../src/app/(frontend)/api/creator/capture-sessions/route'

it('onboards member creators, restores matching project files, and enforces export rights', async () => {
  const payload = await getPayload({ config })
  const key = randomUUID()
  const access = { overrideAccess: true, depth: 0 } as const
  try {
    const site = await payload.create({
      collection: 'sites',
      ...access,
      data: {
        name: 'Studio proof',
        slug: 'studio-' + key,
        lifecycle: 'active',
        communityRegistrationPolicy: 'open',
        commentReactionCodes: ['thumbs_up'],
        creatorPolicy: {
          enabled: true,
          selfServiceSpaces: true,
          quotas: { bytes: 10_000_000, uploadCount: 4 },
        },
      },
    })
    const member = async (name: string) => {
      const person = await payload.create({
        collection: 'members',
        ...access,
        data: { email: name + key + '@example.test', displayName: name, status: 'active' },
      })
      await payload.create({
        collection: 'profiles',
        ...access,
        data: {
          member: person.id,
          displayName: name,
          handle: name + '-' + key,
          visibility: 'public',
        },
      })
      await payload.create({
        collection: 'member-site-roles',
        ...access,
        data: {
          site: site.id,
          member: person.id,
          role: 'contributor',
          creatorCapabilities: [
            'media.upload',
            'media.edit-own',
            'portfolio.manage-own',
            'space.manage-own',
            'content.draft-own',
            ...(name === 'author' ? ['live.host'] : []),
          ],
        },
      })
      return { siteId: site.id, memberId: person.id }
    }
    const author = await member('author')
    const recipient = await member('recipient')
    const origin = `https://studio-${key}.example.test`
    const target = origin + '/api/creator/capture-sessions'
    const settings = await payload.findGlobal({ slug: 'site-settings', ...access })
    const canonicalOrigins = (settings.canonicalOriginsBySite ?? {}) as Record<string, string>
    await payload.updateGlobal({
      slug: 'site-settings',
      ...access,
      data: {
        canonicalOriginsBySite: { ...canonicalOrigins, [site.id]: origin },
      },
    })
    try {
      const issued = await issueMagicLink(payload as never, 'author' + key + '@example.test')
      const session = await consumeMagicLink(payload as never, issued.token!)
      expect(session?.sessionToken).toBeTruthy()
      const csrf = randomUUID()
      const headers = {
        host: new URL(origin).host,
        cookie: `renegade-member=${session!.sessionToken}; renegade-member-csrf=${csrf}`,
        'x-member-csrf': csrf,
      }
      const createRequest = (callerOrigin?: string) =>
        new Request(target, {
          method: 'POST',
          headers: { ...headers, ...(callerOrigin ? { origin: callerOrigin } : {}) },
          body: '{}',
        })
      expect((await createCapture(createRequest('https://foreign.example.test'))).status).toBe(403)
      expect((await createCapture(createRequest())).status).toBe(403)
      expect((await createCapture(createRequest(origin))).status).toBe(400)
      expect(
        (await readCapture(new Request(target, { headers: { host: headers.host } }))).status,
      ).toBe(401)
      expect(
        (await readCapture(new Request(target + '?id=' + randomUUID(), { headers }))).status,
      ).toBe(404)
      const query = roomQuery(payload)
      const {
        rows: [ban],
      } = await query<{ id: string }>(
        `WITH action AS (
          INSERT INTO moderation_actions(site_id,actor,target_type,target_id,action,scope,reason,details)
          VALUES ($1,'studio-fixture','member',$2::uuid::text,'ban_member','site_global','Boundary fixture','{}')
          RETURNING id
        )
        INSERT INTO member_sanctions(site_id,member_id,action_id,sanction_type,scope)
        SELECT $1,$2::uuid,id,'ban_member','site_global' FROM action RETURNING id`,
        [site.id, author.memberId],
      )
      try {
        expect((await readCapture(new Request(target, { headers }))).status).toBe(403)
      } finally {
        await query('UPDATE member_sanctions SET revoked_at=now() WHERE id=$1', [ban.id])
      }
      await payload.update({
        collection: 'members',
        id: author.memberId,
        ...access,
        data: { status: 'suspended' },
      })
      expect((await readCapture(new Request(target, { headers }))).status).toBe(401)
    } finally {
      await payload.update({
        collection: 'members',
        id: author.memberId,
        ...access,
        data: { status: 'active' },
      })
      await payload.updateGlobal({
        slug: 'site-settings',
        ...access,
        data: { canonicalOriginsBySite: canonicalOrigins },
      })
    }
    const live = {
      siteId: site.id,
      title: 'My live room',
      mode: 'theater',
      accessPolicy: 'members',
      creatorTheater: true,
    } as const
    await expect(
      createRoom(payload, { ...live, creatorMemberId: recipient.memberId }),
    ).rejects.toMatchObject({ status: 403 })
    const room = await createRoom(payload, { ...live, creatorMemberId: author.memberId })
    const query = roomQuery(payload)
    const binding = (await loadRoomBinding(query, room.id))!
    expect(await canManageRoom(query, binding, author.memberId)).toBe(true)
    expect(await canManageRoom(query, binding, recipient.memberId)).toBe(false)
    await payload.db.pool.query(
      "UPDATE member_site_roles SET creator_capabilities=creator_capabilities-'live.host' WHERE site_id=$1 AND member_id=$2",
      [site.id, author.memberId],
    )
    expect(await canManageRoom(query, binding, author.memberId)).toBe(false)
    const initial = await creatorWorkspace(payload, author.siteId, author.memberId)
    expect(initial.space).toBeNull()
    expect((await listPortfolios(payload, author)).entries).toHaveLength(0)
    expect((await creatorWorkspace(payload, author.siteId, author.memberId)).space).toBeNull()
    const portfolio = await savePortfolio(payload, author, {
      action: 'save',
      collection: 'creator-projects',
      draft: { ...portfolioFromTemplate('photographer'), title: 'First project' },
    })
    expect(portfolio.draft.layout).toBe('masonry')
    expect((await creatorWorkspace(payload, author.siteId, author.memberId)).space).toBeTruthy()
    const portfolioBackup = await exportPortfolio(payload, author, 'creator-projects', portfolio.id)
    const portfolioCopy = await importPortfolio(payload, author, portfolioBackup)
    expect(portfolioCopy.id).not.toBe(portfolio.id)
    expect(portfolioCopy.draft.sections).toEqual(portfolio.draft.sections)
    const original = await sharp({
      create: { width: 32, height: 32, channels: 3, background: '#334e72' },
    })
      .png()
      .toBuffer()
    const request = (bytes: Uint8Array, type: string, extra = '') =>
      new Request('http://localhost/upload?title=Test+photo&alt=Blue+square' + extra, {
        method: 'POST',
        headers: { 'content-type': type },
        body: new Uint8Array(bytes),
      })
    const uploaded = await uploadPrivateStudioFile(payload, author, request(original, 'image/png'))
    expect(await uploadPrivateStudioFile(payload, author, request(original, 'image/png'))).toEqual(
      uploaded,
    )
    expect((await studioOverview(payload, author)).quota?.uploads.used).toBe(1)
    expect((await studioOverview(payload, recipient)).media).toHaveLength(0)
    const file = await portableAsset(payload, author, uploaded.id)
    expect(file.asset.publicPolicy).toBe('private')
    await expect(portableAsset(payload, recipient, uploaded.id)).rejects.toMatchObject({
      status: 404,
    })
    const project = await createEditProject(payload, author, {
      ...editStart(),
      title: 'Image edit',
      clips: [newClip(uploaded.id, 3)],
      captions: [{ start: 0, end: 1, text: 'Blue square' }],
    })
    const exportData = await exportEditBundle(payload, author, project.id)
    expect(exportData.captions.vtt).toContain('Blue square')
    await expect(importEditBundle(payload, recipient, exportData)).rejects.toMatchObject({
      status: 409,
    })
    const bytes = await mediaStorage(loadConfig()).get(file.key)
    expect(bytes).toBeDefined()
    await expect(
      uploadPrivateStudioFile(
        payload,
        recipient,
        request(bytes!, 'image/webp', '&checksum=' + exportData.media[0].checksum),
      ),
    ).rejects.toMatchObject({ status: 409 })
    const restoredMedia = await uploadPrivateStudioFile(
      payload,
      recipient,
      request(bytes!, 'image/webp', '&rights=confirmed&checksum=' + exportData.media[0].checksum),
    )
    const restored = await importEditBundle(payload, recipient, exportData)
    expect(restored.recipe.clips[0].asset).toBe(restoredMedia.id)
    expect(restored.recipe.captions).toEqual(project.recipe.captions)
    await payload.update({
      collection: 'media-assets',
      id: uploaded.id,
      ...access,
      data: { originalExportAllowed: false },
    })
    await expect(exportEditBundle(payload, author, project.id)).rejects.toMatchObject({
      status: 403,
    })
  } finally {
    await payload.db.destroy?.()
  }
})
