import config from '../../src/payload.config'
import { getPayload } from 'payload'

const [mode, jobID] = process.argv.slice(2)
const payload = await getPayload({ config })
let exitCode = 0

try {
  if (mode === 'queue') {
    const queued = await payload.jobs.queue({
      task: 'operations-heartbeat',
      input: {},
      queue: 'operations',
      waitUntil: new Date(Date.now() + 250),
    })
    process.stdout.write(`JOB_ID=${queued.id}\n`)
  } else if (mode === 'run' && jobID) {
    await payload.jobs.runByID({ id: jobID, silent: true })
    const job = await payload.findByID({ collection: 'payload-jobs', id: jobID })
    process.stdout.write(
      `RESULT=${JSON.stringify({ completedAt: job.completedAt, hasError: job.hasError })}\n`,
    )
  } else {
    throw new Error('Expected queue or run <job-id>')
  }
} catch (error) {
  console.error(error)
  exitCode = 1
} finally {
  if (payload.db.destroy) await payload.db.destroy()
}

process.exit(exitCode)
