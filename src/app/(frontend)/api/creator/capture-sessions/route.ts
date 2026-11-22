import config from '@payload-config'
import { getPayload } from 'payload'
import { loadConfig } from '@/modules/core/config'
import {
  createRecording,
  discardRecording,
  finalizeRecording,
  listRecordings,
  playRecording,
  sealRecording,
  writeRecordingChunk,
} from '@/modules/creator-studio/capture-service'
import {
  privateHeaders,
  submissionActor,
  submissionError,
  submissionJSON,
} from '@/modules/creator-studio/submission-http'
import { readBoundedUploadBody } from '@/modules/media/upload-staging'

export const runtime = 'nodejs'

async function route(request: Request) {
  try {
    const payload = await getPayload({ config })
    const actor = await submissionActor(payload, request)
    const app = loadConfig()
    const query = new URL(request.url).searchParams
    const id = query.get('id')
    const { method } = request
    if (method === 'GET' || method === 'HEAD') {
      if (id) return await playRecording(payload, app, actor, id, request)
      return Response.json(await listRecordings(payload, actor), { headers: privateHeaders })
    }
    if (method === 'POST') {
      const body = await submissionJSON(request)
      const result = id
        ? query.has('seal')
          ? await sealRecording(payload, actor, id, body)
          : await finalizeRecording(payload, app, actor, id, body)
        : await createRecording(payload, app, actor, body)
      return Response.json(result, { headers: privateHeaders })
    }
    if (id && method === 'PATCH') {
      const result = await writeRecordingChunk(payload, app, actor, id, request.headers, (size) =>
        readBoundedUploadBody(request, size, size),
      )
      return Response.json(result, { headers: privateHeaders })
    }
    if (id && method === 'DELETE') {
      await discardRecording(payload, actor, id)
      return new Response(null, { status: 204, headers: privateHeaders })
    }
    return new Response(null, { status: 400, headers: privateHeaders })
  } catch (error) {
    return submissionError(error)
  }
}

export { route as GET, route as HEAD, route as POST, route as PATCH, route as DELETE }
