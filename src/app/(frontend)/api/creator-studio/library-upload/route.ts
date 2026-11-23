import config from '@payload-config'
import { getPayload } from 'payload'
import {
  privateHeaders,
  submissionActor,
  submissionError,
} from '@/modules/creator-studio/submission-http'
import { MediaWorkflowError } from '@/modules/media/workflow'
import { uploadPrivateStudioFile } from '@/modules/creator-studio/studio-upload'

export async function POST(request: Request) {
  try {
    const payload = await getPayload({ config })
    const actor = await submissionActor(payload, request)
    const id = await uploadPrivateStudioFile(payload, actor, request)
    return Response.json(id, { status: 201, headers: privateHeaders })
  } catch (error) {
    if (!(error instanceof MediaWorkflowError)) console.error('Studio library upload failed', error)
    return submissionError(error)
  }
}
