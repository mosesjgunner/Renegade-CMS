import config from '@payload-config'
import { getPayload } from 'payload'
import { submissionActor, submissionError } from '@/modules/creator-studio/submission-http'
import { creatorCatalogDownload } from '@/modules/creator-catalog/creator-release'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; asset: string }> },
) {
  try {
    const payload = await getPayload({ config })
    const actor = await submissionActor(payload, request)
    const { id, asset } = await context.params
    return await creatorCatalogDownload(payload, actor, id, asset)
  } catch (error) {
    return submissionError(error)
  }
}
