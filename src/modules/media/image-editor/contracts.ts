/**
 * CMoS Native Image Editor Contracts
 *
 * Defines the vendor-agnostic abstraction boundary between Renegade CMoS
 * Media management and browser-based image editor engines (miniPaint, etc.).
 */

export type ImageEditorFormat = 'image/png' | 'image/jpeg' | 'image/webp'

/** Match the existing Media variant processor's 50 megapixel decompression limit. */
export const MAX_IMAGE_EDITOR_PIXELS = 50_000_000

export const SUPPORTED_IMAGE_EDITOR_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
] as const

export type SupportedImageEditorMimeType = (typeof SUPPORTED_IMAGE_EDITOR_MIME_TYPES)[number]

export function isEditableImageMimeType(mimeType: string): boolean {
  const normalized = mimeType.toLowerCase().trim()
  // SVG vector graphics cannot be safely raster-edited in canvas
  if (normalized === 'image/svg+xml') return false
  return (
    SUPPORTED_IMAGE_EDITOR_MIME_TYPES.includes(normalized as SupportedImageEditorMimeType) ||
    normalized.startsWith('image/')
  )
}

export type ImageEditorSaveMode = 'all-usages' | 'new-asset'

export interface ImageEditorAsset {
  id: string
  title: string
  altText?: string
  caption?: string
  mimeType: string
  url: string
  siteId: string
  width?: number | null
  height?: number | null
}

export interface ImageEditorExportResult {
  blob: Blob
  dataUrl: string
  width: number
  height: number
  format: ImageEditorFormat
  projectJson?: string
}

export interface ImageEditorSavePayload {
  mode: ImageEditorSaveMode
  title: string
  altText?: string
  reason?: string
  format: ImageEditorFormat
  exportResult: ImageEditorExportResult
}

/**
 * Generic AI action capability types supported by future CMoS AI runtime providers.
 * Vendor neutral: no Gemini, Nano Banana, OpenAI, or fal.ai identifiers.
 */
export type ImageEditorAIActionType =
  | 'generative-fill'
  | 'remove-object'
  | 'replace-background'
  | 'expand-outpaint'
  | 'generate-variation'
  | 'restyle'
  | 'generate-image'

export interface ImageEditorAIActionDefinition {
  type: ImageEditorAIActionType
  label: string
  description?: string
  requiresSelection?: boolean
  requiresMask?: boolean
}

/** A host supplied editor action. Runtime/provider work stays outside Media and the editor. */
export interface ImageEditorExtensionAction {
  id: string
  label: string
  description?: string
  category?: 'ai' | 'tool' | 'filter' | 'custom'
  actionType?: ImageEditorAIActionType
  requiresSelection?: boolean
  requiresMask?: boolean
  run(context: ImageEditorExtensionContext): Promise<void>
}

export interface ImageEditorExtensionContext {
  asset: ImageEditorAsset
  adapter: ImageEditorAdapter
  getCanvasDimensions(): { width: number; height: number }
  getCanvasImage(options?: {
    format?: ImageEditorFormat
    quality?: number
  }): Promise<ImageEditorExportResult>
  getActiveLayerImage?(): Promise<ImageEditorExportResult | null>
  insertLayer(options: {
    name: string
    image: HTMLImageElement | string
    opacity?: number
  }): Promise<void>
  replaceActiveLayer?(options: { name?: string; image: HTMLImageElement | string }): Promise<void>
  setStatus(message: string): void
  setError(error: string | null): void
}

export interface ImageEditorAdapter {
  readonly id: string
  readonly name: string
  readonly version: string

  /**
   * Bind the adapter to the editor host iframe.
   */
  attach(iframe: HTMLIFrameElement): Promise<void>

  /**
   * Load an image into the editor canvas.
   */
  loadImage(asset: ImageEditorAsset): Promise<{ width: number; height: number }>

  /**
   * Export the current canvas render as a Blob.
   */
  exportImage(options?: {
    format?: ImageEditorFormat
    quality?: number
  }): Promise<ImageEditorExportResult>

  /**
   * Export the underlying editor layer/project state if supported.
   */
  exportProject?(): Promise<string>

  /**
   * Returns the current dimensions of the active canvas.
   */
  getDimensions?(): { width: number; height: number }

  /**
   * Whether changes have been made in the editor session.
   */
  isDirty(): boolean

  /**
   * Undo the previous action in the editor.
   */
  undo?(): void

  /**
   * Redo the previous undone action in the editor.
   */
  redo?(): void

  /**
   * Export the current active layer image if available.
   */
  getActiveLayerImage?(): Promise<ImageEditorExportResult | null>

  /**
   * Extension point for future AI image generation/editing tools.
   * Inserts an external generated image or mask layer into the active canvas.
   */
  insertLayer?(options: {
    name: string
    image: HTMLImageElement | string
    opacity?: number
  }): Promise<void>

  /**
   * Extension point for future AI image tools (restyle, remove object, replace background).
   * Replaces the active layer with a newly generated image.
   */
  replaceActiveLayer?(options: { name?: string; image: HTMLImageElement | string }): Promise<void>

  /**
   * Cleanup event listeners and resources.
   */
  destroy(): void
}
