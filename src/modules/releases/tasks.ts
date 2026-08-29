import type { TaskConfig } from 'payload'

import { executeContentRelease } from './service'

type ContentReleaseExecutionTask = {
  input: { releaseId: string; scheduleMutationId: string; actorId: string }
  output: { releaseId: string; status: string; succeeded: number; unresolved: number }
}

/** Durable saga worker: failures are persisted per item so retries only resume unresolved work. */
export const contentReleaseExecutionTask: TaskConfig<ContentReleaseExecutionTask> = {
  slug: 'content-release-execute',
  label: 'Execute scheduled content release',
  inputSchema: [
    { name: 'releaseId', type: 'text', required: true },
    { name: 'scheduleMutationId', type: 'text', required: true },
    { name: 'actorId', type: 'text', required: true },
  ],
  outputSchema: [
    { name: 'releaseId', type: 'text', required: true },
    { name: 'status', type: 'text', required: true },
    { name: 'succeeded', type: 'number', required: true },
    { name: 'unresolved', type: 'number', required: true },
  ],
  retries: { attempts: 2, backoff: { delay: 250, type: 'exponential' } },
  concurrency: ({ input }) => `content-release:${String(input.releaseId)}`,
  handler: async ({ input, req }) => ({ output: await executeContentRelease(req.payload, input) }),
}

export const releaseTasks = [contentReleaseExecutionTask]
