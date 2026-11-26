import { createHash } from 'node:crypto'
import { validateGrant, type RightsRecordShape } from './rights'

/**
 * RC3-CE distribution & stock submission packages (CE-11).
 *
 * Builds the export package a creator submits to a stock agency or
 * distribution partner: asset metadata, the rights summary a reviewer
 * needs, release checklist state, and a checksum over the canonical
 * manifest. Submission itself stays an external workflow — the
 * package is prepared locally, the record of where it went lives in
 * distribution-submissions, and an exclusive grant anywhere blocks a
 * conflicting exclusive submission everywhere.
 */

export type DistributionPackage = Readonly<{
  providerId: string
  fingerprint: string
  title: string
  description: string
  keywords: readonly string[]
  rightsBasis: string
  holders: readonly string[]
  releases: Readonly<Record<string, boolean>>
  aiTdmOptIn: boolean
  manifestChecksum: string
  preparedAt: string
}>

export function buildDistributionPackage(input: {
  providerId: string
  record: RightsRecordShape
  title: string
  description: string
  keywords: readonly string[]
  at: string
}): DistributionPackage {
  const validation = validateGrant(input.record, { rights: [], at: input.at })
  // A package may be prepared for a draft record (so the creator can
  // see what is missing), but the manifest states the blockers.
  const manifest = {
    providerId: input.providerId,
    fingerprint: input.record.fingerprint,
    title: input.title,
    description: input.description,
    keywords: [...input.keywords].sort(),
    rightsBasis: input.record.basis,
    rightsStatus: input.record.status,
    rightsBlockers: validation.reasons,
    holders: input.record.holders.map((h) => h.name),
    releases: input.record.releases,
    aiTdmOptIn: input.record.aiTdmOptIn,
  }
  return {
    providerId: input.providerId,
    fingerprint: input.record.fingerprint,
    title: input.title,
    description: input.description,
    keywords: manifest.keywords,
    rightsBasis: input.record.basis,
    holders: manifest.holders,
    releases: input.record.releases,
    aiTdmOptIn: input.record.aiTdmOptIn,
    manifestChecksum: createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),
    preparedAt: input.at,
  }
}

/**
 * Exclusivity guard: an asset under an active exclusive grant (or an
 * accepted exclusive submission) cannot be submitted exclusively
 * elsewhere. Non-exclusive submissions are unaffected.
 */
export function exclusivityConflict(input: {
  fingerprint: string
  wantExclusive: boolean
  activeGrants: readonly Readonly<{
    fingerprint: string
    termsSnapshot: Record<string, unknown>
    status: string
  }>[]
  priorSubmissions: readonly Readonly<{
    fingerprint: string
    status: string
    notes: string | null
  }>[]
}): string | null {
  if (!input.wantExclusive) return null
  for (const grant of input.activeGrants) {
    if (grant.fingerprint !== input.fingerprint) continue
    if (!['issued', 'delivered'].includes(grant.status)) continue
    if ((grant.termsSnapshot as any)?.exclusive === true)
      return 'An active exclusive license grant already covers this asset.'
  }
  for (const submission of input.priorSubmissions) {
    if (submission.fingerprint !== input.fingerprint) continue
    if (submission.status === 'accepted' && (submission.notes ?? '').includes('exclusive'))
      return 'An accepted exclusive submission already covers this asset.'
  }
  return null
}
