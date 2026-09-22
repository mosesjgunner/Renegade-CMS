import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const FORM_TEMPLATES = [
  'contact',
  'newsletter-signup',
  'volunteer',
  'sponsorship-inquiry',
  'advertiser-media-kit',
  'donation-interest',
  'reader-submission',
  'confidential-tip',
  'event-rsvp',
  'survey',
  'poll',
  'application',
  'waitlist',
  'quote-request',
  'product-preorder-interest',
  'custom',
] as const
export type FormTemplate = (typeof FORM_TEMPLATES)[number]
export type FormField = {
  key: string
  type: string
  required?: boolean
  label: string
  helpText?: string
  validation?: Record<string, unknown>
  visibleWhen?: { field: string; equals: string | boolean | number }
}
export const SUPPORTED_FORM_FIELD_TYPES = [
  'text',
  'email',
  'textarea',
  'select',
  'radio',
  'checkbox',
  'number',
  'date',
  'hidden',
] as const
export type FormSchemaSnapshot = {
  version: number
  locale: string
  fields: readonly FormField[]
  consentText?: string
  consentRevision?: string
  consentTranslationStatus?: string
  sourceLocale?: string
}
export const audienceDigest = (value: string) =>
  createHash('sha256').update(value).digest('base64url')

/** Canonical channel keys are deliberately small: provider ids never become identity. */
export function normalizeEmailAddress(value: string) {
  const email = value.normalize('NFKC').trim().toLocaleLowerCase('en-US')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) || email.length > 254)
    throw new Error('Enter a valid email address.')
  return email
}

/** E.164 storage avoids locale-dependent telephone comparisons. */
export function normalizePhoneAddress(value: string) {
  const phone = value
    .normalize('NFKC')
    .trim()
    .replace(/[\s().-]/g, '')
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error('Enter an international phone number.')
  return phone
}

/** Only declared answers are retained; client supplied extra keys never become data. */
export function normalizeFormAnswers(schema: FormSchemaSnapshot, values: Record<string, unknown>) {
  return Object.fromEntries(
    schema.fields
      .filter((field) => field.type !== 'hidden')
      .map((field) => {
        const value = values[field.key]
        if (field.type === 'email' && typeof value === 'string')
          return [field.key, normalizeEmailAddress(value)]
        if (field.type === 'phone' && typeof value === 'string')
          return [field.key, normalizePhoneAddress(value)]
        if (typeof value === 'string')
          return [field.key, value.normalize('NFKC').trim().slice(0, 10_000)]
        if (typeof value === 'boolean' || typeof value === 'number') return [field.key, value]
        return [field.key, null]
      }),
  )
}

export const opaqueDeliveryToken = () => randomBytes(32).toString('base64url')
export const deliveryIdempotencyKey = (messageId: string, recipientId: string) =>
  `email:${messageId}:${recipientId}`
export const automationIdempotencyKey = (definitionId: string, sourceEventId: string) =>
  `automation:${definitionId}:${sourceEventId}`
export function validateSubmission(schema: FormSchemaSnapshot, values: Record<string, unknown>) {
  const errors: Record<string, string> = {}
  for (const field of schema.fields) {
    const visible =
      !field.visibleWhen || values[field.visibleWhen.field] === field.visibleWhen.equals
    const value = values[field.key]
    if (
      visible &&
      field.required &&
      (value === undefined || value === null || value === '' || value === false)
    )
      errors[field.key] = 'Required.'
    if (
      visible &&
      value &&
      field.type === 'email' &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))
    )
      errors[field.key] = 'Enter a valid email address.'
  }
  return errors
}
export function validateFormSchema(schema: Pick<FormSchemaSnapshot, 'fields'>) {
  const errors: string[] = []
  const keys = new Set<string>()
  for (const field of schema.fields) {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(field.key)) errors.push(`Invalid field key: ${field.key}`)
    if (keys.has(field.key)) errors.push(`Duplicate field key: ${field.key}`)
    keys.add(field.key)
    if (!(SUPPORTED_FORM_FIELD_TYPES as readonly string[]).includes(field.type))
      errors.push(`Unsupported field type: ${field.type}`)
    if (!field.label.trim() && field.type !== 'hidden')
      errors.push(`Field ${field.key} needs a label.`)
    if (field.visibleWhen && !/^[a-z][a-z0-9_]{0,63}$/.test(field.visibleWhen.field))
      errors.push(`Invalid conditional field: ${field.key}`)
    if (field.type === 'hidden' && field.required)
      errors.push(`Hidden field ${field.key} cannot be required.`)
  }
  return errors
}
export function safeAutomationAction(action: string): boolean {
  return [
    'create-workflow',
    'assign-workflow',
    'notify',
    'add-segment-with-consent',
    'remove-segment',
    'create-draft',
    'create-calendar-entry',
    'pause',
    'escalate',
    'reviewed-webhook',
  ].includes(action)
}
export function isSuppressionEvent(event: string) {
  return ['unsubscribe', 'bounce', 'complaint'].includes(event)
}

