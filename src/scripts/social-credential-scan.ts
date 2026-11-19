import { getPayload } from 'payload'
import { runSocialCredentialScan } from '../modules/social/credential-scan'

async function main() {
  const apply = process.argv.includes('--apply')
  const { default: config } = await import('../payload.config')
  const payload = await getPayload({ config })
  try {
    const report = await runSocialCredentialScan(payload as never, apply)
    console.log(JSON.stringify(report, null, 2))
    if (report.plaintextFound > report.reencrypted + report.invalidated) {
      // Dry run with plaintext rows remaining, or rows changed mid-scan:
      // surface as a distinct exit so operators notice.
      process.exitCode = 2
    }
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
