'use client'

import { TextField } from '@payloadcms/ui'
import type { TextFieldClientProps } from 'payload'

import styles from './writing-editor.module.css'

/**
 * BETA GUI-01B: the headline is the document's visual anchor. This wraps the
 * stock Payload text field — value, validation and persistence are unchanged;
 * only the presentation grows to headline scale.
 */
export function HeadlineField(props: TextFieldClientProps) {
  return (
    <div className={styles.headline}>
      <TextField {...props} />
    </div>
  )
}
