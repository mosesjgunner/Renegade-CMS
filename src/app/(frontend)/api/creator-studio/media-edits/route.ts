import {
  exportEditBundle,
  importEditBundle,
  portableAsset,
} from '@/modules/creator-studio/edit-portability'
import config from '@payload-config'
import { getPayload } from 'payload'
import { loadConfig } from '@/modules/core/config'
import { mediaStorage } from '@/modules/media/storage'
import { parseByteRange } from '@/modules/media/range-serving'
import { readBoundedUploadBody } from '@/modules/media/upload-staging'
import { MediaWorkflowError } from '@/modules/media/workflow'
import { privateHeaders, submissionActor } from '@/modules/creator-studio/submission-http'
import {
  createEditProject,
  editNotFound,
  editProjectView,
  listEditProjects,
  listEditSources,
  ownEditProject,
  ownedEditSource,
  requireEdit,
  saveEditProject,
} from '@/modules/creator-studio/media-edit-projects'
import { listEditExports, queueEditExport } from '@/modules/creator-studio/media-edit-exports'
import { captionSource, captionAction } from '@/modules/creator-studio/media-edit-captions'
import { dubAudio } from '@/modules/creator-studio/synthetic-dub'
import { saveEditedStill } from '@/modules/creator-studio/media-edit-stills'

export const runtime = 'nodejs'
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: privateHeaders })
function failure(error: unknown) {
  if (error instanceof MediaWorkflowError) return json({ error: error.message }, error.status)
  console.error('Creator media edit request failed', error)
  return json({ error: 'Media edit request failed. Please retry.' }, 500)
}

export async function GET(request: Request) {
  try {
    const payload = await getPayload({ config })
    const actor = await submissionActor(payload, request)
    await requireEdit(payload, actor)
    const params = new URL(request.url).searchParams
    const id = params.get('id')
    const dub = params.get('dub')
    if (dub) return await dubAudio(payload, actor, dub, params.has('download'))
    const asset = params.get('asset')
    if (asset && params.has('transcript')) return json(await captionSource(payload, actor, asset))
    if (asset) {
      const { dependency, key } = await (params.has('portable') ? portableAsset : ownedEditSource)(
        payload,
        actor,
        asset,
      )
      const { size, mimeType } = dependency
      const range = parseByteRange(request.headers.get('range'), size)
      const headers = new Headers({
        ...privateHeaders,
        'content-type': mimeType,
        'accept-ranges': 'bytes',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
      })
      if (range === null) {
        headers.set('content-range', `bytes */${size}`)
        return new Response(null, { status: 416, headers })
      }
      const { from, to } = range ?? { from: 0, to: size - 1 }
      if (range) headers.set('content-range', `bytes ${from}-${to}/${size}`)
      if (params.has('download')) {
        const extension =
          mimeType === 'image/jpeg'
            ? 'jpg'
            : mimeType === 'audio/mpeg'
              ? 'mp3'
              : mimeType === 'audio/mp4'
                ? 'm4a'
                : mimeType === 'audio/x-wav'
                  ? 'wav'
                  : mimeType.split('/')[1] || 'bin'
        headers.set(
          'content-disposition',
          `attachment; filename="creator-edit-${asset}.${extension}"`,
        )
      }
      headers.set('content-length', String(to - from + 1))
      const stream =
        request.method === 'HEAD' ? null : await mediaStorage(loadConfig()).open(key, from, to)
      if (!stream && request.method !== 'HEAD') throw editNotFound()
      return new Response(stream, { status: range ? 206 : 200, headers })
    }
    if (id && params.has('bundle'))
      return Response.json(await exportEditBundle(payload, actor, id), {
        headers: {
          ...privateHeaders,
          'content-disposition': 'attachment; filename="studio-project.json"',
        },
      })
    if (id && params.has('exports')) return json(await listEditExports(payload, actor, id))
    if (id) return json(editProjectView(await ownEditProject(payload, actor, id)))
    const [projects, sources] = await Promise.all([
      listEditProjects(payload, actor),
      listEditSources(payload, actor),
    ])
    return json({ projects, sources })
  } catch (error) {
    return failure(error)
  }
}

export const HEAD = GET

export async function POST(request: Request) {
  try {
    const payload = await getPayload({ config })
    const actor = await submissionActor(payload, request)
    await requireEdit(payload, actor)
    const params = new URL(request.url).searchParams
    const id = params.get('id')
    const asset = params.get('still')
    if (id && asset)
      return json(await saveEditedStill(payload, loadConfig(), actor, id, asset, request), 201)
    const bytes = await readBoundedUploadBody(request, 256 * 1024)
    let input: Record<string, unknown>
    try {
      input = JSON.parse(bytes.toString('utf8'))
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error()
    } catch {
      throw new MediaWorkflowError('Invalid media edit request.')
    }
    const transcript = params.get('transcript')
    if (transcript) return json(await captionAction(payload, actor, transcript, input))
    if (input.action === 'import')
      return json(await importEditBundle(payload, actor, input.bundle), 201)
    if (input.action === 'create') return json(await createEditProject(payload, actor), 201)
    if (!id) throw editNotFound()
    if (input.action === 'export')
      return json(await queueEditExport(payload, actor, id, input), 202)
    if (['save', 'undo', 'redo'].includes(String(input.action)))
      return json(await saveEditProject(payload, actor, id, input))
    throw new MediaWorkflowError('Select a media edit action.')
  } catch (error) {
    return failure(error)
  }
}
