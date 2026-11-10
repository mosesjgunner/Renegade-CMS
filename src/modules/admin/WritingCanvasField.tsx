'use client'

import { RichTextField } from '@payloadcms/richtext-lexical/client'
import type { ComponentProps } from 'react'

import styles from './writing-editor.module.css'

/* The lexical field's full prop type is not re-exported from the package's
 * entry points in 3.90; derive it from the component itself so the extra
 * lexical props (clientFeatures, initialLexicalFormState, …) typecheck. */
type WritingCanvasFieldProps = ComponentProps<typeof RichTextField>

/**
 * BETA GUI-01B: give the Lexical canvas writing-room proportions — a taller
 * editing surface with comfortable reading typography. This wraps the stock
 * Payload rich-text field; the Lexical document structure is unchanged.
 *
 * GUI-04E-R1 fix (Nov 10, 2026): the field MUST be imported from
 * '@payloadcms/richtext-lexical/client'. The same-named export in
 * '@payloadcms/ui' is a null-rendering stub (its dist implementation is
 * literally `() => null`) — with that import the body field silently
 * rendered nothing on every post form: no error, no placeholder, just a
 * missing editor, while the title (a real TextField) worked. The
 * import map / type layer cannot catch this because the stub satisfies
 * the type. Found by the GUI-04E interactive journey: seeded body
 * present via API, wrapper absent in the DOM, zero console errors.
 */
export function WritingCanvasField(props: WritingCanvasFieldProps) {
  return (
    <div className={styles.canvas}>
      <RichTextField {...props} />
    </div>
  )
}
