import config from '@payload-config'
import { getPayload } from 'payload'
import { migrations } from '@/migrations'
import { loadConfig } from '@/modules/core/config'
import { buildOperationsDiagnostics, isOperator } from '@/modules/operations/diagnostics'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!isOperator(auth.user))
    return Response.json({ error: 'Operator access required.' }, { status: 403 })
  return Response.json(
    await buildOperationsDiagnostics(payload, loadConfig(), {
      expectedMigrations: migrations.map((migration) => migration.name),
    }),
  )
}
