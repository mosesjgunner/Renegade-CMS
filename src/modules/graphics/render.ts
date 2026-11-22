/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RC3-18 — Graphics Studio render + approval path.
 *
 * `createGraphicDerivative` (service.ts) has always produced the design
 * side of a graphic: a graphic-document plus a media-derivative row in
 * `pending`. Nothing ever turned that recipe into bytes, so a graphic
 * could never actually be published. This module is the missing middle:
 *
 *   renderGraphicDerivative — composite the source asset with the
 *     recipe's text treatment via sharp, persist the result as a new
 *     media asset (kind `graphic`) and link it as the derivative's
 *     `asset`. The source asset is never modified. Rights are re-checked
 *     at render time: an asset whose rights lapsed since the derivative
 *     was created cannot be rendered.
 *   approveGraphicDerivative — the human approval boundary. Only a
 *     rendered derivative can be approved, and rights are re-checked
 *     again, so an approved graphic is always backed by a live licence.
 *
 * Both operations are idempotent: re-rendering a derivative that
 * already has an output returns the existing output, and re-approving
 * an approved derivative is a no-op.
 */
import { createHash } from 'node:crypto'
import type { Payload } from 'payload'
import sharp from 'sharp'

import { loadConfig } from '../core/config'
import { mediaObjectKey, mediaStorage } from '../media/storage'
import { recordMediaUsage } from '../media/usage'
import { mediaRightsIssue, type DamMetadata } from '../media/workflow'

type Doc = Record<string, any>

const id = (value: unknown): string => String((value as { id?: string } | null)?.id ?? value ?? '')

const escapeXml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const wrapText = (text: string, maxChars: number, maxLines: number): string[] => {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  let placed = 0
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (candidate.length > maxChars && line) {
      lines.push(line)
      line = word
      placed += 1
      if (lines.length === maxLines) break
    } else {
      line = candidate
      placed += 1
    }
  }
  if (line && lines.length < maxLines) {
    lines.push(line)
    placed += 1
  }
  if (!lines.length) return ['']
  // Words that did not fit are marked with an ellipsis on the last line.
  if (placed < words.length) lines[lines.length - 1] = `${lines[lines.length - 1]}…`
  return lines
}

