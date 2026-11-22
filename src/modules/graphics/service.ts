/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from 'node:crypto'
import type { Payload } from 'payload'
import { assertGraphicDocument } from '../media/contracts'
import { recordMediaUsage } from '../media/usage'

import { graphicTemplatePresets, type GraphicTemplate } from './contracts'
export { graphicTemplatePresets, type GraphicTemplate } from './contracts'

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
  // RC3-18 fix: this write previously used fields that do not exist on
  // the media-usages collection (usageType / targetCollection / approved)
  // and omitted its required site / usedBy / purpose, so every call
  // threw a ValidationError after the derivative had been created. The
  // row below is the collection's real shape: the source asset is used
  // by the graphic document, unapproved until the derivative is.
  await recordMediaUsage(payload, {
    site: input.scope.site,
    media: input.sourceMediaId,
    usedBy: { relationTo: 'graphic-documents', value: document.id },
    usageKey: `graphic:${derivative.id}`,
    targetType: 'graphic-document',
    targetId: derivative.id,
    // 'cover': the media_usages_purpose DB enum carries only seven of
    // the thirteen purposes the collection declares (layout / theme /
    // seo / podcast / video / distribution are rejected by Postgres) —
    // a designed social/cover graphic is a cover use. Enum drift named
    // in the RC3-18 RESULT.md; widening it is migration work.
    purpose: 'cover',
    lifecycle: 'draft',
    approvedForPublic: false,
  })
  return { document, derivative }
}
