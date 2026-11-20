'use client'

import { useCallback, useEffect } from 'react'

/**
 * Unsaved-work protection (UXI-07), shared by guided setup and the
 * setup form:
 *
 * - `useUnsavedWorkGuard(dirty)` arms the browser's beforeunload
 *   prompt while `dirty` is true, so a refresh or tab close cannot
 *   silently drop unsubmitted choices.
 * - The returned `confirmContextSwitch()` is for in-page context
 *   changes that would discard local state (switching the active
 *   site in guided setup): it asks first, and only a confirmed switch
 *   proceeds — the caller then resets its local selections and shows
 *   a notice.
 */
export function useUnsavedWorkGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const confirmContextSwitch = useCallback(
    (message = 'You have unsaved changes for the current site. Switch sites and discard them?') =>
      !dirty || window.confirm(message),
    [dirty],
  )

  return { confirmContextSwitch }
}
