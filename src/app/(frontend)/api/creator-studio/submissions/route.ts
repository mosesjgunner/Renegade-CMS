import config from '@payload-config'
import { getPayload } from 'payload'
import {
  privateHeaders,
  submissionActor,
  submissionError,
  submissionJSON,
} from '@/modules/creator-studio/submission-http'
import {
  createSubmission,
  listSubmissions,
  publishedSubmissions,
} from '@/modules/creator-studio/submissions'
import { loadConfig } from '@/modules/core/config'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const payload = await getPayload({ config })
    const target = new URL(request.url).searchParams.get('target')
    const actor = await submissionActor(payload, request, target === null)
    const data =
      target === null
        ? await listSubmissions(payload, actor)
        : await publishedSubmissions(payload, actor, target)
    return Response.json(data, { headers: privateHeaders })
  } catch (error) {
    return submissionError(error)
  }
}

export async function POST(request: Request) {
  try {
    const payload = await getPayload({ config })
    const actor = await submissionActor(payload, request)
    const data = await createSubmission(payload, loadConfig(), actor, await submissionJSON(request))
    return Response.json(data, { headers: privateHeaders })
  } catch (error) {
    return submissionError(error)
  }
}
