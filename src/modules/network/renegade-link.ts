import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import type { Payload } from 'payload'
import { safeFetch } from '../core/external-boundary'
import { isConfiguredLocalPeer } from './local-peer'

/**
 * RC3-22 (#70) — Renegade-to-Renegade syndication, bounded E1 slice.
 *
 * Two installs whose operators know each other establish trust out of
 * band: each creates a `renegade-peer-links` record holding the peer's
 * origin and RSA public key, bound to exactly one local site. There is
 * no directory, no discovery, no phone-home, and no required service —
 * an install only ever talks to origins its operator typed in.
 *
 * A sender signs each envelope with its env-held private key
 * (RENEGADE_LINK_PRIVATE_KEY_PEM; private keys never enter Payload).
 * The receiver verifies the signature against the stored peer key,
 * requires the link to be active, and only then writes — onto the
 * link's site, nowhere else. Revoking a link rejects further
 * deliveries and withdraws everything it previously delivered.
 */

type PayloadLike = Payload

export const RENEGADE_LINK_PROTOCOL = 'renegade-link/1'
export const RENEGADE_LINK_PATH = '/api/network/renegade/syndicate'
const SIGNATURE_WINDOW_MS = 5 * 60_000
const MAX_TITLE_LENGTH = 300
const MAX_BODY_LENGTH = 50_000
const MAX_ITEM_ID_LENGTH = 200

export type SyndicationItem = {
  id: string
  kind: 'post'
  title: string
  body: string
  sourceUrl?: string
}

export type SyndicationEnvelope = {
  protocol: typeof RENEGADE_LINK_PROTOCOL
  kind: 'item' | 'withdraw'
  sourceOrigin: string
  item: SyndicationItem
}

export class SyndicationRejection extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'SyndicationRejection'
  }
}

const reject = (status: number, message: string): never => {
  throw new SyndicationRejection(status, message)
}

export function normalizePeerOrigin(value: unknown): string {
  if (typeof value !== 'string' || !value)
    throw new SyndicationRejection(400, 'Peer origin is required.')
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return reject(400, 'Peer origin must be a URL.')
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new SyndicationRejection(
      400,
      'Peer origin must be a bare HTTPS origin without credentials.',
    )
  return url.origin
}

export function validateSyndicationItem(value: unknown, sourceOrigin: string): SyndicationItem {
  if (!value || typeof value !== 'object')
    throw new SyndicationRejection(400, 'Syndication item is required.')
  const item = value as Record<string, unknown>
  if (typeof item.id !== 'string' || !item.id || item.id.length > MAX_ITEM_ID_LENGTH)
    throw new SyndicationRejection(400, 'Syndication item id is invalid.')
  if (item.kind !== 'post')
    throw new SyndicationRejection(400, 'Only post syndication is supported.')
  if (typeof item.title !== 'string' || !item.title || item.title.length > MAX_TITLE_LENGTH)
    throw new SyndicationRejection(400, 'Syndication item title is invalid.')
  if (typeof item.body !== 'string' || !item.body || item.body.length > MAX_BODY_LENGTH)
    throw new SyndicationRejection(400, 'Syndication item body is invalid.')
  let sourceUrl: string | undefined
  if (item.sourceUrl !== undefined && item.sourceUrl !== null && item.sourceUrl !== '') {
    if (typeof item.sourceUrl !== 'string')
      throw new SyndicationRejection(400, 'Syndication item sourceUrl is invalid.')
    let parsed: URL
    try {
      parsed = new URL(item.sourceUrl)
    } catch {
      return reject(400, 'Syndication item sourceUrl must be a URL.')
    }
    // A peer may only cite URLs on its own origin; foreign URLs are how
    // syndicated content would smuggle in someone else's authority.
    if (parsed.origin !== sourceOrigin)
      throw new SyndicationRejection(
        400,
        'Syndication item sourceUrl must be on the source origin.',
      )
    sourceUrl = parsed.toString()
  }
  return {
    id: item.id as string,
    kind: 'post',
    title: item.title as string,
    body: item.body as string,
    ...(sourceUrl ? { sourceUrl } : {}),
  }
}

export function parseSyndicationEnvelope(rawBody: string): SyndicationEnvelope {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return reject(400, 'Syndication envelope must be JSON.')
  }
  if (!parsed || typeof parsed !== 'object')
    throw new SyndicationRejection(400, 'Syndication envelope is required.')
  const envelope = parsed as Record<string, unknown>
  if (envelope.protocol !== RENEGADE_LINK_PROTOCOL)
    throw new SyndicationRejection(400, 'Unsupported syndication protocol.')
  if (envelope.kind !== 'item' && envelope.kind !== 'withdraw')
    throw new SyndicationRejection(400, 'Unsupported syndication kind.')
  const sourceOrigin = normalizePeerOrigin(envelope.sourceOrigin)
  const item = validateSyndicationItem(envelope.item, sourceOrigin)
  return {
    protocol: RENEGADE_LINK_PROTOCOL,
    kind: envelope.kind,
    sourceOrigin,
    item,
  }
}

