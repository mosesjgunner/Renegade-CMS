import { describe, expect, it, vi } from 'vitest'
import { evaluateSegmentRecipients } from '../../src/modules/audience/service'

// RC3-02 / DEBT-15: matched exclusion buckets must be mutually exclusive
// and exhaustive with suppression taking reporting precedence. Before the
// fix, the evaluation counted `!isActive` first, so a suppressed
// subscriber whose subscription was also inactive (pending, unsubscribed,
// erased, status 'suppressed') was filed under unconsentedOrPending and
// never reached the suppressed bucket — the operator readback hid the
// suppression. The send policy itself was always correct; these tests pin
// the reporting and prove the deliverable set is byte-identical to the
// pre-change policy result.

type Sub = {
  id: string
  site: string
  contact?: string
  email: string
  emailHash: string
  status: string
  globalUnsubscribedAt?: string
  erasedAt?: string
}

// Every alpha subscriber shares one contact carrying the 'supporter' tag,
// so the tag segment matches all of them regardless of status.
const SUBSCRIBERS: Sub[] = [
  {
    id: 'active-clean',
    site: 'alpha',
    contact: 'contact',
    email: 'a@example.test',
    emailHash: 'a',
    status: 'active',
  },
  // Duplicate of active-clean after normalization (case differs).
  {
    id: 'active-duplicate',
    site: 'alpha',
    contact: 'contact',
    email: 'A@Example.Test',
    emailHash: 'a2',
    status: 'active',
  },
  {
    id: 'pending',
    site: 'alpha',
    contact: 'contact',
    email: 'p@example.test',
    emailHash: 'p',
    status: 'pending',
  },
  {
    id: 'unsubscribed',
    site: 'alpha',
    contact: 'contact',
    email: 'u@example.test',
    emailHash: 'u',
    status: 'unsubscribed',
  },
  {
    id: 'global-unsub',
    site: 'alpha',
    contact: 'contact',
    email: 'g@example.test',
    emailHash: 'g',
    status: 'active',
    globalUnsubscribedAt: '2026-10-01T00:00:00.000Z',
  },
  {
    id: 'active-suppressed',
    site: 'alpha',
    contact: 'contact',
    email: 's@example.test',
    emailHash: 's',
    status: 'active',
  },
  // Bounced: the address sits on the suppression list (reason 'bounce')
  // and the subscription itself has lapsed to unsubscribed.
  {
    id: 'bounced',
    site: 'alpha',
    contact: 'contact',
    email: 'b@example.test',
    emailHash: 'b',
    status: 'unsubscribed',
  },
  {
    id: 'pending-suppressed',
    site: 'alpha',
    contact: 'contact',
    email: 'ps@example.test',
    emailHash: 'ps',
    status: 'pending',
  },
  {
    id: 'suppressed-status',
    site: 'alpha',
    contact: 'contact',
    email: 'ss@example.test',
    emailHash: 'ss',
    status: 'suppressed',
  },
  // Another site's subscriber: the site-scoped query never returns it, so
  // it must contribute to no count at all.
  {
    id: 'other-site',
    site: 'beta',
    contact: 'contact',
    email: 'z@example.test',
    emailHash: 'z',
    status: 'active',
  },
]

const SUPPRESSIONS = [
  { emailHash: 's', site: 'alpha' },
  { emailHash: 'b', site: 'alpha' },
  { emailHash: 'ps', site: 'alpha' },
  { emailHash: 'ss', site: 'alpha' },
  // A suppression recorded against the other site must not leak in.
  { emailHash: 'a', site: 'beta' },
]

function makeStore(subscribers: Sub[], suppressions: typeof SUPPRESSIONS) {
  const calls: string[] = []
  const find = vi.fn(async (input: any) => {
    calls.push(input.collection)
    if (input.collection === 'subscribers') {
      const site = input.where?.site?.equals
      return { docs: site ? subscribers.filter((s) => s.site === site) : subscribers }
    }
    if (input.collection === 'suppressions') {
      const site = input.where?.site?.equals
      return { docs: site ? suppressions.filter((s) => s.site === site) : suppressions }
    }
    if (input.collection === 'contact-taggings')
      return { docs: [{ contact: 'contact', tag: 'supporter' }] }
    return { docs: [] }
  })
  const store = {
    find,
    findByID: async () => ({
      site: 'alpha',
      definition: { predicate: { field: 'tag', op: 'is', value: 'supporter' } },
    }),
  }
  return { store, calls }
}

// The pre-change send policy, restated independently of the service:
// a matched subscriber is deliverable exactly when active (status
// 'active', no global unsubscribe, not erased), not suppressed, and the
// first occurrence of their normalized email.
function expectedDeliverables(subscribers: Sub[], suppressedHashes: Set<string>) {
  const seen = new Set<string>()
  const out: Array<{ subscriberId: string; email: string }> = []
  for (const sub of subscribers) {
    if (sub.site !== 'alpha') continue
    const isActive = sub.status === 'active' && !sub.globalUnsubscribedAt && !sub.erasedAt
    if (!isActive || suppressedHashes.has(sub.emailHash)) continue
    const email = sub.email.trim().toLowerCase()
    if (seen.has(email)) continue
    seen.add(email)
    out.push({ subscriberId: sub.id, email })
  }
  return out
}

