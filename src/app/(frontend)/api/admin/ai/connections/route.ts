import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import {
  credentialCipher,
  connectionCredential,
  publicAiConnection,
  relationId,
  testAiProvider,
  validateConnectionInput,
} from '@/modules/ai/connections'

export const runtime = 'nodejs'
type Doc = Record<string, unknown> & { id: string }
const errorResponse = (message: string, status = 400) =>
  NextResponse.json({ error: message }, { status })

async function operator(request: Request, configure = true) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  const roles = configure ? ['owner', 'administrator'] : ['owner', 'administrator', 'staff']
  if (!auth.user || !roles.includes(String(auth.user.role))) return null
  return { payload, user: auth.user }
}

export async function GET(request: Request) {
  const session = await operator(request, false)
  if (!session) return errorResponse('Editor access required.', 403)
  const siteId = new URL(request.url).searchParams.get('siteId')
  if (!siteId) return errorResponse('Choose a site.')
  const found = await session.payload.find({
    collection: 'ai-connections' as never,
    where: { site: { equals: siteId } },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  return NextResponse.json({ connections: (found.docs as Doc[]).map(publicAiConnection) })
}

export async function POST(request: Request) {
  const session = await operator(request)
  if (!session) return errorResponse('Operator access required.', 403)
  try {
    credentialCipher()
    const body = (await request.json()) as Record<string, unknown>
    const input = validateConnectionInput(body)
    await session.payload.findByID({ collection: 'sites', id: input.siteId, overrideAccess: true })
    if (input.publicationId) {
      const publication = await session.payload.findByID({
        collection: 'publications',
        id: input.publicationId,
        depth: 0,
        overrideAccess: true,
      })
      if (relationId(publication.site) !== input.siteId)
        return errorResponse('Publication belongs to another site.', 403)
    }
    // A failed probe is persisted as degraded so the operator can fix and retest it.
    let test: Awaited<ReturnType<typeof testAiProvider>> | null = null
    let lastError: string | null = null
    try {
      test = await testAiProvider(input)
    } catch (error) {
      lastError =
        error instanceof Error && error.message.startsWith('The selected model')
          ? error.message
          : 'Connection test failed. Check endpoint, credentials, model, and provider health.'
    }
    const connection = (await session.payload.create({
      collection: 'ai-connections' as never,
      data: {
        site: input.siteId,
        publication: input.publicationId,
        label: input.label,
        providerKey: input.providerKey,
        endpoint: input.endpoint,
        model: input.model,
        models: test?.models ?? [],
        capabilities: test?.capabilities ?? [],
        allowedTasks: input.allowedTasks,
        status: test ? 'active' : 'degraded',
        lastError,
        lastTestedAt: new Date().toISOString(),
        perTaskUsd: input.perTaskUsd,
        monthlyUsd: input.monthlyUsd,
        maxInputTokens: input.maxInputTokens,
        maxOutputTokens: input.maxOutputTokens,
        inputUsdPer1k: input.inputUsdPer1k,
        outputUsdPer1k: input.outputUsdPer1k,
        createdBy: session.user.id,
      } as never,
      overrideAccess: true,
    })) as Doc
    await session.payload.create({
      collection: 'ai-credentials' as never,
      data: {
        connection: connection.id,
        envelope: credentialCipher().encrypt({ apiKey: input.apiKey }),
      } as never,
      overrideAccess: true,
    })
    return NextResponse.json({ connection: publicAiConnection(connection) }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI connection could not be saved.'
    return errorResponse(
      message.includes('Credential') || message.includes('credential encryption')
        ? message
        : /required|between|tested|endpoint|Site|model|task|Publication/.test(message)
          ? message
          : 'AI connection could not be saved.',
    )
  }
}

export async function PATCH(request: Request) {
  const session = await operator(request)
  if (!session) return errorResponse('Operator access required.', 403)
  const body = (await request.json()) as { id?: string; siteId?: string; action?: string }
  if (!body.id || !body.siteId || !['disable', 'enable', 'test'].includes(String(body.action)))
    return errorResponse('Connection, site, and action are required.')
  let connection: Doc
  try {
    connection = (await session.payload.findByID({
      collection: 'ai-connections' as never,
      id: body.id,
      depth: 0,
      overrideAccess: true,
    })) as Doc
  } catch {
    return errorResponse('Connection not found.', 404)
  }
  if (relationId(connection.site) !== body.siteId)
    return errorResponse('Connection belongs to another site.', 403)
  if (body.action === 'disable') {
    connection = (await session.payload.update({
      collection: 'ai-connections' as never,
      id: connection.id,
      data: { status: 'disabled' } as never,
      overrideAccess: true,
    })) as Doc
    return NextResponse.json({ connection: publicAiConnection(connection) })
  }
  if (body.action === 'enable') return errorResponse('Test the connection before enabling it.')
  let test: Awaited<ReturnType<typeof testAiProvider>> | null = null
  try {
    const apiKey = await connectionCredential(session.payload, connection.id)
    test = await testAiProvider({
      providerKey: connection.providerKey as 'ai.ollama' | 'ai.openai-compatible',
      endpoint: String(connection.endpoint),
      apiKey,
      model: String(connection.model),
    })
  } catch {
    /* Keep a redacted degraded state. */
  }
  connection = (await session.payload.update({
    collection: 'ai-connections' as never,
    id: connection.id,
    data: {
      status: test ? 'active' : 'degraded',
      models: test?.models ?? [],
      capabilities: test?.capabilities ?? [],
      lastError: test
        ? null
        : 'Connection test failed. Check endpoint, credentials, model, and provider health.',
      lastTestedAt: new Date().toISOString(),
    } as never,
    overrideAccess: true,
  })) as Doc
  return NextResponse.json({ connection: publicAiConnection(connection) })
}
