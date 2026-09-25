import { getPayload } from 'payload'
import config from '../../../src/payload.config'

async function main() {
  const id = process.argv[2]
  if (!id) throw new Error('Proposal ID required.')
  const payload = await getPayload({ config })
  try {
    const proposal = await payload.findByID({ collection: 'ai-proposals' as never,
      id, depth: 0, overrideAccess: true }) as { status: string; auditId: string }
    console.log(`AI_RESTART=${JSON.stringify({ status: proposal.status, auditId: proposal.auditId })}`)
  } finally {
    await payload.db.destroy?.()
  }
}
main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1) })
