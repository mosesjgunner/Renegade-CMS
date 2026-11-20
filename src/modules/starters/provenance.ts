import { createHash } from 'node:crypto'

/**
 * Starter-example provenance (UXI-06).
 *
 * Example content is marked durably at install time, in fields the
 * collections already carry — no new schema:
 *
 * - `content.importSourceSystem` is `starter:<starterId>` for the
 *   full starters (starters/service.ts) or `onboarding-starter` for
 *   the setup flow's sample pages/draft (operations/onboarding.ts).
 * - `content.importSourceChecksum` is a hash of the example's managed
 *   fields (title, summary, status, body) as installed.
 * - Starter layouts carry their baseline in `revisionHistory`
 *   (`action: 'starter-install' | 'starter-upgrade'`, or
 *   `source: 'onboarding-starter'` for the setup home layout).
 *
 * The edited-content rule: an item stops being a removable "example"
 * the moment its current fields no longer hash to the checksum
 * recorded at install (content), or its blocks no longer match the
 * recorded starter baseline (layouts). Removal only ever touches
 * items that are still pristine examples; edited items are reported
 * as protected and left exactly as the operator left them. This is
 * the same preservation contract onboarding reruns already honor.
 */

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1))
  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(',')}}`
}

export function exampleContentChecksum(fields: {
  title?: unknown
  summary?: unknown
  status?: unknown
  body?: unknown
}): string {
  return createHash('sha256')
    .update(
      stableStringify({
        title: fields.title ?? null,
        summary: fields.summary ?? null,
        status: fields.status ?? null,
        body: fields.body ?? null,
      }),
    )
    .digest('hex')
}

export function isStarterProvenance(system: unknown): boolean {
  return (
    system === 'onboarding-starter' || (typeof system === 'string' && system.startsWith('starter:'))
  )
}

/** Whether a stored content record still matches its install-time checksum. */
export function contentMatchesInstallChecksum(doc: Record<string, unknown>): boolean | null {
  const stored = doc.importSourceChecksum
  if (typeof stored !== 'string' || !stored) return null
  return (
    exampleContentChecksum({
      title: doc.title,
      summary: doc.summary,
      status: doc.status,
      body: doc.body,
    }) === stored
  )
}