const signingString = (date: string, rawBody: string) =>
  `${RENEGADE_LINK_PROTOCOL}\n${date}\n${createHash('sha256').update(rawBody).digest('hex')}`

export function signSyndicationRequest(privateKeyPem: string, rawBody: string, date = new Date()) {
  const dateHeader = date.toISOString()
  const signature = sign(
    'RSA-SHA256',
    Buffer.from(signingString(dateHeader, rawBody)),
    createPrivateKey(privateKeyPem),
  ).toString('base64')
  return { date: dateHeader, signature }
}

export function verifySyndicationRequest(
  publicKeyPem: string,
  input: { rawBody: string; date: string; signature: string },
  now = new Date(),
): boolean {
  const signedAt = Date.parse(input.date)
  if (!Number.isFinite(signedAt) || Math.abs(now.getTime() - signedAt) > SIGNATURE_WINDOW_MS)
    return false
  try {
    return verify(
      'RSA-SHA256',
      Buffer.from(signingString(input.date, input.rawBody)),
      createPublicKey(publicKeyPem),
      Buffer.from(input.signature, 'base64'),
    )
  } catch {
    return false
  }
}

async function audit(
  payload: PayloadLike,
  action: string,
  subject: string,
  details: Record<string, unknown> = {},
) {
  try {
    await payload.create({
      collection: 'network-audit-events',
      data: { action, subject, details },
      overrideAccess: true,
    })
  } catch {
    // Audit must never turn a decided rejection into a 500; the outcome
    // of the delivery itself is already determined by the caller.
  }
}

type PeerLinkDoc = {
  id: string
  peerOrigin: string
  site: unknown
  peerPublicKey: string
  state: string
}

const relationId = (value: unknown): string =>
  typeof value === 'object' && value && 'id' in value
    ? String((value as { id: unknown }).id)
    : String(value)

