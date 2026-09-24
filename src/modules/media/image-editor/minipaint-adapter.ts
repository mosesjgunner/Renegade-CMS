/**
 * miniPaint Image Editor Adapter
 *
 * Implements the ImageEditorAdapter interface for upstream miniPaint.
 * Uses both postMessage event bridge and same-origin DOM fast-paths.
 *
 * Upstream project: https://github.com/viliusle/miniPaint (MIT License)
 */

import { MAX_IMAGE_EDITOR_PIXELS, isEditableImageMimeType } from './contracts'
import type {
  ImageEditorAdapter,
  ImageEditorAsset,
  ImageEditorExportResult,
  ImageEditorFormat,
} from './contracts'

type WindowWithMiniPaint = Window & {
  Layers?: {
    get_dimensions: () => { width: number; height: number }
    convert_layers_to_canvas: (ctx: CanvasRenderingContext2D) => void
    insert: (layer: Record<string, unknown>) => void
    get_active_layer?: () => Record<string, unknown> | null
    auto_increment?: number
  }
  FileSave?: {
    export_as_json: () => string
  }
  State?: {
    do_action: (action: unknown) => Promise<unknown> | void
    undo?: () => void
    redo?: () => void
  }
  Actions?: Record<string, new (...args: unknown[]) => unknown>
  app?: {
    State?: {
      do_action: (action: unknown) => Promise<unknown> | void
      undo?: () => void
      redo?: () => void
    }
    Actions?: Record<string, new (...args: unknown[]) => unknown>
    Layers?: {
      get_dimensions: () => { width: number; height: number }
      convert_layers_to_canvas: (ctx: CanvasRenderingContext2D) => void
      insert: (layer: Record<string, unknown>) => void
      get_active_layer?: () => Record<string, unknown> | null
      auto_increment?: number
    }
  }
}

type EditorState = {
  dirty: boolean
  canUndo: boolean
  canRedo: boolean
  dimensions?: { width: number; height: number }
}

export class MiniPaintAdapter implements ImageEditorAdapter {
  readonly id = 'minipaint'
  readonly name = 'miniPaint'
  readonly version = '4.14.0'

  private iframe: HTMLIFrameElement | null = null
  private messageHandler: ((event: MessageEvent) => void) | null = null
  private isReady = false
  private dirty = false
  private readyPromise: Promise<void> | null = null
  private readyResolver: (() => void) | null = null
  private stateListener: ((state: EditorState) => void) | null = null

  onStateChange(listener: (state: EditorState) => void): void {
    this.stateListener = listener
  }

  markSaved(): void {
    this.dirty = false
    this.stateListener?.({ dirty: false, canUndo: true, canRedo: false })
  }

  undo(): void {
    this.sendCommand('undo')
  }

  redo(): void {
    this.sendCommand('redo')
  }

  private sendCommand(command: 'undo' | 'redo' | 'mark-saved'): void {
    this.iframe?.contentWindow?.postMessage(
      { type: 'cmos:image-editor:command', payload: { command } },
      window.location.origin,
    )
  }

  async attach(iframe: HTMLIFrameElement): Promise<void> {
    this.iframe = iframe
    this.dirty = false

    this.readyPromise = new Promise((resolve) => {
      this.readyResolver = resolve
    })

    this.messageHandler = (event: MessageEvent) => {
      if (
        !this.iframe ||
        event.source !== this.iframe.contentWindow ||
        event.origin !== window.location.origin
      )
        return
      const data = event.data
      if (!data || typeof data !== 'object') return

      if (data.type === 'cmos:image-editor:ready') {
        this.isReady = true
        this.readyResolver?.()
      }
      if (data.type === 'cmos:image-editor:state') {
        this.dirty = Boolean(data.payload?.dirty)
        this.stateListener?.({
          dirty: this.dirty,
          canUndo: Boolean(data.payload?.canUndo),
          canRedo: Boolean(data.payload?.canRedo),
          dimensions:
            typeof data.payload?.width === 'number' && typeof data.payload?.height === 'number'
              ? { width: data.payload.width, height: data.payload.height }
              : undefined,
        })
      }
    }

    window.addEventListener('message', this.messageHandler)

    // Check if iframe already initialized or if same-origin globals are already present
    const win = iframe.contentWindow as WindowWithMiniPaint | null
    if (win?.Layers && (win?.app || win?.State)) {
      this.isReady = true
      this.readyResolver?.()
    } else {
      iframe.addEventListener(
        'load',
        () => {
          const loadedWin = iframe.contentWindow as WindowWithMiniPaint | null
          if (loadedWin?.Layers && (loadedWin?.app || loadedWin?.State)) {
            this.isReady = true
            this.readyResolver?.()
          }
        },
        { once: true },
      )
    }

    // Await ready signal with safety timeout
    await Promise.race([
      this.readyPromise,
      new Promise<void>((resolve) => setTimeout(resolve, 3500)),
    ])
  }

