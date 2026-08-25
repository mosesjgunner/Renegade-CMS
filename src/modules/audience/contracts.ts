import { createHash, randomBytes } from 'node:crypto'

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
export type FormSchemaSnapshot = {
  version: number
  locale: string
  fields: readonly FormField[]
  consentText?: string
}
export const audienceDigest = (value: string) =>
  createHash('sha256').update(value).digest('base64url')
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
    if (visible && field.required && (value === undefined || value === null || value === ''))
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
