/**
 * CMoS Image Editor Extension Registry
 *
 * Provides a decoupled extension boundary where future AI capabilities
 * (generative fill, object removal, background replacement, outpainting,
 * variation, restyle, image generation) or custom filter tools can register
 * actions without baking provider SDKs, billing, or schemas into Media.
 */

import { useSyncExternalStore } from 'react'
import type { ImageEditorExtensionAction } from './contracts'

const registry = new Map<string, ImageEditorExtensionAction>()
const listeners = new Set<() => void>()

function notifyListeners(): void {
  for (const listener of listeners) {
    try {
      listener()
    } catch {
      // ignore listener errors
    }
  }
}

/**
 * Register a generic editor extension action (e.g. from an AI runtime module).
 * Returns an unregister function for cleanup.
 */
export function registerImageEditorExtension(action: ImageEditorExtensionAction): () => void {
  registry.set(action.id, action)
  notifyListeners()
  return () => {
    registry.delete(action.id)
    notifyListeners()
  }
}

/**
 * Retrieve all currently registered editor extension actions.
 */
export function getImageEditorExtensions(): ImageEditorExtensionAction[] {
  return Array.from(registry.values())
}

/**
 * Clear all registered actions (primarily for testing and isolation).
 */
export function clearImageEditorExtensions(): void {
  registry.clear()
  notifyListeners()
}

/**
 * React hook to subscribe to registered editor extensions.
 */
export function useImageEditorExtensions(): ImageEditorExtensionAction[] {
  return useSyncExternalStore(
    (callback) => {
      listeners.add(callback)
      return () => {
        listeners.delete(callback)
      }
    },
    () => getImageEditorExtensions(),
    () => [],
  )
}
