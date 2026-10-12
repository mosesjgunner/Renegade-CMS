import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { resolveOperatorGrantContext } from '@/modules/operations/operator-grants'
import { publicSiteForHost, samePublicOrigin } from '@/modules/public/site-scope'
import {
  deterministicTelecomEmulator,
  getEmulatorInboundHistory,
  getTelecomEmulatorReceipts,
  resetTelecomEmulator,
  setEmulatorRecipientCapability,
  setEmulatorSimulation,
  simulateInboundTelecomMessage,
  telecomEmulatorCapabilities,
} from '@/modules/telecom/emulator'
import {
  calculateNextSendWindow,
  isWithinQuietHours,
  normalizeE164Phone,
  type QuietHoursPolicy,
} from '@/modules/telecom/contracts'
import { processInboundTelecomMessage } from '@/modules/telecom/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function authenticateOperator(request: Request) {
  const payload = await getPayload({ config: configPromise })
  const auth = await payload.auth({ headers: request.headers })
  const grant = await resolveOperatorGrantContext(payload, auth?.user)
  if (!grant.authorized) return null
  return { payload, user: auth.user, grant }
}

export async function GET(request: Request) {
  const session = await authenticateOperator(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized. Staff role required.' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const siteId =
    searchParams.get('siteId') ||
    (await publicSiteForHost(session.payload, request.headers.get('host')))

  if (
    !siteId ||
    (!session.grant.isGlobalOwner && !session.grant.authorizedSiteIds.includes(siteId))
  ) {
    return NextResponse.json(
      { error: 'Forbidden. You do not have operator access to this site.' },
      { status: 403 },
    )
  }

  const [health, readiness] = await Promise.all([
    deterministicTelecomEmulator.health(),
    deterministicTelecomEmulator.senderReadiness({
      from: '+18005550199',
      type: 'toll-free',
    }),
  ])

  return NextResponse.json({
    siteId,
    health,
    senderReadiness: readiness,
    capabilities: telecomEmulatorCapabilities,
    receipts: getTelecomEmulatorReceipts(siteId),
    inboundHistory: getEmulatorInboundHistory(siteId),
  })
}

export async function POST(request: Request) {
  const session = await authenticateOperator(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized. Staff role required.' }, { status: 403 })
  }

  const origin = request.headers.get('origin')
  if (origin) {
    const isSameOrigin = await samePublicOrigin(session.payload, request, false)
    if (!isSameOrigin) {
      return NextResponse.json(
        { error: 'Forbidden. Cross-origin request rejected.' },
        { status: 403 },
      )
    }
  }

  const body = await request.json().catch(() => null)
  if (!body || !body.action) {
    return NextResponse.json({ error: 'Missing operation action.' }, { status: 400 })
  }

  const siteId =
    body.siteId ||
    (await publicSiteForHost(session.payload, request.headers.get('host'))) ||
    session.grant.authorizedSiteIds[0]

  if (
    !siteId ||
    (!session.grant.isGlobalOwner && !session.grant.authorizedSiteIds.includes(siteId))
  ) {
    return NextResponse.json(
      { error: 'Forbidden. No operator access to target site.' },
      { status: 403 },
    )
  }

  switch (body.action) {
    case 'simulate-inbound': {
      if (!body.from || !body.text) {
        return NextResponse.json({ error: 'from and text are required.' }, { status: 422 })
      }
      try {
        const normalizedFrom = normalizeE164Phone(body.from)
        const to = body.to || '+18005550199'
        const inboundEvent = simulateInboundTelecomMessage({
          from: normalizedFrom.e164,
          to,
          text: body.text,
          siteId,
        })
        const processResult = await processInboundTelecomMessage(session.payload, {
          siteId,
          fromE164: normalizedFrom.e164,
          toE164: to,
          text: body.text,
          providerMessageId: inboundEvent.providerMessageId,
          brandName: body.brandName,
        })
        return NextResponse.json({
          inboundEvent,
          processResult,
        })
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'Failed to process inbound message.' },
          { status: 400 },
        )
      }
    }

    case 'check-quiet-hours': {
      const time = body.timestamp ? new Date(body.timestamp) : new Date()
      const recipientTz = body.recipientTimezone || undefined
      const policy: QuietHoursPolicy = body.policy || {
        startHour: 21,
        endHour: 8,
        siteTimezone: 'UTC',
      }
      const quietResult = isWithinQuietHours(time, recipientTz, policy)
      const nextWindow = quietResult.isQuiet
        ? calculateNextSendWindow(time, recipientTz, policy)
        : null
      return NextResponse.json({
        quietResult,
        nextWindow,
      })
    }

    case 'set-recipient-capability': {
      if (!body.phone) {
        return NextResponse.json({ error: 'phone is required.' }, { status: 422 })
      }
      try {
        const normalized = normalizeE164Phone(body.phone)
        setEmulatorRecipientCapability(
          normalized.e164,
          {
            rcsSupported: Boolean(body.rcsSupported),
            carrier: body.carrier,
          },
          siteId,
        )
        return NextResponse.json({
          phone: normalized.e164,
          rcsSupported: Boolean(body.rcsSupported),
          carrier: body.carrier ?? null,
        })
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'Invalid phone number.' },
          { status: 400 },
        )
      }
    }

    case 'set-simulation': {
      if (!body.keyOrPhone || !body.simulation) {
        return NextResponse.json(
          { error: 'keyOrPhone and simulation are required.' },
          { status: 422 },
        )
      }
      setEmulatorSimulation(body.keyOrPhone, body.simulation, siteId)
      return NextResponse.json({
        keyOrPhone: body.keyOrPhone,
        simulation: body.simulation,
      })
    }

    case 'reset-emulator': {
      resetTelecomEmulator(siteId)
      return NextResponse.json({ message: 'Telecom emulator state reset.' })
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 })
  }
}
