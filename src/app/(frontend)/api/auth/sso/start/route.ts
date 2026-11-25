import config from '@payload-config'
import { getPayload } from 'payload'

import { loadConfig } from '@/modules/core/config'
import {
  beginSsoSignIn,
  encodeSsoTransaction,
  ssoTransactionCookie,
  toIdpConnection,
} from '@/modules/identity/enterprise-idp'

/**
 * RC3-21 #64: begin enterprise SSO against a loopback test IdP.
 * The OAuth transaction (state hash + PKCE verifier) travels in a
 * signed, httpOnly, 10-minute cookie; the browser is redirected to the
 * IdP authorization endpoint with a mutable 302 (Set-Cookie must not
 * throw — see the magic-link completion route, RC2-DEBT-18).
 */
async function start(request: Request, connectionId: string | null) {
  if (!connectionId)
    return Response.json({ error: 'An IdP connection is required.' }, { status: 400 })
  const payload = await getPayload({ config })
  const doc = await payload
    .findByID({
      collection: 'enterprise-idp-connections' as never,
      id: connectionId,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)
  if (!doc) return Response.json({ error: 'IdP connection not found.' }, { status: 404 })
  const connection = toIdpConnection(doc as Record<string, unknown>)
  if (connection.status !== 'active')
    return Response.json({ error: 'IdP connection is not active.' }, { status: 409 })
  try {
    const { authorizationUrl, transaction } = await beginSsoSignIn(connection)
    const appConfig = loadConfig()
    const cookieValue = await encodeSsoTransaction(
      appConfig.payloadSecret,
      transaction,
      connection.id,
    )
    const response = new Response(null, {
      status: 302,
      headers: { location: authorizationUrl },
    })
    response.headers.append(
      'set-cookie',
      ssoTransactionCookie(cookieValue, appConfig.secureCookies),
    )
    return response
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'SSO start failed.' },
      { status: 502 },
    )
  }
}

export async function GET(request: Request) {
  return start(request, new URL(request.url).searchParams.get('connection'))
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { connectionId?: string }
  return start(request, body.connectionId ?? new URL(request.url).searchParams.get('connection'))
}
