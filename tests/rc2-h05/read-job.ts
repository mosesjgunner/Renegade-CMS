import { getPayload } from 'payload'

import config from '../../src/payload.config'

const id = process.argv[2]
const payload = await getPayload({ config })
const job = await payload.findByID({
  collection: 'payload-jobs',
  id,
  depth: 0,
  overrideAccess: true,
} as never)
const j = job as unknown as Record<string, unknown>
console.log(
  JSON.stringify({
    id: String(j.id),
    taskSlug: j.taskSlug,
    status: j.status ?? null,
    hasError: j.hasError ?? null,
    error: j.error ? String(j.error).slice(0, 160) : null,
    completedAt: j.completedAt ?? null,
    processing: j.processing ?? null,
    updatedAt: j.updatedAt ?? null,
  }),
)
process.exit(0)
