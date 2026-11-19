/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { loadConfig } from '@/modules/core/config'
import {
  buildOEmbedResponse,
  episodeEmbedState,
  episodeSlugFromEmbedRequestUrl,
} from '@/modules/podcast-studio/embed'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POD-18 (POD-REQ-40): oEmbed discovery endpoint.
 * GET /api/oembed?url=<canonical episode URL>&format=json
 * Returns the oEmbed 1.0 rich document whose `html` is the iframe
 * for the chrome-free embed route. Members-only episodes return the
 * same document shape — the iframe renders the locked player, and
 * no audio URL appears anywhere in the response.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const format = searchParams.get('format') ?? 'json'
  if (format !== 'json') {
    return NextResponse.json({ error: 'Only format=json is supported.' }, { status: 501 })
  }
  const url = searchParams.get('url') ?? ''
  const slug = episodeSlugFromEmbedRequestUrl(url)
  if (!slug) {
    return NextResponse.json({ error: 'A podcast episode URL is required.' }, { status: 400 })
  }
  const payload = await getPayload({ config: configPromise })
  const result = await payload.find({
    collection: 'podcast-episodes',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
    overrideAccess: true,
  } as never)
  const episode = result.docs[0] as any
  if (!episode) return NextResponse.json({ error: 'Episode not found.' }, { status: 404 })
  const show = typeof episode.show === 'object' && episode.show !== null ? episode.show : null
  if (episodeEmbedState(episode, show) === 'unavailable') {
    return NextResponse.json({ error: 'Episode not found.' }, { status: 404 })
  }
  const origin = loadConfig().appUrl
  return NextResponse.json(buildOEmbedResponse({ origin, episode, show }), {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  })
}
