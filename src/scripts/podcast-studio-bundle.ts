/**
 * POD-19 operator CLI for the Podcast Studio portability bundle.
 *
 *   npx tsx src/scripts/podcast-studio-bundle.ts export --show <showId> --out <dir>
 *   npx tsx src/scripts/podcast-studio-bundle.ts import --bundle <dir> --site <siteId>
 *
 * Export writes a self-describing bundle directory (see
 * src/modules/podcast-studio/portability.ts and the bundle README).
 * Import verifies every manifest checksum before writing, then restores
 * the show into the target site with GUIDs, chapters, transcripts and
 * enclosure checksums preserved. Secrets never travel in a bundle.
 */
import { getPayload } from 'payload'

import config from '../payload.config'
import { exportShowBundle, importShowBundle } from '../modules/podcast-studio/portability'

const arg = (name: string): string => {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? String(process.argv[index + 1] ?? '') : ''
}

async function main(): Promise<void> {
  const [command] = process.argv.slice(2)
  const payload = await getPayload({ config })
  if (command === 'export') {
    const showId = arg('show')
    const out = arg('out')
    if (!showId || !out) throw new Error('export requires --show <showId> --out <dir>')
    const result = await exportShowBundle(payload as never, showId, out)
    console.log(
      JSON.stringify(
        {
          bundleDir: result.bundleDir,
          bundleId: result.manifest.bundleId,
          files: result.manifest.contents.length,
          media: result.media.map((entry) => ({
            assetId: entry.assetId,
            role: entry.role,
            inBundle: Boolean(entry.bundlePath),
            checksumSha256: entry.checksumSha256,
          })),
          counts: result.counts,
        },
        null,
        2,
      ),
    )
  } else if (command === 'import') {
    const bundle = arg('bundle')
    const siteId = arg('site')
    if (!bundle || !siteId) throw new Error('import requires --bundle <dir> --site <siteId>')
    const result = await importShowBundle(payload as never, bundle, { siteId })
    console.log(JSON.stringify(result, null, 2))
  } else {
    throw new Error('Usage: podcast-studio-bundle <export|import> [options]')
  }
  await payload.db.destroy?.()
  // Payload keeps pools/timers alive after destroy; exit explicitly.
  process.exit(0)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
