import config from '@payload-config'
import { getPayload } from 'payload'
import { receiveSyndication, SyndicationRejection } from '@/modules/network/renegade-link'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_ENVELOPE_BYTES = 256_000

async function readBoundedBody(request: Request): Promise<string> {
  const reader = request.body?.getReader()
  if (!reader) throw new SyndicationRejection(400, 'Syndication body is required.')
  const chunks: Uint8Array[] = []
  let bytes = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > MAX_ENVELOPE_BYTES)
      throw new SyndicationRejection(413, 'Syndication envelope exceeds the size limit.')
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * RC3-22 (#70): the Renegade-to-Renegade syndication inbox. Authentication
 * is the peer-link signature, not a user session: the sender signs the
 * envelope with the private key matching the public key this install's
 * operator stored on the link record. Anything unverifiable, untrusted,
 * or revoked fails closed before any write.
 */
export async function POST(request: Request) {
  try {
    const rawBody = await readBoundedBody(request)
    const payload = await getPayload({ config })
    const result = await receiveSyndication(payload as never, {
      headers: request.headers,
      rawBody,
    })
    return Response.json(result, { status: 202 })
  } catch (error) {
    if (error instanceof SyndicationRejection)
      return Response.json({ error: error.message }, { status: error.status })
    console.error('RENEGADE SYNDICATION ERROR:', error)
    return Response.json({ error: 'Syndication delivery rejected.' }, { status: 401 })
  }
}
