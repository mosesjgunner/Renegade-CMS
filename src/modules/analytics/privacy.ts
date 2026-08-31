import { createHash, createHmac, randomUUID } from 'node:crypto'

import type { PrivacyPolicy, ConsentChoices } from './contracts'
import { defaultPrivacyPolicy, normalizeConsentChoices } from './contracts'

const consentCookie = 'renegade-consent'
const cookieMaxAge = 60 * 60 * 24 * 180
type StoredConsent = { subject: string; version: string; choices: ConsentChoices }

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
