/**
 * RC3-EMAIL-01 frozen contract: traffic classes and the immutable
 * purpose-to-class policy (docs/rc/email/EMAIL_CONTRACTS.md §1).
 *
 * Callers name a purpose; this policy assigns the class. Caller-supplied
 * metadata, UI settings, and message content can never upgrade a purpose
 * into the protected `account` class.
 */

export type EmailTrafficClass = 'account' | 'operational' | 'audience_confirmation' | 'audience'

export type EmailPurpose =
  | 'member-sign-in'
  | 'member-email-link'
  | 'staff-invitation'
  | 'account-recovery'
  | 'order-receipt'
  | 'community-notification'
  | 'form-notification'
  | 'telecom-fallback'
  | 'admin-alert'
  | 'newsletter-confirmation'
  | 'campaign'
  | 'newsletter'
  | 'digest'

export const PURPOSE_TO_CLASS: Readonly<Record<EmailPurpose, EmailTrafficClass>> = Object.freeze({
  'member-sign-in': 'account',
  'member-email-link': 'account',
  'staff-invitation': 'account',
  'account-recovery': 'account',
  'order-receipt': 'operational',
  'community-notification': 'operational',
  'form-notification': 'operational',
  'telecom-fallback': 'operational',
  'admin-alert': 'operational',
  'newsletter-confirmation': 'audience_confirmation',
  campaign: 'audience',
  newsletter: 'audience',
  digest: 'audience',
})

export const EMAIL_PURPOSES = Object.keys(PURPOSE_TO_CLASS) as EmailPurpose[]

export function classForPurpose(purpose: string): EmailTrafficClass {
  const assigned = (PURPOSE_TO_CLASS as Record<string, EmailTrafficClass>)[purpose]
  if (!assigned) throw new Error(`Unknown email purpose: ${purpose}`)
  return assigned
}

export function isEmailPurpose(value: string): value is EmailPurpose {
  return value in PURPOSE_TO_CLASS
}

/** The provider boundary a class dispatches through. Operational mail shares
 * the account (transactional) provider boundary with its own bounded budget;
 * it never rides the audience boundary. */
export type EmailBoundary = 'account' | 'audience'

export function boundaryForClass(trafficClass: EmailTrafficClass): EmailBoundary {
  return trafficClass === 'audience' || trafficClass === 'audience_confirmation'
    ? 'audience'
    : 'account'
}

/** Adapter capability category a class maps to in the legacy contract. */
export function adapterCategoryForClass(
  trafficClass: EmailTrafficClass,
): 'transactional' | 'operational' | 'marketing' {
  if (trafficClass === 'account') return 'transactional'
  if (trafficClass === 'operational') return 'operational'
  if (trafficClass === 'audience_confirmation') return 'transactional'
  return 'marketing'
}

/** Retry budget per class: max attempts and the total window they must fit in.
 * Dispatch is always additionally bounded by the intent's action expiry. */
export const RETRY_POLICY: Readonly<
  Record<EmailTrafficClass, { maxAttempts: number; windowMs: number; baseDelayMs: number }>
> = Object.freeze({
  account: { maxAttempts: 4, windowMs: 5 * 60_000, baseDelayMs: 15_000 },
  operational: { maxAttempts: 4, windowMs: 60 * 60_000, baseDelayMs: 60_000 },
  audience_confirmation: { maxAttempts: 4, windowMs: 6 * 60 * 60_000, baseDelayMs: 60_000 },
  audience: { maxAttempts: 4, windowMs: 6 * 60 * 60_000, baseDelayMs: 60_000 },
})

/** Minimum remaining action lifetime required before a dispatch attempt. */
export const MIN_ACTION_LIFETIME_MS = 2 * 60_000
