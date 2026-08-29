import config from '@payload-config'
import { getPayload } from 'payload'
import { migrations } from '@/migrations'
import { loadConfig } from '@/modules/core/config'
import {
  buildOperationsDiagnostics,
  createSupportBundle,
  isOperator,
} from '@/modules/operations/diagnostics'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!isOperator(auth.user))
    return Response.json({ error: 'Operator access required.' }, { status: 403 })
  const appConfig = loadConfig()
  const diagnostics = await buildOperationsDiagnostics(payload, appConfig, {
    expectedMigrations: migrations.map((migration) => migration.name),
  })
  return new Response(createSupportBundle(diagnostics, appConfig), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': 'attachment; filename="renegade-support-bundle.json"',
    },
  })
}
