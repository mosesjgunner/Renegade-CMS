/**
 * POD-08 — Waveform geometry (PURE CORE): peaks → pixels math for the
 * per-player waveform (tool map row 12).
 *
 * Pattern-level adaptation of CurryCaster v1's `WaveformWidget` (MIT,
 * © 2024 Adam Curry — see THIRD_PARTY_NOTICES): peak data with a zoom
 * level and view offset, click-to-seek, cue markers rendered over the
 * waveform, and dimming outside the cue region (the renderer reads
 * `columnInCue` per pixel column).
 *
 * The view model is seconds-based: `secPerPixel` is the zoom (smaller
 * = more zoomed in), `offsetSec` is the time at the left edge. Every
 * function is pure and unit-tested — click at x → time is asserted
 * within one pixel's time span at multiple zooms.
 */

import type { WaveformPeaksData } from '../../media/peaks'

export type WaveformView = {
  /** Zoom: seconds of audio per pixel. */
  secPerPixel: number
  /** Time (sec) at the left edge of the viewport. */
  offsetSec: number
}

export const MIN_SEC_PER_PIXEL = 0.0001
export const MAX_SEC_PER_PIXEL = 60

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

/** A view that fits the whole clip in the viewport. */
export const fitView = (durationSec: number, widthPx: number): WaveformView => ({
  secPerPixel: widthPx > 0 ? durationSec / widthPx : 1,
  offsetSec: 0,
})

export const timeToX = (view: WaveformView, timeSec: number): number =>
  (timeSec - view.offsetSec) / view.secPerPixel

export const xToTime = (view: WaveformView, xPx: number): number =>
  view.offsetSec + xPx * view.secPerPixel

/** Click-to-seek: the time under pixel x, clamped to the clip. */
export const clickSeekTime = (
  peaks: Pick<WaveformPeaksData, 'durationSec'>,
  view: WaveformView,
  xPx: number,
): number => clamp(xToTime(view, xPx), 0, peaks.durationSec)

/**
 * Zooms by `factor` (>1 = zoom in) around the pixel under the cursor,
 * so the time under the cursor stays under the cursor.
 */
export const zoomAt = (
  view: WaveformView,
  factor: number,
  centerXPx: number,
  durationSec: number,
): WaveformView => {
  const secPerPixel = clamp(view.secPerPixel / factor, MIN_SEC_PER_PIXEL, MAX_SEC_PER_PIXEL)
  const centerTime = xToTime(view, centerXPx)
  const offsetSec = clamp(centerTime - centerXPx * secPerPixel, 0, durationSec)
  return { secPerPixel, offsetSec }
}

/** Pans by a pixel delta (drag), clamped so the view never leaves the clip. */
export const panBy = (
  view: WaveformView,
  deltaPx: number,
  durationSec: number,
  widthPx: number,
): WaveformView => {
  const maxOffset = Math.max(0, durationSec - widthPx * view.secPerPixel)
  return { ...view, offsetSec: clamp(view.offsetSec - deltaPx * view.secPerPixel, 0, maxOffset) }
}

export type WaveformColumn = {
  min: number
  max: number
  /** Time span this column covers. */
  startSec: number
  endSec: number
  /** False outside the cue region — the renderer dims these columns. */
  inCue: boolean
}

/**
 * Aggregates peaks into one min/max column per pixel for the current
 * view. Columns past the end of the clip are flat (min = max = 0).
 */
export const visibleColumns = (
  peaks: WaveformPeaksData,
  view: WaveformView,
  widthPx: number,
  cue?: { cueInSec: number; cueOutSec: number },
): WaveformColumn[] => {
  const columns: WaveformColumn[] = []
  const peaksPerSec = peaks.peaksPerSecond
  for (let x = 0; x < widthPx; x++) {
    const startSec = view.offsetSec + x * view.secPerPixel
    const endSec = startSec + view.secPerPixel
    const startPeak = Math.floor(startSec * peaksPerSec)
    const endPeak = Math.max(startPeak + 1, Math.ceil(endSec * peaksPerSec))
    let lo = Infinity
    let hi = -Infinity
    for (let i = startPeak; i < endPeak && i < peaks.min.length; i++) {
      if (i < 0) continue
      if (peaks.min[i] < lo) lo = peaks.min[i]
      if (peaks.max[i] > hi) hi = peaks.max[i]
    }
    columns.push({
      min: Number.isFinite(lo) ? lo : 0,
      max: Number.isFinite(hi) ? hi : 0,
      startSec,
      endSec,
      inCue: cue ? endSec > cue.cueInSec && startSec < cue.cueOutSec : true,
    })
  }
  return columns
}

/** Pixel x of a cue marker (IN or OUT) in the current view; may be off-view (<0 or >width). */
export const cueMarkerX = (view: WaveformView, cueSec: number): number => timeToX(view, cueSec)

/** Pixel x of the playhead in the current view. */
export const playheadX = (view: WaveformView, positionSec: number): number =>
  timeToX(view, positionSec)
