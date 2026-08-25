import type { TaskConfig } from 'payload'

export const OPERATIONS_QUEUE = 'operations'

type HeartbeatTask = {
  input: Record<string, never>
  output: { observedAt: string; version: string }
}

type ForcedFailureTask = {
  input: { marker: string }
  output: Record<string, never>
}

export const operationalHeartbeatTask: TaskConfig<HeartbeatTask> = {
  slug: 'operations-heartbeat',
  label: 'Operations heartbeat',
  inputSchema: [],
  outputSchema: [
    { name: 'observedAt', type: 'date', required: true },
    { name: 'version', type: 'text', required: true },
  ],
  retries: 0,
  concurrency: () => 'operations.heartbeat',
  schedule: [{ cron: '*/5 * * * *', queue: OPERATIONS_QUEUE }],
  handler: async ({ req }) => {
    const observedAt = new Date().toISOString()
    const version = process.env.APP_VERSION ?? '0.1.0-dev'
    req.payload.logger.info({ event: 'operations.job.heartbeat', observedAt, version })
    return { output: { observedAt, version } }
  },
}

export const forcedFailureTask: TaskConfig<ForcedFailureTask> = {
  slug: 'operations-forced-failure',
  label: 'Operations retry proof',
  inputSchema: [{ name: 'marker', type: 'text', required: true }],
  outputSchema: [],
  retries: { attempts: 2, backoff: { delay: 100, type: 'exponential' } },
  concurrency: ({ input }) => `operations.forced-failure:${String(input.marker)}`,
  handler: async ({ input, job, req }) => {
    req.payload.logger.warn({
      event: 'operations.job.forced_failure',
      jobId: job.id,
      marker: input.marker,
      attempt: (job.totalTried ?? 0) + 1,
    })
    throw new Error('Intentional operations retry proof failure')
  },
  onFail: async ({ job, req }) => {
    req.payload.logger.error({
      event: 'operations.job.attempt_failed',
      jobId: job.id,
      attempt: (job.totalTried ?? 0) + 1,
    })
  },
}

export const operationsTasks = [operationalHeartbeatTask, forcedFailureTask]
