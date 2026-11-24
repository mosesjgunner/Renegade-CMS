import { loadRenegadeIdConfig, renegadeIdJwks } from '@/modules/identity/renegade-id'

/** RC3-21 #63: public key publication (JWKS) for this install's Renegade ID key. */
export async function GET() {
  const idConfig = loadRenegadeIdConfig()
  if (!idConfig) return Response.json({ error: 'Renegade ID is not configured.' }, { status: 503 })
  return Response.json(await renegadeIdJwks(idConfig), {
    headers: { 'cache-control': 'public, max-age=300' },
  })
}
