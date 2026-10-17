import { mediaVariantUrl, standardRecipes, type VariantFormat } from './variant-contracts'

export type ResponsiveMediaInput = {
  id: string
  title?: string | null
  altText?: string | null
  width?: number | null
  height?: number | null
  mimeType?: string | null
  variants?: Array<{
    recipeKey?: string | null
    format?: string | null
    width?: number | null
    height?: number | null
    processingState?: string | null
  }>
}

export type ResponsiveImageProps = {
  media: ResponsiveMediaInput | string
  variant?: keyof typeof standardRecipes | string
  priority?: boolean
  className?: string
  sizes?: string
  alt?: string
}

/**
 * Returns structured attributes for a responsive image including modern format sources
 * (AVIF, WebP, JPEG/PNG fallback), srcset, correct dimensions, and loading behavior.
 */
export function getResponsiveImageAttrs(
  mediaInput: ResponsiveMediaInput | string,
  options?: {
    variant?: string
    priority?: boolean
    sizes?: string
    alt?: string
  },
) {
  const isString = typeof mediaInput === 'string'
  const id = isString ? mediaInput : mediaInput.id
  const requestedVariantKey = options?.variant || 'inline'
  const variantKey = standardRecipes[requestedVariantKey] ? requestedVariantKey : 'inline'
  const recipe = standardRecipes[variantKey]!
  const priority = Boolean(options?.priority || recipe.priority === 'eager')

  // Reserve rendition dimensions while a ready derivative is available.
  let width = recipe.width
  const sourceAspect =
    !isString && mediaInput.width && mediaInput.height
      ? mediaInput.width / mediaInput.height
      : 16 / 9
  const height =
    recipe.fit === 'inside' && recipe.height
      ? Math.min(recipe.height, Math.round(width / sourceAspect))
      : recipe.height || Math.round(width / sourceAspect)
  if (recipe.fit === 'inside' && recipe.height)
    width = Math.min(width, Math.round(height * sourceAspect))
  const alt = options?.alt || (!isString && mediaInput.altText) || ''

  const ready = isString
    ? []
    : (mediaInput.variants ?? []).filter(
        (variant) => variant.recipeKey === variantKey && variant.processingState === 'ready',
      )
  const variantUrl = (format: VariantFormat) => mediaVariantUrl(id, variantKey, format)
  const hasFormat = (format: VariantFormat) => ready.some((variant) => variant.format === format)
  const sources = (['avif', 'webp'] as const).filter(hasFormat).map((format) => ({
    type: `image/${format}`,
    srcSet: `${variantUrl(format)} ${width}w`,
  }))
  const fallbackFormat = (['jpeg', 'png', 'webp', 'avif'] as const).find(hasFormat)
  const fallbackSrc = fallbackFormat
    ? variantUrl(fallbackFormat)
    : `/media/${encodeURIComponent(id)}`
  const fallbackSrcSet = fallbackFormat ? `${fallbackSrc} ${width}w` : undefined

  return {
    id,
    alt,
    width: fallbackFormat ? width : !isString && mediaInput.width ? mediaInput.width : width,
    height: fallbackFormat ? height : !isString && mediaInput.height ? mediaInput.height : height,
    loading: priority ? ('eager' as const) : ('lazy' as const),
    decoding: 'async' as const,
    sizes: options?.sizes || '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw',
    sources,
    src: fallbackSrc,
    srcSet: fallbackSrcSet,
  }
}

/**
 * Modern responsive image component using HTML5 `<picture>` to deliver AVIF, WebP,
 * and JPEG fallbacks with correct dimensions, lazy/eager priority, and srcset.
 */
export function ResponsiveMedia({
  media,
  variant = 'inline',
  priority = false,
  className = 'max-w-full h-auto',
  sizes,
  alt,
}: ResponsiveImageProps) {
  if (!media) return null

  const attrs = getResponsiveImageAttrs(media, { variant, priority, sizes, alt })

  return (
    <picture>
      {attrs.sources.map((source) => (
        <source key={source.type} type={source.type} srcSet={source.srcSet} sizes={attrs.sizes} />
      ))}
      <img
        src={attrs.src}
        srcSet={attrs.srcSet}
        sizes={attrs.sizes}
        alt={attrs.alt}
        width={attrs.width}
        height={attrs.height}
        loading={attrs.loading}
        decoding={attrs.decoding}
        className={className}
      />
    </picture>
  )
}