/** Pure overlay builder: a lower-third band with the recipe text. */
export function graphicOverlaySvg(input: { width: number; height: number; text: string }): Buffer {
  const { width, height } = input
  const fontSize = Math.max(24, Math.round(width * 0.042))
  const lineHeight = Math.round(fontSize * 1.25)
  const maxChars = Math.max(12, Math.floor(width / (fontSize * 0.52)))
  const lines = wrapText(input.text, maxChars, 3)
  const bandHeight = Math.min(
    height,
    Math.round(height * 0.16) + lines.length * lineHeight + Math.round(fontSize * 0.6),
  )
  const firstBaseline = height - bandHeight + fontSize + Math.round(fontSize * 0.35)
  const tspans = lines
    .map(
      (line, index) =>
        `<tspan x="60" ${index === 0 ? `y="${firstBaseline}"` : `dy="${lineHeight}"`}>${escapeXml(line)}</tspan>`,
    )
    .join('')
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="${height - bandHeight}" width="${width}" height="${bandHeight}" fill="#000000" fill-opacity="0.55"/><text font-family="sans-serif" font-size="${fontSize}" font-weight="bold" fill="#ffffff">${tspans}</text></svg>`
  return Buffer.from(svg)
}

async function loadDerivative(payload: Payload, derivativeId: string): Promise<Doc> {
  const derivative = (await payload
    .findByID({
      collection: 'media-derivatives',
      id: derivativeId,
      depth: 0,
      overrideAccess: true,
    } as never)
    .catch(() => null)) as Doc | null
  if (!derivative) throw new Error('Graphic derivative not found.')
  return derivative
}

async function appendDocumentHistory(
  payload: Payload,
  documentId: string,
  entry: Doc,
): Promise<void> {
  const document = (await payload.findByID({
    collection: 'graphic-documents',
    id: documentId,
    depth: 0,
    overrideAccess: true,
  } as never)) as Doc
  const history = Array.isArray(document.history) ? document.history : []
  await payload.update({
    collection: 'graphic-documents',
    id: documentId,
    data: { history: [...history, entry] },
    overrideAccess: true,
  } as never)
}

export async function renderGraphicDerivative(
  payload: Payload,
  input: { derivativeId: string; actorId: string },
) {
  const derivative = await loadDerivative(payload, input.derivativeId)
  if (derivative.status === 'superseded' || derivative.status === 'failed')
    throw new Error(`A ${String(derivative.status)} derivative cannot be rendered.`)
  if (id(derivative.asset)) {
    const existing = (await payload.findByID({
      collection: 'media-assets',
      id: id(derivative.asset),
      depth: 0,
      overrideAccess: true,
    } as never)) as Doc
    return { derivative, asset: existing, alreadyRendered: true as const }
  }
  const source = (await payload.findByID({
    collection: 'media-assets',
    id: id(derivative.sourceMedia),
    depth: 0,
    overrideAccess: true,
  } as never)) as Doc
  const rightsIssue = mediaRightsIssue(source as DamMetadata)
  if (rightsIssue) throw new Error(`Graphic render refused: ${rightsIssue}`)
  const blob = (await payload.findByID({
    collection: 'media-blobs',
    id: id(source.originalBlob),
    depth: 0,
    overrideAccess: true,
  } as never)) as Doc
  const config = loadConfig()
  const storage = mediaStorage(config)
  const sourceBytes = await storage.get(String(blob.storageKey))
  if (!sourceBytes) throw new Error('Source media bytes are unavailable for graphic render.')
  const recipe = (derivative.recipe ?? {}) as {
    canvas?: { width?: number; height?: number }
    text?: string
  }
  const width = Number(recipe.canvas?.width) || 1080
  const height = Number(recipe.canvas?.height) || 1080
  const rendered = await sharp(sourceBytes, { failOn: 'error' })
    .resize(width, height, { fit: 'cover' })
    .composite([{ input: graphicOverlaySvg({ width, height, text: String(recipe.text ?? '') }) }])
    .png()
    .toBuffer({ resolveWithObject: true })
  const bytes = new Uint8Array(rendered.data)
  const checksum = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
  const siteId = id(source.site)
  // Persist the output as a first-class media asset, mirroring the
  // site-scoped blob dedup the upload path uses.
  const known = await payload
    .find({
      collection: 'media-blobs',
      where: {
        and: [{ site: { equals: siteId } }, { checksum: { equals: checksum } }],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
    .catch(() => ({ docs: [] as Doc[] }))
  let outputBlob = (known.docs as unknown as Doc[])[0]
  if (!outputBlob) {
    const key = mediaObjectKey(siteId, 'png')
    await storage.put(key, bytes, 'image/png')
    outputBlob = (await payload.create({
      collection: 'media-blobs',
      overrideAccess: true,
      data: {
        site: siteId,
        publication: id(source.publication) || null,
        space: id(source.space) || null,
        checksum,
        storageKey: key,
        storageProvider: storage.provider,
        mimeType: 'image/png',
        sizeBytes: bytes.byteLength,
        state: 'ready',
      },
    } as never)) as Doc
  }
  const asset = (await payload.create({
    collection: 'media-assets',
    overrideAccess: true,
    data: {
      site: siteId,
      publication: id(source.publication) || null,
      space: id(source.space) || null,
      owner: null,
      title: String(derivative.title),
      kind: 'graphic',
      storageLocation: String(outputBlob.storageKey),
      storageProvider: storage.provider,
      originalBlob: outputBlob.id,
      originalFilename: `${String(derivative.title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 60)}.png`,
      mimeType: 'image/png',
      sizeBytes: bytes.byteLength,
      width: rendered.info.width,
      height: rendered.info.height,
      checksum,
      altText: String(recipe.text ?? '') || null,
      retentionMode: 'permanent',
      retentionHold: 'none',
      removeFromDiscovery: false,
      processingState: 'ready',
      publicPolicy: 'published-use',
      customMetadata: {
        graphicDerivative: String(derivative.id),
        graphicDocument: id(derivative.document),
        sourceMedia: id(source.id),
      },
    },
  } as never)) as Doc
  const usageReferences = Array.isArray(derivative.usageReferences)
    ? derivative.usageReferences
    : []
  const updated = (await payload.update({
    collection: 'media-derivatives',
    id: String(derivative.id),
    data: {
      asset: String(asset.id),
      usageReferences: [
        ...usageReferences,
        { type: 'graphic-output', assetId: String(asset.id), at: new Date().toISOString() },
      ],
    },
    overrideAccess: true,
  } as never)) as Doc
  await appendDocumentHistory(payload, id(derivative.document), {
    action: 'graphic.rendered',
    actorId: input.actorId,
    at: new Date().toISOString(),
    derivativeId: String(derivative.id),
    assetId: String(asset.id),
  })
  await recordMediaUsage(payload, {
    site: siteId,
    media: String(asset.id),
    usedBy: { relationTo: 'graphic-documents', value: id(derivative.document) },
    usageKey: `graphic-output:${String(derivative.id)}`,
    targetType: 'media-derivative',
    targetId: String(derivative.id),
    purpose: 'cover',
    lifecycle: 'draft',
    approvedForPublic: false,
  })
  return { derivative: updated, asset, alreadyRendered: false as const }
}

export async function approveGraphicDerivative(
  payload: Payload,
  input: { derivativeId: string; actorId: string },
) {
  const derivative = await loadDerivative(payload, input.derivativeId)
  if (derivative.status === 'approved') return { derivative, alreadyApproved: true as const }
  if (!id(derivative.asset))
    throw new Error('Render the derivative before approving it for publication.')
  const source = (await payload.findByID({
    collection: 'media-assets',
    id: id(derivative.sourceMedia),
    depth: 0,
    overrideAccess: true,
  } as never)) as Doc
  const rightsIssue = mediaRightsIssue(source as DamMetadata)
  if (rightsIssue) throw new Error(`Graphic approval refused: ${rightsIssue}`)
  const updated = (await payload.update({
    collection: 'media-derivatives',
    id: String(derivative.id),
    data: { status: 'approved' },
    overrideAccess: true,
  } as never)) as Doc
  await appendDocumentHistory(payload, id(derivative.document), {
    action: 'graphic.approved',
    actorId: input.actorId,
    at: new Date().toISOString(),
    derivativeId: String(derivative.id),
    assetId: id(derivative.asset),
  })
  await recordMediaUsage(payload, {
    site: id(source.site),
    media: id(derivative.asset),
    usedBy: { relationTo: 'graphic-documents', value: id(derivative.document) },
    usageKey: `graphic-output:${String(derivative.id)}`,
    targetType: 'media-derivative',
    targetId: String(derivative.id),
    purpose: 'cover',
    lifecycle: 'draft',
    approvedForPublic: true,
  })
  return { derivative: updated, alreadyApproved: false as const }
}
