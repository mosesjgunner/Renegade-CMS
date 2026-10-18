import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import config from '@payload-config'
import { getPayload } from 'payload'

async function run() {
  console.log('--- RC1-03B / Verifying Persistence Across Container Restart ---')
  const payload = await getPayload({ config })

  const rawState = await readFile('scratch/rc103b-20261018/state-summary.json', 'utf8')
  const savedState = JSON.parse(rawState)

  console.log('1. Checking Sites & Publications...')
  const siteA = await payload.findByID({ collection: 'sites', id: savedState.siteA.id })
  assert.equal(siteA.name, 'Site Alpha')
  const siteB = await payload.findByID({ collection: 'sites', id: savedState.siteB.id })
  assert.equal(siteB.name, 'Site Beta')

  console.log('2. Checking Authors...')
  const authorJane = await payload.findByID({ collection: 'authors', id: savedState.authors[0].id })
  assert.equal(authorJane.displayName, 'Jane Author')
  const authorMark = await payload.findByID({ collection: 'authors', id: savedState.authors[1].id })
  assert.equal(authorMark.displayName, 'Mark Columnist')

  console.log('3. Checking Articles & Page...')
  const article1 = await payload.findByID({ collection: 'content', id: savedState.article1.id, depth: 2 })
  assert.equal(article1.title, savedState.article1.title)
  assert.equal(article1.status, 'draft')
  assert.equal((article1.authors as any[])[0].author.displayName, 'Jane Author')

  const article2 = await payload.findByID({ collection: 'content', id: savedState.article2.id })
  assert.equal(article2.title, savedState.article2.title)

  const page1 = await payload.findByID({ collection: 'content', id: savedState.page1.id })
  assert.equal(page1.title, savedState.page1.title)
  assert.equal(page1.contentType, 'page')

  console.log('4. Checking Revision Records & Family Companion...')
  const family1 = await payload.findByID({ collection: 'article-family-content', id: savedState.family1.id })
  assert.equal(family1.currentRevisionSequence, savedState.family1.currentRevisionSequence)

  const revisions = await payload.find({
    collection: 'revision-records',
    where: { article: { equals: family1.id } },
    sort: 'sequence',
  })
  assert.equal(revisions.totalDocs, savedState.totalRevisionsArticle1)
  assert.equal(revisions.docs[2].reason, 'restored')

  console.log('✓ Container restart persistence verified: all articles, pages, authors, and revision histories intact.')
  process.exit(0)
}

run().catch((err) => {
  console.error('FATAL Restart Verification Error:', err)
  process.exit(1)
})
