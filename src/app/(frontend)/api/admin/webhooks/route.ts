import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { getLocalizationEngine } from '@/modules/editorial/localization/service'
import { rotateSubscriptionSecret } from '@/modules/editorial/localization/webhooks'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role))) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const webhookId = searchParams.get('webhookId') || undefined
  const engine = getLocalizationEngine()

  const logs = engine.webhookEngine.getDeliveryLogs(webhookId)
  return NextResponse.json({ logs })
}

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role))) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  }

  try {
    const body = (await request.json()) as {
      action: 'register' | 'rotate-secret' | 'test-dispatch'
      subscription?: any
      subscriptionId?: string
      newSecret?: string
      eventType?: string
      eventData?: Record<string, unknown>
    }

    const engine = getLocalizationEngine()

    switch (body.action) {
      case 'register': {
        if (!body.subscription) {
          return NextResponse.json({ error: 'subscription is required.' }, { status: 400 })
        }
        const res = engine.webhookEngine.registerSubscription(body.subscription)
        if (!res.valid) {
          return NextResponse.json({ error: res.error }, { status: 400 })
        }
        return NextResponse.json({ success: true })
      }

      case 'rotate-secret': {
        if (!body.subscriptionId || !body.newSecret) {
          return NextResponse.json(
            { error: 'subscriptionId and newSecret required.' },
            { status: 400 },
          )
        }
        const sub = engine.webhookEngine.getSubscription(body.subscriptionId)
        if (!sub) return NextResponse.json({ error: 'Subscription not found.' }, { status: 404 })

        const rotated = rotateSubscriptionSecret(sub, body.newSecret)
        engine.webhookEngine.registerSubscription(rotated)
        return NextResponse.json({ success: true, subscription: rotated })
      }

      case 'test-dispatch': {
        if (!body.eventType || !body.eventData) {
          return NextResponse.json({ error: 'eventType and eventData required.' }, { status: 400 })
        }
        const res = await engine.webhookEngine.dispatchEvent(
          body.eventType as any,
          body.eventData,
          { allowTestHttp: process.env.NODE_ENV === 'test' },
        )
        return NextResponse.json({ success: true, ...res })
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${(body as any).action}` },
          { status: 400 },
        )
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 })
  }
}
