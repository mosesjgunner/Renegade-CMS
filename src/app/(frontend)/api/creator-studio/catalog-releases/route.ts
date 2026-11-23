import config from '@payload-config'
import { getPayload } from 'payload'
import {
  privateHeaders,
  submissionActor,
  submissionError,
  submissionJSON,
} from '@/modules/creator-studio/submission-http'
import { MediaWorkflowError } from '@/modules/media/workflow'
import {
  createCreatorCatalogRelease,
  creatorCatalogReport,
  listCreatorCatalogReleases,
  unpublishCreatorCatalogRelease,
  publishCreatorCatalogRelease,
} from '@/modules/creator-catalog/creator-release'

export async function GET(request: Request) {
  try {
    const payload = await getPayload({ config })
    const actor = await submissionActor(payload, request)
    const release = new URL(request.url).searchParams.get('release') ?? ''
    return Response.json(
      release
        ? await creatorCatalogReport(payload, actor, release)
        : await listCreatorCatalogReleases(payload, actor),
      {
        headers: privateHeaders,
      },
    )
  } catch (error) {
    return submissionError(error)
  }
}

export async function POST(request: Request) {
  try {
    const payload = await getPayload({ config })
    const actor = await submissionActor(payload, request)
    const data = await submissionJSON(request)
    if (data.action === 'create')
      return Response.json(await createCreatorCatalogRelease(payload, actor, data), {
        status: 201,
        headers: privateHeaders,
      })
    if (data.action === 'publish' && typeof data.release === 'string')
      return Response.json(await publishCreatorCatalogRelease(payload, actor, data.release), {
        headers: privateHeaders,
      })
    if (data.action === 'withdraw' && typeof data.release === 'string')
      return Response.json(await unpublishCreatorCatalogRelease(payload, actor, data.release), {
        headers: privateHeaders,
      })
    throw new MediaWorkflowError('Select a catalog release action.')
  } catch (error) {
    return submissionError(error)
  }
}
