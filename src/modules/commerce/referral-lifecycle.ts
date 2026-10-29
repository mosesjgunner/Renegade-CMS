/* eslint-disable @typescript-eslint/no-explicit-any -- canonical SQL tables are not Payload collections */
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { evaluateReferralAttribution, validateReferralProgram } from './referral-service'
import { assertMoney, type ReferralProgram } from './affiliate-referral-contracts'

const id = (value: any) => String(value?.id ?? value ?? '')
const hash = (token: string) => createHash('sha256').update(token).digest('hex')
export function sameReferralOrigin(request: Request) {
  const url = new URL(request.url)
  const origin = request.headers.get('origin')
  return origin === url.origin || origin === `${url.protocol}//${request.headers.get('host') ?? ''}`
}
export const referralCookie = (siteId: string) => `renegade_referral_${siteId}`
const cookie = (request: Request, name: string) =>
  (request.headers.get('cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1)

async function transaction(payload: any, run: (db: any) => Promise<any>) {
  const db = await payload.db.pool.connect()
  try {
    await db.query('BEGIN')
    const result = await run(db)
    await db.query('COMMIT')
    return result
  } catch (error) {
    await db.query('ROLLBACK')
    payload.logger.error({ err: error, event: 'commerce.referral.reconciliation-failed' })
    throw error
  } finally {
    db.release()
  }
}

export async function referralCode(payload: any, siteId: string, code: string) {
  const result = await payload.db.pool.query(
    `SELECT c.*, p.version, p.name, p.status, p.eligibility, p.codes,
    p.benefit, p.attribution, p.self_referral_rules, p.hold_period_days, p.reversal_rules, p.terms
    FROM referral_codes c JOIN referral_programs p ON p.id=c.program_id AND p.site_id=c.site_id
    WHERE c.site_id=$1 AND c.code=$2 AND p.status='active'`,
    [siteId, code],
  )
  const row = result.rows[0]
  if (!row) return null
  const program: ReferralProgram = {
    id: row.program_id,
    siteId,
    version: row.version,
    name: row.name,
    status: row.status,
    eligibility: row.eligibility,
    codes: row.codes,
    benefit: row.benefit,
    attribution: row.attribution,
    selfReferralRules: row.self_referral_rules,
    holdPeriodDays: row.hold_period_days,
    reversalRules: row.reversal_rules,
    terms: row.terms,
  }
  return { ...row, program }
}

/** Programs are immutable versions. An operator assigns a code to an actual active site member. */
export async function createReferralCode(
  payload: any,
  siteId: string,
  input: any,
  actorId: string,
) {
  const program = { ...input.program, id: randomUUID(), siteId } as ReferralProgram
  const issues = validateReferralProgram(program)
  if (issues.length) throw new Error(issues.join(' '))
  if (!/^[A-Za-z0-9_-]{3,32}$/.test(input.code ?? '')) throw new Error('Invalid referral code.')
  if (input.code.length < program.codes.minLength || input.code.length > program.codes.maxLength)
    throw new Error('Referral code violates program length bounds.')
  if (
    !Number.isSafeInteger(program.attribution.windowDays) ||
    program.attribution.windowDays < 1 ||
    program.attribution.windowDays > 365
  )
    throw new Error('Attribution window must be 1-365 days.')
  if (
    !Number.isSafeInteger(program.holdPeriodDays) ||
    program.holdPeriodDays < 0 ||
    program.holdPeriodDays > 365
  )
    throw new Error('Invalid commission hold period.')
  // The implemented binding is consented last-touch, fixed at checkout creation.
  if (program.attribution.model !== 'last-touch' || !program.attribution.requireCookieConsent)
    throw new Error('Referral links require consented last-touch attribution.')
  if (
    program.selfReferralRules.blockSamePaymentMethod ||
    program.selfReferralRules.blockSameIpHash ||
    program.benefit.maxTotalCommissionPerReferrerMinor
  )
    throw new Error(
      'Payment/IP fingerprint rules and aggregate referrer caps require additional verified evidence and are unavailable.',
    )
  if (
    !program.reversalRules.reverseOnOrderRefund ||
    !program.reversalRules.reverseOnOrderCancel ||
    !program.reversalRules.reverseOnDispute
  )
    throw new Error('Recorded refunds, cancellation and disputes must reverse commissions.')
  const member = await payload.findByID({
    collection: 'members',
    id: input.memberId,
    depth: 0,
    overrideAccess: true,
  })
  const memberships = await payload.find({
    collection: 'member-site-roles',
    where: { and: [{ member: { equals: member.id } }, { site: { equals: siteId } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (member.status !== 'active' || !memberships.docs[0])
    throw new Error('Referrer must be an active site member.')
  return transaction(payload, async (db) => {
    await db.query(
      `INSERT INTO referral_programs(id,site_id,version,name,status,eligibility,codes,benefit,attribution,
      self_referral_rules,hold_period_days,reversal_rules,terms) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        program.id,
        siteId,
        program.version,
        program.name,
        program.status,
        program.eligibility,
        program.codes,
        program.benefit,
        program.attribution,
        program.selfReferralRules,
        program.holdPeriodDays,
        program.reversalRules,
        program.terms,
      ],
    )
    const result = await db.query(
      `INSERT INTO referral_codes(site_id,program_id,member_id,code,created_by)
      VALUES($1,$2,$3,$4,$5) RETURNING id,code`,
      [siteId, program.id, member.id, input.code, actorId],
    )
    return { ...result.rows[0], programId: program.id, disclosure: program.terms.text }
  })
}

export async function captureReferral(payload: any, siteId: string, code: string) {
  const record = await referralCode(payload, siteId, code)
  if (!record) throw new Error('Referral link not found.')
  const member = await payload.findByID({
    collection: 'members',
    id: record.member_id,
    depth: 0,
    overrideAccess: true,
  })
  const roles = await payload.find({
    collection: 'member-site-roles',
    where: { and: [{ member: { equals: member.id } }, { site: { equals: siteId } }] },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  const verified = await payload.find({
    collection: 'linked-identities',
    where: { and: [{ member: { equals: member.id } }, { verifiedAt: { exists: true } }] },
    limit: 1,
    overrideAccess: true,
  })
  const role = roles.docs.find((row: any) =>
    record.program.eligibility.allowedMemberRoles.includes(row.role),
  )?.role
  const owner = {
    memberId: id(member.id),
    email: member.email,
    role,
    emailVerified: Boolean(verified.docs[0]),
    suspended: member.status !== 'active',
    accountCreatedAt: member.createdAt,
  }
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + record.program.attribution.windowDays * 86400000)
  const result = await payload.db.pool.query(
    `INSERT INTO referral_claims(site_id,code_id,token_hash,snapshot,expires_at)
    VALUES($1,$2,$3,$4,$5) RETURNING id`,
    [siteId, record.id, hash(token), { program: record.program, owner, code }, expiresAt],
  )
  return { claimId: result.rows[0].id, token, expiresAt }
}

/** Called only after the checkout service has authenticated its cart/member and derived its site. */
export async function bindCheckoutReferral(
  payload: any,
  request: Request,
  sessionId: string,
  siteId: string,
) {
  const token = cookie(request, referralCookie(siteId))
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return false
  const result = await payload.db.pool.query(
    `UPDATE referral_claims c SET checkout_session_id=$1
    WHERE c.token_hash=$2 AND c.site_id=$3 AND c.expires_at>now()
      AND (c.checkout_session_id IS NULL OR c.checkout_session_id=$1)
      AND EXISTS(SELECT 1 FROM checkout_sessions s WHERE s.id=$1 AND s.site_id=c.site_id)
      AND NOT EXISTS(SELECT 1 FROM referral_claims prior WHERE prior.checkout_session_id=$1 AND prior.id<>c.id)
    RETURNING id`,
    [sessionId, hash(token), siteId],
  )
  return result.rowCount === 1
}

/** Retry-safe projection of actual canonical settlement/refund evidence, never a payout assertion. */
export async function reconcileOrderReferral(payload: any, orderId: string) {
  return transaction(payload, async (db) => {
    const orders = await db.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [orderId])
    const order = orders.rows[0]
    if (!order) throw new Error('Order not found.')
    const claims = await db.query(
      `SELECT * FROM referral_claims WHERE checkout_session_id=$1 AND site_id=$2`,
      [order.checkout_session_id, order.site_id],
    )
    const claim = claims.rows[0]
    if (!claim) return { state: 'unattributed' }
    const { program, owner, code } = claim.snapshot
    let ledger = (
      await db.query(`SELECT * FROM commission_ledgers WHERE order_id=$1 AND type='accrual'`, [
        orderId,
      ])
    ).rows[0]
    const hasPaidEvidence =
      ['paid', 'fulfilling', 'fulfilled', 'refunded'].includes(order.state) ||
      order.receipt?.state === 'issued'
    if (!ledger && hasPaidEvidence) {
      const buyer = order.owner_id
        ? (await db.query('SELECT email FROM members WHERE id=$1', [order.owner_id])).rows[0]
        : null
      const { snapshot: evaluated } = evaluateReferralAttribution({
        program,
        codeOwner: owner,
        referralCode: code,
        customer: {
          memberId: order.owner_id ?? undefined,
          email: buyer?.email ?? order.party_snapshot?.email,
        },
        orderAmountMinor: order.amount_minor,
        currency: order.currency,
        consented: true,
        attributedAt: new Date(claim.created_at),
        now: new Date(order.created_at),
      })
      const attribution = order.referral_attribution ?? evaluated
      // Immutable association is frozen exactly once, including rejected eligibility.
      if (!order.referral_attribution)
        await db.query('UPDATE orders SET referral_attribution=$2 WHERE id=$1', [
          orderId,
          attribution,
        ])
      if (!attribution.eligibleAmountMinor || attribution.status !== 'attributed')
        return { state: 'rejected', attribution }
      const intent = (
        await db.query('SELECT id FROM payment_intents WHERE checkout_session_id=$1 LIMIT 1', [
          order.checkout_session_id,
        ])
      ).rows[0]
      const ledgerId = randomUUID()
      await db.query(
        `INSERT INTO commission_ledgers(id,site_id,program_id,program_version,referrer_member_id,order_id,
        order_number,payment_intent_id,currency,amount_minor,type,status,mature_at,explanation,event_key)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'accrual','pending',$11,$12,$13)`,
        [
          ledgerId,
          order.site_id,
          program.id,
          program.version,
          owner.memberId,
          orderId,
          order.order_number,
          intent?.id ?? null,
          order.currency,
          attribution.calculatedCommissionMinor,
          new Date(Date.now() + program.holdPeriodDays * 86400000),
          attribution.explanation,
          `order:${orderId}:accrual`,
        ],
      )
      ledger = (await db.query('SELECT * FROM commission_ledgers WHERE id=$1', [ledgerId])).rows[0]
    }
    if (!ledger) return { state: 'pending', orderState: order.state }
    const attempts = (
      await db.query(
        `SELECT a.state,a.refunded_amount_minor FROM payment_attempts a
      JOIN payment_intents p ON p.id=a.payment_intent_id WHERE p.checkout_session_id=$1`,
        [order.checkout_session_id],
      )
    ).rows
    const fullReversal =
      ['refunded', 'cancelled'].includes(order.state) ||
      attempts.some((a: any) => ['refunded', 'disputed', 'cancelled'].includes(a.state))
    const total = BigInt(order.amount_minor)
    const refunded = attempts.reduce(
      (max: bigint, a: any) =>
        BigInt(a.refunded_amount_minor ?? '0') > max ? BigInt(a.refunded_amount_minor ?? '0') : max,
      BigInt(order.refund_extension?.refundedAmountMinor ?? '0'),
    )
    const target = fullReversal
      ? BigInt(ledger.amount_minor)
      : total > 0n
        ? (BigInt(ledger.amount_minor) * (refunded > total ? total : refunded)) / total
        : 0n
    const prior = BigInt(ledger.reversed_amount_minor ?? '0')
    if (target > prior) {
      const delta = target - prior
      await db.query(
        `INSERT INTO commission_ledgers(id,site_id,program_id,program_version,referrer_member_id,order_id,order_number,
        payment_intent_id,currency,amount_minor,type,status,mature_at,explanation,compensates_ledger_id,event_key,reversal_reason)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'reversal','reversed',now(),$11,$12,$13,'order_refunded')`,
        [
          randomUUID(),
          ledger.site_id,
          ledger.program_id,
          ledger.program_version,
          ledger.referrer_member_id,
          orderId,
          ledger.order_number,
          ledger.payment_intent_id,
          ledger.currency,
          delta.toString(),
          'Compensating reversal from canonical refund/dispute evidence; no provider payout.',
          ledger.id,
          `order:${orderId}:reversed:${target}`,
        ],
      )
      await db.query(
        `UPDATE commission_ledgers SET reversed_amount_minor=$2::varchar,
        status=CASE WHEN ($2::varchar)::numeric=amount_minor::numeric THEN 'reversed' ELSE status END,
        reversed_at=now(),reversal_reason='order_refunded' WHERE id=$1`,
        [ledger.id, target.toString()],
      )
    }
    await db.query(
      `UPDATE commission_ledgers SET status='eligible' WHERE id=$1 AND status='pending' AND mature_at<=now()`,
      [ledger.id],
    )
    return {
      state: target > 0n && target === BigInt(ledger.amount_minor) ? 'reversed' : 'accrued',
      commissionId: ledger.id,
      reversedMinor: target.toString(),
    }
  })
}

export async function reconcileSiteReferrals(payload: any, siteId?: string) {
  const rows = await payload.db.pool.query(
    `SELECT o.id FROM orders o JOIN referral_claims c ON c.checkout_session_id=o.checkout_session_id
    AND c.site_id=o.site_id WHERE ($1::uuid IS NULL OR o.site_id=$1) ORDER BY o.created_at`,
    [siteId ?? null],
  )
  const results = []
  for (const row of rows.rows) {
    const projection = await reconcileOrderReferral(payload, row.id)
    await payload.db.pool.query(
      `UPDATE affiliate_conversions SET reconciliation_state=$2,status=$3
      WHERE external_order_id=$1 AND network='first-party-referral'`,
      [
        row.id,
        projection.state === 'reversed'
          ? 'reversed'
          : projection.state === 'accrued'
            ? 'reconciled'
            : 'unmatched',
        projection.state === 'reversed'
          ? 'reversed'
          : projection.state === 'accrued'
            ? 'approved'
            : 'pending',
      ],
    )
    results.push(projection)
  }
  return results
}

export async function referralReport(payload: any, siteId: string) {
  const offers = (
    await payload.db.pool.query(
      'SELECT id,name,disclosure,status FROM affiliate_offers WHERE site_id=$1 ORDER BY created_at',
      [siteId],
    )
  ).rows
  const codes = (
    await payload.db.pool.query(
      'SELECT id,code,member_id,program_id FROM referral_codes WHERE site_id=$1 ORDER BY created_at',
      [siteId],
    )
  ).rows
  const ledgers = (
    await payload.db.pool.query(
      'SELECT * FROM commission_ledgers WHERE site_id=$1 ORDER BY created_at,id',
      [siteId],
    )
  ).rows
  const orders = (
    await payload.db.pool.query(
      `SELECT o.id,o.order_number,o.state,o.amount_minor,o.currency,o.referral_attribution,
    o.source_snapshot,o.refund_extension FROM orders o JOIN referral_claims c ON c.checkout_session_id=o.checkout_session_id
    WHERE o.site_id=$1 AND c.site_id=$1 ORDER BY o.created_at`,
      [siteId],
    )
  ).rows
  const totals = (
    await payload.db.pool.query(
      `SELECT currency,
    coalesce(sum(amount_minor::numeric-reversed_amount_minor::numeric) FILTER(WHERE status IN ('pending','eligible','approved','on_hold')),0)::text AS unpaid_minor,
    coalesce(sum(reversed_amount_minor::numeric),0)::text AS reversed_minor,
    coalesce(sum(amount_minor::numeric) FILTER(WHERE status='settled'),0)::text AS paid_minor
    FROM commission_ledgers WHERE site_id=$1 AND type='accrual' GROUP BY currency ORDER BY currency`,
      [siteId],
    )
  ).rows
  const callbacks = (
    await payload.db.pool.query(
      `SELECT id,external_event_id,external_order_id,status,reconciliation_state
    FROM affiliate_conversions WHERE site_id=$1 AND network='first-party-referral' ORDER BY created_at`,
      [siteId],
    )
  ).rows
  return {
    siteId,
    codes,
    offers,
    ledgers,
    orders,
    totals,
    callbacks,
    persisted: true,
    payoutState: 'not-executed',
    accountingNote:
      'Commissions are liabilities/expenses, not additional subscription or donation revenue. Currency totals are separate. Pending orders have no accrued commission.',
  }
}

export async function recordReferralCallback(payload: any, siteId: string, body: any, raw: string) {
  if (
    typeof body.eventId !== 'string' ||
    !body.eventId.trim() ||
    body.eventId.length > 200 ||
    !['conversion', 'reversal'].includes(body.kind)
  )
    throw new Error('Invalid callback identity/kind.')
  assertMoney(String(body.amountMinor), String(body.currency))
  const result = await transaction(payload, async (db) => {
    // Serializes callback identity before duplicate lookup, including across processes.
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      `referral-callback:${siteId}:${body.eventId}`,
    ])
    const prior = (
      await db.query(
        `SELECT * FROM affiliate_conversions WHERE site_id=$1 AND network='first-party-referral' AND external_event_id=$2`,
        [siteId, body.eventId],
      )
    ).rows[0]
    const payloadHash = hash(raw)
    if (prior) {
      if (prior.raw_payload_hash !== payloadHash)
        throw new Error('Callback identity conflicts with recorded evidence.')
      return { replay: true, id: prior.id }
    }
    const order = (
      await db.query('SELECT * FROM orders WHERE id=$1 AND site_id=$2', [body.orderId, siteId])
    ).rows[0]
    if (
      !order ||
      order.currency !== body.currency ||
      order.amount_minor !== String(body.amountMinor)
    )
      throw new Error('Callback order/site/currency/amount mismatch.')
    const claim = (
      await db.query('SELECT id FROM referral_claims WHERE checkout_session_id=$1 AND site_id=$2', [
        order.checkout_session_id,
        siteId,
      ])
    ).rows[0]
    if (!claim) throw new Error('Order has no recorded referral association.')
    const evidenceId = randomUUID()
    await db.query(
      `INSERT INTO affiliate_conversions(id,site_id,source,network,external_event_id,external_order_id,amount_minor,currency,
      occurred_at,status,raw_payload_hash,reconciliation_state,reconciliation_notes)
      VALUES($1,$2,'webhook','first-party-referral',$3,$4,$5,$6,now(),'pending',$7,'unmatched',$8)`,
      [
        evidenceId,
        siteId,
        body.eventId,
        order.id,
        order.amount_minor,
        order.currency,
        payloadHash,
        'Verified callback recorded. Commission follows canonical order/payment/refund evidence, not caller status.',
      ],
    )
    return { replay: false, id: evidenceId }
  })
  // Periodic worker resumes this even if the process stops after evidence commit.
  const projection = await reconcileOrderReferral(payload, body.orderId)
  await payload.db.pool.query(
    `UPDATE affiliate_conversions SET reconciliation_state=$2,status=$3 WHERE id=$1`,
    [
      result.id,
      projection.state === 'reversed'
        ? 'reversed'
        : projection.state === 'accrued'
          ? 'reconciled'
          : 'unmatched',
      projection.state === 'reversed'
        ? 'reversed'
        : projection.state === 'accrued'
          ? 'approved'
          : 'pending',
    ],
  )
  return { ...result, projection, persisted: true, payoutState: 'not-executed' }
}
