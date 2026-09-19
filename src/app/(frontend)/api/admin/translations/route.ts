import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { defaultSimulatedProvider, getLocalizationEngine } from '@/modules/editorial/localization/service'
import { evaluateTranslationCompleteness } from '@/modules/editorial/localization/completeness'
import { computeHreflangAlternates } from '@/modules/editorial/localization/hreflang'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff', 'editor', 'author'].includes(String(auth.user.role))) {
    return NextResponse.json({ error: 'Authorized access required.' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const groupId = searchParams.get('groupId')
  const requestId = searchParams.get('requestId')
  const engine = getLocalizationEngine()

  if (requestId) {
    const req = engine.getRequest(requestId)
    if (!req) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    return NextResponse.json({ request: req })
  }

  if (groupId) {
    const group = engine.getGroup(groupId)
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    const requests = engine.getAllRequestsForGroup(groupId)
    return NextResponse.json({ group, requests })
  }

  return NextResponse.json({ message: 'Localization service active.' })
}

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff', 'editor'].includes(String(auth.user.role))) {
    return NextResponse.json({ error: 'Staff or editor access required.' }, { status: 403 })
  }

  try {
    const body = (await request.json()) as {
      action:
        | 'create-group'
        | 'request-translation'
        | 'draft-provider'
        | 'update-target'
        | 'submit-review'
        | 'request-changes'
        | 'approve'
        | 'advance-source'
        | 'publish'
        | 'realign-pin'
        | 'check-completeness'
      groupId?: string
      requestId?: string
      locale?: string
      targetLocale?: string
      sourceDocument?: any
      translatorId?: string
      reviewerId?: string
      dueDate?: string
      updates?: any
      reason?: string
      siteBaseUrl?: string
    }

    const engine = getLocalizationEngine()

    switch (body.action) {
      case 'create-group': {
        if (!body.sourceDocument) {
          return NextResponse.json({ error: 'sourceDocument is required.' }, { status: 400 })
        }
        const group = engine.createTranslationGroup({
          sourceDocument: body.sourceDocument,
        })
        return NextResponse.json({ success: true, group })
      }

      case 'request-translation': {
        if (!body.groupId || !body.targetLocale) {
          return NextResponse.json({ error: 'groupId and targetLocale are required.' }, { status: 400 })
        }
        const req = engine.requestTranslation({
          groupId: body.groupId,
          targetLocale: body.targetLocale,
          translatorId: body.translatorId,
          reviewerId: body.reviewerId,
          dueDate: body.dueDate,
        })
        return NextResponse.json({ success: true, request: req })
      }

      case 'draft-provider': {
        if (!body.requestId) {
          return NextResponse.json({ error: 'requestId is required.' }, { status: 400 })
        }
        const res = await engine.draftWithProvider(body.requestId, defaultSimulatedProvider)
        return NextResponse.json(res)
      }

      case 'update-target': {
        if (!body.requestId || !body.updates) {
          return NextResponse.json({ error: 'requestId and updates are required.' }, { status: 400 })
        }
        const variant = engine.updateTargetContent(body.requestId, body.updates)
        return NextResponse.json({ success: true, variant })
      }

      case 'submit-review': {
        if (!body.requestId) {
          return NextResponse.json({ error: 'requestId is required.' }, { status: 400 })
        }
        const req = engine.submitForReview(body.requestId)
        return NextResponse.json({ success: true, request: req })
      }

      case 'request-changes': {
        if (!body.requestId || !body.reason) {
          return NextResponse.json({ error: 'requestId and reason are required.' }, { status: 400 })
        }
        const reviewerId = String(auth.user.id || 'editor')
        const req = engine.requestChanges(body.requestId, reviewerId, body.reason)
        return NextResponse.json({ success: true, request: req })
      }

      case 'approve': {
        if (!body.requestId) {
          return NextResponse.json({ error: 'requestId is required.' }, { status: 400 })
        }
        const reviewerId = String(auth.user.id || 'editor')
        const req = engine.approveTranslation(body.requestId, reviewerId)
        return NextResponse.json({ success: true, request: req })
      }

      case 'advance-source': {
        if (!body.groupId || !body.updates) {
          return NextResponse.json({ error: 'groupId and updates are required.' }, { status: 400 })
        }
        const res = engine.advanceSourceDocument(body.groupId, body.updates)
        return NextResponse.json({ success: true, ...res })
      }

      case 'realign-pin': {
        if (!body.requestId) {
          return NextResponse.json({ error: 'requestId is required.' }, { status: 400 })
        }
        const req = engine.realignTranslationPin(body.requestId)
        return NextResponse.json({ success: true, request: req })
      }

      case 'publish': {
        if (!body.groupId || !body.locale) {
          return NextResponse.json({ error: 'groupId and locale are required.' }, { status: 400 })
        }
        const res = engine.publishLocaleVariant(body.groupId, body.locale, {
          siteBaseUrl: body.siteBaseUrl,
        })
        return NextResponse.json({ success: true, ...res })
      }

      case 'check-completeness': {
        if (!body.groupId || !body.locale) {
          return NextResponse.json({ error: 'groupId and locale are required.' }, { status: 400 })
        }
        const group = engine.getGroup(body.groupId)
        if (!group) return NextResponse.json({ error: 'Group not found.' }, { status: 404 })
        const sourceVariant = group.variants[group.sourceLocale]
        const targetVariant = group.variants[body.locale]
        if (!targetVariant) return NextResponse.json({ error: 'Variant not found.' }, { status: 404 })

        const report = evaluateTranslationCompleteness({
          source: {
            title: sourceVariant.title,
            summary: sourceVariant.summary,
            body: sourceVariant.body,
            seoTitle: sourceVariant.seoTitle,
            seoDescription: sourceVariant.seoDescription,
          },
          target: {
            id: targetVariant.documentId,
            title: targetVariant.title,
            summary: targetVariant.summary,
            body: targetVariant.body,
            seoTitle: targetVariant.seoTitle,
            seoDescription: targetVariant.seoDescription,
            mediaChoices: targetVariant.mediaChoices,
          },
        })
        return NextResponse.json({ success: true, report })
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${(body as any).action}` }, { status: 400 })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 })
  }
}
