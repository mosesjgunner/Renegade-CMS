/* eslint-disable @typescript-eslint/no-explicit-any */
import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { getOrCreateAttachedDiscussion } from '../../src/modules/community/service'

/**
 * RC2-E03 v1 thread provisioning. Before the RC2-DEBT-20 fold, the
 * v1 comment surface required a comment_threads row that no HTTP
 * route provisioned — the journey had to call the production
 * provisioning function directly, and the gap was recorded as a
 * finding. The fold closed it: a v1 thread id is now the id of the
 * article's attached discussion, provisioned by the same production
 * function the live comment path uses (getOrCreateAttachedDiscussion).
 * The spec still provisions through that function so the journey can
 * address the thread over real HTTP.
 * Env: E03_SITE_ID, E03_CONTENT_ID.
 */
describe('RC2-E-03 v1 thread provisioning', () => {
  it('provisions the article comment thread via the production function', async () => {
    const payload: Payload = await getPayload({ config })
    const siteId = process.env.E03_SITE_ID ?? ''
    const contentId = process.env.E03_CONTENT_ID ?? ''
    const content = (await payload.findByID({
      collection: 'content',
      id: contentId,
      depth: 0,
      overrideAccess: true,
    })) as unknown as { title?: string; canonicalPath?: string } | null
    const thread = await getOrCreateAttachedDiscussion(payload, {
      siteId,
      attachedToCollection: 'content',
      attachedToId: contentId,
      title: content?.title ?? 'Comments',
      canonicalPath: content?.canonicalPath ?? `/content/${contentId}`,
    })
    expect(thread.id).toBeTruthy()
    writeFileSync('/tmp/e03-v1-thread.json', JSON.stringify({ threadId: thread.id }, null, 2))
  }, 120_000)
})
