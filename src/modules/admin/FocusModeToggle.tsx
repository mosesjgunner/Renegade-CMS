'use client'

import { useCallback, useEffect, useState } from 'react'

const FOCUS_CLASS = 'rg-focus-mode'

/**
 * Focus mode for the article editor (RC2-H-01). Hides the admin nav and
 * the settings sidebar so the writing sheet is the whole screen. Purely
 * presentational: no field leaves the document, only the view changes,
 * and everything returns when focus mode is switched off or Escape is
 * pressed. The matching CSS lives in writing-canvas.css.
 */
export default function FocusModeToggle() {
  const [active, setActive] = useState(false)

  const setFocusMode = useCallback((next: boolean) => {
    setActive(next)
    document.documentElement.classList.toggle(FOCUS_CLASS, next)
  }, [])

  useEffect(() => {
    if (!active) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFocusMode(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, setFocusMode])

  // Never leave the class behind when the editor unmounts.
  useEffect(() => () => document.documentElement.classList.remove(FOCUS_CLASS), [])

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => setFocusMode(!active)}
      style={{ margin: '12px 0' }}
    >
      {active ? 'Exit focus mode' : 'Focus mode'}
    </button>
  )
}
