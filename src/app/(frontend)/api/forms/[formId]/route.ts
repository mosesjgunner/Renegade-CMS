/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { submitPublicForm } from '@/modules/audience/service'
export async function POST(request: Request, context: { params: Promise<{ formId: string }> }) {
  const { formId } = await context.params
  const body = (await request.json().catch(() => ({}))) as any
  const payload = await getPayload({ config })
  const form = (await payload.findByID({
    collection: 'form-definitions' as never,
    id: formId,
    depth: 1,
    overrideAccess: true,
  } as never)) as any
  if (!form || form.visibility !== 'public' || !form.activeSchema)
    return NextResponse.json({ error: 'Form unavailable.' }, { status: 404 })
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
      ipDigest: request.headers.get('x-forwarded-for') ?? 'unknown',
      honeypot: body.honeypot,
      idempotencyKey: body.idempotencyKey ?? crypto.randomUUID(),
    })
    return NextResponse.json(result, { status: result.errors ? 422 : 201 })
  } catch {
    return NextResponse.json({ error: 'Submission could not be accepted.' }, { status: 400 })
  }
}
