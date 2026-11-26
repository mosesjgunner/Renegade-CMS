import { NextResponse } from 'next/server'
import { ALL_PROVIDERS, catalogCounts, findProvider } from '@/modules/monetization/catalog'

/**
 * Provider catalog (CE-04): descriptive data only. Entries record
 * what provider documentation said on the checked date; presence in
 * the catalog is not a connection, an approval, or an integration
 * claim — counts are reported by mode and evidence level.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const query = url.searchParams.get('q')
  if (query) {
    const found = findProvider(query)
    return NextResponse.json({ provider: found ?? null })
  }
  const family = url.searchParams.get('family')
  const providers = family ? ALL_PROVIDERS.filter((p) => p.family === family) : ALL_PROVIDERS
  return NextResponse.json({ providers, counts: catalogCounts() })
}
