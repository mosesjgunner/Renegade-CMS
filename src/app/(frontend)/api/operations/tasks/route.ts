import config from '@payload-config'
import { getPayload } from 'payload'

import { loadConfig } from '@/modules/core/config'
import { isOperator } from '@/modules/operations/diagnostics'
import { getInstallationReadiness } from '@/modules/operations/installation'
import {
  evaluateSetupTasks,
  loadTaskReadinessSnapshot,
  type SetupProviderStatus,
  type TaskReadiness,
} from '@/modules/operations/task-readiness'

export const dynamic = 'force-dynamic'

/**
 * Operator surface for the shared task-readiness service (UXI-02).
 *
 * Serves the latest evaluated snapshot persisted by the setup readiness
 * route, merged with a fresh live evaluation of the core installation
 * tasks (database / migrations / installation state). Provider tasks that
 * need heavier probes (storage, audio engine) come from the snapshot —
 * the response says so via `source` instead of pretending they were
 * re-checked here.
 */
export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!isOperator(auth.user)) {
    return Response.json({ error: 'Operator access required.' }, { status: 403 })
  }

  const runtimeConfig = loadConfig()
  const readiness = await getInstallationReadiness(payload, runtimeConfig)
  const now = new Date()

  const liveProviders: Record<string, SetupProviderStatus> = {
    database: {
      name: 'PostgreSQL Database',
      type: 'required',
      status: readiness.database === 'connected' ? 'validated' : 'failed',
      message:
        readiness.database === 'connected'
          ? 'Connected and operational'
          : 'Database connection failed',
      recovery: readiness.recoveryAction,
    },
  }
  const liveTasks = evaluateSetupTasks({ readiness, providers: liveProviders, now })
  const liveCore = liveTasks.filter((task) =>
    ['setup.database', 'setup.migrations', 'setup.installation'].includes(task.taskId),
  )

  const snapshot = await loadTaskReadinessSnapshot(payload)
  const merged = new Map<string, TaskReadiness>()
  for (const task of snapshot?.tasks ?? []) merged.set(task.taskId, task)
  for (const task of liveCore) merged.set(task.taskId, task)

  return Response.json({
    tasks: [...merged.values()],
    source: snapshot ? 'snapshot+live' : 'live',
    snapshotCheckedAt: snapshot?.checkedAt ?? null,
    checkedAt: now.toISOString(),
  })
}
