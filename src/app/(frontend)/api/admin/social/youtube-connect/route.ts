import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { resolveOperatorGrantContext } from '@/modules/operations/operator-grants'
import {
  youtubeAuthorizationURL,
  youtubeCallbackPath,
  youtubeConfiguration,
  youtubeVerifier,
} from '@/modules/creator-studio/youtube-metadata'
import { encryptSecret } from '@/modules/social/security'
import {
  disconnectYouTubePublishAccount,
  youtubePublishOAuthCookie,
  youtubePublishScopes,
  YouTubePublishConnectError,
} from '@/modules/social/youtube-publish-connect'
import { createYouTubePostDraft } from '@/modules/social/youtube-post'

const fail = (error: unknown) =>
  error instanceof YouTubePublishConnectError
    ? NextResponse.json({ error: error.message }, { status: error.status })
    : NextResponse.json(
        { error: error instanceof Error ? error.message : 'YouTube connection operation failed.' },
        { status: 500 },
      )

/**
 * YouTube publishing connect surface (operator-grant authorized, same
 * as the other social account admin routes):
 * - `start`: begins the per-creator Google OAuth flow for a site's
 *   publishing connection (readonly + upload scopes). The callback
 *   lands on the installation's one registered YouTube redirect path
 *   and is routed by cookie to the publish completion.
 * - `disconnect`: clears the local credential envelope AND revokes the
 *   grant at Google when a token exists.
 * - `create-post-draft`: the "Post to YouTube" action — creates a
 *   reviewable draft variant for a finished Studio video. It never
 *   approves or dispatches anything by itself.
 */
export async function POST(request: Request) {
  try {
    const payload = await getPayload({ config: configPromise })
    const auth = await payload.auth({ headers: request.headers })
    const grant = await resolveOperatorGrantContext(payload, auth?.user)
    if (!grant.authorized || !auth?.user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
    }
    const siteAuthorized = (siteId: string) =>
      grant.isGlobalOwner || grant.authorizedSiteIds.includes(siteId)

    const body = (await request.json().catch(() => ({}))) as {
      action?: 'start' | 'disconnect' | 'create-post-draft'
      siteId?: string
      accountId?: string
      mediaAssetId?: string
      title?: string
      description?: string
      privacy?: 'private' | 'unlisted' | 'public'
      madeForKids?: 'yes' | 'no'
      complianceConfirmed?: boolean
    }
    const action = body.action ?? 'start'

    if (action === 'start') {
      if (!body.siteId) return NextResponse.json({ error: 'siteId is required.' }, { status: 400 })
      if (!siteAuthorized(body.siteId))
        return NextResponse.json(
          { error: 'Forbidden. You do not have operator access to this site.' },
          { status: 403 },
        )
      const oauth = youtubeConfiguration()
      if (!oauth)
        return NextResponse.json(
          { error: 'YouTube OAuth is unavailable on this installation.' },
          { status: 503 },
        )
      const state = youtubeVerifier()
      const verifier = youtubeVerifier()
      const proof = encryptSecret(
        JSON.stringify({
          siteId: body.siteId,
          userId: String(auth.user.id),
          state,
          verifier,
          issued: Date.now(),
        }),
        oauth.key,
      )
      ;(await cookies()).set(youtubePublishOAuthCookie, proof, {
        secure: true,
        httpOnly: true,
        sameSite: 'lax',
        path: youtubeCallbackPath,
        maxAge: 600,
      })
      return NextResponse.json({
        authorizationUrl: youtubeAuthorizationURL(oauth, state, verifier, youtubePublishScopes),
        uploadsAuthorized: process.env.CREATOR_YOUTUBE_UPLOAD_AUTHORIZED === 'true',
        publicUploadsAuthorized: process.env.CREATOR_YOUTUBE_PUBLIC_UPLOADS_AUTHORIZED === 'true',
      })
    }

    if (action === 'disconnect') {
      if (!body.accountId)
        return NextResponse.json(
          { error: 'accountId is required for disconnect.' },
          { status: 400 },
        )
      const existing = await payload.findByID({
        collection: 'social-accounts',
        id: body.accountId,
        depth: 0,
        overrideAccess: true,
        disableErrors: true,
      })
      if (!existing)
        return NextResponse.json({ error: 'Social account not found.' }, { status: 404 })
      const accountSiteId = String((existing.site as { id?: unknown })?.id ?? existing.site ?? '')
      if (accountSiteId && !siteAuthorized(accountSiteId))
        return NextResponse.json(
          { error: 'Forbidden. You do not have operator access to this site.' },
          { status: 403 },
        )
      const result = await disconnectYouTubePublishAccount(payload, {
        accountId: body.accountId,
      })
      return NextResponse.json({ success: true, ...result })
    }

    if (action === 'create-post-draft') {
      if (!body.siteId || !body.mediaAssetId || !body.title)
        return NextResponse.json(
          { error: 'siteId, mediaAssetId and title are required.' },
          { status: 400 },
        )
      if (!siteAuthorized(body.siteId))
        return NextResponse.json(
          { error: 'Forbidden. You do not have operator access to this site.' },
          { status: 403 },
        )
      const result = await createYouTubePostDraft(payload, {
        siteId: body.siteId,
        mediaAssetId: body.mediaAssetId,
        title: body.title,
        description: typeof body.description === 'string' ? body.description : '',
        privacy: body.privacy ?? 'private',
        madeForKids: body.madeForKids ?? 'no',
        complianceConfirmed: body.complianceConfirmed === true,
        accountId: body.accountId,
        createdById: String(auth.user.id),
      })
      return NextResponse.json({ success: true, ...result })
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  } catch (error) {
    return fail(error)
  }
}
