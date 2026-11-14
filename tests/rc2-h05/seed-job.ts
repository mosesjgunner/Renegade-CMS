import { getPayload } from 'payload'

import config from '../../src/payload.config'

const payload = await getPayload({ config })
const job = await payload.jobs.queue({
  task: 'social-publish',
  input: { queueItemId: 'h05-bogus-item', workerId: 'h05-lean-gate', mode: 'dispatch' },
  queue: 'operations',
} as never)
console.log(JSON.stringify({ id: String(job.id) }))
process.exit(0)
