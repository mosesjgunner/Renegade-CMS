import { createHash, createHmac, randomUUID } from 'node:crypto'

import type { PrivacyPolicy, ConsentChoices } from './contracts'
import { defaultPrivacyPolicy, normalizeConsentChoices } from './contracts'

const consentCookie = 'renegade-consent'
const cookieMaxAge = 60 * 60 * 24 * 180
export type StoredConsent = {
  subject: string
  version: string
  choices: ConsentChoices
  siteId?: string
}

const encode = (value: StoredConsent, secret: string) => {
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url')
  const signature = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}
export const readConsent = (cookie: string | null, secret: string): StoredConsent | null => {
  const token = cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${consentCookie}=`))
    ?.slice(consentCookie.length + 1)
  if (!token) return null
  const [payload, signature] = token.split('.')
  if (
    !payload ||
    !signature ||
    createHmac('sha256', secret).update(payload).digest('base64url') !== signature
  )
    return null
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString()) as StoredConsent
    return value.subject && value.version
      ? { ...value, choices: normalizeConsentChoices(value.choices) }
      : null
  } catch {
    return null
  }
}
export const consentSetCookie = (value: StoredConsent, secret: string, secure: boolean) =>
  `${consentCookie}=${encode(value, secret)}; Max-Age=${cookieMaxAge}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
export const consentSubject = (existing?: StoredConsent | null) => existing?.subject ?? randomUUID()
export const consentSubjectHash = (subject: string, secret: string) =>
  createHash('sha256').update(`${secret}:${subject}`).digest('hex')
export const privacyPolicyFromSettings = (settings: unknown): PrivacyPolicy => {
  const privacy = (settings as { privacy?: Partial<PrivacyPolicy> } | null)?.privacy
  return { ...defaultPrivacyPolicy, ...privacy }
}
export const browserPrivacySignals = (headers: Headers) => ({
  globalPrivacyControl: headers.get('sec-gpc') === '1',
  doNotTrack: headers.get('dnt') === '1',
})

/** Browser identifiers are scoped to the consent subject and publication, never caller-supplied IDs. */
export const analyticsSubjectHash = (consent: StoredConsent, siteId: string, secret: string) =>
  consentSubjectHash(`${siteId}:${consent.subject}`, secret)

/** A signed old cookie cannot undo a persisted withdrawal. Fail closed if evidence is missing. */
export async function hasCurrentAnalyticsConsent(
  payload: import('payload').Payload,
  consent: StoredConsent | null,
  siteId: string,
  secret: string,
  policy: PrivacyPolicy,
  signals: Partial<ReturnType<typeof browserPrivacySignals>>,
) {
  const { analyticsAllowed } = await import('./contracts')
  if (
    !consent ||
    consent.siteId !== siteId ||
    consent.version !== policy.consentVersion ||
    !analyticsAllowed({ choices: consent.choices, policy, ...signals })
  )
    return false
  const latest = await payload.find({
    collection: 'analytics-consent-records',
    where: {
      and: [
        { site: { equals: siteId } },
        { subjectHash: { equals: analyticsSubjectHash(consent, siteId, secret) } },
      ],
    },
    sort: '-occurredAt',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const record = latest.docs[0]
  return Boolean(
    record &&
      record.consentVersion === policy.consentVersion &&
      record.action !== 'withdraw' &&
      (record.categories as ConsentChoices)?.analytics === true,
  )
}

/** Authenticated operator visits are operational activity, not audience engagement. */
export async function isInternalAnalyticsActor(
  payload: import('payload').Payload,
  request: Request,
) {
  const auth = await payload.auth({ headers: request.headers })
  return ['owner', 'administrator', 'staff'].includes(String(auth.user?.role))
}