describe('RC3-02 DEBT-15 exclusion accounting', () => {
  it('counts suppression before consent state, reconciles, and keeps the deliverable set identical', async () => {
    const { store, calls } = makeStore(SUBSCRIBERS, SUPPRESSIONS)
    const result = await evaluateSegmentRecipients(store, {
      siteId: 'alpha',
      segmentId: 'segment',
    })

    // Only the owning site's subscribers are in scope at all.
    expect(result.counts.totalSubscribers).toBe(9)
    expect(result.counts.matchedSubscribers).toBe(9)

    // Suppression precedence: all four suppressed subscribers land in the
    // suppressed bucket, including the three whose subscriptions are also
    // inactive (old code reported suppressed = 1, unconsentedOrPending = 6).
    expect(result.counts.suppressed).toBe(4)
    expect(result.counts.unconsentedOrPending).toBe(3)
    expect(result.counts.duplicates).toBe(1)
    expect(result.counts.eligibleConsented).toBe(1)

    // Buckets are mutually exclusive and exhaustive over the matched set.
    const { matchedSubscribers, eligibleConsented, unconsentedOrPending, suppressed, duplicates } =
      result.counts
    expect(eligibleConsented + unconsentedOrPending + suppressed + duplicates).toBe(
      matchedSubscribers,
    )

    // Send policy unchanged: the deliverable set is exactly the
    // independently computed pre-change policy result.
    const suppressedHashes = new Set(
      SUPPRESSIONS.filter((s) => s.site === 'alpha').map((s) => s.emailHash),
    )
    expect(result.eligibleRecipients).toEqual(expectedDeliverables(SUBSCRIBERS, suppressedHashes))
    expect(result.eligibleRecipients).toEqual([
      { subscriberId: 'active-clean', email: 'a@example.test' },
    ])

    // The suppression list is still loaded with one batched query
    // (RC2-DEBT-13), never one lookup per subscriber.
    expect(calls.filter((c) => c === 'suppressions')).toHaveLength(1)
  })

  it('deliverable set is the pre-change policy result (send-policy invariant)', async () => {
    // This test asserts ONLY quantities the counting fix must not move:
    // the deliverable set, its size, the duplicate count, and the matched
    // total. It passes on the old counting and on the new counting; the
    // two tests around it pin the bucket split that did change.
    const { store } = makeStore(SUBSCRIBERS, SUPPRESSIONS)
    const result = await evaluateSegmentRecipients(store, {
      siteId: 'alpha',
      segmentId: 'segment',
    })
    const suppressedHashes = new Set(
      SUPPRESSIONS.filter((s) => s.site === 'alpha').map((s) => s.emailHash),
    )
    expect(result.eligibleRecipients).toEqual(expectedDeliverables(SUBSCRIBERS, suppressedHashes))
    expect(result.counts.eligibleConsented).toBe(1)
    expect(result.counts.duplicates).toBe(1)
    expect(result.counts.matchedSubscribers).toBe(9)
    expect(result.counts.totalSubscribers).toBe(9)
    // The snapshot's notEligible roll-up (unconsentedOrPending +
    // suppressed) is likewise invariant under the precedence change.
    expect(result.counts.unconsentedOrPending + result.counts.suppressed).toBe(7)
  })

  it('keeps an inactive-only audience empty with no suppression miscount', async () => {
    const subs: Sub[] = [
      {
        id: 'p1',
        site: 'alpha',
        contact: 'contact',
        email: 'p1@example.test',
        emailHash: 'p1',
        status: 'pending',
      },
      {
        id: 'b1',
        site: 'alpha',
        contact: 'contact',
        email: 'b1@example.test',
        emailHash: 'b1',
        status: 'unsubscribed',
      },
    ]
    const { store } = makeStore(subs, [{ emailHash: 'b1', site: 'alpha' }])
    const result = await evaluateSegmentRecipients(store, {
      siteId: 'alpha',
      segmentId: 'segment',
    })
    expect(result.counts).toMatchObject({
      totalSubscribers: 2,
      matchedSubscribers: 2,
      suppressed: 1,
      unconsentedOrPending: 1,
      duplicates: 0,
      eligibleConsented: 0,
      isEmpty: true,
    })
    expect(result.eligibleRecipients).toEqual([])
  })

  it('preserves the batched suppression query and reconciles at 25k scale', async () => {
    const subs: Sub[] = Array.from({ length: 25_000 }, (_, i) => ({
      id: `scale-${i}`,
      site: 'alpha',
      email: `scale-${i}@example.test`,
      emailHash: `scale-hash-${i}`,
      status: 'active',
    }))
    // Every 250th subscriber is suppressed (100 total).
    const suppressions = Array.from({ length: 100 }, (_, i) => ({
      emailHash: `scale-hash-${i * 250}`,
      site: 'alpha',
    }))
    const calls: string[] = []
    const find = vi.fn(async (input: any) => {
      calls.push(input.collection)
      if (input.collection === 'subscribers') return { docs: subs }
      if (input.collection === 'suppressions') return { docs: suppressions }
      return { docs: [] }
    })
    const store = {
      find,
      findByID: async () => ({
        site: 'alpha',
        definition: { predicate: { field: 'consentPurpose', op: 'is', value: 'newsletter' } },
      }),
    }
    const t0 = performance.now()
    const result = await evaluateSegmentRecipients(store, {
      siteId: 'alpha',
      segmentId: 'segment',
    })
    const ms = performance.now() - t0
    console.log(`RC3-02 scale sample: 25,000 subscribers evaluated in ${ms.toFixed(1)}ms`)
    expect(result.counts.matchedSubscribers).toBe(25_000)
    expect(result.counts.suppressed).toBe(100)
    expect(result.counts.eligibleConsented).toBe(24_900)
    expect(
      result.counts.eligibleConsented +
        result.counts.unconsentedOrPending +
        result.counts.suppressed +
        result.counts.duplicates,
    ).toBe(result.counts.matchedSubscribers)
    expect(calls.filter((c) => c === 'suppressions')).toHaveLength(1)
    expect(result.eligibleRecipients).toHaveLength(24_900)
  }, 30_000)
})