export type EmailBlock =
  | { type: 'heading' | 'text'; text: string }
  | { type: 'image'; assetId: string; alt: string }
  | { type: 'button'; label: string; href: string; experimentTarget?: string }
  | { type: 'divider' }
  | {
      type: 'content-cards'
      cards: { title: string; text?: string; href: string; imageAssetId?: string }[]
    }
  | { type: 'columns'; columns: { blocks: EmailBlock[] }[] }

export function validateEmailBlocks(blocks: readonly EmailBlock[]) {
  const errors: string[] = []
  for (const block of blocks) {
    if (block.type === 'button' && !/^https?:\/\//.test(block.href))
      errors.push('Buttons require an absolute http(s) URL.')
    if (block.type === 'image' && (!block.assetId || !block.alt.trim()))
      errors.push('Images require a governed asset and alt text.')
    if (block.type === 'columns' && (block.columns.length < 2 || block.columns.length > 3))
      errors.push('Email columns support two or three compatible columns.')
  }
  return errors
}
export function assertReviewedLocalizedConsent(input: {
  locale: string
  sourceLocale?: string
  consentText?: string
  consentRevision?: string
  consentTranslationStatus?: string
}) {
  if (!input.consentText?.trim() || !input.consentRevision?.trim())
    throw new Error('A versioned consent wording is required.')
  if (
    input.locale !== (input.sourceLocale ?? 'en') &&
    input.consentTranslationStatus !== 'reviewed'
  ) {
    throw new Error(
      'Localized consent is outdated or not reviewed; machine-generated wording cannot be used.',
    )
  }
}
export function safeUploadMetadata(file: { filename: string; contentType: string; size: number }) {
  const normalized = file.filename.normalize('NFKC')
  if (
    normalized !== file.filename ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._ -]{0,180}$/.test(normalized) ||
    normalized.includes('..') ||
    /[\\/:\0]/.test(normalized)
  )
    throw new Error('Unsafe upload filename.')
  if (file.size <= 0 || file.size > 10 * 1024 * 1024)
    throw new Error('Upload exceeds the 10MB safety limit.')
  if (!['application/pdf', 'image/jpeg', 'image/png', 'text/plain'].includes(file.contentType))
    throw new Error('Unsupported upload type.')
  return { ...file, filename: normalized, scanStatus: 'pending' as const, private: true }
}
export function isDeliveryTerminal(status: string) {
  return ['sent', 'delivered', 'bounced', 'complained', 'cancelled'].includes(status)
}
export const signedAudienceToken = (value: string, secret: string) =>
  `${value}.${createHmac('sha256', secret).update(value).digest('base64url')}`
export function verifyAudienceToken(token: string, secret: string) {
  const divider = token.lastIndexOf('.')
  if (divider < 1) return null
  const value = token.slice(0, divider)
  const signature = token.slice(divider + 1)
  const expected = createHmac('sha256', secret).update(value).digest('base64url')
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
    return null
  return value
}

export type AudienceTokenClaims = {
  v: 1
  siteId: string
  subscriberId: string
  purpose: 'preferences' | 'unsubscribe' | 'confirmation'
  exp: number
  nonce: string
}

/** Expiring, purpose-bound token. The nonce is persisted hashed and can be revoked. */
export function signAudienceClaims(claims: AudienceTokenClaims, secret: string) {
  return signedAudienceToken(Buffer.from(JSON.stringify(claims)).toString('base64url'), secret)
}
export function verifyAudienceClaims(
  token: string,
  secret: string,
  purpose: AudienceTokenClaims['purpose'],
) {
  const value = verifyAudienceToken(token, secret)
  if (!value) return null
  try {
    const claims = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as AudienceTokenClaims
    if (
      claims.v !== 1 ||
      claims.purpose !== purpose ||
      !claims.siteId ||
      !claims.subscriberId ||
      !claims.nonce ||
      !Number.isSafeInteger(claims.exp) ||
      claims.exp <= Math.floor(Date.now() / 1000)
    )
      return null
    return claims
  } catch {
    return null
  }
}


/** Provider signatures cover the exact raw body, before JSON parsing. */
export const signEmailWebhook = (raw: string, secret: string) =>
  createHmac('sha256', secret).update(raw).digest('base64url')

export function verifyEmailWebhookSignature(raw: string, signature: string, secret?: string) {
  if (!secret) return false
  const expected = signEmailWebhook(raw, secret)
  return (
    signature.length === expected.length &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
}
export const testDeliveryIdempotencyKey = (messageId: string, recipientEmail: string) =>
  `email:test:${messageId}:${audienceDigest(recipientEmail.trim().toLowerCase())}`
export function isMarketingMessage(kind: string) {
  return kind === 'bulk' || kind === 'digest' || kind === 'marketing'
}
