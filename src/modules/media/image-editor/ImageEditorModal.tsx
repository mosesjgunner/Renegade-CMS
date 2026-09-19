'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { ImageEditorAsset, ImageEditorFormat, ImageEditorSaveMode } from './contracts'
import { MiniPaintAdapter } from './minipaint-adapter'
import styles from './ImageEditorModal.module.css'

interface ImageEditorModalProps {
  asset: ImageEditorAsset | null
  isOpen: boolean
  onClose: () => void
  onSaved?: (result: { assetId: string; url: string; mode: string }) => void
}

function ImageEditorView({
  asset,
  onClose,
  onSaved,
}: Omit<ImageEditorModalProps, 'asset' | 'isOpen'> & { asset: ImageEditorAsset }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const workspaceRef = useRef<HTMLDivElement>(null)
  const adapterRef = useRef<MiniPaintAdapter | null>(null)
  const [isLoading, setIsLoading] = useState(true),
    [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null),
    [statusMessage, setStatusMessage] = useState('Opening editor…')
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(
    asset.width && asset.height ? { width: asset.width, height: asset.height } : null,
  )
  const [isDirty, setIsDirty] = useState(false),
    [history, setHistory] = useState({ canUndo: false, canRedo: false })
  const [showLeaveDialog, setShowLeaveDialog] = useState(false),
    [isFullscreen, setIsFullscreen] = useState(false)
  const [saveMode, setSaveMode] = useState<ImageEditorSaveMode>('all-usages'),
    [title, setTitle] = useState(asset.title || 'Untitled Image'),
    [reason, setReason] = useState('Edited in miniPaint')
  const [format, setFormat] = useState<ImageEditorFormat>(
      asset.mimeType === 'image/jpeg' || asset.mimeType === 'image/webp'
        ? asset.mimeType
        : 'image/png',
    ),
    [quality, setQuality] = useState(0.92)

  useEffect(() => {
    let active = true
    const adapter = new MiniPaintAdapter()
    adapterRef.current = adapter
    adapter.onStateChange((state) => {
      if (!active) return
      setIsDirty(state.dirty)
      setHistory({ canUndo: state.canUndo, canRedo: state.canRedo })
      if (state.dimensions) setDimensions(state.dimensions)
    })
    void (async () => {
      try {
        if (!iframeRef.current) return
        await adapter.attach(iframeRef.current)
        const size = await adapter.loadImage(asset)
        if (active) {
          setDimensions(size)
          setStatusMessage('Ready')
          setIsLoading(false)
        }
      } catch (err) {
        if (active) {
          setIsLoading(false)
          setErrorMessage(
            err instanceof Error ? err.message : 'Failed to initialize the image editor.',
          )
        }
      }
    })()
    return () => {
      active = false
      adapter.destroy()
      adapterRef.current = null
    }
  }, [asset])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!isDirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isDirty])
  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(document.fullscreenElement === workspaceRef.current)
    document.addEventListener('fullscreenchange', syncFullscreen)
    return () => document.removeEventListener('fullscreenchange', syncFullscreen)
  }, [])
  const requestClose = useCallback(() => {
    if (isSaving) return
    if (isDirty) {
      setShowLeaveDialog(true)
      return
    }
    onClose()
  }, [isDirty, isSaving, onClose])
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void workspaceRef.current?.requestFullscreen?.()
    }
  }
  const save = async () => {
    const adapter = adapterRef.current
    if (!adapter) return
    setIsSaving(true)
    setErrorMessage(null)
    setStatusMessage('Exporting image…')
    try {
      const exported = await adapter.exportImage({ format, quality })
      setDimensions({ width: exported.width, height: exported.height })
      setStatusMessage('Saving to CMoS Media…')
      const extension = format === 'image/jpeg' ? 'jpg' : format === 'image/webp' ? 'webp' : 'png'
      const filename = `${(title || asset.title || 'image').replace(/[^a-zA-Z0-9-_]/g, '_')}.${extension}`
      const body = new FormData()
      body.append('file', new File([exported.blob], filename, { type: format }))
      body.append('siteId', asset.siteId)
      body.append('title', title)
      body.append('altText', asset.altText || '')
      body.append('caption', asset.caption || '')
      let response: Response
      if (saveMode === 'all-usages') {
        body.append('mode', 'all-usages')
        body.append('reason', `Edited in miniPaint: ${reason}`)
        response = await fetch(`/api/media/${asset.id}`, { method: 'PUT', body })
      } else response = await fetch('/api/media/upload', { method: 'POST', body })
      const data = (await response.json().catch(() => ({}))) as {
        asset?: { id?: string }
        error?: string
        replacement?: { id?: string }
        url?: string
      }
      if (!response.ok)
        throw new Error(data.error || `Failed to save the image (HTTP ${response.status}).`)
      adapter.markSaved()
      setStatusMessage(
        saveMode === 'all-usages' ? 'New asset version saved.' : 'New media asset saved.',
      )
      onSaved?.({
        assetId: String(data.replacement?.id || data.asset?.id || asset.id),
        url: data.url || `/media/${data.replacement?.id || data.asset?.id || asset.id}`,
        mode: saveMode,
      })
      onClose()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error saving image.')
    } finally {
      setIsSaving(false)
    }
  }
  if (!asset.mimeType.startsWith('image/'))
    return (
      <div
        className={styles.workspace}
        role="dialog"
        aria-modal="true"
        aria-label="Image Editor: Unsupported Format"
      >
        <section className={styles.unsupported}>
          <h2>Unsupported media type</h2>
          <p>This workspace can open image assets only. {asset.mimeType} is not editable here.</p>
          <button className={styles.primaryButton} type="button" onClick={onClose}>
            Back to Media
          </button>
        </section>
      </div>
    )
  return (
    <div
      ref={workspaceRef}
      className={styles.workspace}
      role="dialog"
      aria-modal="true"
      aria-label={`Image Editor: ${asset.title}`}
    >
      <header className={styles.header}>
        <div className={styles.identity}>
          <button
            className={styles.button}
            type="button"
            onClick={requestClose}
            disabled={isSaving}
          >
            ← Back to Media
          </button>
          <div className={styles.assetInfo}>
            <p className={styles.eyebrow}>Media workspace</p>
            <h2 className={styles.assetName}>Editing: {asset.title}</h2>
            <div className={styles.meta}>
              <span>
                {dimensions
                  ? `${dimensions.width} × ${dimensions.height} px`
                  : 'Reading dimensions…'}
              </span>
              <span>•</span>
              <span>{asset.mimeType}</span>
              <span className={isDirty ? styles.dirty : styles.saved}>
                {isDirty ? 'Unsaved edits' : 'All changes saved'}
              </span>
            </div>
          </div>
        </div>
        <div className={styles.actions} aria-label="Editor actions">
          <button
            className={styles.iconButton}
            type="button"
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            onClick={() => adapterRef.current?.undo()}
            disabled={isLoading || !history.canUndo}
          >
            ↶
          </button>
          <button
            className={styles.iconButton}
            type="button"
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
            onClick={() => adapterRef.current?.redo()}
            disabled={isLoading || !history.canRedo}
          >
            ↷
          </button>
          <button
            className={styles.button}
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen editor' : 'Fullscreen editor'}
          >
            {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          </button>
          <button
            className={styles.primaryButton}
            type="button"
            onClick={() => void save()}
            disabled={isLoading || isSaving}
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </header>
      <div className={`${styles.statusBar} ${errorMessage ? styles.error : ''}`} role="status">
        <span>{errorMessage || statusMessage}</span>
        <span>miniPaint tools: crop, resize, rotate, layers, text, draw, filters</span>
      </div>
      <main className={styles.canvasRegion} aria-label="Image editing canvas">
        <iframe
          ref={iframeRef}
          className={styles.frame}
          src="/vendor/minipaint/index.html"
          title="miniPaint Editor"
          allow="clipboard-write; camera"
        />
        {isLoading && (
          <div className={styles.loading}>
            <span className={styles.spinner} />
            <span>{statusMessage}</span>
          </div>
        )}
      </main>
      <footer className={styles.saveDrawer}>
        <div className={styles.saveOptions}>
          <label className={styles.field}>
            Filename
            <input
              className={styles.input}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            Save as
            <select
              className={styles.select}
              value={saveMode}
              onChange={(event) => setSaveMode(event.target.value as ImageEditorSaveMode)}
            >
              <option value="all-usages">New version</option>
              <option value="new-asset">New asset</option>
            </select>
          </label>
          <label className={styles.field}>
            Format
            <select
              className={styles.select}
              value={format}
              onChange={(event) => setFormat(event.target.value as ImageEditorFormat)}
            >
              <option value="image/png">PNG</option>
              <option value="image/jpeg">JPEG</option>
              <option value="image/webp">WebP</option>
            </select>
          </label>
          {(format === 'image/jpeg' || format === 'image/webp') && (
            <label className={styles.field}>
              Quality
              <input
                className={styles.input}
                type="number"
                min="10"
                max="100"
                value={Math.round(quality * 100)}
                onChange={(event) => setQuality(Number(event.target.value) / 100)}
              />
            </label>
          )}
          {saveMode === 'all-usages' && (
            <label className={styles.field}>
              Version note
              <input
                className={styles.input}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
          )}
        </div>
        <button
          className={styles.primaryButton}
          type="button"
          onClick={() => void save()}
          disabled={isLoading || isSaving}
        >
          {saveMode === 'new-asset' ? 'Save As' : 'Save version'}
        </button>
      </footer>
      {showLeaveDialog && (
        <div className={styles.dialogBackdrop} role="presentation">
          <section
            className={styles.leaveDialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="leave-editor-title"
            aria-describedby="leave-editor-description"
          >
            <h3 id="leave-editor-title">Discard unsaved edits?</h3>
            <p id="leave-editor-description">
              Your changes to {asset.title} have not been saved to CMoS Media.
            </p>
            <div className={styles.dialogActions}>
              <button
                className={styles.button}
                type="button"
                onClick={() => setShowLeaveDialog(false)}
              >
                Keep editing
              </button>
              <button className={styles.dangerButton} type="button" onClick={onClose}>
                Discard edits
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
export function ImageEditorModal({ asset, isOpen, onClose, onSaved }: ImageEditorModalProps) {
  if (!isOpen || !asset) return null
  return <ImageEditorView key={asset.id} asset={asset} onClose={onClose} onSaved={onSaved} />
}
