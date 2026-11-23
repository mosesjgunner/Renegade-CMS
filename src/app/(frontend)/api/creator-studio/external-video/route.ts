import { createCreatorSpace } from '@/modules/creator-studio/workspace'
import { downloadVideoExport } from '@/modules/creator-studio/video-export'
import config from '@payload-config'
import { getPayload } from 'payload'
import { cookies } from 'next/headers'
import { encryptSecret } from '@/modules/social/security'
import { MediaWorkflowError } from '@/modules/media/workflow'
import { authorizeCreator } from '@/modules/creator-studio/policy'
import {
  addManualVideo,
  detachVideo,
  disconnectYouTube,
  importYouTube,
  listExternalVideos,
  syncYouTube,
  youtubeCatalog,
} from '@/modules/creator-studio/external-video'
import {
  privateHeaders,
  submissionActor,
  submissionError,
  submissionJSON,
} from '@/modules/creator-studio/submission-http'
import {
  isManualProvider,
  videoProviders,
  youtubeVideoId,
} from '@/modules/creator-studio/video-providers'
import {
  YouTubeError,
  youtubeAuthorizationURL,
  youtubeCallbackPath,
  youtubeConfiguration,
  youtubeVerifier,
} from '@/modules/creator-studio/youtube-metadata'
import { uuid } from '@/modules/creator-studio/submission-targets'

const invalid = () => new MediaWorkflowError('Enter valid external video details.', 400)
const json = (data: object) => Response.json(data, { headers: privateHeaders })

export async function GET(request: Request) {
  try {
    const payload = await getPayload({ config })
    const actor = await submissionActor(payload, request)
    const download = new URL(request.url).searchParams.get('download')
    if (download) return await downloadVideoExport(payload, actor, download)
    return json({ ...(await listExternalVideos(payload, actor)), capabilities: videoProviders })
  } catch (error) {
    return submissionError(error)
  }
}

export async function POST(request: Request) {
  try {
    const payload = await getPayload({ config })
    const actor = await submissionActor(payload, request)
    const input = await submissionJSON(request)
    const { action, spaceId, externalId, id } = input
    const title = typeof input.title === 'string' ? input.title.trim() : ''
    if (title.length > 200) throw invalid()
    if (action === 'connect') {
      await authorizeCreator(payload, { ...actor, capability: 'provider.connect' }).catch(() => {
        throw new MediaWorkflowError('External provider access denied.', 403)
      })
      const oauth = youtubeConfiguration()
      if (!oauth || new URL(request.url).origin !== new URL(oauth.redirectUri).origin)
        throw new MediaWorkflowError('YouTube OAuth is unavailable on this site.', 503)
      const state = youtubeVerifier()
      const verifier = youtubeVerifier()
      const proof = encryptSecret(
        JSON.stringify({ ...actor, state, verifier, issued: Date.now() }),
        oauth.key,
      )
      ;(await cookies()).set('creator-youtube-oauth', proof, {
        secure: true,
        httpOnly: true,
        sameSite: 'lax',
        path: youtubeCallbackPath,
        maxAge: 600,
      })
      return json({ authorizationUrl: youtubeAuthorizationURL(oauth, state, verifier) })
    }
    if (action === 'disconnect') return json(await disconnectYouTube(payload, actor))
    if (action === 'catalog') {
      const cursor = input.cursor
      if (cursor != null && (typeof cursor !== 'string' || !/^[\w=.-]{1,500}$/.test(cursor)))
        throw invalid()
      return json(await youtubeCatalog(payload, actor, cursor ?? undefined))
    }
    if (action === 'sync' && typeof id === 'string')
      return json(await syncYouTube(payload, actor, id))
    if (action === 'detach' && typeof id === 'string') {
      await detachVideo(payload, actor, id)
      return json({ detached: true })
    }
    if (spaceId !== undefined && (typeof spaceId !== 'string' || !uuid.test(spaceId)))
      throw invalid()
    const ownedSpace = async () => {
      if (typeof spaceId === 'string') return spaceId
      await authorizeCreator(payload, { ...actor, capability: 'provider.connect' })
      await authorizeCreator(payload, { ...actor, capability: 'content.draft-own' })
      return createCreatorSpace(payload, actor.siteId, actor.memberId)
    }
    if (action === 'import' && typeof externalId === 'string' && youtubeVideoId.test(externalId))
      return json(
        await importYouTube(payload, actor, { spaceId: await ownedSpace(), externalId, title }),
      )
    if (
      action === 'manual' &&
      isManualProvider(input.provider) &&
      typeof input.url === 'string' &&
      title
    )
      return json(
        await addManualVideo(payload, actor, {
          spaceId: await ownedSpace(),
          title,
          provider: input.provider,
          url: input.url,
        }),
      )
    throw invalid()
  } catch (error) {
    if (error instanceof YouTubeError) {
      const status = { revoked: 409, scope: 403, claim: 403, quota: 429, unavailable: 502 }[
        error.kind
      ]
      return submissionError(new MediaWorkflowError(error.message, status))
    }
    return submissionError(error)
  }
}
