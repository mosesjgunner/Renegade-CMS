/**
 * CMoS Native Image Editor Contracts
 *
 * Defines the vendor-agnostic abstraction boundary between Renegade CMoS
 * Media management and browser-based image editor engines (miniPaint, etc.).
 */

export type ImageEditorFormat = 'image/png' | 'image/jpeg' | 'image/webp'

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
   * Whether changes have been made in the editor session.
   */
  isDirty(): boolean

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
   * Cleanup event listeners and resources.
   */
  destroy(): void
}
