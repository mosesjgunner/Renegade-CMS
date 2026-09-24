import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  clearImageEditorExtensions,
  createMiniPaintAdapter,
  getImageEditorExtensions,
  ImageEditorModal,
  isEditableImageMimeType,
  MAX_IMAGE_EDITOR_PIXELS,
  MiniPaintAdapter,
  registerImageEditorExtension,
  sanitizeImageFilename,
  SUPPORTED_IMAGE_EDITOR_MIME_TYPES,
  type ImageEditorAIActionType,
  type ImageEditorAsset,
  type ImageEditorExtensionAction,
} from '../../src/modules/media/image-editor'

describe('MED-EXT: miniPaint Native CMoS Image Editor & AI Extension Boundary', () => {
  const sampleAsset: ImageEditorAsset = {
    id: 'asset_test_123',
    title: 'Hero Landscape Banner',
    url: '/media/asset_test_123',
    mimeType: 'image/png',
    siteId: 'site_1',
    width: 1920,
    height: 1080,
    altText: 'Mountain landscape in golden hour',
  }

  describe('1. MED-EXT-01: Vendored miniPaint bundle & license verification', () => {
    const vendorDir = path.resolve(process.cwd(), 'public/vendor/minipaint')

    it('has valid MIT license attribution for Vilius Kraujutis / ViliusL', () => {
      const licensePath = path.join(vendorDir, 'MIT-LICENSE.txt')
      expect(fs.existsSync(licensePath)).toBe(true)
      const content = fs.readFileSync(licensePath, 'utf8')
      expect(content).toContain('ViliusL')
      expect(content).toContain('Permission is hereby granted')
    })

    it('has vendor documentation and upstream isolation in README.md', () => {
      const readmePath = path.join(vendorDir, 'README.md')
      expect(fs.existsSync(readmePath)).toBe(true)
      const content = fs.readFileSync(readmePath, 'utf8')
      expect(content).toContain('miniPaint')
      expect(content).toContain('viliusle/miniPaint')
      expect(content).toContain('Upstream Isolation')
    })

    it('has self-contained bundle.js and HTML entry point with bridge handlers', () => {
      const htmlPath = path.join(vendorDir, 'index.html')
      const bundlePath = path.join(vendorDir, 'dist/bundle.js')
      expect(fs.existsSync(htmlPath)).toBe(true)
      expect(fs.existsSync(bundlePath)).toBe(true)

      const htmlContent = fs.readFileSync(htmlPath, 'utf8')
      expect(htmlContent).toContain('miniPaint')
      expect(htmlContent).toContain('dist/bundle.js')
      expect(htmlContent).toContain('cmos-overrides.css')
      expect(htmlContent).toContain('cmos:image-editor:ready')
      expect(htmlContent).toContain('cmos:image-editor:insert-layer')
      expect(htmlContent).toContain('cmos:image-editor:replace-layer')

      const overridesPath = path.join(vendorDir, 'cmos-overrides.css')
      expect(fs.existsSync(overridesPath)).toBe(true)
      expect(fs.readFileSync(overridesPath, 'utf8')).toContain('CMoS-owned presentation overrides')

      const bundleStats = fs.statSync(bundlePath)
      expect(bundleStats.size).toBeGreaterThan(500 * 1024) // > 500KB bundle
    })
  })

  describe('2. MED-EXT-01 & MED-EXT-02: MiniPaintAdapter contracts & lifecycle', () => {
    it('creates an adapter instance conforming to ImageEditorAdapter', () => {
      const adapter = createMiniPaintAdapter()
      expect(adapter).toBeInstanceOf(MiniPaintAdapter)
      expect(adapter.id).toBe('minipaint')
      expect(adapter.name).toBe('miniPaint')
      expect(typeof adapter.attach).toBe('function')
      expect(typeof adapter.loadImage).toBe('function')
      expect(typeof adapter.exportImage).toBe('function')
      expect(typeof adapter.exportProject).toBe('function')
      expect(typeof adapter.isDirty).toBe('function')
      expect(typeof adapter.destroy).toBe('function')
      expect(typeof adapter.undo).toBe('function')
      expect(typeof adapter.redo).toBe('function')
      expect(typeof adapter.getDimensions).toBe('function')
      expect(typeof adapter.insertLayer).toBe('function')
      expect(typeof adapter.replaceActiveLayer).toBe('function')
      expect(typeof adapter.getActiveLayerImage).toBe('function')
      expect(adapter.isDirty()).toBe(false)
    })

    it('throws when calling loadImage before attach', async () => {
      const adapter = new MiniPaintAdapter()
      await expect(adapter.loadImage(sampleAsset)).rejects.toThrow(
        /Image editor iframe is not attached/,
      )
    })

    it('throws when calling exportImage before attach', async () => {
      const adapter = new MiniPaintAdapter()
      await expect(adapter.exportImage()).rejects.toThrow(/Image editor iframe is not attached/)
    })

    it('throws when calling exportProject before attach', async () => {
      const adapter = new MiniPaintAdapter()
      await expect(adapter.exportProject()).rejects.toThrow(/Image editor iframe is not attached/)
    })

    it('throws when calling insertLayer before attach', async () => {
      const adapter = new MiniPaintAdapter()
      await expect(
        adapter.insertLayer({ name: 'test', image: 'data:image/png;base64,iVBORw0KGgo=' }),
      ).rejects.toThrow(/Image editor iframe is not attached/)
    })

    it('throws when calling replaceActiveLayer before attach', async () => {
      const adapter = new MiniPaintAdapter()
      await expect(
        adapter.replaceActiveLayer({ name: 'test', image: 'data:image/png;base64,iVBORw0KGgo=' }),
      ).rejects.toThrow(/Image editor iframe is not attached/)
    })

    it('cleans up resources and listeners on destroy', () => {
      const adapter = new MiniPaintAdapter()
      adapter.destroy()
      expect(adapter.isDirty()).toBe(false)
    })
  })

  describe('3. MED-EXT-02 & MED-EXT-03: ImageEditorModal presentation & controls', () => {
    it('renders null when isOpen is false', () => {
      const html = renderToStaticMarkup(
        <ImageEditorModal isOpen={false} asset={sampleAsset} onClose={() => {}} />,
      )
      expect(html).toBe('')
    })

    it('renders null when asset is null', () => {
      const html = renderToStaticMarkup(
        <ImageEditorModal isOpen={true} asset={null} onClose={() => {}} />,
      )
      expect(html).toBe('')
    })

    it('renders editor modal shell, controls, and iframe when open', () => {
      const html = renderToStaticMarkup(
        <ImageEditorModal isOpen={true} asset={sampleAsset} onClose={() => {}} />,
      )

      // Header & Asset Title
      expect(html).toContain('miniPaint')
      expect(html).toContain('Hero Landscape Banner')
      expect(html).toContain('image/png')

      // Native workspace and save controls
      expect(html).toContain('Back to Media')
      expect(html).toContain('Undo')
      expect(html).toContain('Redo')
      expect(html).toContain('Filename')
      expect(html).toContain('Save as')
      expect(html).toContain('New version')
      expect(html).toContain('New asset')

      // Format & Metadata Controls
      expect(html).toContain('PNG')
      expect(html).toContain('JPEG')
      expect(html).toContain('WebP')
      expect(html).toContain('Version note')
      expect(html).toContain('Edited in miniPaint')

      // Iframe Container
      expect(html).toContain('iframe')
      expect(html).toContain('/vendor/minipaint/index.html')
    })
  })

  describe('4. MED-EXT-04: Security, Sanitization & Reliability Audit', () => {
    it('sanitizes filenames against path traversal, control chars, and reserved symbols', () => {
      expect(sanitizeImageFilename('../../etc/passwd', 'png')).toBe('etc_passwd.png')
      expect(sanitizeImageFilename('..\\Windows\\System32\\calc.exe', 'webp')).toBe(
        'Windows_System32_calc.exe.webp',
      )
      expect(sanitizeImageFilename('photo *?"<>|: test', 'jpg')).toBe('photo _______ test.jpg')
      expect(sanitizeImageFilename('   spaced name   ', 'png')).toBe('spaced name.png')
      expect(sanitizeImageFilename('...', 'png')).toBe('image.png')
    })

    it('validates supported image MIME types correctly', () => {
      expect(isEditableImageMimeType('image/png')).toBe(true)
      expect(isEditableImageMimeType('image/jpeg')).toBe(true)
      expect(isEditableImageMimeType('image/webp')).toBe(true)
      expect(isEditableImageMimeType('image/gif')).toBe(true)
      expect(isEditableImageMimeType('image/bmp')).toBe(true)

      // Reject SVG vector graphic to prevent XSS script execution
      expect(isEditableImageMimeType('image/svg+xml')).toBe(false)
      expect(isEditableImageMimeType('video/mp4')).toBe(false)
      expect(isEditableImageMimeType('application/pdf')).toBe(false)
    })

    it('rejects SVG assets specifically with clear safe messaging in ImageEditorModal', () => {
      const svgAsset: ImageEditorAsset = {
        id: 'svg_asset_01',
        title: 'Vector Logo',
        url: '/media/svg_asset_01',
        mimeType: 'image/svg+xml',
        siteId: 'site_1',
      }

      const html = renderToStaticMarkup(
        <ImageEditorModal isOpen={true} asset={svgAsset} onClose={() => {}} />,
      )

      expect(html).toMatch(/vector format not supported/i)
      expect(html).toContain('SVG vector graphics cannot be safely raster-edited')
      expect(html).not.toContain('iframe')
    })

    it('rejects non-image media assets in ImageEditorModal', () => {
      const audioAsset: ImageEditorAsset = {
        id: 'audio_01',
        title: 'Podcast Episode',
        url: '/media/audio_01',
        mimeType: 'audio/mpeg',
        siteId: 'site_1',
      }

      const html = renderToStaticMarkup(
        <ImageEditorModal isOpen={true} asset={audioAsset} onClose={() => {}} />,
      )

      expect(html).toMatch(/unsupported media type/i)
      expect(html).toContain('audio/mpeg')
      expect(html).not.toContain('iframe')
    })

    it('defines the 50 megapixel decompression bomb protection threshold', () => {
      expect(MAX_IMAGE_EDITOR_PIXELS).toBe(50_000_000)
    })

    it('has complete supported MIME type definitions', () => {
      expect(SUPPORTED_IMAGE_EDITOR_MIME_TYPES).toContain('image/png')
      expect(SUPPORTED_IMAGE_EDITOR_MIME_TYPES).toContain('image/jpeg')
      expect(SUPPORTED_IMAGE_EDITOR_MIME_TYPES).toContain('image/webp')
    })
  })

  describe('5. MED-EXT-05: AI Extension Boundary & Registry', () => {
    it('supports registration, discovery, and cleanup of generic AI actions', () => {
      clearImageEditorExtensions()
      expect(getImageEditorExtensions()).toHaveLength(0)

      const supportedTypes: ImageEditorAIActionType[] = [
        'generative-fill',
        'remove-object',
        'replace-background',
        'expand-outpaint',
        'generate-variation',
        'restyle',
        'generate-image',
      ]

      expect(supportedTypes).toHaveLength(7)

      const sampleAction: ImageEditorExtensionAction = {
        id: 'ai-restyle',
        label: 'Restyle Artwork',
        description: 'Applies style transfer to active layer',
        actionType: 'restyle',
        category: 'ai',
        run: async () => {},
      }

      const unregister = registerImageEditorExtension(sampleAction)
      expect(getImageEditorExtensions()).toHaveLength(1)
      expect(getImageEditorExtensions()[0].id).toBe('ai-restyle')
      expect(getImageEditorExtensions()[0].actionType).toBe('restyle')

      unregister()
      expect(getImageEditorExtensions()).toHaveLength(0)
    })

    it('renders registered extension actions in the ImageEditorModal toolbar', () => {
      const customAction: ImageEditorExtensionAction = {
        id: 'test-gen-fill',
        label: 'Generative Fill',
        description: 'Fill selection with prompt',
        actionType: 'generative-fill',
        category: 'ai',
        run: async () => {},
      }

      const html = renderToStaticMarkup(
        <ImageEditorModal
          isOpen={true}
          asset={sampleAsset}
          onClose={() => {}}
          extensions={[customAction]}
        />,
      )

      expect(html).toContain('Generative Fill')
      expect(html).toContain('Fill selection with prompt')
    })

    it('does not render fake or stub AI buttons when no extensions are registered', () => {
      clearImageEditorExtensions()
      const html = renderToStaticMarkup(
        <ImageEditorModal isOpen={true} asset={sampleAsset} onClose={() => {}} extensions={[]} />,
      )

      expect(html).not.toContain('Generative Fill')
      expect(html).not.toContain('Remove Object')
      expect(html).not.toContain('AI &')
    })
  })
})
