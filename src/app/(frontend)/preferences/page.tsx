import { redirect } from 'next/navigation'

/**
 * `/preferences` was an orphaned duplicate of the canonical newsletter
 * preference center at `/subscribe/preferences` (Stage 1 inventory:
 * no inbound links). It now redirects there, preserving the token
 * query parameter the preference links carry (UXI-07).
 */
export default async function PreferencesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = (await searchParams) ?? {}
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') query.set(key, value)
  }
  const suffix = query.toString()
  redirect(`/subscribe/preferences${suffix ? `?${suffix}` : ''}`)
}
