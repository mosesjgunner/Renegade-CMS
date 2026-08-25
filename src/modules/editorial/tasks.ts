import type { TaskConfig } from 'payload'

import { publishScheduledArticle } from './persistence'
import { OPERATIONS_QUEUE } from '../operations/tasks'

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
    const published = await publishScheduledArticle(req.payload, {
      articleId: input.articleId,
      actor: { id: input.actorId, role: 'publisher' },
      actorUserId: input.actorId,
      idempotencyKey: input.key,
    })
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

export const editorialTasks = [editorialPublishTask]
