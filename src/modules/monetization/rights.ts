/**
 * RC3-CE rights registry core (CE-10, contract §8).
 *
 * Pure validation for license offers and grants. The registry records
 * who holds rights and what may be granted; it is not legal advice
 * and it never invents rights: an unclear basis, an expired record, a
 * missing release or a right the holder never marked grantable all
 * block the offer. AI/TDM rights are a separate, explicit opt-in —
 * silence is never consent to train on a creator's work.
 */

export type RightsRecordShape = Readonly<{
  id: string
  status: string
  basis: string
  fingerprint: string
  holders: readonly Readonly<{ name: string; shareBps?: number }>[]
  releases: Readonly<Record<string, boolean>>
  grantable: Readonly<Record<string, boolean>>
  restrictions: Readonly<Record<string, unknown>>
  expiresAt: string | null
  aiTdmOptIn: boolean
  aiTdmTermsVersion: string | null
}>

export type GrantRequest = Readonly<{
  rights: readonly string[]
  includesAiTdm?: boolean
  at: string
}>

export type RightsValidation = Readonly<{
  ok: boolean
  reasons: readonly string[]
}>

const GRANTABLE_BASES = ['original', 'commissioned', 'assignment', 'licensed-in', 'public-domain']

export function validateGrant(record: RightsRecordShape, request: GrantRequest): RightsValidation {
  const reasons: string[] = []
  if (record.status !== 'ready') reasons.push(`Rights record is ${record.status}, not ready.`)
  if (!GRANTABLE_BASES.includes(record.basis))
    reasons.push(`Rights basis "${record.basis}" cannot support a license grant.`)
  if (record.basis === 'licensed-in' && record.grantable['sublicense'] !== true)
    reasons.push(
      'Licensed-in work needs an explicit sublicensing right before it can be re-licensed.',
    )
  if (record.expiresAt && record.expiresAt <= request.at) reasons.push('Rights record has expired.')
  if (record.holders.length === 0) reasons.push('No rights holder is recorded.')
  for (const right of request.rights) {
    if (record.grantable[right] !== true)
      reasons.push(`Right "${right}" is not marked grantable on this record.`)
  }
  const requiredReleases = (record.restrictions['requiredReleases'] as string[] | undefined) ?? []
  for (const release of requiredReleases) {
    if (record.releases[release] !== true)
      reasons.push(`Required release "${release}" is not on file.`)
  }
  if (request.includesAiTdm) {
    if (!record.aiTdmOptIn)
      reasons.push(
        'AI/TDM use requires the holder\u2019s separate explicit opt-in; it is off by default.',
      )
    else if (!record.aiTdmTermsVersion) reasons.push('AI/TDM opt-in has no terms version recorded.')
    if (record.grantable['ai-tdm'] !== true)
      reasons.push('AI/TDM is not among the grantable rights on this record.')
  }
  return { ok: reasons.length === 0, reasons }
}

/**
 * The immutable terms snapshot frozen into a grant at issuance. The
 * buyer keeps exactly these terms even if the offer later changes;
 * withdrawal of an offer never rewrites an issued grant.
 */
export function grantTermsSnapshot(input: {
  offerTerms: Readonly<Record<string, unknown>>
  agreementVersion: string
  fingerprint: string
  rightsRecordId: string
  includesAiTdm: boolean
  aiTdmTermsVersion: string | null
}): Readonly<Record<string, unknown>> {
  return {
    ...input.offerTerms,
    agreementVersion: input.agreementVersion,
    fingerprint: input.fingerprint,
    rightsRecordId: input.rightsRecordId,
    aiTdm: input.includesAiTdm
      ? { included: true, termsVersion: input.aiTdmTermsVersion }
      : { included: false },
    snapshotNote:
      'Terms as shown to the buyer at purchase. Later offer edits do not alter this grant.',
  }
}
