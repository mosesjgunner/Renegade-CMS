import config from '@payload-config'
import { getPayload } from 'payload'

import { loadConfig } from '@/modules/core/config'
import {
  completeSsoSignIn,
  decodeSsoTransaction,
  readSsoTransactionCookie,
  resolveEnterpriseIdpSecret,
  toIdpConnection,
} from '@/modules/identity/enterprise-idp'
import { csrfCookie, issueCsrfToken, memberSessionCookie } from '@/modules/identity/member-identity'

function redirectWithCookies(location: URL, cookies: string[]): Response {
  // Response.redirect() returns an immutable-headers response in the
  // Node runtime; appending Set-Cookie would throw (RC2-DEBT-18).
  const response = new Response(null, { status: 302, headers: { location: location.href } })
  for (const cookie of cookies) response.headers.append('set-cookie', cookie)
  return response
}

/**
 * RC3-21 #64: complete enterprise SSO — exchange the code, verify the
 * ID token against the loopback IdP's JWKS, link the identity, and mint
 * a member session (`createdFrom: 'oauth'`) with the session cookie set
 * on a mutable 302, exactly like magic-link completion.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const failure = (reason: string) =>
    redirectWithCookies(
      new URL(`/member-auth?error=${encodeURIComponent(reason)}`, request.url),
      [],
    )
  const payload = await getPayload({ config })
  const appConfig = loadConfig()
  const decoded = await decodeSsoTransaction(
    appConfig.payloadSecret,
    readSsoTransactionCookie(request.headers),
  )
  if (!decoded) return failure('sso-state')
  const doc = await payload
    .findByID({
      collection: 'enterprise-idp-connections' as never,
      id: decoded.connectionId,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)
  if (!doc) return failure('sso-connection')
  const connection = toIdpConnection(doc as Record<string, unknown>)
  const code = url.searchParams.get('code') ?? ''
  if (!code) return failure('sso-code')
  const scopeParam = url.searchParams.get('scope')
  try {
    const clientSecret = await resolveEnterpriseIdpSecret(payload as never, connection.id)
    const result = await completeSsoSignIn(payload as never, connection, {
      code,
      state: url.searchParams.get('state'),
      grantedScopes: scopeParam ? scopeParam.split(' ') : undefined,
      transaction: decoded.transaction,
      clientSecret,
    })
    if (!result.ok) return failure(result.reason)
    const csrfToken = issueCsrfToken()
    return redirectWithCookies(new URL('/members/settings', request.url), [
      memberSessionCookie(result.sessionToken, appConfig.secureCookies),
      csrfCookie(csrfToken, appConfig.secureCookies),
    ])
  } catch (error) {
    return failure(error instanceof Error ? 'sso-failed' : 'sso-failed')
  }
}
