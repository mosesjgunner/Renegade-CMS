import { getPayload } from 'payload'

import config from '../../src/payload.config'

const payload = await getPayload({ config })
const tasks = (payload.config.jobs?.tasks ?? []).map((t) => t.slug).sort()
const workflows = (payload.config.jobs?.workflows ?? []).map((t) => t.slug).sort()
console.log(JSON.stringify({ tasks, workflows }))
process.exit(0)
