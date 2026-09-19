import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  createMiniPaintAdapter,
  ImageEditorModal,
  MiniPaintAdapter,
  type ImageEditorAsset,
} from '../../src/modules/media/image-editor'

describe('MED-EXT-01: miniPaint Image Editor Architecture & Integration', () => {
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

  describe('1. Vendored miniPaint bundle & license verification', () => {
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

    it('has self-contained bundle.js and HTML entry point', () => {
      const htmlPath = path.join(vendorDir, 'index.html')
      const bundlePath = path.join(vendorDir, 'dist/bundle.js')
      expect(fs.existsSync(htmlPath)).toBe(true)
      expect(fs.existsSync(bundlePath)).toBe(true)

      const htmlContent = fs.readFileSync(htmlPath, 'utf8')
      expect(htmlContent).toContain('miniPaint')
      expect(htmlContent).toContain('dist/bundle.js')
      expect(htmlContent).toContain('cmos-overrides.css')
      expect(htmlContent).toContain('cmos:image-editor:ready')

      const overridesPath = path.join(vendorDir, 'cmos-overrides.css')
      expect(fs.existsSync(overridesPath)).toBe(true)
      expect(fs.readFileSync(overridesPath, 'utf8')).toContain('CMoS-owned presentation overrides')

      const bundleStats = fs.statSync(bundlePath)
      expect(bundleStats.size).toBeGreaterThan(500 * 1024) // > 500KB bundle
    })
  })

  describe('2. MiniPaintAdapter contracts & lifecycle', () => {
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

    it('exposes insertLayer as an AI tool extension point', () => {
      const adapter = new MiniPaintAdapter()
      expect(typeof adapter.insertLayer).toBe('function')
    })

    it('cleans up resources and listeners on destroy', () => {
      const adapter = new MiniPaintAdapter()
      adapter.destroy()
      expect(adapter.isDirty()).toBe(false)
    })
  })

  describe('3. ImageEditorModal component presentation', () => {
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

    it('renders alert when non-image asset is provided', () => {
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
    })
  })
})
