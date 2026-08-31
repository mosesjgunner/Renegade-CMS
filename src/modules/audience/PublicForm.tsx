'use client'

import { useState } from 'react'
import type { FormField } from './contracts'

type Props = { formId: string; fields: readonly FormField[]; consentText?: string }

export function PublicForm({ formId, fields, consentText }: Props) {
  const [message, setMessage] = useState('')
  async function submit(form: FormData) {
    const values: Record<string, FormDataEntryValue | boolean> = Object.fromEntries(form)
    for (const field of fields.filter((item) => item.type === 'checkbox'))
      values[field.key] = form.get(field.key) === 'on'
    const response = await fetch(`/api/forms/${formId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        values,
        honeypot: values.website,
        idempotencyKey: crypto.randomUUID(),
      }),
    })
    const body = await response.json()
    setMessage(
      body.error ??
        (body.errors
          ? Object.values(body.errors)
              .filter((value): value is string => typeof value === 'string')
              .join(' ')
          : 'Thanks — your submission was received.'),
    )
  }
  return (
    <form action={submit} className="grid gap-4" noValidate>
      <div aria-hidden="true" className="hidden">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {fields
        .filter((field) => field.type !== 'hidden')
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
            ) : field.type === 'select' ? (
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
      {consentText ? <p className="text-sm text-stone-600">{consentText}</p> : null}
      <button className="btn btn-primary" type="submit">
        Submit
      </button>
      {message ? (
        <p role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
    </form>
  )
}
