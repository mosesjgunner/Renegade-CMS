import { getPayload } from 'payload'
import { runSemanticUrlBackfill } from '../modules/public/semantic-url-backfill'

async function main() {
  const apply = process.argv.includes('--apply')
  const { default: config } = await import('../payload.config')
  const payload = await getPayload({ config })
  try {
    const report = await runSemanticUrlBackfill(payload, apply)
    console.log(JSON.stringify(report, null, 2))
    if (report.conflicts.length) process.exitCode = 2
  } finally {
    await payload.db.destroy?.()
  }
}

await main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
// Payload can leave worker health and telemetry handles open in CLI mode.
await new Promise<void>((resolve) => process.stdout.write('', () => resolve()))
process.exit(process.exitCode ?? 0)
