import path from 'node:path'

import config from '@payload-config'
import { getPayload } from 'payload'
import { loadConfig } from '@/modules/core/config'
import { restoreBackupToFixtureTarget } from '@/modules/operations/backup'
import { isOperator } from '@/modules/operations/diagnostics'
import {
  LIVE_RESTORE_COMMAND,
  checkRestoreCompatibility,
  liveRestoreOffered,
} from '@/modules/operations/guided-operations'

export const dynamic = 'force-dynamic'

/**
 * UXI-11 guided restore, step 1: restore a backup into a SEPARATE fixture
 * target under the media dir and verify it there. Live data is never a
 * target of this route. Only after this verification succeeds does the
 * response offer the (CLI) live restore — as the exact operator command,
 * never as an in-app shell-out. Operator-gated.
 */
export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!isOperator(auth.user))
    return Response.json({ error: 'Operator access required.' }, { status: 403 })
  const body = (await request.json().catch(() => null)) as { archiveDir?: unknown } | null
  const archiveDir = typeof body?.archiveDir === 'string' ? body.archiveDir.trim() : ''
  if (!archiveDir || !path.isAbsolute(archiveDir)) {
    return Response.json(
      { error: 'Give the full path of the backup folder to test-restore.' },
      { status: 400 },
    )
  }
  const appConfig = loadConfig()
  const targetRoot = path.join(
    appConfig.storage.mediaDir,
    '.renegade',
    'fixture-restores',
    new Date().toISOString().replace(/[:.]/g, '-'),
  )
  try {
    const verification = await restoreBackupToFixtureTarget({ sourceRoot: archiveDir, targetRoot })
    const compatibilityError = checkRestoreCompatibility(verification.version, appConfig.version)
    return Response.json({
      verification,
      compatibilityError,
      liveRestoreOffered: liveRestoreOffered(verification) && !compatibilityError,
      liveRestoreCommand: LIVE_RESTORE_COMMAND,
    })
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'The test restore failed. The backup was not changed and live data was not touched.',
      },
      { status: 422 },
    )
  }
}
