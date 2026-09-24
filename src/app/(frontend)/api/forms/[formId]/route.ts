/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { runFormActions, submitPublicForm } from '@/modules/audience/service'
import { requestNewsletterSubscription } from '@/modules/audience/service'
import { audienceDigest } from '@/modules/audience/contracts'
import { takeAudiencePublicRequest } from '@/modules/audience/public-rate-limit'

function requestIp(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
}

function isAllowedOrigin(request: Request, allowedEmbedOrigins: unknown) {
  const origin = request.headers.get('origin')
  if (!origin) return true
  const own = new URL(process.env.APP_URL ?? 'http://localhost:3000').origin
  return (
    origin === own || (Array.isArray(allowedEmbedOrigins) && allowedEmbedOrigins.includes(origin))
  )
}
export async function POST(request: Request, context: { params: Promise<{ formId: string }> }) {
  const { formId } = await context.params
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (!Number.isFinite(contentLength) || contentLength > 64 * 1024)
    return NextResponse.json({ error: 'Submission is too large.' }, { status: 413 })
  const ip = requestIp(request)
  if (!takeAudiencePublicRequest(ip, `form:${formId}`))
    return NextResponse.json({ error: 'Please try again shortly.' }, { status: 429 })
  const body = (await request.json().catch(() => ({}))) as any
  if (body.files || body.attachments)
    return NextResponse.json(
      { error: 'File uploads are not supported by public forms.' },
      { status: 422 },
    )
  const payload = await getPayload({ config })
  const form = (await payload.findByID({
    collection: 'form-definitions' as never,
    id: formId,
    depth: 1,
    overrideAccess: true,
  } as never)) as any
  if (
    !form ||
    form.visibility !== 'public' ||
    !form.activeSchema ||
    form.activeSchema.state !== 'published'
  )
    return NextResponse.json({ error: 'Form unavailable.' }, { status: 404 })
  if (!isAllowedOrigin(request, form.settings?.allowedEmbedOrigins))
    return NextResponse.json({ error: 'Cross-site submission rejected.' }, { status: 403 })
  const schema = form.activeSchema as any
  try {
    const result = await submitPublicForm(payload, {
      formId,
      schema: {
        ...schema.schema,
        version: schema.version,
        locale: schema.locale,
        consentText: schema.consentText,
        consentRevision: schema.consentRevision,
        consentTranslationStatus: schema.consentTranslationStatus,
      },
      values: body.values ?? {},
      siteId: String(form.site),
      ipDigest: audienceDigest(ip),
      honeypot: body.honeypot,
      idempotencyKey: body.idempotencyKey ?? crypto.randomUUID(),
    })
    if (result.errors) return NextResponse.json(result, { status: 422 })
    if (result.replay)
      return NextResponse.json(
        { ...result, actions: result.submission.actionState ?? [] },
        { status: 200 },
      )
    const actions = await runFormActions(payload, { submission: result.submission, form, schema })
    const newsletter = form.settings?.newsletter
    if (newsletter?.listId) {
      const email = body.values?.[newsletter.emailField ?? 'email']
      const consent = body.values?.[newsletter.consentField ?? 'marketing_consent']
      if (consent !== true || typeof email !== 'string')
        return NextResponse.json(
          {
            ...result,
            newsletter: { status: 'not-requested', reason: 'explicit-consent-required' },
            actions,
          },
          { status: 201 },
        )
      const subscription = await requestNewsletterSubscription(payload, {
        siteId: String(form.site),
        listId: String(newsletter.listId),
        email,
        locale: schema.locale,
        consentWording: schema.consentText,
        source: `form:${formId}:schema:${schema.version}`,
        formSubmissionId: result.submission.id,
      })
      return NextResponse.json(
        { ...result, newsletter: { status: subscription.status }, actions },
        { status: 201 },
      )
    }
    return NextResponse.json({ ...result, actions }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Submission could not be accepted.' }, { status: 400 })
  }
}
