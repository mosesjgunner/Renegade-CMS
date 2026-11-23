import config from '@payload-config'
import { getPayload } from 'payload'
import { cookies } from 'next/headers'
import { timingSafeEqual } from 'node:crypto'
import { decryptSecret } from '@/modules/social/security'
import { connectYouTube } from '@/modules/creator-studio/external-video'
import { privateHeaders, submissionActor } from '@/modules/creator-studio/submission-http'
import {
  youtubeCallbackPath,
  youtubeConfiguration,
} from '@/modules/creator-studio/youtube-metadata'

export async function GET(request: Request) {
  const jar = await cookies()
  const cookie = jar.get('creator-youtube-oauth')?.value
  jar.set('creator-youtube-oauth', '', {
    secure: true,
    httpOnly: true,
    sameSite: 'lax',
    path: youtubeCallbackPath,
    maxAge: 0,
  })
  let result = 'failed'
  try {
    const oauth = youtubeConfiguration()
    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    if (
      !oauth ||
      url.origin !== new URL(oauth.redirectUri).origin ||
      !cookie ||
      !code ||
      code.length > 2048 ||
      !state ||
      !/^[\w-]{43}$/.test(state)
    )
      throw new Error('Invalid OAuth response.')
    const proof = JSON.parse(decryptSecret(cookie, oauth.key))
    if (
      typeof proof.state !== 'string' ||
      !/^[\w-]{43}$/.test(proof.state) ||
      !timingSafeEqual(Buffer.from(state), Buffer.from(proof.state)) ||
      typeof proof.issued !== 'number' ||
      Math.abs(Date.now() - proof.issued) > 600000
    )
      throw new Error('Invalid OAuth response.')
    const payload = await getPayload({ config })
    const actor = await submissionActor(payload, request)
    if (actor.siteId !== proof.siteId || actor.memberId !== proof.memberId)
      throw new Error('Invalid OAuth actor.')
    await connectYouTube(payload, actor, code, proof.verifier)
    result = 'connected'
  } catch {
    // OAuth callback parameters and provider diagnostics never enter a response or log.
  }
  return new Response(null, {
    status: 303,
    headers: {
      ...privateHeaders,
      'referrer-policy': 'no-referrer',
      location: `/studio/external-video?youtube=${result}`,
    },
  })
}
