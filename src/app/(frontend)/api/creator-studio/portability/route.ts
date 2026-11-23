import config from '@payload-config'
import { getPayload } from 'payload'
import {
  privateHeaders,
  submissionActor,
  submissionError,
} from '@/modules/creator-studio/submission-http'
import { exportStudioIndex } from '@/modules/creator-studio/studio-portability'

export async function GET(request: Request) {
  try {
    const payload = await getPayload({ config })
    return Response.json(
      await exportStudioIndex(payload, await submissionActor(payload, request)),
      {
        headers: {
          ...privateHeaders,
          'content-disposition': 'attachment; filename="my-studio-index.json"',
        },
      },
    )
  } catch (error) {
    return submissionError(error)
  }
}
