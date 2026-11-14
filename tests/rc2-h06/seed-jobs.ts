// RC2-H-06 worker-throughput seeder: queues N bogus social-publish jobs
// (unknown queue item id -> each attempt fails fast and terminally) and
// prints their ids as JSON. Run with the Standard env.
import { getPayload } from 'payload'

import config from '../../src/payload.config'

const count = Number(process.argv[2] || 30)
const payload = await getPayload({ config })
const ids: string[] = []
for (let i = 0; i < count; i++) {
  const job = await payload.jobs.queue({
    task: 'social-publish',
    input: { queueItemId: `h06-bogus-${i}`, workerId: 'h06-throughput', mode: 'dispatch' },
    queue: 'operations',
  } as never)
  ids.push(String(job.id))
}
console.log(JSON.stringify({ count, ids }))
process.exit(0)
