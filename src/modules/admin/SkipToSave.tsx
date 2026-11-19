'use client'

import { useCallback, type MouseEvent } from 'react'

/**
 * Skip-to-Save control for the document editor (RC2-DEBT-23).
 *
 * The stock document form puts every field — including the rich-text
 * editor, whose Tab key walks the document block by block — between
 * the top of the page and the Save button, so a keyboard user tabs
 * through the whole form to reach it. This control sits in the
 * document controls (the first form stop) and moves focus straight
 * to Save: the standard bypass pattern for a long repeated block.
 * It is visually hidden until focused, like a skip link. Purely a
 * focus move — it never clicks or submits anything.
 */
export default function SkipToSave() {
  const skip = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    const scope = event.currentTarget.closest('form') ?? document
    const buttons = [...scope.querySelectorAll<HTMLButtonElement>('button')]
    const labelOf = (button: HTMLButtonElement) => (button.textContent ?? '').trim()
    const target =
      buttons.find((button) => labelOf(button) === 'Save') ??
      buttons.find((button) => /^save\b/i.test(labelOf(button))) ??
      buttons.find((button) => /publish/i.test(labelOf(button)))
    if (!target) return
    target.scrollIntoView({ block: 'nearest' })
    target.focus()
  }, [])

  return (
    <button type="button" className="rg-skip-to-save" onClick={skip}>
      Skip to Save
    </button>
  )
}
