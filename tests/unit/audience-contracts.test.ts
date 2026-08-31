import { describe, expect, it } from 'vitest'
import {
  automationIdempotencyKey,
  deliveryIdempotencyKey,
  isSuppressionEvent,
  safeAutomationAction,
  validateFormSchema,
  validateSubmission,
} from '../../src/modules/audience/contracts'

describe('audience contracts', () => {
  it('retains schema validation and consent-safe automation boundaries', () => {
    expect(
      validateSubmission(
        {
          version: 1,
          locale: 'en',
          fields: [{ key: 'email', type: 'email', label: 'Email', required: true }],
        },
        { email: 'bad' },
      ),
    ).toEqual({ email: 'Enter a valid email address.' })
    expect(safeAutomationAction('create-workflow')).toBe(true)
    expect(safeAutomationAction('send-bulk-email')).toBe(false)
  })
  it('uses stable delivery and automation idempotency keys', () => {
    expect(deliveryIdempotencyKey('message-1', 'subscriber-1')).toBe(
      deliveryIdempotencyKey('message-1', 'subscriber-1'),
    )
    expect(automationIdempotencyKey('rule-1', 'event-1')).toBe('automation:rule-1:event-1')
    expect(isSuppressionEvent('complaint')).toBe(true)
  })
  it('admits only renderable form controls and treats a required checkbox as consent', () => {
    expect(
      validateFormSchema({
        fields: [
          { key: 'email', type: 'email', label: 'Email', required: true },
          { key: 'marketing_consent', type: 'checkbox', label: 'Consent', required: true },
        ],
      }),
    ).toEqual([])
    expect(validateFormSchema({ fields: [{ key: 'file', type: 'file', label: 'File' }] })).toEqual([
      'Unsupported field type: file',
    ])
    expect(
      validateSubmission(
        {
          version: 1,
          locale: 'en',
          fields: [{ key: 'consent', type: 'checkbox', label: 'Consent', required: true }],
        },
        { consent: false },
      ),
    ).toEqual({ consent: 'Required.' })
  })
})
