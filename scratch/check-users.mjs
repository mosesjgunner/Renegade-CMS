import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

const payload = await getPayload({ config })
const users = await payload.find({ collection: 'users', overrideAccess: true })
console.log('Users found:', users.docs.length)
for (const u of users.docs) {
  console.log({ id: u.id, email: u.email, role: u.role })
}
process.exit(0)
