import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { getLocalizationEngine } from '@/modules/editorial/localization/service'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const userId = String(auth.user.id)
  const unreadOnly = searchParams.get('unread') === 'true'
  const engine = getLocalizationEngine()

  const notifications = engine.notificationManager.getInAppNotifications(userId, { unreadOnly })
  const preferences = engine.notificationManager.getUserPreferences(userId)
  const outbox = ['owner', 'administrator', 'staff'].includes(String(auth.user.role))
    ? engine.notificationManager.getOutbox()
    : undefined

  return NextResponse.json({
    userId,
    notifications,
    preferences,
    outbox,
  })
}

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as {
      action: 'mark-read' | 'update-preferences' | 'process-outbox'
      notificationId?: string
      preferences?: any
    }

    const engine = getLocalizationEngine()
    const userId = String(auth.user.id)

    switch (body.action) {
      case 'mark-read': {
        if (!body.notificationId) {
          return NextResponse.json({ error: 'notificationId required.' }, { status: 400 })
        }
        const marked = engine.notificationManager.markAsRead(body.notificationId)
        return NextResponse.json({ success: marked })
      }

      case 'update-preferences': {
        if (!body.preferences) {
          return NextResponse.json({ error: 'preferences required.' }, { status: 400 })
        }
        engine.notificationManager.setUserPreferences({
          ...body.preferences,
          userId,
        })
        return NextResponse.json({ success: true })
      }

      case 'process-outbox': {
        if (!['owner', 'administrator', 'staff'].includes(String(auth.user.role))) {
          return NextResponse.json({ error: 'Staff access required to process outbox.' }, { status: 403 })
        }
        const res = await engine.notificationManager.processOutbox()
        return NextResponse.json({ success: true, ...res })
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${(body as any).action}` }, { status: 400 })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 })
  }
}
