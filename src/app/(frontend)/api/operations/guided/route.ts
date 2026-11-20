import config from '@payload-config'
import { getPayload } from 'payload'
import { migrations } from '@/migrations'
import { loadConfig } from '@/modules/core/config'
import { backupStatusFromMedia } from '@/modules/operations/backup'
import { buildOperationsDiagnostics, isOperator } from '@/modules/operations/diagnostics'
import {
  KEY_CUSTODY_EXPLANATION,
  OFF_HOST_EXPLANATION,
  describeSupportBundlePreview,
  effectiveBackupDestination,
  evaluateUpdatePreflight,
  freeDiskBytes,
  loadBackupDestinationConfig,
  parseBackupStatusRecord,
  translateDiagnosticsToHealthItems,
} from '@/modules/operations/guided-operations'
import { backupDestinationLabel } from '@/modules/operations/backup'

export const dynamic = 'force-dynamic'

/**
 * UXI-11 guided operations read model: health in task terms, backup
 * status with truthful coverage/destination labelling, update preflight,
 * and the support-bundle preview descriptor — all derived from the real
 * diagnostics/backup engines. Operator-gated like the other operations
 * routes. Dismissed health tips arrive via ?dismissed=; the translation
 * rule (a dismissal never hides a failure) is applied server-side.
 */
export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!isOperator(auth.user))
    return Response.json({ error: 'Operator access required.' }, { status: 403 })

  const url = new URL(request.url)
  const dismissed = (url.searchParams.get('dismissed') ?? '').split(',').filter(Boolean)
  const appConfig = loadConfig()
  const diagnostics = await buildOperationsDiagnostics(payload, appConfig, {
    expectedMigrations: migrations.map((migration) => migration.name),
  })
  const backupStatus = parseBackupStatusRecord(
    await backupStatusFromMedia(appConfig.storage.mediaDir),
  )
  const destinationConfig = await loadBackupDestinationConfig(appConfig.storage.mediaDir)
  const destination = effectiveBackupDestination(destinationConfig, backupStatus)
  const update = evaluateUpdatePreflight({
    currentVersion: appConfig.version,
    targetVersion: url.searchParams.get('targetVersion'),
    targetImageTag: url.searchParams.get('targetImageTag'),
    backup: backupStatus,
    freeDiskBytes: await freeDiskBytes(appConfig.storage.mediaDir),
  })

  return Response.json({
    generatedAt: diagnostics.generatedAt,
    health: translateDiagnosticsToHealthItems(diagnostics, dismissed),
    backup: {
      status: backupStatus.status,
      lastSuccessfulAt: backupStatus.lastSuccessfulAt,
      lastFailureAt: backupStatus.lastFailureAt,
      verified: backupStatus.verified,
      coverage: backupStatus.coverage ?? diagnostics.backup.coverage ?? null,
      destination,
      destinationLabel: backupDestinationLabel(destination),
      destinationConfig,
      keyCustodyExplanation: KEY_CUSTODY_EXPLANATION,
      offHostExplanation: OFF_HOST_EXPLANATION,
    },
    update,
    supportBundlePreview: describeSupportBundlePreview(),
  })
}
