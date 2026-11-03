import type { TaskConfig } from 'payload'

import { executeScheduledPublishJob } from './scheduler'
import { OPERATIONS_QUEUE } from '../operations/tasks'
import { loadConfig } from '../core/config'
import { cleanupExpiredUploadSessions } from '../media/upload-sessions'
import {
  cleanupOrphanedMessageAttachments,
  scanPendingMessageAttachments,
} from '../community/message-attachments'

type EditorialPublishTask = {
  input: { articleId: string; actorId: string; key: string }
  output: { articleId: string; published: boolean }
}

export const editorialPublishTask: TaskConfig<EditorialPublishTask> = {
  slug: 'editorial-publish',
  label: 'Editorial scheduled publish',
  inputSchema: [
    { name: 'articleId', type: 'text', required: true },
    { name: 'actorId', type: 'text', required: true },
    { name: 'key', type: 'text', required: true },
  ],
  outputSchema: [
    { name: 'articleId', type: 'text', required: true },
    { name: 'published', type: 'checkbox', required: true },
  ],
  retries: { attempts: 2, backoff: { delay: 250, type: 'exponential' } },
  concurrency: ({ input }) => `editorial.publish:${String(input.articleId)}:${String(input.key)}`,
  handler: async ({ input, req }) => {
    const found = await req.payload.find({
      collection: 'scheduled-publish-jobs',
      where: { idempotencyKey: { equals: input.key } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const job = found.docs[0]
    if (!job) throw new Error('Scheduled publication contract was not found.')
    const articleId = typeof job.article === 'object' ? job.article.id : job.article
    if (String(articleId) !== input.articleId) throw new Error('Scheduled article mismatch.')
    const result = await executeScheduledPublishJob(req.payload, String(job.id), {
      workerId: `payload-${process.pid}`,
    })
    if (!result.success && job.status !== 'cancelled' && job.status !== 'failed')
      throw new Error(result.error ?? 'Scheduled publication deferred.')
    const published = result.published
    req.payload.logger.info({
      event: 'editorial.job.publish',
      articleId: input.articleId,
      idempotencyKey: input.key,
      published,
      queue: OPERATIONS_QUEUE,
    })
    return { output: { articleId: input.articleId, published } }
  },
}

export const mediaUploadCleanupTask: TaskConfig = {
  slug: 'media-upload-cleanup',
  label: 'Clean abandoned media uploads',
  inputSchema: [],
  outputSchema: [{ name: 'removed', type: 'number', required: true }],
  retries: { attempts: 2, backoff: { delay: 500, type: 'exponential' } },
  concurrency: () => 'media.upload.cleanup',
  schedule: [{ cron: '11 */15 * * * *', queue: OPERATIONS_QUEUE }],
  handler: async ({ req }) => ({
    output: { removed: await cleanupExpiredUploadSessions(req.payload, loadConfig()) },
  }),
}

export const messageAttachmentCleanupTask: TaskConfig = {
  slug: 'community-message-attachment-cleanup',
  label: 'Clean abandoned message attachments',
  inputSchema: [],
  outputSchema: [{ name: 'removed', type: 'number', required: true }],
  retries: { attempts: 2, backoff: { delay: 500, type: 'exponential' } },
  concurrency: () => 'community.message-attachment.cleanup',
  schedule: [{ cron: '23 3 * * *', queue: OPERATIONS_QUEUE }],
  handler: async ({ req }) => ({
    output: { removed: await cleanupOrphanedMessageAttachments(req.payload, loadConfig()) },
  }),
}

export const messageAttachmentScanTask: TaskConfig = {
  slug: 'community-message-attachment-scan',
  label: 'Scan pending message attachments',
  inputSchema: [],
  outputSchema: [{ name: 'scanned', type: 'number', required: true }],
  retries: { attempts: 2, backoff: { delay: 500, type: 'exponential' } },
  concurrency: () => 'community.message-attachment.scan',
  schedule: [{ cron: '*/30 * * * * *', queue: OPERATIONS_QUEUE }],
  handler: async ({ req }) => ({
    output: { scanned: await scanPendingMessageAttachments(req.payload, loadConfig()) },
  }),
}

export const editorialTasks = [
  editorialPublishTask,
  mediaUploadCleanupTask,
  messageAttachmentCleanupTask,
  messageAttachmentScanTask,
]