  async loadImage(asset: ImageEditorAsset): Promise<{ width: number; height: number }> {
    if (!this.iframe || !this.iframe.contentWindow) {
      throw new Error('Image editor iframe is not attached.')
    }

    if (asset.mimeType === 'image/svg+xml') {
      throw new Error('Vector graphics (SVG) cannot be edited in the raster image editor.')
    }
    if (!isEditableImageMimeType(asset.mimeType)) {
      throw new Error(`Unsupported media type for image editing: ${asset.mimeType}`)
    }

    if (asset.width && asset.height && asset.width * asset.height > MAX_IMAGE_EDITOR_PIXELS) {
      throw new Error('This image exceeds the 50 megapixel editor limit.')
    }
    const imageUrl = new URL(asset.url, window.location.origin)
    if (imageUrl.origin !== window.location.origin) {
      throw new Error('The image editor can load CMoS media URLs only.')
    }

    const win = this.iframe.contentWindow as WindowWithMiniPaint
    const appState = win.app?.State || win.State
    const appActions = win.app?.Actions || win.Actions
    const appLayers = win.app?.Layers || win.Layers

    // If same-origin direct access is available, load image directly
    if (appState && appActions && appLayers) {
      let objectUrl: string | null = null
      try {
        const resp = await fetch(imageUrl)
        if (resp.ok) {
          const blob = await resp.blob()
          objectUrl = URL.createObjectURL(blob)
        }
      } catch {
        // fallback to direct asset.url
      }

      return new Promise<{ width: number; height: number }>((resolve, reject) => {
        const img = new Image()
        const effectiveUrl = objectUrl || imageUrl.toString()
        img.onload = () => {
          try {
            const width = img.naturalWidth || img.width
            const height = img.naturalHeight || img.height
            if (width * height > MAX_IMAGE_EDITOR_PIXELS) {
              throw new Error('This image exceeds the 50 megapixel editor limit.')
            }
            const newLayer = {
              name: asset.title || 'image',
              type: 'image',
              link: img,
              width,
              height,
              width_original: width,
              height_original: height,
            }

            const Actions = appActions!
            const ResetLayers = Actions.Reset_layers_action as new () => unknown
            const InsertLayer = Actions.Insert_layer_action as new (layer: unknown) => unknown
            const Autoresize = Actions.Autoresize_canvas_action as new (
              w: number,
              h: number,
              layerId: unknown,
              auto: boolean,
              force: boolean,
            ) => unknown
            const Bundle = Actions.Bundle_action as new (
              id: string,
              title: string,
              actions: unknown[],
            ) => unknown

            appState!.do_action(
              new Bundle('load_cmos_asset', 'Load CMoS Asset', [
                new ResetLayers(),
                new InsertLayer(newLayer),
                new Autoresize(width, height, null, true, true),
              ]),
            )
            this.dirty = false
            this.sendCommand('mark-saved')
            this.stateListener?.({
              dirty: false,
              canUndo: false,
              canRedo: false,
              dimensions: { width, height },
            })
            if (objectUrl) URL.revokeObjectURL(objectUrl)
            resolve({ width, height })
          } catch (err) {
            if (objectUrl) URL.revokeObjectURL(objectUrl)
            reject(err)
          }
        }
        img.onerror = () => {
          if (objectUrl) URL.revokeObjectURL(objectUrl)
          reject(new Error(`Failed to load CMoS asset bytes from ${imageUrl.pathname}`))
        }
        img.src = effectiveUrl
      })
    }

    // Otherwise use postMessage bridge protocol
    return new Promise<{ width: number; height: number }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error('Timeout loading image in editor.'))
      }, 10_000)

      const onMessage = (event: MessageEvent) => {
        if (
          !this.iframe ||
          event.source !== this.iframe.contentWindow ||
          event.origin !== window.location.origin
        )
          return
        const data = event.data
        if (data?.type === 'cmos:image-editor:loaded') {
          cleanup()
          this.dirty = false
          this.sendCommand('mark-saved')
          this.stateListener?.({
            dirty: false,
            canUndo: false,
            canRedo: false,
            dimensions: { width: data.payload.width, height: data.payload.height },
          })
          resolve({ width: data.payload.width, height: data.payload.height })
        } else if (data?.type === 'cmos:image-editor:error') {
          cleanup()
          reject(new Error(data.payload.message || 'Error loading image.'))
        }
      }

      const cleanup = () => {
        clearTimeout(timeout)
        window.removeEventListener('message', onMessage)
      }

      window.addEventListener('message', onMessage)

      this.iframe?.contentWindow?.postMessage(
        {
          type: 'cmos:image-editor:load',
          payload: { url: imageUrl.toString(), name: asset.title || 'image' },
        },
        window.location.origin,
      )
    })
  }

  getDimensions(): { width: number; height: number } {
    const win = this.iframe?.contentWindow as WindowWithMiniPaint | null
    const layers = win?.app?.Layers || win?.Layers
    if (layers?.get_dimensions) {
      return layers.get_dimensions()
    }
    return { width: 0, height: 0 }
  }

  async exportImage(
    options: {
      format?: ImageEditorFormat
      quality?: number
    } = {},
  ): Promise<ImageEditorExportResult> {
    if (!this.iframe || !this.iframe.contentWindow) {
      throw new Error('Image editor iframe is not attached.')
    }

    const format: ImageEditorFormat = options.format || 'image/png'
    const quality = options.quality ?? 0.92
    const win = this.iframe.contentWindow as WindowWithMiniPaint

    // Direct fast-path if available
    if (win.Layers) {
      const dim = win.Layers.get_dimensions()
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = dim.width
      tempCanvas.height = dim.height
      const ctx = tempCanvas.getContext('2d')
      if (!ctx) throw new Error('Failed to create canvas 2D context.')

      win.Layers.convert_layers_to_canvas(ctx)
      const dataUrl = tempCanvas.toDataURL(format, quality)
      const projectJson = win.FileSave ? win.FileSave.export_as_json() : undefined

      const blob = await new Promise<Blob>((resolve, reject) => {
        tempCanvas.toBlob(
          (result) => {
            if (result) resolve(result)
            else reject(new Error('Failed to export canvas blob.'))
          },
          format,
          quality,
        )
      })

      return {
        blob,
        dataUrl,
        width: dim.width,
        height: dim.height,
        format,
        projectJson,
      }
    }

    // postMessage protocol fallback
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    return new Promise<ImageEditorExportResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error('Timeout exporting image from editor.'))
      }, 10_000)

      const onMessage = async (event: MessageEvent) => {
        if (
          !this.iframe ||
          event.source !== this.iframe.contentWindow ||
          event.origin !== window.location.origin
        )
          return
        const data = event.data
        if (
          data?.type === 'cmos:image-editor:export-response' &&
          data.payload.requestId === requestId
        ) {
          cleanup()
          const dataUrl = String(data.payload.dataUrl)
          const res = await fetch(dataUrl)
          const blob = await res.blob()
          resolve({
            blob,
            dataUrl,
            width: data.payload.width,
            height: data.payload.height,
            format: (data.payload.mimeType as ImageEditorFormat) || format,
            projectJson: data.payload.projectJson,
          })
        } else if (data?.type === 'cmos:image-editor:error') {
          cleanup()
          reject(new Error(data.payload.message || 'Export failed.'))
        }
      }

      const cleanup = () => {
        clearTimeout(timeout)
        window.removeEventListener('message', onMessage)
      }

      window.addEventListener('message', onMessage)

      this.iframe?.contentWindow?.postMessage(
        {
          type: 'cmos:image-editor:export-request',
          payload: { requestId, mimeType: format, quality },
        },
        window.location.origin,
      )
    })
  }

  async exportProject(): Promise<string> {
    if (!this.iframe || !this.iframe.contentWindow) {
      throw new Error('Image editor iframe is not attached.')
    }
    const win = this.iframe?.contentWindow as WindowWithMiniPaint | null
    if (win?.FileSave) {
      return win.FileSave.export_as_json()
    }
    return ''
  }

  isDirty(): boolean {
    return this.dirty
  }

  async getActiveLayerImage(): Promise<ImageEditorExportResult | null> {
    if (!this.iframe || !this.iframe.contentWindow) {
      throw new Error('Image editor iframe is not attached.')
    }
    const win = this.iframe.contentWindow as WindowWithMiniPaint
    const layers = win.app?.Layers || win.Layers
    const active = layers?.get_active_layer?.()
    if (!active || !layers) return null

    const dim = layers.get_dimensions()
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = dim.width
    tempCanvas.height = dim.height
    const ctx = tempCanvas.getContext('2d')
    if (!ctx) return null

    const img = (active.link || active.image) as CanvasImageSource | undefined
    if (img) {
      const x = (active.x as number) || 0
      const y = (active.y as number) || 0
      const w = (active.width as number) || dim.width
      const h = (active.height as number) || dim.height
      ctx.drawImage(img, x, y, w, h)
    }

    const dataUrl = tempCanvas.toDataURL('image/png', 1)
    const blob = await new Promise<Blob>((resolve, reject) => {
      tempCanvas.toBlob(
        (res) => (res ? resolve(res) : reject(new Error('Failed to export layer blob'))),
        'image/png',
      )
    })

    return {
      blob,
      dataUrl,
      width: dim.width,
      height: dim.height,
      format: 'image/png',
    }
  }

  /**
   * Extension point for future AI image tools (inpainting, background removal, layer generation).
   */
  async insertLayer(options: {
    name: string
    image: HTMLImageElement | string
    opacity?: number
  }): Promise<void> {
    if (!this.iframe || !this.iframe.contentWindow) {
      throw new Error('Image editor iframe is not attached.')
    }

    const win = this.iframe.contentWindow as WindowWithMiniPaint | null
    const appActions = win?.app?.Actions || win?.Actions
    const appState = win?.app?.State || win?.State
    const appLayers = win?.app?.Layers || win?.Layers

    let img: HTMLImageElement
    if (typeof options.image === 'string') {
      img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Failed to load image for AI layer.'))
        img.src = options.image as string
      })
    } else {
      img = options.image
    }

    const width = img.naturalWidth || img.width
    const height = img.naturalHeight || img.height

    if (appLayers && appActions && appState) {
      const newLayer = {
        name: options.name,
        type: 'image',
        link: img,
        width,
        height,
        width_original: width,
        height_original: height,
        opacity: (options.opacity ?? 1) * 100,
      }

      const Actions = appActions
      const InsertLayer = Actions.Insert_layer_action as new (layer: unknown) => unknown
      appState.do_action(new InsertLayer(newLayer))
      this.dirty = true
      this.stateListener?.({ dirty: true, canUndo: true, canRedo: false })
      return
    }

    // PostMessage fallback
    const actionId = `insert-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error('Timeout inserting layer in editor.'))
      }, 10_000)

      const onMessage = (event: MessageEvent) => {
        if (
          !this.iframe ||
          event.source !== this.iframe.contentWindow ||
          event.origin !== window.location.origin
        )
          return
        const data = event.data
        if (
          data?.type === 'cmos:image-editor:layer-response' &&
          data.payload?.actionId === actionId
        ) {
          cleanup()
          if (data.payload.success) {
            this.dirty = true
            this.stateListener?.({ dirty: true, canUndo: true, canRedo: false })
            resolve()
          } else {
            reject(new Error(data.payload.error || 'Failed to insert layer.'))
          }
        }
      }

      const cleanup = () => {
        clearTimeout(timeout)
        window.removeEventListener('message', onMessage)
      }

      window.addEventListener('message', onMessage)

      this.iframe?.contentWindow?.postMessage(
        {
          type: 'cmos:image-editor:insert-layer',
          payload: {
            actionId,
            name: options.name,
            image: img.src,
            opacity: options.opacity ?? 1,
          },
        },
        window.location.origin,
      )
    })
  }

  /**
   * Extension point for future AI image tools (restyle, remove object, replace background).
   * Replaces the active layer with a newly generated image.
   */
  async replaceActiveLayer(options: {
    name?: string
    image: HTMLImageElement | string
  }): Promise<void> {
    if (!this.iframe || !this.iframe.contentWindow) {
      throw new Error('Image editor iframe is not attached.')
    }

    const win = this.iframe.contentWindow as WindowWithMiniPaint | null
    const appActions = win?.app?.Actions || win?.Actions
    const appState = win?.app?.State || win?.State
    const appLayers = win?.app?.Layers || win?.Layers

    let img: HTMLImageElement
    if (typeof options.image === 'string') {
      img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Failed to load image for AI layer.'))
        img.src = options.image as string
      })
    } else {
      img = options.image
    }

    const width = img.naturalWidth || img.width
    const height = img.naturalHeight || img.height

    if (appState && appActions && appLayers) {
      const active = appLayers.get_active_layer ? appLayers.get_active_layer() : null
      if (active) {
        active.link = img
        active.width = width
        active.height = height
        active.width_original = width
        active.height_original = height
        if (options.name) active.name = options.name

        const Refresh = appActions.Refresh_action as (new () => unknown) | undefined
        const UpdateLayer = appActions.Update_layer_action as
          | (new (id: unknown, layer: unknown) => unknown)
          | undefined

        if (Refresh) {
          appState.do_action(new Refresh())
        } else if (UpdateLayer && active.id !== undefined) {
          appState.do_action(new UpdateLayer(active.id, active))
        }
      } else {
        const InsertLayer = appActions.Insert_layer_action as new (layer: unknown) => unknown
        appState.do_action(
          new InsertLayer({
            name: options.name || 'Modified Layer',
            type: 'image',
            link: img,
            width,
            height,
            width_original: width,
            height_original: height,
          }),
        )
      }
      this.dirty = true
      this.stateListener?.({ dirty: true, canUndo: true, canRedo: false })
      return
    }

    // PostMessage protocol fallback
    const actionId = `replace-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error('Timeout replacing layer via postMessage.'))
      }, 10_000)

      const onMessage = (event: MessageEvent) => {
        if (
          !this.iframe ||
          event.source !== this.iframe.contentWindow ||
          event.origin !== window.location.origin
        )
          return
        const data = event.data
        if (
          data?.type === 'cmos:image-editor:layer-response' &&
          data.payload?.actionId === actionId
        ) {
          cleanup()
          if (data.payload.success) {
            this.dirty = true
            this.stateListener?.({ dirty: true, canUndo: true, canRedo: false })
            resolve()
          } else {
            reject(new Error(data.payload.error || 'Failed to replace layer.'))
          }
        }
      }

      const cleanup = () => {
        clearTimeout(timeout)
        window.removeEventListener('message', onMessage)
      }

      window.addEventListener('message', onMessage)

      this.iframe?.contentWindow?.postMessage(
        {
          type: 'cmos:image-editor:replace-layer',
          payload: { actionId, name: options.name, image: img.src },
        },
        window.location.origin,
      )
    })
  }

  destroy(): void {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler)
      this.messageHandler = null
    }
    this.iframe = null
    this.isReady = false
    this.dirty = false
    this.stateListener = null
  }
}

export function createMiniPaintAdapter(): MiniPaintAdapter {
  return new MiniPaintAdapter()
}
