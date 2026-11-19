/**
 * POD-06 — Device service BROWSER ADAPTER (thin).
 *
 * Wires the pure `DeviceServiceCore` to `navigator.mediaDevices`. All policy
 * (roles, fail-closed prefs, capability interpretation) lives in the core;
 * this file only translates browser APIs. States that exist only here:
 * `unsupported` (no mediaDevices / non-secure context) and the raw browser
 * permission errors.
 *
 * UNVERIFIED: no real browser, microphone or speaker was exercised in
 * POD-06. This adapter is written carefully and typechecked; its
 * real-browser behaviour is proven only by the rig test named in the
 * POD-06 handoff.
 */

import {
  detectCapabilities,
  type BrowserFamily,
  type CapabilityReport,
  type CaptureDeviceInfo,
  type DeviceServiceCore,
} from './devices'
import type { CaptureConstraints } from './capture'

type MediaDevicesLike = {
  enumerateDevices(): Promise<MediaDeviceInfo[]>
  getUserMedia(constraints: unknown): Promise<MediaStream>
  addEventListener?(type: 'devicechange', listener: () => void): void
  removeEventListener?(type: 'devicechange', listener: () => void): void
  selectAudioOutput?: () => Promise<MediaDeviceInfo>
}

const mediaDevices = (): MediaDevicesLike | null => {
  if (typeof navigator === 'undefined') return null
  const devices = (navigator as { mediaDevices?: MediaDevicesLike }).mediaDevices
  return devices ?? null
}

export type BrowserDeviceSupport =
  | { supported: true }
  | { supported: false; reason: 'unsupported'; detail: string }

/** getUserMedia exists only in secure contexts (HTTPS / localhost) — absence is a state, not a crash. */
export const browserDeviceSupport = (): BrowserDeviceSupport => {
  const devices = mediaDevices()
  if (!devices || typeof devices.getUserMedia !== 'function')
    return {
      supported: false,
      reason: 'unsupported',
      detail:
        'Media capture is unavailable in this browser/context. getUserMedia requires a secure context (HTTPS or localhost) and a browser with mediaDevices support.',
    }
  return { supported: true }
}

const toDeviceInfo = (device: MediaDeviceInfo): CaptureDeviceInfo => ({
  deviceId: device.deviceId,
  kind: device.kind as CaptureDeviceInfo['kind'],
  label: device.label,
  groupId: device.groupId,
})

export const enumerateBrowserDevices = async (): Promise<CaptureDeviceInfo[]> => {
  const devices = mediaDevices()
  if (!devices) return []
  const list = await devices.enumerateDevices()
  return list.map(toDeviceInfo)
}

/** Permission flow: labels are empty until a getUserMedia grant, so request first, then re-enumerate into the core. */
export const requestPermissionAndEnumerate = async (
  core: DeviceServiceCore,
): Promise<{ ok: boolean; error?: 'denied' | 'unsupported' }> => {
  const devices = mediaDevices()
  if (!devices) {
    core.setPermission('denied')
    return { ok: false, error: 'unsupported' }
  }
  core.setPermission('prompt')
  try {
    const stream = await devices.getUserMedia({ audio: true })
    stream.getTracks().forEach((track) => track.stop())
    core.setPermission('granted')
    core.setDevices(await enumerateBrowserDevices())
    return { ok: true }
  } catch {
    core.setPermission('denied')
    return { ok: false, error: 'denied' }
  }
}

/** Subscribes the core to hot-plug events; returns an unsubscribe function. */
export const watchDeviceChanges = (core: DeviceServiceCore): (() => void) => {
  const devices = mediaDevices()
  if (!devices?.addEventListener) return () => undefined
  const listener = () => {
    void enumerateBrowserDevices().then((list) => core.setDevices(list))
  }
  devices.addEventListener('devicechange', listener)
  return () => devices.removeEventListener?.('devicechange', listener)
}

/** Opens a capture stream for the given constraints (dual-path core builds them). */
export const openCaptureStream = async (
  constraints: CaptureConstraints,
): Promise<{ stream: MediaStream; settings: MediaTrackSettings }> => {
  const devices = mediaDevices()
  if (!devices) throw new Error('Media capture is unsupported in this browser/context.')
  const stream = await devices.getUserMedia(constraints)
  const track = stream.getAudioTracks()[0]
  if (!track) throw new Error('The browser returned a stream with no audio track.')
  return { stream, settings: track.getSettings() }
}

export const probeBrowserCapabilities = (): CapabilityReport => {
  const family: BrowserFamily =
    typeof navigator === 'undefined'
      ? 'other'
      : /firefox/i.test(navigator.userAgent)
        ? 'firefox'
        : /safari/i.test(navigator.userAgent) && !/chrome|chromium|edg/i.test(navigator.userAgent)
          ? 'safari'
          : /chrome|chromium|edg/i.test(navigator.userAgent)
            ? 'chromium'
            : 'other'
  const elementSetSinkId =
    typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype
  const contextSetSinkId =
    typeof AudioContext !== 'undefined' &&
    'setSinkId' in (AudioContext.prototype as unknown as Record<string, unknown>)
  const devices = mediaDevices()
  return detectCapabilities({
    family,
    elementSetSinkId,
    contextSetSinkId,
    selectAudioOutput: typeof devices?.selectAudioOutput === 'function',
    audioWorklet:
      typeof AudioContext !== 'undefined' &&
      'audioWorklet' in (AudioContext.prototype as unknown as Record<string, unknown>),
    opfs:
      typeof navigator !== 'undefined' &&
      'storage' in navigator &&
      typeof (navigator.storage as { getDirectory?: unknown }).getDirectory === 'function',
  })
}
