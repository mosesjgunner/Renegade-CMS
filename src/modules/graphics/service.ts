/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from 'node:crypto'
import type { Payload } from 'payload'
import { assertGraphicDocument, type GraphicPreset } from '../media/contracts'

export type GraphicTemplate =
  | 'quote'
  | 'article-social'
  | 'og'
  | 'podcast'
  | 'youtube-thumbnail'
  | 'book-chapter-promo'
  | 'product'
  | 'event'
  | 'announcement'
  | 'donation-campaign'
export const graphicTemplatePresets: Record<
  GraphicTemplate,
  { preset: GraphicPreset; width: number; height: number }
> = {
  quote: { preset: 'square', width: 1080, height: 1080 },
  'article-social': { preset: 'square', width: 1080, height: 1080 },
  og: { preset: 'og', width: 1200, height: 630 },
  podcast: { preset: 'square', width: 3000, height: 3000 },
  'youtube-thumbnail': { preset: 'thumbnail', width: 1280, height: 720 },
  'book-chapter-promo': { preset: 'portrait', width: 1080, height: 1350 },
  product: { preset: 'square', width: 1080, height: 1080 },
  event: { preset: 'story', width: 1080, height: 1920 },
  announcement: { preset: 'square', width: 1080, height: 1080 },
  'donation-campaign': { preset: 'square', width: 1080, height: 1080 },
}
type Doc = Record<string, any>
export async function createGraphicDerivative(
  payload: Payload,
  input: {
    title: string
    template: GraphicTemplate
    sourceMediaId: string
    brandKitId?: string | null
    text: string
    actorId: string
    scope: {
      site: string
      publication?: string | null
      space?: string | null
      owner?: string | null
    }
  },
) {
  const asset = (await payload.findByID({
    collection: 'media-assets',
    id: input.sourceMediaId,
    depth: 0,
    overrideAccess: true,
  })) as Doc
  if (asset.rightsStatus && asset.rightsStatus !== 'approved')
    throw new Error('This asset is not approved for graphics use.')
  if (asset.originalExportAllowed === false)
    throw new Error('This asset is restricted and cannot be exported into a graphic derivative.')
  const spec = graphicTemplatePresets[input.template]
  const recipe = {
    version: 1 as const,
    template: input.template,
    canvas: { width: spec.width, height: spec.height },
    text: input.text,
    brandKitId: input.brandKitId ?? null,
    layoutVariant: `graphics.${input.template}.v1`,
  }
  const sourceRevision = `sha256:${createHash('sha256')
    .update(JSON.stringify({ asset: asset.id, recipe }))
    .digest('hex')}`
  const layers = [
    {
      id: 'template',
      name: input.template,
      opacity: 1,
      recipe: {
        version: 1 as const,
        edits: [
          {
            type: 'text' as const,
            value: input.text,
            x: 60,
            y: 60,
            font: 'Brand Sans',
            color: '#ffffff',
          },
        ],
      },
    },
  ]
  assertGraphicDocument({
    id: 'pending',
    sourceMediaAssetId: input.sourceMediaId,
    sourceRevision,
    layers,
  })
  const document = (await payload.create({
    collection: 'graphic-documents',
    data: {
      ...input.scope,
      title: input.title,
      sourceMedia: input.sourceMediaId,
      sourceRevision,
      layers,
      history: [
        {
          action: 'graphic.created',
          actorId: input.actorId,
          at: new Date().toISOString(),
          template: input.template,
        },
      ],
      brandKit: input.brandKitId ?? null,
      template: input.template,
      layoutVariant: recipe.layoutVariant,
    },
    overrideAccess: true,
  } as never)) as Doc
  const derivative = (await payload.create({
    collection: 'media-derivatives',
    data: {
      title: input.title,
      document: document.id,
      sourceMedia: input.sourceMediaId,
      preset: spec.preset,
      recipe,
      status: 'pending',
      usageReferences: [],
    },
    overrideAccess: true,
  } as never)) as Doc
  await payload.create({
    collection: 'media-usages',
    data: {
      media: input.sourceMediaId,
      usageKey: `graphic:${derivative.id}`,
      usageType: 'graphic-source',
      targetCollection: 'media-derivatives',
      targetId: derivative.id,
      approved: true,
    },
    overrideAccess: true,
  } as never)
  return { document, derivative }
}
