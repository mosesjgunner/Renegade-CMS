import config from '@payload-config'
import { getPayload } from 'payload'
import { loadConfig } from '@/modules/core/config'
import {
  privateHeaders,
  streamSubmissionFile,
  submissionActor,
  submissionError,
  submissionJSON,
} from '@/modules/creator-studio/submission-http'
import {
  cancelSubmission,
  finalizeSubmission,
  readSubmission,
  submissionFile,
  updateSubmission,
  writeSubmissionChunk,
} from '@/modules/creator-studio/submissions'
import { readBoundedUploadBody, uploadChunkLimit } from '@/modules/media/upload-staging'
import { MediaWorkflowError } from '@/modules/media/workflow'

export const runtime = 'nodejs'
type Context = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Context) {
  try {
    const payload = await getPayload({ config })
    const query = new URL(request.url).searchParams
    const status = query.has('status')
    const preview = query.has('preview')
    const actor = await submissionActor(payload, request, preview || status)
    const { id } = await params
    if (status)
      return Response.json(await readSubmission(payload, actor, id), { headers: privateHeaders })
    return streamSubmissionFile(
      request,
      await submissionFile(payload, loadConfig(), actor, id, preview),
    )
  } catch (error) {
    return submissionError(error)
  }
}
export const HEAD = GET

export async function PATCH(request: Request, { params }: Context) {
  try {
    const payload = await getPayload({ config })
    const actor = await submissionActor(payload, request)
    const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(request.headers.get('content-range') ?? '')
    const index = request.headers.get('x-upload-chunk-index') ?? ''
    if (!range || !/^\d+$/.test(index))
      throw new MediaWorkflowError('Chunk index and range are required.')
    const [start, end, total] = range.slice(1).map(Number)
    const length = end - start + 1
    if (
      ![start, end, total, length].every(Number.isSafeInteger) ||
      length < 1 ||
      length > uploadChunkLimit
    )
      throw new MediaWorkflowError('Chunk exceeds the allowed size.', 413)
    const data = await writeSubmissionChunk(
      payload,
      loadConfig(),
      actor,
      (await params).id,
      { index: Number(index), start, end, total },
      () => readBoundedUploadBody(request, uploadChunkLimit, length),
    )
    return Response.json(data, { headers: privateHeaders })
  } catch (error) {
    return submissionError(error)
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const payload = await getPayload({ config })
    const actor = await submissionActor(payload, request)
    const input = await submissionJSON(request)
    const { id } = await params
    const data =
      input.action === 'finalize'
        ? await finalizeSubmission(payload, loadConfig(), actor, id)
        : await updateSubmission(payload, actor, id, input)
    return Response.json(data, { headers: privateHeaders })
  } catch (error) {
    return submissionError(error)
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const payload = await getPayload({ config })
    const actor = await submissionActor(payload, request)
    await cancelSubmission(payload, loadConfig(), actor, (await params).id)
    return new Response(null, { status: 204, headers: privateHeaders })
  } catch (error) {
    return submissionError(error)
  }
}
