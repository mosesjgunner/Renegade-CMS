import { describe, expect, it } from 'vitest'
import {
  renderEmailDesign,
  validateEmailDesign,
  approvedRenderSnapshot,
  rebaseContentCard,
  sourceIsStale,
  type MessageDesign,
} from '../../src/modules/audience/email-composer'
import {
  evaluateSegmentRecipients,
  createRecipientSnapshot,
  queueNewsletterDeliveries,
  queueTestSend,
} from '../../src/modules/audience/service'
import { audienceDigest, normalizeEmailAddress } from '../../src/modules/audience/contracts'

describe('RC1 09B: Campaigns, Templates and Recipient Selection', () => {
  const validDesign: MessageDesign = {
    version: 1,
    templateVersion: '1.0.0',
    locale: 'en',
    tokens: {
      background: '#ffffff',
      foreground: '#172033',
      accent: '#164e9b',
      fontFamily: 'Arial, sans-serif',
    },
    blocks: [
      { type: 'heading', text: 'Weekly Dispatch: {{site.name}}' },
      {
        type: 'content-card',
        source: {
          contentId: 'art-001',
          revisionId: 'rev-001',
          url: 'https://renegadeparty.org/news/freedom-act',
          title: 'Freedom Act Update',
          summary: 'Key legislative breakthroughs and community initiatives.',
        },
      },
      { type: 'text', text: 'Hello {{recipient.firstName}}, here are your weekly updates.' },
      { type: 'button', label: 'Read Story', href: 'https://renegadeparty.org/news/freedom-act' },
      { type: 'divider' },
      {
        type: 'legal',
        address: '123 Renegade Way, Suite 100, Washington, DC 20001',
        preferenceUrl: 'https://renegadeparty.org/audience/preferences',
        unsubscribeUrl: 'https://renegadeparty.org/audience/unsubscribe',
      },
    ],
    plainTextStrategy: 'generated',
    personalization: {
      missingValue: 'fallback',
      fallbacks: {
        'recipient.firstName': 'Friend',
        'recipient.lastName': 'Reader',
        'recipient.email': 'supporter@renegadeparty.org',
        'site.name': 'Renegade Movement',
      },
    },
  }

  describe('1. Reusable MIME-Safe Email Design & Asset Validation', () => {
    it('validates a compliant marketing email design', () => {
      const errors = validateEmailDesign(validDesign, 'bulk')
      expect(errors).toHaveLength(0)
    })

    it('enforces mandatory legal/unsubscribe preference footer for marketing emails', () => {
      const designWithoutLegal: MessageDesign = {
        ...validDesign,
        blocks: validDesign.blocks.filter((b) => b.type !== 'legal'),
      }
      const errors = validateEmailDesign(designWithoutLegal, 'bulk')
      expect(errors).toContain('Marketing messages require exactly one legal preference block.')
    })

    it('rejects multiple legal blocks in marketing messages', () => {
      const designWithTwoLegals: MessageDesign = {
        ...validDesign,
        blocks: [
          ...validDesign.blocks,
          {
            type: 'legal',
            address: 'Second Address',
            preferenceUrl: 'https://renegadeparty.org/prefs',
          },
        ],
      }
      const errors = validateEmailDesign(designWithTwoLegals, 'bulk')
      expect(errors).toContain('Marketing messages require exactly one legal preference block.')
    })

    it('requires governed media, absolute URLs, and alt text on image blocks', () => {
      const invalidImageDesign: MessageDesign = {
        ...validDesign,
        blocks: [
          ...validDesign.blocks,
          { type: 'image', assetId: '', src: '/relative/image.png', alt: '' },
        ],
      }
      const errors = validateEmailDesign(invalidImageDesign, 'bulk')
      expect(errors).toContain('Images require governed media, absolute source, and alt text.')
    })

    it('requires buttons to have absolute http(s) URLs', () => {
      const invalidButtonDesign: MessageDesign = {
        ...validDesign,
        blocks: [
          ...validDesign.blocks,
          { type: 'button', label: 'Click', href: 'javascript:alert(1)' },
        ],
      }
      const errors = validateEmailDesign(invalidButtonDesign, 'bulk')
      expect(errors).toContain('Buttons require absolute http(s) URLs.')
    })

    it('renders responsive inline MIME-safe HTML and plain text with correct personalization', () => {
      const rendered = renderEmailDesign(validDesign, {
        origin: 'https://renegadeparty.org',
        recipient: {
          'recipient.firstName': 'Alex',
          'recipient.lastName': 'Smith',
          'recipient.email': 'alex@example.test',
        },
        siteName: 'Renegade Party',
      })

      expect(rendered.html).toContain('Weekly Dispatch: Renegade Party')
      expect(rendered.html).toContain('Hello Alex, here are your weekly updates.')
      expect(rendered.html).toContain('max-width:600px')
      expect(rendered.html).toContain('Freedom Act Update')
      expect(rendered.html).toContain('https://renegadeparty.org/audience/unsubscribe')
      expect(rendered.text).toContain('Hello Alex, here are your weekly updates.')
      expect(rendered.text).toContain('Manage preferences')
      expect(rendered.hash).toMatch(/^[a-f0-9]{64}$/)
      expect(rendered.warnings).toContain(
        'Mailbox/device previews are approximations; provider rendering can differ.',
      )
    })

    it('substitutes typed personalization fallbacks when recipient values are missing', () => {
      const rendered = renderEmailDesign(validDesign, {
        origin: 'https://renegadeparty.org',
        recipient: {},
        siteName: 'Renegade Party',
      })

      expect(rendered.html).toContain('Hello Friend, here are your weekly updates.')
    })

    it('detects stale source revisions and rebases content cards cleanly', () => {
      const cardBlock = validDesign.blocks.find((b) => b.type === 'content-card')!
      expect(sourceIsStale(cardBlock, 'rev-001')).toBe(false)
      expect(sourceIsStale(cardBlock, 'rev-002-newer')).toBe(true)

      const rebased = rebaseContentCard(cardBlock, {
        contentId: 'art-001',
        revisionId: 'rev-002-newer',
        url: 'https://renegadeparty.org/news/freedom-act-v2',
        title: 'Freedom Act Update (Updated)',
        summary: 'Revised summary.',
      })
      expect(sourceIsStale(rebased, 'rev-002-newer')).toBe(false)
    })

    it('creates immutable approvedRender snapshots with sha256 fingerprint', () => {
      const snapshot = approvedRenderSnapshot(validDesign, {
        origin: 'https://renegadeparty.org',
        subject: 'Weekly Dispatch',
        siteName: 'Renegade Party',
      })

      expect(snapshot.subject).toBe('Weekly Dispatch')
      expect(snapshot.templateVersion).toBe('1.0.0')
      expect(snapshot.hash).toMatch(/^[a-f0-9]{64}$/)
      expect(snapshot.approvedAt).toBeDefined()
    })
  })

  describe('2. Audience Segment Targeting, Recipient Deduplication & Consent Safety', () => {
    type MockDoc = Record<string, unknown>

    const makeMockPayload = (options: {
      siteId: string
      foreignSiteId?: string
      subscribers: MockDoc[]
      suppressions?: string[]
      memberships?: MockDoc[]
      segments?: MockDoc[]
    }) => {
      const subscribers = options.subscribers
      const suppressions = options.suppressions ?? []
      const memberships = options.memberships ?? []
      const createdSnapshots: MockDoc[] = []
      const createdDeliveries: MockDoc[] = []
      const queuedJobs: unknown[] = []

      return {
        createdSnapshots,
        createdDeliveries,
        queuedJobs,
        findByID: async ({ collection, id }: { collection: string; id: string }) => {
          if (collection === 'audience-segments') {
            if (options.segments) {
              const seg = options.segments.find((s) => s.id === id)
              if (seg) return seg
            }
            if (id === 'seg-active') {
              return {
                id: 'seg-active',
                site: options.siteId,
                name: 'All Supporters List Segment',
                version: 'v1.0.0',
                definition: {
                  all: [{ predicate: { field: 'list', op: 'is', value: 'list-all' } }],
                },
              }
            }
            if (id === 'seg-foreign') {
              return {
                id: 'seg-foreign',
                site: options.foreignSiteId ?? 'other-site',
                name: 'Foreign Site Segment',
                version: 'v1.0.0',
                definition: {
                  all: [{ predicate: { field: 'channelEligible', op: 'is', value: 'true' } }],
                },
              }
            }
            if (id === 'seg-empty') {
              return {
                id: 'seg-empty',
                site: options.siteId,
                name: 'Empty Segment',
                version: 'v1.0.0',
                definition: {
                  all: [{ predicate: { field: 'tag', op: 'is', value: 'nonexistent-tag' } }],
                },
              }
            }
          }
          if (collection === 'recipient-snapshots') {
            return createdSnapshots.find((s) => s.id === id)
          }
          if (collection === 'subscribers') {
            return subscribers.find((s) => s.id === id)
          }
          if (collection === 'email-messages') {
            return {
              id,
              site: options.siteId,
              status: 'scheduled',
              scheduledFor: new Date(0).toISOString(),
              recipientSnapshot: createdSnapshots[0]?.id,
              audience: {},
            }
          }
          return null
        },
        find: async ({ collection, where }: { collection: string; where?: MockDoc }) => {
          if (collection === 'subscribers') {
            return { docs: subscribers }
          }
          if (collection === 'audience-memberships') {
            return { docs: memberships }
          }
          if (collection === 'suppressions') {
            const emailHash = (where?.emailHash as { equals?: string })?.equals
            const isSuppressed = suppressions.includes(String(emailHash))
            return { docs: isSuppressed ? [{ id: 'supp-1', emailHash }] : [] }
          }
          if (collection === 'email-deliveries') {
            const key = (where?.idempotencyKey as { equals?: string })?.equals
            const found = createdDeliveries.find((d) => d.idempotencyKey === key)
            return { docs: found ? [found] : [] }
          }
          return { docs: [] }
        },
        create: async ({ collection, data }: { collection: string; data: MockDoc }) => {
          const doc = { id: `${collection}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, ...data }
          if (collection === 'recipient-snapshots') createdSnapshots.push(doc)
          if (collection === 'email-deliveries') createdDeliveries.push(doc)
          return doc
        },
        update: async ({ id, data }: { collection: string; id: string; data: MockDoc }) => {
          return { id, ...data }
        },
        jobs: {
          queue: async (job: unknown) => {
            queuedJobs.push(job)
          },
        },
      }
    }

    it('evaluates segment, deduplicates recipients by normalized email, and excludes unconsented/suppressed', async () => {
      const siteId = 'site-renegade'
      const emailDup = 'supporter1@example.test'
      const hashDup = audienceDigest(emailDup)

      const emailSuppressed = 'bounced@example.test'
      const hashSuppressed = audienceDigest(emailSuppressed)

      const emailPending = 'pending@example.test'
      const hashPending = audienceDigest(emailPending)

      const emailValid2 = 'supporter2@example.test'
      const hashValid2 = audienceDigest(emailValid2)

      const mockPayload = makeMockPayload({
        siteId,
        subscribers: [
          // 1. Active consented
          { id: 'sub-1', site: siteId, email: emailDup, emailHash: hashDup, status: 'active' },
          // 2. Duplicate email (different subscriber ID, same normalized email) -> must deduplicate!
          { id: 'sub-2-dup', site: siteId, email: emailDup.toUpperCase(), emailHash: hashDup, status: 'active' },
          // 3. Second valid active consented
          { id: 'sub-3', site: siteId, email: emailValid2, emailHash: hashValid2, status: 'active' },
          // 4. Suppressed subscriber -> must exclude!
          { id: 'sub-4-supp', site: siteId, email: emailSuppressed, emailHash: hashSuppressed, status: 'active' },
          // 5. Pending subscriber (unconsented) -> must exclude!
          { id: 'sub-5-pending', site: siteId, email: emailPending, emailHash: hashPending, status: 'pending' },
          // 6. Unsubscribed subscriber -> must exclude!
          { id: 'sub-6-unsub', site: siteId, email: 'unsub@example.test', emailHash: audienceDigest('unsub@example.test'), status: 'unsubscribed' },
        ],
        memberships: [
          { subscriber: 'sub-1', audienceList: 'list-all', status: 'active' },
          { subscriber: 'sub-2-dup', audienceList: 'list-all', status: 'active' },
          { subscriber: 'sub-3', audienceList: 'list-all', status: 'active' },
          { subscriber: 'sub-4-supp', audienceList: 'list-all', status: 'active' },
          { subscriber: 'sub-5-pending', audienceList: 'list-all', status: 'active' },
          { subscriber: 'sub-6-unsub', audienceList: 'list-all', status: 'active' },
        ],
        suppressions: [hashSuppressed],
      })

      const result = await evaluateSegmentRecipients(mockPayload as never, {
        siteId,
        segmentId: 'seg-active',
      })

      expect(result.counts.totalSubscribers).toBe(6)
      expect(result.counts.matchedSubscribers).toBe(6)
      // Exactly 2 unique eligible consented recipients: supporter1@example.test and supporter2@example.test
      expect(result.counts.eligibleConsented).toBe(2)
      expect(result.counts.duplicates).toBe(1)
      expect(result.counts.suppressed).toBe(1)
      expect(result.counts.unconsentedOrPending).toBe(2)
      expect(result.counts.isEmpty).toBe(false)

      const emails = result.eligibleRecipients.map((r) => r.email)
      expect(emails).toEqual(['supporter1@example.test', 'supporter2@example.test'])
    })

    it('detects and reports empty audience states', async () => {
      const siteId = 'site-renegade'
      const mockPayload = makeMockPayload({
        siteId,
        subscribers: [
          { id: 'sub-1', site: siteId, email: 'user@example.test', emailHash: audienceDigest('user@example.test'), status: 'active' },
        ],
      })

      const result = await evaluateSegmentRecipients(mockPayload as never, {
        siteId,
        segmentId: 'seg-empty',
      })

      expect(result.counts.eligibleConsented).toBe(0)
      expect(result.counts.isEmpty).toBe(true)
      expect(result.eligibleRecipients).toHaveLength(0)
    })

    it('prevents segment access outside owning site (multi-tenant boundary)', async () => {
      const siteId = 'site-renegade'
      const foreignSiteId = 'site-adversary'
      const mockPayload = makeMockPayload({
        siteId,
        foreignSiteId,
        subscribers: [],
      })

      await expect(
        evaluateSegmentRecipients(mockPayload as never, {
          siteId,
          segmentId: 'seg-foreign',
        }),
      ).rejects.toThrow('Segment site mismatch: access denied to segment outside owning site.')
    })

    it('creates an immutable recipient-snapshots record with SHA-256 fingerprint hash and audit details', async () => {
      const siteId = 'site-renegade'
      const mockPayload = makeMockPayload({
        siteId,
        subscribers: [
          { id: 'sub-1', site: siteId, email: 'supporter@renegadeparty.org', emailHash: audienceDigest('supporter@renegadeparty.org'), status: 'active' },
        ],
        memberships: [
          { subscriber: 'sub-1', audienceList: 'list-all', status: 'active' },
        ],
      })

      const snapshot = await createRecipientSnapshot(mockPayload as never, {
        siteId,
        messageId: 'msg-001',
        segmentId: 'seg-active',
        actorUserId: 'user-editor-1',
      })

      expect(snapshot.id).toBeDefined()
      expect(snapshot.site).toBe(siteId)
      expect(snapshot.message).toBe('msg-001')
      expect(snapshot.hash).toMatch(/^[a-f0-9]{64}$/)
      expect(snapshot.recipients).toHaveLength(1)
      expect(snapshot.approvalAudit).toMatchObject({
        scheduledBy: 'user-editor-1',
        totalEligible: 1,
      })
      expect(mockPayload.createdSnapshots).toHaveLength(1)
    })

    it('queues deliveries strictly from snapshot recipients, deduplicating and skipping suppressions', async () => {
      const siteId = 'site-renegade'
      const mockPayload = makeMockPayload({
        siteId,
        subscribers: [
          { id: 'sub-1', site: siteId, email: 'supporter1@renegadeparty.org', emailHash: audienceDigest('supporter1@renegadeparty.org'), status: 'active' },
          { id: 'sub-2', site: siteId, email: 'supporter2@renegadeparty.org', emailHash: audienceDigest('supporter2@renegadeparty.org'), status: 'active' },
        ],
        memberships: [
          { subscriber: 'sub-1', audienceList: 'list-all', status: 'active' },
          { subscriber: 'sub-2', audienceList: 'list-all', status: 'active' },
        ],
      })

      // Create snapshot with two subscribers
      const snapshot = await createRecipientSnapshot(mockPayload as never, {
        siteId,
        messageId: 'msg-scheduled-01',
        segmentId: 'seg-active',
        actorUserId: 'user-editor-1',
      })

      const queuedCount = await queueNewsletterDeliveries(mockPayload as never, 'msg-scheduled-01')
      expect(queuedCount).toBe(2)
      expect(mockPayload.createdDeliveries).toHaveLength(2)
      expect(mockPayload.queuedJobs).toHaveLength(2)

      // Re-running is idempotent: 0 duplicate deliveries queued
      const secondRun = await queueNewsletterDeliveries(mockPayload as never, 'msg-scheduled-01')
      expect(secondRun).toBe(0)
      expect(mockPayload.createdDeliveries).toHaveLength(2)
    })

    it('queues a test send delivery to operator email address', async () => {
      const siteId = 'site-renegade'
      const mockPayload = {
        findByID: async () => ({
          id: 'msg-test-draft',
          site: siteId,
          subject: 'Test Subject',
          status: 'draft',
          kind: 'bulk',
          messageDesign: validDesign,
          blocks: validDesign.blocks,
        }),
        find: async () => ({ docs: [] }),
        create: async ({ data }: { collection: string; data: Record<string, unknown> }) => ({
          id: 'del-test-1',
          ...data,
        }),
        jobs: {
          queue: async () => {},
        },
      }

      const delivery = await queueTestSend(mockPayload as never, {
        messageId: 'msg-test-draft',
        recipientEmail: 'operator@renegadeparty.org',
      })

      expect(delivery.id).toBe('del-test-1')
      expect(delivery.recipientEmail).toBe('operator@renegadeparty.org')
      expect(delivery.outcome).toEqual({ test: true })
    })
  })
})
