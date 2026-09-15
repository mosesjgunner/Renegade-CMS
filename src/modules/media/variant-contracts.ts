export type VariantFit = 'cover' | 'contain' | 'inside'
export type VariantFormat = 'webp' | 'avif' | 'jpeg' | 'png'

export type VariantRecipe = {
  readonly key: string
  readonly label: string
  readonly kind: 'thumbnail' | 'poster' | 'transcode' | 'caption' | 'social' | 'other'
  readonly version: number
  readonly width: number
  readonly height?: number
  readonly aspectRatio?: { width: number; height: number }
  readonly fit: VariantFit
  readonly formats: readonly VariantFormat[]
  readonly quality: number
  readonly priority?: 'eager' | 'lazy'
}

export type FocalPoint = { x: number; y: number }
export type CropRectangle = { x: number; y: number; width: number; height: number }

export type ExtractedMetadata = {
  width: number
  height: number
  aspectRatio: number
  format: string
  mimeType: string
  orientation?: number
  dominantColor?: string
  colorPalette?: Array<{ r: number; g: number; b: number }>
  hasAlpha?: boolean
  channels?: number
  artist?: string
  copyright?: string
}

export type VariantGenerationResult = {
  recipeKey: string
  label: string
  format: VariantFormat
  mimeType: string
  width: number
  height: number
  sizeBytes: number
  checksum: string
  storageKey: string
  bytesSaved: number
  percentSaved: number
}

/** Standard approved recipe catalog for Renegade CMoS. */
export const standardRecipes: Record<string, VariantRecipe> = {
  thumbnail: {
    key: 'thumbnail',
    label: 'Thumbnail',
    kind: 'thumbnail',
    version: 1,
    width: 400,
    height: 300,
    aspectRatio: { width: 4, height: 3 },
    fit: 'cover',
    formats: ['webp', 'avif', 'jpeg'],
    quality: 80,
    priority: 'lazy',
  },
  inline: {
    key: 'inline',
    label: 'Inline Content',
    kind: 'other',
    version: 1,
    width: 960,
    height: 640,
    fit: 'inside',
    formats: ['webp', 'avif', 'jpeg'],
    quality: 82,
    priority: 'lazy',
  },
  hero: {
    key: 'hero',
    label: 'Hero',
    kind: 'other',
    version: 1,
    width: 1600,
    height: 900,
    aspectRatio: { width: 16, height: 9 },
    fit: 'cover',
    formats: ['webp', 'avif', 'jpeg'],
    quality: 85,
    priority: 'eager',
  },
  og: {
    key: 'og',
    label: 'Open Graph & Social',
    kind: 'social',
    version: 1,
    width: 1200,
    height: 630,
    aspectRatio: { width: 1200, height: 630 },
    fit: 'cover',
    formats: ['jpeg', 'webp'],
    quality: 85,
    priority: 'eager',
  },
  square: {
    key: 'square',
    label: 'Square (1:1)',
    kind: 'other',
    version: 1,
    width: 800,
    height: 800,
    aspectRatio: { width: 1, height: 1 },
    fit: 'cover',
    formats: ['webp', 'avif', 'jpeg'],
    quality: 82,
    priority: 'lazy',
  },
  portrait: {
    key: 'portrait',
    label: 'Portrait (3:4)',
    kind: 'other',
    version: 1,
    width: 800,
    height: 1067,
    aspectRatio: { width: 3, height: 4 },
    fit: 'cover',
    formats: ['webp', 'avif', 'jpeg'],
    quality: 82,
    priority: 'lazy',
  },
  wide: {
    key: 'wide',
    label: 'Wide (16:9)',
    kind: 'other',
    version: 1,
    width: 1280,
    height: 720,
    aspectRatio: { width: 16, height: 9 },
    fit: 'cover',
    formats: ['webp', 'avif', 'jpeg'],
    quality: 82,
    priority: 'lazy',
  },
}

export const formatMimeTypes: Record<VariantFormat, string> = {
  webp: 'image/webp',
  avif: 'image/avif',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

export function mediaVariantUrl(assetId: string, recipeKey: string, format: VariantFormat): string {
  const recipe = standardRecipes[recipeKey]
  if (!recipe) throw new Error('Unregistered variant recipe.')
  return `/media/${assetId}?variant=${encodeURIComponent(recipeKey)}&format=${format}&v=${recipe.version}`
}
