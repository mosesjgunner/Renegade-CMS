import { describe, expect, it, vi } from 'vitest'
import { normalizeFormAnswers, validateSubmission } from '../../src/modules/audience/contracts'
import { validateIntakeActions } from '../../src/modules/audience/form-runtime'
import { relationshipNotificationKey } from '../../src/modules/community/event-notification-preferences'
import { getMemberNotificationPreference } from '../../src/modules/community/notification-delivery'
import { hasTelecomConsent } from '../../src/modules/telecom/service'
import { createTwilioTelecomAdapter } from '../../src/modules/telecom/real-provider'
import { PrintfulPodAdapter } from '../../src/modules/commerce/pod-real-provider'
import { publicTimelineEntries } from '../../src/modules/events/timeline'

describe('RC08B safety boundaries', () => {
  it('rejects arbitrary options, impossible dates, invalid numbers and oversized text; discards conditionally hidden answers', () => {
    const schema = {
      version: 1,
      locale: 'en',
      fields: [
        { key: 'choice', label: 'Choice', type: 'select', validation: { options: ['yes'] } },
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'number', label: 'Number', type: 'number', validation: { min: 1, max: 5 } },
        { key: 'text', label: 'Text', type: 'text' },
        {
          key: 'conditional',
          label: 'Conditional',
          type: 'text',
          visibleWhen: { field: 'choice', equals: 'yes' },
        },
      ],
    }
    expect(
      Object.keys(
        validateSubmission(schema, {
          choice: 'invented',
          date: '2026-02-30',
          number: 'NaN',
          text: 'x'.repeat(10001),
        }),
      ),
    ).toEqual(['choice', 'date', 'number', 'text'])
    expect(
      normalizeFormAnswers(schema, {
        choice: 'no',
        conditional: 'private hidden answer',
        undeclared: 'discard',
      }),
    ).not.toHaveProperty('conditional')
    expect(
      validateIntakeActions([{ type: 'reviewed-webhook', url: 'https://example.test' }]),
    ).not.toBe(true)
  })
  it('maps follow, mention and message switches and defaults external channels to off without versioned opt-in', async () => {
    expect(relationshipNotificationKey('relationship.follow')).toBe('follows')
    expect(relationshipNotificationKey('comment.created', 'mention')).toBe('mentions')
    expect(relationshipNotificationKey('conversation.message_created')).toBe('messages')
    const payload = {
      db: { pool: { query: async () => ({ rows: [{ frequency: 'immediate', rules: {} }] }) } },
    } as never
    expect(await getMemberNotificationPreference(payload, 'site', 'member', 'email')).toBe('off')
    expect(await getMemberNotificationPreference(payload, 'site', 'member', 'in_app')).toBe(
      'immediate',
    )
  })
  it('never borrows another subscriber consent when the recipient subject is missing', async () => {
    const find = vi.fn()
    expect(
      await hasTelecomConsent(
        { find },
        { siteId: 'site', phoneHash: 'hash', purpose: 'marketing' },
      ),
    ).toBe(false)
    expect(find).not.toHaveBeenCalled()
  })
  it('does not call configured credentials verified sender or RCS readiness', async () => {
    const adapter = createTwilioTelecomAdapter({
      accountSid: 'ACexample',
      authToken: 'private-secret',
      fromNumber: '+18005550100',
    })
    expect(await adapter.senderReadiness()).toMatchObject({
      status: 'degraded',
      registrationStatus: 'pending',
    })
    expect(adapter.contract.rcs?.capabilityLookup).toBe(false)
    expect(adapter.contract.supportsDeliveryReceipts).toBe(false)
    expect(adapter.contract.supportsReconciliation).toBe(false)
  })
  it('never manufactures Printful templates, files, mockups or prices', async () => {
    const adapter = new PrintfulPodAdapter({
      apiKey: 'test-placeholder-credential',
      fetchFn: vi.fn(),
    })
    expect(await adapter.getTemplates('variant')).toEqual([])
    expect(adapter.capabilities.supportsLivePreflight).toBe(false)
    await expect(
      adapter.uploadPrintFile({
        filename: 'art.png',
        mimeType: 'image/png',
        content: Buffer.from('art'),
        hash: 'hash',
      }),
    ).rejects.toThrow('unavailable')
    await expect(adapter.preflight({} as never)).rejects.toThrow('unavailable')
    await expect(adapter.estimateCost({} as never)).rejects.toThrow('unavailable')
  })
  it('rechecks same-site timeline event visibility and handles deleted references', async () => {
    const timeline = { id: 'timeline', site: 'site', status: 'published', visibility: 'public' }
    const payload = {
      find: async () => ({ docs: [{ id: 'membership', event: 'deleted' }], hasNextPage: false }),
      findByID: async () => null,
    } as never
    expect(await publicTimelineEntries(payload, timeline, 'site')).toEqual([])
    expect(await publicTimelineEntries(payload, timeline, 'foreign')).toEqual([])
  })
})
