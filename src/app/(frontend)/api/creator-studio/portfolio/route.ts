import config from '@payload-config'
import { getPayload } from 'payload'
import { readBoundedUploadBody } from '@/modules/media/upload-staging'
import { MediaWorkflowError } from '@/modules/media/workflow'
import { submissionActor, privateHeaders } from '@/modules/creator-studio/submission-http'
import { exportPortfolio, importPortfolio } from '@/modules/creator-studio/portfolio-portability'
import { listPortfolios, ownPortfolio, portfolioCollection, portfolioEditorEntry, savePortfolio } from '@/modules/creator-studio/portfolio-service'
import { PortfolioError, record } from '@/modules/creator-studio/portfolio-validation'

function failure(error: unknown) {
  const known = error instanceof PortfolioError || error instanceof MediaWorkflowError
  if (!known) console.error('Creator portfolio request failed', error)
  return Response.json({ error: known ? error.message : 'Portfolio request failed. Please retry.' },
    { status: known ? error.status : 500, headers: privateHeaders })
}

export async function GET(request: Request) {
  try {
    const payload = await getPayload({ config })
    const actor = await submissionActor(payload, request)
    const params = new URL(request.url).searchParams
    const id = params.get('id')
    if (!id) return Response.json(await listPortfolios(payload, actor), { headers: privateHeaders })
    const collection = portfolioCollection(params.get('collection'))
    if (params.has('export')) {
      return Response.json(await exportPortfolio(payload, actor, collection, id), {
        headers: { ...privateHeaders, 'content-disposition': 'attachment; filename="renegade-portfolio.json"' },
      })
    }
    const doc = await ownPortfolio(payload, actor, collection, id)
    return Response.json(portfolioEditorEntry(doc, collection), { headers: privateHeaders })
  } catch (error) {
    return failure(error)
  }
}

export async function POST(request: Request) {
  try {
    const payload = await getPayload({ config })
    const actor = await submissionActor(payload, request)
    const bytes = await readBoundedUploadBody(request, 2 * 1024 * 1024)
    let data: Record<string, unknown>
    try { data = record(JSON.parse(bytes.toString('utf8'))) }
    catch { throw new PortfolioError('Invalid portfolio request.') }
    if (data.action === 'import')
      return Response.json(await importPortfolio(payload, actor, data.bundle), { headers: privateHeaders })
    if (!['save', 'publish', 'unpublish'].includes(String(data.action)))
      throw new PortfolioError('Select a valid portfolio action.')
    return Response.json(await savePortfolio(payload, actor, data), { headers: privateHeaders })
  } catch (error) {
    return failure(error)
  }
}
