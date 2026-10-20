'use client'

import {
  useDocumentInfo,
  useForm,
  useFormFields,
  useFormInitializing,
  useFormModified,
  useFormProcessing,
} from '@payloadcms/ui'
import { useCallback, useEffect, useRef, useState } from 'react'

/** Save through the native form so validation, site policy, locks and canonical revisions apply. */
export function DraftAutosave() {
  const { id } = useDocumentInfo()
  const { submit } = useForm()
  const modified = useFormModified()
  const processing = useFormProcessing()
  const initializing = useFormInitializing()
  const fields = useFormFields(([fields]) => fields)
  const status = fields.status?.value
  const signature = JSON.stringify(
    Object.entries(fields).map(([path, field]) => [path, field.value]),
  )
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const saving = useRef(false)
  const failedSignature = useRef<string | null>(null)
  const currentSignature = useRef(signature)
  useEffect(() => {
    currentSignature.current = signature
  }, [signature])
  const enabled = Boolean(id) && (status === 'draft' || status === 'updated')
  const save = useCallback(async () => {
    if (saving.current) return
    saving.current = true
    setError(false)
    setMessage('Saving draft...')
    try {
      const result = await submit({ disableSuccessStatus: true })
      if (!result?.res?.ok)
        throw new Error(
          'Draft was not saved. Resolve validation or document-lock conflicts, then retry.',
        )
      failedSignature.current = null
      setMessage('Draft saved automatically.')
    } catch (cause) {
      failedSignature.current = currentSignature.current
      setError(true)
      setMessage(
        cause instanceof Error
          ? cause.message
          : 'Draft save failed. Your edits remain in the editor.',
      )
    } finally {
      saving.current = false
    }
  }, [submit])
  useEffect(() => {
    if (
      !enabled ||
      !modified ||
      processing ||
      initializing ||
      saving.current ||
      failedSignature.current === signature
    )
      return
    setError(false)
    setMessage('Unsaved draft changes...')
    const timer = setTimeout(() => {
      void save()
    }, 2000)
    return () => clearTimeout(timer)
  }, [enabled, modified, processing, initializing, signature, save])
  return (
    <section aria-label="Draft autosave" style={{ marginBlock: 12 }}>
      <p role={error ? 'alert' : 'status'}>
        {message ||
          (enabled
            ? 'Draft autosave is ready.'
            : 'Save a draft once to enable autosave. Autosave pauses for live, review and scheduled content.')}
      </p>
      {error && (
        <button type="button" disabled={processing} onClick={() => void save()}>
          Retry draft save
        </button>
      )}
    </section>
  )
}
