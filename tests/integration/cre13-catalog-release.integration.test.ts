import { createHash, randomUUID } from 'node:crypto'
import { getPayload } from 'payload'
import { GET as serveDownload } from '../../src/app/(frontend)/api/commerce/download/[grantKey]/route'
import { issueMagicLink, consumeMagicLink } from '../../src/modules/identity/member-identity'
import { resolveSiteSettings } from '../../src/modules/core/site-settings'
import { projectRelease } from '../../src/modules/calendar/service'
import { expect, it } from 'vitest'
import config from '../../src/payload.config'
import { loadConfig } from '../../src/modules/core/config'
import { mediaStorage } from '../../src/modules/media/storage'
import {
  createCreatorCatalogRelease,
  creatorCatalogView,
  creatorCatalogReport,
  listCreatorCatalogReleases,
  catalogLinksForSource,
  creatorCatalogDownload,
  deliverCreatorCatalogMedia,
  publishCreatorCatalogRelease,
  unpublishCreatorCatalogRelease,
} from '../../src/modules/creator-catalog/creator-release'
import { deriveDownloadGrantKey } from '../../src/modules/commerce/service'
import {
  deliverySigningSecret,
  revokeOrderDigitalAccess,
} from '../../src/modules/commerce/digital-delivery'

it('projects an owned release, rechecks recording access and keeps promotion drafts idempotent', async () => {
  const payload = await getPayload({ config })
  const app = loadConfig()
  const storage = mediaStorage(app)
  const keys: string[] = []
  const suffix = randomUUID()
  const overrideAccess = true
  const previousOrigins = (await resolveSiteSettings(payload)).canonicalOriginsBySite
  const host = 'cre13-' + suffix + '.test'
  try {
    const site = await payload.create({
      collection: 'sites',
      overrideAccess,
      data: {
        name: 'Creator release',
        slug: 'creator-release-' + suffix,
        lifecycle: 'active',
        visibility: 'public',
        communityRegistrationPolicy: 'open',
        commentReactionCodes: ['thumbs_up'],
        creatorPolicy: { enabled: true },
      },
    })
    await payload.updateGlobal({
      slug: 'site-settings',
      overrideAccess,
      data: { canonicalOriginsBySite: { ...previousOrigins, [site.id]: 'https://' + host } },
    })
    const principal = async (name: string, creatorCapabilities: string[]) => {
      const member = await payload.create({
        collection: 'members',
        overrideAccess,
        data: { email: name + '-' + suffix + '@example.test', displayName: name, status: 'active' },
      })
      await payload.create({
        collection: 'member-site-roles',
        overrideAccess,
        data: {
          site: site.id,
          member: member.id,
          role: 'contributor',
          creatorCapabilities,
        } as never,
      })
      return { siteId: site.id, memberId: member.id, email: member.email! }
    }
    const creator = await principal('creator', ['media.publish-own', 'commerce.manage-own'])
    const buyer = await principal('buyer', [])
    const anonymous = { siteId: site.id, memberId: '', email: '' }
    const content = await payload.create({
      collection: 'podcast-shows',
      overrideAccess,
      data: {
        site: site.id,
        owner: creator.memberId,
        title: 'Creator show',
        slug: 'cre13-show-' + suffix,
        status: 'published',
      } as never,
    })
    const episode = await payload.create({
      collection: 'podcast-episodes',
      overrideAccess,
      data: {
        site: site.id,
        owner: creator.memberId,
        show: content.id,
        title: 'Creator episode',
        slug: 'cre13-episode-' + suffix,
        status: 'published',
        publishedAt: new Date().toISOString(),
      } as never,
    })
    const asset = async (title: string, kind: 'video' | 'audio', mimeType: string) => {
      const bytes = Buffer.from(title + suffix)
      const checksum = 'sha256:' + createHash('sha256').update(bytes).digest('hex')
      const key = 'cre13/' + randomUUID()
      keys.push(key)
      await storage.put(key, bytes, mimeType)
      const blob = await payload.create({
        collection: 'media-blobs',
        overrideAccess,
        data: {
          site: site.id,
          storageKey: key,
          storageProvider: 'local',
          state: 'ready',
          checksum,
          mimeType,
          sizeBytes: bytes.length,
        },
      })
      return payload.create({
        collection: 'media-assets',
        overrideAccess,
        data: {
          site: site.id,
          owner: creator.memberId,
          title,
          kind,
          mimeType,
          originalBlob: blob.id,
          checksum,
          sizeBytes: bytes.length,
          storageLocation: key,
          storageProvider: 'local',
          publicPolicy: 'private',
          processingState: 'ready',
          rightsStatus: 'approved',
        } as never,
      })
    }
    const trailer = await asset('Trailer', 'video', 'video/mp4')
    const full = await asset('Recording', 'audio', 'audio/mpeg')
    const file = await asset('Download', 'audio', 'audio/mpeg')
    const capability = 'playback-' + suffix
    const makeProduct = async (name: string, digital: boolean, assets = [file]) => {
      const sku = name + '-' + suffix
      const draft = await payload.create({
        collection: 'products',
        overrideAccess,
        data: {
          site: site.id,
          owner: creator.memberId,
          name,
          slug: sku,
          kind: digital ? 'digital' : 'physical',
          state: 'draft',
          productCapabilities: [digital ? 'digital-entitlement' : 'shippable'],
          variants: [
            {
              sku,
              title: name,
              status: 'active',
              inventoryPolicy: 'untracked',
              digitalAvailable: digital,
              ...(!digital
                ? { weightGrams: 200, dimensionsMm: { length: 250, width: 200, height: 10 } }
                : {}),
            },
          ],
          offers: [
            {
              id: sku,
              version: 1,
              status: 'active',
              variantSku: sku,
              amountMinor: '100',
              currency: 'USD',
              taxDisplay: 'exclusive',
              segmentPolicy: { mode: 'public' },
            },
          ],
          ...(digital
            ? {
                digitalDelivery: {
                  entitlement: capability,
                  assets: assets.map(({ id }) => ({
                    mediaId: id,
                    rightsStatus: 'approved',
                    malwareStatus: 'clean',
                    publicOriginal: false,
                  })),
                },
              }
            : {}),
        } as never,
      })
      return payload.update({
        collection: 'products',
        overrideAccess,
        id: draft.id,
        data: { state: 'published' },
        context: { catalogWorkflow: true },
      })
    }
    const digital = await makeProduct('download', true)
    const merch = await makeProduct('merch', false)
    const paidProduct = await makeProduct('paid-recording', true, [full])
    const account = await payload.create({
      collection: 'social-accounts',
      overrideAccess,
      data: {
        site: site.id,
        owner: creator.memberId,
        displayName: 'Manual promotion',
        network: 'manual',
        actorType: 'site',
        externalAccountId: 'cre13-' + suffix,
        capabilityState: 'manual-handoff',
        capabilities: {},
      },
    })

    const input = {
      title: 'Creator catalog',
      source: { kind: 'podcast-episodes', id: episode.id },
      trailer: trailer.id,
      recording: full.id,
      products: [digital.id, merch.id],
      downloadProduct: digital.id,
      announcement: 'Preview the trailer.',
      clip: trailer.id,
      socialAccount: account.id,
      newsletter: 'An excerpt for review.',
    }
    const release = await createCreatorCatalogRelease(payload, creator, input)
    expect(await createCreatorCatalogRelease(payload, creator, input)).toEqual(release)
    const calendar = await payload.findByID({
      collection: 'content-releases',
      id: release.id,
      overrideAccess,
    })
    expect(projectRelease(calendar).status).toBe('draft')
    const request = (path: string, range?: string) =>
      new Request(new URL(path, app.appUrl), { headers: range ? { range } : {} })
    const media = (releaseId: string, actor: typeof buyer, slot: string, path?: string) =>
      deliverCreatorCatalogMedia(
        payload,
        actor,
        releaseId,
        slot,
        request(
          path ?? '/creator-release/' + releaseId + '/media/' + slot,
          path ? 'bytes=0-3' : undefined,
        ),
      )
    await expect(media(release.id, anonymous, 'trailer')).rejects.toMatchObject({ status: 404 })
    const failingNewsletter = new Proxy(payload, {
      get(target, property, receiver) {
        if (property !== 'create') return Reflect.get(target, property, receiver)
        return (data: Parameters<typeof payload.create>[0]) => {
          if (data.collection === 'email-messages') throw new Error('Fixture newsletter outage')
          return target.create(data)
        }
      },
    })
    const partial = await publishCreatorCatalogRelease(failingNewsletter, creator, release.id)
    expect(partial.state).toBe('partial')
    expect(
      (await creatorCatalogReport(payload, creator, release.id)).drafts.map(({ state }) => state),
    ).toEqual(['draft', 'incomplete'])
    expect(await listCreatorCatalogReleases(payload, creator)).toContainEqual({
      id: release.id,
      title: input.title,
      published: true,
    })
    expect(await catalogLinksForSource(payload, site.id, 'podcast-episodes', episode.id)).toEqual([
      { id: release.id, title: input.title },
    ])
    expect(
      await catalogLinksForSource(payload, randomUUID(), 'podcast-episodes', episode.id),
    ).toEqual([])

    expect(partial.drafts.map(({ state }) => state)).toEqual(['draft', 'failed'])
    const published = await publishCreatorCatalogRelease(payload, creator, release.id)
    expect(published.drafts[0]).toEqual(partial.drafts[0])
    const retried = await publishCreatorCatalogRelease(payload, creator, release.id)
    expect(retried.drafts).toEqual(published.drafts)
    expect(published.drafts.map(({ state }) => state)).toEqual(['draft', 'draft'])
    const variants = await payload.find({
      collection: 'social-network-variants',
      overrideAccess,
      depth: 0,
      where: { draft: { equals: published.drafts[0].id } },
    })
    expect(variants.docs).toHaveLength(1)
    expect(variants.docs[0]).toMatchObject({ status: 'draft', attachments: [trailer.id] })
    const deliveries = await payload.count({
      collection: 'social-queue-items',
      overrideAccess,
      where: { variant: { equals: variants.docs[0].id } },
    })
    expect(deliveries.totalDocs).toBe(0)
    expect(
      (await creatorCatalogView(payload, anonymous, release.id)).products.map(({ id }) => id),
    ).toEqual([digital.id, merch.id])
    const trailerLink = await media(release.id, anonymous, 'trailer')
    expect(trailerLink.status).toBe(307)
    expect(
      (await media(release.id, anonymous, 'trailer', trailerLink.headers.get('location')!)).status,
    ).toBe(206)
    await expect(media(release.id, anonymous, 'recording')).rejects.toMatchObject({ status: 404 })
    const memberLink = await media(release.id, buyer, 'recording')
    expect(memberLink.status).toBe(307)
    await expect(
      media(release.id, creator, 'recording', memberLink.headers.get('location')!),
    ).rejects.toMatchObject({ status: 404 })
    const paid = await createCreatorCatalogRelease(payload, creator, {
      ...input,
      recordingAccess: 'paid',
      products: [paidProduct.id, merch.id],
      downloadProduct: paidProduct.id,
    })
    await publishCreatorCatalogRelease(payload, creator, paid.id)
    await expect(media(paid.id, buyer, 'recording')).rejects.toMatchObject({ status: 404 })
    const supporter = await payload.create({
      collection: 'supporters',
      overrideAccess,
      data: { site: site.id, member: buyer.memberId, visibilityPreference: 'private' } as never,
    })
    const orderId = randomUUID()
    const entitlement = await payload.create({
      collection: 'entitlements',
      overrideAccess,
      data: {
        site: site.id,
        supporter: supporter.id,
        entitlement: capability,
        source: 'order:' + orderId,
        startsAt: new Date().toISOString(),
      },
    })
    for (const mediaId of [full.id, file.id]) {
      const entry = mediaId === full.id ? paidProduct : digital
      const variantSku = entry.variants?.[0].sku ?? 'fixture'
      const key = deriveDownloadGrantKey(
        { orderId, productId: entry.id, variantSku, mediaId },
        deliverySigningSecret(),
      )
      await payload.create({
        collection: 'digital-delivery-grants',
        overrideAccess,
        data: {
          site: site.id,
          member: buyer.memberId,
          product: entry.id,
          variantSku,
          mediaAsset: mediaId,
          entitlement: entitlement.id,
          grantKeyHash: createHash('sha256').update(key).digest('hex'),
          downloadCount: 0,
        },
      })
    }
    await expect(
      creatorCatalogDownload(payload, creator, release.id, file.id),
    ).rejects.toMatchObject({ status: 404 })
    const download = await creatorCatalogDownload(payload, buyer, release.id, file.id)
    expect(download.status).toBe(307)
    expect(download.headers.get('location')).toMatch(
      /^\/api\/commerce\/download\/[A-Za-z0-9_-]{43}$/,
    )
    expect(
      (await creatorCatalogView(payload, buyer, release.id)).downloads.map(({ id }) => id),
    ).toContain(file.id)
    const magic = await issueMagicLink(payload as never, buyer.email)
    const memberSession = await consumeMagicLink(payload as never, magic.token!)
    expect(memberSession?.memberId).toBe(buyer.memberId)
    const downloadLocation = download.headers.get('location')!
    const downloadRequest = new Request('https://' + host + downloadLocation, {
      headers: { host, cookie: 'renegade-member=' + memberSession!.sessionToken },
    })
    const canonicalDownload = () =>
      serveDownload(downloadRequest, {
        params: Promise.resolve({ grantKey: downloadLocation.split('/').at(-1)! }),
      })
    const downloaded = await canonicalDownload()
    expect(downloaded.status).toBe(200)
    expect(await downloaded.text()).toBe('Download' + suffix)
    const bought = await media(paid.id, buyer, 'recording')
    const signed = bought.headers.get('location')!
    expect((await media(paid.id, buyer, 'recording', signed)).status).toBe(206)
    await revokeOrderDigitalAccess(payload, orderId)
    expect((await canonicalDownload()).status).toBe(404)
    await expect(creatorCatalogDownload(payload, buyer, release.id, file.id)).rejects.toMatchObject(
      { status: 404 },
    )
    await expect(media(paid.id, buyer, 'recording')).rejects.toMatchObject({ status: 404 })
    await expect(media(paid.id, buyer, 'recording', signed)).rejects.toMatchObject({ status: 404 })
    await unpublishCreatorCatalogRelease(payload, creator, release.id)
    await expect(
      media(release.id, anonymous, 'trailer', trailerLink.headers.get('location')!),
    ).rejects.toMatchObject({ status: 404 })
  } finally {
    await payload.updateGlobal({
      slug: 'site-settings',
      overrideAccess,
      data: { canonicalOriginsBySite: previousOrigins },
    })
    await Promise.all(keys.map((key) => storage.remove(key)))
    await payload.db.destroy?.()
  }
})
