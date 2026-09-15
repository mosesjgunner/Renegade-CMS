import { getPayload } from 'payload'
import config from '@payload-config'
import { processIndexingExecutionEvent } from '@/modules/public/indexing'
import { randomUUID } from 'node:crypto'

async function main() {
  console.log('--- Starting Lifecycle Convergence Verification ---')
  const payload = await getPayload({ config })

  const pub = (
    await payload.find({
      collection: 'publications',
      where: { and: [{ status: { equals: 'active' } }, { visibility: { equals: 'public' } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
  ).docs[0] as any

  const siteId = typeof pub.site === 'string' ? pub.site : String(pub.site?.id ?? '')
  const publicationId = String(pub.id)
  const idSuffix = randomUUID().slice(0, 6)

  // Step 1: Create a draft article
  console.log('1. Creating draft article...')
  const article = await payload.create({
    collection: 'content',
    data: {
      site: siteId,
      publication: publicationId,
      contentType: 'article',
      title: `Lifecycle Article ${idSuffix}`,
      slug: `lifecycle-${idSuffix}`,
      canonicalPath: `/articles/lifecycle-${idSuffix}`,
      summary: `Summary ${idSuffix}`,
      status: 'draft',
      visibility: 'public',
      commentsPolicy: 'closed',
      retentionMode: 'permanent',
      removeFromDiscovery: false,
      publicChangeHistoryPolicy: 'summary',
    },
    overrideAccess: true,
  } as never)
  const articleId = String(article.id)

  // Verify draft is NOT in sitemap
  let res = await fetch('http://localhost:3103/sitemaps/1.xml')
  let xml = await res.text()
  if (xml.includes(`lifecycle-${idSuffix}`)) {
    throw new Error('Draft article appeared in sitemap!')
  }
  console.log('   ✓ Draft is excluded from sitemap')

  // Step 2: Publish article
  console.log('2. Publishing article...')
  await payload.update({
    collection: 'content',
    id: articleId,
    data: {
      status: 'published',
      publishedAt: new Date().toISOString(),
    },
    overrideAccess: true,
  } as never)

  // Verify published article appears in sitemap
  res = await fetch('http://localhost:3103/sitemaps/1.xml')
  xml = await res.text()
  if (!xml.includes(`lifecycle-${idSuffix}`)) {
    throw new Error('Published article missing from sitemap!')
  }
  console.log('   ✓ Published article is in sitemap')

  // Verify indexing event recorded in execution-events
  let events = await payload.find({
    collection: 'execution-events',
    where: {
      and: [
        { eventType: { equals: 'discovery.indexing.changed' } },
        { idempotencyKey: { contains: `lifecycle-${idSuffix}` } },
      ],
    },
    limit: 10,
    overrideAccess: true,
  } as never)
  const pubEvent = events.docs.find(
    (e: any) => e.payload?.action === 'upsert' && e.payload?.reason === 'publication',
  )
  if (!pubEvent) {
    throw new Error('Publication outbox event not found!')
  }
  console.log('   ✓ Publication outbox event recorded:', (pubEvent as any).idempotencyKey)

  // Step 3: Slug change
  console.log('3. Changing slug...')
  await payload.update({
    collection: 'content',
    id: articleId,
    data: {
      slug: `lifecycle-renamed-${idSuffix}`,
      canonicalPath: `/articles/lifecycle-renamed-${idSuffix}`,
    },
    overrideAccess: true,
  } as never)

  res = await fetch('http://localhost:3103/sitemaps/1.xml')
  xml = await res.text()
  if (xml.includes(`/articles/lifecycle-${idSuffix}<`)) {
    throw new Error('Old slug still in sitemap!')
  }
  if (!xml.includes(`/articles/lifecycle-renamed-${idSuffix}`)) {
    throw new Error('New slug missing from sitemap!')
  }
  console.log('   ✓ Sitemap updated to new slug')

  events = await payload.find({
    collection: 'execution-events',
    where: {
      and: [
        { eventType: { equals: 'discovery.indexing.changed' } },
        { idempotencyKey: { contains: `lifecycle-renamed-${idSuffix}` } },
      ],
    },
    limit: 10,
    overrideAccess: true,
  } as never)
  const slugEvent = events.docs.find(
    (e: any) => e.payload?.reason === 'slug' && e.payload?.action === 'upsert',
  )
  if (!slugEvent) {
    throw new Error('Slug change outbox event not found!')
  }
  console.log('   ✓ Slug change outbox event recorded:', (slugEvent as any).idempotencyKey)

  // Step 4: Toggle seoNoIndex: true
  console.log('4. Toggling seoNoIndex: true...')
  await payload.update({
    collection: 'content',
    id: articleId,
    data: { seoNoIndex: true },
    overrideAccess: true,
  } as never)

  res = await fetch('http://localhost:3103/sitemaps/1.xml')
  xml = await res.text()
  if (xml.includes(`lifecycle-renamed-${idSuffix}`)) {
    throw new Error('Noindexed article still in sitemap!')
  }
  console.log('   ✓ Noindexed article removed from sitemap')

  // Step 5: Unpublish (status: 'draft')
  console.log('5. Unpublishing (status: draft)...')
  await payload.update({
    collection: 'content',
    id: articleId,
    data: { status: 'draft', seoNoIndex: false },
    overrideAccess: true,
  } as never)

  res = await fetch('http://localhost:3103/sitemaps/1.xml')
  xml = await res.text()
  if (xml.includes(`lifecycle-renamed-${idSuffix}`)) {
    throw new Error('Unpublished article still in sitemap!')
  }
  console.log('   ✓ Unpublished article removed from sitemap')

  // Step 6: Media expiry lifecycle
  console.log('6. Testing media expiry on affected public content URL...')
  // Create media
  const media = await payload.create({
    collection: 'media-assets',
    data: {
      site: siteId,
      title: `Hero Media ${idSuffix}`,
      kind: 'image',
      filename: `hero-${idSuffix}.jpg`,
      filesize: 1024,
      mimeType: 'image/jpeg',
      rightsExpiresAt: new Date(Date.now() + 86400000).toISOString(),
    },
    overrideAccess: true,
  } as never)
  const mediaId = String(media.id)

  // Create public usage linking media to published article
  const usage = await payload.create({
    collection: 'media-usages',
    data: {
      site: siteId,
      media: mediaId,
      usedBy: { relationTo: 'content', value: articleId },
      usageKey: `content:${articleId}:hero:${mediaId}`,
      targetType: 'content',
      targetId: articleId,
      purpose: 'hero',
      slot: 'hero',
      lifecycle: 'public',
    },
    overrideAccess: true,
  } as never)

  // Re-publish article so it has active public URL
  await payload.update({
    collection: 'content',
    id: articleId,
    data: { status: 'published' },
    overrideAccess: true,
  } as never)

  // Expire the media
  await payload.update({
    collection: 'media-assets',
    id: mediaId,
    data: {
      rightsExpiresAt: new Date(Date.now() - 10000).toISOString(),
    },
    overrideAccess: true,
  } as never)

  events = await payload.find({
    collection: 'execution-events',
    where: {
      and: [
        { eventType: { equals: 'discovery.indexing.changed' } },
        { idempotencyKey: { contains: `lifecycle-renamed-${idSuffix}` } },
      ],
    },
    limit: 20,
    sort: '-createdAt',
    overrideAccess: true,
  } as never)

  const mediaExpiryEvent = events.docs.find(
    (e: any) =>
      e.payload?.reason === 'media-expiry' &&
      String(e.payload?.url).includes(`lifecycle-renamed-${idSuffix}`),
  ) as any

  if (!mediaExpiryEvent) {
    throw new Error('Media expiry event targeting content URL not found!')
  }
  console.log(
    '   ✓ Media expiry event identified affected public content URL:',
    mediaExpiryEvent.payload?.url,
  )

  // Step 7: Worker processing execution
  console.log('7. Testing worker processing of outbox event...')
  const processResult = await processIndexingExecutionEvent(payload, mediaExpiryEvent)
  console.log('   ✓ Processed outbox event state:', processResult.state)
  if (processResult.state !== 'manual') {
    throw new Error(`Expected manual state, got ${processResult.state}`)
  }

  // Step 8: Clean up test usage, article and media
  console.log('8. Cleaning up test usage, article, and media...')
  await payload.delete({
    collection: 'media-usages',
    id: usage.id,
    overrideAccess: true,
  } as never)
  await payload.delete({
    collection: 'content',
    id: articleId,
    overrideAccess: true,
  } as never)
  await payload.delete({
    collection: 'media-assets',
    id: mediaId,
    overrideAccess: true,
  } as never)

  console.log('--- ALL LIFECYCLE CONVERGENCE TESTS PASSED ---')
  process.exit(0)
}

main().catch((err) => {
  console.error('FAILED:', err)
  process.exit(1)
})