export async function receiveSyndication(
  payload: PayloadLike,
  input: { headers: Headers; rawBody: string },
): Promise<{ accepted: true; outcome: string }> {
  const claimedOrigin = input.headers.get('x-renegade-origin') ?? ''
  const date = input.headers.get('x-renegade-date') ?? ''
  const signature = input.headers.get('x-renegade-signature') ?? ''
  if (!claimedOrigin || !date || !signature)
    throw new SyndicationRejection(401, 'Syndication delivery is not authenticated.')
  const envelope = parseSyndicationEnvelope(input.rawBody)
  if (envelope.sourceOrigin !== claimedOrigin)
    throw new SyndicationRejection(401, 'Syndication origin does not match the envelope.')
  const links = await payload.find({
    collection: 'renegade-peer-links',
    where: { peerOrigin: { equals: envelope.sourceOrigin } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const link = links.docs[0] as unknown as PeerLinkDoc | undefined
  if (!link) throw new SyndicationRejection(401, 'Syndication peer is not trusted by this install.')
  if (link.state !== 'active') {
    await audit(payload, 'renegade.delivery_rejected', link.peerOrigin, {
      reason: 'link-revoked',
      kind: envelope.kind,
      sourceItemId: envelope.item.id,
    })
    throw new SyndicationRejection(401, 'Syndication link has been revoked.')
  }
  if (
    !verifySyndicationRequest(link.peerPublicKey, {
      rawBody: input.rawBody,
      date,
      signature,
    })
  ) {
    await audit(payload, 'renegade.delivery_rejected', link.peerOrigin, {
      reason: 'bad-signature',
      kind: envelope.kind,
      sourceItemId: envelope.item.id,
    })
    throw new SyndicationRejection(401, 'Syndication signature is invalid.')
  }

  const dedupeKey = `${link.peerOrigin}|${envelope.item.id}`
  const existing = await payload.find({
    collection: 'syndicated-items',
    where: { dedupeKey: { equals: dedupeKey } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const existingItem = existing.docs[0] as { id: string; state: string } | undefined

  if (envelope.kind === 'withdraw') {
    if (existingItem && existingItem.state !== 'withdrawn')
      await payload.update({
        collection: 'syndicated-items',
        id: existingItem.id,
        data: { state: 'withdrawn' },
        overrideAccess: true,
      })
    await audit(payload, 'renegade.item_withdrawn', link.peerOrigin, {
      sourceItemId: envelope.item.id,
      found: Boolean(existingItem),
    })
    return { accepted: true, outcome: existingItem ? 'withdrawn' : 'withdrawn-not-found' }
  }

  const data = {
    link: link.id,
    site: relationId(link.site),
    sourceItemId: envelope.item.id,
    dedupeKey,
    kind: envelope.item.kind,
    title: envelope.item.title,
    body: envelope.item.body,
    sourceUrl: envelope.item.sourceUrl ?? null,
    state: 'received' as const,
    receivedAt: new Date().toISOString(),
  }
  if (existingItem) {
    await payload.update({
      collection: 'syndicated-items',
      id: existingItem.id,
      data,
      overrideAccess: true,
    })
    await audit(payload, 'renegade.item_updated', link.peerOrigin, {
      sourceItemId: envelope.item.id,
    })
    return { accepted: true, outcome: 'updated' }
  }
  await payload.create({ collection: 'syndicated-items', data, overrideAccess: true } as never)
  await audit(payload, 'renegade.item_received', link.peerOrigin, {
    sourceItemId: envelope.item.id,
  })
  return { accepted: true, outcome: 'received' }
}

/**
 * Revoking a link is the receiver's enforcement, applied locally and
 * immediately: the link stops accepting deliveries, and every item it
 * previously delivered is withdrawn from the read path.
 */
export async function revokePeerLink(payload: PayloadLike, linkId: string) {
  const link = (await payload.findByID({
    collection: 'renegade-peer-links',
    id: linkId,
    depth: 0,
    overrideAccess: true,
  })) as unknown as PeerLinkDoc
  if (link.state !== 'revoked')
    await payload.update({
      collection: 'renegade-peer-links',
      id: link.id,
      data: { state: 'revoked', revokedAt: new Date().toISOString() },
      overrideAccess: true,
    })
  const withdrawn = await payload.update({
    collection: 'syndicated-items',
    where: {
      and: [{ link: { equals: link.id } }, { state: { equals: 'received' } }],
    },
    data: { state: 'withdrawn' },
    overrideAccess: true,
  })
  const withdrawnCount = Array.isArray(withdrawn?.docs) ? withdrawn.docs.length : 0
  await audit(payload, 'renegade.link_revoked', link.peerOrigin, { withdrawnCount })
  return { link, withdrawnCount }
}

/** The public read path for syndicated content: active receipts only. */
export async function listSyndicatedItems(payload: PayloadLike, siteId: string) {
  const result = await payload.find({
    collection: 'syndicated-items',
    where: {
      and: [{ site: { equals: siteId } }, { state: { equals: 'received' } }],
    },
    sort: '-receivedAt',
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  return result.docs
}

export async function resolveInstallOrigin(payload: PayloadLike): Promise<string> {
  const settings = (await payload.findGlobal({
    slug: 'network-settings',
    overrideAccess: true,
  })) as { canonicalOrigin?: string }
  if (settings.canonicalOrigin) return normalizePeerOrigin(settings.canonicalOrigin)
  if (process.env.APP_URL) return normalizePeerOrigin(process.env.APP_URL)
  throw new Error('Install origin is not configured (network settings canonicalOrigin or APP_URL).')
}

export type SyndicationTransport = (url: string, init: RequestInit) => Promise<Response>

const defaultTransport: SyndicationTransport = async (url, init) =>
  safeFetch(
    url,
    { ...init, method: 'POST' },
    {
      allowPrivate:
        process.env.NETWORK_ALLOW_PRIVATE_DEVELOPMENT === 'true' || isConfiguredLocalPeer(url),
      maxRedirects: 0,
      retries: 0,
    },
  )

export async function sendSyndication(
  payload: PayloadLike,
  input: {
    linkId: string
    kind: 'item' | 'withdraw'
    item: SyndicationItem
    transport?: SyndicationTransport
  },
) {
  const link = (await payload.findByID({
    collection: 'renegade-peer-links',
    id: input.linkId,
    depth: 0,
    overrideAccess: true,
  })) as unknown as PeerLinkDoc
  if (link.state !== 'active') throw new Error('Syndication link is not active; refusing to send.')
  const sourceOrigin = await resolveInstallOrigin(payload)
  const validated = validateSyndicationItem(input.item, sourceOrigin)
  const envelope: SyndicationEnvelope = {
    protocol: RENEGADE_LINK_PROTOCOL,
    kind: input.kind,
    sourceOrigin,
    item: validated,
  }
  const rawBody = JSON.stringify(envelope)
  const privateKeyPem = process.env.RENEGADE_LINK_PRIVATE_KEY_PEM?.replace(/\\n/g, '\n')
  if (!privateKeyPem)
    throw new Error('RENEGADE_LINK_PRIVATE_KEY_PEM is not configured; cannot sign syndication.')
  const { date, signature } = signSyndicationRequest(privateKeyPem, rawBody)
  const transport = input.transport ?? defaultTransport
  const response = await transport(`${link.peerOrigin}${RENEGADE_LINK_PATH}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-renegade-origin': sourceOrigin,
      'x-renegade-date': date,
      'x-renegade-signature': signature,
    },
    body: rawBody,
  })
  if (!response.ok)
    throw new Error(
      `Peer refused syndication delivery (${response.status}): ${await response
        .text()
        .then((text) => text.slice(0, 300))
        .catch(() => '')}`,
    )
  return response.json().catch(() => ({ accepted: true })) as Promise<{
    accepted: boolean
    outcome?: string
  }>
}
