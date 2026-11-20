import config from '@payload-config'
import { getPayload } from 'payload'
import { loadConfig } from '@/modules/core/config'
import { isOperator } from '@/modules/operations/diagnostics'
import {
  loadBackupDestinationConfig,
  saveBackupDestinationConfig,
  validateBackupDestinationConfig,
} from '@/modules/operations/guided-operations'

export const dynamic = 'force-dynamic'

/** UXI-11: guided backup-destination configuration. Operator-gated. */
export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!isOperator(auth.user))
    return Response.json({ error: 'Operator access required.' }, { status: 403 })
  return Response.json({
    destination: await loadBackupDestinationConfig(loadConfig().storage.mediaDir),
  })
}

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!isOperator(auth.user))
    return Response.json({ error: 'Operator access required.' }, { status: 403 })
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const validated = validateBackupDestinationConfig(body ?? {})
  if (!validated.ok) return Response.json({ error: validated.error }, { status: 400 })
  const saved = await saveBackupDestinationConfig(loadConfig().storage.mediaDir, validated.value)
  return Response.json({ destination: saved })
}
