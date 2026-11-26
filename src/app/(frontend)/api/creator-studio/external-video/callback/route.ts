import config from '@payload-config'
import { getPayload } from 'payload'
import { cookies } from 'next/headers'
import { timingSafeEqual } from 'node:crypto'
import { decryptSecret } from '@/modules/social/security'
import { connectYouTube } from '@/modules/creator-studio/external-video'
import { resolveOperatorGrantContext } from '@/modules/operations/operator-grants'
import {
  completeYouTubePublishConnect,
  youtubePublishOAuthCookie,
} from '@/modules/social/youtube-publish-connect'
import { privateHeaders, submissionActor } from '@/modules/creator-studio/submission-http'
import {
  youtubeCallbackPath,
  youtubeConfiguration,
} from '@/modules/creator-studio/youtube-metadata'

const clearCookie = {
  secure: true,
  httpOnly: true,
  sameSite: 'lax' as const,
  path: youtubeCallbackPath,
  maxAge: 0,
}

const redirect = (location: string) =>
  new Response(null, {
    status: 303,
    headers: { ...privateHeaders, 'referrer-policy': 'no-referrer', location },
  })

function validCallbackParams(request: Request) {
  const oauth = youtubeConfiguration()
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (
    !oauth ||
    url.origin !== new URL(oauth.redirectUri).origin ||
    !code ||
    code.length > 2048 ||
    !state ||
    !/^[\w-]{43}$/.test(state)
  )
    throw new Error('Invalid OAuth response.')
  return { oauth, code, state }
}

function validProof(cookie: string, key: string, state: string) {
  const proof = JSON.parse(decryptSecret(cookie, key))
  if (
    typeof proof.state !== 'string' ||
    !/^[\w-]{43}$/.test(proof.state) ||
    !timingSafeEqual(Buffer.from(state), Buffer.from(proof.state)) ||
    typeof proof.verifier !== 'string' ||
    typeof proof.issued !== 'number' ||
    Math.abs(Date.now() - proof.issued) > 600000
  )
    throw new Error('Invalid OAuth response.')
  return proof as { state: string; verifier: string; issued: number } & Record<string, unknown>
}

/**
 * Publish-connect completion: the social admin flow's OAuth start sets
 * its own cookie on this same registered redirect path. The operator
 * grant and the operator who started the flow are re-verified here —
 * the cookie alone never authorizes anything.
 */
async function publishCallback(request: Request, cookie: string) {
  let result = 'failed'
  try {
    const { oauth, code, state } = validCallbackParams(request)
    const proof = validProof(cookie, oauth.key, state)
    if (typeof proof.siteId !== 'string' || typeof proof.userId !== 'string')
      throw new Error('Invalid OAuth response.')
    const payload = await getPayload({ config })
    const auth = await payload.auth({ headers: request.headers })
    const grant = await resolveOperatorGrantContext(payload, auth?.user)
    if (
      !auth?.user ||
      !grant.authorized ||
      String(auth.user.id) !== proof.userId ||
      (!grant.isGlobalOwner && !grant.authorizedSiteIds.includes(proof.siteId))
    )
      throw new Error('Invalid OAuth actor.')
    await completeYouTubePublishConnect(payload, {
      siteId: proof.siteId,
      code,
      verifier: proof.verifier,
    })
    result = 'connected'
  } catch {
    // OAuth callback parameters and provider diagnostics never enter a response or log.
  }
  return redirect(`/admin/social?youtube=${result}`)
}

export async function GET(request: Request) {
  const jar = await cookies()
  const cookie = jar.get('creator-youtube-oauth')?.value
  const publishCookie = jar.get(youtubePublishOAuthCookie)?.value
  jar.set('creator-youtube-oauth', '', clearCookie)
  jar.set(youtubePublishOAuthCookie, '', clearCookie)
  if (publishCookie) return publishCallback(request, publishCookie)
  let result = 'failed'
  try {
    const { oauth, code, state } = validCallbackParams(request)
    if (!cookie) throw new Error('Invalid OAuth response.')
    const proof = validProof(cookie, oauth.key, state)
    const payload = await getPayload({ config })
    const actor = await submissionActor(payload, request)
    if (actor.siteId !== proof.siteId || actor.memberId !== proof.memberId)
      throw new Error('Invalid OAuth actor.')
    await connectYouTube(payload, actor, code, proof.verifier)
    result = 'connected'
  } catch {
    // OAuth callback parameters and provider diagnostics never enter a response or log.
  }
  return redirect(`/studio/external-video?youtube=${result}`)
}
