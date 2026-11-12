/* eslint-disable @typescript-eslint/no-explicit-any */
import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { getOrCreateCommentThread } from '../../src/modules/community/comment-identity'

/**
 * RC2-E-02 test boundary (stated plainly): the v1 comment surface
 * requires a comment_threads row, but no HTTP route provisions one —
 * the production provisioning function (getOrCreateCommentThread) has
 * no callers in src. The journey provisions the thread through that
 * production function, then exercises the v1 surface over real HTTP.
 * The missing provisioning path is recorded as a finding.
 * Env: E02_SITE_ID, E02_CONTENT_ID.
 */
describe('RC2-E-02 v1 thread provisioning', () => {
  it('provisions the article comment thread via the production function', async () => {
    const payload: Payload = await getPayload({ config })
    const thread = await getOrCreateCommentThread(payload as any, {
      siteId: process.env.E02_SITE_ID ?? '',
      canonicalContentId: process.env.E02_CONTENT_ID ?? '',
    })
    expect(thread.id).toBeTruthy()
    writeFileSync('/tmp/e02-v1-thread.json', JSON.stringify({ threadId: thread.id }, null, 2))
  }, 120_000)
})
