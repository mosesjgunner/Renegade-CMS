import { z } from 'zod'

export const maxTimelineSeconds = 120
export const mediaEditTaskSlug = 'creator-media-export'
export const mediaEditQueue = 'media-heavy'
export const exportProfiles = ['landscape', 'vertical'] as const
export type ExportProfile = (typeof exportProfiles)[number]

const time = z.number().finite().min(0).max(maxTimelineSeconds)
const assetId = z.string().uuid()
const title = z.string().trim().min(1).max(120)
const timing = { start: time, end: time }
const audioControls = {
  gain: z.number().finite().min(-60).max(12),
  muted: z.boolean(),
  audioFadeIn: time,
  audioFadeOut: time,
}
const clip = z.object({
  asset: assetId,
  in: z
    .number()
    .finite()
    .min(0)
    .max(24 * 60 * 60),
  out: z
    .number()
    .finite()
    .min(0)
    .max(24 * 60 * 60),
  crop: z.object({
    x: z.number().min(0).max(0.9),
    y: z.number().min(0).max(0.9),
    width: z.number().min(0.1).max(1),
    height: z.number().min(0.1).max(1),
  }),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  scale: z.number().finite().min(0.25).max(2),
  fit: z.enum(['contain', 'cover']),
  look: z.enum(['original', 'mono', 'vivid', 'bright', 'low-light']),
  fadeIn: time,
  fadeOut: time,
  ...audioControls,
})

const color = z.string().regex(/^#[0-9a-f]{6}$/i)
const position = { x: z.number().min(0).max(1), y: z.number().min(0).max(1) }
const text = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[^\x00-\x1f\x7f]+$/u)
const layer = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), ...timing, ...position, text, color }),
  z.object({ kind: z.literal('brand'), ...timing, ...position, text, color }),
  z.object({
    kind: z.literal('graphic'),
    ...timing,
    ...position,
    asset: assetId,
    width: z.number().min(0.05).max(0.9),
  }),
])

export const recipeSchema = z
  .object({
    version: z.literal(1),
    title,
    clips: z.array(clip).max(16),
    voiceover: z
      .object({
        asset: assetId,
        offset: time,
        in: time,
        out: time,
        cleanup: z.boolean(),
        ...audioControls,
      })
      .nullable(),
    layers: z.array(layer).max(12),
    captions: z.array(z.object({ ...timing, text })).max(150),
    chapters: z.array(z.object({ at: time, title: text })).max(24),
    thumbnailAt: time,
    thumbnailAsset: assetId.nullable(),
  })
  .superRefine((recipe, ctx) => {
    const duration = timelineDuration(recipe)
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message })
    for (const item of recipe.clips) {
      const length = item.out - item.in
      if (
        length < 0.0999 ||
        item.fadeIn + item.fadeOut > length + 0.0001 ||
        item.audioFadeIn + item.audioFadeOut > length + 0.0001
      )
        issue('Each clip needs at least 0.1 seconds and fades must fit inside it.')
      if (item.crop.x + item.crop.width > 1.000001 || item.crop.y + item.crop.height > 1.000001)
        issue('Crop must fit inside the source frame.')
    }
    if (duration > maxTimelineSeconds + 0.0001) issue('The timeline is limited to two minutes.')
    for (const item of [...recipe.layers, ...recipe.captions])
      if (item.end - item.start < 0.0999 || item.end > duration + 0.0001)
        issue('Layers and captions must fit inside the timeline and last at least 0.1 seconds.')
    if (recipe.captions.some((cue, i) => i > 0 && cue.start < recipe.captions[i - 1].end))
      issue('Captions must be in order and cannot overlap.')
    if (
      recipe.chapters.some(
        (chapter, i) =>
          chapter.at >= duration || (i > 0 && chapter.at - recipe.chapters[i - 1].at < 0.001),
      )
    )
      issue('Chapters must be in increasing order inside the timeline.')
    if (recipe.thumbnailAt > Math.max(0, duration - 0.05) + 0.0001)
      issue('Choose a thumbnail time inside the timeline.')
    const voice = recipe.voiceover
    if (voice) {
      const length = voice.out - voice.in
      if (
        length < 0.0999 ||
        voice.offset + length > duration + 0.0001 ||
        voice.audioFadeIn + voice.audioFadeOut > length + 0.0001
      )
        issue('Voiceover and its fades must fit inside the timeline.')
    }
  })

export type EditRecipe = z.infer<typeof recipeSchema>
export type EditClip = z.infer<typeof clip>
export const timelineDuration = ({ clips }: { clips: Array<{ in: number; out: number }> }) =>
  clips.reduce((total, clip) => total + clip.out - clip.in, 0)

export const editStart = (): EditRecipe => ({
  version: 1,
  title: 'Untitled edit',
  clips: [],
  layers: [],
  captions: [],
  chapters: [],
  voiceover: null,
  thumbnailAt: 0,
  thumbnailAsset: null,
})

const audioDefaults = { gain: 0, muted: false, audioFadeIn: 0, audioFadeOut: 0 }
export const newClip = (asset: string, out: number): EditClip => ({
  asset,
  in: 0,
  out,
  crop: { x: 0, y: 0, width: 1, height: 1 },
  rotation: 0,
  scale: 1,
  fit: 'contain',
  look: 'original',
  fadeIn: 0,
  fadeOut: 0,
  ...audioDefaults,
})

export const newVoiceover = (asset: string, out: number): NonNullable<EditRecipe['voiceover']> => ({
  asset,
  in: 0,
  out,
  offset: 0,
  cleanup: false,
  ...audioDefaults,
})

export function splitClip(clip: EditClip, at: number): [EditClip, EditClip] | undefined {
  const left = at - clip.in
  const right = clip.out - at
  if (
    !Number.isFinite(at) ||
    left + 0.0001 < Math.max(0.1, clip.fadeIn, clip.audioFadeIn) ||
    right + 0.0001 < Math.max(0.1, clip.fadeOut, clip.audioFadeOut)
  )
    return
  return [
    { ...clip, out: at, fadeOut: 0, audioFadeOut: 0 },
    { ...clip, in: at, fadeIn: 0, audioFadeIn: 0 },
  ]
}

export function recipeSources(recipe: EditRecipe) {
  return [
    ...recipe.clips.map(({ asset }) => ({ asset, kinds: ['video', 'image'] })),
    ...recipe.layers.flatMap((layer) =>
      layer.kind === 'graphic' ? [{ asset: layer.asset, kinds: ['image'] }] : [],
    ),
    ...(recipe.voiceover ? [{ asset: recipe.voiceover.asset, kinds: ['audio'] }] : []),
    ...(recipe.thumbnailAsset ? [{ asset: recipe.thumbnailAsset, kinds: ['image'] }] : []),
  ]
}
