'use client'

import { useRef, useState } from 'react'
import type { FormField } from './contracts'

type Props = { formId: string; fields: readonly FormField[]; consentText?: string }

export function PublicForm({ formId, fields, consentText }: Props) {
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const requestKey = useRef<string | null>(null)
  const answers = useRef('')
  const [currentValues, setCurrentValues] = useState<Record<string, unknown>>({})
  async function submit(form: FormData) {
    const values: Record<string, FormDataEntryValue | boolean> = Object.fromEntries(form)
    for (const field of fields.filter((item) => item.type === 'checkbox'))
      values[field.key] = form.get(field.key) === 'on'
    if (pending) return
    const encoded = JSON.stringify(values)
    if (answers.current !== encoded || !requestKey.current) {
      requestKey.current = crypto.randomUUID()
      answers.current = encoded
    }
    setPending(true)
    try {
      const response = await fetch(`/api/forms/${formId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          values,
          honeypot: values.website,
          idempotencyKey: requestKey.current,
        }),
      })
      const body = await response.json()
      if (response.ok) requestKey.current = null
      setMessage(
        body.error ??
          (body.errors
            ? Object.values(body.errors)
                .filter((value): value is string => typeof value === 'string')
                .join(' ')
            : 'Thanks — your submission was received.'),
      )
    } catch {
      setMessage('Connection interrupted. Retry to check the same submission.')
    } finally {
      setPending(false)
    }
  }
  return (
    <form
      action={submit}
      onChange={(event) => {
        const control = event.target as unknown as HTMLInputElement
        setCurrentValues((previous) => ({
          ...previous,
          [control.name]: control.type === 'checkbox' ? control.checked : control.value,
        }))
      }}
      className="grid gap-4"
      noValidate
      aria-describedby={consentText ? 'form-consent' : undefined}
    >
      <div aria-hidden="true" className="hidden">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {fields
        .filter(
          (field) =>
            field.type !== 'hidden' &&
            (!field.visibleWhen ||
              currentValues[field.visibleWhen.field] === field.visibleWhen.equals),
        )
        .map((field) => (
          <label key={field.key} className="grid gap-1">
            <span>
              {field.label}
              {field.required ? ' *' : ''}
            </span>
            {field.type === 'textarea' ? (
              <textarea
                name={field.key}
                required={field.required}
                aria-describedby={field.helpText ? `${field.key}-help` : undefined}
              />
            ) : field.type === 'select' || field.type === 'radio' ? (
              <select name={field.key} required={field.required}>
                <option value="">Select…</option>
                {Array.isArray(field.validation?.options)
                  ? field.validation.options.map((value) => (
                      <option key={String(value)} value={String(value)}>
                        {String(value)}
                      </option>
                    ))
                  : null}
              </select>
            ) : field.type === 'checkbox' ? (
              <input name={field.key} type="checkbox" required={field.required} />
            ) : (
              <input
                name={field.key}
                type={field.type === 'text' || field.type === 'radio' ? 'text' : field.type}
                required={field.required}
              />
            )}
            {field.helpText ? <small id={`${field.key}-help`}>{field.helpText}</small> : null}
          </label>
        ))}
      {consentText ? (
        <p id="form-consent" className="text-sm text-stone-600">
          {consentText}
        </p>
      ) : null}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? 'Submitting?' : 'Submit'}
      </button>
      {message ? (
        <p role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
    </form>
  )
}
