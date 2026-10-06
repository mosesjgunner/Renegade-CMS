import config from '@payload-config'
import { getPayload } from 'payload'
import { loadPublicForm } from '@/modules/audience/form-runtime'
import { submitPublicForm } from '@/modules/audience/service'
import { publicSiteForHost, samePublicOrigin } from '@/modules/public/site-scope'
import { audienceDigest } from '@/modules/audience/contracts'
import { takeAudiencePublicRequest } from '@/modules/audience/public-rate-limit'

export const dynamic = 'force-dynamic'
const headers = { 'cache-control': 'private, no-store' }
type Context = { params: Promise<{ formId: string }> }
async function load(request: Request, context: Context) {
  const payload = await getPayload({ config })
  const siteId = await publicSiteForHost(payload, request.headers.get('host'))
  const { formId } = await context.params
  return {
    payload,
    siteId,
    formId,
    definition:
      siteId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(formId)
        ? await loadPublicForm(payload, formId, siteId)
        : null,
  }
}
export async function GET(request: Request, context: Context) {
  const { definition } = await load(request, context)
  if (!definition) return Response.json({ error: 'Form unavailable.' }, { status: 404, headers })
  return Response.json(
    {
      formId: definition.form.id,
      title: definition.form.title ?? definition.form.name,
      schema: definition.snapshot,
    },
    { headers },
  )
}
export async function POST(request: Request, context: Context) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    return Response.json({ error: 'JSON required.' }, { status: 415, headers })
  const reader = request.body?.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  if (reader)
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > 64 * 1024) {
        await reader.cancel()
        return Response.json({ error: 'Submission too large.' }, { status: 413, headers })
      }
      chunks.push(next.value)
    }
  const text = Buffer.concat(chunks).toString('utf8')
  try {
    const { payload, siteId, formId, definition } = await load(request, context)
    if (!(await samePublicOrigin(payload, request)))
      return Response.json({ error: 'Same-origin submission required.' }, { status: 403, headers })
    if (!definition) return Response.json({ error: 'Form unavailable.' }, { status: 404, headers })
    if (!takeAudiencePublicRequest('public', `form:${siteId}:${formId}`, Date.now(), 120))
      return Response.json(
        { error: 'Try again later.' },
        { status: 429, headers: { ...headers, 'retry-after': '60' } },
      )
    let body: Record<string, unknown>
    try {
      body = JSON.parse(text)
    } catch {
      return Response.json({ error: 'Invalid JSON.' }, { status: 400, headers })
    }
    if (!body || typeof body !== 'object')
      return Response.json({ error: 'Invalid submission.' }, { status: 400, headers })
    if (body.honeypot)
      return Response.json({ error: 'Submission rejected.' }, { status: 422, headers })
    if (
      !body.values ||
      typeof body.values !== 'object' ||
      Array.isArray(body.values) ||
      typeof body.idempotencyKey !== 'string' ||
      !/^[a-zA-Z0-9_-]{16,128}$/.test(body.idempotencyKey)
    )
      return Response.json(
        { error: 'Answers and a valid request key are required.' },
        { status: 400, headers },
      )
    const result = await submitPublicForm(payload, {
      siteId,
      formId,
      schema: definition.snapshot,
      values: body.values as Record<string, unknown>,
      honeypot: String(body.honeypot ?? ''),
      ipDigest: audienceDigest(
        `${process.env.PAYLOAD_SECRET}:${siteId}:${request.headers.get('x-forwarded-for') ?? 'unknown'}`,
      ),
      idempotencyKey: body.idempotencyKey,
    })
    if (result.errors) return Response.json({ errors: result.errors }, { status: 422, headers })
    return Response.json(
      {
        received: true,
        submissionId: result.submission.id,
        replay: result.replay === true,
        actions: 'worker-managed',
      },
      { status: result.replay ? 200 : 201, headers },
    )
  } catch {
    return Response.json(
      { error: 'Submission rejected. Check the form and try again.' },
      { status: 503, headers },
    )
  }
}
