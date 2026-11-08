'use client'

import { RichTextField } from '@payloadcms/ui'
import type { RichTextFieldClientProps } from 'payload'

import styles from './writing-editor.module.css'

/**
 * BETA GUI-01B: give the Lexical canvas writing-room proportions — a taller
 * editing surface with comfortable reading typography. This wraps the stock
 * Payload rich-text field; the Lexical document structure is unchanged.
 */
export function WritingCanvasField(props: RichTextFieldClientProps) {
  return (
    <div className={styles.canvas}>
      <RichTextField {...props} />
    </div>
  )
}
