import type { TaskConfig } from 'payload'

type RetentionTask = {
  input: Record<string, never>
  output: { deleted: number; observedAt: string }
}
/** Deletes only raw events whose collection-time expiry has passed; consent evidence is intentionally excluded. */
export const analyticsRetentionTask: TaskConfig<RetentionTask> = {
  slug: 'analytics-retention-cleanup',
  label: 'Delete expired raw analytics events',
  inputSchema: [],
  outputSchema: [
    { name: 'deleted', type: 'number', required: true },
    { name: 'observedAt', type: 'date', required: true },
  ],
  retries: { attempts: 2, backoff: { delay: 500, type: 'exponential' } },
  concurrency: () => 'analytics.retention',
  schedule: [{ cron: '17 3 * * *', queue: 'analytics' }],
  handler: async ({ req }) => {
    const observedAt = new Date().toISOString()
    const expired = await req.payload.find({
      collection: 'analytics-events',
      where: { retentionExpiresAt: { less_than_equal: observedAt } },
      limit: 500,
      depth: 0,
      overrideAccess: true,
    } as never)
    await Promise.all(
      expired.docs.map((event) =>
        req.payload.delete({
          collection: 'analytics-events',
          id: event.id,
          overrideAccess: true,
        } as never),
      ),
    )
    return { output: { deleted: expired.docs.length, observedAt } }
  },
}
export const analyticsTasks = [analyticsRetentionTask]
