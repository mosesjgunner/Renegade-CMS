import { getPayload } from 'payload'
import config from '@payload-config'
import { randomUUID } from 'node:crypto'

async function verifyMultipageAndFeeds() {
  console.log('--- Starting Multipage DB Comparison & Scoped Feeds Verification ---')
  const payload = await getPayload({ config })
  const pub = (await payload.find({ collection: 'publications', limit: 1, overrideAccess: true } as never)).docs[0] as any
  const siteId = typeof pub.site === 'string' ? pub.site : String(pub.site?.id ?? '')
  const publicationId = String(pub.id)
  const idSuffix = randomUUID().slice(0, 6)

  let author = (await payload.find({ collection: 'authors', limit: 1, overrideAccess: true } as never)).docs[0] as any
  if (!author) {
    author = await payload.create({
      collection: 'authors',
      data: { site: siteId, name: 'Test Author ' + idSuffix, slug: 'author-' + idSuffix },
      overrideAccess: true,
    } as never)
  }
  const authorId = String(author.id)

  // Create published article
  console.log('1. Creating test published article...')
  const article = await payload.create({
    collection: 'content',
    data: {
      site: siteId,
      publication: publicationId,
      authors: [{ author: authorId }],
      contentType: 'article',
      title: 'Scoped Feed Article ' + idSuffix,
      slug: 'scoped-feed-' + idSuffix,
      canonicalPath: '/articles/scoped-feed-' + idSuffix,
      summary: 'Summary for scoped feed ' + idSuffix,
      status: 'published',
      publishedAt: new Date().toISOString(),
      visibility: 'public',
      commentsPolicy: 'closed',
      retentionMode: 'permanent',
      removeFromDiscovery: false,
    },
    overrideAccess: true,
  } as never)
  const articleId = String(article.id)

  const baseURL = process.env.DISC03_BASE_URL || 'http://localhost:3103'

  // Gate 5: Sitemap Index & Multipage
  console.log('2. Verifying sitemap index (/sitemap.xml)...')
  let res = await fetch(baseURL + '/sitemap.xml')
  let xml = await res.text()
  if (!xml.includes('<sitemapindex') || !xml.includes('/sitemaps/1.xml')) {
    throw new Error('Sitemap index format invalid!')
  }
  console.log('   ? /sitemap.xml returns valid <sitemapindex>')

  console.log('3. Verifying sitemap page 1 (/sitemaps/1.xml)...')
  res = await fetch(baseURL + '/sitemaps/1.xml')
  xml = await res.text()
  if (!xml.includes('<urlset') || !xml.includes('scoped-feed-' + idSuffix)) {
    throw new Error('Sitemap page 1 missing published article!')
  }
  console.log('   ? /sitemaps/1.xml contains published article URL')

  // Gate 6: Scoped live fixtures
  console.log('4. Verifying author RSS XML feed (/feeds/author/' + authorId + ')...')
  res = await fetch(baseURL + '/feeds/author/' + authorId)
  xml = await res.text()
  if (!xml.includes('<rss') || !xml.includes('Scoped Feed Article ' + idSuffix)) {
    throw new Error('Author RSS feed missing article!')
  }
  console.log('   ? Author RSS feed contains article')

  console.log('5. Verifying author JSON Feed (/feeds/author/' + authorId + '.json)...')
  res = await fetch(baseURL + '/feeds/author/' + authorId + '.json')
  const json = await res.json()
  if (json.version !== 'https://jsonfeed.org/version/1.1' || !json.items?.some((i: any) => i.title.includes(idSuffix))) {
    throw new Error('Author JSON feed missing item!')
  }
  const etag = res.headers.get('etag')
  console.log('   ? Author JSON Feed valid with ETag: ' + etag)

  if (etag) {
    const res304 = await fetch(baseURL + '/feeds/author/' + authorId + '.json', { headers: { 'if-none-match': etag } })
    if (res304.status !== 304) {
      throw new Error('Expected 304 status for ETag, got ' + res304.status)
    }
    console.log('   ? ETag conditional request returned 304 Not Modified')
  }

  console.log('6. Verifying content RSS feed (/feeds/content/' + articleId + ')...')
  res = await fetch(baseURL + '/feeds/content/' + articleId)
  xml = await res.text()
  if (!xml.includes('<rss') || !xml.includes('Scoped Feed Article ' + idSuffix)) {
    throw new Error('Content RSS feed missing article!')
  }
  console.log('   ? Content RSS feed contains article')

  console.log('7. Verifying global feeds (/feed.xml & /feed.json)...')
  res = await fetch(baseURL + '/feed.xml')
  xml = await res.text()
  if (!xml.includes('<rss')) throw new Error('Global feed.xml invalid')
  console.log('   ? Global /feed.xml valid')

  res = await fetch(baseURL + '/feed.json')
  const globalJson = await res.json()
  if (globalJson.version !== 'https://jsonfeed.org/version/1.1') throw new Error('Global feed.json invalid')
  console.log('   ? Global /feed.json valid')

  console.log('8. Cleaning up test article...')
  await payload.delete({ collection: 'content', id: articleId, overrideAccess: true } as never)

  console.log('--- MULTIPAGE DB & SCOPED FEEDS VERIFICATION PASSED ---')
  process.exit(0)
}

verifyMultipageAndFeeds().catch(e => { console.error('FAILED:', e); process.exit(1); })
